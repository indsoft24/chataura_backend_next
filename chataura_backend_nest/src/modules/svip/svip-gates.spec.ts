import { ForbiddenException } from '@nestjs/common';
import { assertKickable } from './svip-gates';

const tx = (level: number | null): any => ({
  userSvip: {
    findUnique: async () =>
      level === null ? null : { level, status: 'active', periodEndsAt: new Date(Date.now() + 864e5) },
  },
});

describe('assertKickable', () => {
  it('blocks the kick of an SVIP 2 member', async () => {
    await expect(assertKickable(tx(2), 1n)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows SVIP 1 and non-members', async () => {
    await expect(assertKickable(tx(1), 1n)).resolves.toBeUndefined();
    await expect(assertKickable(tx(null), 1n)).resolves.toBeUndefined();
  });
});
