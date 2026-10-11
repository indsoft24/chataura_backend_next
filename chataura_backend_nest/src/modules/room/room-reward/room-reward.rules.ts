/**
 * Room Reward presence and partner rules (pure, unit tested).
 */

/** Heartbeats arrive every ~15 s; a member is "here" if one arrived within this window. */
export const MIN_LIVENESS_MS = 45_000;

/**
 * Start of a member's continuous stay after a join / heartbeat at [now]. A gap since the last
 * heartbeat shorter than [gapMs] (brief drop, rejoin, app switch) keeps the original start;
 * anything longer — or no previous stay — starts a new one.
 */
export function nextStayStart(
  prev: { stayStartedAt: Date | null; lastHeartbeatAt: Date | null } | null,
  now: Date,
  gapMs: number,
): Date {
  if (!prev?.stayStartedAt || !prev.lastHeartbeatAt) return now;
  const gap = now.getTime() - prev.lastHeartbeatAt.getTime();
  return gap <= Math.max(gapMs, MIN_LIVENESS_MS) ? prev.stayStartedAt : now;
}

export type MemberPresence = {
  userId: bigint;
  isActive: boolean;
  stayStartedAt: Date | null;
  lastHeartbeatAt: Date | null;
};

/**
 * Qualified visitor: in the room now (active, recent heartbeat), continuously for at least
 * [presenceMs], and not the room owner. Seating is not required.
 */
export function isQualifiedVisitor(
  m: MemberPresence,
  ownerId: bigint,
  now: Date,
  presenceMs: number,
  gapMs: number,
): boolean {
  if (!m.isActive || m.userId === ownerId) return false;
  if (!m.stayStartedAt || !m.lastHeartbeatAt) return false;
  const live = now.getTime() - m.lastHeartbeatAt.getTime() <= Math.max(gapMs, MIN_LIVENESS_MS);
  return live && now.getTime() - m.stayStartedAt.getTime() >= presenceMs;
}

export type PartnerCandidate = {
  userId: bigint;
  /** Coins gifted in this room toward the level being paid. */
  giftedCoins: bigint;
  stayStartedAt: Date;
};

export type RankedPartner = PartnerCandidate & { rank: number; staySeconds: number };

/**
 * Partners for a level: qualified visitors ranked by
 *   1. coins gifted toward this level (most first)
 *   2. continuous stay (longest first)
 *   3. account id (stable tie-break, so a re-run picks the same people)
 * Non-gifters naturally fill remaining slots by stay time. Returns at most [slots].
 */
export function rankPartners(
  candidates: PartnerCandidate[],
  slots: number,
  now: Date,
): RankedPartner[] {
  if (slots <= 0) return [];
  return [...candidates]
    .sort((a, b) => {
      if (a.giftedCoins !== b.giftedCoins) return a.giftedCoins > b.giftedCoins ? -1 : 1;
      const sa = a.stayStartedAt.getTime();
      const sb = b.stayStartedAt.getTime();
      if (sa !== sb) return sa - sb;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    })
    .slice(0, slots)
    .map((c, i) => ({
      ...c,
      rank: i + 1,
      staySeconds: Math.max(0, Math.floor((now.getTime() - c.stayStartedAt.getTime()) / 1000)),
    }));
}

/** Gifts that count toward room levels: not CP/BCP, not sent by the room owner. */
export function giftCountsForRoomReward(
  category: string | null | undefined,
  senderId: bigint,
  ownerId: bigint,
): boolean {
  const c = (category ?? '').toLowerCase();
  if (c === 'cp' || c === 'bcp') return false;
  return senderId !== ownerId;
}
