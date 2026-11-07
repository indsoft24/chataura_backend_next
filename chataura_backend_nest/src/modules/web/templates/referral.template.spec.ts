import { renderReferralPage } from './referral.template';

describe('renderReferralPage', () => {
  it('direct APK mode: tracked download link, clipboard hand-off, no Play redirect', () => {
    const html = renderReferralPage('ab12', 'https://x.in', 'https://play/x', true);
    expect(html).toContain('/apk/ChatAura.apk?c=ab12');
    expect(html).toContain('chataura-invite:ab12');
    expect(html).not.toContain('Download on Google Play');
    expect(html).toContain('var hasApk = true');
  });
  it('without an APK it keeps the Play Store flow', () => {
    const html = renderReferralPage('ab12', 'https://x.in', 'https://play/x', false);
    expect(html).toContain('Download on Google Play');
    expect(html).not.toContain('id="apk-btn"');
  });
});
