/* One-shot FX import for production image (no ts-node). */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { FxAssetsService } = require('./dist/modules/fx-assets/fx-assets.service');

function argValue(name) {
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
    console.error('Usage: node import-fx-assets.js --dir=/path --out=/tmp/fx_assets_urls.json');
    process.exit(1);
  }
  const out = argValue('out') || '/tmp/fx_assets_urls.json';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const fx = app.get(FxAssetsService);
    console.log(`Importing FX pack from ${dir}`);
    const result = await fx.importFromDir(dir, { writeUrlsPath: out });
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          failed_count: result.failed.length,
          failed: result.failed,
          urls_file: out,
        },
        null,
        2,
      ),
    );
    if (result.failed.length) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
