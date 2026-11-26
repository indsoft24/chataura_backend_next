/** One-shot: queue every big old reel/post video for the worker (the worker backs the originals up first). */
import Redis from 'ioredis';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { QUEUE_KEY, isCompressible } from './video-rules';

const UPLOADS = resolve(process.env.UPLOADS_DIR || '/app/uploads');
const MIN = Number(process.env.MIN_BYTES || 2 * 1024 * 1024);
const LIMIT = Number(process.env.LIMIT || 0); // 0 = all
(async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
  const files = readdirSync(UPLOADS)
    .filter((f) => /(reel_video|post_video)/.test(f) && isCompressible(f) && statSync(resolve(UPLOADS, f)).size >= MIN)
    .sort((a, b) => statSync(resolve(UPLOADS, b)).size - statSync(resolve(UPLOADS, a)).size);
  const pick = LIMIT > 0 ? files.slice(0, LIMIT) : files;
  for (const f of pick) await redis.lpush(QUEUE_KEY, JSON.stringify({ f, b: 1 }));
  console.log(`queued ${pick.length} of ${files.length} candidate files`);
  await redis.quit();
})();
