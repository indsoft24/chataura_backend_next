import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { freeSlot, medalLive, wornMedals } from './medal.rules';

function medalError(code: string, message: string): never {
  throw new BadRequestException({ success: false, error: { code, message } });
}

@Injectable()
export class MedalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Medal wall: every active medal, owned ones first, with what unlocks the rest. */
  async mine(userId: bigint) {
    const now = new Date();
    const [medals, owned] = await Promise.all([
      this.prisma.medal.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.userMedal.findMany({ where: { userId } }),
    ]);
    const byMedal = new Map(owned.map((o) => [o.medalId.toString(), o]));
    const items = medals.map((m) => {
      const o = byMedal.get(m.id.toString());
      const live = !!o && medalLive(o.expiresAt, now);
      return {
        id: Number(m.id),
        name: m.name,
        description: m.description,
        image_url: m.imageUrl,
        svip_level_required: m.svipLevel,
        owned: live,
        expires_at: live ? (o.expiresAt?.toISOString() ?? null) : null,
        worn_slot: live ? o.wornSlot : null,
      };
    });
    items.sort((a, b) => Number(b.owned) - Number(a.owned));
    return { items, worn: await wornMedals(this.prisma, userId, now) };
  }

  async wear(userId: bigint, medalId: bigint) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medal_${userId}`}))`;
      const now = new Date();
      const row = await tx.userMedal.findUnique({
        where: { userId_medalId: { userId, medalId } },
      });
      if (!row || !medalLive(row.expiresAt, now))
        medalError('NOT_OWNED', 'You do not own this medal');
      if (row.wornSlot != null) return;
      const worn = await tx.userMedal.findMany({
        where: { userId, wornSlot: { not: null } },
        select: { wornSlot: true, expiresAt: true },
      });
      const slot = freeSlot(
        worn.filter((w) => medalLive(w.expiresAt, now)).map((w) => w.wornSlot!),
      );
      if (slot == null)
        medalError('SLOTS_FULL', 'Take off a medal first (3 at most)');
      // An expired medal may still hold this slot; free it.
      await tx.userMedal.updateMany({
        where: { userId, wornSlot: slot },
        data: { wornSlot: null },
      });
      await tx.userMedal.update({
        where: { id: row.id },
        data: { wornSlot: slot },
      });
    });
    return this.mine(userId);
  }

  async remove(userId: bigint, medalId: bigint) {
    await this.prisma.userMedal.updateMany({
      where: { userId, medalId },
      data: { wornSlot: null },
    });
    return this.mine(userId);
  }
}
