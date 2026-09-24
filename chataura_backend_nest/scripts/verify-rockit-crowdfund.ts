/**
 * Rockit crowdfund verification helpers.
 *
 * Run (with DATABASE_URL set and rockit migration applied):
 *   npx ts-node --transpile-only scripts/verify-rockit-crowdfund.ts
 *
 * Checks:
 * 1) Idempotent contribution (same txId) rejected by unique constraint
 * 2) Concurrent PENDING → LAUNCHING claims: exactly one wins
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const config = await prisma.rocketCampaignConfig.findFirst({
    where: { status: true },
    orderBy: { id: 'desc' },
  });
  await assert(!!config, 'active RocketCampaignConfig required (seed migration)');

  const rooms = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM rooms ORDER BY created_at DESC LIMIT 1
  `;
  await assert(rooms.length > 0, 'need at least one room');
  const roomId = rooms[0].id;

  const users = await prisma.$queryRaw<Array<{ id: bigint }>>`
    SELECT id FROM users ORDER BY id ASC LIMIT 2
  `;
  await assert(users.length >= 2, 'need at least two users');

  await prisma.rocketEvent.updateMany({
    where: { roomId, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

  const eventId = randomUUID();
  await prisma.rocketEvent.create({
    data: {
      id: eventId,
      roomId,
      configId: config!.id,
      accumulatedCoins: Math.max(0, config!.launchThresholdCoins - 50),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const txA = `verify_idem_${randomUUID()}`;
  await prisma.rocketContribution.create({
    data: {
      eventId,
      userId: users[0].id,
      coins: 25,
      source: 'DIRECT',
      txId: txA,
    },
  });
  let dupFailed = false;
  try {
    await prisma.rocketContribution.create({
      data: {
        eventId,
        userId: users[0].id,
        coins: 25,
        source: 'DIRECT',
        txId: txA,
      },
    });
  } catch (e) {
    dupFailed =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }
  await assert(dupFailed, 'duplicate txId must fail unique constraint');

  const [r1, r2] = await Promise.all([
    prisma.rocketEvent.updateMany({
      where: { id: eventId, status: 'PENDING' },
      data: { status: 'LAUNCHING' },
    }),
    prisma.rocketEvent.updateMany({
      where: { id: eventId, status: 'PENDING' },
      data: { status: 'LAUNCHING' },
    }),
  ]);
  const claims = r1.count + r2.count;
  await assert(claims === 1, `exactly one claim expected, got ${claims}`);

  const after = await prisma.rocketEvent.findUnique({ where: { id: eventId } });
  await assert(after?.status === 'LAUNCHING', 'event must be LAUNCHING after single claim');

  await prisma.rocketContribution.deleteMany({ where: { eventId } });
  await prisma.rocketEvent.delete({ where: { id: eventId } });

  console.log('OK rockit verify: idempotency unique + single threshold claim');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
