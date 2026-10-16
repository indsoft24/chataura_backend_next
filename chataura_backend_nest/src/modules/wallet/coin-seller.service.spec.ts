import { BadRequestException } from '@nestjs/common';
import { CoinSellerService } from './coin-seller.service';

function setup(viewer: { role: string; country: string | null; lastClientCountry: string | null } | null) {
  const findMany = jest.fn().mockResolvedValue([
    {
      id: 3n,
      userId: 9n,
      whatsappE164: '919876543210',
      user: {
        displayId: '100009',
        name: 'raj',
        displayName: 'Raj Coins',
        avatarUrl: 'https://x/a.png',
        isOnline: true,
        lastSeenAt: new Date(),
        showOnlineStatus: true,
      },
    },
  ]);
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(viewer) },
    adminSetting: { findUnique: jest.fn().mockResolvedValue({ extraSettings: {} }) },
    coinSellerContact: { findMany },
  };
  return { service: new CoinSellerService(prisma as never), findMany, prisma };
}

describe('CoinSellerService.listForViewer', () => {
  it('filters by app country first and only returns live sellers', async () => {
    const { service, findMany } = setup({ role: 'user', country: 'IN', lastClientCountry: 'bd' });
    const res = await service.listForViewer(1n);
    const where = findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.userId).toEqual({ not: 1n });
    expect(where.user).toMatchObject({ role: 'seller', deletedAt: null, accountStatus: 'active', isSuspended: false });
    expect(where.OR).toEqual([{ countries: { isEmpty: true } }, { countries: { has: 'BD' } }]);
    expect(res.sellers[0]).toEqual({
      id: 3,
      user_id: 9,
      display_id: '100009',
      name: 'Raj Coins',
      avatar_url: 'https://x/a.png',
      is_online: true,
      whatsapp: '919876543210',
    });
    expect(res.template).toContain('{userId}');
  });

  it('shows all sellers when the viewer country is unknown', async () => {
    const { service, findMany } = setup({ role: 'user', country: null, lastClientCountry: null });
    await service.listForViewer(1n);
    expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('returns no sellers to a coin seller', async () => {
    const { service, findMany } = setup({ role: 'seller', country: 'IN', lastClientCountry: null });
    expect((await service.listForViewer(1n)).sellers).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('CoinSellerService.adminCreate', () => {
  it('rejects bad numbers and non-sellers', async () => {
    const { service, prisma } = setup(null);
    await expect(service.adminCreate({ user_id: 9, whatsapp: '98765' })).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findUnique.mockResolvedValue({ role: 'user', deletedAt: null });
    await expect(service.adminCreate({ user_id: 9, whatsapp: '+919876543210' })).rejects.toThrow(/not a coin seller/);
  });
});
