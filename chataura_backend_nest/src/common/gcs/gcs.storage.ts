import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import { Storage } from '@google-cloud/storage';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function contentTypeForPath(filePath: string): string {
  const ext = basename(filePath).split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'json':
      return 'application/json';
    case 'webm':
      return 'video/webm';
    case 'mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function resolveKeyFile(): string | undefined {
  const candidates = [
    process.env.GCS_KEY_FILE,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    resolve(process.cwd(), '../secrets/gcs-service-account.json'),
    resolve(process.cwd(), 'secrets/gcs-service-account.json'),
    '/run/secrets/gcs-service-account.json',
    '/var/www/chataura_backend_next/secrets/gcs-service-account.json',
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

export function getGcsBucketName(): string {
  const bucket = (process.env.GCS_BUCKET ?? '').trim();
  if (!bucket) {
    throw new Error('GCS_BUCKET is not set');
  }
  return bucket;
}

export function createGcsStorage(): Storage {
  const keyFilename = resolveKeyFile();
  if (keyFilename) {
    return new Storage({ keyFilename });
  }
  // ADC / workload identity fallback
  return new Storage();
}

export function publicGcsUrl(bucket: string, objectPath: string): string {
  return `https://storage.googleapis.com/${bucket}/${objectPath}`;
}

export async function uploadPublicFile(opts: {
  localPath: string;
  objectPath: string;
  contentType?: string;
  bucket?: string;
}): Promise<{ bucket: string; objectPath: string; url: string }> {
  const bucketName = opts.bucket ?? getGcsBucketName();
  const contentType =
    opts.contentType ?? contentTypeForPath(opts.localPath);
  const storage = createGcsStorage();
  const bucket = storage.bucket(bucketName);

  await bucket.upload(opts.localPath, {
    destination: opts.objectPath,
    resumable: false,
    metadata: {
      contentType,
      cacheControl: CACHE_CONTROL,
    },
  });

  // Bucket uses uniform bucket-level access — public-read is via IAM
  // (allUsers objectViewer), not per-object ACLs / makePublic().

  return {
    bucket: bucketName,
    objectPath: opts.objectPath,
    url: publicGcsUrl(bucketName, opts.objectPath),
  };
}
