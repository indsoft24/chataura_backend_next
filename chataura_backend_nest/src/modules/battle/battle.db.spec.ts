jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
jest.mock('../../common/fcm/realtime.service', () => ({ RealtimeService: class {} }));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { BattleService } from './battle.service';

// Needs a migrated throwaway DB: BATTLE_DB_TEST=1 DATABASE_URL=…/battle_tmp npx jest battle.db
const run = process.env.BATTLE_DB_TEST ? describe : describe.skip;

run('battle money flow (real DB)', () => {
  const prisma = new PrismaClient();
  const published: string[] = [];
  const realtime = { publishRoomEvent: async (_r: string, e: { text: string }) => (published.push(e.text), true) };
  const svc = new BattleService(prisma as never, realtime as never, new LedgerService(prisma as never));
  const tag = Date.now().toString().slice(-6);
  let roomId = '';
  const ids: bigint[] = [];

  beforeAll(async () => {
    for (let i = 0; i < 6; i++) {
      const u = await prisma.user.create({ data: { password: 'x', displayId: `bt${tag}${i}` } });
      ids.push(u.id);
    }
    const room = await prisma.room.create({
      data: { displayId: `R${tag}`, title: 't', ownerId: ids[0], agoraChannelName: `c${tag}` },
    });
    roomId = room.id;
    for (const id of ids) await prisma.roomMember.create({ data: { roomId, userId: id, isActive: true } });
    // seats 0,1 red; 2,3 blue
    for (let i = 1; i <= 3; i++) await prisma.seat.create({ data: { roomId, seatIndex: i, userId: ids[i] } });
    await prisma.seat.create({ data: { roomId, seatIndex: 0 } });
    await prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: { battle_enabled: true } },
      update: { extraSettings: { battle_enabled: true } },
    });
  });
  afterAll(() => prisma.$disconnect());

  it('scores, ends, pays once', async () => {
    const started = await svc.start(ids[0], roomId, 2);
    expect(started.state).toBe('started');
    await expect(svc.start(ids[0], roomId, 2)).rejects.toBeTruthy(); // second live battle
    await expect(svc.start(ids[4], roomId, 2)).rejects.toBeTruthy(); // not allowed
    await prisma.$transaction(async (tx) => {
      // ids[1] seat1 red; ids[2] seat2 blue; ids[5] not seated (ignored)
      await svc.recordGiftTx(tx, { roomId, gifts: [
        { receiverId: ids[1], coins: 1000n }, { receiverId: ids[2], coins: 400n }, { receiverId: ids[5], coins: 9999n },
      ] });
    });
    const before = await prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    await prisma.roomBattle.update({ where: { id: BigInt(started.battle_id) }, data: { endsAt: new Date(Date.now() - 1000) } });
    await svc.finish(BigInt(started.battle_id));
    await svc.finish(BigInt(started.battle_id)); // double finish
    const b = await prisma.roomBattle.findUniqueOrThrow({ where: { id: BigInt(started.battle_id) } });
    expect([b.status, b.winnerSide, Number(b.redTotal), Number(b.blueTotal)]).toEqual(['won', 'red', 1000, 400]);
    const after = await prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    const gain = after.map((u, i) => Number(u.walletBalance - before[i].walletBalance));
    // pool 1400: red winners = host on seat 0 + ids[1]: 210 / 2 = 105 each; initiator (host) 2% = 28
    expect(gain).toEqual([133, 105, 0, 0, 0, 0]);
    expect(b.paidAt).not.toBeNull();
    expect(await prisma.battlePayout.count({ where: { battleId: b.id } })).toBe(3);
  });
});
