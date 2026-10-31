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
});
