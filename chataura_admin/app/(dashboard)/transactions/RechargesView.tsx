'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { STYLES } from './tx-styles';

type Recharge = {
  id: number;
  document_no: string;
  created_at: string;
  user_id: number;
  user_display_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_avatar: string | null;
  package_id: number | null;
  coins: number;
  amount: number;
  currency: string;
  status: 'success' | 'pending' | 'failed';
  source: string;
  country: string | null;
  country_name: string;
  state: string | null;
  state_code: string | null;
  state_source: string | null;
  place_of_supply: string;
  pos_basis: string;
  market: 'domestic' | 'export';
  supply_type: string;
  gst_treatment: string;
  taxable: boolean;
  gst_rate: number;
  taxable_value: number | null;
  igst: number | null;
  cgst: number | null;
  sgst: number | null;
  total_gst: number | null;
  invoice_value: number | null;
  inr_value: number | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  client_ip: string | null;
  country_source: 'checkout' | 'app' | 'profile' | null;
  profile_country: string | null;
  last_client_country: string | null;
  gateway_status: string | null;
  payment_method: string | null;
  gateway: GatewayData | null;
  gateway_synced_at: string | null;
  needs_review: boolean;
};

type GatewayData = {
  payment_id?: string;
  status?: string;
  method?: string | null;
  contact?: string | null;
  email?: string | null;
  vpa?: string | null;
  upi_flow?: string | null;
  bank?: string | null;
  wallet?: string | null;
  card_network?: string | null;
  card_issuer?: string | null;
  card_type?: string | null;
  card_last4?: string | null;
  card_country?: string | null;
  international?: boolean | null;
  rrn?: string | null;
  fee?: number | null;
  tax?: number | null;
  amount_refunded?: number | null;
  refund_status?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  description?: string | null;
  notes?: Record<string, string> | null;
  paid_at?: string | null;
  attempts?: number;
  admin_resolution?: string;
  admin_note?: string | null;
  resolved_at?: string;
};

type GatewayInfo = {
  configured: boolean;
  last_synced_at: string | null;
  review_count: number;
  review_amount: number;
  review_coins: number;
};

type Orphan = {
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  method: string | null;
  contact: string | null;
  email: string | null;
  description: string | null;
  notes: Record<string, string> | null;
  paid_at: string;
};

type SyncResult = {
  range: { from: string; to: string };
  fetched_payments: number;
  captured_payments: number;
  orders_checked: number;
  marked_failed: number;
  needs_review: number;
  errors: number;
  orphans: Orphan[];
};

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

type Analytics = {
  count: number;
  status_counts: Record<string, number>;
  taxable_count: number;
  coins_sold: number;
  domestic_count: number;
  domestic_invoice_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  total_gst: number;
  undetermined_gst: number;
  export_count: number;
  export_inr_value: number;
  export_by_currency: Record<string, number>;
  no_state_count: number;
};

type Facets = {
  countries: { code: string | null; name: string; count: number }[];
  states: { state: string | null; count: number }[];
  currencies: { currency: string; count: number }[];
};

type RangeKey = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'fy' | 'custom';

type Filters = {
  q: string;
  review: '' | '1';
  status: '' | 'success' | 'pending' | 'failed';
  market: '' | 'domestic' | 'export';
  country: string;
  state: string;
  currency: string;
  range: RangeKey;
  from: string;
  to: string;
  min_amount: string;
  max_amount: string;
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  page: number;
};

type Toast = { id: number; kind: 'success' | 'error'; text: string };

const DEFAULT_FILTERS: Filters = {
  q: '',
  review: '',
  status: 'success',
  market: '',
  country: '',
  state: '',
  currency: '',
  range: 'all',
  from: '',
  to: '',
  min_amount: '',
  max_amount: '',
  sort: 'id',
  order: 'desc',
  limit: 25,
  page: 1,
};

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'fy', label: 'This FY' },
  { key: 'custom', label: 'Custom' },
];

const SORT_PRESETS: { value: string; label: string }[] = [
  { value: 'id:desc', label: 'Newest first' },
  { value: 'id:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Amount: high → low' },
  { value: 'amount:asc', label: 'Amount: low → high' },
  { value: 'coins:desc', label: 'Coins: high → low' },
  { value: 'state:asc', label: 'State: A → Z' },
  { value: 'country:asc', label: 'Country: A → Z' },
];

const SORTS = ['id', 'amount', 'coins', 'user', 'state', 'country'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeBounds(f: Filters): { from?: Date; to?: Date } {
  const startOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const now = new Date();
  const daysAgo = (n: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() - n);
    return x;
  };
  switch (f.range) {
    case 'today':
      return { from: startOf(now), to: endOf(now) };
    case 'yesterday':
      return { from: startOf(daysAgo(1)), to: endOf(daysAgo(1)) };
    case '7d':
      return { from: startOf(daysAgo(6)), to: endOf(now) };
    case '30d':
      return { from: startOf(daysAgo(29)), to: endOf(now) };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOf(now) };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOf(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case 'fy': {
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { from: new Date(startYear, 3, 1), to: endOf(now) };
    }
    case 'custom':
      return {
        from: f.from ? startOf(new Date(`${f.from}T00:00:00`)) : undefined,
        to: f.to ? endOf(new Date(`${f.to}T00:00:00`)) : undefined,
      };
    default:
      return {};
  }
}

