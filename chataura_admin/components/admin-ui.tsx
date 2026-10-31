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
    <div className="cp-chips">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`cp-chip ${range === k ? 'is-active' : ''}`}
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
        <span className="cp-custom-range">
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
    <div className="cp-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`cp-toast ${t.kind}`}>
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
    <div className="cp-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setState(null)}>
      <form className="cp-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h2>{state.title}</h2>
        <div className="cp-modal-text">{state.message}</div>
        {error && <div className="cp-alert">{error}</div>}
        <div className="cp-modal-actions">
          <button type="button" className="cp-btn cp-btn-ghost" disabled={busy} onClick={() => setState(null)}>
            Cancel
          </button>
          <button type="submit" autoFocus className={`cp-btn cp-btn-solid tone-${state.tone ?? 'primary'}`} disabled={busy}>
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
    <th className="cp-th" style={{ textAlign: align }}>
      <span
        role="button"
        tabIndex={0}
        className={`cp-sort ${active ? 'is-active' : ''}`}
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
        <span className="cp-sort-icon">{active ? (order === 'desc' ? '▼' : '▲') : '↕'}</span>
      </span>
    </th>
  );
}

export function Avatar({ name, url, size = 34, dot }: { name?: string | null; url?: string | null; size?: number; dot?: boolean }) {
  return (
    <div className="cp-avatar" style={{ width: size, height: size, flexBasis: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <span>{(name ?? '').trim().charAt(0).toUpperCase() || '?'}</span>
      )}
      {dot && <i className="cp-online-dot" />}
    </div>
  );
}

export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`}>
          <td colSpan={cols} className="cp-td">
            <div className="cp-skeleton" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ cols, title, hint, onReset }: { cols: number; title: string; hint: string; onReset?: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="cp-empty">
        <div className="cp-empty-title">{title}</div>
        <div>{hint}</div>
        {onReset && (
          <button type="button" className="cp-btn cp-btn-ghost" onClick={onReset} style={{ marginTop: 12 }}>
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
    <div className="cp-search">
      <span className="cp-search-icon" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      {value && (
        <button type="button" className="cp-search-clear" onClick={() => onChange('')} aria-label="Clear search">×</button>
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
    <div className="cp-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value || 'all'}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`cp-tab ${value === t.value ? 'is-active' : ''} tab-${t.tone ?? 'default'}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="cp-tab-count">{t.count.toLocaleString()}</span>}
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
    <div className="cp-pager">
      <div className="cp-pager-info">
        <span>
          {total > 0 ? (
            <>Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong></>
          ) : '—'}
        </span>
        <label className="cp-page-size">
          Rows
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
            {limits.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 && (
        <div className="cp-pager-controls">
          <button type="button" className="cp-page-btn is-edge" disabled={loading || page <= 1} onClick={() => go(1)} aria-label="First page">«</button>
          <button type="button" className="cp-page-btn" disabled={loading || page <= 1} onClick={() => go(page - 1)}>‹ Prev</button>
          {nums.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="cp-page-gap">…</span>
            ) : (
              <button key={p} type="button" className={`cp-page-btn ${p === page ? 'is-active' : ''}`} disabled={loading} onClick={() => go(p)}>
                {p}
              </button>
            ),
          )}
          <button type="button" className="cp-page-btn" disabled={loading || page >= totalPages} onClick={() => go(page + 1)}>Next ›</button>
          <button type="button" className="cp-page-btn is-edge" disabled={loading || page >= totalPages} onClick={() => go(totalPages)} aria-label="Last page">»</button>
          <form
            className="cp-jump"
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

// ─── Layout primitives ──────────────────────────────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="cp-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="cp-header-actions">{actions}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, badge, active, onClick }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'green' | 'red' | 'amber' | 'indigo' | 'muted';
  badge?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`cp-kpi ${onClick ? 'is-clickable' : ''} ${active ? 'is-active' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="cp-kpi-top">
        <div className="cp-kpi-label">{label}</div>
        {badge}
      </div>
      <div className={`cp-kpi-value ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      {sub ? <div className="cp-kpi-sub">{sub}</div> : null}
    </div>
  );
}

/** True below the phone breakpoint (matches the 640px CSS media query). */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * Card with a header. `collapsible` sections (typically "Add new …" forms) start open on
 * desktop and closed on phones so the list they feed stays in view.
 */
