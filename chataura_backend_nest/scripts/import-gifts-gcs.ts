/**
 * Upload gift MANIFEST media to GCS and upsert `gifts` rows.
 *
 * Usage:
 *   npm run gifts:import -- --dir=/path/to/gifts_gcs_migrate --out=/tmp/gift_gcs_urls.json
 */
import { resolve } from 'path';
import { importGiftsFromDir } from '../src/common/gcs/gifts-gcs.import';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const dir = argValue('dir');
  if (!dir) {
    console.error(
      'Usage: npm run gifts:import -- --dir=/path/to/gifts_gcs_migrate [--out=/tmp/gift_gcs_urls.json]',
    );
    process.exit(1);
  }
  const out = argValue('out') ?? resolve('/tmp/gift_gcs_urls.json');
  console.log(`Importing gifts from ${resolve(dir)}`);
  const result = await importGiftsFromDir(dir, { writeUrlsPath: out });
  console.log(
    JSON.stringify(
      {
        bucket: result.bucket,
        prefix: result.prefix,
        ok_count: result.ok_count,
        failed_count: result.failed.length,
        failed: result.failed,
        urls_file: out,
        sample: result.gifts.slice(0, 3),
      },
      null,
      2,
    ),
  );
  if (result.failed.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
