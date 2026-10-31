import {
  BadRequestException,
  CallHandler,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { tierOf } from '../../common/admin-tier';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Path of an /admin/* route without the API prefix and query, or null for any other route. */
export function adminPath(url: string): string | null {
  const m = /^\/(?:[^?]*?\/)?(admin(?:\/[^?]*)?)(?:\?|$)/.exec(url);
  return m ? `/${m[1]}` : null;
}

/** Copy of a request body with password-like fields masked, for storing after a decision. */
export function redact(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redact);
  if (body && typeof body === 'object') {
    return Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, /pass|secret|token/i.test(k) ? '***' : redact(v)]),
    );
  }
  return body;
}

/**
 * Every change a non-superadmin staff member makes in the panel (POST/PUT/PATCH/DELETE on /admin/*)
 * is parked as a pending approval instead of running. Runs after the guards, so a request a staff
 * tier may not make at all is still a plain 403 and never queued.
 */
@Injectable()
export class AdminApprovalInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const path = adminPath(req.url);
    const user = req.user;
    if (!path || !MUTATING.has(req.method) || !user || user.role !== 'admin') return next.handle();
    if (tierOf(user.role, user.staffBadgeType) === 'superadmin') return next.handle();
    // Plain file upload only stores a file and returns its URL; the save that uses it is gated.
    if (path === '/admin/upload') return next.handle();
    if (req.isMultipart?.()) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'SUPERADMIN_ONLY', message: 'Only the Super Admin can do this.' },
      });
    }
    const row = await this.prisma.adminApproval.create({
      data: {
        requesterId: user.id,
        method: req.method,
        url: req.url,
        body: (req.body ?? undefined) as object | undefined,
      },
    });
    throw new ForbiddenException({
      success: false,
      error: {
        code: 'APPROVAL_PENDING',
        message: `Sent to Super Admin for approval (request #${row.id}). It will apply once approved.`,
      },
    });
  }
}

@Roles('admin')
@MinTier('superadmin')
@Controller('admin/approvals')
export class AdminApprovalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpAdapterHost,
  ) {}

  @Get()
  async list(@Query('status') status?: string) {
    const rows = await this.prisma.adminApproval.findMany({
      where: status && status !== 'all' ? { status } : {},
      orderBy: { id: 'desc' },
      take: 200,
    });
    const ids = [...new Set(rows.flatMap((r) => [r.requesterId, r.decidedById]).filter((x): x is bigint => x != null))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, staffBadgeType: true },
    });
    const byId = new Map(users.map((u) => [String(u.id), u]));
    const who = (id: bigint | null) => {
      const u = id == null ? undefined : byId.get(String(id));
      return u ? { id: Number(u.id), name: u.name ?? u.email ?? `#${u.id}`, tier: u.staffBadgeType ?? 'admin' } : null;
    };
    return {
      approvals: rows.map((r) => ({
        id: Number(r.id),
        method: r.method,
        path: adminPath(r.url) ?? r.url,
        url: r.url,
        body: redact(r.body),
        status: r.status,
        result: r.result,
        requester: who(r.requesterId),
        decided_by: who(r.decidedById),
        created_at: r.createdAt,
        decided_at: r.decidedAt,
      })),
    };
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: FastifyRequest) {
    const row = await this.claim(id, me, 'processing');
    // Replay the original request through the full stack as the superadmin, so every guard,
    // validation and service rule still applies. The superadmin passes this interceptor.
    const app = this.http.httpAdapter.getInstance<FastifyInstance>();
    const res = await app.inject({
      method: row.method as 'POST',
      url: row.url,
      headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
      ...(row.body == null ? {} : { payload: JSON.stringify(row.body) }),
    });
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    let result = `HTTP ${res.statusCode}`;
    if (!ok) {
      try {
        const b = JSON.parse(res.body) as { error?: { message?: string }; message?: string };
        result = b.error?.message ?? b.message ?? result;
      } catch {
        // keep status text
      }
    }
    await this.prisma.adminApproval.update({
      where: { id: row.id },
      data: { status: ok ? 'approved' : 'failed', result, body: redact(row.body) as object | undefined },
    });
    if (!ok) throw new BadRequestException({ success: false, error: { code: 'APPROVAL_FAILED', message: result } });
    return { id: Number(row.id), status: 'approved' };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const row = await this.claim(id, me, 'rejected');
    await this.prisma.adminApproval.update({ where: { id: row.id }, data: { body: redact(row.body) as object | undefined } });
    return { id: Number(row.id), status: 'rejected' };
  }

  /** Atomically moves a pending request to `status`, so a double click cannot run it twice. */
  private async claim(id: string, me: AuthUser, status: string) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid id');
    const claimed = await this.prisma.adminApproval.updateMany({
      where: { id: BigInt(id), status: 'pending' },
      data: { status, decidedById: me.id, decidedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException({ success: false, error: { code: 'NOT_PENDING', message: 'This request is no longer pending.' } });
    }
    return this.prisma.adminApproval.findUniqueOrThrow({ where: { id: BigInt(id) } });
  }
}
