import { freeSlot, grantMedal, medalLive } from './medal.rules';

describe('medal slots', () => {
  it('picks the lowest free slot, null when all 3 are taken', () => {
    expect(freeSlot([])).toBe(1);
    expect(freeSlot([1, 3])).toBe(2);
    expect(freeSlot([1, 2, 3])).toBeNull();
  });

  it('expiry: null is permanent, past is gone', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    expect(medalLive(null, now)).toBe(true);
    expect(medalLive(new Date('2026-10-27T00:00:00Z'), now)).toBe(true);
    expect(medalLive(now, now)).toBe(false);
  });
});

describe('grantMedal', () => {
  function tx(
    worn: Array<{ wornSlot: number; expiresAt: Date | null }>,
    existing: { wornSlot: number | null } | null,
  ) {
    const writes: any[] = [];
    return {
      writes,
      tx: {
        userMedal: {
          findMany: async () => worn,
          findUnique: async () => existing,
          upsert: async (a: any) => writes.push(a),
        },
      } as any,
    };
  }

  it('wears a new grant in the first free slot, ignoring expired medals', async () => {
    const past = new Date(Date.now() - 1000);
    const t = tx(
      [
        { wornSlot: 1, expiresAt: null },
        { wornSlot: 2, expiresAt: past },
      ],
      null,
    );
    await grantMedal(t.tx, 7n, 9n, null, 'svip', true);
    expect(t.writes[0].create).toMatchObject({ wornSlot: 2, source: 'svip' });
  });

  it('renewal keeps the slot the user chose', async () => {
    const t = tx([], { wornSlot: null });
    await grantMedal(t.tx, 7n, 9n, new Date(), 'svip', false);
    expect(t.writes[0].update).not.toHaveProperty('wornSlot');
  });
});
