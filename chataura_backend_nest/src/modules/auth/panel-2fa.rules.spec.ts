import { cookieValue, hashCode, hashToken, maskEmail, newToken, otpRecipients, sameHash } from './panel-2fa.rules';

describe('panel 2fa rules', () => {
  it('sends the superadmin code to every configured address, staff to their own', () => {
    expect(otpRecipients(true, 'x@y.com', 'a@x.com, B@x.com,a@x.com')).toEqual(['a@x.com', 'b@x.com']);
    expect(otpRecipients(true, null, undefined)).toEqual(['chataura05@gmail.com', 'indsoft24@gmail.com']);
    expect(otpRecipients(false, 'Staff@x.com', 'a@x.com')).toEqual(['staff@x.com']);
    expect(otpRecipients(false, null, undefined)).toEqual([]);
  });

  it('binds a code to its challenge', () => {
    const h = hashCode('s', 'c1', '123456');
    expect(sameHash(h, hashCode('s', 'c1', '123456'))).toBe(true);
    expect(sameHash(h, hashCode('s', 'c2', '123456'))).toBe(false);
    expect(sameHash(h, hashCode('s', 'c1', '123457'))).toBe(false);
    expect(sameHash(h, 'zz')).toBe(false);
  });

  it('hashes trusted tokens and reads the cookie', () => {
    const t = newToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toBe(t);
    expect(cookieValue('a=1; ca_td=abc; b=2', 'ca_td')).toBe('abc');
    expect(cookieValue('xca_td=abc', 'ca_td')).toBeNull();
    expect(cookieValue(undefined, 'ca_td')).toBeNull();
  });

  it('masks addresses', () => {
    expect(maskEmail('chataura05@gmail.com')).toBe('ch***@gmail.com');
  });
});
