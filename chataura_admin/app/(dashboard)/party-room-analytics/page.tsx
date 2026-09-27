'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  AdminStyles,
  applyRange,
  Avatar,
  DateRangeChips,
  EmptyRow,
  errorText,
  fmt,
  formatDate,
  formatDuration,
  formatTime,
  Pager,
  pick,
  positiveInt,
  RANGE_KEYS,
  RangeKey,
  relativeTime,
  SearchBox,
  SkeletonRows,
  SortTh,
  Tabs,
  useConfirm,
  useDebouncedCommit,
  useToasts,
  useUrlFilters,
} from '@/components/admin-ui';

type SessionStatus = 'active' | 'stale' | 'ended';

type Session = {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email?: string | null;
  avatar_url: string | null;
  country: string | null;
  room_id: string;
  room_title: string;
  room_display_id: string;
  room_is_live?: boolean;
  accumulated_seconds: number;
  status: SessionStatus;
  joined_at: string;
  last_heartbeat_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
};

type HistoryRow = {
  id: number;
  room_title: string;
  room_display_id: string;
  joined_at: string;
  closed_at: string | null;
  duration_seconds: number;
  is_active: boolean;
  close_reason: string | null;
};

type Kpis = {
  live_rooms?: number;
  active_sessions?: number;
  stale_sessions?: number;
  total_rooms?: number;
  sessions_today?: number;
  total_seconds?: number;
  avg_seconds?: number;
  unique_users?: number;
};

type Counts = { all: number; active: number; stale: number; ended: number };

const DEFAULTS = {
  q: '',
  status: '' as '' | SessionStatus,
  user_id: '',
  room_id: '',
  close_reason: '',
  min_minutes: '',
  range: 'all' as RangeKey,
  from: '',
  to: '',
  sort: 'id',
  order: 'desc' as 'asc' | 'desc',
  limit: 25,
  page: 1,
};
type Filters = typeof DEFAULTS;

function parse(p: URLSearchParams): Filters {
  return {
    q: p.get('q') ?? '',
    status: pick(p.get('status'), ['', 'active', 'stale', 'ended'] as const, ''),
    user_id: /^\d+$/.test(p.get('user_id') ?? '') ? p.get('user_id')! : '',
    room_id: /^[0-9a-f-]{36}$/i.test(p.get('room_id') ?? '') ? p.get('room_id')! : '',
    close_reason: p.get('close_reason') ?? '',
    min_minutes: pick(p.get('min_minutes'), ['', '1', '10', '30', '60', '180'] as const, ''),
    range: pick(p.get('range'), RANGE_KEYS, 'all'),
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    sort: pick(p.get('sort'), ['id', 'joined_at', 'duration', 'last_heartbeat'] as const, 'id'),
    order: pick(p.get('order'), ['asc', 'desc'] as const, 'desc'),
    limit: [25, 50, 100].includes(Number(p.get('limit'))) ? Number(p.get('limit')) : 25,
    page: positiveInt(p.get('page'), 1),
  };
}

const SORTS = [
  { value: 'id:desc', label: 'Newest sessions' },
  { value: 'id:asc', label: 'Oldest sessions' },
  { value: 'duration:desc', label: 'Longest time engaged' },
  { value: 'duration:asc', label: 'Shortest time engaged' },
  { value: 'last_heartbeat:desc', label: 'Most recent heartbeat' },
  { value: 'last_heartbeat:asc', label: 'Oldest heartbeat' },
];

const REASON_LABELS: Record<string, string> = {
  leave: 'Left room',
  room_ended: 'Room ended',
  stale_heartbeat: 'Heartbeat timeout',
  stale_heartbeat_timeout: 'Heartbeat timeout (admin sweep)',
  admin_suspended: 'Ended by admin',
};

function reasonLabel(r: string | null) {
  if (!r) return '—';
  return REASON_LABELS[r] ?? r.replace(/_/g, ' ');
}

const STATUS_BADGE: Record<SessionStatus, { cls: string; label: string }> = {
  active: { cls: 'green', label: '● In room' },
  stale: { cls: 'amber', label: 'Stale' },
  ended: { cls: 'gray', label: 'Ended' },
};