function filtersFromUrl(): Filters {
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => p.get(k) ?? '';
  const limit = Number(p.get('limit'));
  const page = Number(p.get('page'));
  const status = p.has('status') ? get('status') : DEFAULT_FILTERS.status;
  return {
    q: get('q'),
    review: get('review') === '1' ? '1' : '',
    status: ['success', 'pending', 'failed'].includes(status) ? (status as Filters['status']) : '',
    market: get('market') === 'domestic' || get('market') === 'export' ? (get('market') as Filters['market']) : '',
    country: get('country'),
    state: get('state'),
    currency: get('currency'),
    range: RANGES.some((r) => r.key === p.get('range')) ? (p.get('range') as RangeKey) : 'all',
    from: get('from'),
    to: get('to'),
    min_amount: get('min_amount'),
    max_amount: get('max_amount'),
    sort: SORTS.includes(get('sort')) ? get('sort') : 'id',
    order: p.get('order') === 'asc' ? 'asc' : 'desc',
    limit: [25, 50, 100].includes(limit) ? limit : 25,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function filtersToUrl(f: Filters): string {
  const p = new URLSearchParams({ view: 'recharges' });
  (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).forEach((k) => {
    const v = f[k];
    if (v === DEFAULT_FILTERS[k]) return;
    // status '' (all) differs from the default 'success', so it must be kept explicitly
    if (v === '' && k !== 'status') return;
    p.set(k, String(v));
  });
  return p.toString();
}

function money(n: number | null | undefined, currency = 'INR') {
  if (n === null || n === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function inr0(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('en-IN');
}

const STATE_SOURCE_TAG: Record<string, string> = { client: 'from app', ip: 'via IP', previous: 'earlier recharge', admin: 'set by admin' };

function methodLabel(r: Pick<Recharge, 'payment_method' | 'gateway'>) {
  const g = r.gateway;
  switch (r.payment_method) {
    case 'upi':
      return 'UPI';
    case 'card':
      return [g?.card_network, 'card', g?.card_last4 ? `•••• ${g.card_last4}` : null].filter(Boolean).join(' ');
    case 'netbanking':
      return `Netbanking${g?.bank ? ` · ${g.bank}` : ''}`;
    case 'wallet':
      return `Wallet${g?.wallet ? ` · ${g.wallet}` : ''}`;
    default:
      return r.payment_method ?? '—';
  }
}

function flag(code: string | null) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export default function RechargesView({ tabs }: { tabs: ReactNode }) {
  const { token } = useAdminAuth();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [rows, setRows] = useState<Recharge[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [facets, setFacets] = useState<Facets>({ countries: [], states: [], currencies: [] });
  const [indianStates, setIndianStates] = useState<{ code: string; name: string }[]>([]);
  const [config, setConfig] = useState<GstConfig | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [selected, setSelected] = useState<Recharge | null>(null);
  const [posDraft, setPosDraft] = useState('');
  const [savingPos, setSavingPos] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gateway, setGateway] = useState<GatewayInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'credit' | 'paid' | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const requestSeq = useRef(0);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const initial = filtersFromUrl();
    setFilters(initial);
    setSearchInput(initial.q);
    setMinInput(initial.min_amount);
    setMaxInput(initial.max_amount);
    setReady(true);
  }, []);

  const buildParams = useCallback((f: Filters) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.review) p.set('review', '1');
    if (f.status) p.set('status', f.status);
    if (f.market) p.set('market', f.market);
    if (f.country) p.set('country', f.country);
    if (f.state) p.set('state', f.state);
    if (f.currency) p.set('currency', f.currency);
    if (f.min_amount) p.set('min_amount', f.min_amount);
    if (f.max_amount) p.set('max_amount', f.max_amount);
    const { from, to } = rangeBounds(f);
    if (from) p.set('from', from.toISOString());
    if (to) p.set('to', to.toISOString());
    p.set('sort', f.sort);
    p.set('order', f.order);
    return p;
  }, []);

  const load = useCallback(async () => {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    const params = buildParams(filters);
    params.set('page', String(filters.page));
    params.set('limit', String(filters.limit));
    try {
      const res = await api<{
        data?: {
          config?: GstConfig;
          analytics?: Analytics;
          facets?: Facets;
          indian_states?: { code: string; name: string }[];
          gateway?: GatewayInfo;
          recharges?: Recharge[];
          meta?: { total?: number; pages?: number };
        };
      }>(`/admin/recharges?${params.toString()}`, tok);
      if (seq !== requestSeq.current) return;
      const pages = Math.max(1, Number(res.data?.meta?.pages ?? 1));
      setRows(res.data?.recharges ?? []);
      setAnalytics(res.data?.analytics ?? null);
      if (res.data?.facets) setFacets(res.data.facets);
      if (res.data?.indian_states) setIndianStates(res.data.indian_states);
      if (res.data?.config) setConfig(res.data.config);
      if (res.data?.gateway) setGateway(res.data.gateway);
      setTotal(Number(res.data?.meta?.total ?? 0));
      setTotalPages(pages);
      if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load recharges');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters, buildParams]);

  useEffect(() => {
    if (!ready || !token) return;
    setPageInput(String(filters.page));
    window.history.replaceState(null, '', `${window.location.pathname}?${filtersToUrl(filters)}`);
    void load();
  }, [ready, token, load, filters]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setFilters((f) => {
        const q = searchInput.trim();
        const min = minInput.trim();
        const max = maxInput.trim();
        if (f.q === q && f.min_amount === min && f.max_amount === max) return f;
        return { ...f, q, min_amount: min, max_amount: max, page: 1 };
      });
    }, 450);
    return () => clearTimeout(t);
  }, [searchInput, minInput, maxInput, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setSettingsOpen(false);
        setSyncResult(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  function resetFilters() {
    setSearchInput('');
    setMinInput('');
    setMaxInput('');
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters = filtersToUrl({ ...filters, page: 1, limit: DEFAULT_FILTERS.limit }) !== 'view=recharges';

  function openRow(r: Recharge) {
    setSelected(r);
    setPosDraft(r.state ?? '');
    setConfirmAction(null);
    setResolveNote('');
  }

  function goToPage(p: number) {
    const target = Math.min(Math.max(1, Math.floor(p)), totalPages);
    if (Number.isFinite(target)) setFilters((f) => ({ ...f, page: target }));
  }

  function pageNumbers(): (number | '…')[] {
    const page = filters.page;
    const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    const sorted = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
      out.push(p);
    });
    return out;
  }

  function toggleSort(column: string, defaultOrder: 'asc' | 'desc' = 'desc') {
    if (filters.sort === column) update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    else update({ sort: column, order: defaultOrder });
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('success', `${label} copied`);
    } catch {
      toast('error', 'Copy failed');
    }
  }

  async function handleExport() {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setExporting(true);
    try {
      const res = await api<{ data?: { filename: string; mime: string; base64: string; rows: number; truncated: boolean } }>(
        `/admin/recharges/export?${buildParams(filters).toString()}`,
        tok,
      );
      const file = res.data;
      if (!file) throw new Error('Empty export');
      const bin = atob(file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = window.URL.createObjectURL(new Blob([bytes], { type: file.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast(file.truncated ? 'error' : 'success', file.truncated ? `Exported first ${fmt(file.rows)} rows — narrow the date range` : `Exported ${fmt(file.rows)} recharges to Excel`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  }

  async function handleSync() {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setSyncing(true);
    try {
      const { from, to } = rangeBounds(filters);
      const res = await api<{ data?: SyncResult }>(`/admin/recharges/sync`, tok, {
        method: 'POST',
        body: JSON.stringify({ from: from?.toISOString(), to: to?.toISOString() }),
      });
      if (res.data) setSyncResult(res.data);
      void load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Razorpay sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleImport(ids: string[]) {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok || !ids.length) return;
    setImporting(true);
    try {
      const res = await api<{ data?: { imported: number; skipped: { payment_id: string; reason: string }[] } }>(`/admin/recharges/import`, tok, {
        method: 'POST',
        body: JSON.stringify({ payment_ids: ids }),
      });
      const imported = res.data?.imported ?? 0;
      const skipped = res.data?.skipped ?? [];
      toast(skipped.length ? 'error' : 'success', `Imported ${imported} payment${imported === 1 ? '' : 's'}${skipped.length ? ` · ${skipped.length} skipped (${skipped[0].reason})` : ''}`);
      setSyncResult((r) => (r ? { ...r, orphans: r.orphans.filter((o) => skipped.some((x) => x.payment_id === o.payment_id)) } : r));
      void load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function resolveReview(action: 'credit' | 'paid') {
    if (!selected) return;
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setResolving(true);
    try {
      const res = await api<{ data?: { recharge?: Recharge; credited_coins?: number } }>(
        `/admin/recharges/${selected.id}/${action === 'credit' ? 'credit' : 'mark-paid'}`,
        tok,
        { method: 'POST', body: JSON.stringify(action === 'paid' ? { note: resolveNote } : {}) },
      );
      const updated = res.data?.recharge;
      if (updated) {
        setSelected(updated);
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      setConfirmAction(null);
      toast('success', action === 'credit' ? `Credited ${fmt(res.data?.credited_coins ?? selected.coins)} coins to user #${selected.user_id}` : 'Marked as paid — no coins credited');
      void load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setResolving(false);
    }
  }

  async function savePlaceOfSupply() {
    if (!selected) return;
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setSavingPos(true);
    try {
      const res = await api<{ data?: { recharge?: Recharge } }>(`/admin/recharges/${selected.id}/place-of-supply`, tok, {
        method: 'PATCH',
        body: JSON.stringify({ state: posDraft || null }),
      });
      const updated = res.data?.recharge;
      if (updated) {
        setSelected(updated);
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      toast('success', posDraft ? `Place of supply set to ${posDraft}` : 'Place of supply cleared');
      void load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSavingPos(false);
    }
  }

  function sortHeader(column: string, label: string, align: 'left' | 'right' = 'left', defaultOrder: 'asc' | 'desc' = 'desc') {
    const active = filters.sort === column;
    return (
      <th key={column} className="tx-th" style={{ textAlign: align }}>
        <span
          role="button"
          tabIndex={0}
          className={`tx-sort ${active ? 'is-active' : ''}`}
          onClick={() => toggleSort(column, defaultOrder)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSort(column, defaultOrder);
            }
          }}
        >
          {label}
          <span className="tx-sort-icon">{active ? (filters.order === 'desc' ? '▼' : '▲') : '↕'}</span>
        </span>
      </th>
    );
  }

  const a = analytics;
  const sortValue = `${filters.sort}:${filters.order}`;
  const sortKnown = SORT_PRESETS.some((s) => s.value === sortValue);
  const from = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const to = Math.min(filters.page * filters.limit, total);
  const attempts = a ? (a.status_counts.success ?? 0) + (a.status_counts.pending ?? 0) + (a.status_counts.failed ?? 0) : 0;
  const unknownStateCount = facets.states.find((s) => s.state === null)?.count ?? 0;
  const exportCurrencies = a ? Object.entries(a.export_by_currency) : [];

  return (
    <main className="tx">
      <style>{STYLES}</style>
      <style>{RC_STYLES}</style>
      {tabs}

      <div className="tx-header">
        <div>
          <h1>Recharges &amp; GST</h1>
          <p>Real-money coin purchases with buyer country, state and GST breakdown. Tax totals cover successful Razorpay payments matching your filters.</p>
        </div>
        <div className="rc-actions">
          <div className="rc-sync">
            <button type="button" className="tx-btn tx-btn-ghost" onClick={() => void handleSync()} disabled={syncing || gateway?.configured === false}>
              {syncing ? 'Syncing…' : '↻ Sync with Razorpay'}
            </button>
            <span className="tx-sub">
              {gateway?.last_synced_at ? `Last synced ${new Date(gateway.last_synced_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Never synced'}
            </span>
          </div>
          <button type="button" className="tx-btn tx-btn-ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ GST settings
          </button>
          <button type="button" className="tx-btn tx-btn-export" onClick={() => void handleExport()} disabled={exporting || total === 0}>
            {exporting ? 'Preparing Excel…' : `⬇ Export Excel${hasActiveFilters ? ' (filtered)' : ''}`}
          </button>
        </div>
      </div>

      {gateway && gateway.review_count > 0 && (
        <div className="rc-banner danger">
          <div>
            <strong>{fmt(gateway.review_count)} captured payment{gateway.review_count === 1 ? '' : 's'} never credited.</strong> Razorpay received{' '}
            {inr0(gateway.review_amount)} but the buyers did not get {fmt(gateway.review_coins)} coins. Check whether they were compensated another way, then credit coins or mark the payment as paid.
          </div>
          {filters.review !== '1' && (
            <button type="button" className="tx-btn tx-btn-danger" onClick={() => update({ review: '1', status: '' })}>Review now</button>
          )}
        </div>
      )}

      {config && !config.configured && (
        <div className="rc-banner warn">
          <div>
            <strong>GST settings incomplete.</strong> Set your GSTIN and supplier state so recharges can be split into CGST + SGST (same state) or IGST (other state).
          </div>
          <button type="button" className="tx-btn tx-btn-primary" onClick={() => setSettingsOpen(true)}>Set up GST</button>
        </div>
      )}

      <div className="tx-kpis rc-kpis">
        <div className="tx-kpi">
          <div className="tx-kpi-label">Successful recharges</div>
          <div className="tx-kpi-value">{fmt(a?.taxable_count)}</div>
          <div className="tx-kpi-sub">{fmt(a?.coins_sold)} coins sold</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Collected (India)</div>
          <div className="tx-kpi-value tone-green">{inr0(a?.domestic_invoice_value ?? 0)}</div>
          <div className="tx-kpi-sub">{fmt(a?.domestic_count)} payments, GST incl.</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Taxable value</div>
          <div className="tx-kpi-value">{money(a?.taxable_value ?? 0)}</div>
          <div className="tx-kpi-sub">@ {config?.rate ?? 18}% · SAC {config?.sac ?? '998439'}</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">GST payable</div>
          <div className="tx-kpi-value tone-indigo">{money(a?.total_gst ?? 0)}</div>
          <div className="tx-kpi-sub" title="IGST · CGST · SGST">
            {a && a.undetermined_gst > 0 ? 'Split pending — set supplier state' : `IGST ${money(a?.igst ?? 0)} · C/SGST ${money((a?.cgst ?? 0) + (a?.sgst ?? 0))}`}
          </div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Exports (outside India)</div>
          <div className="tx-kpi-value">{inr0(a?.export_inr_value ?? 0)}</div>
          <div className="tx-kpi-sub">
            {fmt(a?.export_count)} payments{exportCurrencies.length ? ` · ${exportCurrencies.map(([c, v]) => money(v, c)).join(' + ')}` : ''}
          </div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Payment success rate</div>
          <div className="tx-kpi-value">{attempts ? `${Math.round(((a?.status_counts.success ?? 0) / attempts) * 100)}%` : '—'}</div>
          <div className="tx-kpi-sub">
            {fmt(a?.status_counts.pending)} pending · {fmt(a?.status_counts.failed)} failed
          </div>
        </div>
      </div>

      {a && a.no_state_count > 0 && (
        <div className="rc-banner info">
          <div>
            <strong>{fmt(a.no_state_count)}</strong> of {fmt(a.domestic_count)} domestic recharges have no buyer state on record. Their place of supply falls back to your registered state
            {config?.supplier_state ? ` (${config.supplier_state})` : ''}. Open a row to set it manually. New purchases capture it automatically from the app, the buyer&apos;s IP address, or their earlier recharge.
          </div>
          {filters.state !== '__unknown__' && (
            <button type="button" className="tx-btn tx-btn-ghost" onClick={() => update({ state: '__unknown__', market: 'domestic' })}>Show them</button>
          )}
        </div>
      )}

      <div className="tx-card">
        <div className="tx-ranges">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`tx-chip ${filters.range === r.key ? 'is-active' : ''}`}
              onClick={() => {
                if (r.key === 'custom') {
                  const today = ymd(new Date());
                  update({ range: 'custom', from: filters.from || today, to: filters.to || today });
                } else {
                  update({ range: r.key, from: '', to: '' });
                }
              }}
            >
              {r.label}
            </button>
          ))}
          {filters.range === 'custom' && (
            <div className="tx-custom-range">
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
              <span>to</span>
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </div>
          )}
          <div className="tx-seg" role="group" aria-label="Payment status">
            {([
              ['success', 'Successful'],
              ['pending', 'Pending'],
              ['failed', 'Failed'],
              ['', 'All'],
            ] as const).map(([v, label]) => (
              <button
                key={v || 'all'}
                type="button"
                className={`tx-seg-btn ${!filters.review && filters.status === v ? 'is-active' : ''} ${v === 'success' ? 'dir-credit' : v === 'failed' ? 'dir-debit' : ''}`}
                onClick={() => update({ status: v, review: '' })}
              >
                {label}
                {a && v ? <span className="rc-seg-count">{fmt(a.status_counts[v])}</span> : null}
              </button>
            ))}
            {gateway && gateway.review_count > 0 && (
              <button
                type="button"
                className={`tx-seg-btn dir-review ${filters.review ? 'is-active' : ''}`}
                onClick={() => update({ review: '1', status: '' })}
              >
                Needs review<span className="rc-seg-count">{fmt(gateway.review_count)}</span>
              </button>
            )}
          </div>
        </div>

        <div className="tx-toolbar">
          <div className="tx-search">
            <span className="tx-search-icon" aria-hidden>⌕</span>
            <input
              placeholder="Search name, email, phone, display ID, #txn or Razorpay ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') update({ q: searchInput.trim() });
              }}
            />
            {searchInput && (
              <button type="button" className="tx-search-clear" onClick={() => setSearchInput('')} aria-label="Clear search">×</button>
            )}
          </div>

          <label className="tx-field">
            <span>Market</span>
            <select value={filters.market} onChange={(e) => update({ market: e.target.value as Filters['market'] })}>
              <option value="">India + exports</option>
              <option value="domestic">India (domestic)</option>
              <option value="export">Exports (outside India)</option>
            </select>
          </label>

          <label className="tx-field">
            <span>Country</span>
            <select value={filters.country} onChange={(e) => update({ country: e.target.value })}>
              <option value="">All countries</option>
              {facets.countries.map((c) => (
                <option key={c.code ?? '__none__'} value={c.code ?? '__none__'}>
                  {c.code ? `${flag(c.code)} ${c.name}` : 'Not recorded'} ({fmt(c.count)})
                </option>
              ))}
            </select>
          </label>

          <label className="tx-field">
            <span>State (place of supply)</span>
            <select value={filters.state} onChange={(e) => update({ state: e.target.value })}>
              <option value="">All states</option>
              <option value="__unknown__">Not captured ({fmt(unknownStateCount)})</option>
              {indianStates.map((s) => {
                const n = facets.states.find((f) => f.state === s.name)?.count ?? 0;
                return (
                  <option key={s.code} value={s.name}>
                    {s.code} · {s.name}{n ? ` (${fmt(n)})` : ''}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="tx-field">
            <span>Currency</span>
            <select value={filters.currency} onChange={(e) => update({ currency: e.target.value })} className="rc-select-sm">
              <option value="">All</option>
              {facets.currencies.map((c) => (
                <option key={c.currency} value={c.currency}>{c.currency} ({fmt(c.count)})</option>
              ))}
            </select>
          </label>

          <label className="tx-field">
            <span>Amount paid</span>
            <div className="tx-amount">
              <input type="number" min={0} placeholder="Min" value={minInput} onChange={(e) => setMinInput(e.target.value)} />
              <span>–</span>
              <input type="number" min={0} placeholder="Max" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} />
            </div>
          </label>

          <label className="tx-field">
            <span>Sort by</span>
            <select
              value={sortKnown ? sortValue : ''}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(':');
                if (sort) update({ sort, order: order as 'asc' | 'desc' });
              }}
            >
              {!sortKnown && <option value="">Custom</option>}
              {SORT_PRESETS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="tx-btn tx-btn-ghost rc-reset" onClick={resetFilters}>Reset filters</button>
          )}
        </div>

        <div className="tx-summary">
          {loading ? 'Loading…' : (
            <>
              <strong>{total.toLocaleString()}</strong> recharge{total === 1 ? '' : 's'}
              {filters.q ? <> matching “{filters.q}”</> : null}
              <span className="tx-hint"> · Click a row for tax details and to correct the place of supply</span>
            </>
          )}
        </div>

        {loadError && (
          <div className="tx-alert">
            {loadError}
            <button type="button" className="tx-btn tx-btn-ghost" onClick={() => void load()}>Retry</button>
          </div>
        )}

        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                {sortHeader('id', 'Txn / Document')}
                {sortHeader('user', 'Customer', 'left', 'asc')}
                {sortHeader('state', 'Location', 'left', 'asc')}
                {sortHeader('coins', 'Coins', 'right')}
                {sortHeader('amount', 'Amount paid', 'right')}
                <th className="tx-th" style={{ textAlign: 'right' }}>Taxable value</th>
                <th className="tx-th" style={{ textAlign: 'right' }}>GST</th>
                <th className="tx-th">Status</th>
                <th className="tx-th">Date</th>
              </tr>
            </thead>
            <tbody className={loading && rows.length > 0 ? 'is-loading' : ''}>
              {loading && rows.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}><td colSpan={9} className="tx-td"><div className="tx-skeleton" /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="tx-empty">
                    <div className="tx-empty-title">No recharges found</div>
                    <div>Try another status or a wider date range.</div>
                    {hasActiveFilters && (
                      <button type="button" className="tx-btn tx-btn-ghost" onClick={resetFilters} style={{ marginTop: 12 }}>Reset filters</button>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const name = r.user_name || `User #${r.user_id}`;
                  return (
                    <tr
                      key={r.id}
                      className={`tx-row ${selected?.id === r.id ? 'is-selected' : ''}`}
                      onClick={() => openRow(r)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openRow(r);
                      }}
                    >
                      <td className="tx-td">
                        <div className="tx-id">#{r.id}</div>
                        <div className="tx-sub rc-mono">{r.document_no}</div>
                      </td>
                      <td className="tx-td">
                        <div className="tx-user">
                          <div className="tx-avatar">
                            {r.user_avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.user_avatar} alt="" />
                            ) : (
                              <span>{name.trim().charAt(0).toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="tx-name" title={name}>{name}</div>
                            <div className="tx-sub rc-ellipsis" title={r.user_email ?? ''}>
                              ID {r.user_display_id ?? r.user_id}{r.user_email ? ` · ${r.user_email}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tx-td">
                        <div className="rc-loc">
                          <span className="rc-flag" aria-hidden>{flag(r.country)}</span>
                          <div>
                            <div className="rc-loc-main">{r.country_name || 'Unknown'}</div>
                            <div className="tx-sub">
                              {r.market === 'export' ? (
                                <span className="rc-tag export">Export</span>
                              ) : r.state ? (
                                <>{r.state}{r.state_source && r.state_source !== 'client' ? <span className="rc-tag">{STATE_SOURCE_TAG[r.state_source] ?? r.state_source}</span> : null}</>
                              ) : (
                                <span className="rc-tag muted">State not captured</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tx-td tx-num">{fmt(r.coins)}</td>
                      <td className="tx-td tx-num">
                        <div className="rc-strong">{money(r.amount, r.currency)}</div>
                        {r.payment_method && <div className="tx-sub">{methodLabel(r)}</div>}
                      </td>
                      <td className="tx-td tx-num tx-muted">{r.taxable && r.market === 'domestic' ? money(r.taxable_value) : '—'}</td>
                      <td className="tx-td tx-num">
                        {r.taxable && r.market === 'domestic' ? (
                          <>
                            <div className="rc-strong">{money(r.total_gst)}</div>
                            <div className="tx-sub">{r.supply_type === 'Intra-state' ? 'CGST + SGST' : r.supply_type === 'Inter-state' ? 'IGST' : 'Split pending'}</div>
                          </>
                        ) : r.taxable ? (
                          <span className="tx-sub">Zero-rated</span>
                        ) : (
                          <span className="tx-muted">—</span>
                        )}
                      </td>
                      <td className="tx-td">
                        {r.needs_review ? <span className="tx-status status-review">Needs review</span> : <span className={`tx-status status-${r.status}`}>{r.status}</span>}
                        {r.gateway?.admin_resolution === 'paid_without_credit' && <div className="tx-sub">paid, no coins</div>}
                        {r.gateway?.admin_resolution === 'imported_from_razorpay' && <div className="tx-sub">imported</div>}
                        {r.source !== 'RAZORPAY' && <div className="tx-sub">{r.source === 'EARNINGS_WALLET' ? 'Earnings' : r.source}</div>}
                      </td>
                      <td className="tx-td tx-date">
                        <div>{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div className="tx-sub">{new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="tx-pager">
          <div className="tx-pager-info">
            {total > 0 ? <>Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong></> : '—'}
            <label className="tx-page-size">
              Rows
              <select value={filters.limit} onChange={(e) => update({ limit: Number(e.target.value) })}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="tx-pager-controls">
              <button type="button" className="tx-page-btn" disabled={loading || filters.page <= 1} onClick={() => goToPage(1)} aria-label="First page">«</button>
              <button type="button" className="tx-page-btn" disabled={loading || filters.page <= 1} onClick={() => goToPage(filters.page - 1)}>‹ Prev</button>
              {pageNumbers().map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="tx-page-gap">…</span>
                ) : (
                  <button key={p} type="button" className={`tx-page-btn ${p === filters.page ? 'is-active' : ''}`} disabled={loading} onClick={() => goToPage(p)}>
                    {p}
                  </button>
                ),
              )}
              <button type="button" className="tx-page-btn" disabled={loading || filters.page >= totalPages} onClick={() => goToPage(filters.page + 1)}>Next ›</button>
              <button type="button" className="tx-page-btn" disabled={loading || filters.page >= totalPages} onClick={() => goToPage(totalPages)} aria-label="Last page">»</button>
              <form
                className="tx-jump"
                onSubmit={(e) => {
                  e.preventDefault();
                  goToPage(Number(pageInput));
                }}
              >
                Go to
                <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} />
                / {totalPages}
              </form>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="tx-drawer-overlay" onClick={() => setSelected(null)}>
          <aside className="tx-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="tx-drawer-head">
              <div>
                <div className="tx-drawer-kicker">Recharge #{selected.id} · <span className="rc-mono">{selected.document_no}</span></div>
                <div className="tx-drawer-amount pos">{money(selected.amount, selected.currency)}</div>
                <span className={`tx-status status-${selected.status}`}>{selected.status}</span>{' '}
                <span className="tx-sub">{fmt(selected.coins)} coins</span>
              </div>
              <button type="button" className="tx-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>

            {selected.needs_review && (
              <section className="rc-review">
                <div className="rc-review-title">Payment captured — coins not credited</div>
                <div className="rc-review-text">
                  Razorpay captured {money(selected.amount, selected.currency)}
                  {selected.gateway?.paid_at ? ` on ${new Date(selected.gateway.paid_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}, but{' '}
                  {fmt(selected.coins)} coins were never added to user #{selected.user_id}. Check the user&apos;s ledger for a manual credit before deciding.
                </div>
                {confirmAction === null ? (
                  <div className="rc-review-actions">
                    <button type="button" className="tx-btn tx-btn-export" onClick={() => setConfirmAction('credit')}>Credit {fmt(selected.coins)} coins</button>
                    <button type="button" className="tx-btn tx-btn-ghost" onClick={() => setConfirmAction('paid')}>Mark paid — no coins</button>
                    <button
                      type="button"
                      className="tx-link"
                      onClick={() => {
                        window.location.href = `${window.location.pathname}?user_id=${selected.user_id}`;
                      }}
                    >
                      View user&apos;s coin ledger
                    </button>
                  </div>
                ) : (
                  <div className="rc-confirm">
                    {confirmAction === 'credit' ? (
                      <div>
                        Add <strong>{fmt(selected.coins)} coins</strong> to <strong>{selected.user_name || `user #${selected.user_id}`}</strong> now? This writes a RECHARGE ledger entry and cannot be undone here.
                      </div>
                    ) : (
                      <>
                        <div>Record this payment as revenue <strong>without</strong> crediting coins (the buyer was compensated another way).</div>
                        <input placeholder="Note (optional), e.g. compensated via admin credit on 25 Sep" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} maxLength={500} />
                      </>
                    )}
                    <div className="rc-review-actions">
                      <button type="button" className={`tx-btn ${confirmAction === 'credit' ? 'tx-btn-export' : 'tx-btn-primary'}`} disabled={resolving} onClick={() => void resolveReview(confirmAction)}>
                        {resolving ? 'Working…' : confirmAction === 'credit' ? 'Yes, credit coins' : 'Yes, mark as paid'}
                      </button>
                      <button type="button" className="tx-btn tx-btn-ghost" disabled={resolving} onClick={() => setConfirmAction(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="rc-section">
              <div className="rc-section-title">Customer</div>
              <dl className="tx-dl">
                <dt>Name</dt><dd>{selected.user_name || '—'}</dd>
                <dt>User ID</dt><dd>{selected.user_id}{selected.user_display_id ? <span className="tx-muted"> · display {selected.user_display_id}</span> : null}</dd>
                <dt>Email</dt><dd>{selected.user_email || '—'}</dd>
                <dt>Phone</dt><dd>{selected.user_phone || '—'}</dd>
                <dt>Country</dt>
                <dd>
                  {flag(selected.country)} {selected.country_name || '—'}
                  {selected.country_source && <span className="rc-tag">{selected.country_source === 'checkout' ? 'at checkout' : selected.country_source === 'app' ? 'last app report' : 'profile'}</span>}
                  {(selected.profile_country || selected.last_client_country) && (
                    <div className="tx-sub">Profile: {selected.profile_country || '—'} · App reported: {selected.last_client_country || '—'}</div>
                  )}
                </dd>
                <dt>State</dt>
                <dd>
                  {selected.state ? `${selected.state_code} · ${selected.state}` : <span className="tx-muted">Not captured</span>}
                  {selected.state_source && <span className="rc-tag">{STATE_SOURCE_TAG[selected.state_source] ?? selected.state_source}</span>}
                </dd>
                <dt>Client IP</dt><dd className="rc-mono">{selected.client_ip || <span className="tx-muted">Not captured (older order)</span>}</dd>
              </dl>
            </section>

            {selected.market === 'domestic' && (
              <section className="rc-section">
                <div className="rc-section-title">Place of supply</div>
                <div className="rc-pos-edit">
                  <select value={posDraft} onChange={(e) => setPosDraft(e.target.value)}>
                    <option value="">— Not on record (use supplier state) —</option>
                    {indianStates.map((s) => (
                      <option key={s.code} value={s.name}>{s.code} · {s.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    disabled={savingPos || posDraft === (selected.state ?? '')}
                    onClick={() => void savePlaceOfSupply()}
                  >
                    {savingPos ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <div className="tx-sub" style={{ marginTop: 6 }}>
                  Currently <strong>{selected.place_of_supply || '—'}</strong> · {selected.pos_basis}
                </div>
              </section>
            )}

            <section className="rc-section">
              <div className="rc-section-title">Tax breakdown</div>
              {selected.taxable ? (
                <table className="rc-tax">
                  <tbody>
                    <tr><td>Supply type</td><td>{selected.supply_type}</td></tr>
                    {selected.market === 'domestic' ? (
                      <>
                        <tr><td>Taxable value</td><td>{money(selected.taxable_value)}</td></tr>
                        {selected.supply_type === 'Inter-state' && <tr><td>IGST @ {selected.gst_rate}%</td><td>{money(selected.igst)}</td></tr>}
                        {selected.supply_type === 'Intra-state' && (
                          <>
                            <tr><td>CGST @ {selected.gst_rate / 2}%</td><td>{money(selected.cgst)}</td></tr>
                            <tr><td>SGST @ {selected.gst_rate / 2}%</td><td>{money(selected.sgst)}</td></tr>
                          </>
                        )}
                        {selected.supply_type === 'Undetermined' && <tr><td>GST @ {selected.gst_rate}% (split pending)</td><td>{money(selected.total_gst)}</td></tr>}
                        <tr className="rc-tax-total"><td>Invoice value</td><td>{money(selected.invoice_value)}</td></tr>
                      </>
                    ) : (
                      <>
                        <tr><td>Value ({selected.currency})</td><td>{money(selected.amount, selected.currency)}</td></tr>
                        <tr><td>INR equivalent</td><td>{money(selected.inr_value)}</td></tr>
                        <tr><td>IGST</td><td>₹0.00 (zero-rated, LUT)</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="tx-sub">{selected.gst_treatment}. Not included in GST totals.</div>
              )}
            </section>

            <section className="rc-section">
              <div className="rc-section-title">Payment</div>
              <dl className="tx-dl">
                <dt>Source</dt><dd>{selected.source}</dd>
                <dt>Order ID</dt>
                <dd>
                  {selected.razorpay_order_id ? (
                    <span className="tx-ref">
                      <code>{selected.razorpay_order_id}</code>
                      <button type="button" className="tx-link" onClick={() => void copy(selected.razorpay_order_id!, 'Order ID')}>Copy</button>
                    </span>
                  ) : '—'}
                </dd>
                <dt>Payment ID</dt>
                <dd>
                  {selected.razorpay_payment_id ? (
                    <span className="tx-ref">
                      <code>{selected.razorpay_payment_id}</code>
                      <button type="button" className="tx-link" onClick={() => void copy(selected.razorpay_payment_id!, 'Payment ID')}>Copy</button>
                    </span>
                  ) : '—'}
                </dd>
                <dt>Date</dt><dd>{new Date(selected.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</dd>
              </dl>
            </section>

            <section className="rc-section">
              <div className="rc-section-title">From Razorpay</div>
              {selected.gateway ? (
                <dl className="tx-dl">
                  <dt>Status</dt><dd><span className={`rc-gw rc-gw-${selected.gateway_status}`}>{selected.gateway_status ?? '—'}</span>{selected.gateway.attempts && selected.gateway.attempts > 1 ? <span className="tx-muted"> · {selected.gateway.attempts} attempts</span> : null}</dd>
                  <dt>Method</dt><dd>{methodLabel(selected)}</dd>
                  {selected.gateway.vpa && (<><dt>UPI ID</dt><dd className="rc-mono">{selected.gateway.vpa}{selected.gateway.upi_flow ? <span className="tx-muted"> · {selected.gateway.upi_flow}</span> : null}</dd></>)}
                  {(selected.gateway.card_network || selected.gateway.card_last4) && (
                    <><dt>Card</dt><dd>{[selected.gateway.card_network, selected.gateway.card_type, selected.gateway.card_last4 ? `•••• ${selected.gateway.card_last4}` : null].filter(Boolean).join(' ')}{selected.gateway.card_issuer ? <div className="tx-sub">Issuer {selected.gateway.card_issuer}{selected.gateway.card_country ? ` · ${selected.gateway.card_country}` : ''}</div> : null}</dd></>
                  )}
                  {(selected.gateway.bank || selected.gateway.wallet) && (<><dt>Bank / wallet</dt><dd>{selected.gateway.bank || selected.gateway.wallet}</dd></>)}
                  {selected.gateway.international !== null && selected.gateway.international !== undefined && (<><dt>International</dt><dd>{selected.gateway.international ? 'Yes' : 'No'}</dd></>)}
                  {selected.gateway.rrn && (
                    <><dt>Bank RRN</dt><dd><span className="tx-ref"><code>{selected.gateway.rrn}</code><button type="button" className="tx-link" onClick={() => void copy(selected.gateway!.rrn!, 'RRN')}>Copy</button></span></dd></>
                  )}
                  <dt>Payer phone</dt><dd>{selected.gateway.contact || '—'}</dd>
                  <dt>Payer email</dt><dd>{selected.gateway.email || '—'}</dd>
                  {(selected.gateway.fee ?? 0) > 0 && (<><dt>Gateway fee</dt><dd>{money(selected.gateway.fee)} + GST {money(selected.gateway.tax ?? 0)}</dd></>)}
                  {(selected.gateway.amount_refunded ?? 0) > 0 && (<><dt>Refunded</dt><dd className="tone-red">{money(selected.gateway.amount_refunded)} ({selected.gateway.refund_status})</dd></>)}
                  {(selected.gateway.error_description || selected.gateway.error_reason) && (
                    <><dt>Failure</dt><dd className="tone-red">{[selected.gateway.error_reason?.replace(/_/g, ' '), selected.gateway.error_description].filter(Boolean).join(' — ')}</dd></>
                  )}
                  {selected.gateway.description && (<><dt>Description</dt><dd>{selected.gateway.description}</dd></>)}
                  {selected.gateway.admin_resolution && (
                    <><dt>Resolution</dt><dd>{selected.gateway.admin_resolution === 'paid_without_credit' ? 'Marked paid without coins' : 'Imported from Razorpay (no coins credited)'}{selected.gateway.admin_note ? <div className="tx-sub">{selected.gateway.admin_note}</div> : null}</dd></>
                  )}
                  <dt>Synced</dt><dd className="tx-muted">{selected.gateway_synced_at ? new Date(selected.gateway_synced_at).toLocaleString('en-IN') : '—'}</dd>
                </dl>
              ) : (
                <div className="tx-sub">
                  {selected.gateway_status === 'no_attempt' ? 'The buyer opened checkout but never attempted a payment.' : 'Not synced yet — use “Sync with Razorpay” to load payment method, UPI ID, bank RRN and payer details.'}
                </div>
              )}
            </section>

            <div className="tx-drawer-actions">
              <Link href={`/users?q=%23${selected.user_id}`} className="tx-btn tx-btn-ghost tx-btn-link">
                Open user in User Management
              </Link>
            </div>
          </aside>
        </div>
      )}

      {syncResult && (
        <div className="tx-drawer-overlay rc-modal-overlay" onClick={() => setSyncResult(null)}>
          <div className="rc-modal rc-modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="tx-drawer-head">
              <div>
                <div className="rc-modal-title">Razorpay sync complete</div>
                <div className="tx-sub">
                  Orders from {new Date(syncResult.range.from).toLocaleDateString('en-IN')} to {new Date(syncResult.range.to).toLocaleDateString('en-IN')}
                </div>
              </div>
              <button type="button" className="tx-close" onClick={() => setSyncResult(null)} aria-label="Close">×</button>
            </div>
            <div className="rc-sync-stats">
              <div><strong>{fmt(syncResult.fetched_payments)}</strong><span>payments fetched</span></div>
              <div><strong>{fmt(syncResult.captured_payments)}</strong><span>captured</span></div>
              <div><strong>{fmt(syncResult.orders_checked)}</strong><span>orders checked</span></div>
              <div><strong>{fmt(syncResult.marked_failed)}</strong><span>closed as failed / abandoned</span></div>
              <div className={syncResult.needs_review ? 'is-danger' : ''}><strong>{fmt(syncResult.needs_review)}</strong><span>need review</span></div>
            </div>
            <div className="tx-sub">No coins were credited by this sync. Captured payments without coins are listed under “Needs review”.</div>

            {syncResult.orphans.length > 0 && (
              <div className="rc-orphans">
                <div className="rc-section-title">Captured in Razorpay but missing from our records ({syncResult.orphans.length})</div>
                <div className="tx-sub" style={{ marginBottom: 8 }}>
                  Usually payments from the old backend. Importing records them as successful recharges for revenue and GST reports — <strong>no coins are credited</strong>.
                </div>
                <div className="tx-table-wrap rc-orphan-table">
                  <table className="tx-table">
                    <thead>
                      <tr>
                        <th className="tx-th">Payment</th>
                        <th className="tx-th">User</th>
                        <th className="tx-th" style={{ textAlign: 'right' }}>Amount</th>
                        <th className="tx-th">Method / payer</th>
                        <th className="tx-th">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncResult.orphans.map((o) => (
                        <tr key={o.payment_id}>
                          <td className="tx-td"><div className="rc-mono">{o.payment_id}</div><div className="tx-sub">{o.description}</div></td>
                          <td className="tx-td">{o.notes?.user_id ? `#${o.notes.user_id}` : '—'}</td>
                          <td className="tx-td tx-num rc-strong">{money(o.amount, o.currency)}</td>
                          <td className="tx-td"><div>{o.method}</div><div className="tx-sub">{o.contact || o.email || ''}</div></td>
                          <td className="tx-td tx-date">{new Date(o.paid_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rc-modal-actions">
              {syncResult.needs_review > 0 && (
                <button
                  type="button"
                  className="tx-btn tx-btn-danger"
                  onClick={() => {
                    setSyncResult(null);
                    update({ review: '1', status: '' });
                  }}
                >
                  Review {syncResult.needs_review} uncredited
                </button>
              )}
              {syncResult.orphans.length > 0 && (
                <button type="button" className="tx-btn tx-btn-primary" disabled={importing} onClick={() => void handleImport(syncResult.orphans.map((o) => o.payment_id))}>
                  {importing ? 'Importing…' : `Import ${syncResult.orphans.length} into records`}
                </button>
              )}
              <button type="button" className="tx-btn tx-btn-ghost" onClick={() => setSyncResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && config && (
        <GstSettingsModal
          config={config}
          states={indianStates}
          onClose={() => setSettingsOpen(false)}
          onSaved={(c) => {
            setConfig(c);
            setSettingsOpen(false);
            toast('success', 'GST settings saved');
            void load();
          }}
        />
      )}

      <div className="tx-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`tx-toast ${t.kind}`}>{t.kind === 'success' ? '✓' : '!'} {t.text}</div>
        ))}
      </div>
    </main>
  );
}

function GstSettingsModal({
  config,
  states,
  onClose,
  onSaved,
}: {
  config: GstConfig;
  states: { code: string; name: string }[];
  onClose: () => void;
  onSaved: (c: GstConfig) => void;
}) {
  const [form, setForm] = useState({
    legal_name: config.legal_name,
    gstin: config.gstin,
    supplier_state: config.supplier_state ?? '',
    rate: String(config.rate),
    prices_inclusive: config.prices_inclusive,
    sac: config.sac,
    document_prefix: config.document_prefix,
    inr_per_usd: String(config.inr_per_usd),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gstinState = /^\d{2}/.test(form.gstin) ? states.find((s) => s.code === form.gstin.slice(0, 2)) : undefined;

  async function save(e: FormEvent) {
    e.preventDefault();
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ data?: { config?: GstConfig } }>(`/admin/recharges/gst-config`, tok, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, gstin: form.gstin.trim().toUpperCase(), rate: Number(form.rate), inr_per_usd: Number(form.inr_per_usd) }),
      });
      if (res.data?.config) onSaved(res.data.config);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="tx-drawer-overlay rc-modal-overlay" onClick={onClose}>
      <form className="rc-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)} role="dialog" aria-modal="true">
        <div className="tx-drawer-head">
          <div>
            <div className="rc-modal-title">GST settings</div>
            <div className="tx-sub">Used for the tax split and the Excel export.</div>
          </div>
          <button type="button" className="tx-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="rc-form">
          <label className="rc-full">
            <span>Legal / trade name</span>
            <input value={form.legal_name} onChange={(e) => set({ legal_name: e.target.value })} placeholder="e.g. Indian Software Services Pvt Ltd" />
          </label>
          <label>
            <span>GSTIN</span>
            <input
              value={form.gstin}
              maxLength={15}
              onChange={(e) => {
                const gstin = e.target.value.toUpperCase();
                const st = /^\d{2}/.test(gstin) ? states.find((s) => s.code === gstin.slice(0, 2)) : undefined;
                set({ gstin, ...(st && !form.supplier_state ? { supplier_state: st.name } : {}) });
              }}
              placeholder="27ABCDE1234F1Z5"
              className="rc-mono"
            />
            {gstinState && <em>State code {gstinState.code} · {gstinState.name}</em>}
          </label>
          <label>
            <span>Supplier state (registered)</span>
            <select value={form.supplier_state} onChange={(e) => set({ supplier_state: e.target.value })}>
              <option value="">— Select —</option>
              {states.filter((s) => s.code !== '97').map((s) => (
                <option key={s.code} value={s.name}>{s.code} · {s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>GST rate (%)</span>
            <input type="number" min={0} max={100} step="0.01" value={form.rate} onChange={(e) => set({ rate: e.target.value })} />
          </label>
          <label>
            <span>SAC code</span>
            <input value={form.sac} onChange={(e) => set({ sac: e.target.value })} className="rc-mono" />
          </label>
          <label>
            <span>Document number prefix</span>
            <input value={form.document_prefix} onChange={(e) => set({ document_prefix: e.target.value })} className="rc-mono" />
            <em>e.g. {form.document_prefix || ''}2026-27/000123</em>
          </label>
          <label>
            <span>USD → INR rate (exports)</span>
            <input type="number" min={0} step="0.0001" value={form.inr_per_usd} onChange={(e) => set({ inr_per_usd: e.target.value })} />
          </label>
          <label className="rc-full rc-check">
            <input type="checkbox" checked={form.prices_inclusive} onChange={(e) => set({ prices_inclusive: e.target.checked })} />
            <span>Coin pack prices already include GST (tax is carved out of the amount paid)</span>
          </label>
        </div>

        {error && <div className="tx-alert" style={{ margin: 0 }}>{error}</div>}

        <div className="rc-modal-actions">
          <button type="button" className="tx-btn tx-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="tx-btn tx-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
    </div>
  );
}

const RC_STYLES = `
.rc-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
.rc-sync { display: grid; justify-items: center; gap: 2px; }
.rc-banner.danger { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
.tx .tx-btn-danger { background: #dc2626; color: #fff; }
.tx .tx-btn-danger:hover:not(:disabled) { background: #b91c1c; }
.tx .tx-seg-btn.dir-review { color: #b91c1c; }
.tx .tx-seg-btn.dir-review.is-active { background: #dc2626; color: #fff; }
.tx-status.status-review { background: #fee2e2; color: #991b1b; }
.rc-review { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; display: grid; gap: 10px; }
.rc-review-title { font-weight: 700; color: #991b1b; }
.rc-review-text { font-size: 0.85rem; color: #7f1d1d; line-height: 1.45; }
.rc-review-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.rc-confirm { display: grid; gap: 10px; font-size: 0.85rem; color: #111827; background: #fff; border-radius: 8px; padding: 12px; border: 1px solid #fecaca; }
.rc-confirm input { margin: 0; }
.rc-gw { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; background: #f3f4f6; color: #374151; }
.rc-gw-captured { background: #d1fae5; color: #065f46; }
.rc-gw-failed, .rc-gw-refunded { background: #fee2e2; color: #991b1b; }
.rc-gw-authorized { background: #fef3c7; color: #92400e; }
.rc-modal.rc-modal-wide { max-width: 860px; }
.rc-sync-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.rc-sync-stats > div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; }
.rc-sync-stats strong { font-size: 1.3rem; color: #111827; font-variant-numeric: tabular-nums; }
.rc-sync-stats span { font-size: 0.72rem; color: #6b7280; }
.rc-sync-stats .is-danger { background: #fef2f2; border-color: #fecaca; }
.rc-sync-stats .is-danger strong { color: #b91c1c; }
.rc-orphan-table { max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
@media (max-width: 700px) { .rc-sync-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tx-kpis.rc-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.rc-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 0.875rem; line-height: 1.45; }
.rc-banner.warn { background: #fffbeb; border: 1px solid #fde68a; color: #78350f; }
.rc-banner.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; }
.rc-banner code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px; font-size: 0.8rem; }
.rc-seg-count { margin-left: 6px; font-size: 0.7rem; opacity: 0.75; font-variant-numeric: tabular-nums; }
.tx .rc-select-sm { min-width: 96px; }
.rc-reset { align-self: flex-end; }
.rc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.75rem; }
.rc-ellipsis { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-loc { display: flex; align-items: center; gap: 8px; min-width: 150px; }
.rc-flag { font-size: 1.25rem; line-height: 1; }
.rc-loc-main { font-weight: 500; color: #111827; }
.rc-tag { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #eef2ff; color: #4338ca; font-size: 0.68rem; font-weight: 600; }
.rc-tag.export { margin-left: 0; background: #ecfeff; color: #0e7490; }
.rc-tag.muted { margin-left: 0; background: #f3f4f6; color: #6b7280; }
.rc-strong { font-weight: 700; color: #111827; }
.rc-section { border-top: 1px solid #f3f4f6; padding-top: 14px; }
.rc-section-title { font-size: 0.72rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
.rc-pos-edit { display: flex; gap: 8px; }
.tx .rc-pos-edit select { flex: 1; max-width: none; }
.rc-tax { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.rc-tax td { padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
.rc-tax td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.rc-tax-total td { font-weight: 700; border-bottom: none; padding-top: 10px; }
.rc-modal-overlay { justify-content: center; align-items: center; padding: 16px; }
.rc-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 620px; max-height: calc(100vh - 32px); overflow-y: auto; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 24px 48px rgba(0,0,0,0.18); animation: tx-in 0.18s ease-out; }
.rc-modal-title { font-size: 1.2rem; font-weight: 700; color: #111827; }
.rc-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.rc-form label { display: grid; gap: 5px; font-size: 0.78rem; font-weight: 600; color: #374151; }
.rc-form input, .tx .rc-form select { margin: 0; max-width: none; width: 100%; box-sizing: border-box; }
.rc-form em { font-style: normal; font-weight: 400; color: #6b7280; font-size: 0.72rem; }
.rc-full { grid-column: 1 / -1; }
.rc-form .rc-check { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.rc-check input { width: 16px; height: 16px; flex: 0 0 16px; }
.rc-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 1300px) { .tx-kpis.rc-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .tx-kpis.rc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .rc-form { grid-template-columns: 1fr; } .rc-banner { flex-direction: column; align-items: flex-start; } }
`;
