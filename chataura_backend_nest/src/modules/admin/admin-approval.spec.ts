import Fastify from 'fastify';
import { adminPath, redact } from './admin-approval';

describe('admin-approval', () => {
  it('matches only /admin routes, with or without prefix and query', () => {
    expect(adminPath('/api/v2/admin/gifts/5?x=1')).toBe('/admin/gifts/5');
    expect(adminPath('/api/v2/admin/svip/levels')).toBe('/admin/svip/levels');
    expect(adminPath('/admin/upload')).toBe('/admin/upload');
    expect(adminPath('/api/v2/rooms/1/admin-mute')).toBeNull();
    expect(adminPath('/api/v2/auth/login?next=/admin/x')).toBeNull();
    expect(adminPath('/api/v2/administrator')).toBeNull();
  });

  it('masks password-like fields at any depth', () => {
    expect(redact({ email: 'a', password: 'p', nested: [{ apiToken: 't', ok: 1 }] })).toEqual({
      email: 'a',
      password: '***',
      nested: [{ apiToken: '***', ok: 1 }],
    });
    expect(redact(null)).toBeNull();
  });

  it('an encoded URL still resolves to the admin route pattern', async () => {
    const app = Fastify();
    app.post('/api/v2/admin/x/:id', async (req) => ({ raw: adminPath(req.url), route: adminPath(req.routeOptions.url ?? '') }));
    const res = await app.inject({ method: 'POST', url: '/api/v2/%61dmin/x/5' });
    expect(res.json()).toEqual({ raw: null, route: '/admin/x/:id' });
  });
});
