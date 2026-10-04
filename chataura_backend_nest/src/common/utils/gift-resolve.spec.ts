import { Gift } from '@prisma/client';
import { buildGiftKey, giftKeySlug } from './gift-key';
import { resolveGiftForSend } from './gift-resolve';

function gift(partial: Partial<Gift> & { id: number }): Gift {
  const { id, ...rest } = partial;
  const name = rest.name ?? `Gift ${id}`;
  const category = rest.category ?? 'standard';
  return {
    id: BigInt(id),
    giftKey: buildGiftKey(category, name),
    name,
    coinCost: 100,
    category,
    imageUrl: null,
    animationUrl: null,
    isActive: true,
    createdAt: new Date(0),
    ...rest,
  } as Gift;
}

// Mirrors the production duplicate: "Wedding" exists in standard and CP.
const ROWS: Gift[] = [
  gift({ id: 178, name: 'Wedding', category: 'standard', coinCost: 120_000 }),
  gift({ id: 88, name: 'Wedding', category: 'cp', coinCost: 1_200_000 }),
  gift({ id: 203, name: 'Love Letter', category: 'standard', coinCost: 80 }),
  gift({ id: 46, name: 'Love Letter', category: 'cp', coinCost: 150_000, isActive: false }),
  gift({ id: 1, name: 'Rose', category: 'standard', coinCost: 10 }),
  gift({ id: 300, name: 'Rose Ball', category: 'standard', coinCost: 2_400_000 }),
];

function fakePrisma(rows: Gift[] = ROWS) {
  return {
    gift: {
      findUnique: jest.fn(async ({ where }: { where: { id?: bigint; giftKey?: string } }) =>
        rows.find((r) =>
          where.id != null ? r.id === where.id : r.giftKey === where.giftKey,
        ) ?? null,
      ),
      findMany: jest.fn(
        async ({ where }: { where: { name: { equals: string }; isActive: boolean } }) =>
          rows
            .filter(
              (r) =>
                r.name.toLowerCase() === where.name.equals.toLowerCase() &&
                r.isActive === where.isActive,
            )
            .sort((a, b) => Number(a.id - b.id)),
      ),
    },
  } as never;
}

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const body = (e as { getResponse(): { error: { code: string } } }).getResponse();
    return body.error.code;
  }
  throw new Error('expected rejection');
}

describe('gift key', () => {
  it('builds category-scoped slugs', () => {
    expect(buildGiftKey('cp', 'Wedding')).toBe('cp.wedding');
    expect(buildGiftKey('standard', 'Rolls-Royce')).toBe('standard.rolls_royce');
    expect(buildGiftKey(' Lucky ', '  Golden  Slot ')).toBe('lucky.golden_slot');
    expect(giftKeySlug('शादी')).toBe('gift');
  });
});

describe('resolveGiftForSend', () => {
  it('resolves by id and charges that exact row', async () => {
    const g = await resolveGiftForSend(fakePrisma(), { gift_id: 178, gift_name: 'Wedding' });
    expect(g.coinCost).toBe(120_000);
  });

  it('resolves by gift_key', async () => {
    const g = await resolveGiftForSend(fakePrisma(), { gift_key: 'cp.wedding' });
    expect(Number(g.id)).toBe(88);
  });

  it('rejects when gift_key and gift_id point to different gifts', async () => {
    expect(
      await errorCode(resolveGiftForSend(fakePrisma(), { gift_key: 'cp.wedding', gift_id: 178 })),
    ).toBe('GIFT_MISMATCH');
  });

  it('rejects a stale id whose name does not match (no wrong charge)', async () => {
    expect(
      await errorCode(resolveGiftForSend(fakePrisma(), { gift_id: 300, gift_name: 'Rose' })),
    ).toBe('GIFT_MISMATCH');
  });

  it('rejects a category mismatch', async () => {
    expect(
      await errorCode(
        resolveGiftForSend(fakePrisma(), { gift_id: 88, gift_name: 'Wedding', gift_category: 'standard' }),
      ),
    ).toBe('GIFT_MISMATCH');
  });

  it('never guesses between same-name gifts', async () => {
    expect(
      await errorCode(resolveGiftForSend(fakePrisma(), { gift_name: 'Wedding' })),
    ).toBe('GIFT_AMBIGUOUS');
    const g = await resolveGiftForSend(fakePrisma(), {
      gift_name: 'Wedding',
      gift_category: 'standard',
    });
    expect(Number(g.id)).toBe(178);
  });

  it('does not partial-match names ("Rose" never becomes "Rose Ball")', async () => {
    const g = await resolveGiftForSend(fakePrisma(), { gift_name: 'rose' });
    expect(Number(g.id)).toBe(1);
    expect(await errorCode(resolveGiftForSend(fakePrisma(), { gift_name: 'Ros' }))).toBe(
      'GIFT_NOT_FOUND',
    );
  });

  it('rejects inactive gifts instead of re-activating them', async () => {
    expect(await errorCode(resolveGiftForSend(fakePrisma(), { gift_id: 46 }))).toBe(
      'GIFT_INACTIVE',
    );
  });

  it('enforces expected_coin_cost when the client sends it', async () => {
    expect(
      await errorCode(resolveGiftForSend(fakePrisma(), { gift_id: 178, expected_coin_cost: 12_000 })),
    ).toBe('GIFT_PRICE_CHANGED');
    const ok = await resolveGiftForSend(fakePrisma(), { gift_id: 178, expected_coin_cost: '120000' });
    expect(ok.coinCost).toBe(120_000);
  });

  it('returns 404 for unknown ids and 400 when nothing identifies the gift', async () => {
    expect(await errorCode(resolveGiftForSend(fakePrisma(), { gift_id: 999 }))).toBe(
      'GIFT_NOT_FOUND',
    );
    expect(await errorCode(resolveGiftForSend(fakePrisma(), {}))).toBe('VALIDATION_ERROR');
  });
});
