/** Room gifting battle: pure rules (settings, team of a seat, payout split, events). */
export const BATTLE_KEYS = {
  enabled: 'battle_enabled',
  winnerPct: 'battle_winner_pct',
  initiatorPct: 'battle_initiator_pct',
  minMinutes: 'battle_min_minutes',
  maxMinutes: 'battle_max_minutes',
} as const;

export type BattleSettings = {
  enabled: boolean;
  /** % of all battle gifts shared evenly by the winning team. */
  winnerPct: number;
  /** % of all battle gifts paid to whoever started the battle. */
  initiatorPct: number;
  minMinutes: number;
  maxMinutes: number;
};

export const BATTLE_DEFAULTS: BattleSettings = {
  enabled: false,
  winnerPct: 15,
  initiatorPct: 2,
  minMinutes: 2,
  maxMinutes: 30,
};

/** Battle seats are 4 columns: columns 0–1 are the red (left) team, 2–3 the blue (right) team. */
export const BATTLE_COLUMNS = 4;

export type Side = 'red' | 'blue';

export function sideOfSeat(seatIndex: number): Side {
  return seatIndex % BATTLE_COLUMNS < BATTLE_COLUMNS / 2 ? 'red' : 'blue';
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readBattleSettings(
  extra: Record<string, unknown> | null | undefined,
): BattleSettings {
  const e = extra ?? {};
  const on = e[BATTLE_KEYS.enabled];
  const minMinutes = Math.floor(num(e[BATTLE_KEYS.minMinutes], BATTLE_DEFAULTS.minMinutes, 1, 120));
  const maxMinutes = Math.floor(
    num(e[BATTLE_KEYS.maxMinutes], BATTLE_DEFAULTS.maxMinutes, minMinutes, 240),
  );
  let winnerPct = num(e[BATTLE_KEYS.winnerPct], BATTLE_DEFAULTS.winnerPct, 0, 100);
  let initiatorPct = num(e[BATTLE_KEYS.initiatorPct], BATTLE_DEFAULTS.initiatorPct, 0, 100);
  // A bad admin entry must never pay out more than the pool.
  if (winnerPct + initiatorPct > 100) {
    winnerPct = BATTLE_DEFAULTS.winnerPct;
    initiatorPct = BATTLE_DEFAULTS.initiatorPct;
  }
  return {
    enabled: on === true || on === 'true' || on === 1 || on === '1',
    winnerPct,
    initiatorPct,
    minMinutes,
    maxMinutes,
  };
}

export function battleSettingsForApi(s: BattleSettings) {
  return {
    [BATTLE_KEYS.enabled]: s.enabled,
    [BATTLE_KEYS.winnerPct]: s.winnerPct,
    [BATTLE_KEYS.initiatorPct]: s.initiatorPct,
    [BATTLE_KEYS.minMinutes]: s.minMinutes,
    [BATTLE_KEYS.maxMinutes]: s.maxMinutes,
  };
}

export function winnerSide(red: bigint, blue: bigint): Side | null {
  return red === blue ? null : red > blue ? 'red' : 'blue';
}

export type Payout = { userId: bigint; role: 'winner' | 'initiator'; amount: bigint };

/**
 * Coins paid when a battle ends. Pools are floored; the winner pool is split evenly, the
 * remainder coins stay unpaid. A draw pays nothing; no seated winners = no winner payout.
 */
export function splitPayout(p: {
  red: bigint;
  blue: bigint;
  winnerPct: number;
  initiatorPct: number;
  initiatorId: bigint;
  winnerIds: readonly bigint[];
}): Payout[] {
  const side = winnerSide(p.red, p.blue);
  if (!side) return [];
  const total = p.red + p.blue;
  const out: Payout[] = [];
  const each =
    p.winnerIds.length > 0
      ? (total * BigInt(Math.round(p.winnerPct * 100))) / 10000n / BigInt(p.winnerIds.length)
      : 0n;
  if (each > 0n) for (const userId of p.winnerIds) out.push({ userId, role: 'winner', amount: each });
  const init = (total * BigInt(Math.round(p.initiatorPct * 100))) / 10000n;
  if (init > 0n) out.push({ userId: p.initiatorId, role: 'initiator', amount: init });
  return out;
}

/** Host / co-host / staff admin, like Musical Chair. */
export function canRunBattle(
  userId: bigint,
  roles: { hostId: bigint | null; coHostId: bigint | null; staffAdminIds: readonly bigint[] },
): boolean {
  return (
    roles.hostId === userId ||
    roles.coHostId === userId ||
    roles.staffAdminIds.some((id) => id === userId)
  );
}

export type BattleEvent = {
  battle_id: number;
  /** started | score | ended | cancelled */
  state: string;
  initiator_id: number;
  version: number;
  red_total: number;
  blue_total: number;
  /** live | won | draw | cancelled */
  status: string;
  winner_side: Side | null;
  winner_pct: number;
  initiator_pct: number;
  ends_at_ms: number;
  now_ms: number;
  payouts: { user_id: number; role: string; amount: number }[];
};

export function battleEvent(
  b: {
    id: bigint;
    initiatorId: bigint;
    version: number;
    redTotal: bigint;
    blueTotal: bigint;
    status: string;
    winnerSide: string | null;
    winnerPct: number;
    initiatorPct: number;
    endsAt: Date;
  },
  state: string,
  payouts: Payout[] = [],
  now: Date = new Date(),
): BattleEvent {
  return {
    battle_id: Number(b.id),
    state,
    initiator_id: Number(b.initiatorId),
    version: b.version,
    red_total: Number(b.redTotal),
    blue_total: Number(b.blueTotal),
    status: b.status,
    winner_side: (b.winnerSide as Side | null) ?? null,
    winner_pct: b.winnerPct,
    initiator_pct: b.initiatorPct,
    ends_at_ms: b.endsAt.getTime(),
    now_ms: now.getTime(),
    payouts: payouts.map((p) => ({
      user_id: Number(p.userId),
      role: p.role,
      amount: Number(p.amount),
    })),
  };
}

export const battleCommand = (e: BattleEvent) => `CMD:BATTLE:${JSON.stringify(e)}`;
