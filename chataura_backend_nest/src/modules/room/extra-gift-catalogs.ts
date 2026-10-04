/**
 * Country-flag gifts (standard tab) + Lucky + BCP catalogs.
 * Thumbs/motion served from GCS gifts/v1 (see gifts-cdn.ts).
 */
import { PrismaClient } from '@prisma/client';
import { giftsCdnExtraUrl } from '../../common/gcs/gifts-cdn';
import {
  backfillMissingGiftKeys,
  buildGiftKey,
  isUniqueViolation,
} from '../../common/utils/gift-key';

type GiftDef = {
  key: string;
  name: string;
  coinCost: number;
  category: 'standard' | 'lucky' | 'bcp';
  /** Relative path under /uploads/ */
  imagePath: string;
  animationPath?: string | null;
  /** Temporary public CDN until Antigravity thumbs land */
  fallbackImageUrl?: string;
};

const FLAG_DEFS: Array<{ iso: string; name: string; coinCost: number }> = [
  { iso: 'in', name: 'India Flag', coinCost: 9_999 },
  { iso: 'bd', name: 'Bangladesh Flag', coinCost: 9_999 },
  { iso: 'pk', name: 'Pakistan Flag', coinCost: 9_999 },
  { iso: 'ph', name: 'Philippines Flag', coinCost: 9_999 },
  { iso: 'id', name: 'Indonesia Flag', coinCost: 9_999 },
  { iso: 'np', name: 'Nepal Flag', coinCost: 9_999 },
  { iso: 'lk', name: 'Sri Lanka Flag', coinCost: 9_999 },
  { iso: 'mm', name: 'Myanmar Flag', coinCost: 9_999 },
  { iso: 'th', name: 'Thailand Flag', coinCost: 9_999 },
  { iso: 'vn', name: 'Vietnam Flag', coinCost: 9_999 },
  { iso: 'my', name: 'Malaysia Flag', coinCost: 9_999 },
  { iso: 'sg', name: 'Singapore Flag', coinCost: 9_999 },
  { iso: 'ae', name: 'UAE Flag', coinCost: 9_999 },
  { iso: 'sa', name: 'Saudi Flag', coinCost: 9_999 },
  { iso: 'qa', name: 'Qatar Flag', coinCost: 9_999 },
  { iso: 'eg', name: 'Egypt Flag', coinCost: 9_999 },
  { iso: 'ng', name: 'Nigeria Flag', coinCost: 9_999 },
  { iso: 'us', name: 'USA Flag', coinCost: 9_999 },
  { iso: 'gb', name: 'UK Flag', coinCost: 9_999 },
  { iso: 'cn', name: 'China Flag', coinCost: 9_999 },
  { iso: 'jp', name: 'Japan Flag', coinCost: 9_999 },
  { iso: 'kr', name: 'Korea Flag', coinCost: 9_999 },
  { iso: 'br', name: 'Brazil Flag', coinCost: 9_999 },
  { iso: 'tr', name: 'Turkey Flag', coinCost: 9_999 },
  { iso: 'de', name: 'Germany Flag', coinCost: 9_999 },
  { iso: 'fr', name: 'France Flag', coinCost: 9_999 },
  { iso: 'ca', name: 'Canada Flag', coinCost: 9_999 },
  { iso: 'au', name: 'Australia Flag', coinCost: 9_999 },
  { iso: 'ru', name: 'Russia Flag', coinCost: 9_999 },
  { iso: 'kh', name: 'Cambodia Flag', coinCost: 9_999 },
];

export const COUNTRY_FLAG_GIFTS: GiftDef[] = FLAG_DEFS.map((f) => ({
  key: `flag_${f.iso}`,
  name: f.name,
  coinCost: f.coinCost,
  category: 'standard',
  imagePath: `gifts/flags/flag_gift_${f.iso}.png`,
  animationPath: `gifts/flags/flag_fx_${f.iso}.webm`,
  fallbackImageUrl: `https://flagcdn.com/w160/${f.iso}.png`,
}));

