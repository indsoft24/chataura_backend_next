import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { presenceFields } from '../../common/presence/online-status';
import {
  normalizeCountries,
  normalizeWhatsappNumber,
  readCoinSellerTemplate,
} from './coin-seller.rules';

/** Only real, active sellers are ever shown — a demoted/banned/deleted seller disappears. */
const LIVE_SELLER: Prisma.UserWhereInput = {
  role: 'seller',
  deletedAt: null,
  accountStatus: 'active',
  isSuspended: false,
};

const SELLER_USER_SELECT = {
  id: true,
  displayId: true,
  name: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  phone: true,
  isOnline: true,
  lastSeenAt: true,
  showOnlineStatus: true,
  deletedAt: true,
  accountStatus: true,
  isSuspended: true,
} satisfies Prisma.UserSelect;

type SellerUser = Prisma.UserGetPayload<{ select: typeof SELLER_USER_SELECT }>;

function toNumber(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new BadRequestException(`Invalid ${field}`);
  return n;
}

function validNumber(input: unknown): string {
  try {
    return normalizeWhatsappNumber(input);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

@Injectable()
export class CoinSellerService {
  constructor(private readonly prisma: PrismaService) {}

  private async template() {
    const s = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    return readCoinSellerTemplate(s?.extraSettings as Record<string, unknown>);
  }

  // ── App: GET /wallet/coin-sellers ──

  async listForViewer(viewerId: bigint) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, country: true, lastClientCountry: true },
    });
    // Sellers recharge through wholesale packages, not through other sellers.
    if (!viewer || viewer.role === 'seller') return { template: await this.template(), sellers: [] };

    const country = (viewer.lastClientCountry ?? viewer.country ?? '').trim().toUpperCase();
    const rows = await this.prisma.coinSellerContact.findMany({
      where: {
        isActive: true,
        userId: { not: viewerId },
        user: LIVE_SELLER,
        // Unknown viewer country: show everyone rather than an empty tab.
        ...(country ? { OR: [{ countries: { isEmpty: true } }, { countries: { has: country } }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { user: { select: SELLER_USER_SELECT } },
    });

    return {
      template: await this.template(),
      sellers: rows.map((r) => ({
        id: Number(r.id),
        user_id: Number(r.userId),
        display_id: r.user.displayId,
        name: r.user.displayName ?? r.user.name ?? r.user.displayId,
        avatar_url: r.user.avatarUrl,
        is_online: presenceFields(r.user).is_online,
        whatsapp: r.whatsappE164,
      })),
    };
  }

  // ── Admin ──

  private adminRow(r: { id: bigint; whatsappE164: string; countries: string[]; sortOrder: number; isActive: boolean; user: SellerUser }) {
    const u = r.user;
    return {
      id: Number(r.id),
      whatsapp: r.whatsappE164,
      countries: r.countries,
      sort_order: r.sortOrder,
      is_active: r.isActive,
      // Shown in admin so a listed-but-hidden seller is obvious.
      visible_in_app:
        r.isActive && u.role === 'seller' && !u.deletedAt && u.accountStatus === 'active' && !u.isSuspended,
      user: {
        id: Number(u.id),
        display_id: u.displayId,
        name: u.displayName ?? u.name,
        avatar_url: u.avatarUrl,
        role: u.role,
        phone: u.phone,
        is_online: presenceFields(u).is_online,
      },
    };
  }

  async adminList() {
    const rows = await this.prisma.coinSellerContact.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { user: { select: SELLER_USER_SELECT } },
    });
    return { template: await this.template(), sellers: rows.map((r) => this.adminRow(r)) };
  }

  async adminCreate(body: Record<string, unknown>) {
    const userId = BigInt(toNumber(body.user_id, 'user_id'));
    const whatsappE164 = validNumber(body.whatsapp);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (user.role !== 'seller') throw new BadRequestException('User is not a coin seller. Set role to Coin Seller first.');

    const last = await this.prisma.coinSellerContact.aggregate({ _max: { sortOrder: true } });
    try {
      const row = await this.prisma.coinSellerContact.create({
        data: {
          userId,
          whatsappE164,
          countries: normalizeCountries(body.countries),
          isActive: body.is_active === undefined ? true : Boolean(body.is_active),
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        include: { user: { select: SELLER_USER_SELECT } },
      });
      return this.adminRow(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('This seller is already listed');
      }
      throw e;
    }
  }

  async adminUpdate(id: bigint, body: Record<string, unknown>) {
    const data: Prisma.CoinSellerContactUpdateInput = {};
    if (body.whatsapp !== undefined) data.whatsappE164 = validNumber(body.whatsapp);
    if (body.countries !== undefined) data.countries = normalizeCountries(body.countries);
    if (body.is_active !== undefined) data.isActive = Boolean(body.is_active);
    try {
      const row = await this.prisma.coinSellerContact.update({
        where: { id },
        data,
        include: { user: { select: SELLER_USER_SELECT } },
      });
      return this.adminRow(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Seller entry not found');
      }
      throw e;
    }
  }

  async adminDelete(id: bigint) {
    await this.prisma.coinSellerContact.deleteMany({ where: { id } });
    return { deleted: true };
  }

  /** Saves the full order the admin sees (ids top → bottom). */
  async adminReorder(ids: unknown) {
    if (!Array.isArray(ids) || ids.length > 500) throw new BadRequestException('ids must be an array');
    const list = ids.map((v) => BigInt(toNumber(v, 'id')));
    await this.prisma.$transaction(
      list.map((id, index) =>
        this.prisma.coinSellerContact.updateMany({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.adminList();
  }
}
