/**
 * CP couple gift catalog — full Antigravity 41-gift set (1:1 name ↔ PNG ↔ WebM).
 * Spec: ChatAura/ANTIGRAVITY_CP_GIFTS_PROMPTS.md
 *
 * Media: GCS gifts/v1/cp/… (see gifts-cdn.ts). Legacy Nest /uploads/ only if CDN unset.
 */
import { PrismaClient } from '@prisma/client';
import {
  giftsCdnCpFxUrl,
  giftsCdnCpImageUrl,
} from '../../common/gcs/gifts-cdn';

export type CpAffectionGiftDef = {
  key: string;
  name: string;
  coinCost: number;
  file: string;
  animationFile?: string | null;
};

/** Master Antigravity catalog (41). */
export const CP_AFFECTION_GIFTS: CpAffectionGiftDef[] = [
  { key: 'flower_umbrella', name: 'Flower Umbrella', coinCost: 59_999, file: 'cp_gift_flower_umbrella.png', animationFile: 'cp_fx_flower_umbrella.webm' },
  { key: 'blue_rose', name: 'Blue Rose', coinCost: 60_000, file: 'cp_gift_blue_rose.png', animationFile: 'cp_fx_blue_rose.webm' },
  { key: 'love_heart', name: 'Love Heart', coinCost: 59_999, file: 'cp_gift_love_heart.png', animationFile: 'cp_fx_love_heart.webm' },
  { key: 'diamond_necklace', name: 'Diamond Necklace', coinCost: 60_000, file: 'cp_gift_diamond_necklace.png', animationFile: 'cp_fx_diamond_necklace.webm' },
  { key: 'flight_of_love', name: 'Flight of Love', coinCost: 119_999, file: 'cp_gift_flight_of_love.png', animationFile: 'cp_fx_flight_of_love.webm' },
  { key: 'ring', name: 'Ring', coinCost: 120_000, file: 'cp_gift_ring.png', animationFile: 'cp_fx_ring.webm' },
  { key: 'flower_ball', name: 'Flower Ball', coinCost: 120_000, file: 'cp_gift_flower_ball.png', animationFile: 'cp_fx_flower_ball.webm' },
  { key: 'bouquet_box', name: 'Bouquet Box', coinCost: 180_000, file: 'cp_gift_bouquet_box.png', animationFile: 'cp_fx_bouquet_box.webm' },
  { key: 'finger_fireworks', name: 'Finger Fireworks', coinCost: 200_000, file: 'cp_gift_finger_fireworks.png', animationFile: 'cp_fx_finger_fireworks.webm' },
  { key: 'love_balloon', name: 'Love Balloon', coinCost: 300_000, file: 'cp_gift_love_balloon.png', animationFile: 'cp_fx_love_balloon.webm' },
  { key: 'love_penguin', name: 'Love Penguin', coinCost: 300_000, file: 'cp_gift_love_penguin.png', animationFile: 'cp_fx_love_penguin.webm' },
  { key: 'bouquet', name: 'Bouquet', coinCost: 300_000, file: 'cp_gift_bouquet.png', animationFile: 'cp_fx_bouquet.webm' },
  { key: 'love_car', name: 'Love Car', coinCost: 300_000, file: 'cp_gift_love_car.png', animationFile: 'cp_fx_love_car.webm' },
  { key: 'picnic', name: 'Picnic', coinCost: 300_000, file: 'cp_gift_picnic.png', animationFile: 'cp_fx_picnic.webm' },
  { key: 'rose_love', name: 'Rose Love', coinCost: 400_000, file: 'cp_gift_rose_love.png', animationFile: 'cp_fx_rose_love.webm' },
  { key: 'bear_bouquet', name: 'Bear Bouquet', coinCost: 600_000, file: 'cp_gift_bear_bouquet.png', animationFile: 'cp_fx_bear_bouquet.webm' },
  { key: 'date_night', name: 'Date Night', coinCost: 600_000, file: 'cp_gift_date_night.png', animationFile: 'cp_fx_date_night.webm' },
  { key: 'car_trips', name: 'Car Trips', coinCost: 600_000, file: 'cp_gift_car_trips.png', animationFile: 'cp_fx_car_trips.webm' },
  { key: 'love_carousel', name: 'Love Carousel', coinCost: 600_000, file: 'cp_gift_love_carousel.png', animationFile: 'cp_fx_love_carousel.webm' },
  { key: 'rose_rings', name: 'Rose Rings', coinCost: 600_000, file: 'cp_gift_rose_rings.png', animationFile: 'cp_fx_rose_rings.webm' },
  { key: 'wedding_hall', name: 'Wedding Hall', coinCost: 600_000, file: 'cp_gift_wedding_hall.png', animationFile: 'cp_fx_wedding_hall.webm' },
  { key: 'proposal_ring', name: 'Proposal Ring', coinCost: 600_000, file: 'cp_gift_proposal_ring.png', animationFile: 'cp_fx_proposal_ring.webm' },
  { key: 'love_diary', name: 'Love Diary', coinCost: 600_000, file: 'cp_gift_love_diary.png', animationFile: 'cp_fx_love_diary.webm' },
  { key: 'galaxy_fireworks', name: 'Galaxy Fireworks', coinCost: 800_000, file: 'cp_gift_galaxy_fireworks.png', animationFile: 'cp_fx_galaxy_fireworks.webm' },
  { key: 'flowers_for_u', name: 'Flowers For U', coinCost: 800_000, file: 'cp_gift_flowers_for_u.png', animationFile: 'cp_fx_flowers_for_u.webm' },
  { key: 'dream_night', name: 'Dream Night', coinCost: 1_000_000, file: 'cp_gift_dream_night.png', animationFile: 'cp_fx_dream_night.webm' },
  { key: 'wedding', name: 'Wedding', coinCost: 1_200_000, file: 'cp_gift_wedding.png', animationFile: 'cp_fx_wedding.webm' },
  { key: 'proposal', name: 'Proposal', coinCost: 1_200_000, file: 'cp_gift_proposal.png', animationFile: 'cp_fx_proposal.webm' },
  { key: 'sweet_camera', name: 'Sweet Camera', coinCost: 1_200_000, file: 'cp_gift_sweet_camera.png', animationFile: 'cp_fx_sweet_camera.webm' },
  { key: 'flower_yacht', name: 'Flower Yacht', coinCost: 1_500_000, file: 'cp_gift_flower_yacht.png', animationFile: 'cp_fx_flower_yacht.webm' },
  { key: 'rose_love_vip', name: 'Rose Love VIP', coinCost: 1_500_000, file: 'cp_gift_rose_love_vip.png', animationFile: 'cp_fx_rose_love_vip.webm' },
  { key: 'romantic_trip', name: 'Romantic Trip', coinCost: 1_800_000, file: 'cp_gift_romantic_trip.png', animationFile: 'cp_fx_romantic_trip.webm' },
  { key: 'dinner_date', name: 'Dinner Date', coinCost: 2_000_000, file: 'cp_gift_dinner_date.png', animationFile: 'cp_fx_dinner_date.webm' },
  { key: 'tower_proposal', name: 'Tower Proposal', coinCost: 2_000_000, file: 'cp_gift_tower_proposal.png', animationFile: 'cp_fx_tower_proposal.webm' },
  { key: 'waltz', name: 'Waltz', coinCost: 2_400_000, file: 'cp_gift_waltz.png', animationFile: 'cp_fx_waltz.webm' },
  { key: 'love_cruise', name: 'Love Cruise', coinCost: 2_400_000, file: 'cp_gift_love_cruise.png', animationFile: 'cp_fx_love_cruise.webm' },
  { key: 'forever_love', name: 'Forever Love', coinCost: 2_400_000, file: 'cp_gift_forever_love.png', animationFile: 'cp_fx_forever_love.webm' },
  { key: 'flower_sea', name: 'Flower Sea', coinCost: 2_500_000, file: 'cp_gift_flower_sea.png', animationFile: 'cp_fx_flower_sea.webm' },
  { key: 'ferris_wheel_love', name: 'Ferris Wheel Love', coinCost: 3_000_000, file: 'cp_gift_ferris_wheel_love.png', animationFile: 'cp_fx_ferris_wheel_love.webm' },
  { key: 'i_love_you', name: 'I Love You', coinCost: 6_000_000, file: 'cp_gift_i_love_you.png', animationFile: 'cp_fx_i_love_you.webm' },
  { key: 'propose', name: 'Propose', coinCost: 6_000_000, file: 'cp_gift_propose.png', animationFile: 'cp_fx_propose.webm' },
];