export const LUCKY_GIFTS: GiftDef[] = [
  { key: 'lucky_clover', name: 'Lucky Clover', coinCost: 19_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_lucky_clover.png', animationPath: 'gifts/lucky/lucky_fx_lucky_clover.webm' },
  { key: 'lucky_dice', name: 'Lucky Dice', coinCost: 29_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_lucky_dice.png', animationPath: 'gifts/lucky/lucky_fx_lucky_dice.webm' },
  { key: 'golden_slot', name: 'Golden Slot', coinCost: 49_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_golden_slot.png', animationPath: 'gifts/lucky/lucky_fx_golden_slot.webm' },
  { key: 'fortune_wheel', name: 'Fortune Wheel', coinCost: 59_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_fortune_wheel.png', animationPath: 'gifts/lucky/lucky_fx_fortune_wheel.webm' },
  { key: 'seven_stars', name: 'Seven Stars', coinCost: 79_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_seven_stars.png', animationPath: 'gifts/lucky/lucky_fx_seven_stars.webm' },
  { key: 'jackpot_box', name: 'Jackpot Box', coinCost: 99_999, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_jackpot_box.png', animationPath: 'gifts/lucky/lucky_fx_jackpot_box.webm' },
  { key: 'coin_rain', name: 'Coin Rain', coinCost: 120_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_coin_rain.png', animationPath: 'gifts/lucky/lucky_fx_coin_rain.webm' },
  { key: 'treasure_chest', name: 'Treasure Chest', coinCost: 150_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_treasure_chest.png', animationPath: 'gifts/lucky/lucky_fx_treasure_chest.webm' },
  { key: 'mystery_envelope', name: 'Mystery Envelope', coinCost: 180_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_mystery_envelope.png', animationPath: 'gifts/lucky/lucky_fx_mystery_envelope.webm' },
  { key: 'dragon_fortune', name: 'Dragon Fortune', coinCost: 250_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_dragon_fortune.png', animationPath: 'gifts/lucky/lucky_fx_dragon_fortune.webm' },
  { key: 'lucky_rocket', name: 'Lucky Rocket', coinCost: 300_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_lucky_rocket.png', animationPath: 'gifts/lucky/lucky_fx_lucky_rocket.webm' },
  { key: 'mega_jackpot', name: 'Mega Jackpot', coinCost: 500_000, category: 'lucky', imagePath: 'gifts/lucky/lucky_gift_mega_jackpot.png', animationPath: 'gifts/lucky/lucky_fx_mega_jackpot.webm' },
];

export const BCP_GIFTS: GiftDef[] = [
  { key: 'friend_star', name: 'Friend Star', coinCost: 79_999, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_friend_star.png', animationPath: 'gifts/bcp/bcp_fx_friend_star.webm' },
  { key: 'twin_stars', name: 'Twin Stars', coinCost: 99_999, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_twin_stars.png', animationPath: 'gifts/bcp/bcp_fx_twin_stars.webm' },
  { key: 'handshake_gold', name: 'Golden Handshake', coinCost: 120_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_handshake_gold.png', animationPath: 'gifts/bcp/bcp_fx_handshake_gold.webm' },
  { key: 'loyalty_badge', name: 'Loyalty Badge', coinCost: 150_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_loyalty_badge.png', animationPath: 'gifts/bcp/bcp_fx_loyalty_badge.webm' },
  { key: 'besties_crown', name: 'Besties Crown', coinCost: 200_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_besties_crown.png', animationPath: 'gifts/bcp/bcp_fx_besties_crown.webm' },
  { key: 'soul_sisters', name: 'Soul Sisters', coinCost: 250_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_soul_sisters.png', animationPath: 'gifts/bcp/bcp_fx_soul_sisters.webm' },
  { key: 'duo_trophy', name: 'Duo Trophy', coinCost: 300_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_duo_trophy.png', animationPath: 'gifts/bcp/bcp_fx_duo_trophy.webm' },
  { key: 'team_forever', name: 'Team Forever', coinCost: 400_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_team_forever.png', animationPath: 'gifts/bcp/bcp_fx_team_forever.webm' },
  { key: 'bcp_carousel', name: 'BCP Carousel', coinCost: 600_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_bcp_carousel.png', animationPath: 'gifts/bcp/bcp_fx_bcp_carousel.webm' },
  { key: 'bcp_voyage', name: 'BCP Voyage', coinCost: 800_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_bcp_voyage.png', animationPath: 'gifts/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'bcp_galaxy', name: 'BCP Galaxy', coinCost: 1_200_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_bcp_galaxy.png', animationPath: 'gifts/bcp/bcp_fx_bcp_galaxy.webm' },
  { key: 'eternal_bond', name: 'Eternal Bond', coinCost: 2_000_000, category: 'bcp', imagePath: 'gifts/bcp/bcp_gift_eternal_bond.png', animationPath: 'gifts/bcp/bcp_fx_eternal_bond.webm' },
];

export const CORE_STANDARD_GIFTS: GiftDef[] = [
  { key: 'dance', name: 'dance', coinCost: 11, category: 'standard', imagePath: 'gifts/standard/normal_gift_dance.webp' },
  { key: 'rose', name: 'Rose', coinCost: 10, category: 'standard', imagePath: 'gifts/standard/normal_gift_rose.webp' },
  { key: 'kiss', name: 'Kiss', coinCost: 20, category: 'standard', imagePath: 'gifts/standard/normal_gift_kiss.webp', animationPath: 'gifts/v1/cp/cp_fx_kiss_heart.webm' },
  { key: 'sweet_box', name: 'Sweet Box', coinCost: 30, category: 'standard', imagePath: 'gifts/standard/normal_gift_sweet_box.webp' },
  { key: 'heart', name: 'Heart', coinCost: 50, category: 'standard', imagePath: 'gifts/standard/normal_gift_heart.webp' },
  { key: 'love_letter', name: 'Love Letter', coinCost: 80, category: 'standard', imagePath: 'gifts/standard/normal_gift_love_letter.webp' },
  { key: 'diamond', name: 'Diamond', coinCost: 100, category: 'standard', imagePath: 'gifts/standard/normal_gift_diamond.webp' },
  { key: 'wish_star', name: 'Wish Star', coinCost: 150, category: 'standard', imagePath: 'gifts/standard/cp_gift_star_heart.webp' },
  { key: 'dance_2', name: 'dance 2', coinCost: 199, category: 'standard', imagePath: 'gifts/standard/normal_gift_dance_stage.webp' },
  { key: 'perfume', name: 'Perfume', coinCost: 200, category: 'standard', imagePath: 'gifts/standard/normal_gift_perfume.webp', animationPath: 'gifts/v1/cp/cp_fx_perfume.webm' },
  { key: 'love_box', name: 'Love box', coinCost: 300, category: 'standard', imagePath: 'gifts/standard/normal_gift_love_box.webp' },
  { key: 'teddy_bear', name: 'Teddy Bear', coinCost: 300, category: 'standard', imagePath: 'gifts/standard/normal_gift_teddy.webp' },
  { key: 'crown', name: 'Crown', coinCost: 500, category: 'standard', imagePath: 'gifts/standard/normal_gift_crown.webp' },
  { key: 'champagne', name: 'Champagne', coinCost: 800, category: 'standard', imagePath: 'gifts/standard/normal_gift_champagne.webp', animationPath: 'gifts/v1/cp/cp_fx_champagne.webm' },
  { key: 'magic_ring', name: 'Magic Ring', coinCost: 1000, category: 'standard', imagePath: 'gifts/standard/normal_gift_ring.webp', animationPath: 'gifts/v1/cp/cp_fx_ring.webm' },
  { key: 'sports_car', name: 'Sports Car', coinCost: 5000, category: 'standard', imagePath: 'gifts/standard/cp_gift_love_car.webp', animationPath: 'gifts/v1/cp/cp_fx_love_car.webm' },
  { key: 'velvet_box', name: 'Velvet Box', coinCost: 8000, category: 'standard', imagePath: 'gifts/standard/normal_gift_love_box.webp' },
  { key: 'cupid_bow', name: 'Cupid Bow', coinCost: 10000, category: 'standard', imagePath: 'gifts/standard/cp_gift_cupid.webp', animationPath: 'gifts/v1/cp/cp_fx_cupid.webm' },
  { key: 'moonlight', name: 'Moonlight', coinCost: 15000, category: 'standard', imagePath: 'gifts/standard/cp_gift_moon_heart.webp', animationPath: 'gifts/v1/cp/cp_fx_moon_heart.webm' },
  { key: 'soul_swans', name: 'Soul Swans', coinCost: 20000, category: 'standard', imagePath: 'gifts/standard/cp_gift_swans.webp', animationPath: 'gifts/v1/cp/cp_fx_swans.webm' },
  { key: 'luxury_yacht', name: 'Luxury Yacht', coinCost: 30000, category: 'standard', imagePath: 'gifts/standard/bcp_gift_bcp_voyage.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'besties_crown', name: 'Besties Crown', coinCost: 50000, category: 'standard', imagePath: 'gifts/standard/bcp_gift_besties_crown.webp', animationPath: 'gifts/v1/bcp/bcp_fx_besties_crown.webm' },
  { key: 'fireworks', name: 'Fireworks', coinCost: 80000, category: 'standard', imagePath: 'gifts/standard/bcp_gift_bcp_galaxy.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_galaxy.webm' },
  { key: 'dragon_fortune', name: 'Dragon Fortune', coinCost: 100000, category: 'standard', imagePath: 'gifts/standard/normal_gift_dragon.webp', animationPath: 'gifts/v1/lucky/lucky_fx_dragon_fortune.webm' },
  { key: 'golden_slot', name: 'Golden Slot', coinCost: 150000, category: 'standard', imagePath: 'gifts/standard/lucky_gift_golden_slot.webp', animationPath: 'gifts/v1/lucky/lucky_fx_golden_slot.webm' },
  { key: 'mega_jackpot', name: 'Mega Jackpot', coinCost: 200000, category: 'standard', imagePath: 'gifts/standard/lucky_gift_mega_jackpot.webp', animationPath: 'gifts/v1/lucky/lucky_fx_mega_jackpot.webm' },
  { key: 'power_ring', name: 'Power Ring', coinCost: 15000, category: 'standard', imagePath: 'gifts/standard/normal_gift_power_ring.webp' },
  { key: 'good_friend', name: 'Good Friend', coinCost: 36000, category: 'standard', imagePath: 'gifts/standard/bcp_gift_handshake_gold.webp', animationPath: 'gifts/v1/bcp/bcp_fx_handshake_gold.webm' },
  { key: 'love_perfume', name: 'Love Perfume', coinCost: 60000, category: 'standard', imagePath: 'gifts/standard/cp_gift_perfume.webp', animationPath: 'gifts/v1/cp/cp_fx_perfume.webm' },
  { key: 'luxury_belt', name: 'Luxury Belt', coinCost: 120000, category: 'standard', imagePath: 'gifts/standard/normal_gift_luxury_belt.webp' },
  { key: 'luxury_perfume', name: 'Luxury Perfume', coinCost: 120000, category: 'standard', imagePath: 'gifts/standard/cp_gift_perfume.webp', animationPath: 'gifts/v1/cp/cp_fx_perfume.webm' },
  { key: 'luxury_bag', name: 'Luxury Bag', coinCost: 200000, category: 'standard', imagePath: 'gifts/standard/normal_gift_luxury_bag.webp' },
  { key: 'rocket_std', name: 'Rocket', coinCost: 200000, category: 'standard', imagePath: 'gifts/standard/lucky_gift_lucky_rocket.webp', animationPath: 'gifts/v1/lucky/lucky_fx_lucky_rocket.webm' },
  { key: 'kiss_kiss', name: 'Kiss kiss', coinCost: 300000, category: 'standard', imagePath: 'gifts/standard/normal_gift_kiss.webp', animationPath: 'gifts/v1/cp/cp_fx_kiss_heart.webm' },
  { key: 'luxury_watch', name: 'Luxury Watch', coinCost: 400000, category: 'standard', imagePath: 'gifts/standard/normal_gift_luxury_watch.webp' },
  { key: 'rich_tiger', name: 'Rich Tiger', coinCost: 400000, category: 'standard', imagePath: 'gifts/standard/lucky_gift_dragon_fortune.webp', animationPath: 'gifts/v1/lucky/lucky_fx_dragon_fortune.webm' },
  { key: 'fountain', name: 'Fountain', coinCost: 500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_fountain.webp', animationPath: 'gifts/v1/lucky/lucky_fx_coin_rain.webm' },
  { key: 'wedding_hall', name: 'Wedding Hall', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/normal_gift_wedding_hall.webp', animationPath: 'gifts/v1/cp/cp_fx_wedding_hall.webm' },
  { key: 'brilliant_fireworks', name: 'Brilliant Fireworks', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/normal_gift_galaxy_fireworks.webp', animationPath: 'gifts/v1/cp/cp_fx_galaxy_fireworks.webm' },
  { key: 'bear_bouquet', name: 'Bear Bouquet', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/normal_gift_teddy_love.webp', animationPath: 'gifts/v1/cp/cp_fx_bear_bouquet.webm' },
  { key: 'love_carousel', name: 'Love Carousel', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/cp_gift_love_carousel.webp', animationPath: 'gifts/v1/cp/cp_fx_love_carousel.webm' },
  { key: 'teddy_love', name: 'Teddy Love', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/normal_gift_teddy_love.webp', animationPath: 'gifts/v1/cp/cp_fx_bear_bouquet.webm' },
  { key: 'super_rich', name: 'Super Rich', coinCost: 600000, category: 'standard', imagePath: 'gifts/standard/normal_gift_rolls_royce.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'galaxy_fireworks', name: 'Galaxy Fireworks', coinCost: 800000, category: 'standard', imagePath: 'gifts/standard/normal_gift_galaxy_fireworks.webp', animationPath: 'gifts/v1/cp/cp_fx_galaxy_fireworks.webm' },
  { key: 'alpaca_love', name: 'Alpaca Love', coinCost: 900000, category: 'standard', imagePath: 'gifts/standard/normal_gift_alpaca.webp' },
  { key: 'alpaca', name: 'Alpaca', coinCost: 960000, category: 'standard', imagePath: 'gifts/standard/normal_gift_alpaca.webp' },
  { key: 'rolls_royce', name: 'Rolls-Royce', coinCost: 960000, category: 'standard', imagePath: 'gifts/standard/normal_gift_rolls_royce.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'wedding_std', name: 'Wedding', coinCost: 120000, category: 'standard', imagePath: 'gifts/standard/cp_gift_wedding.webp', animationPath: 'gifts/v1/cp/cp_fx_wedding.webm' },
  { key: 'sweet_cake', name: 'Sweet Cake', coinCost: 1200000, category: 'standard', imagePath: 'gifts/standard/cp_gift_chocolate.webp' },
  { key: 'yacht_party', name: 'Yacht Party', coinCost: 1200000, category: 'standard', imagePath: 'gifts/standard/bcp_gift_bcp_voyage.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'mysterious_car', name: 'Mysterious Car', coinCost: 1500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_mysterious_car.webp', animationPath: 'gifts/v1/bcp/bcp_fx_bcp_voyage.webm' },
  { key: 'dj_cat', name: 'DJ Cat', coinCost: 1500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_dance_cat.webp' },
  { key: 'flower_yacht', name: 'Flower Yacht', coinCost: 1500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_love_yacht.webp', animationPath: 'gifts/v1/cp/cp_fx_flower_yacht.webm' },
  { key: 'love_yacht', name: 'Love Yacht', coinCost: 1800000, category: 'standard', imagePath: 'gifts/standard/normal_gift_love_yacht.webp', animationPath: 'gifts/v1/cp/cp_fx_flower_yacht.webm' },
  { key: 'pink_rose_cp', name: 'Pink Rose CP', coinCost: 2000000, category: 'standard', imagePath: 'gifts/standard/normal_gift_pink_rose_cp.webp', animationPath: 'gifts/v1/cp/cp_fx_rose_love.webm' },
  { key: 'rose_stairs', name: 'Rose Stairs', coinCost: 2000000, category: 'standard', imagePath: 'gifts/standard/normal_gift_rose_stairs.webp', animationPath: 'gifts/v1/cp/cp_fx_rose_love_vip.webm' },
  { key: 'forever_love', name: 'Forever Love', coinCost: 2400000, category: 'standard', imagePath: 'gifts/standard/cp_gift_forever_love.webp', animationPath: 'gifts/v1/cp/cp_fx_forever_love.webm' },
  { key: 'rose_ball', name: 'Rose Ball', coinCost: 2400000, category: 'standard', imagePath: 'gifts/standard/normal_gift_rose_ball.webp', animationPath: 'gifts/v1/cp/cp_fx_waltz.webm' },
  { key: 'dance_cat', name: 'Dance Cat', coinCost: 2400000, category: 'standard', imagePath: 'gifts/standard/normal_gift_dance_cat.webp' },
  { key: 'waltz_std', name: 'Waltz', coinCost: 2400000, category: 'standard', imagePath: 'gifts/standard/cp_gift_waltz.webp', animationPath: 'gifts/v1/cp/cp_fx_waltz.webm' },
  { key: 'love_melody', name: 'Love Melody', coinCost: 2500000, category: 'standard', imagePath: 'gifts/standard/cp_gift_melody.webp', animationPath: 'gifts/v1/cp/cp_fx_melody.webm' },
  { key: 'lion', name: 'Lion', coinCost: 2500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_lion.webp' },
  { key: 'wealth_queen', name: 'Wealth Queen', coinCost: 2500000, category: 'standard', imagePath: 'gifts/standard/normal_gift_wealth_queen.webp', animationPath: 'gifts/v1/bcp/bcp_fx_besties_crown.webm' },
  { key: 'lion_king', name: 'Lion King', coinCost: 3000000, category: 'standard', imagePath: 'gifts/standard/normal_gift_lion_king.webp' },
  { key: 'lion_guardian', name: 'Lion Guardian', coinCost: 5000000, category: 'standard', imagePath: 'gifts/standard/normal_gift_lion_guardian.webp' },
  { key: 'temple_throne', name: 'Temple Throne', coinCost: 6000000, category: 'standard', imagePath: 'gifts/standard/normal_gift_temple.webp' },
];

function absUrl(_publicBase: string, path: string): string {
  return giftsCdnExtraUrl(path);
}

type PrismaLike = Pick<PrismaClient, 'gift' | 'relationshipType' | 'relationshipGiftRule'>;

/**
 * Seed-only: creates catalog gifts that do not exist yet. Existing rows are
 * NEVER modified — price, media, category and is_active are owned by the admin
 * panel once the row exists. Matching is by stable gift_key, then by
 * (name, category) for rows that pre-date gift_key.
 */
async function upsertGiftCatalog(
  prisma: PrismaLike,
  publicBase: string,
  defs: GiftDef[],
): Promise<void> {
  const existing = await prisma.gift.findMany({
    select: { name: true, category: true, giftKey: true },
  });
  const haveKeys = new Set(existing.map((g) => g.giftKey).filter(Boolean));
  const haveNameCat = new Set(
    existing.map((g) => `${g.category}\u0000${g.name}`),
  );
  for (const g of defs) {
    const giftKey = buildGiftKey(g.category, g.name);
    if (haveKeys.has(giftKey)) continue;
    if (haveNameCat.has(`${g.category}\u0000${g.name}`)) continue;
    try {
      await prisma.gift.create({
        data: {
          giftKey,
          name: g.name,
          coinCost: g.coinCost,
          category: g.category,
          imageUrl: absUrl(publicBase, g.imagePath),
          animationUrl: g.animationPath
            ? absUrl(publicBase, g.animationPath)
            : null,
          isActive: true,
        },
      });
    } catch (err) {
      // Another request created it concurrently — fine.
      if (!isUniqueViolation(err)) throw err;
    }
    haveKeys.add(giftKey);
    haveNameCat.add(`${g.category}\u0000${g.name}`);
  }
}

/** Idempotent seed for flags + lucky/bcp rows; link BCP gifts to relationship type. */
export async function ensureExtraGiftCatalogs(
  prisma: PrismaLike,
  publicBase: string,
): Promise<void> {
  await backfillMissingGiftKeys(prisma);
  await upsertGiftCatalog(prisma, publicBase, COUNTRY_FLAG_GIFTS);
  await upsertGiftCatalog(prisma, publicBase, LUCKY_GIFTS);
  await upsertGiftCatalog(prisma, publicBase, BCP_GIFTS);
  await upsertGiftCatalog(prisma, publicBase, CORE_STANDARD_GIFTS);

  // Soft-deactivate placeholder BCP1 if real BCP catalog is present
  await prisma.gift.updateMany({
    where: { category: 'bcp', name: 'BCP1' },
    data: { isActive: false },
  });

  const bcpType = await prisma.relationshipType.findFirst({
    where: { code: 'bcp' },
  });
  if (!bcpType) return;

  const bcpNames = BCP_GIFTS.map((g) => g.name);
  const bcpGifts = await prisma.gift.findMany({
    where: { isActive: true, category: 'bcp', name: { in: bcpNames } },
  });
  for (const gift of bcpGifts) {
    await prisma.relationshipGiftRule.upsert({
      where: {
        giftId_relationshipTypeId: {
          giftId: gift.id,
          relationshipTypeId: bcpType.id,
        },
      },
      create: {
        giftId: gift.id,
        relationshipTypeId: bcpType.id,
        pointValue: gift.coinCost,
        enabled: true,
      },
      update: { enabled: true, pointValue: gift.coinCost },
    });
  }
}
