import { PrismaService } from '../../common/prisma/prisma.service';

export type AgencyCashbackProgress = {
  enabled: boolean;
  current: number;
  threshold: number;
  cycle: number;
  progress_percent: number;
};

export type AgencyRoomMeta = {
  agency_linked: boolean;
  agency_cashback: AgencyCashbackProgress | null;
};

/**
 * Resolve whether a room owner is agency-linked and the cashback progress shell
 * Android expects on room join / heartbeat / gift responses.
 */
export async function resolveAgencyRoomMeta(
  prisma: PrismaService,
  ownerId: bigint,
  roomId: string,
): Promise<AgencyRoomMeta> {
  const affiliation = await prisma.agencyAffiliation.findFirst({
    where: {
      roomOwnerId: ownerId,
      status: 'accepted',
      OR: [{ roomId }, { roomId: null }],
    },
  });

  const agency_linked = !!affiliation;
  if (!agency_linked) {
    return { agency_linked: false, agency_cashback: null };
  }

  let enabled = true;
  let threshold = 2000;
  try {
    const setting = await prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    const extra = (setting?.extraSettings as Record<string, unknown>) ?? {};
    if (extra.agency_cashback_enabled === false) enabled = false;
    const rawThreshold = extra.agency_cashback_threshold_coins;
    if (typeof rawThreshold === 'number' && Number.isFinite(rawThreshold)) {
      threshold = Math.max(0, Math.floor(rawThreshold));
    } else if (typeof rawThreshold === 'string' && rawThreshold.trim()) {
      const n = Number(rawThreshold);
      if (Number.isFinite(n)) threshold = Math.max(0, Math.floor(n));
    }
  } catch {
    /* keep defaults */
  }

  return {
    agency_linked: true,
    agency_cashback: {
      enabled,
      current: 0,
      threshold,
      cycle: 0,
      progress_percent: 0,
    },
  };
}
