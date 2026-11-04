/**
 * One-off: pays a referral that was recorded (users.invited_by set) but never paid.
 * Same rules and the same idempotent ledger keys as a live signup, minus the 7-day window (these accounts are old).
 *
 *   node dist/scripts/backfill-referral.js 1652 1583            # dry run: prints what would happen
 *   node dist/scripts/backfill-referral.js 1652 1583 --apply    # pays
 */
import { PrismaService } from '../common/prisma/prisma.service';
import { LedgerService } from '../modules/wallet/ledger.service';
import { UserService } from '../modules/user/user.service';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ids = args.filter((a) => /^\d+$/.test(a)).map((a) => BigInt(a));
  if (ids.length === 0) throw new Error('usage: backfill-referral.js <inviteeId...> [--apply]');

  const prisma = new PrismaService();
  await prisma.$connect();
  const users = new UserService(prisma, new LedgerService(prisma));
  try {
    for (const id of ids) {
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true, invitedBy: true } });
      if (!u?.invitedBy) {
        console.log(`${id}: no inviter recorded, skipped`);
        continue;
      }
      const paid = await prisma.coinTransaction.findFirst({ where: { userId: id, referenceId: `referral_join_${id}` } });
      if (paid) {
        console.log(`${id}: already paid, skipped`);
        continue;
      }
      const check = await users.referralCheck(id, u.invitedBy, { ignoreAge: true });
      if (check !== 'ok') {
        console.log(`${id}: NOT paid, reason ${check}`);
        continue;
      }
      if (!apply) {
        console.log(`${id}: eligible (inviter ${u.invitedBy}), dry run`);
        continue;
      }
      const r = await prisma.$transaction((tx) => users.payReferral(tx, id, u.invitedBy!));
      console.log(`${id}: PAID invitee ${r.invitee_coins} + inviter ${r.referrer_coins} coins`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
