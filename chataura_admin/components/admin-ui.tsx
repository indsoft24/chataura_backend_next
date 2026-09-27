'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

// ─── URL-synced filter state ────────────────────────────────────────────

export type FilterValue = string | number | boolean;

/**
 * Filter state mirrored into the query string so refresh / shared links keep the view.
 * `parse` receives URLSearchParams and must return a full, validated filter object.
 */
export function useUrlFilters<T extends Record<string, FilterValue> & { page: number }>(
  defaults: T,
  parse: (p: URLSearchParams) => T,
) {
  const [filters, setFilters] = useState<T>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFilters(parse(new URLSearchParams(window.location.search)));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    (Object.keys(defaults) as (keyof T)[]).forEach((k) => {
      const v = filters[k];
      if (v === defaults[k] || v === '') return;
      p.set(String(k), typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [filters, ready, defaults]);

  const update = useCallback((patch: Partial<T>) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }, []);

  const reset = useCallback(() => setFilters(defaults), [defaults]);

  const isDirty = (Object.keys(defaults) as (keyof T)[]).some(
    (k) => k !== 'page' && k !== 'limit' && filters[k] !== defaults[k],
  );

  return { filters, setFilters, update, reset, ready, isDirty };
}

/** Text input that commits to filters after the user stops typing. */
export function useDebouncedCommit(value: string, commit: (v: string) => void, delay = 400) {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const t = setTimeout(() => commitRef.current(value.trim()), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
}

export function pick<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function positiveInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ─── Date ranges ────────────────────────────────────────────────────────

export type RangeKey = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';
export const RANGE_KEYS: readonly RangeKey[] = ['all', 'today', 'yesterday', '7d', '30d', 'month', 'custom'];

const RANGE_LABELS: Record<RangeKey, string> = {
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  custom: 'Custom',
};

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rangeBounds(range: RangeKey, fromDay: string, toDay: string): { from?: Date; to?: Date } {
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
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (range) {
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
    case 'custom':
      return {
        from: fromDay ? startOf(new Date(`${fromDay}T00:00:00`)) : undefined,
        to: toDay ? endOf(new Date(`${toDay}T00:00:00`)) : undefined,
      };
    default:
      return {};
  }
}

export function applyRange(p: URLSearchParams, range: RangeKey, fromDay: string, toDay: string) {
  const { from, to } = rangeBounds(range, fromDay, toDay);
  if (from) p.set('from', from.toISOString());
  if (to) p.set('to', to.toISOString());
}

export function DateRangeChips({
  range,
  from,
  to,
  onChange,
  keys = RANGE_KEYS,
}: {
  range: RangeKey;
  from: string;
  to: string;
  onChange: (patch: { range: RangeKey; from: string; to: string }) => void;
  keys?: readonly RangeKey[];
}) {
  return (
    <div className="ad-chips">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`ad-chip ${range === k ? 'is-active' : ''}`}
          onClick={() => {
            if (k === 'custom') {
              const today = ymd(new Date());
              onChange({ range: 'custom', from: from || today, to: to || today });
            } else {
              onChange({ range: k, from: '', to: '' });
            }
          }}
        >
          {RANGE_LABELS[k]}
        </button>
      ))}
      {range === 'custom' && (
        <span className="ad-custom-range">
          <input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ range, from: e.target.value, to })} />
          <span>to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ range, from, to: e.target.value })} />
        </span>
      )}
    </div>
  );
}

// ─── Formatting ─────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString();
}

