'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import RechargesView from './RechargesView';
import { STYLES } from './tx-styles';

type Transaction = {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email?: string | null;
  user_avatar?: string | null;
  type: string;
  title?: string | null;
  amount: number;
  net_amount: number | null;
  commission_amount: number | null;
  balance_after?: number | null;
  reference_id?: string | null;
  status: string;
  meta?: unknown;
  created_at: string;
};

type Analytics = {
  count?: number;
  credits_total?: number;
  credits_count?: number;
  debits_total?: number;
  debits_count?: number;
  net_flow?: number;
  total_commission?: number;
};

type TypeCount = { type: string; count: number };

type RangeKey = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

type Filters = {
  q: string;
  user_id: string;
  category: string;
  type: string;
  direction: '' | 'credit' | 'debit';
  range: RangeKey;
  from: string;
  to: string;
  min_amount: string;
  max_amount: string;
  nonzero: boolean;
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  page: number;
};

type Toast = { id: number; kind: 'success' | 'error'; text: string };

const DEFAULT_FILTERS: Filters = {
  q: '',
  user_id: '',
  category: '',
  type: '',
  direction: '',
  range: 'all',
  from: '',
  to: '',
  min_amount: '',
  max_amount: '',
  nonzero: false,
  sort: 'id',
  order: 'desc',
  limit: 25,
  page: 1,
};

const CATEGORIES: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'purchases', label: 'Purchases & transfers', color: '#1d4ed8', bg: '#dbeafe' },
  { key: 'gifts', label: 'Gifts & items', color: '#be185d', bg: '#fce7f3' },
  { key: 'calls', label: 'Calls & chat', color: '#0f766e', bg: '#ccfbf1' },
  { key: 'games', label: 'Games', color: '#7c3aed', bg: '#ede9fe' },
  { key: 'rockets', label: 'Rockets', color: '#c2410c', bg: '#ffedd5' },
  { key: 'bonuses', label: 'Bonuses & rewards', color: '#15803d', bg: '#dcfce7' },
  { key: 'other', label: 'Other', color: '#374151', bg: '#f3f4f6' },
];

function categoryOf(type: string): string {
  const t = type.toUpperCase();
  if (t.startsWith('GAME_') || t.startsWith('SPIN')) return 'games';
  if (t.startsWith('ROCKET')) return 'rockets';
  if (t.startsWith('BONUS') || t === 'AGENCY_CASHBACK' || t === 'XP') return 'bonuses';
  if (['GIFT', 'STICKER', 'FRAME', 'RELATIONSHIP', 'LUCKY_GIFT_REBATE', 'ENTRY_BAR'].includes(t)) return 'gifts';
  if (['AUDIO_CALL', 'VIDEO_CALL', 'STAR_CHAT', 'CALL_COMMISSION'].includes(t)) return 'calls';
  if (['RECHARGE', 'SELLER_TRANSFER', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'GEM_TO_COINS', 'REFERRAL_CONVERT', 'WITHDRAWAL'].includes(t)) {
    return 'purchases';
  }
  return 'other';
}

function categoryMeta(type: string) {
  return CATEGORIES.find((c) => c.key === categoryOf(type)) ?? CATEGORIES[CATEGORIES.length - 1];
}

