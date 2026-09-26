/**
 * Country-flag gifts (standard tab) + Lucky + BCP catalogs.
 * Thumbs/motion served from Nest uploads — not bundled in the APK.
 */
import { PrismaClient } from '@prisma/client';

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

function absUrl(publicBase: string, path: string): string {
  const base = publicBase.replace(/\/+$/, '');
  return `${base}/uploads/${path.replace(/^\/+/, '')}`;
}

type PrismaLike = Pick<PrismaClient, 'gift'>;

async function upsertGiftCatalog(
  prisma: PrismaLike,
  publicBase: string,
  defs: GiftDef[],
): Promise<void> {
  for (const g of defs) {
    // Prefer Nest CDN thumbs (Antigravity pack). flagcdn only if CDN path missing later.
    const imageUrl = absUrl(publicBase, g.imagePath);
    const animationUrl = g.animationPath
      ? absUrl(publicBase, g.animationPath)
      : null;
    const existing = await prisma.gift.findFirst({
      where: { name: g.name, category: g.category },
    });
    if (existing) {
      await prisma.gift.update({
        where: { id: existing.id },
        data: {
          coinCost: g.coinCost,
          imageUrl,
          animationUrl,
          isActive: true,
          category: g.category,
        },
      });
    } else {
      await prisma.gift.create({
        data: {
          name: g.name,
          coinCost: g.coinCost,
          category: g.category,
          imageUrl,
          animationUrl,
          isActive: true,
        },
      });
    }
  }
}

/** Idempotent seed for flags (live now via flagcdn) + lucky/bcp rows (FX after Antigravity). */
export async function ensureExtraGiftCatalogs(
  prisma: PrismaLike,
  publicBase: string,
): Promise<void> {
  await upsertGiftCatalog(prisma, publicBase, COUNTRY_FLAG_GIFTS);
  await upsertGiftCatalog(prisma, publicBase, LUCKY_GIFTS);
  await upsertGiftCatalog(prisma, publicBase, BCP_GIFTS);

  // Soft-deactivate placeholder BCP1 if real BCP catalog is present
  await prisma.gift.updateMany({
    where: { category: 'bcp', name: 'BCP1' },
    data: { isActive: false },
  });
}
