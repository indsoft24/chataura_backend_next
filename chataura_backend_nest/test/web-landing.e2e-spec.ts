import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './e2e.helpers';

describe('Web Landing & Legal Pages (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / serves the complete Chat Aura landing page HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Chat Aura — Voice, Video');
    expect(res.payload).toContain('Download on Google Play');
    expect(res.payload).toContain('Live Voice Party');
    expect(res.payload).toContain('Privacy Policy');
    expect(res.payload).toContain('Terms &amp; Conditions');
    expect(res.payload).toContain('Child Safety');
    expect(res.payload).toContain('Delete Account');
  });

  it('GET /privacy-policy serves the Privacy Policy HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/privacy-policy' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Privacy Policy – Chat Aura');
    expect(res.payload).toContain('Information We Collect');
  });

  it('GET /terms-and-conditions serves Terms and Conditions HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/terms-and-conditions' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Terms & Conditions – Chat Aura');
    expect(res.payload).toContain('Eligibility & User Accounts');
  });

  it('GET /delete-account serves Delete Account instructions HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/delete-account' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Delete Your Account – Chat Aura');
    expect(res.payload).toContain('How to Delete Your Account In-App');
  });

  it('GET /child-safety serves Child Safety Standards HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/child-safety' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Child Safety Standards – Chat Aura');
    expect(res.payload).toContain('Strictly Prohibited Content & Behavior');
    expect(res.payload).toContain('chataura05@gmail.com');
  });

  it('GET /invite/:code serves the referral landing page with deep link', async () => {
    const res = await app.inject({ method: 'GET', url: '/invite/VIP777' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('VIP777');
    expect(res.payload).toContain('chataura://referral?code=VIP777');
    expect(res.payload).toContain('Open in Chat Aura App');
  });

  it('GET /.well-known/assetlinks.json returns valid Android App Links JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const links = JSON.parse(res.payload);
    expect(Array.isArray(links)).toBe(true);
    expect(links[0].target.package_name).toBe('com.chataura.app');
  });

  it('GET /app-ads.txt returns valid AdMob verification string', async () => {
    const res = await app.inject({ method: 'GET', url: '/app-ads.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.payload).toContain('pub-2860578009648608');
  });

  it('GET /robots.txt returns valid robots instructions', async () => {
    const res = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.payload).toContain('Allow: /');
  });
});
