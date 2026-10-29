import { ForbiddenException } from '@nestjs/common';

// The controller's service deps pull in ESM-only packages; the tests pass stubs anyway.
jest.mock('../media/media.service', () => ({ MediaService: class {} }));
jest.mock('../room/rocket-launch.service', () => ({ RocketLaunchService: class {} }));
jest.mock('../fx-assets/fx-assets.service', () => ({ FxAssetsService: class {} }));
jest.mock('../room/room-reward/room-reward-admin.service', () => ({ RoomRewardAdminService: class {} }));
jest.mock('./admin-catalog.service', () => ({ AdminCatalogService: class {} }));
jest.mock('./admin-recharge.service', () => ({ AdminRechargeService: class {} }));
jest.mock('./admin.service', () => ({ AdminService: class {} }));
jest.mock('../wallet/coin-seller.service', () => ({ CoinSellerService: class {} }));

import { AdminController } from './admin.controller';
import { MIN_TIER_KEY } from '../../common/decorators/min-tier.decorator';

/** The tier each route needs (undefined = any staff). Pins the access table the staff panel mirrors. */
const tierOf = (method: keyof AdminController) =>
  Reflect.getMetadata(MIN_TIER_KEY, AdminController.prototype[method] as object);

const staff = (id: number, badge: string) => ({ id: BigInt(id), role: 'admin', staffBadgeType: badge }) as any;

describe('AdminController access table', () => {
  it('gates routes by tier', () => {
    expect(tierOf('users')).toBeUndefined();
    expect(tierOf('suspend')).toBeUndefined();
    expect(tierOf('moderationReports')).toBeUndefined();
    expect(tierOf('gifts')).toBe('manager');
    expect(tierOf('createGift')).toBe('manager');
    expect(tierOf('link')).toBe('manager');
    expect(tierOf('staff')).toBe('manager');
    expect(tierOf('saveRockitLevels')).toBe('manager');
    expect(tierOf('dashboard')).toBe('ceo');
    expect(tierOf('adjustBalance')).toBe('ceo');
    expect(tierOf('packages')).toBe('ceo');
    expect(tierOf('settings')).toBe('ceo');
    expect(tierOf('updateSettings')).toBe('ceo');
  });

  const catalog = {
    settings: jest.fn(async () => ({ settings: { spin_cost: 50, gift_commission_pct: 20, min_withdrawal: 100 } })),
    updateSettings: jest.fn(async () => ({ ok: true })),
  };
  const admin = { adjustBalance: jest.fn(async () => ({ ok: true })) };
  const ctrl = new AdminController(admin as any, catalog as any, ...([null, null, null, null, null, null] as [any, any, any, any, any, any]));

  it('shows a CEO only the CEO settings keys', async () => {
    expect(await ctrl.settings(staff(9, 'ceo'))).toEqual({ settings: { spin_cost: 50, gift_commission_pct: 20 } });
    expect((await ctrl.settings(staff(2, 'superadmin'))).settings).toHaveProperty('min_withdrawal');
  });

  it('lets a CEO patch only CEO settings keys', () => {
    expect(() => ctrl.updateSettings(staff(9, 'ceo'), { spin_cost: 60, min_withdrawal: 1 })).toThrow(ForbiddenException);
    void ctrl.updateSettings(staff(9, 'ceo'), { spin_cost: 60 });
    void ctrl.updateSettings(staff(2, 'superadmin'), { min_withdrawal: 1 });
    expect(catalog.updateSettings).toHaveBeenCalledTimes(2);
  });

  it('caps CEO coin adjustments and blocks self-credit', () => {
    const body = (amount: number) => ({ asset: 'coins', action: 'add', amount }) as any;
    expect(() => ctrl.adjustBalance(staff(9, 'ceo'), '9', body(10))).toThrow(ForbiddenException);
    expect(() => ctrl.adjustBalance(staff(9, 'ceo'), '50', body(1_000_001))).toThrow(ForbiddenException);
    void ctrl.adjustBalance(staff(9, 'ceo'), '50', body(1_000_000));
    void ctrl.adjustBalance(staff(2, 'superadmin'), '2', body(5_000_000));
    expect(admin.adjustBalance).toHaveBeenCalledTimes(2);
  });
});
