import { ForbiddenException } from '@nestjs/common';
import { assertKickable, boostXp } from './svip-gates';

const tx = (level: number | null): any => ({
  userSvip: {
    findUnique: async () =>
      level === null ? null : { level, status: 'active', periodEndsAt: new Date(Date.now() + 864e5) },
  },
});

describe('assertKickable', () => {
  it('blocks the kick of an SVIP 3 member', async () => {
    await expect(assertKickable(tx(3), 1n)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertKickable(tx(5), 1n)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows SVIP 1 and 2 and non-members', async () => {
    await expect(assertKickable(tx(2), 1n)).resolves.toBeUndefined();
    await expect(assertKickable(tx(1), 1n)).resolves.toBeUndefined();
    await expect(assertKickable(tx(null), 1n)).resolves.toBeUndefined();
  });
});

describe('boostXp', () => {
  it('gives SVIP 2 and higher +20%', () => {
    expect(boostXp(100, 2)).toBe(120);
    expect(boostXp(100, 3)).toBe(120);
    expect(boostXp(55, 2)).toBe(66);
    expect(boostXp(1, 2)).toBe(1);
  });
  it('leaves everyone else alone', () => {
    expect(boostXp(100, 1)).toBe(100);
    expect(boostXp(100, 0)).toBe(100);
    expect(boostXp(0, 2)).toBe(0);
  });
});
