import { belowLuckyMin, luckyMinCoins, readLuckyMinCoins } from './lucky-gift-min';

describe('lucky gift minimum', () => {
  it('defaults to 2000 and is clamped', () => {
    expect(readLuckyMinCoins(null)).toBe(2000);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: 5000 })).toBe(5000);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: '750' })).toBe(750);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: 0 })).toBe(0);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: -5 })).toBe(0);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: 'abc' })).toBe(2000);
    expect(readLuckyMinCoins({ lucky_gift_min_coins: 1e15 })).toBe(100_000_000);
  });

  it('only lucky gifts below the floor are off sale', () => {
    expect(belowLuckyMin({ category: 'lucky', coinCost: 1999 }, 2000)).toBe(true);
    expect(belowLuckyMin({ category: 'lucky', coinCost: 2000 }, 2000)).toBe(false);
    expect(belowLuckyMin({ category: 'standard', coinCost: 10 }, 2000)).toBe(false);
    expect(belowLuckyMin({ category: 'LUCKY', coinCost: 10 }, 0)).toBe(false);
  });

  it('reads the live setting; a db without settings has no floor', async () => {
    const db = { adminSetting: { findUnique: async () => ({ extraSettings: { lucky_gift_min_coins: 3000 } }) } };
    expect(await luckyMinCoins(db as never)).toBe(3000);
    expect(await luckyMinCoins({} as never)).toBe(0);
  });
});
