/** 1–100 whole gifts; junk (NaN, fractions, strings) falls back instead of breaking BigInt math. */
export function giftQuantity(raw: unknown): number {
  const n = Math.floor(Number(raw ?? 1));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 1;
}
