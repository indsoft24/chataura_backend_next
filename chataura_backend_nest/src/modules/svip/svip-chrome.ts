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
    }
  | null
  | undefined;

export function svipLevelOf(m: SvipChromeRow): number {
  return m && m.status !== 'expired' && m.level > 0 ? m.level : 0;
}

/** Custom profile background, only while SVIP is active. */
export function svipProfileBg(m: SvipChromeRow): string | null {
  return svipLevelOf(m) > 0 ? (m!.profileBgUrl ?? null) : null;
}

export function svipClientFields(m: SvipChromeRow) {
  const level = svipLevelOf(m);
  return {
    svip_level: level,
    svip: level
      ? {
          level,
          bubble: m!.bubbleOn,
          room_card: m!.roomCardOn,
          mic_wave: m!.micWaveOn,
        }
      : null,
  };
}
