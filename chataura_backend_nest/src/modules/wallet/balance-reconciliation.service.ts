import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface BalanceMismatch {
  user_id: number;
  current: number;
  ledger: number;
  diff: number;
}

export interface ReconciliationReport {
  checked_at: string;
  coin_mismatches: BalanceMismatch[];
  gem_mismatches: BalanceMismatch[];
}

/**
 * Compares each user's balances with their most recent ledger row.
 * Users whose latest coin row has no balance_after (or no gem row with
 * meta.gems_after) are skipped rather than reported.
 */
@Injectable()
export class BalanceReconciliationService {
  private readonly logger = new Logger(BalanceReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async handleDailyReconciliation() {
    try {
      const report = await this.reconcile();
      const coins = report.coin_mismatches.length;
      const gems = report.gem_mismatches.length;
      if (coins === 0 && gems === 0) {
        this.logger.log('Balance reconciliation: all coin and gem balances match the ledger');
        return;
      }
      this.logger.error(
        `Balance reconciliation: ${coins} coin and ${gems} gem mismatches. ` +
          `Coins: ${JSON.stringify(report.coin_mismatches.slice(0, 20))} ` +
          `Gems: ${JSON.stringify(report.gem_mismatches.slice(0, 20))}`,
      );
    } catch (e) {
      this.logger.warn(`Balance reconciliation error: ${String(e)}`);
    }
  }

  async reconcile(): Promise<ReconciliationReport> {
    const coinRows = await this.prisma.$queryRaw<
      { user_id: bigint; current: bigint; ledger: bigint }[]
    >`
      WITH last AS (
        SELECT DISTINCT ON (user_id) user_id, balance_after
        FROM coin_transactions
        WHERE coin_amount <> 0
        ORDER BY user_id, id DESC
      )
      SELECT u.id AS user_id, u.wallet_balance AS current, l.balance_after AS ledger
      FROM users u
      JOIN last l ON l.user_id = u.id
      WHERE l.balance_after IS NOT NULL
        AND u.wallet_balance <> l.balance_after
      ORDER BY abs(u.wallet_balance - l.balance_after) DESC`;

    const gemRows = await this.prisma.$queryRaw<
      { user_id: bigint; current: bigint; ledger: bigint }[]
    >`
      WITH last AS (
        SELECT DISTINCT ON (user_id) user_id, (meta->>'gems_after')::bigint AS gems_after
        FROM coin_transactions
        WHERE meta ? 'gems_after'
        ORDER BY user_id, id DESC
      )
      SELECT u.id AS user_id, u.gems AS current, l.gems_after AS ledger
      FROM users u
      JOIN last l ON l.user_id = u.id
      WHERE u.gems <> l.gems_after
      ORDER BY abs(u.gems - l.gems_after) DESC`;

    const toMismatch = (r: { user_id: bigint; current: bigint; ledger: bigint }) => ({
      user_id: Number(r.user_id),
      current: Number(r.current),
      ledger: Number(r.ledger),
      diff: Number(r.current) - Number(r.ledger),
    });

    return {
      checked_at: new Date().toISOString(),
      coin_mismatches: coinRows.map(toMismatch),
      gem_mismatches: gemRows.map(toMismatch),
    };
  }
}