function typeLabel(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const SORT_PRESETS: { value: string; label: string }[] = [
  { value: 'id:desc', label: 'Newest first' },
  { value: 'id:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Amount: largest credit' },
  { value: 'amount:asc', label: 'Amount: largest debit' },
  { value: 'commission:desc', label: 'Commission: high → low' },
  { value: 'type:asc', label: 'Type: A → Z' },
  { value: 'user:asc', label: 'User ID: low → high' },
];

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
  switch (f.range) {
    case 'today':
      return { from: startOf(now), to: endOf(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOf(y), to: endOf(y) };
    }
    case '7d': {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { from: startOf(s), to: endOf(now) };
    }
    case '30d': {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { from: startOf(s), to: endOf(now) };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOf(now) };
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
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => p.get(k) ?? '';
  const range = RANGES.some((r) => r.key === p.get('range')) ? (p.get('range') as RangeKey) : 'all';
  const limit = Number(p.get('limit'));
  const page = Number(p.get('page'));
  return {
    q: get('q'),
    user_id: /^\d+$/.test(get('user_id')) ? get('user_id') : '',
    category: CATEGORIES.some((c) => c.key === p.get('category')) ? get('category') : '',
    type: get('type'),
    direction: p.get('direction') === 'credit' || p.get('direction') === 'debit' ? (p.get('direction') as 'credit' | 'debit') : '',
    range,
    from: get('from'),
    to: get('to'),
    min_amount: get('min_amount'),
    max_amount: get('max_amount'),
    nonzero: p.get('nonzero') === '1',
    sort: ['id', 'created_at', 'amount', 'commission', 'net', 'type', 'user'].includes(get('sort')) ? get('sort') : 'id',
    order: p.get('order') === 'asc' ? 'asc' : 'desc',
    limit: [25, 50, 100].includes(limit) ? limit : 25,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function filtersToUrl(f: Filters): string {
  const p = new URLSearchParams();
  (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).forEach((k) => {
    const v = f[k];
    if (v === DEFAULT_FILTERS[k] || v === '') return;
    p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  });
  return p.toString();
}

function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString();
}

function signed(n: number) {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString()}`;
  return '0';
}

function LedgerView({ tabs }: { tabs: ReactNode }) {
  const { token } = useAdminAuth();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({});
  const [types, setTypes] = useState<TypeCount[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const requestSeq = useRef(0);
  const typesRef = useRef<TypeCount[]>([]);

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

  const typesInCategory = useMemo(
    () => (filters.category ? types.filter((t) => categoryOf(t.type) === filters.category) : types),
    [types, filters.category],
  );

  const buildParams = useCallback(
    (f: Filters) => {
      const p = new URLSearchParams();
      if (f.q) p.set('q', f.q);
      if (f.user_id) p.set('user_id', f.user_id);
      if (f.type) {
        p.set('type', f.type);
      } else if (f.category) {
        const list = typesRef.current.filter((t) => categoryOf(t.type) === f.category).map((t) => t.type);
        p.set('type', list.length ? list.join(',') : '__none__');
      }
      if (f.direction) p.set('direction', f.direction);
      if (f.nonzero) p.set('nonzero', '1');
      if (f.min_amount) p.set('min_amount', f.min_amount);
      if (f.max_amount) p.set('max_amount', f.max_amount);
      const { from, to } = rangeBounds(f);
      if (from) p.set('from', from.toISOString());
      if (to) p.set('to', to.toISOString());
      p.set('sort', f.sort);
      p.set('order', f.order);
      return p;
    },
    [],
  );

  const load = useCallback(async () => {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const seq = ++requestSeq.current;
    if (filters.category && !filters.type && typesRef.current.length === 0) {
      try {
        const res = await api<{ data?: { types?: TypeCount[] } }>(`/admin/transactions?limit=1`, tok);
        typesRef.current = res.data?.types ?? [];
        setTypes(typesRef.current);
      } catch {
        /* the main request below surfaces errors */
      }
      if (seq !== requestSeq.current) return;
    }
    setLoading(true);
    setLoadError(null);
    const params = buildParams(filters);
    params.set('page', String(filters.page));
    params.set('limit', String(filters.limit));
    try {
      const res = await api<{
        data?: {
          transactions?: Transaction[];
          analytics?: Analytics;
          types?: TypeCount[];
          meta?: { total?: number; pages?: number };
        };
      }>(`/admin/transactions?${params.toString()}`, tok);
      if (seq !== requestSeq.current) return;
      const pages = Math.max(1, Number(res.data?.meta?.pages ?? 1));
      setTransactions(res.data?.transactions ?? []);
      setAnalytics(res.data?.analytics ?? {});
      if (res.data?.types) {
        typesRef.current = res.data.types;
        setTypes(res.data.types);
      }
      setTotal(Number(res.data?.meta?.total ?? 0));
      setTotalPages(pages);
      if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load transactions');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters, buildParams]);

  useEffect(() => {
    if (!ready || !token) return;
    setPageInput(String(filters.page));
    const qs = filtersToUrl(filters);
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
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
      if (e.key === 'Escape') setSelected(null);
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

  const hasActiveFilters = filtersToUrl({ ...filters, page: 1, limit: DEFAULT_FILTERS.limit }) !== '';

  function toggleSort(column: string, defaultOrder: 'asc' | 'desc' = 'desc') {
    if (filters.sort === column) update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    else update({ sort: column, order: defaultOrder });
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

  function filterByUser(t: Transaction) {
    setSelected(null);
    setSearchInput('');
    update({ user_id: String(t.user_id), q: '' });
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('success', `${label} copied`);
    } catch {
      toast('error', 'Copy failed');
    }
  }

  async function handleExportCsv() {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setExporting(true);
    try {
      const res = await api<{ data?: string } | string>(`/admin/transactions/export?${buildParams(filters).toString()}`, tok);
      const csv = typeof res === 'string' ? res : res.data ?? '';
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${ymd(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast('success', `Exported ${Math.min(total, 20000).toLocaleString()} transactions`);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
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
          title={`Sort by ${label.toLowerCase()}`}
        >
          {label}
          <span className="tx-sort-icon">{active ? (filters.order === 'desc' ? '▼' : '▲') : '↕'}</span>
        </span>
      </th>
    );
  }

  const sortValue = `${filters.sort}:${filters.order}`;
  const sortKnown = SORT_PRESETS.some((s) => s.value === sortValue);
  const from = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const to = Math.min(filters.page * filters.limit, total);
  const netFlow = Number(analytics.net_flow ?? 0);

  return (
    <main className="tx">
      <style>{STYLES}</style>
      {tabs}

      <div className="tx-header">
        <div>
          <h1>Financial Transactions</h1>
          <p>Auditable coin ledger: purchases, gifts, calls, games, bonuses and commissions. Totals below follow your filters.</p>
        </div>
        <button type="button" className="tx-btn tx-btn-export" onClick={() => void handleExportCsv()} disabled={exporting || total === 0}>
          {exporting ? 'Exporting…' : `Export CSV${hasActiveFilters ? ' (filtered)' : ''}`}
        </button>
      </div>

      <div className="tx-kpis">
        <div className="tx-kpi">
          <div className="tx-kpi-label">Transactions</div>
          <div className="tx-kpi-value">{fmt(analytics.count)}</div>
          <div className="tx-kpi-sub">{hasActiveFilters ? 'matching filters' : 'all time'}</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Coins credited</div>
          <div className="tx-kpi-value tone-green">+{fmt(analytics.credits_total)}</div>
          <div className="tx-kpi-sub">{fmt(analytics.credits_count)} entries</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Coins debited</div>
          <div className="tx-kpi-value tone-red">−{fmt(analytics.debits_total)}</div>
          <div className="tx-kpi-sub">{fmt(analytics.debits_count)} entries</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Net coin flow</div>
          <div className={`tx-kpi-value ${netFlow >= 0 ? 'tone-green' : 'tone-red'}`}>{signed(netFlow)}</div>
          <div className="tx-kpi-sub">credits − debits</div>
        </div>
        <div className="tx-kpi">
          <div className="tx-kpi-label">Platform commission</div>
          <div className="tx-kpi-value tone-indigo">{fmt(analytics.total_commission)}</div>
          <div className="tx-kpi-sub">retained</div>
        </div>
      </div>

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
          <div className="tx-seg" role="group" aria-label="Direction">
            {([
              ['', 'All'],
              ['credit', '+ Credits'],
              ['debit', '− Debits'],
            ] as const).map(([v, label]) => (
              <button
                key={v || 'all'}
                type="button"
                className={`tx-seg-btn ${filters.direction === v ? 'is-active' : ''} ${v ? `dir-${v}` : ''}`}
                onClick={() => update({ direction: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="tx-toolbar">
          <div className="tx-search">
            <span className="tx-search-icon" aria-hidden>⌕</span>
            <input
              placeholder="Search user, email, #txn ID, user ID or reference…"
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
            <span>Category</span>
            <select value={filters.category} onChange={(e) => update({ category: e.target.value, type: '' })}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => {
                const n = types.filter((t) => categoryOf(t.type) === c.key).reduce((s, t) => s + t.count, 0);
                if (n === 0 && c.key !== filters.category) return null;
                return <option key={c.key} value={c.key}>{c.label} ({n.toLocaleString()})</option>;
              })}
            </select>
          </label>

          <label className="tx-field">
            <span>Type</span>
            <select value={filters.type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">{filters.category ? 'All in category' : 'All types'}</option>
              {typesInCategory.map((t) => (
                <option key={t.type} value={t.type}>{typeLabel(t.type)} ({t.count.toLocaleString()})</option>
              ))}
              {filters.type && !types.some((t) => t.type === filters.type) && (
                <option value={filters.type}>{typeLabel(filters.type)}</option>
              )}
            </select>
          </label>

          <label className="tx-field">
            <span>Amount (coins)</span>
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

          <label className="tx-check">
            <input type="checkbox" checked={filters.nonzero} onChange={(e) => update({ nonzero: e.target.checked })} />
            Hide zero-coin entries
          </label>

          {hasActiveFilters && (
            <button type="button" className="tx-btn tx-btn-ghost" onClick={resetFilters}>Reset filters</button>
          )}
        </div>

        {filters.user_id && (
          <div className="tx-active">
            <span className="tx-pill">
              User #{filters.user_id}
              <button type="button" onClick={() => update({ user_id: '' })} aria-label="Remove user filter">×</button>
            </span>
          </div>
        )}

        <div className="tx-summary">
          {loading ? 'Loading…' : (
            <>
              <strong>{total.toLocaleString()}</strong> transaction{total === 1 ? '' : 's'}
              {filters.q ? <> matching “{filters.q}”</> : null}
              <span className="tx-hint"> · Click a row for full details</span>
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
                {sortHeader('id', 'Txn')}
                {sortHeader('user', 'User', 'left', 'asc')}
                {sortHeader('type', 'Type', 'left', 'asc')}
                {sortHeader('amount', 'Amount', 'right')}
                {sortHeader('commission', 'Commission', 'right')}
                {sortHeader('net', 'Net', 'right')}
                <th className="tx-th" style={{ textAlign: 'right' }}>Balance after</th>
                <th className="tx-th">Status</th>
                {sortHeader('created_at', 'Date')}
              </tr>
            </thead>
            <tbody className={loading && transactions.length > 0 ? 'is-loading' : ''}>
              {loading && transactions.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}><td colSpan={9} className="tx-td"><div className="tx-skeleton" /></td></tr>
                ))
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="tx-empty">
                    <div className="tx-empty-title">No transactions found</div>
                    <div>Try widening the date range or clearing filters.</div>
                    {hasActiveFilters && (
                      <button type="button" className="tx-btn tx-btn-ghost" onClick={resetFilters} style={{ marginTop: 12 }}>Reset filters</button>
                    )}
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const cat = categoryMeta(t.type);
                  const name = t.user_name || `User #${t.user_id}`;
                  return (
                    <tr
                      key={t.id}
                      className={`tx-row ${selected?.id === t.id ? 'is-selected' : ''}`}
                      onClick={() => setSelected(t)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelected(t);
                      }}
                    >
                      <td className="tx-td tx-id">#{t.id}</td>
                      <td className="tx-td">
                        <div className="tx-user">
                          <div className="tx-avatar">
                            {t.user_avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.user_avatar} alt="" />
                            ) : (
                              <span>{name.trim().charAt(0).toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="tx-name" title={name}>{name}</div>
                            <button
                              type="button"
                              className="tx-link"
                              title="Show only this user's transactions"
                              onClick={(e) => {
                                e.stopPropagation();
                                filterByUser(t);
                              }}
                            >
                              ID {t.user_id}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="tx-td">
                        <span className="tx-type" style={{ color: cat.color, background: cat.bg }} title={t.type}>{typeLabel(t.type)}</span>
                        {t.title && <div className="tx-sub tx-title" title={t.title}>{t.title}</div>}
                      </td>
                      <td className={`tx-td tx-num tx-amount-cell ${t.amount > 0 ? 'pos' : t.amount < 0 ? 'neg' : 'zero'}`}>
                        {signed(t.amount)}
                      </td>
                      <td className="tx-td tx-num tx-muted">{t.commission_amount ? fmt(t.commission_amount) : '—'}</td>
                      <td className="tx-td tx-num tx-muted">{t.net_amount !== null && t.net_amount !== undefined ? fmt(t.net_amount) : '—'}</td>
                      <td className="tx-td tx-num tx-muted">{t.balance_after !== null && t.balance_after !== undefined ? fmt(t.balance_after) : '—'}</td>
                      <td className="tx-td">
                        <span className={`tx-status status-${t.status.toLowerCase()}`}>{t.status}</span>
                      </td>
                      <td className="tx-td tx-date">
                        <div>{new Date(t.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div className="tx-sub">{new Date(t.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
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
                <div className="tx-drawer-kicker">Transaction #{selected.id}</div>
                <div className={`tx-drawer-amount ${selected.amount > 0 ? 'pos' : selected.amount < 0 ? 'neg' : 'zero'}`}>
                  {signed(selected.amount)} coins
                </div>
                <span className="tx-type" style={{ color: categoryMeta(selected.type).color, background: categoryMeta(selected.type).bg }}>
                  {typeLabel(selected.type)}
                </span>
              </div>
              <button type="button" className="tx-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>

            <dl className="tx-dl">
              <dt>User</dt>
              <dd>
                {selected.user_name || '—'} <span className="tx-muted">#{selected.user_id}</span>
                {selected.user_email && <div className="tx-sub">{selected.user_email}</div>}
              </dd>
              {selected.title && (<><dt>Description</dt><dd>{selected.title}</dd></>)}
              <dt>Type code</dt><dd><code>{selected.type}</code></dd>
              <dt>Commission</dt><dd>{selected.commission_amount !== null ? fmt(selected.commission_amount) : '—'}</dd>
              <dt>Net amount</dt><dd>{selected.net_amount !== null ? fmt(selected.net_amount) : '—'}</dd>
              <dt>Balance after</dt><dd>{selected.balance_after !== null && selected.balance_after !== undefined ? fmt(selected.balance_after) : '—'}</dd>
              <dt>Status</dt><dd><span className={`tx-status status-${selected.status.toLowerCase()}`}>{selected.status}</span></dd>
              <dt>Date</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd>
              <dt>Reference</dt>
              <dd>
                {selected.reference_id ? (
                  <span className="tx-ref">
                    <code>{selected.reference_id}</code>
                    <button type="button" className="tx-link" onClick={() => void copy(selected.reference_id!, 'Reference')}>Copy</button>
                  </span>
                ) : '—'}
              </dd>
            </dl>

            {selected.meta !== null && selected.meta !== undefined && (
              <div className="tx-meta">
                <div className="tx-meta-label">Metadata</div>
                <pre>{JSON.stringify(selected.meta, null, 2)}</pre>
              </div>
            )}

            <div className="tx-drawer-actions">
              <button type="button" className="tx-btn tx-btn-primary" onClick={() => filterByUser(selected)}>
                Show all transactions for this user
              </button>
              <Link href={`/users?q=%23${selected.user_id}`} className="tx-btn tx-btn-ghost tx-btn-link">
                Open user in User Management
              </Link>
              <button type="button" className="tx-btn tx-btn-ghost" onClick={() => void copy(String(selected.id), 'Transaction ID')}>
                Copy transaction ID
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="tx-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`tx-toast ${t.kind}`}>{t.kind === 'success' ? '✓' : '!'} {t.text}</div>
        ))}
      </div>
    </main>
  );
}

type View = 'ledger' | 'recharges';

export default function TransactionsPage() {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    setView(new URLSearchParams(window.location.search).get('view') === 'recharges' ? 'recharges' : 'ledger');
  }, []);

  function switchView(next: View) {
    if (next === view) return;
    window.history.replaceState(null, '', `${window.location.pathname}${next === 'recharges' ? '?view=recharges' : ''}`);
    setView(next);
  }

  if (!view) return null;

  const tabs = (
    <div className="tx-tabs" role="tablist" aria-label="Transactions view">
      <button type="button" role="tab" aria-selected={view === 'ledger'} className={`tx-tab ${view === 'ledger' ? 'is-active' : ''}`} onClick={() => switchView('ledger')}>
        Coin ledger
      </button>
      <button type="button" role="tab" aria-selected={view === 'recharges'} className={`tx-tab ${view === 'recharges' ? 'is-active' : ''}`} onClick={() => switchView('recharges')}>
        Recharges &amp; GST
      </button>
    </div>
  );

  return view === 'recharges' ? <RechargesView tabs={tabs} /> : <LedgerView tabs={tabs} />;
}
