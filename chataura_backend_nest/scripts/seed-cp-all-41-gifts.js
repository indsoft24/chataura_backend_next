/**
 * Seed all 41 Antigravity CP gifts (docker-friendly CommonJS).
 * Paths: /uploads/cp/gifts + /uploads/cp/fx
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const base = (process.env.PUBLIC_BASE_URL || 'https://chataura.in').replace(/\/+$/, '');
const giftUrl = (key) => `${base}/uploads/cp/gifts/cp_gift_${key}.png`;
const fxUrl = (key) => `${base}/uploads/cp/fx/cp_fx_${key}.webm`;

const ALL_41 = [
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
];

const LEGACY_SOFT = [
  'Kiss Heart', 'Twin Hearts', 'Rose Bouquet', 'Promise Ring', 'Love Letter',
  'Sweet Box', 'Cuddle Bear', 'Romance Mist', 'Cheers', 'Moonlight', 'Wish Star',
  'Heart Balloon', 'Velvet Box', 'Cupid Bow', 'Locket', 'Soul Swans', 'Love Song',
  'Sakura Heart', 'Rose Crown', 'Soul Crystal',
];

(async () => {
  await prisma.gift.updateMany({
    where: { category: 'cp', name: { in: LEGACY_SOFT } },
    data: { isActive: false },
  });

  const cpRel = await prisma.relationshipType.findFirst({ where: { code: 'cp' } });
  for (const [key, name, coinCost] of ALL_41) {
    const imageUrl = giftUrl(key);
    const animationUrl = fxUrl(key);
    const existing = await prisma.gift.findFirst({ where: { name, category: 'cp' } });
    let id;
    if (existing) {
      const u = await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost, imageUrl, animationUrl, isActive: true, category: 'cp' },
      });
      id = u.id;
      console.log('updated', name);
    } else {
      const c = await prisma.gift.create({
        data: { name, coinCost, category: 'cp', imageUrl, animationUrl, isActive: true },
      });
      id = c.id;
      console.log('created', name);
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
  const active = await prisma.gift.count({ where: { category: 'cp', isActive: true } });
  console.log('CP active count', active);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
