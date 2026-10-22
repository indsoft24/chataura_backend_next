// Stub the heavy dependency graph so AdminService loads without Redis/Firebase/scheduler
// (same convention as room-state.spec.ts). The authz paths never call into these.
jest.mock('../room/room-state/room-state.service', () => ({ RoomStateService: class {} }));
jest.mock('../wallet/ledger.service', () => ({ LedgerService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));

import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Privilege-escalation attempts through the staff endpoints. Negative cases throw before any
 * DB write; "allowed" cases are proven by reaching the write (stubbed to throw REACHED_UPDATE),
 * which shows authorization passed without needing the full Prisma surface.
 */
const actor = (badge: string | null): AuthUser =>
  ({ id: 1n, email: 'a@a', role: 'admin', staffBadgeType: badge, emailVerifiedAt: null, accountStatus: 'active', isSuspended: false } as any);

const normalUser = { id: 10n, role: 'user', staffBadgeType: null, selectedFrameId: null, accountStatus: 'active' };
const ceoUser = { id: 11n, role: 'admin', staffBadgeType: 'ceo', selectedFrameId: null, accountStatus: 'active' };
const managerUser = { id: 12n, role: 'admin', staffBadgeType: 'manager', selectedFrameId: null, accountStatus: 'active' };

function svc(target: any) {
  const prisma: any = {
    user: {
      findFirst: async () => target,
      findUnique: async () => target,
      update: async () => {
        throw new Error('REACHED_UPDATE');
      },
    },
    frame: { findUnique: async () => null, findFirst: async () => null },
  };
  return new AdminService(prisma, {} as any, {} as any);
}

describe('Staff creation hierarchy — nobody can mint a tier at or above their own', () => {
  it('ceo cannot create another ceo', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('ceo'), 10n, { role: 'admin', staff_badge_type: 'ceo' })).rejects.toThrow(ForbiddenException);
  });
  it('manager cannot create a manager or a ceo', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('manager'), 10n, { role: 'admin', staff_badge_type: 'manager' })).rejects.toThrow(ForbiddenException);
    await expect(svc(normalUser).linkExistingUser(actor('manager'), 10n, { role: 'admin', staff_badge_type: 'ceo' })).rejects.toThrow(ForbiddenException);
  });
  it('admin (lowest) cannot create anyone', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('admin'), 10n, { role: 'admin', staff_badge_type: 'admin' })).rejects.toThrow(ForbiddenException);
    await expect(svc(normalUser).linkExistingUser(actor(null), 10n, { role: 'admin' })).rejects.toThrow(ForbiddenException);
  });
  it('nobody — not even superadmin — can mint a second superadmin via the API', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('superadmin'), 10n, { role: 'admin', staff_badge_type: 'superadmin' })).rejects.toThrow(ForbiddenException);
    await expect(svc(normalUser).linkExistingUser(actor('ceo'), 10n, { role: 'admin', staff_badge_type: 'superadmin' })).rejects.toThrow(ForbiddenException);
  });
  it('a ceo cannot edit a ceo peer', async () => {
    await expect(svc(ceoUser).linkExistingUser(actor('ceo'), 11n, { role: 'admin', staff_badge_type: 'admin' })).rejects.toThrow(ForbiddenException);
  });
  it('only the superadmin may assign seller/agency', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('ceo'), 10n, { role: 'seller' })).rejects.toThrow(ForbiddenException);
    await expect(svc(normalUser).linkExistingUser(actor('manager'), 10n, { role: 'agency' })).rejects.toThrow(ForbiddenException);
  });

  // Allowed paths reach the DB write (REACHED_UPDATE) => authorization passed.
  it('allows the legitimate creations', async () => {
    await expect(svc(normalUser).linkExistingUser(actor('superadmin'), 10n, { role: 'admin', staff_badge_type: 'ceo' })).rejects.toThrow('REACHED_UPDATE');
    await expect(svc(normalUser).linkExistingUser(actor('ceo'), 10n, { role: 'admin', staff_badge_type: 'manager' })).rejects.toThrow('REACHED_UPDATE');
    await expect(svc(normalUser).linkExistingUser(actor('manager'), 10n, { role: 'admin', staff_badge_type: 'admin' })).rejects.toThrow('REACHED_UPDATE');
    await expect(svc(normalUser).linkExistingUser(actor('superadmin'), 10n, { role: 'seller' })).rejects.toThrow('REACHED_UPDATE');
  });
});

describe('Suspend / deactivate — cannot act on a peer or higher staff', () => {
  it('a manager cannot suspend a ceo', async () => {
    await expect(svc(ceoUser).suspend(actor('manager'), 11n)).rejects.toThrow(ForbiddenException);
  });
  it('a manager CAN suspend a normal user', async () => {
    await expect(svc(normalUser).suspend(actor('manager'), 10n)).rejects.toThrow('REACHED_UPDATE');
  });
  it('only the superadmin can deactivate (delete) a staff member', async () => {
    await expect(svc(managerUser).deactivate(actor('ceo'), 12n)).rejects.toThrow(ForbiddenException);
    await expect(svc(ceoUser).deactivate(actor('superadmin'), 11n)).rejects.not.toThrow(ForbiddenException);
  });
});
