import { execFile } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { relative, resolve } from 'path';
import { promisify } from 'util';
import { isVideoUrl, sanitizeMediaUrl } from './catalog-media';

const execFileAsync = promisify(execFile);

function localUploadFile(urlPath: string, uploadsDir: string): string | null {
  const relativePath = urlPath.replace(/^\/uploads\//, '');
  if (!relativePath || relativePath.includes('..')) return null;
  const root = resolve(uploadsDir);
  const full = resolve(root, relativePath);
  const fromRoot = relative(root, full);
  if (!fromRoot || fromRoot.startsWith('..') || fromRoot.includes('..')) {
    return null;
  }
  return existsSync(full) ? full : null;
}

/** Local upload path when the file is on disk, otherwise a remote http(s) URL. */
export function resolveVideoInput(
  videoUrl: string,
  uploadsDir: string,
): string | null {
  const clean = sanitizeMediaUrl(videoUrl);
  if (!clean || !isVideoUrl(clean)) return null;

  if (clean.startsWith('/uploads/')) {
    return localUploadFile(clean, uploadsDir);
  }

  try {
    const parsed = new URL(clean);
    if (parsed.pathname.startsWith('/uploads/')) {
      const local = localUploadFile(parsed.pathname, uploadsDir);
      if (local) return local;
    }
  } catch {
    return null;
  }

  if (/^https?:\/\//i.test(clean)) return clean;
  return null;
}

/**
 * Write the first frame of a catalog video into uploads/ and return its public URL.
 * Returns null when ffmpeg is missing or the file cannot be decoded.
 */
export async function extractVideoPoster(options: {
  videoUrl: string;
  uploadsDir: string;
  publicBase: string;
}): Promise<string | null> {
  const input = resolveVideoInput(options.videoUrl, options.uploadsDir);
  if (!input) return null;

  const root = resolve(options.uploadsDir);
  if (!existsSync(root)) mkdirSync(root, { recursive: true });

  const filename = `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const dest = resolve(root, filename);
  if (!dest.startsWith(root)) return null;

  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', input, '-frames:v', '1', '-vf', 'scale=512:-2', dest],
      { timeout: 20_000 },
    );
  } catch {
    return null;
  }

  if (!existsSync(dest)) return null;
  const base = options.publicBase.replace(/\/$/, '');
  return `${base}/uploads/${filename}`;
}