export const CP_FX_FILES = [
  'rel_cp_formed.json',
  'cp_heart_link_loop.json',
  'rel_bcp_formed.json',
  ...CP_AFFECTION_GIFTS.map((g) => g.animationFile!).filter(Boolean),
] as const;

/** Pre-Antigravity soft placeholders — hide from CP tab now that 41 real gifts ship. */
export const CP_LEGACY_SOFT_PLACEHOLDER_NAMES = [
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
] as const;

/** Old WhatsApp-poster demo slots — never show on CP tab. */
export const CP_MISMATCHED_PLACEHOLDER_NAMES = ['CP1', 'CP2'] as const;

export function cpGiftPublicUrl(_publicBase: string, file: string): string {
  return giftsCdnCpImageUrl(file);
}

export function cpFxPublicUrl(_publicBase: string, file: string): string {
  return giftsCdnCpFxUrl(file);
}

type PrismaLike = Pick<PrismaClient, 'gift' | 'relationshipType' | 'relationshipGiftRule'>;

/** Idempotent: activate all 41 Antigravity gifts; deactivate legacy soft placeholders. */
export async function ensureCpAffectionGiftCatalog(
  prisma: PrismaLike,
  publicBase: string,
): Promise<void> {
  await prisma.gift.updateMany({
    where: {
      category: 'cp',
      name: {
        in: [
          ...CP_LEGACY_SOFT_PLACEHOLDER_NAMES,
          ...CP_MISMATCHED_PLACEHOLDER_NAMES,
        ],
      },
    },
    data: { isActive: false },
  });

  const catalogNames = CP_AFFECTION_GIFTS.map((g) => g.name);
  const existing = await prisma.gift.findMany({
    where: { category: 'cp', name: { in: catalogNames } },
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
    await prisma.gift.updateMany({
      where: { name: g.name, category: 'cp' },
      data: {
        imageUrl: cpGiftPublicUrl(publicBase, g.file),
        animationUrl: g.animationFile
          ? cpFxPublicUrl(publicBase, g.animationFile)
          : null,
        isActive: true,
        coinCost: g.coinCost,
      },
    });
  }

  const cpType = await prisma.relationshipType.findFirst({
    where: { code: 'cp' },
  });
  if (!cpType) return;

  const affection = await prisma.gift.findMany({
    where: {
      isActive: true,
      category: 'cp',
      name: { in: catalogNames },
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
