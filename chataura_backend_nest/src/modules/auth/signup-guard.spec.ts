import { isDisposableEmail, SIGNUPS_PER_IP_PER_DAY } from './signup-guard';

describe('signup guard', () => {
  it('blocks throwaway mail domains, also sub-domains and any letter case', () => {
    expect(isDisposableEmail('mivelek719@dvdee.com')).toBe(true);
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@a.b.mailinator.com')).toBe(true);
    expect(isDisposableEmail('X@DVDEE.COM')).toBe(true);
  });
  it('lets real providers through', () => {
    for (const e of ['a@gmail.com', 'a@yahoo.com', 'a@outlook.com', 'a@chataura.in', 'a@icloud.com']) expect(isDisposableEmail(e)).toBe(false);
  });
  it('daily cap per IP is positive', () => expect(SIGNUPS_PER_IP_PER_DAY).toBeGreaterThan(0));
});
