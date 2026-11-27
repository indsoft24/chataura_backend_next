import { readFileSync } from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Public art / gift / fx files are served from one CDN host (Cloudflare R2 behind cdn.chataura.in).
 * Everything here is OFF until ASSET_PUBLIC_BASE is set, so the code can ship before the switch-over.
 */
export const OLD_GCS_PREFIX = 'https://storage.googleapis.com/';

/** e.g. https://cdn.chataura.in (no trailing slash), or '' while the old GCS links are still in use. */
export function assetPublicBase(): string {
  return (process.env.ASSET_PUBLIC_BASE ?? '').trim().replace(/\/+$/, '');
}

export function r2Configured(): boolean {
  const e = process.env;
  return Boolean(assetPublicBase() && e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);
}

let client: S3Client | null = null;
function r2(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}

/** Same object path as before; the file keeps its Cache-Control so Cloudflare and phones cache it for a year. */
export async function putR2Object(opts: { localPath: string; objectPath: string; contentType: string; cacheControl: string }) {
  await r2().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: opts.objectPath,
      Body: readFileSync(opts.localPath),
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
    }),
  );
}

/** Old GCS link -> CDN link for a stored value; anything else (or no CDN configured) is returned unchanged. */
export function toCdnUrl(url: string): string {
  const base = assetPublicBase();
  if (!base || !url.startsWith(OLD_GCS_PREFIX)) return url;
  const rest = url.slice(OLD_GCS_PREFIX.length); // <bucket>/<path>
  const slash = rest.indexOf('/');
  return slash < 0 ? url : `${base}/${rest.slice(slash + 1)}`;
}
