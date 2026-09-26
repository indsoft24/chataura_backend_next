#!/usr/bin/env node
/**
 * Build chataura_gifts_gcs_v1.zip from Nest assets + catalog definitions.
 *
 * Gift binaries are gitignored and live on GCS (gifts/v1). For a local rebuild,
 * point ASSETS at a backup tree, e.g.:
 *   GIFTS_ASSETS_ROOT=../ChatAura_gift_media_backup_20260926/assets \
 *     node scripts/build-gifts-gcs-pack.mjs
 *
 * Default looks for chataura_backend_nest/assets, then sibling backup folders.
 *
 * Usage (from chataura_backend_next):
 *   node scripts/build-gifts-gcs-pack.mjs
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NEST = join(ROOT, 'chataura_backend_nest');
const OUT_DIR = join(ROOT, 'gifts_gcs_migrate');
const ZIP_PATH = join(ROOT, 'chataura_gifts_gcs_v1.zip');
const GCS_PREFIX = 'gifts/v1';

function resolveAssetsRoot() {
  if (process.env.GIFTS_ASSETS_ROOT) {
    return resolve(process.env.GIFTS_ASSETS_ROOT);
  }
  const nestAssets = join(NEST, 'assets');
  if (existsSync(join(nestAssets, 'cp-gifts')) || existsSync(join(nestAssets, 'gifts'))) {
    return nestAssets;
  }
  const parent = resolve(ROOT, '..');
  try {
    const backups = readdirSync(parent)
      .filter((n) => n.startsWith('ChatAura_gift_media_backup_'))
      .sort()
      .reverse();
    for (const b of backups) {
      const candidate = join(parent, b, 'assets');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* ignore */
  }
  return nestAssets;
}

const ASSETS = resolveAssetsRoot();
console.log(`Using assets root: ${ASSETS}`);

const FLAG_DEFS = [
  ['in', 'India Flag'],
  ['bd', 'Bangladesh Flag'],
  ['pk', 'Pakistan Flag'],
  ['ph', 'Philippines Flag'],
  ['id', 'Indonesia Flag'],
  ['np', 'Nepal Flag'],
  ['lk', 'Sri Lanka Flag'],
  ['mm', 'Myanmar Flag'],
  ['th', 'Thailand Flag'],
  ['vn', 'Vietnam Flag'],
  ['my', 'Malaysia Flag'],
  ['sg', 'Singapore Flag'],
  ['ae', 'UAE Flag'],
  ['sa', 'Saudi Flag'],
  ['qa', 'Qatar Flag'],
  ['eg', 'Egypt Flag'],
  ['ng', 'Nigeria Flag'],
  ['us', 'USA Flag'],
  ['gb', 'UK Flag'],
  ['cn', 'China Flag'],
  ['jp', 'Japan Flag'],
  ['kr', 'Korea Flag'],
  ['br', 'Brazil Flag'],
  ['tr', 'Turkey Flag'],
  ['de', 'Germany Flag'],
  ['fr', 'France Flag'],
  ['ca', 'Canada Flag'],
  ['au', 'Australia Flag'],
  ['ru', 'Russia Flag'],
  ['kh', 'Cambodia Flag'],
].map(([iso, name]) => ({
  gift_key: `flag_${iso}`,
  name,
  category: 'standard',
  coin_cost: 9999,
  image_src: join(ASSETS, 'gifts', 'flags', `flag_gift_${iso}.png`),
  anim_src: join(ASSETS, 'gifts', 'flags', `flag_fx_${iso}.webm`),
  image_file: `flags/flag_gift_${iso}.png`,
  animation_file: `flags/flag_fx_${iso}.webm`,
}));

