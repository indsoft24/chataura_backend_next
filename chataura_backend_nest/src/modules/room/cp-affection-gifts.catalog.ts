/**
 * CP couple gift catalog — romantic / bond gifts only (never standard Rose/Kiss/Rocket).
 * Icons: assets/cp-gifts/ → /uploads/cp/gifts/
 * Motion: CP-only Lottie/video under /uploads/cp/fx/ (not reused standard gift Lotties).
 */
import { PrismaClient } from '@prisma/client';

export type CpAffectionGiftDef = {
  key: string;
  name: string;
  coinCost: number;
  file: string;
  /** Full-screen CP motion (Lottie .json or mp4/webm). */
  animationFile?: string | null;
};

/** Bundled CP FX files copied to uploads/cp/fx/ on boot. */
export const CP_FX_FILES = [
  'rel_cp_formed.json',
  'cp_heart_link_loop.json',
  'rel_bcp_formed.json',
] as const;

export const CP_AFFECTION_GIFTS: CpAffectionGiftDef[] = [
  // Soft romantic (icons we ship) — Masti-style naming
  { key: 'flower_umbrella', name: 'Flower Umbrella', coinCost: 59_999, file: 'cp_gift_sakura.png', animationFile: 'rel_cp_formed.json' },
  { key: 'blue_rose', name: 'Blue Rose', coinCost: 60_000, file: 'cp_gift_rose_bouquet.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_heart', name: 'Love Heart', coinCost: 59_999, file: 'cp_gift_kiss_heart.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'diamond_necklace', name: 'Diamond Necklace', coinCost: 60_000, file: 'cp_gift_crystal.png', animationFile: 'rel_cp_formed.json' },
  { key: 'flight_of_love', name: 'Flight of Love', coinCost: 119_999, file: 'cp_gift_twin_hearts.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'ring', name: 'Ring', coinCost: 120_000, file: 'cp_gift_ring_box.png', animationFile: 'rel_cp_formed.json' },
  { key: 'flower_ball', name: 'Flower Ball', coinCost: 120_000, file: 'cp_gift_rose_crown.png', animationFile: 'rel_cp_formed.json' },
  { key: 'bouquet_box', name: 'Bouquet Box', coinCost: 180_000, file: 'cp_gift_gift_box.png', animationFile: 'rel_cp_formed.json' },
  { key: 'finger_fireworks', name: 'Finger Fireworks', coinCost: 200_000, file: 'cp_gift_star_heart.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'love_balloon', name: 'Love Balloon', coinCost: 300_000, file: 'cp_gift_balloon.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_penguin', name: 'Love Penguin', coinCost: 300_000, file: 'cp_gift_teddy.png', animationFile: 'rel_cp_formed.json' },
  { key: 'bouquet', name: 'Bouquet', coinCost: 300_000, file: 'cp_gift_rose_bouquet.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_car', name: 'Love Car', coinCost: 300_000, file: 'cp_gift_cupid.png', animationFile: 'rel_cp_formed.json' },
  { key: 'rose_love', name: 'Rose Love', coinCost: 400_000, file: 'cp_gift_sakura.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'picnic', name: 'Picnic', coinCost: 300_000, file: 'cp_gift_chocolate.png', animationFile: 'rel_cp_formed.json' },
  { key: 'bear_bouquet', name: 'Bear Bouquet', coinCost: 600_000, file: 'cp_gift_teddy.png', animationFile: 'rel_cp_formed.json' },
  { key: 'date_night', name: 'Date Night', coinCost: 600_000, file: 'cp_gift_champagne.png', animationFile: 'rel_cp_formed.json' },
  { key: 'car_trips', name: 'Car Trips', coinCost: 600_000, file: 'cp_gift_cupid.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_carousel', name: 'Love Carousel', coinCost: 600_000, file: 'cp_gift_melody.png', animationFile: 'rel_cp_formed.json' },
  { key: 'rose_rings', name: 'Rose Rings', coinCost: 600_000, file: 'cp_gift_ring_box.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'wedding_hall', name: 'Wedding Hall', coinCost: 600_000, file: 'cp_gift_locket.png', animationFile: 'rel_cp_formed.json' },
  { key: 'proposal_ring', name: 'Proposal Ring', coinCost: 600_000, file: 'cp_gift_ring_box.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_diary', name: 'Love Diary', coinCost: 600_000, file: 'cp_gift_love_letter.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'galaxy_fireworks', name: 'Galaxy Fireworks', coinCost: 800_000, file: 'cp_gift_moon_heart.png', animationFile: 'rel_cp_formed.json' },
  { key: 'flowers_for_u', name: 'Flowers For U', coinCost: 800_000, file: 'cp_gift_rose_bouquet.png', animationFile: 'rel_cp_formed.json' },
  { key: 'dream_night', name: 'Dream Night', coinCost: 1_000_000, file: 'cp_gift_swans.png', animationFile: 'rel_cp_formed.json' },
  { key: 'wedding', name: 'Wedding', coinCost: 1_200_000, file: 'cp_gift_locket.png', animationFile: 'rel_cp_formed.json' },
  { key: 'proposal', name: 'Proposal', coinCost: 1_200_000, file: 'cp_gift_ring_box.png', animationFile: 'rel_cp_formed.json' },
  { key: 'sweet_camera', name: 'Sweet Camera', coinCost: 1_200_000, file: 'cp_gift_perfume.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'flower_yacht', name: 'Flower Yacht', coinCost: 1_500_000, file: 'cp_gift_swans.png', animationFile: 'rel_cp_formed.json' },
  { key: 'rose_love_vip', name: 'Rose Love VIP', coinCost: 1_500_000, file: 'cp_gift_rose_crown.png', animationFile: 'rel_cp_formed.json' },
  { key: 'romantic_trip', name: 'Romantic Trip', coinCost: 1_800_000, file: 'cp_gift_champagne.png', animationFile: 'rel_cp_formed.json' },
  { key: 'dinner_date', name: 'Dinner Date', coinCost: 2_000_000, file: 'cp_gift_champagne.png', animationFile: 'rel_cp_formed.json' },
  { key: 'tower_proposal', name: 'Tower Proposal', coinCost: 2_000_000, file: 'cp_gift_star_heart.png', animationFile: 'rel_cp_formed.json' },
  { key: 'waltz', name: 'Waltz', coinCost: 2_400_000, file: 'cp_gift_melody.png', animationFile: 'rel_cp_formed.json' },
  { key: 'love_cruise', name: 'Love Cruise', coinCost: 2_400_000, file: 'cp_gift_balloon.png', animationFile: 'rel_cp_formed.json' },
  { key: 'forever_love', name: 'Forever Love', coinCost: 2_400_000, file: 'cp_gift_twin_hearts.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'flower_sea', name: 'Flower Sea', coinCost: 2_500_000, file: 'cp_gift_sakura.png', animationFile: 'rel_cp_formed.json' },
  { key: 'ferris_wheel_love', name: 'Ferris Wheel Love', coinCost: 3_000_000, file: 'cp_gift_crystal.png', animationFile: 'rel_cp_formed.json' },
  { key: 'i_love_you', name: 'I Love You', coinCost: 6_000_000, file: 'cp_gift_kiss_heart.png', animationFile: 'cp_heart_link_loop.json' },
  { key: 'propose', name: 'Propose', coinCost: 6_000_000, file: 'cp_gift_ring_box.png', animationFile: 'rel_cp_formed.json' },
];

export function cpGiftPublicUrl(publicBase: string, file: string): string {
  const base = publicBase.replace(/\/+$/, '');
  return `${base}/uploads/cp/gifts/${file}`;
}

export function cpFxPublicUrl(publicBase: string, file: string): string {
  const base = publicBase.replace(/\/+$/, '');
  return `${base}/uploads/cp/fx/${file}`;
}

type PrismaLike = Pick<PrismaClient, 'gift' | 'relationshipType' | 'relationshipGiftRule'>;

const LEGACY_AFFECTION_NAMES = [
  'Kiss Heart',
  'Twin Hearts',
  'Rose Bouquet',
  'Promise Ring',
  'Love Letter',
  'Sweet Box',
  'Cuddle Bear',
  'Romance Mist',
  'Cheers',
  'Moonlight',
  'Wish Star',
  'Heart Balloon',
  'Velvet Box',
  'Cupid Bow',
  'Locket',
  'Soul Swans',
  'Love Song',
  'Sakura Heart',
  'Rose Crown',
  'Soul Crystal',
];

/** Idempotent upsert of CP couple gifts + rules. Deactivates old affection placeholders. */
export async function ensureCpAffectionGiftCatalog(
  prisma: PrismaLike,
  publicBase: string,
): Promise<void> {
  // Hide legacy soft-affection rows so CP tab is Masti-style couple only.
  await prisma.gift.updateMany({
    where: { category: 'cp', name: { in: LEGACY_AFFECTION_NAMES } },
    data: { isActive: false },
  });

  const existing = await prisma.gift.findMany({
    where: {
      category: 'cp',
      name: { in: CP_AFFECTION_GIFTS.map((g) => g.name) },
    },
    select: { id: true, name: true },
  });
  const have = new Set(existing.map((g) => g.name));
  const missing = CP_AFFECTION_GIFTS.filter((g) => !have.has(g.name));

  if (missing.length > 0) {
    await prisma.gift.createMany({
      data: missing.map((g) => ({
        name: g.name,
        coinCost: g.coinCost,
        category: 'cp',
        imageUrl: cpGiftPublicUrl(publicBase, g.file),
        animationUrl: g.animationFile
          ? cpFxPublicUrl(publicBase, g.animationFile)
          : null,
        isActive: true,
      })),
    });
  }

  for (const g of CP_AFFECTION_GIFTS) {
    const imageUrl = cpGiftPublicUrl(publicBase, g.file);
    const animationUrl = g.animationFile
      ? cpFxPublicUrl(publicBase, g.animationFile)
      : null;
    await prisma.gift.updateMany({
      where: { name: g.name, category: 'cp' },
      data: {
        imageUrl,
        animationUrl,
        isActive: true,
        coinCost: g.coinCost,
      },
    });
  }

  // Keep CP1 / CP2 (video) active if present — premium couple videos.
  await prisma.gift.updateMany({
    where: { category: 'cp', name: { in: ['CP1', 'CP2'] } },
    data: { isActive: true },
  });

  const cpType = await prisma.relationshipType.findFirst({
    where: { code: 'cp' },
  });
  if (!cpType) return;

  const affection = await prisma.gift.findMany({
    where: {
      isActive: true,
      category: 'cp',
      name: { in: CP_AFFECTION_GIFTS.map((g) => g.name) },
    },
  });
  for (const gift of affection) {
    await prisma.relationshipGiftRule.upsert({
      where: {
        giftId_relationshipTypeId: {
          giftId: gift.id,
          relationshipTypeId: cpType.id,
        },
      },
      create: {
        giftId: gift.id,
        relationshipTypeId: cpType.id,
        pointValue: gift.coinCost,
        enabled: true,
      },
      update: { enabled: true, pointValue: gift.coinCost },
    });
  }
}
