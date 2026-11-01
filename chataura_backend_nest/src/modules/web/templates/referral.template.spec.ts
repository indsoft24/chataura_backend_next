import { renderReferralPage } from './referral.template';

describe('renderReferralPage', () => {
  it('embeds the code in the Play Store link as the install referrer', () => {
    const html = renderReferralPage('ab12cd34');
    expect(html).toContain('id=com.chataura.app&referrer=invite_code%3Dab12cd34');
    expect(html).toContain('market://details?id=com.chataura.app&referrer=invite_code%3Dab12cd34');
    expect(html).toContain('chataura://register?referral=ab12cd34');
  });

  it('strips markup from the code', () => {
    const html = renderReferralPage('x"><script>alert(1)</script>');
    expect(html).not.toContain('<script>alert');
  });

  it('has no referrer without a code', () => {
    expect(renderReferralPage(null)).not.toContain('referrer=');
  });
});
