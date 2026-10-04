import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentSource, Prisma, PurchaseStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WalletService, describeError, gatewayDetails } from '../wallet/wallet.service';
import {
  INDIAN_STATES,
  IndianState,
  placeOfSupplyLabel,
  resolveIndianState,
} from '../../common/gst/indian-states';

type Query = Record<string, string | undefined>;

type GstConfig = {
  legal_name: string;
  gstin: string;
  supplier_state: string | null;
  supplier_state_code: string | null;
  rate: number;
  prices_inclusive: boolean;
  sac: string;
  document_prefix: string;
  inr_per_usd: number;
  configured: boolean;
};

const PURCHASE_INCLUDE = {
  user: {
    select: {
      id: true,
      displayId: true,
      name: true,
      displayName: true,
      email: true,
      phone: true,
      avatarUrl: true,
      country: true,
      lastClientCountry: true,
    },
  },
} satisfies Prisma.CoinPurchaseTransactionInclude;

type PurchaseRow = Prisma.CoinPurchaseTransactionGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

type TaxedRow = ReturnType<AdminRechargeService['taxRow']>;

const IST = 'Asia/Kolkata';
const STATUSES: PurchaseStatus[] = ['success', 'pending', 'failed'];
const SOURCES: PaymentSource[] = ['RAZORPAY', 'EARNINGS_WALLET', 'MOCK'];
const EXPORT_LIMIT = 50000;

/** Razorpay captured the money but our order never became successful (coins not credited). */
const NEEDS_REVIEW: Prisma.CoinPurchaseTransactionWhereInput = { gatewayStatus: 'captured', status: { not: 'success' } };

