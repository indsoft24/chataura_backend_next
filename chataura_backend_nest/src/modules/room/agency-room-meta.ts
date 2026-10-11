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

  // The old "gift cashback" bar is retired (it never paid out); Room Reward Levels replace it.
  return { agency_linked: true, agency_cashback: null };
}
