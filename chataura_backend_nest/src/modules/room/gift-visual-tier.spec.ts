import { resolveGiftVisualTier } from './gift-broadcast.service';

// Must stay in sync with GiftAnimationManager.VisualTier.resolve on Android.
describe('resolveGiftVisualTier', () => {
  it('tiers by coins for one recipient', () => {
    expect(resolveGiftVisualTier(499, 1)).toBe('LOW');
    expect(resolveGiftVisualTier(500, 1)).toBe('MEDIUM');
    expect(resolveGiftVisualTier(3_000, 1)).toBe('HIGH');
    expect(resolveGiftVisualTier(15_000, 1)).toBe('ULTRA');
  });

  it('tiers by quantity', () => {
    expect(resolveGiftVisualTier(10, 5)).toBe('MEDIUM');
    expect(resolveGiftVisualTier(10, 10)).toBe('HIGH');
    expect(resolveGiftVisualTier(10, 50)).toBe('ULTRA');
  });
});
