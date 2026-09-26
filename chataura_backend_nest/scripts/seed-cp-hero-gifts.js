/**
 * One-shot seed / re-link for Antigravity hero CP gifts.
 * Paths match cp-affection-gifts.catalog.ts (uploads/cp/gifts + uploads/cp/fx).
 * Prefer: ensureCpAffectionGiftCatalog via gift-types after Nest rebuild.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function giftsCdnBase() {
  const explicit = (process.env.GIFTS_PUBLIC_BASE || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const bucket = (process.env.GCS_BUCKET || '').trim();
  if (bucket) return `https://storage.googleapis.com/${bucket}/gifts/v1`;
  return null;
}
const gcs = giftsCdnBase();
const nest = (process.env.PUBLIC_BASE_URL || 'https://chataura.in').replace(/\/+$/, '');
const giftUrl = (file) =>
  gcs ? `${gcs}/cp/${file}` : `${nest}/uploads/cp/gifts/${file}`;
const fxUrl = (file) =>
  gcs ? `${gcs}/cp/${file}` : `${nest}/uploads/cp/fx/${file}`;

const HERO = [
  ['Flower Umbrella', 59999, 'cp_gift_flower_umbrella.png', 'cp_fx_flower_umbrella.webm'],
  ['Blue Rose', 60000, 'cp_gift_blue_rose.png', 'cp_fx_blue_rose.webm'],
  ['Love Car', 300000, 'cp_gift_love_car.png', 'cp_fx_love_car.webm'],
  ['Wedding', 1200000, 'cp_gift_wedding.png', 'cp_fx_wedding.webm'],
  ['Flower Yacht', 1500000, 'cp_gift_flower_yacht.png', 'cp_fx_flower_yacht.webm'],
  ['Propose', 6000000, 'cp_gift_propose.png', 'cp_fx_propose.webm'],
];

(async () => {
  const cpRel = await prisma.relationshipType.findFirst({ where: { code: 'cp' } });
  for (const [name, coinCost, file, fx] of HERO) {
    const imageUrl = giftUrl(file);
    const animationUrl = fxUrl(fx);
    const existing = await prisma.gift.findFirst({ where: { name, category: 'cp' } });
    let id;
    if (existing) {
      const u = await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost, imageUrl, animationUrl, isActive: true, category: 'cp' },
      });
      id = u.id;
      console.log('updated', name, id);
    } else {
      const c = await prisma.gift.create({
        data: { name, coinCost, category: 'cp', imageUrl, animationUrl, isActive: true },
      });
      id = c.id;
      console.log('created', name, id);
    }
    if (cpRel) {
      await prisma.relationshipGiftRule.upsert({
        where: {
          giftId_relationshipTypeId: { giftId: id, relationshipTypeId: cpRel.id },
        },
        create: {
          giftId: id,
          relationshipTypeId: cpRel.id,
          pointValue: coinCost,
          enabled: true,
        },
        update: { pointValue: coinCost, enabled: true },
      });
    }
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
