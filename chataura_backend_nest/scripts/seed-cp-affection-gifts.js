const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const base = 'https://chataura.in';
const giftUrl = (file) => `${base}/uploads/cp/gifts/${file}`;
const fxUrl = (file) => `${base}/uploads/cp/fx/${file}`;

const LEGACY = [
  'Kiss Heart', 'Twin Hearts', 'Rose Bouquet', 'Promise Ring', 'Love Letter',
  'Sweet Box', 'Cuddle Bear', 'Romance Mist', 'Cheers', 'Moonlight', 'Wish Star',
  'Heart Balloon', 'Velvet Box', 'Cupid Bow', 'Locket', 'Soul Swans', 'Love Song',
  'Sakura Heart', 'Rose Crown', 'Soul Crystal',
];

const gifts = [
  ['Flower Umbrella', 59999, 'cp_gift_sakura.png', 'rel_cp_formed.json'],
  ['Blue Rose', 60000, 'cp_gift_rose_bouquet.png', 'rel_cp_formed.json'],
  ['Love Heart', 59999, 'cp_gift_kiss_heart.png', 'cp_heart_link_loop.json'],
  ['Diamond Necklace', 60000, 'cp_gift_crystal.png', 'rel_cp_formed.json'],
  ['Flight of Love', 119999, 'cp_gift_twin_hearts.png', 'cp_heart_link_loop.json'],
  ['Ring', 120000, 'cp_gift_ring_box.png', 'rel_cp_formed.json'],
  ['Flower Ball', 120000, 'cp_gift_rose_crown.png', 'rel_cp_formed.json'],
  ['Bouquet Box', 180000, 'cp_gift_gift_box.png', 'rel_cp_formed.json'],
  ['Finger Fireworks', 200000, 'cp_gift_star_heart.png', 'cp_heart_link_loop.json'],
  ['Love Balloon', 300000, 'cp_gift_balloon.png', 'rel_cp_formed.json'],
  ['Love Penguin', 300000, 'cp_gift_teddy.png', 'rel_cp_formed.json'],
  ['Bouquet', 300000, 'cp_gift_rose_bouquet.png', 'rel_cp_formed.json'],
  ['Love Car', 300000, 'cp_gift_cupid.png', 'rel_cp_formed.json'],
  ['Rose Love', 400000, 'cp_gift_sakura.png', 'cp_heart_link_loop.json'],
  ['Picnic', 300000, 'cp_gift_chocolate.png', 'rel_cp_formed.json'],
  ['Bear Bouquet', 600000, 'cp_gift_teddy.png', 'rel_cp_formed.json'],
  ['Date Night', 600000, 'cp_gift_champagne.png', 'rel_cp_formed.json'],
  ['Car Trips', 600000, 'cp_gift_cupid.png', 'rel_cp_formed.json'],
  ['Love Carousel', 600000, 'cp_gift_melody.png', 'rel_cp_formed.json'],
  ['Rose Rings', 600000, 'cp_gift_ring_box.png', 'cp_heart_link_loop.json'],
  ['Wedding Hall', 600000, 'cp_gift_locket.png', 'rel_cp_formed.json'],
  ['Proposal Ring', 600000, 'cp_gift_ring_box.png', 'rel_cp_formed.json'],
  ['Love Diary', 600000, 'cp_gift_love_letter.png', 'cp_heart_link_loop.json'],
  ['Galaxy Fireworks', 800000, 'cp_gift_moon_heart.png', 'rel_cp_formed.json'],
  ['Flowers For U', 800000, 'cp_gift_rose_bouquet.png', 'rel_cp_formed.json'],
  ['Dream Night', 1000000, 'cp_gift_swans.png', 'rel_cp_formed.json'],
  ['Wedding', 1200000, 'cp_gift_locket.png', 'rel_cp_formed.json'],
  ['Proposal', 1200000, 'cp_gift_ring_box.png', 'rel_cp_formed.json'],
  ['Sweet Camera', 1200000, 'cp_gift_perfume.png', 'cp_heart_link_loop.json'],
  ['Flower Yacht', 1500000, 'cp_gift_swans.png', 'rel_cp_formed.json'],
  ['Rose Love VIP', 1500000, 'cp_gift_rose_crown.png', 'rel_cp_formed.json'],
  ['Romantic Trip', 1800000, 'cp_gift_champagne.png', 'rel_cp_formed.json'],
  ['Dinner Date', 2000000, 'cp_gift_champagne.png', 'rel_cp_formed.json'],
  ['Tower Proposal', 2000000, 'cp_gift_star_heart.png', 'rel_cp_formed.json'],
  ['Waltz', 2400000, 'cp_gift_melody.png', 'rel_cp_formed.json'],
  ['Love Cruise', 2400000, 'cp_gift_balloon.png', 'rel_cp_formed.json'],
  ['Forever Love', 2400000, 'cp_gift_twin_hearts.png', 'cp_heart_link_loop.json'],
  ['Flower Sea', 2500000, 'cp_gift_sakura.png', 'rel_cp_formed.json'],
  ['Ferris Wheel Love', 3000000, 'cp_gift_crystal.png', 'rel_cp_formed.json'],
  ['I Love You', 6000000, 'cp_gift_kiss_heart.png', 'cp_heart_link_loop.json'],
  ['Propose', 6000000, 'cp_gift_ring_box.png', 'rel_cp_formed.json'],
];

(async () => {
  await prisma.gift.updateMany({
    where: { category: 'cp', name: { in: LEGACY } },
    data: { isActive: false },
  });

  for (const [name, cost, file, fx] of gifts) {
    const imageUrl = giftUrl(file);
    const animationUrl = fxUrl(fx);
    const existing = await prisma.gift.findFirst({ where: { name, category: 'cp' } });
    if (existing) {
      await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost: cost, imageUrl, animationUrl, isActive: true },
      });
    } else {
      await prisma.gift.create({
        data: { name, coinCost: cost, category: 'cp', imageUrl, animationUrl, isActive: true },
      });
    }
  }

  await prisma.gift.updateMany({
    where: { category: 'cp', name: { in: ['CP1', 'CP2'] } },
    data: { isActive: true },
  });

  const cpType = await prisma.relationshipType.findFirst({ where: { code: 'cp' } });
  if (cpType) {
    const rows = await prisma.gift.findMany({
      where: { category: 'cp', isActive: true, name: { in: gifts.map((g) => g[0]) } },
    });
    for (const g of rows) {
      await prisma.relationshipGiftRule.upsert({
        where: {
          giftId_relationshipTypeId: {
            giftId: g.id,
            relationshipTypeId: cpType.id,
          },
        },
        create: {
          giftId: g.id,
          relationshipTypeId: cpType.id,
          pointValue: g.coinCost,
          enabled: true,
        },
        update: { enabled: true, pointValue: g.coinCost },
      });
    }
  }

  const active = await prisma.gift.findMany({
    where: { category: 'cp', isActive: true },
    select: { name: true, animationUrl: true },
    orderBy: { coinCost: 'asc' },
  });
  console.log('CP active', active.length);
  console.log(active.map((g) => g.name).join(', '));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
