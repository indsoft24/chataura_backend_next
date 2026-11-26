/**
 * Runs in its own container (docker-compose `video-worker`), never inside the API.
 * Takes one file name at a time from a Redis list, re-encodes it to a 480p H.264 mp4 and swaps it in
 * under the SAME name, so every stored URL keeps working. One job at a time, one ffmpeg thread, and the
 * container has a CPU cap, so a flood of uploads only makes the queue longer, never the API slower.
 */
import Redis from 'ioredis';
import { spawn } from 'child_process';
import { closeSync, copyFileSync, openSync, readSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import {
  FAILED_KEY,
  MAX_TRIES,
  QUEUE_KEY,
  TRIES_KEY,
  SAFE_INPUT,
  isCompressible,
  isMp4Magic,
  needsCompress,
  scaleFilter,
  worthKeeping,
} from './video-rules';

const UPLOADS = resolve(process.env.UPLOADS_DIR || '/app/uploads');
const BACKUP = process.env.BACKUP_DIR || ''; // set only while backfilling old files
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    p.on('error', fail);
    p.on('close', (c) => (c === 0 ? ok(out) : fail(new Error(`${cmd} exit ${c}: ${err}`))));
  });
}

async function probe(path: string) {
  const out = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,bit_rate',
    '-of', 'json', ...SAFE_INPUT, path,
  ]);
  const s = JSON.parse(out).streams?.[0];
  if (!s) throw new Error('no video stream');
  return { width: Number(s.width), height: Number(s.height), bitRate: Number(s.bit_rate) || 0 };
}

async function compress(job: { f: string; b?: number }) {
  if (!isCompressible(job.f)) return;
  const src = resolve(UPLOADS, job.f);
  if (!src.startsWith(UPLOADS + '/') || !existsSync(src)) return;
  const head = Buffer.alloc(12);
  const fd = openSync(src, 'r');
  try { readSync(fd, head, 0, 12, 0); } finally { closeSync(fd); }
  if (!isMp4Magic(head)) { console.warn(`skipped ${job.f}: not an mp4`); return; }
  const before = statSync(src).size;
  if (!needsCompress(await probe(src))) return;

  const tmp = resolve(UPLOADS, `.c-${process.pid}-${job.f}`);
  try {
    await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-y', ...SAFE_INPUT, '-i', src,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-vf', scaleFilter(), '-r', '30',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '1', '-f', 'mp4', tmp,
    ]);
    const after = statSync(tmp).size;
    if (!worthKeeping(before, after)) { unlinkSync(tmp); return; }
    if (job.b && BACKUP) {
      mkdirSync(BACKUP, { recursive: true });
      const bk = resolve(BACKUP, job.f);
      if (!existsSync(bk)) copyFileSync(src, bk);
    }
    renameSync(tmp, src); // same filesystem: the swap is atomic
    console.log(`compressed ${job.f}: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw e;
  }
}

async function main() {
  console.log(`video-worker up, uploads=${UPLOADS}, backup=${BACKUP || 'off'}`);
  for (;;) {
    const item = await redis.brpop(QUEUE_KEY, 0);
    if (!item) continue;
    let job: { f: string; b?: number };
    try { job = JSON.parse(item[1]); } catch { continue; }
    try {
      await compress(job);
      await redis.hdel(TRIES_KEY, job.f);
    } catch (e) {
      const n = await redis.hincrby(TRIES_KEY, job.f, 1);
      console.warn(`compress failed (${n}/${MAX_TRIES}) ${job.f}: ${(e as Error).message}`);
      if (n < MAX_TRIES) await redis.lpush(QUEUE_KEY, item[1]);
      else await redis.lpush(FAILED_KEY, item[1]);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
