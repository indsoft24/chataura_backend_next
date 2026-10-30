/**
 * Upload one file to the GCS bucket, never overwriting (paths are immutable: bump the version folder instead).
 *
 *   node scripts/upload-gcs-file.js <bucket> <local-file> <bucket-path> [content-type]
 *   node scripts/upload-gcs-file.js chataura ./svip2_medal.webp svip/v1/svip2_medal.webp
 *
 * Key: secrets/gcs-service-account.json (repo root) or GCS_KEY_FILE / GOOGLE_APPLICATION_CREDENTIALS.
 */
const { existsSync } = require('fs');
const { basename, resolve } = require('path');
const { Storage } = require('@google-cloud/storage');

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', json: 'application/json', webm: 'video/webm', mp4: 'video/mp4' };
const [, , bucketName, local, dest, typeArg] = process.argv;
if (!bucketName || !local || !dest) {
  console.error('Usage: node scripts/upload-gcs-file.js <bucket> <local-file> <bucket-path> [content-type]');
  process.exit(1);
}
const keyFile = [process.env.GCS_KEY_FILE, process.env.GOOGLE_APPLICATION_CREDENTIALS, resolve(__dirname, '../../secrets/gcs-service-account.json')]
  .filter(Boolean)
  .find((p) => existsSync(p));

(async () => {
  const bucket = new Storage(keyFile ? { keyFilename: keyFile } : {}).bucket(bucketName);
  const file = bucket.file(dest);
  if ((await file.exists())[0]) {
    console.log(`EXISTS, not overwritten: ${dest}`);
    return;
  }
  const ext = basename(local).split('.').pop().toLowerCase();
  await bucket.upload(local, {
    destination: dest,
    resumable: false,
    metadata: { contentType: typeArg || TYPES[ext] || 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' },
  });
  console.log(`uploaded https://storage.googleapis.com/${bucketName}/${dest}`);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
