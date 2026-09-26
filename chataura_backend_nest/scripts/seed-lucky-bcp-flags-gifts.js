/**
 * Seed Country Flags (30), Lucky Gifts (12), and BCP Gifts (12).
 * Paths: /uploads/gifts/flags, /uploads/gifts/lucky, /uploads/gifts/bcp
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const base = (process.env.PUBLIC_BASE_URL || 'https://chataura.in').replace(/\/+$/, '');

const FLAGS_30 = [
  ['in', 'India Flag', 9999],
  ['bd', 'Bangladesh Flag', 9999],
  ['pk', 'Pakistan Flag', 9999],
  ['ph', 'Philippines Flag', 9999],
  ['id', 'Indonesia Flag', 9999],
  ['np', 'Nepal Flag', 9999],
  ['lk', 'Sri Lanka Flag', 9999],
  ['mm', 'Myanmar Flag', 9999],
  ['th', 'Thailand Flag', 9999],
  ['vn', 'Vietnam Flag', 9999],
  ['my', 'Malaysia Flag', 9999],
  ['sg', 'Singapore Flag', 9999],
  ['ae', 'UAE Flag', 9999],
  ['sa', 'Saudi Flag', 9999],
  ['qa', 'Qatar Flag', 9999],
  ['eg', 'Egypt Flag', 9999],
  ['ng', 'Nigeria Flag', 9999],
  ['us', 'USA Flag', 9999],
  ['gb', 'UK Flag', 9999],
  ['cn', 'China Flag', 9999],
  ['jp', 'Japan Flag', 9999],
  ['kr', 'Korea Flag', 9999],
  ['br', 'Brazil Flag', 9999],
  ['tr', 'Turkey Flag', 9999],
  ['de', 'Germany Flag', 9999],
  ['fr', 'France Flag', 9999],
  ['ca', 'Canada Flag', 9999],
  ['au', 'Australia Flag', 9999],
  ['ru', 'Russia Flag', 9999],
  ['kh', 'Cambodia Flag', 9999],
];

const LUCKY_12 = [
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
];

const BCP_12 = [
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
];

(async () => {
  console.log('Seeding Flag, Lucky, and BCP gifts...');

  // 1. Seed Flags (category = standard)
  for (const [iso, name, coinCost] of FLAGS_30) {
    const imageUrl = `${base}/uploads/gifts/flags/flag_gift_${iso}.png`;
    const animationUrl = `${base}/uploads/gifts/flags/flag_fx_${iso}.webm`;
    const existing = await prisma.gift.findFirst({ where: { name } });
    if (existing) {
      await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost, category: 'standard', imageUrl, animationUrl, isActive: true },
      });
      console.log('Updated flag:', name);
    } else {
      await prisma.gift.create({
        data: { name, coinCost, category: 'standard', imageUrl, animationUrl, isActive: true },
      });
      console.log('Created flag:', name);
    }
  }

  // 2. Seed Lucky Gifts (category = lucky)
  for (const [key, name, coinCost] of LUCKY_12) {
    const imageUrl = `${base}/uploads/gifts/lucky/lucky_gift_${key}.png`;
    const animationUrl = `${base}/uploads/gifts/lucky/lucky_fx_${key}.webm`;
    const existing = await prisma.gift.findFirst({ where: { name } });
    if (existing) {
      await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost, category: 'lucky', imageUrl, animationUrl, isActive: true },
      });
      console.log('Updated lucky gift:', name);
    } else {
      await prisma.gift.create({
        data: { name, coinCost, category: 'lucky', imageUrl, animationUrl, isActive: true },
      });
      console.log('Created lucky gift:', name);
    }
  }

  // 3. Seed BCP Gifts (category = bcp)
  const bcpRel = await prisma.relationshipType.findFirst({ where: { code: 'bcp' } });
  for (const [key, name, coinCost] of BCP_12) {
    const imageUrl = `${base}/uploads/gifts/bcp/bcp_gift_${key}.png`;
    const animationUrl = `${base}/uploads/gifts/bcp/bcp_fx_${key}.webm`;
    const existing = await prisma.gift.findFirst({ where: { name } });
    let id;
    if (existing) {
      const u = await prisma.gift.update({
        where: { id: existing.id },
        data: { coinCost, category: 'bcp', imageUrl, animationUrl, isActive: true },
      });
      id = u.id;
      console.log('Updated bcp gift:', name);
    } else {
      const c = await prisma.gift.create({
        data: { name, coinCost, category: 'bcp', imageUrl, animationUrl, isActive: true },
      });
      id = c.id;
      console.log('Created bcp gift:', name);
    }

    if (bcpRel) {
      await prisma.relationshipGiftRule.upsert({
        where: {
          giftId_relationshipTypeId: { giftId: id, relationshipTypeId: bcpRel.id },
        },
        create: {
          giftId: id,
          relationshipTypeId: bcpRel.id,
          pointValue: coinCost,
          enabled: true,
        },
        update: { pointValue: coinCost, enabled: true },
      });
    }
  }

  const standardCount = await prisma.gift.count({ where: { category: 'standard', isActive: true } });
  const luckyCount = await prisma.gift.count({ where: { category: 'lucky', isActive: true } });
  const bcpCount = await prisma.gift.count({ where: { category: 'bcp', isActive: true } });
  console.log(`Summary: Standard: ${standardCount}, Lucky: ${luckyCount}, BCP: ${bcpCount}`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