const STATE_SOURCE_LABEL: Record<string, string> = {
  client: 'Sent by app at checkout',
  ip: 'Estimated from IP address',
  previous: "From buyer's earlier recharge",
  admin: 'Set by admin',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(code: string | null | undefined): string {
  if (!code) return '';
  const c = code.trim().toUpperCase();
  if (c === 'INDIA' || c === 'IND') return 'India';
  if (/^[A-Z]{2}$/.test(c)) {
    try {
      return regionNames.of(c) ?? c;
    } catch {
      return c;
    }
  }
  return code;
}

function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: Number(get('year')), m: Number(get('month')), day: get('day'), time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

/** Indian financial year (April–March) in IST, e.g. "2026-27". */
function financialYear(d: Date): string {
  const { y, m } = istParts(d);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function istDate(d: Date): string {
  const p = istParts(d);
  return `${p.day}-${String(p.m).padStart(2, '0')}-${p.y}`;
}

function gatewayCells(r: { gateway: Record<string, any> | null; needs_review: boolean }) {
  const g = r.gateway ?? {};
  const card = [g.card_network, g.card_type, g.card_last4 ? `•••• ${g.card_last4}` : null, g.card_issuer].filter(Boolean).join(' ');
  return {
    g_vpa: g.vpa ?? '',
    g_bank: g.bank ?? g.wallet ?? '',
    g_card: card,
    g_international: g.international === true ? 'Yes' : g.international === false ? 'No' : '',
    g_rrn: g.rrn ?? '',
    g_contact: g.contact ?? '',
    g_email: g.email ?? '',
    g_fee: g.fee ?? null,
    g_tax: g.tax ?? null,
    g_error: [g.error_reason, g.error_description].filter(Boolean).join(' — '),
    g_resolution:
      g.admin_resolution === 'paid_without_credit' ? 'Paid, no coins' : g.admin_resolution === 'imported_from_razorpay' ? 'Imported from Razorpay' : '',
    review: r.needs_review ? 'YES' : '',
  };
}

@Injectable()
export class AdminRechargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // ──────────────────────────────────────────────
  // GST configuration (stored in admin_settings.extra_settings)
  // ──────────────────────────────────────────────

  async gstConfig(): Promise<GstConfig> {
    const setting = await this.prisma.adminSetting.findUnique({
      where: { id: 1 },
      select: { extraSettings: true },
    });
    const extra = (setting?.extraSettings as Record<string, unknown>) ?? {};
    const supplier = resolveIndianState(extra.gst_supplier_state as string | undefined);
    const rate = Number(extra.gst_rate ?? 18);
    const inrPerUsd = Number(extra.inr_per_usd ?? 83.5);
    return {
      legal_name: String(extra.gst_legal_name ?? ''),
      gstin: String(extra.gst_gstin ?? '').toUpperCase(),
      supplier_state: supplier?.name ?? null,
      supplier_state_code: supplier?.code ?? null,
      rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 18,
      prices_inclusive: extra.gst_prices_inclusive !== false,
      sac: String(extra.gst_sac ?? '998439'),
      document_prefix: String(extra.gst_document_prefix ?? 'CA/'),
      inr_per_usd: Number.isFinite(inrPerUsd) && inrPerUsd > 0 ? inrPerUsd : 83.5,
      configured: !!supplier,
    };
  }

  async updateGstConfig(body: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if (body.legal_name !== undefined) patch.gst_legal_name = String(body.legal_name ?? '').trim().slice(0, 200);
    if (body.gstin !== undefined) {
      const gstin = String(body.gstin ?? '').trim().toUpperCase();
      if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) {
        throw new BadRequestException('GSTIN must be 15 characters, starting with the 2-digit state code');
      }
      patch.gst_gstin = gstin;
    }
    if (body.supplier_state !== undefined) {
      const s = resolveIndianState(body.supplier_state as string);
      if (body.supplier_state && !s) throw new BadRequestException('Unknown supplier state');
      patch.gst_supplier_state = s?.name ?? null;
    }
    if (body.rate !== undefined) {
      const r = Number(body.rate);
      if (!Number.isFinite(r) || r < 0 || r > 100) throw new BadRequestException('GST rate must be between 0 and 100');
      patch.gst_rate = r;
    }
    if (body.prices_inclusive !== undefined) patch.gst_prices_inclusive = Boolean(body.prices_inclusive);
    if (body.sac !== undefined) patch.gst_sac = String(body.sac ?? '').trim().slice(0, 16);
    if (body.document_prefix !== undefined) patch.gst_document_prefix = String(body.document_prefix ?? '').slice(0, 16);
    if (body.inr_per_usd !== undefined) {
      const fx = Number(body.inr_per_usd);
      if (!Number.isFinite(fx) || fx <= 0) throw new BadRequestException('INR per USD must be a positive number');
      patch.inr_per_usd = fx;
    }

    const gstinState = typeof patch.gst_gstin === 'string' && patch.gst_gstin ? patch.gst_gstin.slice(0, 2) : null;
    const supplierName = (patch.gst_supplier_state as string | undefined) ?? (await this.gstConfig()).supplier_state;
    const supplierCode = resolveIndianState(supplierName)?.code;
    if (gstinState && supplierCode && gstinState !== supplierCode) {
      throw new BadRequestException(`GSTIN state code ${gstinState} does not match supplier state (${supplierCode})`);
    }

    const current = await this.prisma.adminSetting.findUnique({ where: { id: 1 } });
    const extra = { ...((current?.extraSettings as Record<string, unknown>) ?? {}), ...patch };
    await this.prisma.adminSetting.upsert({
      where: { id: 1 },
      create: { id: 1, extraSettings: extra as Prisma.InputJsonValue },
      update: { extraSettings: extra as Prisma.InputJsonValue },
    });
    return { config: await this.gstConfig() };
  }

  // ──────────────────────────────────────────────
  // Filtering
  // ──────────────────────────────────────────────

  private where(query: Query): Prisma.CoinPurchaseTransactionWhereInput {
    const and: Prisma.CoinPurchaseTransactionWhereInput[] = [];
    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      const or: Prisma.CoinPurchaseTransactionWhereInput[] = [
        { razorpayOrderId: { contains: q, mode: 'insensitive' } },
        { razorpayPaymentId: { contains: q, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { displayId: q },
            ],
          },
        },
      ];
      if (/^\d{1,18}$/.test(q)) or.push({ id: BigInt(q) }, { userId: BigInt(q) });
      and.push({ OR: or });
    }
    const userId = query.user_id?.trim();
    if (userId && /^\d{1,18}$/.test(userId)) and.push({ userId: BigInt(userId) });

    const statuses = (query.status ?? '').split(',').filter((s): s is PurchaseStatus => STATUSES.includes(s as PurchaseStatus));
    if (statuses.length) and.push({ status: { in: statuses } });

    const sources = (query.source ?? '').split(',').filter((s): s is PaymentSource => SOURCES.includes(s as PaymentSource));
    if (sources.length) and.push({ paymentSource: { in: sources } });

    if (query.currency?.trim()) and.push({ currency: { equals: query.currency.trim(), mode: 'insensitive' } });

    const country = query.country?.trim();
    if (country === '__none__') and.push({ country: null });
    else if (country) and.push({ country: { equals: country, mode: 'insensitive' } });

    const state = query.state?.trim();
    if (state === '__unknown__') and.push({ state: null });
    else if (state) and.push({ state: resolveIndianState(state)?.name ?? state });

    if (query.market === 'domestic') and.push({ OR: [{ currency: 'INR' }, { country: { in: ['IN', 'in', 'India', 'IND'] } }] });
    else if (query.market === 'export') {
      and.push({ NOT: { currency: 'INR' } }, { OR: [{ country: null }, { NOT: { country: { in: ['IN', 'in', 'India', 'IND'] } } }] });
    }

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lte: to } });

    if (query.review === '1') and.push(NEEDS_REVIEW);

    const min = Number(query.min_amount);
    const max = Number(query.max_amount);
    if (query.min_amount && Number.isFinite(min) && min > 0) and.push({ amountMinor: { gte: Math.round(min * 100) } });
    if (query.max_amount && Number.isFinite(max) && max >= 0) and.push({ amountMinor: { lte: Math.round(max * 100) } });

    return and.length ? { AND: and } : {};
  }

  private order(query: Query): Prisma.CoinPurchaseTransactionOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    switch (query.sort) {
      case 'amount':
        return [{ amountMinor: dir }, { id: dir }];
      case 'coins':
        return [{ coinsCredited: dir }, { id: dir }];
      case 'user':
        return [{ userId: dir }, { id: 'desc' }];
      case 'state':
        return [{ state: { sort: dir, nulls: 'last' } }, { id: 'desc' }];
      case 'country':
        return [{ country: { sort: dir, nulls: 'last' } }, { id: 'desc' }];
      default:
        return [{ id: dir }];
    }
  }

  // ──────────────────────────────────────────────
  // GST computation
  // ──────────────────────────────────────────────

  private isDomestic(p: { currency: string; country: string | null }) {
    const c = (p.country ?? '').trim().toUpperCase();
    return p.currency.toUpperCase() === 'INR' || c === 'IN' || c === 'IND' || c === 'INDIA';
  }

  /**
   * GST view of one recharge. Only successful Razorpay payments are taxable
   * supplies — pending/failed orders never completed, and earnings-wallet
   * purchases are paid in in-app balance, not money.
   *
   * Place of supply: the buyer's state captured at checkout (app, IP lookup or
   * carried from an earlier recharge) or corrected by an admin. With no address on record it falls back to the supplier's state,
   * per Sec. 12(2)(b) IGST Act.
   */
  taxRow(p: PurchaseRow, cfg: GstConfig) {
    const gross = p.amountMinor / 100;
    // Country chosen at checkout; fall back to what the app last reported, then the profile.
    const country = p.country ?? p.user.lastClientCountry ?? p.user.country ?? null;
    const domestic = this.isDomestic({ currency: p.currency, country });
    const supplier = resolveIndianState(cfg.supplier_state);
    const captured = resolveIndianState(p.state);

    let treatment = 'Taxable';
    if (p.status !== 'success') treatment = p.status === 'pending' ? 'Excluded – payment pending' : 'Excluded – payment failed';
    else if (p.paymentSource === 'EARNINGS_WALLET') treatment = 'Excluded – paid from earnings';
    else if (p.paymentSource === 'MOCK') treatment = 'Excluded – test payment';
    const taxable = treatment === 'Taxable';

    let pos: IndianState | null = null;
    let posBasis = '';
    if (domestic) {
      if (captured) {
        pos = captured;
        posBasis = STATE_SOURCE_LABEL[p.stateSource ?? ''] ?? 'Captured at checkout';
      } else if (supplier) {
        pos = supplier;
        posBasis = 'Supplier location (no address on record)';
      } else {
        posBasis = 'Unknown – set supplier state';
      }
    }

    let supplyType = 'Export of services (zero-rated)';
    if (domestic) supplyType = !pos || !supplier ? 'Undetermined' : pos.code === supplier.code ? 'Intra-state' : 'Inter-state';

    let taxableValue: number | null = null;
    let igst: number | null = null;
    let cgst: number | null = null;
    let sgst: number | null = null;
    let totalGst: number | null = null;
    let invoiceValue: number | null = null;
    let inrValue: number | null = null;

    const cur = p.currency.toUpperCase();
    if (cur === 'INR') inrValue = gross;
    else if (cur === 'USD') inrValue = round2(gross * cfg.inr_per_usd);

    if (taxable) {
      if (domestic) {
        const rate = cfg.rate / 100;
        invoiceValue = round2(cfg.prices_inclusive ? gross : gross * (1 + rate));
        taxableValue = round2(cfg.prices_inclusive ? gross / (1 + rate) : gross);
        totalGst = round2(invoiceValue - taxableValue);
        if (supplyType === 'Intra-state') {
          cgst = round2(totalGst / 2);
          sgst = round2(totalGst - cgst);
          igst = 0;
        } else if (supplyType === 'Inter-state') {
          igst = totalGst;
          cgst = 0;
          sgst = 0;
        }
      } else {
        invoiceValue = gross;
        taxableValue = gross;
        totalGst = 0;
        igst = 0;
        cgst = 0;
        sgst = 0;
      }
    }

    return {
      id: Number(p.id),
      document_no: `${cfg.document_prefix}${financialYear(p.createdAt)}/${String(p.id).padStart(6, '0')}`,
      created_at: p.createdAt.toISOString(),
      user_id: Number(p.userId),
      user_display_id: p.user.displayId,
      user_name: p.user.displayName ?? p.user.name,
      user_email: p.user.email,
      user_phone: p.user.phone,
      user_avatar: p.user.avatarUrl,
      package_id: p.packageId !== null ? Number(p.packageId) : null,
      coins: p.coinsCredited,
      amount: gross,
      currency: cur,
      status: p.status,
      source: p.paymentSource,
      country: country ?? (domestic ? 'IN' : null),
      country_name: countryName(country ?? (domestic ? 'IN' : null)),
      country_source: p.country ? 'checkout' : p.user.lastClientCountry ? 'app' : p.user.country ? 'profile' : null,
      profile_country: p.user.country,
      last_client_country: p.user.lastClientCountry,
      state: captured?.name ?? null,
      state_code: captured?.code ?? null,
      state_source: captured ? p.stateSource : null,
      place_of_supply: pos ? placeOfSupplyLabel(pos) : domestic ? '' : '96-Other Countries',
      pos_basis: domestic ? posBasis : 'Outside India',
      market: domestic ? 'domestic' : 'export',
      supply_type: supplyType,
      gst_treatment: treatment,
      taxable,
      gst_rate: taxable && domestic ? cfg.rate : 0,
      taxable_value: taxableValue,
      igst,
      cgst,
      sgst,
      total_gst: totalGst,
      invoice_value: invoiceValue,
      inr_value: inrValue,
      razorpay_order_id: p.razorpayOrderId,
      razorpay_payment_id: p.razorpayPaymentId,
      client_ip: p.clientIp,
      gateway_status: p.gatewayStatus,
      payment_method: p.paymentMethod,
      gateway: (p.gatewayData as Record<string, any> | null) ?? null,
      gateway_synced_at: p.gatewaySyncedAt?.toISOString() ?? null,
      needs_review: p.gatewayStatus === 'captured' && p.status !== 'success',
    };
  }

  private summarize(rows: TaxedRow[]) {
    const s = {
      taxable_count: 0,
      coins_sold: 0,
      domestic_count: 0,
      domestic_invoice_value: 0,
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_gst: 0,
      undetermined_gst: 0,
      export_count: 0,
      export_inr_value: 0,
      export_by_currency: {} as Record<string, number>,
      no_state_count: 0,
    };
    for (const r of rows) {
      if (!r.taxable) continue;
      s.taxable_count += 1;
      s.coins_sold += r.coins;
      if (r.market === 'domestic') {
        s.domestic_count += 1;
        s.domestic_invoice_value += r.invoice_value ?? 0;
        s.taxable_value += r.taxable_value ?? 0;
        s.igst += r.igst ?? 0;
        s.cgst += r.cgst ?? 0;
        s.sgst += r.sgst ?? 0;
        s.total_gst += r.total_gst ?? 0;
        if (r.supply_type === 'Undetermined') s.undetermined_gst += r.total_gst ?? 0;
        if (!r.state) s.no_state_count += 1;
      } else {
        s.export_count += 1;
        s.export_inr_value += r.inr_value ?? 0;
        s.export_by_currency[r.currency] = round2((s.export_by_currency[r.currency] ?? 0) + r.amount);
      }
    }
    for (const k of ['domestic_invoice_value', 'taxable_value', 'igst', 'cgst', 'sgst', 'total_gst', 'undetermined_gst', 'export_inr_value'] as const) {
      s[k] = round2(s[k]);
    }
    return s;
  }

  // ──────────────────────────────────────────────
  // List
  // ──────────────────────────────────────────────

  async list(query: Query = {}) {
    const limitRaw = Number(query.limit ?? 25);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 25, 1), 200);
    const pageRaw = Number(query.page ?? 1);
    const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1);
    const where = this.where(query);

    const [cfg, rows, total, statusGroups, taxableRows, countryGroups, stateGroups, currencyGroups, review, lastSync] = await Promise.all([
      this.gstConfig(),
      this.prisma.coinPurchaseTransaction.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: this.order(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.coinPurchaseTransaction.count({ where }),
      this.prisma.coinPurchaseTransaction.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.coinPurchaseTransaction.findMany({
        where: { AND: [where, { status: 'success', paymentSource: 'RAZORPAY' }] },
        include: PURCHASE_INCLUDE,
        take: 200000,
      }),
      this.prisma.coinPurchaseTransaction.groupBy({ by: ['country'], _count: { _all: true }, orderBy: { country: 'asc' } }),
      this.prisma.coinPurchaseTransaction.groupBy({ by: ['state'], _count: { _all: true }, orderBy: { state: 'asc' } }),
      this.prisma.coinPurchaseTransaction.groupBy({ by: ['currency'], _count: { _all: true }, orderBy: { currency: 'asc' } }),
      this.prisma.coinPurchaseTransaction.aggregate({ where: NEEDS_REVIEW, _count: { _all: true }, _sum: { amountMinor: true, coinsCredited: true } }),
      this.prisma.coinPurchaseTransaction.aggregate({ _max: { gatewaySyncedAt: true } }),
    ]);

    const statusCounts: Record<string, number> = { success: 0, pending: 0, failed: 0 };
    for (const g of statusGroups) statusCounts[g.status] = g._count._all;

    return {
      config: cfg,
      gateway: {
        configured: !!this.wallet.razorpayClient,
        last_synced_at: lastSync._max.gatewaySyncedAt?.toISOString() ?? null,
        review_count: review._count._all,
        review_amount: (review._sum.amountMinor ?? 0) / 100,
        review_coins: review._sum.coinsCredited ?? 0,
      },
      analytics: {
        count: total,
        status_counts: statusCounts,
        ...this.summarize(taxableRows.map((r) => this.taxRow(r, cfg))),
      },
      facets: {
        countries: countryGroups.map((g) => ({ code: g.country, name: countryName(g.country), count: g._count._all })),
        states: stateGroups.map((g) => ({ state: g.state, count: g._count._all })),
        currencies: currencyGroups.map((g) => ({ currency: g.currency, count: g._count._all })),
      },
      indian_states: INDIAN_STATES.map((s) => ({ code: s.code, name: s.name })),
      recharges: rows.map((r) => this.taxRow(r, cfg)),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async setPlaceOfSupply(id: bigint, body: { state?: string | null }) {
    const existing = await this.prisma.coinPurchaseTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recharge not found');
    const raw = body.state?.trim();
    const state = raw ? resolveIndianState(raw) : null;
    if (raw && !state) throw new BadRequestException('Unknown Indian state');
    const updated = await this.prisma.coinPurchaseTransaction.update({
      where: { id },
      data: { state: state?.name ?? null, stateSource: state ? 'admin' : null },
      include: PURCHASE_INCLUDE,
    });
    return { recharge: this.taxRow(updated, await this.gstConfig()) };
  }

  // ──────────────────────────────────────────────
  // Razorpay sync & review
  // ──────────────────────────────────────────────

  /**
   * Pulls every Razorpay payment created since `from` and reconciles it with
   * our orders. Never credits coins — captured-but-uncredited orders are only
   * flagged; an admin resolves them via credit / mark-paid.
   */
  async syncWithRazorpay(body: { from?: string; to?: string } = {}) {
    const rz = this.wallet.razorpayClient;
    if (!rz) throw new BadRequestException('Razorpay is not configured on the server');

    const earliest = await this.prisma.coinPurchaseTransaction.aggregate({ where: { paymentSource: 'RAZORPAY' }, _min: { createdAt: true } });
    const parsed = body.from ? new Date(body.from) : null;
    const from = parsed && !Number.isNaN(parsed.getTime()) ? parsed : earliest._min.createdAt ?? new Date(Date.now() - 30 * 86400_000);
    const toParsed = body.to ? new Date(body.to) : null;
    const to = toParsed && !Number.isNaN(toParsed.getTime()) ? toParsed : new Date();

    // Payments are fetched up to now: an order created inside the range can be paid after it.
    const payments: Record<string, any>[] = [];
    const MAX = 20000;
    for (let skip = 0; skip < MAX; skip += 100) {
      let page: any;
      try {
        page = await rz.payments.all({ from: Math.floor(from.getTime() / 1000), to: Math.floor(Date.now() / 1000), count: 100, skip });
      } catch (e) {
        throw new BadRequestException(`Razorpay request failed: ${describeError(e)}`);
      }
      const items = (page?.items ?? []) as Record<string, any>[];
      payments.push(...items);
      if (items.length < 100) break;
    }

    const byOrder = new Map<string, Record<string, any>[]>();
    for (const p of payments) {
      if (!p.order_id) continue;
      byOrder.set(p.order_id, [...(byOrder.get(p.order_id) ?? []), p]);
    }

    const orderIds = [...byOrder.keys()];
    const known = new Map<string, Awaited<ReturnType<typeof this.prisma.coinPurchaseTransaction.findMany>>[number]>();
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = await this.prisma.coinPurchaseTransaction.findMany({ where: { razorpayOrderId: { in: orderIds.slice(i, i + 500) } } });
      chunk.forEach((o) => known.set(o.razorpayOrderId!, o));
    }

    const result = {
      range: { from: from.toISOString(), to: to.toISOString() },
      fetched_payments: payments.length,
      captured_payments: payments.filter((p) => p.status === 'captured').length,
      orders_checked: 0,
      marked_failed: 0,
      needs_review: 0,
      errors: 0,
      orphans: [] as Record<string, unknown>[],
    };

    for (const [orderId, items] of byOrder) {
      const order = known.get(orderId);
      if (!order) {
        const cap = items.find((p) => p.status === 'captured');
        if (cap) {
          result.orphans.push({
            payment_id: cap.id,
            order_id: orderId,
            amount: cap.amount / 100,
            currency: cap.currency,
            method: cap.method,
            contact: cap.contact ?? null,
            email: cap.email && cap.email !== 'void@razorpay.com' ? cap.email : null,
            description: cap.description ?? null,
            notes: cap.notes ?? null,
            paid_at: new Date(cap.created_at * 1000).toISOString(),
          });
        }
        continue;
      }
      if (order.createdAt < from || order.createdAt > to) continue;
      result.orders_checked++;
      try {
        const outcome = await this.wallet.applyGatewayPayments(order, items as any, { allowAutoCredit: false });
        if (outcome === 'review') result.needs_review++;
        if (outcome === 'failed') result.marked_failed++;
      } catch {
        result.errors++;
      }
    }

    // Pending orders in range with no payment at all since `from` → abandoned checkouts.
    const silent = await this.prisma.coinPurchaseTransaction.findMany({
      where: {
        paymentSource: 'RAZORPAY',
        status: 'pending',
        createdAt: { gte: from, lte: to },
        razorpayOrderId: { notIn: orderIds.length ? orderIds : ['__none__'] },
      },
    });
    for (const order of silent) {
      if (!order.razorpayOrderId) continue;
      result.orders_checked++;
      try {
        const outcome = await this.wallet.applyGatewayPayments(order, [], { allowAutoCredit: false });
        if (outcome === 'failed') result.marked_failed++;
      } catch {
        result.errors++;
      }
    }

    result.needs_review = await this.prisma.coinPurchaseTransaction.count({ where: NEEDS_REVIEW });
    return result;
  }

  /**
   * Records captured Razorpay payments that have no order in our DB (e.g. from
   * the legacy backend) so revenue reports are complete. Coins are NOT credited.
   */
  async importRazorpayPayments(body: { payment_ids?: string[] }) {
    const rz = this.wallet.razorpayClient;
    if (!rz) throw new BadRequestException('Razorpay is not configured on the server');
    const ids = [...new Set((body.payment_ids ?? []).filter((x) => typeof x === 'string' && /^pay_[A-Za-z0-9]{6,40}$/.test(x)))].slice(0, 500);
    if (!ids.length) throw new BadRequestException('No payment ids given');

    const result = { imported: 0, skipped: [] as { payment_id: string; reason: string }[] };
    for (const id of ids) {
      try {
        const p = (await rz.payments.fetch(id)) as Record<string, any>;
        if (p.status !== 'captured') {
          result.skipped.push({ payment_id: id, reason: `status is ${p.status}` });
          continue;
        }
        const exists = await this.prisma.coinPurchaseTransaction.findFirst({
          where: { OR: [{ razorpayPaymentId: id }, ...(p.order_id ? [{ razorpayOrderId: String(p.order_id) }] : [])] },
          select: { id: true },
        });
        if (exists) {
          result.skipped.push({ payment_id: id, reason: `already recorded as #${exists.id}` });
          continue;
        }
        const notes = (p.notes ?? {}) as Record<string, string>;
        const userId = /^\d{1,18}$/.test(String(notes.user_id ?? '')) ? BigInt(notes.user_id) : null;
        const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
        if (!user) {
          result.skipped.push({ payment_id: id, reason: userId ? `user #${userId} no longer exists` : 'no user id in payment notes' });
          continue;
        }
        const pkgId = /^\d{1,18}$/.test(String(notes.package_id ?? '')) ? BigInt(notes.package_id) : null;
        const pkg = pkgId ? await this.prisma.coinPackage.findUnique({ where: { id: pkgId }, select: { id: true } }) : null;
        const coinsMatch = /([\d,]+)\s*coins/i.exec(String(p.description ?? ''));
        await this.prisma.coinPurchaseTransaction.create({
          data: {
            userId: user.id,
            packageId: pkg?.id ?? null,
            razorpayOrderId: p.order_id ? String(p.order_id) : null,
            razorpayPaymentId: id,
            amountMinor: Number(p.amount),
            currency: String(p.currency ?? 'INR').toUpperCase(),
            coinsCredited: coinsMatch ? Number(coinsMatch[1].replace(/,/g, '')) : 0,
            status: 'success',
            paymentSource: 'RAZORPAY',
            country: notes.client_country ?? notes.resolved_country ?? null,
            gatewayStatus: 'captured',
            paymentMethod: p.method ? String(p.method).slice(0, 24) : null,
            gatewayData: { ...gatewayDetails(p as any, 1), admin_resolution: 'imported_from_razorpay' } as Prisma.InputJsonValue,
            gatewaySyncedAt: new Date(),
            createdAt: new Date(Number(p.created_at) * 1000),
          },
        });
        result.imported++;
      } catch (e) {
        result.skipped.push({ payment_id: id, reason: describeError(e) });
      }
    }
    return result;
  }

  async creditReviewed(id: bigint) {
    const res = await this.wallet.creditCapturedPurchase(id);
    return { ...res, recharge: await this.one(id) };
  }

  async markReviewedPaid(id: bigint, body: { note?: string }) {
    await this.wallet.markCapturedPurchasePaid(id, body.note);
    return { recharge: await this.one(id) };
  }

  private async one(id: bigint) {
    const row = await this.prisma.coinPurchaseTransaction.findUniqueOrThrow({ where: { id }, include: PURCHASE_INCLUDE });
    return this.taxRow(row, await this.gstConfig());
  }

  // ──────────────────────────────────────────────
  // Excel export (GST working file)
  // ──────────────────────────────────────────────

  async exportExcel(query: Query = {}) {
    const where = this.where(query);
    const [cfg, purchases, total] = await Promise.all([
      this.gstConfig(),
      this.prisma.coinPurchaseTransaction.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_LIMIT,
      }),
      this.prisma.coinPurchaseTransaction.count({ where }),
    ]);
    const rows = purchases.map((p) => this.taxRow(p, cfg));
    const taxable = rows.filter((r) => r.taxable);
    const summary = this.summarize(rows);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ChatAura Admin';
    wb.created = new Date();

    const MONEY = '#,##0.00';
    const INT = '#,##0';
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
    const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    const table = (
      ws: ExcelJS.Worksheet,
      columns: { header: string; key: string; width: number; fmt?: string }[],
      data: Record<string, unknown>[],
      totals?: Record<string, unknown>,
    ) => {
      ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = HEADER_FILL;
      head.alignment = { vertical: 'middle', wrapText: true };
      head.height = 30;
      data.forEach((d) => ws.addRow(d));
      if (totals) {
        const r = ws.addRow(totals);
        r.font = { bold: true };
        r.fill = TOTAL_FILL;
      }
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      if (data.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.length + 1, column: columns.length } };
    };

    const sum = (list: TaxedRow[], k: 'taxable_value' | 'igst' | 'cgst' | 'sgst' | 'total_gst' | 'invoice_value' | 'inr_value' | 'amount') =>
      round2(list.reduce((s, r) => s + (r[k] ?? 0), 0));

    const dates = rows.map((r) => new Date(r.created_at));
    const periodFrom = query.from ? new Date(query.from) : dates[0];
    const periodTo = query.to ? new Date(query.to) : dates[dates.length - 1];

    // ── Sheet 1: Summary ──
    const ws1 = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF059669' } } });
    ws1.columns = [{ width: 44 }, { width: 34 }];
    ws1.addRow(['GST Recharge Report']).font = { bold: true, size: 16 };
    ws1.addRow([cfg.legal_name || 'Legal name not set (Transactions → Recharges → GST settings)']);
    ws1.addRow([]);
    const kv: [string, string | number][] = [
      ['GSTIN', cfg.gstin || '—'],
      ['Supplier state', cfg.supplier_state ? `${cfg.supplier_state_code}-${cfg.supplier_state}` : 'NOT SET'],
      ['Period (IST)', periodFrom && periodTo ? `${istDate(periodFrom)} to ${istDate(periodTo)}` : 'No data'],
      ['GST rate applied', `${cfg.rate}% (${cfg.prices_inclusive ? 'pack prices inclusive of GST' : 'GST added on top of pack price'})`],
      ['SAC', cfg.sac],
      ['USD → INR rate (exports)', cfg.inr_per_usd],
      ['Generated (IST)', `${istDate(new Date())} ${istParts(new Date()).time}`],
      ['Rows in this file', rows.length],
    ];
    kv.forEach(([k, v]) => {
      const r = ws1.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    });
    if (total > rows.length) {
      ws1.addRow([`⚠ Only the first ${EXPORT_LIMIT.toLocaleString()} of ${total.toLocaleString()} matching rows are included. Narrow the date range.`]).font = {
        bold: true,
        color: { argb: 'FFB91C1C' },
      };
    }
    ws1.addRow([]);
    ws1.addRow(['Totals — taxable supplies (successful Razorpay payments)']).font = { bold: true, size: 13 };
    const money: [string, number, string?][] = [
      ['Successful recharges', summary.taxable_count, INT],
      ['Coins sold', summary.coins_sold, INT],
      ['Domestic recharges (India)', summary.domestic_count, INT],
      ['Domestic invoice value (₹)', summary.domestic_invoice_value],
      ['Taxable value (₹)', summary.taxable_value],
      ['IGST (₹)', summary.igst],
      ['CGST (₹)', summary.cgst],
      ['SGST / UTGST (₹)', summary.sgst],
      ['Total GST (₹)', summary.total_gst],
      ['Export recharges (outside India)', summary.export_count, INT],
      ['Export value — INR equivalent (₹)', summary.export_inr_value],
    ];
    for (const [cur, amt] of Object.entries(summary.export_by_currency)) money.push([`Export value (${cur})`, amt]);
    money.forEach(([k, v, fmt]) => {
      const r = ws1.addRow([k, v]);
      r.getCell(2).numFmt = fmt ?? MONEY;
    });
    ws1.addRow([]);
    const notes = [
      'Notes',
      '• Only successful Razorpay payments are treated as taxable supplies. Pending/failed orders and purchases paid from in-app earnings are listed in "Recharges" but excluded from tax totals.',
      '• Place of supply = buyer state captured at checkout or set by an admin; if no state is on record, the supplier state is used (Sec. 12(2)(b) IGST Act).',
      `• ${summary.no_state_count.toLocaleString()} domestic recharge(s) in this file have no buyer state on record.`,
      '• Exports are shown as zero-rated (supply under LUT). INR equivalent uses the configured USD rate — replace with the RBI reference rate on the invoice date if required.',
      '• Please verify with your Chartered Accountant before filing.',
    ];
    notes.forEach((n, i) => {
      const r = ws1.addRow([n]);
      ws1.mergeCells(r.number, 1, r.number, 2);
      r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      if (i === 0) r.font = { bold: true };
      else r.height = 32;
    });
    if (!cfg.configured || summary.undetermined_gst > 0) {
      ws1.addRow([]);
      ws1.addRow(['⚠ Supplier state is not set — CGST/SGST vs IGST split could not be determined.']).font = { bold: true, color: { argb: 'FFB91C1C' } };
    }

    const domestic = taxable.filter((r) => r.market === 'domestic');

    // ── Sheet 2: Recharges (detail) ──
    const ws2 = wb.addWorksheet('Recharges');
    table(
      ws2,
      [
        { header: 'Document No.', key: 'document_no', width: 20 },
        { header: 'Txn ID', key: 'id', width: 9 },
        { header: 'Date (IST)', key: 'date', width: 12 },
        { header: 'Time (IST)', key: 'time', width: 10 },
        { header: 'User ID', key: 'user_id', width: 9 },
        { header: 'Display ID', key: 'user_display_id', width: 11 },
        { header: 'Customer Name', key: 'user_name', width: 24 },
        { header: 'Email', key: 'user_email', width: 28 },
        { header: 'Phone', key: 'user_phone', width: 15 },
        { header: 'Country Code', key: 'country', width: 9 },
        { header: 'Country', key: 'country_name', width: 16 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'State Code', key: 'state_code', width: 8 },
        { header: 'Place of Supply', key: 'place_of_supply', width: 24 },
        { header: 'Place of Supply Basis', key: 'pos_basis', width: 28 },
        { header: 'Supply Type', key: 'supply_type', width: 22 },
        { header: 'Coins', key: 'coins', width: 10, fmt: INT },
        { header: 'Currency', key: 'currency', width: 9 },
        { header: 'Amount Paid', key: 'amount', width: 12, fmt: MONEY },
        { header: 'INR Value', key: 'inr_value', width: 12, fmt: MONEY },
        { header: 'GST Rate %', key: 'gst_rate', width: 8 },
        { header: 'Taxable Value', key: 'taxable_value', width: 13, fmt: MONEY },
        { header: 'IGST', key: 'igst', width: 10, fmt: MONEY },
        { header: 'CGST', key: 'cgst', width: 10, fmt: MONEY },
        { header: 'SGST/UTGST', key: 'sgst', width: 11, fmt: MONEY },
        { header: 'Total GST', key: 'total_gst', width: 11, fmt: MONEY },
        { header: 'Invoice Value', key: 'invoice_value', width: 13, fmt: MONEY },
        { header: 'SAC', key: 'sac', width: 9 },
        { header: 'Status', key: 'status', width: 9 },
        { header: 'GST Treatment', key: 'gst_treatment', width: 28 },
        { header: 'Payment Source', key: 'source', width: 15 },
        { header: 'Razorpay Order ID', key: 'razorpay_order_id', width: 24 },
        { header: 'Razorpay Payment ID', key: 'razorpay_payment_id', width: 24 },
        { header: 'Client IP', key: 'client_ip', width: 16 },
        { header: 'Country Source', key: 'country_source', width: 11 },
        { header: 'Razorpay Status', key: 'gateway_status', width: 13 },
        { header: 'Payment Method', key: 'payment_method', width: 11 },
        { header: 'UPI ID (VPA)', key: 'g_vpa', width: 24 },
        { header: 'Bank / Wallet', key: 'g_bank', width: 12 },
        { header: 'Card', key: 'g_card', width: 22 },
        { header: 'International', key: 'g_international', width: 10 },
        { header: 'Bank RRN', key: 'g_rrn', width: 15 },
        { header: 'Payer Contact (Razorpay)', key: 'g_contact', width: 16 },
        { header: 'Payer Email (Razorpay)', key: 'g_email', width: 24 },
        { header: 'Gateway Fee', key: 'g_fee', width: 10, fmt: MONEY },
        { header: 'GST on Fee', key: 'g_tax', width: 10, fmt: MONEY },
        { header: 'Failure Reason', key: 'g_error', width: 30 },
        { header: 'Needs Review', key: 'review', width: 10 },
        { header: 'Admin Resolution', key: 'g_resolution', width: 18 },
      ],
      rows.map((r) => {
        const p = istParts(new Date(r.created_at));
        return { ...r, ...gatewayCells(r), date: istDate(new Date(r.created_at)), time: p.time, sac: cfg.sac };
      }),
      {
        document_no: 'TOTAL (taxable, India)',
        coins: domestic.reduce((s, r) => s + r.coins, 0),
        inr_value: sum(domestic, 'inr_value'),
        taxable_value: sum(domestic, 'taxable_value'),
        igst: sum(domestic, 'igst'),
        cgst: sum(domestic, 'cgst'),
        sgst: sum(domestic, 'sgst'),
        total_gst: sum(domestic, 'total_gst'),
        invoice_value: sum(domestic, 'invoice_value'),
      },
    );

    // ── Needs review: Razorpay captured the money, coins never credited ──
    const review = rows.filter((r) => r.needs_review);
    if (review.length) {
      table(
        wb.addWorksheet('Needs Review', { properties: { tabColor: { argb: 'FFDC2626' } } }),
        [
          { header: 'Txn ID', key: 'id', width: 9 },
          { header: 'Date (IST)', key: 'date', width: 12 },
          { header: 'User ID', key: 'user_id', width: 9 },
          { header: 'Customer Name', key: 'user_name', width: 24 },
          { header: 'Phone', key: 'user_phone', width: 15 },
          { header: 'Amount Paid', key: 'amount', width: 12, fmt: MONEY },
          { header: 'Currency', key: 'currency', width: 9 },
          { header: 'Coins Due', key: 'coins', width: 12, fmt: INT },
          { header: 'Razorpay Payment ID', key: 'razorpay_payment_id', width: 24 },
          { header: 'Payment Method', key: 'payment_method', width: 11 },
          { header: 'UPI ID (VPA)', key: 'g_vpa', width: 24 },
          { header: 'Bank RRN', key: 'g_rrn', width: 15 },
          { header: 'Our Status', key: 'status', width: 10 },
        ],
        review.map((r) => ({ ...r, ...gatewayCells(r), date: istDate(new Date(r.created_at)) })),
      );
    }

    // ── Sheet 3: B2CS state-wise (GSTR-1 Table 7) ──
    const byPos = new Map<string, TaxedRow[]>();
    for (const r of domestic) {
      const k = r.place_of_supply || 'Undetermined';
      byPos.set(k, [...(byPos.get(k) ?? []), r]);
    }
    const posRows = [...byPos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pos, list]) => ({
        type: 'OE',
        pos,
        supply_type: list[0].supply_type,
        applicable: '',
        rate: cfg.rate,
        count: list.length,
        taxable_value: sum(list, 'taxable_value'),
        igst: sum(list, 'igst'),
        cgst: sum(list, 'cgst'),
        sgst: sum(list, 'sgst'),
        cess: 0,
        total_gst: sum(list, 'total_gst'),
        invoice_value: sum(list, 'invoice_value'),
        ecom: '',
      }));
    table(
      wb.addWorksheet('B2CS (State-wise)'),
      [
        { header: 'Type', key: 'type', width: 7 },
        { header: 'Place Of Supply', key: 'pos', width: 30 },
        { header: 'Supply Type', key: 'supply_type', width: 14 },
        { header: 'Applicable % of Tax Rate', key: 'applicable', width: 12 },
        { header: 'Rate', key: 'rate', width: 7 },
        { header: 'No. of Recharges', key: 'count', width: 11, fmt: INT },
        { header: 'Taxable Value', key: 'taxable_value', width: 15, fmt: MONEY },
        { header: 'IGST', key: 'igst', width: 12, fmt: MONEY },
        { header: 'CGST', key: 'cgst', width: 12, fmt: MONEY },
        { header: 'SGST/UTGST', key: 'sgst', width: 12, fmt: MONEY },
        { header: 'Cess Amount', key: 'cess', width: 10, fmt: MONEY },
        { header: 'Total GST', key: 'total_gst', width: 12, fmt: MONEY },
        { header: 'Invoice Value', key: 'invoice_value', width: 14, fmt: MONEY },
        { header: 'E-Commerce GSTIN', key: 'ecom', width: 16 },
      ],
      posRows,
      {
        type: 'TOTAL',
        count: domestic.length,
        taxable_value: sum(domestic, 'taxable_value'),
        igst: sum(domestic, 'igst'),
        cgst: sum(domestic, 'cgst'),
        sgst: sum(domestic, 'sgst'),
        cess: 0,
        total_gst: sum(domestic, 'total_gst'),
        invoice_value: sum(domestic, 'invoice_value'),
      },
    );

    // ── Sheet 4: HSN/SAC summary (GSTR-1 Table 12) ──
    table(
      wb.addWorksheet('HSN-SAC Summary'),
      [
        { header: 'HSN/SAC', key: 'sac', width: 10 },
        { header: 'Description', key: 'desc', width: 36 },
        { header: 'UQC', key: 'uqc', width: 8 },
        { header: 'Total Quantity', key: 'qty', width: 12, fmt: INT },
        { header: 'Total Value', key: 'value', width: 14, fmt: MONEY },
        { header: 'Rate', key: 'rate', width: 7 },
        { header: 'Taxable Value', key: 'taxable_value', width: 14, fmt: MONEY },
        { header: 'Integrated Tax Amount', key: 'igst', width: 14, fmt: MONEY },
        { header: 'Central Tax Amount', key: 'cgst', width: 14, fmt: MONEY },
        { header: 'State/UT Tax Amount', key: 'sgst', width: 14, fmt: MONEY },
        { header: 'Cess Amount', key: 'cess', width: 10, fmt: MONEY },
      ],
      domestic.length
        ? [
            {
              sac: cfg.sac,
              desc: 'In-app virtual coins (online content services)',
              uqc: 'NA',
              qty: domestic.length,
              value: sum(domestic, 'invoice_value'),
              rate: cfg.rate,
              taxable_value: sum(domestic, 'taxable_value'),
              igst: sum(domestic, 'igst'),
              cgst: sum(domestic, 'cgst'),
              sgst: sum(domestic, 'sgst'),
              cess: 0,
            },
          ]
        : [],
    );

    // ── Sheet 5: Exports, country-wise (GSTR-1 Table 6A working) ──
    const exportsList = taxable.filter((r) => r.market === 'export');
    const byCountry = new Map<string, TaxedRow[]>();
    for (const r of exportsList) {
      const k = `${r.country ?? '—'}|${r.currency}`;
      byCountry.set(k, [...(byCountry.get(k) ?? []), r]);
    }
    table(
      wb.addWorksheet('Exports (Country-wise)'),
      [
        { header: 'Country Code', key: 'code', width: 10 },
        { header: 'Country', key: 'name', width: 22 },
        { header: 'Export Type', key: 'type', width: 16 },
        { header: 'Currency', key: 'currency', width: 9 },
        { header: 'No. of Recharges', key: 'count', width: 11, fmt: INT },
        { header: 'Value (Foreign Currency)', key: 'amount', width: 16, fmt: MONEY },
        { header: 'INR Equivalent', key: 'inr_value', width: 15, fmt: MONEY },
        { header: 'Rate', key: 'rate', width: 7 },
        { header: 'IGST', key: 'igst', width: 10, fmt: MONEY },
      ],
      [...byCountry.values()]
        .map((list) => ({
          code: list[0].country ?? '',
          name: list[0].country_name,
          type: 'WOPAY (under LUT)',
          currency: list[0].currency,
          count: list.length,
          amount: sum(list, 'amount'),
          inr_value: sum(list, 'inr_value'),
          rate: 0,
          igst: 0,
        }))
        .sort((a, b) => b.inr_value - a.inr_value),
      { code: 'TOTAL', count: exportsList.length, inr_value: sum(exportsList, 'inr_value'), igst: 0 },
    );

    // ── Sheet 6: Country & state overview (all statuses in the filter) ──
    const overview = new Map<string, { country: string; state: string; total: number; success: number; pending: number; failed: number; inr: number }>();
    for (const r of rows) {
      const k = `${r.country_name}|${r.state ?? ''}`;
      const o = overview.get(k) ?? { country: r.country_name || 'Unknown', state: r.state ?? (r.market === 'domestic' ? 'Not captured' : '—'), total: 0, success: 0, pending: 0, failed: 0, inr: 0 };
      o.total += 1;
      o[r.status] += 1;
      if (r.taxable) o.inr = round2(o.inr + (r.inr_value ?? 0));
      overview.set(k, o);
    }
    table(
      wb.addWorksheet('Country & State'),
      [
        { header: 'Country', key: 'country', width: 22 },
        { header: 'State', key: 'state', width: 26 },
        { header: 'All Orders', key: 'total', width: 10, fmt: INT },
        { header: 'Successful', key: 'success', width: 10, fmt: INT },
        { header: 'Pending', key: 'pending', width: 10, fmt: INT },
        { header: 'Failed', key: 'failed', width: 10, fmt: INT },
        { header: 'Collected (INR equiv.)', key: 'inr', width: 16, fmt: MONEY },
      ],
      [...overview.values()].sort((a, b) => b.inr - a.inr || b.total - a.total),
    );

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const stamp = (d?: Date) => (d ? istDate(d).split('-').reverse().join('') : 'all');
    return {
      filename: `gst-recharges_${stamp(periodFrom)}-${stamp(periodTo)}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rows: rows.length,
      truncated: total > rows.length,
      base64: buffer.toString('base64'),
    };
  }
}
