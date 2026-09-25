/**
 * One-shot FX pack importer: upload MANIFEST files to GCS and upsert app_fx_assets.
 *
 * Usage:
 *   npm run fx:import -- --dir=/path/to/fx_gcs_migrate
 *   npm run fx:import -- --dir=/path/to/fx_gcs_migrate --out=/tmp/fx_assets_urls.json
 */
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FxAssetsService } from '../src/modules/fx-assets/fx-assets.service';

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
      'Usage: npm run fx:import -- --dir=/path/to/extracted_pack [--out=/path/fx_assets_urls.json]',
    );
    process.exit(1);
  }

  const out =
    argValue('out') ??
    resolve('/tmp/fx_assets_urls.json');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const fx = app.get(FxAssetsService);
    console.log(`Importing FX pack from ${resolve(dir)}`);
    const result = await fx.importFromDir(dir, { writeUrlsPath: out });
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          failed_count: result.failed.length,
          failed: result.failed,
          urls_file: out,
          sample: Object.entries(result.map).slice(0, 3),
        },
        null,
        2,
      ),
    );
    if (result.failed.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
