import {
  DEFAULT_COIN_SELLER_TEMPLATE,
  isWholesaleAudience,
  normalizeCountries,
  normalizeWhatsappNumber,
  readCoinSellerTemplate,
  splitPackagesForViewer,
} from './coin-seller.rules';

describe('normalizeWhatsappNumber', () => {
  it.each([
    ['+91 98765 43210', '919876543210'],
    ['+91 098765-43210', '919876543210'],
    ['0091 9876543210', '919876543210'],
    ['+880 01712-345678', '8801712345678'],
    ['+8801712345678', '8801712345678'],
    ['+971 50 123 4567', '971501234567'],
    ['+971 050 123 4567', '971501234567'],
    ['+971 4 123 4567', '97141234567'],
    ['+1 (415) 555-2671', '14155552671'],
    ['+44 7911 123456', '447911123456'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toBe(expected);
  });

  it.each([
    '9876543210', // no country code
    '+91 12345 67890', // Indian mobiles start 6-9
    '+91 98765 4321', // too short
    '+880 2712 345678', // BD mobile must start with 1
    '+971 50 123 45678', // too long
    '+12345', // too short overall
    '+91 98765 43210 ext 2',
    '+91+9876543210',
    '',
    null,
  ])('rejects %p', (input) => {
    expect(() => normalizeWhatsappNumber(input)).toThrow();
  });
});

describe('normalizeCountries', () => {
  it('upper-cases, de-dupes and drops junk', () => {
    expect(normalizeCountries(['in', ' BD', 'in', 'x', '1'])).toEqual(['IN', 'BD']);
    expect(normalizeCountries('in,ae')).toEqual(['IN', 'AE']);
  });
  it('ALL or empty means every country', () => {
    expect(normalizeCountries(['IN', 'ALL'])).toEqual([]);
    expect(normalizeCountries(undefined)).toEqual([]);
  });
});

describe('readCoinSellerTemplate', () => {
  it('falls back to the default when unset or blank', () => {
    expect(readCoinSellerTemplate(null)).toBe(DEFAULT_COIN_SELLER_TEMPLATE);
    expect(readCoinSellerTemplate({ coin_seller_message_template: '  ' })).toBe(
      DEFAULT_COIN_SELLER_TEMPLATE,
    );
    expect(readCoinSellerTemplate({ coin_seller_message_template: 'Hi {userId}' })).toBe('Hi {userId}');
  });
});

describe('splitPackagesForViewer', () => {
  const pkgs = [
    { id: 1, audience: 'user' },
    { id: 2, audience: 'coin_seller' },
    { id: 3, audience: 'Reseller' },
  ];

  it('user sees retail only, never wholesale', () => {
    const r = splitPackagesForViewer(pkgs, 'user');
    expect(r.viewer).toBe('user');
    expect(r.packages.map((p) => p.id)).toEqual([1]);
    expect(r.sellerPackages).toEqual([]);
  });

  it.each(['admin', 'agency', null, undefined])('%s gets no wholesale', (role) => {
    expect(splitPackagesForViewer(pkgs, role).sellerPackages).toEqual([]);
  });

  it('seller sees retail plus wholesale', () => {
    const r = splitPackagesForViewer(pkgs, 'seller');
    expect(r.viewer).toBe('coin_seller');
    expect(r.packages.map((p) => p.id)).toEqual([1]);
    expect(r.sellerPackages.map((p) => p.id)).toEqual([2, 3]);
  });

  it('isWholesaleAudience', () => {
    expect(isWholesaleAudience('coin_seller')).toBe(true);
    expect(isWholesaleAudience('user')).toBe(false);
    expect(isWholesaleAudience(null)).toBe(false);
  });
});
