import { assetPublicBase, r2Configured, toCdnUrl } from './asset-store';

describe('asset store switch', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('does nothing while ASSET_PUBLIC_BASE is unset', () => {
    delete process.env.ASSET_PUBLIC_BASE;
    expect(assetPublicBase()).toBe('');
    expect(toCdnUrl('https://storage.googleapis.com/chataura/svip/v1/a.webp')).toBe('https://storage.googleapis.com/chataura/svip/v1/a.webp');
    expect(r2Configured()).toBe(false);
  });
  it('rewrites old bucket links to the CDN host, keeping the object path', () => {
    process.env.ASSET_PUBLIC_BASE = 'https://cdn.chataura.in/';
    expect(toCdnUrl('https://storage.googleapis.com/chataura/svip/v1/a.webp')).toBe('https://cdn.chataura.in/svip/v1/a.webp');
    expect(toCdnUrl('https://chataura.in/uploads/x.png')).toBe('https://chataura.in/uploads/x.png');
    expect(toCdnUrl('https://storage.googleapis.com/onlybucket')).toBe('https://storage.googleapis.com/onlybucket');
  });
  it('needs the base and all four R2 values to upload to R2', () => {
    process.env.ASSET_PUBLIC_BASE = 'https://cdn.chataura.in';
    Object.assign(process.env, { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' });
    expect(r2Configured()).toBe(false);
    process.env.R2_BUCKET = 'd';
    expect(r2Configured()).toBe(true);
  });
});