const LUCKY_DEFS = [
  ['lucky_clover', 'Lucky Clover', 19999],
  ['lucky_dice', 'Lucky Dice', 29999],
  ['golden_slot', 'Golden Slot', 49999],
  ['fortune_wheel', 'Fortune Wheel', 59999],
  ['seven_stars', 'Seven Stars', 79999],
  ['jackpot_box', 'Jackpot Box', 99999],
  ['coin_rain', 'Coin Rain', 120000],
  ['treasure_chest', 'Treasure Chest', 150000],
  ['mystery_envelope', 'Mystery Envelope', 180000],
  ['dragon_fortune', 'Dragon Fortune', 250000],
  ['lucky_rocket', 'Lucky Rocket', 300000],
  ['mega_jackpot', 'Mega Jackpot', 500000],
].map(([key, name, coin]) => ({
  gift_key: key,
  name,
  category: 'lucky',
  coin_cost: coin,
  image_src: join(ASSETS, 'gifts', 'lucky', `lucky_gift_${key}.png`),
  anim_src: join(ASSETS, 'gifts', 'lucky', `lucky_fx_${key}.webm`),
  image_file: `lucky/lucky_gift_${key}.png`,
  animation_file: `lucky/lucky_fx_${key}.webm`,
}));

const BCP_DEFS = [
  ['friend_star', 'Friend Star', 79999],
  ['twin_stars', 'Twin Stars', 99999],
  ['handshake_gold', 'Golden Handshake', 120000],
  ['loyalty_badge', 'Loyalty Badge', 150000],
  ['besties_crown', 'Besties Crown', 200000],
  ['soul_sisters', 'Soul Sisters', 250000],
  ['duo_trophy', 'Duo Trophy', 300000],
  ['team_forever', 'Team Forever', 400000],
  ['bcp_carousel', 'BCP Carousel', 600000],
  ['bcp_voyage', 'BCP Voyage', 800000],
  ['bcp_galaxy', 'BCP Galaxy', 1200000],
  ['eternal_bond', 'Eternal Bond', 2000000],
].map(([key, name, coin]) => ({
  gift_key: key,
  name,
  category: 'bcp',
  coin_cost: coin,
  image_src: join(ASSETS, 'gifts', 'bcp', `bcp_gift_${key}.png`),
  anim_src: join(ASSETS, 'gifts', 'bcp', `bcp_fx_${key}.webm`),
  image_file: `bcp/bcp_gift_${key}.png`,
  animation_file: `bcp/bcp_fx_${key}.webm`,
}));

const CP_DEFS = [
  ['flower_umbrella', 'Flower Umbrella', 59999],
  ['blue_rose', 'Blue Rose', 60000],
  ['love_heart', 'Love Heart', 59999],
  ['diamond_necklace', 'Diamond Necklace', 60000],
  ['flight_of_love', 'Flight of Love', 119999],
  ['ring', 'Ring', 120000],
  ['flower_ball', 'Flower Ball', 120000],
  ['bouquet_box', 'Bouquet Box', 180000],
  ['finger_fireworks', 'Finger Fireworks', 200000],
  ['love_balloon', 'Love Balloon', 300000],
  ['love_penguin', 'Love Penguin', 300000],
  ['bouquet', 'Bouquet', 300000],
  ['love_car', 'Love Car', 300000],
  ['picnic', 'Picnic', 300000],
  ['rose_love', 'Rose Love', 400000],
  ['bear_bouquet', 'Bear Bouquet', 600000],
  ['date_night', 'Date Night', 600000],
  ['car_trips', 'Car Trips', 600000],
  ['love_carousel', 'Love Carousel', 600000],
  ['rose_rings', 'Rose Rings', 600000],
  ['wedding_hall', 'Wedding Hall', 600000],
  ['proposal_ring', 'Proposal Ring', 600000],
  ['love_diary', 'Love Diary', 600000],
  ['galaxy_fireworks', 'Galaxy Fireworks', 800000],
  ['flowers_for_u', 'Flowers For U', 800000],
  ['dream_night', 'Dream Night', 1000000],
  ['wedding', 'Wedding', 1200000],
  ['proposal', 'Proposal', 1200000],
  ['sweet_camera', 'Sweet Camera', 1200000],
  ['flower_yacht', 'Flower Yacht', 1500000],
  ['rose_love_vip', 'Rose Love VIP', 1500000],
  ['romantic_trip', 'Romantic Trip', 1800000],
  ['dinner_date', 'Dinner Date', 2000000],
  ['tower_proposal', 'Tower Proposal', 2000000],
  ['waltz', 'Waltz', 2400000],
  ['love_cruise', 'Love Cruise', 2400000],
  ['forever_love', 'Forever Love', 2400000],
  ['flower_sea', 'Flower Sea', 2500000],
  ['ferris_wheel_love', 'Ferris Wheel Love', 3000000],
  ['i_love_you', 'I Love You', 6000000],
  ['propose', 'Propose', 6000000],
].map(([key, name, coin]) => ({
  gift_key: key,
  name,
  category: 'cp',
  coin_cost: coin,
  image_src: join(ASSETS, 'cp-gifts', `cp_gift_${key}.png`),
  anim_src: join(ASSETS, 'cp-fx', `cp_fx_${key}.webm`),
  image_file: `cp/cp_gift_${key}.png`,
  animation_file: `cp/cp_fx_${key}.webm`,
}));