export function formatDuration(sec: number) {
  if (!sec || sec < 60) return `${Math.max(0, Math.floor(sec || 0))}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : fallback;
}

// ─── Toasts ─────────────────────────────────────────────────────────────

type Toast = { id: number; kind: 'success' | 'error'; text: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  const node = (
    <div className="ad-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`ad-toast ${t.kind}`}>
          {t.kind === 'success' ? '✓' : '!'} {t.text}
        </div>
      ))}
    </div>
  );
  return { toast, toastNode: node };
}

// ─── Confirm dialog ─────────────────────────────────────────────────────

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary' | 'success';
  onConfirm: () => Promise<void>;
};

export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, busy]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setError(null);
    setState(opts);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      await state.onConfirm();
      setState(null);
    } catch (err) {
      setError(errorText(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  }

  const node = state ? (
    <div className="ad-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setState(null)}>
      <form className="ad-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h2>{state.title}</h2>
        <div className="ad-modal-text">{state.message}</div>
        {error && <div className="ad-alert">{error}</div>}
        <div className="ad-modal-actions">
          <button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => setState(null)}>
            Cancel
          </button>
          <button type="submit" autoFocus className={`ad-btn ad-btn-solid tone-${state.tone ?? 'primary'}`} disabled={busy}>
            {busy ? 'Working…' : state.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return { confirm, confirmNode: node };
}

// ─── Table helpers ──────────────────────────────────────────────────────

export function SortTh({
  column,
  label,
  sort,
  order,
  onSort,
  align = 'left',
  defaultOrder = 'desc',
}: {
  column: string;
  label: string;
  sort: string;
  order: 'asc' | 'desc';
  onSort: (column: string, defaultOrder: 'asc' | 'desc') => void;
  align?: 'left' | 'right' | 'center';
  defaultOrder?: 'asc' | 'desc';
}) {
  const active = sort === column;
  return (
    <th className="ad-th" style={{ textAlign: align }}>
      <span
        role="button"
        tabIndex={0}
        className={`ad-sort ${active ? 'is-active' : ''}`}
        onClick={() => onSort(column, defaultOrder)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSort(column, defaultOrder);
          }
        }}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span className="ad-sort-icon">{active ? (order === 'desc' ? '▼' : '▲') : '↕'}</span>
      </span>
    </th>
  );
}

export function Avatar({ name, url, size = 34, dot }: { name?: string | null; url?: string | null; size?: number; dot?: boolean }) {
  return (
    <div className="ad-avatar" style={{ width: size, height: size, flexBasis: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <span>{(name ?? '').trim().charAt(0).toUpperCase() || '?'}</span>
      )}
      {dot && <i className="ad-online-dot" />}
    </div>
  );
}

export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`}>
          <td colSpan={cols} className="ad-td">
            <div className="ad-skeleton" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ cols, title, hint, onReset }: { cols: number; title: string; hint: string; onReset?: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="ad-empty">
        <div className="ad-empty-title">{title}</div>
        <div>{hint}</div>
        {onReset && (
          <button type="button" className="ad-btn ad-btn-ghost" onClick={onReset} style={{ marginTop: 12 }}>
            Reset filters
          </button>
        )}
      </td>
    </tr>
  );
}

export function SearchBox({ value, onChange, onEnter, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder: string;
}) {
  return (
    <div className="ad-search">
      <span className="ad-search-icon" aria-hidden>⌕</span>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      {value && (
        <button type="button" className="ad-search-clear" onClick={() => onChange('')} aria-label="Clear search">×</button>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; count?: number; tone?: 'green' | 'amber' | 'red' | 'gray' }[];
}) {
  return (
    <div className="ad-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value || 'all'}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`ad-tab ${value === t.value ? 'is-active' : ''} tone-${t.tone ?? 'default'}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="ad-tab-count">{t.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  limit,
  loading,
  limits = [20, 50, 100],
  onPage,
  onLimit,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  loading: boolean;
  limits?: number[];
  onPage: (p: number) => void;
  onLimit: (l: number) => void;
}) {
  const [input, setInput] = useState(String(page));
  useEffect(() => setInput(String(page)), [page]);

  const go = (p: number) => {
    const target = Math.min(Math.max(1, Math.floor(p)), totalPages);
    if (Number.isFinite(target)) onPage(target);
  };

  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const nums: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) nums.push('…');
    nums.push(p);
  });

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="ad-pager">
      <div className="ad-pager-info">
        {total > 0 ? (
          <>Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong></>
        ) : '—'}
        <label className="ad-page-size">
          Rows
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
            {limits.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 && (
        <div className="ad-pager-controls">
          <button type="button" className="ad-page-btn" disabled={loading || page <= 1} onClick={() => go(1)} aria-label="First page">«</button>
          <button type="button" className="ad-page-btn" disabled={loading || page <= 1} onClick={() => go(page - 1)}>‹ Prev</button>
          {nums.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="ad-page-gap">…</span>
            ) : (
              <button key={p} type="button" className={`ad-page-btn ${p === page ? 'is-active' : ''}`} disabled={loading} onClick={() => go(p)}>
                {p}
              </button>
            ),
          )}
          <button type="button" className="ad-page-btn" disabled={loading || page >= totalPages} onClick={() => go(page + 1)}>Next ›</button>
          <button type="button" className="ad-page-btn" disabled={loading || page >= totalPages} onClick={() => go(totalPages)} aria-label="Last page">»</button>
          <form
            className="ad-jump"
            onSubmit={(e) => {
              e.preventDefault();
              go(Number(input));
            }}
          >
            Go to
            <input type="number" min={1} max={totalPages} value={input} onChange={(e) => setInput(e.target.value)} />
            / {totalPages}
          </form>
        </div>
      )}
    </div>
  );
}