export function Section({ title, subtitle, actions, collapsible, open: openProp, onOpenChange, className = '', bodyClassName = 'cp-card-body', children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [innerOpen, setInnerOpen] = useState(true);
  useEffect(() => {
    if (collapsible && openProp === undefined && window.matchMedia('(max-width: 640px)').matches) setInnerOpen(false);
  }, [collapsible, openProp]);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInnerOpen(v));

  if (!collapsible) {
    return (
      <section className={`cp-card ${className}`}>
        <div className="cp-card-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="cp-actions">{actions}</div> : null}
        </div>
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }
  return (
    <section className={`cp-card cp-collapse ${open ? 'is-open' : ''} ${className}`}>
      <button type="button" className="cp-collapse-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="cp-collapse-icon" aria-hidden>+</span>
      </button>
      {open ? <div className={bodyClassName}>{children}</div> : null}
    </section>
  );
}

export function Field({ label, hint, wide, className = '', children }: { label: ReactNode; hint?: ReactNode; wide?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`cp-field ${wide ? 'is-wide' : ''} ${className}`}>
      {label}
      {children}
      {hint ? <span className="cp-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="cp-switch" title={label}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

/** Dialog: centered on desktop, bottom sheet on phones. Escape / backdrop close unless `busy`. */
export function Modal({ title, onClose, busy, size, children, footer, onSubmit }: {
  title: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: 'wide' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);
  const inner = (
    <>
      <div className="cp-modal-head">
        <h2>{title}</h2>
        <button type="button" className="cp-close" aria-label="Close" disabled={busy} onClick={onClose}>×</button>
      </div>
      {children}
      {footer ? <div className="cp-modal-actions">{footer}</div> : null}
    </>
  );
  return (
    <div className="cp-overlay" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      {onSubmit ? (
        <form className={`cp-modal ${size ? `is-${size}` : ''}`} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {inner}
        </form>
      ) : (
        <div className={`cp-modal ${size ? `is-${size}` : ''}`} onClick={(e) => e.stopPropagation()}>
          {inner}
        </div>
      )}
    </div>
  );
}

/** Client-side paging for lists already in memory. Goes back to page 1 when `resetKey` changes. */
export function useClientPager<T>(items: T[], resetKey: unknown, initialLimit = 25) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  useEffect(() => setPage(1), [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / limit));
  const current = Math.min(page, totalPages);
  return {
    pageItems: items.slice((current - 1) * limit, current * limit),
    pagerProps: {
      page: current,
      totalPages,
      total: items.length,
      limit,
      loading: false,
      limits: [25, 50, 100],
      onPage: setPage,
      onLimit: (l: number) => {
        setLimit(l);
        setPage(1);
      },
    },
  };
}

/** Catalog tile: square preview, title/meta, active switch, edit and delete. */
export function MediaCard({ thumb, thumbClass = '', flags, title, meta, extra, active, busy, onToggle, onEdit, onDelete }: {
  thumb: ReactNode;
  thumbClass?: string;
  flags?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  extra?: ReactNode;
  active?: boolean;
  busy?: boolean;
  onToggle?: (v: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`cp-media-card ${active === false ? 'is-off' : ''} ${busy ? 'is-busy' : ''}`}>
      <div className={`cp-media-thumb ${thumbClass}`} onClick={onEdit} role={onEdit ? 'button' : undefined}>
        {thumb}
        {flags ? <div className="cp-media-flags">{flags}</div> : null}
      </div>
      <div className="cp-media-body">
        <div className="cp-media-title" title={typeof title === 'string' ? title : undefined}>{title}</div>
        {meta ? <div className="cp-media-meta">{meta}</div> : null}
        {extra}
      </div>
      <div className="cp-media-actions">
        {onToggle && active !== undefined ? (
          <Switch label={active ? 'Disable' : 'Enable'} checked={active} disabled={busy} onChange={onToggle} />
        ) : null}
        <span style={{ flex: 1 }} />
        {onEdit ? <button type="button" className="cp-btn cp-btn-ghost" onClick={onEdit}>Edit</button> : null}
        {onDelete ? (
          <button type="button" className="cp-btn cp-btn-danger-soft cp-icon-btn" aria-label="Delete" title="Delete" onClick={onDelete}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" /></svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MediaSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="cp-media-grid">
      {Array.from({ length: count }).map((_, i) => <div key={i} className="cp-skeleton is-card" />)}
    </div>
  );
}