const ALL = [...FLAG_DEFS, ...LUCKY_DEFS, ...BCP_DEFS, ...CP_DEFS];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);
  for (const folder of ['cp', 'flags', 'lucky', 'bcp']) {
    ensureDir(join(OUT_DIR, folder));
  }

  const missing = [];
  const gifts = [];

  for (const g of ALL) {
    if (!existsSync(g.image_src)) missing.push(g.image_src);
    if (!existsSync(g.anim_src)) missing.push(g.anim_src);
    if (missing.length) continue;

    const imageDest = join(OUT_DIR, g.image_file);
    const animDest = join(OUT_DIR, g.animation_file);
    ensureDir(dirname(imageDest));
    copyFileSync(g.image_src, imageDest);
    copyFileSync(g.anim_src, animDest);

    gifts.push({
      gift_key: g.gift_key,
      name: g.name,
      category: g.category,
      coin_cost: g.coin_cost,
      image_file: g.image_file,
      animation_file: g.animation_file,
      gcs_image_object: `${GCS_PREFIX}/${g.image_file}`,
      gcs_animation_object: `${GCS_PREFIX}/${g.animation_file}`,
    });
  }

  if (missing.length) {
    console.error('Missing source files:');
    for (const m of missing) console.error('  -', m);
    process.exit(1);
  }

  const manifest = {
    pack: 'chataura_gifts_gcs_v1',
    version: 1,
    gcs_prefix: GCS_PREFIX,
    gift_count: gifts.length,
    media_file_count: gifts.length * 2,
    gifts,
  };
  writeFileSync(
    join(OUT_DIR, 'MANIFEST.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  const promptSrc = join(ROOT, 'SERVER_GIFTS_GCS_AGENT_PROMPT.md');
  if (existsSync(promptSrc)) {
    copyFileSync(promptSrc, join(OUT_DIR, 'SERVER_AGENT_PROMPT.md'));
  }

  if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH, { force: true });
  const zip = spawnSync(
    'zip',
    ['-r', '-q', ZIP_PATH, 'gifts_gcs_migrate'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (zip.status !== 0) {
    console.error('zip failed');
    process.exit(1);
  }

  // Validate
  const reloaded = JSON.parse(readFileSync(join(OUT_DIR, 'MANIFEST.json'), 'utf8'));
  let bad = 0;
  for (const g of reloaded.gifts) {
    if (!existsSync(join(OUT_DIR, g.image_file))) {
      console.error('MANIFEST image missing in pack:', g.image_file);
      bad++;
    }
    if (!existsSync(join(OUT_DIR, g.animation_file))) {
      console.error('MANIFEST anim missing in pack:', g.animation_file);
      bad++;
    }
  }
  if (bad) process.exit(1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        gift_count: gifts.length,
        media_file_count: gifts.length * 2,
        by_category: {
          standard: gifts.filter((x) => x.category === 'standard').length,
          lucky: gifts.filter((x) => x.category === 'lucky').length,
          bcp: gifts.filter((x) => x.category === 'bcp').length,
          cp: gifts.filter((x) => x.category === 'cp').length,
        },
        out_dir: OUT_DIR,
        zip: ZIP_PATH,
      },
      null,
      2,
    ),
  );
}

main();
