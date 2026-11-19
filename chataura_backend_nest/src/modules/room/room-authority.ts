/**
 * Who holds the host's powers while the host is away from the room.
 *
 * The room owner is always the host; the host role itself never moves. While the host is not
 * an active member, ONE person acts for them, in this order:
 *   1. the co-host the host appointed,
 *   2. else a room admin (earliest appointed),
 *   3. else a seated member (lowest seat number).
 * The acting person keeps the role while they stay in the room — a later arrival only takes
 * over when it ranks strictly higher (an admin replaces an acting seated member; the host's
 * own co-host replaces anyone). When the host is back the result is null and full control
 * returns to the host.
 */
export type AuthorityInput = {
  hostId: bigint;
  coHostId: bigint | null;
  currentActingId: bigint | null;
  /** Active room members (room_members.is_active). */
  activeIds: ReadonlySet<string>;
  /** Room admins, earliest appointed first. */
  adminIds: readonly bigint[];
  /** Occupied seats (any order). */
  seats: ReadonlyArray<{ seatIndex: number; userId: bigint }>;
  maxSeats: number;
};

export function resolveActingHost(input: AuthorityInput): bigint | null {
  const host = input.hostId.toString();
  if (input.activeIds.has(host)) return null;
  const eligible = (id: bigint | null): id is bigint =>
    id != null && id.toString() !== host && input.activeIds.has(id.toString());

  if (eligible(input.coHostId)) return input.coHostId;

  const admin = input.adminIds.find((id) => eligible(id)) ?? null;
  const current = eligible(input.currentActingId)
    ? input.currentActingId
    : null;
  if (current != null) {
    const currentIsAdmin = input.adminIds.some((id) => id === current);
    if (currentIsAdmin || admin == null) return current;
  }
  if (admin != null) return admin;

  const seated = [...input.seats]
    .filter((s) => s.seatIndex > 0 && s.seatIndex < input.maxSeats)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .find((s) => eligible(s.userId));
  return seated?.userId ?? null;
}

export type BlockInput = {
  actorId: bigint;
  targetId: bigint;
  ownerId: bigint;
  hostId: bigint | null;
  actingHostId: bigint | null;
  coHostId: bigint | null;
  adminIds: readonly bigint[];
};

/**
 * Who may kick or ban whom. The host (and the acting host) may act on anyone but the owner.
 * The co-host and room admins may act on ordinary members only: never the owner, host, acting
 * host, co-host, another admin, or themselves.
 */
export function canBlockTarget(i: BlockInput): boolean {
  if (i.targetId === i.ownerId) return false;
  if (i.actorId === i.hostId || i.actorId === i.actingHostId) return true;
  const staff = i.actorId === i.coHostId || i.adminIds.includes(i.actorId);
  if (!staff) return false;
  const protectedIds = [i.hostId, i.actingHostId, i.coHostId, ...i.adminIds];
  return !protectedIds.includes(i.targetId) && i.targetId !== i.actorId;
}
