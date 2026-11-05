/*
 * Gift media cleanup: every gift's image_url / animation_url must point at a file that exists.
 * For a dead URL it looks for a working sibling (other extension, a doubled "/v1/v1/", or the same
 * file name in the cp / bcp / lucky / svip folders). Found -> the URL is switched to it. Nothing
 * found -> the URL is cleared (the app then shows its built-in icon and plays no full-screen effect).
 *
 * Dry run by default. Usage (inside the api container, as node):
 *   node scripts/fix-gift-media-urls.js            # report only
 *   node scripts/fix-gift-media-urls.js --apply    # write the changes
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const EXT = ['png', 'webp', 'jpg', 'jpeg', 'gif', 'json', 'webm', 'mp4'];
const FOLDERS = ['cp', 'bcp', 'lucky', 'svip', 'standard'];

const cache = new Map();
async function exists(url) {
  if (cache.has(url)) return cache.get(url);
  let ok = false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    ok = r.status === 200;
  } catch {
    ok = false;
  }
  cache.set(url, ok);
  return ok;
}

function candidates(url) {
  const out = [];
  const fixed = url.replace('/v1/v1/', '/v1/');
  if (fixed !== url) out.push(fixed);
  const m = fixed.match(/^(.*\/)([^/]+?)\.([a-z0-9]+)(\?.*)?$/i);
  if (!m) return out;
  const [, dir, base, ext] = m;
  // same kind only: pictures stay pictures, motion stays motion
  const picture = ['png', 'webp', 'jpg', 'jpeg', 'gif'];
  const motion = ['webm', 'mp4', 'json'];
  const group = picture.includes(ext.toLowerCase()) ? picture : motion.includes(ext.toLowerCase()) ? motion : EXT;
  const dirs = [dir];
  const root = dir.replace(/\/(cp|bcp|lucky|svip|standard|flags)\/$/, '/');
  for (const f of FOLDERS) dirs.push(`${root}${f}/`);
  for (const d of dirs) for (const e of group) out.push(`${d}${base}.${e}`);
  return [...new Set(out)].filter((c) => c !== url);
}

async function resolve(url) {
  if (!url) return { url: null, change: false };
  if (await exists(url)) return { url, change: false };
  for (const c of candidates(url)) if (await exists(c)) return { url: c, change: true };
  return { url: null, change: true };
}

(async () => {
  const prisma = new PrismaClient();
  const gifts = await prisma.gift.findMany({ orderBy: { id: 'asc' } });
  let fixed = 0, cleared = 0, kept = 0;
  for (const g of gifts) {
    const data = {};
    for (const [field, label] of [['imageUrl', 'image'], ['animationUrl', 'anim']]) {
      const cur = g[field];
      if (!cur) continue;
      const r = await resolve(cur);
      if (!r.change) { kept++; continue; }
      data[field] = r.url;
      if (r.url) { fixed++; console.log(`SWITCH  #${g.id} ${g.name} ${label}: ${cur.split('/').slice(-3).join('/')} -> ${r.url.split('/').slice(-3).join('/')}`); }
      else { cleared++; console.log(`CLEAR   #${g.id} ${g.name} ${label}: ${cur.split('/').slice(-3).join('/')}`); }
    }
    if (APPLY && Object.keys(data).length) await prisma.gift.update({ where: { id: g.id }, data });
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ok=${kept} switched=${fixed} cleared=${cleared}`);
  await prisma.$disconnect();
})();
