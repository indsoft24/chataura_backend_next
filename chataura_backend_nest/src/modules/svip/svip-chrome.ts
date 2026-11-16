/**
 * SVIP fields other users see (seats, room members, profiles). Pure and synchronous so every
 * serializer can add them from an included `user.svip` row without extra queries.
 *
 * Uses the stored status, which the hourly renewal job moves to 'expired' after grace; perks
 * may therefore outlive the grace window by up to one job run.
 */

export type SvipChromeRow =
  | {
      level: number;
      status: string;
      bubbleOn: boolean;
      roomCardOn: boolean;
      micWaveOn: boolean;
      profileBgUrl?: string | null;
      periodEndsAt?: Date;
    }
  | null
  | undefined;

export function svipLevelOf(m: SvipChromeRow): number {
  return m && m.status !== 'expired' && m.level > 0 ? m.level : 0;
}

/** Past the paid period (grace): the title, entrance, chat bubble and frame stay; every other perk is off. */
export function svipInGrace(m: SvipChromeRow): boolean {
  return !!m && svipLevelOf(m) > 0 && !!m.periodEndsAt && Date.now() >= m.periodEndsAt.getTime();
}

/** The level for the extra perks (pictures, visitors, SVIP gifts / emoji, background...). 0 in grace. */
export function svipFullLevelOf(m: SvipChromeRow): number {
  return svipInGrace(m) ? 0 : svipLevelOf(m);
}

/** Custom profile background, only while SVIP is fully active (not in grace). */
export function svipProfileBg(m: SvipChromeRow): string | null {
  return svipFullLevelOf(m) > 0 ? (m!.profileBgUrl ?? null) : null;
}

export function svipClientFields(m: SvipChromeRow) {
  const level = svipLevelOf(m);
  const full = svipFullLevelOf(m) > 0;
  return {
    svip_level: level,
    svip: level
      ? {
          level,
          bubble: m!.bubbleOn,
          room_card: full && m!.roomCardOn,
          mic_wave: full && m!.micWaveOn,
        }
      : null,
  };
}
