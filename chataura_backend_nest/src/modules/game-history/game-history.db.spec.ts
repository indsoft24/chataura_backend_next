jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { PrismaClient } from '@prisma/client';
import { GameHistoryService } from './game-history.service';

// Needs a migrated throwaway DB: GAME_HISTORY_DB_TEST=1 DATABASE_URL=…/gh_tmp npx jest game-history.db
const run = process.env.GAME_HISTORY_DB_TEST ? describe : describe.skip;

run('game history (real DB)', () => {
  const prisma = new PrismaClient();
  const svc = new GameHistoryService(prisma as never);
  let a = 0n;
  let b = 0n;
  const mk = (tag: string) =>
    prisma.user.create({ data: { password: 'x', displayId: `${tag}${Date.now().toString().slice(-7)}` } }).then((u) => u.id);

  beforeAll(async () => {
    a = await mk('gha');
    b = await mk('ghb');
  });
  afterAll(() => prisma.$disconnect());

  it('records a Greedy round once per user, with net and result', async () => {
    const round = await prisma.greedyRound.create({
      data: { phase: 'completed', bettingEndsAt: new Date(), winningItem: 'chicken', winningMultiplier: 45, settledAt: new Date() },
    });
    const bet = (userId: bigint, item: string, amt: bigint, pay: bigint) =>
      prisma.greedyBet.create({
        data: { roundId: round.id, userId, item, chipAmount: amt, multiplier: 45, potentialPayout: amt * 45n, actualPayout: pay, status: pay > 0n ? 'won' : 'lost' },
      });
    await bet(a, 'chicken', 1000n, 45_000n);
    await bet(a, 'cow', 500n, 0n);
    await bet(b, 'cow', 2000n, 0n);
    await prisma.$transaction((tx) => svc.recordRound(tx, 'greedy', round.id));
    await prisma.$transaction((tx) => svc.recordRound(tx, 'greedy', round.id)); // settle retried: still one row each
    const ra = await prisma.gameHistory.findMany({ where: { userId: a, game: 'greedy' } });
    expect(ra).toHaveLength(1);
    expect(ra[0].totalBet).toBe(1500n);
    expect(ra[0].payout).toBe(45_000n);
    expect(ra[0].result).toBe('win');
    const rb = await prisma.gameHistory.findFirstOrThrow({ where: { userId: b, game: 'greedy' } });
    expect(rb.result).toBe('loss');
    expect(rb.net).toBe(-2000n);
  });

  it('records a Lucky 77 round and a single spin', async () => {
    const round = await prisma.lucky77Round.create({
      data: { phase: 'completed', bettingEndsAt: new Date(), winningItem: 'plum', winningMultiplier: 2, settledAt: new Date() },
    });
    await prisma.lucky77Bet.create({
      data: { roundId: round.id, userId: a, option: 'plum', chipAmount: 100n, multiplier: 2, potentialPayout: 200n, actualPayout: 200n, status: 'won' },
    });
    await prisma.$transaction((tx) => svc.recordRound(tx, 'lucky77', round.id));
    expect((await prisma.gameHistory.findFirstOrThrow({ where: { userId: a, game: 'lucky77' } })).net).toBe(100n);
    await prisma.$transaction(async (tx) => {
      await svc.recordOne(tx, { userId: a, game: 'lucky_spin', roundRef: 'spin_x', bet: 600n, payout: 0n, detail: { prize: 'Try again' } });
      await svc.recordOne(tx, { userId: a, game: 'lucky_spin', roundRef: 'spin_x', bet: 600n, payout: 0n }); // duplicate ignored
    });
    expect(await prisma.gameHistory.count({ where: { userId: a, game: 'lucky_spin' } })).toBe(1);
  });

  it('lists only the caller own rows, pages by cursor and filters', async () => {
    const first = await svc.list(a, { limit: '2' });
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await svc.list(a, { limit: '2', cursor: first.next_cursor });
    expect(second.items.map((i) => i.id)).not.toContain(first.items[0].id);
    const all = await svc.list(a, { limit: '50' });
    expect(all.next_cursor).toBeNull();
    expect(all.items.length).toBe(3);
    for (const q of [{ game: 'greedy' }, { result: 'win' }, { game: "x' OR 1=1" }, { cursor: 'abc' }, { limit: '-1' }])
      await svc.list(b, q); // junk filters are ignored, never an error
    const bOnly = await svc.list(b, {});
    expect(bOnly.items.every((i) => i.game === 'greedy')).toBe(true);
    expect((await svc.list(a, { result: 'loss' })).items.every((i) => i.result === 'loss')).toBe(true);
  });

  it('summary and admin totals add up', async () => {
    const s = await svc.summary(a);
    expect(s.total.rounds).toBe(3);
    expect(s.total.bet).toBe(1500 + 100 + 600);
    expect(s.total.win).toBe(45_000 + 200);
    expect(s.total.net).toBe(s.total.win - s.total.bet);
    const adm = await svc.adminList({ user_id: a.toString() });
    expect(adm.totals.house_profit).toBe(adm.totals.bet - adm.totals.paid_out);
    expect(adm.items.every((i) => i.user_id === a.toString())).toBe(true);
  });
});
