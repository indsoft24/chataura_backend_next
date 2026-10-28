import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  PRESETS,
  REEL_STOPS,
  SLOT_KEYS,
  SlotSettings,
  buildStrip,
  evaluate,
  gridFromStops,
  readSlotSettings,
  slotSettingsForApi,
  validBetLevels,
} from './slot.rules';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Spins closer than this are refused (the reel animation takes longer anyway). */
const MIN_GAP_MS = 700;
const IST_OFFSET_MS = 330 * 60_000;

function fail(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ success: false, error: { code, message, ...extra } });
}

const STRIPS = Object.fromEntries(Object.entries(PRESETS).map(([k, c]) => [k, buildStrip(c)]));

@Injectable()
export class SlotService {
  private readonly logger = new Logger(SlotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async settings(): Promise<SlotSettings> {
    const row = await this.prisma.adminSetting.findUnique({ where: { id: 1 }, select: { extraSettings: true } });
    return readSlotSettings(row?.extraSettings as Record<string, unknown> | null);
  }

  /** Superadmin edit; rejects bad values so the panel shows exactly what was saved. */
  async updateSettings(patch: Record<string, unknown>, actorId: bigint) {
    if (patch[SLOT_KEYS.rtpPreset] !== undefined && !(Number(patch[SLOT_KEYS.rtpPreset]) in PRESETS))
      fail('BAD_SETTINGS', 'RTP must be 90, 94 or 96');
    if (patch[SLOT_KEYS.betLevels] !== undefined && !validBetLevels(patch[SLOT_KEYS.betLevels]))
      fail('BAD_SETTINGS', 'Bet levels: 1–8 rising whole numbers, each divisible by 5');
    const big = patch[SLOT_KEYS.bigWinX];
    if (big !== undefined && !(Number.isInteger(Number(big)) && Number(big) >= 1 && Number(big) <= 1000))
      fail('BAD_SETTINGS', 'Big win multiplier must be 1–1000');
    const next = { ...slotSettingsForApi(await this.settings()) } as Record<string, unknown>;
    for (const k of Object.values(SLOT_KEYS)) if (patch[k] !== undefined) next[k] = patch[k];
    const s = readSlotSettings(next);
    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = { ...((current?.extraSettings as Record<string, unknown>) ?? {}), ...slotSettingsForApi(s) };
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
      update: { extraSettings: extra as Prisma.InputJsonValue },
    });
    this.logger.log(`Slot settings changed by admin ${actorId}: ${JSON.stringify(slotSettingsForApi(s))}`);
    return slotSettingsForApi(s);
  }

  async state(userId: bigint) {
    const s = await this.settings();
    return {
      enabled: s.enabled,
      bet_levels: s.betLevels,
      big_win_x: s.bigWinX,
      today_win: Number(await this.todayWin(userId)),
    };
  }

  private async todayWin(userId: bigint): Promise<bigint> {
    const now = Date.now();
    const istMidnight = new Date(Math.floor((now + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS);
    const agg = await this.prisma.slotSpin.aggregate({
      where: { userId, createdAt: { gte: istMidnight } },
      _sum: { payout: true },
    });
    return agg._sum.payout ?? 0n;
  }

  async history(userId: bigint) {
    const rows = await this.prisma.slotSpin.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      spins: rows.map((r) => ({ bet: Number(r.bet), win: Number(r.payout), at: r.createdAt.toISOString() })),
    };
  }

  /** One spin: debit the bet, draw the stops on the server, credit the win — all in one transaction. */
  async spin(userId: bigint, betRaw: unknown, requestId: unknown) {
    const settings = await this.settings();
    if (!settings.enabled) fail('DISABLED', 'Lucky Slots is not available yet');
    const bet = Number(betRaw);
    if (!settings.betLevels.includes(bet)) fail('BAD_BET', 'Choose one of the bet levels');
    if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) fail('BAD_REQUEST', 'request_id must be a uuid');
    const id = requestId.toLowerCase();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.ledger.lockUser(tx, userId);
        if (!locked) fail('USER_NOT_FOUND', 'User not found');
        const prior = await tx.slotSpin.findUnique({ where: { id } });
        if (prior) {
          if (prior.userId !== userId) fail('BAD_REQUEST', 'request_id already used');
          return { spin: prior, balance: locked.wallet_balance, replay: true };
        }
        const last = await tx.slotSpin.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const wait = last ? MIN_GAP_MS - (Date.now() - last.createdAt.getTime()) : 0;
        if (wait > 0) fail('TOO_FAST', 'Wait a moment before spinning again', { retry_after_ms: wait });

        const strip = STRIPS[settings.rtpPreset];
        const stops: [number, number, number] = [randomInt(REEL_STOPS), randomInt(REEL_STOPS), randomInt(REEL_STOPS)];
        const grid = gridFromStops(strip, stops);
        const { payout } = evaluate(grid, bet);

        let balance: bigint;
        try {
          balance = (
            await this.ledger.debitCoins(tx, userId, bet, 'GAME_SLOT', 'Lucky Slots bet', `slot:${id}:bet`, locked)
          ).after;
        } catch (e) {
          if ((e as { code?: string }).code === 'INSUFFICIENT_BALANCE')
            fail('INSUFFICIENT_BALANCE', 'Not enough coins');
          throw e;
        }
        if (payout > 0)
          balance = await this.ledger.creditCoins(
            tx,
            userId,
            payout,
            'GAME_SLOT_WIN',
            'Lucky Slots win',
            `slot:${id}:win`,
            { ...locked, wallet_balance: balance },
            { source: 'game', currency: 'coins', bet },
          );
        const spin = await tx.slotSpin.create({
          data: { id, userId, bet: BigInt(bet), payout: BigInt(payout), grid },
        });
        return { spin, balance, replay: false };
      },
      { timeout: 10_000 },
    );

    const { spin } = result;
    const grid = spin.grid as number[][];
    const bigWin = Number(spin.payout) >= Number(spin.bet) * settings.bigWinX;
    return {
      spin_id: spin.id,
      grid,
      wins: evaluate(grid, Number(spin.bet)).wins,
      bet: Number(spin.bet),
      payout: Number(spin.payout),
      big_win: bigWin,
      balance: Number(result.balance),
      today_win: Number(await this.todayWin(userId)),
    };
  }
}