export default function PartyRoomAnalyticsPage() {
  const { token } = useAdminAuth();
  const { filters, setFilters, update, reset, ready, isDirty } = useUrlFilters(DEFAULTS, parse);
  const [searchInput, setSearchInput] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [kpis, setKpis] = useState<Kpis>({});
  const [counts, setCounts] = useState<Counts>({ all: 0, active: 0, stale: 0, ended: 0 });
  const [reasons, setReasons] = useState<{ reason: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [roomLabel, setRoomLabel] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [history, setHistory] = useState<{ userId: number; name: string; rows: HistoryRow[]; loading: boolean } | null>(null);
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const seq = useRef(0);

  useEffect(() => {
    if (ready) setSearchInput(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useDebouncedCommit(searchInput, (q) => {
    if (ready) setFilters((f) => (f.q === q ? f : { ...f, q, page: 1 }));
  });

  const load = useCallback(
    async (silent = false) => {
      const tok = localStorage.getItem('ca_admin_token');
      if (!tok) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      setLoadError(null);
      const p = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
        sort: filters.sort,
        order: filters.order,
      });
      (['q', 'status', 'user_id', 'room_id', 'close_reason', 'min_minutes'] as const).forEach((k) => {
        if (filters[k]) p.set(k, filters[k]);
      });
      applyRange(p, filters.range, filters.from, filters.to);
      try {
        const res = await api<{
          data?: {
            kpis?: Kpis;
            counts?: Counts;
            close_reasons?: { reason: string; count: number }[];
            sessions?: Session[];
            meta?: { total?: number; pages?: number };
          };
        }>(`/admin/party-room-analytics?${p.toString()}`, tok);
        if (id !== seq.current) return;
        const pages = Math.max(1, Number(res.data?.meta?.pages ?? 1));
        setSessions(res.data?.sessions ?? []);
        setKpis(res.data?.kpis ?? {});
        if (res.data?.counts) setCounts(res.data.counts);
        setReasons(res.data?.close_reasons ?? []);
        setTotal(Number(res.data?.meta?.total ?? 0));
        setTotalPages(pages);
        setLastLoaded(new Date());
        if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
      } catch (err) {
        if (id !== seq.current) return;
        setLoadError(errorText(err, 'Failed to load analytics'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [filters, setFilters],
  );

  useEffect(() => {
    if (ready && token) void load();
  }, [ready, token, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(true), 30000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  useEffect(() => {
    if (!history) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistory(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  function onSort(column: string, defaultOrder: 'asc' | 'desc') {
    if (filters.sort === column) update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    else update({ sort: column, order: defaultOrder });
  }

  function resetAll() {
    setSearchInput('');
    setRoomLabel('');
    reset();
  }

  async function openHistory(s: Session) {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const name = s.user_name || `User #${s.user_id}`;
    setHistory({ userId: s.user_id, name, rows: [], loading: true });
    try {
      const res = await api<{ data?: { sessions?: HistoryRow[] } }>(`/admin/party-room-analytics/users/${s.user_id}/sessions`, tok);
      setHistory((h) => (h && h.userId === s.user_id ? { ...h, rows: res.data?.sessions ?? [], loading: false } : h));
    } catch (err) {
      toast('error', errorText(err, 'Failed to load history'));
      setHistory((h) => (h ? { ...h, loading: false } : h));
    }
  }

  function askEndSession(s: Session) {
    confirm({
      title: 'End this session',
      message: (
        <>
          Session #{s.id} for <strong>{s.user_name || `User #${s.user_id}`}</strong> in “{s.room_title}” will be marked as ended by admin.
          This closes the presence record only. It does not kick the user or ban them.
        </>
      ),
      confirmLabel: 'End session',
      tone: 'danger',
      onConfirm: async () => {
        const tok = localStorage.getItem('ca_admin_token');
        if (!tok) return;
        setBusyId(s.id);
        try {
          await api(`/admin/party-room-analytics/sessions/${s.id}/suspend`, tok, { method: 'POST' });
          toast('success', `Session #${s.id} ended`);
          await load(true);
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function askCloseStale() {
    confirm({
      title: 'Close stale sessions',
      message: (
        <>
          <strong>{fmt(counts.stale)}</strong> session{counts.stale === 1 ? '' : 's'} still look “in room” but haven’t sent a heartbeat for over
          5 minutes. They’ll be closed with reason “Heartbeat timeout (admin sweep)”.
        </>
      ),
      confirmLabel: 'Close stale sessions',
      tone: 'danger',
      onConfirm: async () => {
        const tok = localStorage.getItem('ca_admin_token');
        if (!tok) return;
        const res = await api<{ data?: { closed_count?: number } }>('/admin/party-room-analytics/sessions/close-stale', tok, { method: 'POST' });
        toast('success', `Closed ${fmt(res.data?.closed_count ?? 0)} stale sessions`);
        await load(true);
      },
    });
  }

  const sortValue = `${filters.sort}:${filters.order}`;
  const sortKnown = SORTS.some((s) => s.value === sortValue);
  const historyTotal = history?.rows.reduce((s, r) => s + (r.duration_seconds || 0), 0) ?? 0;

  return (
    <main className="ad-page">
      <AdminStyles />

      <div className="ad-header">
        <div>
          <h1>Party Room Analytics</h1>
          <p>Live room presence and session history. Filter by status, room, user or date to find exactly who was where and for how long.</p>
        </div>
        <div className="ad-header-actions">
          <label className="ad-check" style={{ paddingBottom: 0, alignSelf: 'center' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="ad-btn ad-btn-danger-soft ad-btn-lg" onClick={askCloseStale} disabled={counts.stale === 0}>
            Close stale sessions{counts.stale ? ` (${fmt(counts.stale)})` : ''}
          </button>
        </div>
      </div>

      <div className="ad-kpis">
        <div className="ad-kpi">
          <div className="ad-kpi-label">Live rooms</div>
          <div className="ad-kpi-value">{fmt(kpis.live_rooms)}</div>
          <div className="ad-kpi-sub">of {fmt(kpis.total_rooms)} rooms created</div>
        </div>
        <div className="ad-kpi is-clickable" onClick={() => update({ status: 'active' })} title="Show users in room now">
          <div className="ad-kpi-label">In room now</div>
          <div className="ad-kpi-value tone-green">{fmt(kpis.active_sessions)}</div>
          <div className="ad-kpi-sub">heartbeat in last 5 min</div>
        </div>
        <div className="ad-kpi is-clickable" onClick={() => update({ status: 'stale' })} title="Show stale sessions">
          <div className="ad-kpi-label">Stale sessions</div>
          <div className={`ad-kpi-value ${kpis.stale_sessions ? 'tone-amber' : ''}`}>{fmt(kpis.stale_sessions)}</div>
          <div className="ad-kpi-sub">open but no heartbeat</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Sessions today</div>
          <div className="ad-kpi-value tone-indigo">{fmt(kpis.sessions_today)}</div>
          <div className="ad-kpi-sub">joined since midnight</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Time engaged</div>
          <div className="ad-kpi-value">{formatDuration(kpis.total_seconds ?? 0)}</div>
          <div className="ad-kpi-sub">
            {fmt(kpis.unique_users)} users · avg {formatDuration(kpis.avg_seconds ?? 0)}
            {isDirty ? ' · filtered' : ''}
          </div>
        </div>
      </div>

      <div className="ad-card">
        <Tabs
          value={filters.status}
          onChange={(v) => update({ status: v })}
          tabs={[
            { value: '', label: 'All sessions', count: counts.all },
            { value: 'active', label: 'In room', count: counts.active, tone: 'green' },
            { value: 'stale', label: 'Stale', count: counts.stale, tone: 'amber' },
            { value: 'ended', label: 'Ended', count: counts.ended, tone: 'gray' },
          ]}
        />

        <div className="ad-range-row">
          <DateRangeChips range={filters.range} from={filters.from} to={filters.to} onChange={(patch) => update(patch)} />
        </div>

        <div className="ad-toolbar">
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            onEnter={() => update({ q: searchInput.trim() })}
            placeholder="Search user, email, user ID, room name or room code…"
          />
          <label className="ad-field">
            <span>End reason</span>
            <select value={filters.close_reason} onChange={(e) => update({ close_reason: e.target.value })}>
              <option value="">Any</option>
              {reasons.map((r) => (
                <option key={r.reason} value={r.reason}>{reasonLabel(r.reason)} ({fmt(r.count)})</option>
              ))}
            </select>
          </label>
          <label className="ad-field">
            <span>Min. time engaged</span>
            <select value={filters.min_minutes} onChange={(e) => update({ min_minutes: e.target.value })}>
              <option value="">Any</option>
              <option value="1">1 min or more</option>
              <option value="10">10 min or more</option>
              <option value="30">30 min or more</option>
              <option value="60">1 hour or more</option>
              <option value="180">3 hours or more</option>
            </select>
          </label>
          <label className="ad-field">
            <span>Sort by</span>
            <select
              value={sortKnown ? sortValue : ''}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(':');
                if (sort) update({ sort, order: order as 'asc' | 'desc' });
              }}
            >
              {!sortKnown && <option value="">Custom</option>}
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {isDirty && (
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={resetAll}>Reset filters</button>
          )}
        </div>

        {(filters.user_id || filters.room_id) && (
          <div className="ad-pills">
            {filters.user_id && (
              <span className="ad-pill">
                User #{filters.user_id}
                <button type="button" onClick={() => update({ user_id: '' })} aria-label="Remove user filter">×</button>
              </span>
            )}
            {filters.room_id && (
              <span className="ad-pill">
                Room: {roomLabel || filters.room_id.slice(0, 8)}
                <button
                  type="button"
                  onClick={() => {
                    setRoomLabel('');
                    update({ room_id: '' });
                  }}
                  aria-label="Remove room filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}

        <div className="ad-summary">
          {loading ? 'Loading…' : (
            <>
              <strong>{fmt(total)}</strong> session{total === 1 ? '' : 's'}
              {filters.q ? <> matching “{filters.q}”</> : null}
              {lastLoaded && <span className="ad-hint"> · updated {formatTime(lastLoaded.toISOString())}</span>}
            </>
          )}
        </div>

        {loadError && (
          <div className="ad-alert">
            {loadError}
            <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load()}>Retry</button>
          </div>
        )}

        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <SortTh column="id" label="Session" sort={filters.sort} order={filters.order} onSort={onSort} />
                <th className="ad-th">User</th>
                <th className="ad-th">Room</th>
                <SortTh column="duration" label="Time engaged" sort={filters.sort} order={filters.order} onSort={onSort} align="right" />
                <th className="ad-th">Status</th>
                <SortTh column="joined_at" label="Joined" sort={filters.sort} order={filters.order} onSort={onSort} />
                <SortTh column="last_heartbeat" label="Last heartbeat" sort={filters.sort} order={filters.order} onSort={onSort} />
                <th className="ad-th">Ended</th>
                <th className="ad-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody className={loading && sessions.length > 0 ? 'is-loading' : ''}>
              {loading && sessions.length === 0 ? (
                <SkeletonRows cols={9} />
              ) : sessions.length === 0 ? (
                <EmptyRow cols={9} title="No sessions found" hint="Try a wider date range or clear filters." onReset={isDirty ? resetAll : undefined} />
              ) : (
                sessions.map((s) => {
                  const badge = STATUS_BADGE[s.status];
                  const name = s.user_name || `User #${s.user_id}`;
                  return (
                    <tr key={s.id} className={`ad-row ${busyId === s.id ? 'is-busy' : ''}`}>
                      <td className="ad-td ad-id">#{s.id}</td>
                      <td className="ad-td">
                        <div className="ad-user">
                          <Avatar name={name} url={s.avatar_url} dot={s.status === 'active'} />
                          <div style={{ minWidth: 0 }}>
                            <div className="ad-name" title={name}>{name}</div>
                            <div className="ad-sub">
                              <button type="button" className="ad-link" onClick={() => update({ user_id: String(s.user_id) })} title="Only this user's sessions">
                                ID {s.user_id}
                              </button>
                              {s.country ? ` · ${s.country}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="ad-td">
                        <div className="ad-name" style={{ maxWidth: 200 }} title={s.room_title}>{s.room_title}</div>
                        <div className="ad-sub">
                          <button
                            type="button"
                            className="ad-link"
                            onClick={() => {
                              setRoomLabel(s.room_title);
                              update({ room_id: s.room_id });
                            }}
                            title="Only sessions in this room"
                          >
                            Code {s.room_display_id}
                          </button>
                          {s.room_is_live ? <span className="ad-badge green" style={{ marginLeft: 6, padding: '1px 6px', fontSize: '0.65rem' }}>Live</span> : null}
                        </div>
                      </td>
                      <td className="ad-td ad-num" style={{ fontWeight: 700, color: '#4f46e5' }}>{formatDuration(s.accumulated_seconds)}</td>
                      <td className="ad-td"><span className={`ad-badge ${badge.cls}`}>{badge.label}</span></td>
                      <td className="ad-td ad-nowrap">
                        <div>{formatDate(s.joined_at)}</div>
                        <div className="ad-sub">{formatTime(s.joined_at)}</div>
                      </td>
                      <td className="ad-td ad-nowrap" title={s.last_heartbeat_at ? new Date(s.last_heartbeat_at).toLocaleString() : undefined}>
                        {relativeTime(s.last_heartbeat_at)}
                      </td>
                      <td className="ad-td ad-nowrap">
                        {s.closed_at ? (
                          <>
                            <div>{formatTime(s.closed_at)}</div>
                            <div className="ad-sub">{reasonLabel(s.close_reason)}</div>
                          </>
                        ) : (
                          <span className="ad-hint">—</span>
                        )}
                      </td>
                      <td className="ad-td" style={{ textAlign: 'right' }}>
                        <div className="ad-actions">
                          <button type="button" className="ad-btn ad-btn-soft" onClick={() => void openHistory(s)}>History</button>
                          {s.status !== 'ended' && (
                            <button type="button" className="ad-btn ad-btn-danger-soft" onClick={() => askEndSession(s)}>End</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pager
          page={filters.page}
          totalPages={totalPages}
          total={total}
          limit={filters.limit}
          loading={loading}
          limits={[25, 50, 100]}
          onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
          onLimit={(l) => update({ limit: l })}
        />
      </div>

      {history && (
        <div className="ad-drawer-overlay" onClick={() => setHistory(null)}>
          <aside className="ad-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ad-drawer-head">
              <div>
                <div className="ad-sub">Room presence history · last 50 sessions</div>
                <h2>{history.name}</h2>
                <div className="ad-sub">User #{history.userId}</div>
              </div>
              <button type="button" className="ad-close" onClick={() => setHistory(null)} aria-label="Close">×</button>
            </div>

            {!history.loading && history.rows.length > 0 && (
              <div className="ad-kpis" style={{ marginBottom: 0 }}>
                <div className="ad-kpi">
                  <div className="ad-kpi-label">Sessions</div>
                  <div className="ad-kpi-value">{fmt(history.rows.length)}</div>
                </div>
                <div className="ad-kpi">
                  <div className="ad-kpi-label">Total time</div>
                  <div className="ad-kpi-value tone-indigo">{formatDuration(historyTotal)}</div>
                </div>
              </div>
            )}

            {history.loading ? (
              <div className="ad-skeleton" style={{ height: 120 }} />
            ) : history.rows.length === 0 ? (
              <div className="ad-empty">No session history recorded.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {history.rows.map((r) => (
                  <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="ad-name">{r.room_title}</div>
                      <div className="ad-sub">Code {r.room_display_id} · {formatDate(r.joined_at)} {formatTime(r.joined_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: '#4f46e5' }}>{formatDuration(r.duration_seconds)}</div>
                      <div className="ad-sub" style={{ color: r.is_active ? '#059669' : undefined }}>
                        {r.is_active ? 'Active' : reasonLabel(r.close_reason)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
              <button
                type="button"
                className="ad-btn ad-btn-primary ad-btn-lg"
                onClick={() => {
                  update({ user_id: String(history.userId) });
                  setHistory(null);
                }}
              >
                Filter table to this user
              </button>
              <Link href={`/users?q=%23${history.userId}`} className="ad-btn ad-btn-ghost ad-btn-lg" style={{ textAlign: 'center' }}>
                Open in User Management
              </Link>
            </div>
          </aside>
        </div>
      )}

      {confirmNode}
      {toastNode}
    </main>
  );
}