export async function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Styles ─────────────────────────────────────────────────────────────

export function AdminStyles() {
  return <style>{ADMIN_STYLES}</style>;
}

const ADMIN_STYLES = `
.ad-page { padding: 32px 40px; max-width: 1480px; margin: 0 auto; width: 100%; box-sizing: border-box; color: #111827; }
.ad-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.ad-header h1 { font-size: 1.875rem; font-weight: 700; color: #111827; margin: 0 0 8px; }
.ad-header p { color: #6b7280; margin: 0; font-size: 0.95rem; max-width: 760px; }
.ad-header-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.ad-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 20px; }
.ad-kpi { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); min-width: 0; }
.ad-kpi.is-clickable { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.ad-kpi.is-clickable:hover { border-color: #c7d2fe; box-shadow: 0 4px 12px rgba(79,70,229,0.08); }
.ad-kpi-label { font-size: 0.72rem; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.ad-kpi-value { font-size: 1.6rem; font-weight: 700; color: #111827; margin-top: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-kpi-sub { font-size: 0.75rem; color: #9ca3af; margin-top: 2px; }
.tone-green { color: #059669 !important; }
.tone-red { color: #dc2626 !important; }
.tone-amber { color: #d97706 !important; }
.tone-indigo { color: #4f46e5 !important; }

.ad-card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding-bottom: 8px; margin-bottom: 20px; }
.ad-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }
.ad-card-head h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827; }
.ad-card-head p { margin: 2px 0 0; font-size: 0.85rem; color: #6b7280; }
.ad-card-body { padding: 20px; }

.ad-tabs { display: flex; gap: 4px; padding: 0 20px; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
.ad-page .ad-tab { background: transparent; color: #6b7280; border-radius: 0; padding: 14px 14px 12px; border-bottom: 2px solid transparent; font-weight: 600; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; width: auto; }
.ad-page .ad-tab:hover { background: transparent; color: #111827; }
.ad-page .ad-tab.is-active { color: #111827; border-bottom-color: #4f46e5; }
.ad-tab-count { background: #f3f4f6; color: #374151; border-radius: 999px; padding: 2px 8px; font-size: 0.72rem; }
.ad-tab.is-active .ad-tab-count { background: #eef2ff; color: #4338ca; }
.ad-tab.tone-green.is-active .ad-tab-count { background: #d1fae5; color: #065f46; }
.ad-tab.tone-amber.is-active .ad-tab-count { background: #fef3c7; color: #92400e; }
.ad-tab.tone-red.is-active .ad-tab-count { background: #fee2e2; color: #991b1b; }

.ad-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ad-page .ad-chip { padding: 6px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; background: #f3f4f6; color: #374151; border: 1px solid transparent; width: auto; }
.ad-page .ad-chip:hover { background: #e5e7eb; }
.ad-page .ad-chip.is-active { background: #111827; color: #fff; }
.ad-custom-range { display: inline-flex; align-items: center; gap: 6px; color: #6b7280; font-size: 0.8rem; }
.ad-custom-range input { width: auto; padding: 5px 8px; margin: 0; font-size: 0.8rem; }
.ad-range-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px 20px 0; }

.ad-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px 20px 8px; }
.ad-search { position: relative; flex: 1 1 280px; max-width: 420px; }
.ad-search input { padding-left: 34px; padding-right: 32px; margin: 0; }
.ad-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 1.05rem; pointer-events: none; }
.ad-page .ad-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: transparent; color: #9ca3af; padding: 2px 8px; font-size: 1.1rem; line-height: 1; width: auto; }
.ad-page .ad-search-clear:hover { background: #f3f4f6; color: #374151; }
.ad-field { display: grid; gap: 4px; font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
.ad-page select { font: inherit; font-size: 0.875rem; font-weight: 500; text-transform: none; letter-spacing: normal; padding: 9px 10px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; min-width: 140px; max-width: 260px; cursor: pointer; }
.ad-page select:focus, .ad-page textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.ad-page textarea { font: inherit; font-size: 0.9rem; padding: 10px 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; resize: vertical; width: 100%; box-sizing: border-box; }
.ad-num-input { width: 96px !important; margin: 0; padding: 9px 10px !important; font-size: 0.875rem; text-transform: none; }
.ad-check { display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #374151; padding-bottom: 10px; cursor: pointer; white-space: nowrap; }
.ad-check input { width: 16px; height: 16px; margin: 0; }

.ad-seg { display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
.ad-page .ad-seg-btn { border-radius: 0; background: #fff; color: #374151; padding: 6px 14px; font-size: 0.8rem; border-right: 1px solid #e5e7eb; width: auto; }
.ad-page .ad-seg-btn:last-child { border-right: none; }
.ad-page .ad-seg-btn:hover { background: #f9fafb; }
.ad-page .ad-seg-btn.is-active { background: #111827; color: #fff; }

.ad-pills { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 8px; }
.ad-pill { display: inline-flex; align-items: center; gap: 6px; background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 4px 6px 4px 12px; font-size: 0.8rem; font-weight: 600; }
.ad-page .ad-pill button { background: transparent; color: #4338ca; padding: 0 6px; font-size: 1rem; line-height: 1; border-radius: 999px; width: auto; }
.ad-page .ad-pill button:hover { background: #c7d2fe; }

.ad-summary { padding: 4px 20px 12px; color: #6b7280; font-size: 0.85rem; }
.ad-summary strong { color: #111827; }
.ad-hint { color: #9ca3af; }
.ad-alert { margin: 0 20px 12px; padding: 10px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ad-modal .ad-alert, .ad-card-body .ad-alert { margin: 0; }
.ad-note { padding: 10px 12px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 0.85rem; border: 1px solid #fde68a; }

.ad-table-wrap { overflow-x: auto; }
.ad-table { width: 100%; border-collapse: collapse; text-align: left; }
.ad-th { padding: 11px 14px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; background: #f9fafb; white-space: nowrap; font-weight: 600; }
.ad-sort { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 4px; }
.ad-sort:hover, .ad-sort.is-active { color: #111827; }
.ad-sort-icon { font-size: 0.65rem; opacity: 0.5; }
.ad-sort.is-active .ad-sort-icon { opacity: 1; color: #4f46e5; }
.ad-td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; font-size: 0.875rem; color: #111827; }
.ad-row:hover { background: #fafafa; }
.ad-row.is-busy { opacity: 0.55; pointer-events: none; }
.ad-row.is-muted .ad-name, .ad-row.is-muted .ad-muted-when-off { color: #9ca3af; }
.ad-row.is-clickable { cursor: pointer; }
tbody.is-loading { opacity: 0.6; transition: opacity 0.15s; }
.ad-id { color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
.ad-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ad-nowrap { white-space: nowrap; }
.ad-user { display: flex; align-items: center; gap: 10px; min-width: 180px; max-width: 280px; }
.ad-avatar { position: relative; flex: 0 0 34px; border-radius: 50%; background: #eef2ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; }
.ad-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.ad-online-dot { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; background: #10b981; border: 2px solid #fff; }
.ad-name { font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-sub { font-size: 0.76rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-page .ad-link { background: transparent; color: #4f46e5; padding: 0; font-size: 0.76rem; font-weight: 500; border-radius: 0; width: auto; }
.ad-page .ad-link:hover { background: transparent; color: #3730a3; text-decoration: underline; }

.ad-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; background: #f3f4f6; color: #374151; }
.ad-badge.green { background: #d1fae5; color: #065f46; }
.ad-badge.amber { background: #fef3c7; color: #92400e; }
.ad-badge.red { background: #fee2e2; color: #991b1b; }
.ad-badge.indigo { background: #e0e7ff; color: #3730a3; }
.ad-badge.gray { background: #f3f4f6; color: #6b7280; }
.ad-tag { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #f3f4f6; color: #374151; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }

.ad-actions { display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
.ad-page .ad-btn { padding: 7px 12px; font-size: 0.8rem; border-radius: 8px; width: auto; white-space: nowrap; font-weight: 600; }
.ad-page .ad-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ad-page .ad-btn-lg { padding: 9px 16px; font-size: 0.85rem; }
.ad-page .ad-btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; }
.ad-page .ad-btn-ghost:hover:not(:disabled) { background: #f3f4f6; }
.ad-page .ad-btn-soft { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.ad-page .ad-btn-soft:hover:not(:disabled) { background: #dbeafe; }
.ad-page .ad-btn-danger-soft { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.ad-page .ad-btn-danger-soft:hover:not(:disabled) { background: #fee2e2; }
.ad-page .ad-btn-success-soft { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.ad-page .ad-btn-success-soft:hover:not(:disabled) { background: #d1fae5; }
.ad-page .ad-btn-solid { color: #fff; border: none; }
.ad-page .ad-btn-solid.tone-primary, .ad-page .ad-btn-primary { background: #111827; color: #fff; border: none; }
.ad-page .ad-btn-solid.tone-primary:hover:not(:disabled), .ad-page .ad-btn-primary:hover:not(:disabled) { background: #1f2937; }
.ad-page .ad-btn-solid.tone-danger { background: #dc2626; }
.ad-page .ad-btn-solid.tone-danger:hover:not(:disabled) { background: #b91c1c; }
.ad-page .ad-btn-solid.tone-success, .ad-page .ad-btn-export { background: #059669; color: #fff; border: none; }
.ad-page .ad-btn-solid.tone-success:hover:not(:disabled), .ad-page .ad-btn-export:hover:not(:disabled) { background: #047857; }

.ad-skeleton { height: 34px; border-radius: 8px; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%); background-size: 400% 100%; animation: ad-shimmer 1.2s ease infinite; }
@keyframes ad-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.ad-empty { padding: 48px 16px; text-align: center; color: #6b7280; font-size: 0.875rem; }
.ad-empty-title { font-weight: 600; color: #111827; font-size: 1rem; margin-bottom: 4px; }

.ad-pager { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 20px 8px; }
.ad-pager-info { display: flex; align-items: center; gap: 16px; color: #6b7280; font-size: 0.85rem; }
.ad-pager-info strong { color: #111827; }
.ad-page-size { display: inline-flex; align-items: center; gap: 6px; }
.ad-page .ad-page-size select { min-width: 0; padding: 5px 8px; }
.ad-pager-controls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ad-page .ad-page-btn { padding: 6px 11px; min-width: 34px; font-size: 0.8rem; border-radius: 8px; background: #fff; color: #374151; border: 1px solid #e5e7eb; width: auto; }
.ad-page .ad-page-btn:hover:not(:disabled) { background: #f3f4f6; }
.ad-page .ad-page-btn.is-active { background: #111827; color: #fff; border-color: #111827; }
.ad-page .ad-page-btn:disabled:not(.is-active) { opacity: 0.4; cursor: not-allowed; }
.ad-page-gap { color: #9ca3af; padding: 0 4px; }
.ad-jump { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; color: #6b7280; font-size: 0.8rem; }
.ad-jump input { width: 64px; padding: 5px 8px; margin: 0; }

.ad-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
.ad-modal { width: 100%; max-width: 460px; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 20px 40px rgba(0,0,0,0.15); padding: 24px; display: grid; gap: 14px; }
.ad-modal h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #111827; }
.ad-modal-text { margin: 0; color: #4b5563; font-size: 0.9rem; line-height: 1.5; }
.ad-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

.ad-drawer-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.35); z-index: 65; display: flex; justify-content: flex-end; }
.ad-drawer { width: 100%; max-width: 480px; height: 100%; background: #fff; box-shadow: -12px 0 32px rgba(0,0,0,0.12); padding: 24px; overflow-y: auto; box-sizing: border-box; animation: ad-slide 0.18s ease-out; display: flex; flex-direction: column; gap: 18px; }
@keyframes ad-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.ad-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ad-drawer-head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
.ad-page .ad-close { background: #f3f4f6; color: #374151; padding: 4px 10px; font-size: 1.2rem; line-height: 1; width: auto; }
.ad-page .ad-close:hover { background: #e5e7eb; }
.ad-dl { display: grid; grid-template-columns: 130px 1fr; gap: 10px 12px; margin: 0; font-size: 0.875rem; }
.ad-dl dt { color: #6b7280; }
.ad-dl dd { margin: 0; color: #111827; word-break: break-word; }

.ad-toasts { position: fixed; right: 20px; bottom: 20px; display: grid; gap: 8px; z-index: 80; }
.ad-toast { padding: 10px 14px; border-radius: 10px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.12); animation: ad-in 0.18s ease-out; max-width: 360px; }
.ad-toast.success { background: #064e3b; color: #ecfdf5; }
.ad-toast.error { background: #7f1d1d; color: #fef2f2; }
@keyframes ad-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 900px) { .ad-page { padding: 20px 16px; } }
`;
