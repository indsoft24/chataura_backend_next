/**
 * Seed & Synchronize Standard Gifts Catalog (ChatAura Live Room)
 * Ensures dance, dance 2, Love box, and all 40 luxury live stream gifts are
 * properly populated with official coin costs, category="standard", and durable media paths.
 */
const { PrismaClient } = require('@prisma/client');
if (process.env.ALLOW_GIFT_CATALOG_OVERWRITE !== '1') {
  console.error(
    'Refusing to run: this legacy script overwrites admin-managed gift prices, media and active flags.\n' +
      'Gifts are managed from the admin panel now. Set ALLOW_GIFT_CATALOG_OVERWRITE=1 only to deliberately reset them.',
  );
  process.exit(1);
}
const prisma = new PrismaClient();

function giftsCdnBase() {
  const explicit = (process.env.GIFTS_PUBLIC_BASE || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const bucket = (process.env.GCS_BUCKET || '').trim();
  if (bucket) return `https://storage.googleapis.com/${bucket}/gifts/v1`;
  const nest = (process.env.PUBLIC_BASE_URL || 'https://chataura.in').replace(/\/+$/, '');
  return `${nest}/uploads/gifts`;
}

const mediaBase = giftsCdnBase();
const useGcsLayout = mediaBase.includes('/gifts/v1') || mediaBase.includes('storage.googleapis.com');

function mediaUrl(folder, file) {
  if (!file) return null;
  return `${mediaBase}/${folder}/${file}`;
}

const STANDARD_CORE_GIFTS = [
  // Low-tier & Core starter gifts
  { key: 'dance', name: 'dance', coinCost: 11, image: 'normal_gift_dance.webp', anim: null },
  { key: 'rose', name: 'Rose', coinCost: 10, image: 'normal_gift_rose.webp', anim: null },
  { key: 'kiss', name: 'Kiss', coinCost: 20, image: 'normal_gift_kiss.webp', anim: 'cp/cp_fx_kiss_heart.webm' },
  { key: 'sweet_box', name: 'Sweet Box', coinCost: 30, image: 'normal_gift_sweet_box.webp', anim: null },
  { key: 'heart', name: 'Heart', coinCost: 50, image: 'normal_gift_heart.webp', anim: null },
  { key: 'love_letter', name: 'Love Letter', coinCost: 80, image: 'normal_gift_love_letter.webp', anim: null },
  { key: 'diamond', name: 'Diamond', coinCost: 100, image: 'normal_gift_diamond.webp', anim: null },
  { key: 'wish_star', name: 'Wish Star', coinCost: 150, image: 'cp_gift_star_heart.webp', anim: null },
  { key: 'dance_2', name: 'dance 2', coinCost: 199, image: 'normal_gift_dance_stage.webp', anim: null },
  { key: 'perfume', name: 'Perfume', coinCost: 200, image: 'normal_gift_perfume.webp', anim: 'cp/cp_fx_perfume.webm' },
  { key: 'love_box', name: 'Love box', coinCost: 300, image: 'normal_gift_love_box.webp', anim: null },
  { key: 'teddy_bear', name: 'Teddy Bear', coinCost: 300, image: 'normal_gift_teddy.webp', anim: null },
  { key: 'crown', name: 'Crown', coinCost: 500, image: 'normal_gift_crown.webp', anim: null },
  { key: 'champagne', name: 'Champagne', coinCost: 800, image: 'normal_gift_champagne.webp', anim: 'cp/cp_fx_champagne.webm' },
  { key: 'magic_ring', name: 'Magic Ring', coinCost: 1000, image: 'normal_gift_ring.webp', anim: 'cp/cp_fx_ring.webm' },
  { key: 'sports_car', name: 'Sports Car', coinCost: 5000, image: 'cp_gift_love_car.webp', anim: 'cp/cp_fx_love_car.webm' },
  { key: 'velvet_box', name: 'Velvet Box', coinCost: 8000, image: 'normal_gift_love_box.webp', anim: null },
  { key: 'cupid_bow', name: 'Cupid Bow', coinCost: 10000, image: 'cp_gift_cupid.webp', anim: 'cp/cp_fx_cupid.webm' },
  { key: 'moonlight', name: 'Moonlight', coinCost: 15000, image: 'cp_gift_moon_heart.webp', anim: 'cp/cp_fx_moon_heart.webm' },
  { key: 'soul_swans', name: 'Soul Swans', coinCost: 20000, image: 'cp_gift_swans.webp', anim: 'cp/cp_fx_swans.webm' },
  { key: 'luxury_yacht', name: 'Luxury Yacht', coinCost: 30000, image: 'bcp_gift_bcp_voyage.webp', anim: 'bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'besties_crown', name: 'Besties Crown', coinCost: 50000, image: 'bcp_gift_besties_crown.webp', anim: 'bcp/bcp_fx_besties_crown.webm' },
  { key: 'fireworks', name: 'Fireworks', coinCost: 80000, image: 'bcp_gift_bcp_galaxy.webp', anim: 'bcp/bcp_fx_bcp_galaxy.webm' },
  { key: 'dragon_fortune', name: 'Dragon Fortune', coinCost: 100000, image: 'normal_gift_dragon.webp', anim: 'lucky/lucky_fx_dragon_fortune.webm' },
  { key: 'golden_slot', name: 'Golden Slot', coinCost: 150000, image: 'lucky_gift_golden_slot.webp', anim: 'lucky/lucky_fx_golden_slot.webm' },
  { key: 'mega_jackpot', name: 'Mega Jackpot', coinCost: 200000, image: 'lucky_gift_mega_jackpot.webp', anim: 'lucky/lucky_fx_mega_jackpot.webm' },

  // High-End Luxury Standard Gifts (OLA / Chamet Style)
  { key: 'power_ring', name: 'Power Ring', coinCost: 15000, image: 'normal_gift_power_ring.webp', anim: null },
  { key: 'good_friend', name: 'Good Friend', coinCost: 36000, image: 'bcp_gift_handshake_gold.webp', anim: 'bcp/bcp_fx_handshake_gold.webm' },
  { key: 'love_perfume', name: 'Love Perfume', coinCost: 60000, image: 'cp_gift_perfume.webp', anim: 'cp/cp_fx_perfume.webm' },
  { key: 'luxury_belt', name: 'Luxury Belt', coinCost: 120000, image: 'normal_gift_luxury_belt.webp', anim: null },
  { key: 'luxury_perfume', name: 'Luxury Perfume', coinCost: 120000, image: 'cp_gift_perfume.webp', anim: 'cp/cp_fx_perfume.webm' },
  { key: 'luxury_bag', name: 'Luxury Bag', coinCost: 200000, image: 'normal_gift_luxury_bag.webp', anim: null },
  { key: 'rocket_std', name: 'Rocket', coinCost: 200000, image: 'lucky_gift_lucky_rocket.webp', anim: 'lucky/lucky_fx_lucky_rocket.webm' },
  { key: 'kiss_kiss', name: 'Kiss kiss', coinCost: 300000, image: 'normal_gift_kiss.webp', anim: 'cp/cp_fx_kiss_heart.webm' },
  { key: 'luxury_watch', name: 'Luxury Watch', coinCost: 400000, image: 'normal_gift_luxury_watch.webp', anim: null },
  { key: 'rich_tiger', name: 'Rich Tiger', coinCost: 400000, image: 'lucky_gift_dragon_fortune.webp', anim: 'lucky/lucky_fx_dragon_fortune.webm' },
  { key: 'fountain', name: 'Fountain', coinCost: 500000, image: 'normal_gift_fountain.webp', anim: 'lucky/lucky_fx_coin_rain.webm' },
  { key: 'wedding_hall', name: 'Wedding Hall', coinCost: 600000, image: 'normal_gift_wedding_hall.webp', anim: 'cp/cp_fx_wedding_hall.webm' },
  { key: 'brilliant_fireworks', name: 'Brilliant Fireworks', coinCost: 600000, image: 'normal_gift_galaxy_fireworks.webp', anim: 'cp/cp_fx_galaxy_fireworks.webm' },
  { key: 'bear_bouquet', name: 'Bear Bouquet', coinCost: 600000, image: 'normal_gift_teddy_love.webp', anim: 'cp/cp_fx_bear_bouquet.webm' },
  { key: 'love_carousel', name: 'Love Carousel', coinCost: 600000, image: 'cp_gift_love_carousel.webp', anim: 'cp/cp_fx_love_carousel.webm' },
  { key: 'teddy_love', name: 'Teddy Love', coinCost: 600000, image: 'normal_gift_teddy_love.webp', anim: 'cp/cp_fx_bear_bouquet.webm' },
  { key: 'super_rich', name: 'Super Rich', coinCost: 600000, image: 'normal_gift_rolls_royce.webp', anim: 'bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'galaxy_fireworks', name: 'Galaxy Fireworks', coinCost: 800000, image: 'normal_gift_galaxy_fireworks.webp', anim: 'cp/cp_fx_galaxy_fireworks.webm' },
  { key: 'alpaca_love', name: 'Alpaca Love', coinCost: 900000, image: 'normal_gift_alpaca.webp', anim: null },
  { key: 'alpaca', name: 'Alpaca', coinCost: 960000, image: 'normal_gift_alpaca.webp', anim: null },
  { key: 'rolls_royce', name: 'Rolls-Royce', coinCost: 960000, image: 'normal_gift_rolls_royce.webp', anim: 'bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'wedding_std', name: 'Wedding', coinCost: 120000, image: 'cp_gift_wedding.webp', anim: 'cp/cp_fx_wedding.webm' },
  { key: 'sweet_cake', name: 'Sweet Cake', coinCost: 1200000, image: 'cp_gift_chocolate.webp', anim: null },
  { key: 'yacht_party', name: 'Yacht Party', coinCost: 1200000, image: 'bcp_gift_bcp_voyage.webp', anim: 'bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'mysterious_car', name: 'Mysterious Car', coinCost: 1500000, image: 'normal_gift_mysterious_car.webp', anim: 'bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'dj_cat', name: 'DJ Cat', coinCost: 1500000, image: 'normal_gift_dance_cat.webp', anim: null },
  { key: 'flower_yacht', name: 'Flower Yacht', coinCost: 1500000, image: 'normal_gift_love_yacht.webp', anim: 'cp/cp_fx_flower_yacht.webm' },
  { key: 'love_yacht', name: 'Love Yacht', coinCost: 1800000, image: 'normal_gift_love_yacht.webp', anim: 'cp/cp_fx_flower_yacht.webm' },
  { key: 'pink_rose_cp', name: 'Pink Rose CP', coinCost: 2000000, image: 'normal_gift_pink_rose_cp.webp', anim: 'cp/cp_fx_rose_love.webm' },
  { key: 'rose_stairs', name: 'Rose Stairs', coinCost: 2000000, image: 'normal_gift_rose_stairs.webp', anim: 'cp/cp_fx_rose_love_vip.webm' },
  { key: 'forever_love', name: 'Forever Love', coinCost: 2400000, image: 'cp_gift_forever_love.webp', anim: 'cp/cp_fx_forever_love.webm' },
  { key: 'rose_ball', name: 'Rose Ball', coinCost: 2400000, image: 'normal_gift_rose_ball.webp', anim: 'cp/cp_fx_waltz.webm' },
  { key: 'dance_cat', name: 'Dance Cat', coinCost: 2400000, image: 'normal_gift_dance_cat.webp', anim: null },
  { key: 'waltz_std', name: 'Waltz', coinCost: 2400000, image: 'cp_gift_waltz.webp', anim: 'cp/cp_fx_waltz.webm' },
  { key: 'love_melody', name: 'Love Melody', coinCost: 2500000, image: 'cp_gift_melody.webp', anim: 'cp/cp_fx_melody.webm' },
  { key: 'lion', name: 'Lion', coinCost: 2500000, image: 'normal_gift_lion.webp', anim: null },
  { key: 'wealth_queen', name: 'Wealth Queen', coinCost: 2500000, image: 'normal_gift_wealth_queen.webp', anim: 'bcp/bcp_fx_besties_crown.webm' },
  { key: 'lion_king', name: 'Lion King', coinCost: 3000000, image: 'normal_gift_lion_king.webp', anim: null },
  { key: 'lion_guardian', name: 'Lion Guardian', coinCost: 5000000, image: 'normal_gift_lion_guardian.webp', anim: null },
  { key: 'temple_throne', name: 'Temple Throne', coinCost: 6000000, image: 'normal_gift_temple.webp', anim: null },
];

(async () => {
  console.log('Seeding Standard Gifts Catalog (ChatAura)...');

  let updatedCount = 0;
  let createdCount = 0;

  for (const g of STANDARD_CORE_GIFTS) {
    const imageUrl = g.image ? `${mediaBase}/standard/${g.image}` : null;
    const animationUrl = g.anim ? `${mediaBase}/${g.anim}` : null;

    const existing = await prisma.gift.findFirst({
      where: { name: g.name, category: 'standard' },
    });

    if (existing) {
      await prisma.gift.update({
        where: { id: existing.id },
        data: {
          coinCost: g.coinCost,
          category: 'standard',
          imageUrl: imageUrl || existing.imageUrl,
          animationUrl: animationUrl || existing.animationUrl,
          isActive: true,
        },
      });
      updatedCount++;
    } else {
      await prisma.gift.create({
        data: {
          name: g.name,
          coinCost: g.coinCost,
          category: 'standard',
          imageUrl,
          animationUrl,
          isActive: true,
        },
      });
      createdCount++;
    }
  }

  // Deactivate redundant duplicate legacy rows (e.g. redundant ID 18 "Rose" 1000 if ID 1 exists)
  const roses = await prisma.gift.findMany({ where: { name: 'Rose', category: 'standard' } });
  if (roses.length > 1) {
    // Keep lowest ID active, deactivate duplicates
    roses.slice(1).forEach(async (r) => {
      await prisma.gift.update({ where: { id: r.id }, data: { isActive: false } });
      console.log(`Deactivated duplicate Rose ID: ${r.id}`);
    });
  }

  console.log(`Standard Gifts Seed complete: ${createdCount} created, ${updatedCount} updated.`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
