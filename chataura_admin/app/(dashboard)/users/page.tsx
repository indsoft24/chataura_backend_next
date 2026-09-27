'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type UserStatus = 'active' | 'suspended' | 'deactivated';

type UserRow = {
  id: number;
  email?: string | null;
  phone?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: string;
  level?: number;
  is_star_account?: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
  created_at?: string;
  account_status?: string;
  status?: UserStatus;
  suspended_reason?: string | null;
  coins?: number;
  coin_balance?: number;
  gems?: number;
};

type Counts = { all: number; active: number; suspended: number; deactivated: number };

type Filters = {
  q: string;
  status: '' | UserStatus;
  role: string;
  star: '' | 'yes' | 'no';
  online: '' | 'yes' | 'no';
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  page: number;
};

type AdjustTarget = {
  id: number;
  name: string;
  coins: number;
  gems: number;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'danger' | 'primary' | 'success';
  reason?: { label: string; placeholder: string; required: boolean; defaultValue: string };
  onConfirm: (reason: string) => Promise<void>;
};

type Toast = { id: number; kind: 'success' | 'error'; text: string };

const DEFAULT_FILTERS: Filters = {
  q: '',
  status: '',
  role: '',
  star: '',
  online: '',
  sort: 'id',
  order: 'desc',
  limit: 20,
  page: 1,
};

const SORT_PRESETS: { value: string; label: string; sort: string; order: 'asc' | 'desc' }[] = [
  { value: 'id:desc', label: 'Newest first', sort: 'id', order: 'desc' },
  { value: 'id:asc', label: 'Oldest first', sort: 'id', order: 'asc' },
  { value: 'coins:desc', label: 'Coins: high → low', sort: 'coins', order: 'desc' },
  { value: 'coins:asc', label: 'Coins: low → high', sort: 'coins', order: 'asc' },
  { value: 'gems:desc', label: 'Gems: high → low', sort: 'gems', order: 'desc' },
  { value: 'gems:asc', label: 'Gems: low → high', sort: 'gems', order: 'asc' },
  { value: 'level:desc', label: 'Level: high → low', sort: 'level', order: 'desc' },
  { value: 'last_seen:desc', label: 'Recently active', sort: 'last_seen', order: 'desc' },
  { value: 'name:asc', label: 'Name: A → Z', sort: 'name', order: 'asc' },
  { value: 'name:desc', label: 'Name: Z → A', sort: 'name', order: 'desc' },
];

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'seller', label: 'Coin Seller' },
  { value: 'agency', label: 'Agency' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_TABS: { value: '' | UserStatus; label: string; countKey: keyof Counts }[] = [
  { value: '', label: 'All users', countKey: 'all' },
  { value: 'active', label: 'Active', countKey: 'active' },
  { value: 'suspended', label: 'Suspended', countKey: 'suspended' },
  { value: 'deactivated', label: 'Deactivated', countKey: 'deactivated' },
];

function filtersFromUrl(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const num = (v: string | null, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  const pick = <T extends string>(v: string | null, allowed: readonly T[], d: T): T =>
    v && (allowed as readonly string[]).includes(v) ? (v as T) : d;
  return {
    q: p.get('q') ?? '',
    status: pick(p.get('status'), ['', 'active', 'suspended', 'deactivated'] as const, ''),
    role: pick(p.get('role'), ['', 'user', 'seller', 'agency', 'admin'] as const, ''),
    star: pick(p.get('star'), ['', 'yes', 'no'] as const, ''),
    online: pick(p.get('online'), ['', 'yes', 'no'] as const, ''),
    sort: pick(p.get('sort'), ['id', 'created_at', 'name', 'coins', 'gems', 'level', 'last_seen'] as const, 'id'),
    order: pick(p.get('order'), ['asc', 'desc'] as const, 'desc'),
    limit: [20, 50, 100].includes(Number(p.get('limit'))) ? Number(p.get('limit')) : 20,
    page: num(p.get('page'), 1),
  };
}

function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).forEach((k) => {
    if (f[k] !== DEFAULT_FILTERS[k] && f[k] !== '') p.set(k, String(f[k]));
  });
  return p.toString();
}

function relativeTime(iso?: string | null): string {
  if (!iso) return 'Never';
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

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function userStatus(u: UserRow): UserStatus {
  if (u.status) return u.status;
  if (u.account_status === 'deleted') return 'deactivated';
  if (u.account_status === 'suspended') return 'suspended';
  return 'active';
}

export default function UsersPage() {
  const { token } = useAdminAuth();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, active: 0, suspended: 0, deactivated: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ user: UserRow; top: number; left: number } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const requestSeq = useRef(0);

  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const [asset, setAsset] = useState<'coins' | 'gems'>('coins');
  const [action, setAction] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const initial = filtersFromUrl();
    setFilters(initial);
    setSearchInput(initial.q);
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({
      q: filters.q,
      page: String(filters.page),
      limit: String(filters.limit),
      sort: filters.sort,
      order: filters.order,
    });
    if (filters.status) params.set('status', filters.status);
    if (filters.role) params.set('role', filters.role);
    if (filters.star) params.set('star', filters.star);
    if (filters.online) params.set('online', filters.online);
    try {
      const json = await api<{
        success: boolean;
        data?: { users: UserRow[]; total?: number; total_pages?: number; counts?: Counts };
      }>(`/admin/users?${params.toString()}`, tok);
      if (seq !== requestSeq.current) return;
      const pages = Math.max(1, Number(json.data?.total_pages ?? 1));
      setUsers(json.data?.users ?? []);
      setTotal(Number(json.data?.total ?? 0));
      setTotalPages(pages);
      if (json.data?.counts) setCounts(json.data.counts);
      if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load users');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!ready || !token) return;
    setPageInput(String(filters.page));
    const qs = filtersToQuery(filters);
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    void load();
  }, [ready, token, filters, load]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setFilters((f) => (f.q === searchInput.trim() ? f : { ...f, q: searchInput.trim(), page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, ready]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      if (!confirmBusy) setConfirmState(null);
      if (!adjusting) setAdjustTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmBusy, adjusting]);

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  }

  function resetFilters() {
    setSearchInput('');
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters =
    filters.q !== '' || filters.role !== '' || filters.star !== '' || filters.online !== '' ||
    filters.status !== '' || filters.sort !== 'id' || filters.order !== 'desc';

  function toggleSort(column: string, defaultOrder: 'asc' | 'desc' = 'desc') {
    if (filters.sort === column) {
      update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    } else {
      update({ sort: column, order: defaultOrder });
    }
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

  async function runAction(
    u: UserRow,
    actionName: string,
    body: Record<string, unknown>,
    successText: string,
  ) {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setBusyId(u.id);
    try {
      await api(`/admin/users/${u.id}/${actionName}`, tok, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast('success', successText);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function displayName(u: UserRow) {
    return u.display_name || u.email || `User #${u.id}`;
  }

  function openConfirm(state: ConfirmState) {
    setMenu(null);
    setConfirmError(null);
    setConfirmReason(state.reason?.defaultValue ?? '');
    setConfirmState(state);
  }

  async function submitConfirm(e: FormEvent) {
    e.preventDefault();
    if (!confirmState) return;
    if (confirmState.reason?.required && !confirmReason.trim()) {
      setConfirmError('Please enter a reason.');
      return;
    }
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      await confirmState.onConfirm(confirmReason.trim());
      setConfirmState(null);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setConfirmBusy(false);
    }
  }

  function askSuspend(u: UserRow) {
    openConfirm({
      title: 'Suspend user',
      message: `${displayName(u)} (#${u.id}) will be signed out of the app and blocked from logging in until unsuspended.`,
      confirmLabel: 'Suspend',
      tone: 'danger',
      reason: { label: 'Reason', placeholder: 'Why is this user being suspended?', required: true, defaultValue: '' },
      onConfirm: (reason) => runAction(u, 'suspend', { reason }, `${displayName(u)} suspended`),
    });
  }

  function askUnsuspend(u: UserRow) {
    openConfirm({
      title: 'Unsuspend user',
      message: `${displayName(u)} (#${u.id}) will be able to log in and use the app again.`,
      confirmLabel: 'Unsuspend',
      tone: 'success',
      onConfirm: () => runAction(u, 'unsuspend', {}, `${displayName(u)} unsuspended`),
    });
  }

  function askDeactivate(u: UserRow) {
    openConfirm({
      title: 'Deactivate account',
      message: `This ends all sessions for ${displayName(u)} (#${u.id}), removes them from any live rooms and seats, and clears staff badges. You can restore the account later.`,
      confirmLabel: 'Deactivate',
      tone: 'danger',
      reason: { label: 'Reason', placeholder: 'Why is this account being deactivated?', required: true, defaultValue: '' },
      onConfirm: (reason) => runAction(u, 'deactivate', { reason }, `${displayName(u)} deactivated`),
    });
  }

  function askRestore(u: UserRow) {
    openConfirm({
      title: 'Restore account',
      message: `${displayName(u)} (#${u.id}) will be reactivated and can log in again.`,
      confirmLabel: 'Restore',
      tone: 'success',
      onConfirm: () => runAction(u, 'restore', {}, `${displayName(u)} restored`),
    });
  }

  function askRole(u: UserRow, role: string) {
    if (role === (u.role ?? 'user')) return;
    const label = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
    openConfirm({
      title: 'Change role',
      message: `Change ${displayName(u)} (#${u.id}) from ${ROLE_OPTIONS.find((r) => r.value === (u.role ?? 'user'))?.label ?? u.role} to ${label}?${role === 'admin' ? ' Admins get full access to this panel.' : ''}`,
      confirmLabel: `Make ${label}`,
      tone: role === 'admin' ? 'danger' : 'primary',
      onConfirm: () => runAction(u, 'link', { role }, `${displayName(u)} is now ${label}`),
    });
  }

  async function toggleStar(u: UserRow) {
    try {
      await runAction(
        u,
        'star',
        { is_star: !u.is_star_account },
        u.is_star_account ? `${displayName(u)} removed from Star Creators` : `${displayName(u)} is now a Star Creator`,
      );
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to update star status');
    }
  }

  async function copy(text: string, label: string) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(text);
      toast('success', `${label} copied`);
    } catch {
      toast('error', 'Copy failed');
    }
  }

  function openAdjust(u: UserRow) {
    setMenu(null);
    setAdjustTarget({
      id: u.id,
      name: displayName(u),
      coins: Number(u.coins ?? u.coin_balance ?? 0),
      gems: Number(u.gems ?? 0),
    });
    setAsset('coins');
    setAction('add');
    setAmount('');
    setNote('');
    setAdjustError(null);
    setAdjustSuccess(null);
  }

  function closeAdjust() {
    if (adjusting) return;
    setAdjustTarget(null);
    setAdjustError(null);
    setAdjustSuccess(null);
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;

    const parsed = Math.floor(Number(amount));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setAdjustError('Enter a positive whole-number amount.');
      return;
    }
    if (action === 'deduct' && !note.trim()) {
      setAdjustError('A note is required when deducting.');
      return;
    }

    setAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const json = await api<{
        success: boolean;
        data?: {
          message?: string;
          balances?: { coin_balance?: number; gems?: number };
        };
        message?: string;
      }>(`/admin/users/${adjustTarget.id}/adjust-balance`, tok, {
        method: 'POST',
        body: JSON.stringify({
          asset,
          action,
          amount: parsed,
          note: note.trim() || undefined,
        }),
      });
      const msg =
        json.data?.message ??
        json.message ??
        (action === 'add'
          ? `Added ${parsed} ${asset}`
          : `Deducted ${parsed} ${asset}`);
      setAdjustSuccess(msg);
      if (json.data?.balances) {
        setAdjustTarget((prev) =>
          prev
            ? {
                ...prev,
                coins: Number(json.data?.balances?.coin_balance ?? prev.coins),
                gems: Number(json.data?.balances?.gems ?? prev.gems),
              }
            : prev,
        );
      }
      setAmount('');
      setNote('');
      void load();
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : 'Adjustment failed');
    } finally {
      setAdjusting(false);
    }
  }

  const sortPresetValue = `${filters.sort}:${filters.order}`;
  const sortPresetKnown = SORT_PRESETS.some((s) => s.value === sortPresetValue);
  const from = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const to = Math.min(filters.page * filters.limit, total);

  function sortHeader(
    column: string,
    label: string,
    align: 'left' | 'right' | 'center' = 'left',
    defaultOrder: 'asc' | 'desc' = 'desc',
  ) {
    const active = filters.sort === column;
    return (
      <th key={column} className="um-th" style={{ textAlign: align }}>
        <span
          role="button"
          tabIndex={0}
          className={`um-sort ${active ? 'is-active' : ''}`}
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
          <span className="um-sort-icon">{active ? (filters.order === 'desc' ? '▼' : '▲') : '↕'}</span>
        </span>
      </th>
    );
  }

  return (
    <main className="um">
      <style>{STYLES}</style>

      <div className="um-header">
        <div>
          <h1>User Management</h1>
          <p>Search, filter and sort users. Assign roles, credit/debit coins &amp; gems, and manage account access.</p>
        </div>
      </div>

      <div className="um-card">
        <div className="um-tabs" role="tablist">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value || 'all'}
              type="button"
              role="tab"
              aria-selected={filters.status === t.value}
              className={`um-tab ${filters.status === t.value ? 'is-active' : ''} tone-${t.value || 'all'}`}
              onClick={() => update({ status: t.value })}
            >
              {t.label}
              <span className="um-tab-count">{counts[t.countKey].toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="um-toolbar">
          <div className="um-search">
            <span className="um-search-icon" aria-hidden>⌕</span>
            <input
              placeholder="Search by name, email, phone or #ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') update({ q: searchInput.trim() });
              }}
            />
            {searchInput && (
              <button type="button" className="um-search-clear" onClick={() => setSearchInput('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>

          <label className="um-field">
            <span>Role</span>
            <select value={filters.role} onChange={(e) => update({ role: e.target.value })}>
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          <label className="um-field">
            <span>Star creator</span>
            <select value={filters.star} onChange={(e) => update({ star: e.target.value as Filters['star'] })}>
              <option value="">Any</option>
              <option value="yes">Star creators</option>
              <option value="no">Standard only</option>
            </select>
          </label>

          <label className="um-field">
            <span>Presence</span>
            <select value={filters.online} onChange={(e) => update({ online: e.target.value as Filters['online'] })}>
              <option value="">Any</option>
              <option value="yes">Online now</option>
              <option value="no">Offline</option>
            </select>
          </label>

          <label className="um-field">
            <span>Sort by</span>
            <select
              value={sortPresetKnown ? sortPresetValue : ''}
              onChange={(e) => {
                const preset = SORT_PRESETS.find((s) => s.value === e.target.value);
                if (preset) update({ sort: preset.sort, order: preset.order });
              }}
            >
              {!sortPresetKnown && <option value="">Custom</option>}
              {SORT_PRESETS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="um-btn um-btn-ghost um-reset" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>

        <div className="um-summary">
          {loading ? 'Loading…' : (
            <>
              <strong>{total.toLocaleString()}</strong> user{total === 1 ? '' : 's'}
              {filters.q ? <> matching “{filters.q}”</> : null}
            </>
          )}
        </div>

        {loadError && (
          <div className="um-alert">
            {loadError}
            <button type="button" className="um-btn um-btn-ghost" onClick={() => void load()}>Retry</button>
          </div>
        )}

        <div className="um-table-wrap">
          <table className="um-table">
            <thead>
              <tr>
                {sortHeader('id', 'ID')}
                {sortHeader('name', 'User', 'left', 'asc')}
                {sortHeader('coins', 'Balance')}
                {sortHeader('level', 'Level', 'center')}
                <th className="um-th">Role</th>
                <th className="um-th" style={{ textAlign: 'center' }}>Star</th>
                <th className="um-th">Status</th>
                {sortHeader('last_seen', 'Activity')}
                <th className="um-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody className={loading && users.length > 0 ? 'is-loading' : ''}>
              {loading && users.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={9} className="um-td"><div className="um-skeleton" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="um-empty">
                    <div className="um-empty-title">No users found</div>
                    <div>Try a different search or clear your filters.</div>
                    {hasActiveFilters && (
                      <button type="button" className="um-btn um-btn-ghost" onClick={resetFilters} style={{ marginTop: 12 }}>
                        Reset filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const status = userStatus(u);
                  const busy = busyId === u.id;
                  const name = u.display_name || 'Unknown';
                  return (
                    <tr key={u.id} className={`um-row ${busy ? 'is-busy' : ''} ${status !== 'active' ? 'is-muted' : ''}`}>
                      <td className="um-td um-id">#{u.id}</td>
                      <td className="um-td">
                        <div className="um-user">
                          <div className="um-avatar">
                            {u.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatar_url} alt="" />
                            ) : (
                              <span>{name.trim().charAt(0).toUpperCase() || '?'}</span>
                            )}
                            {u.is_online && <i className="um-online-dot" title="Online now" />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="um-name" title={name}>{name}</div>
                            <div className="um-sub" title={u.email ?? ''}>{u.email ?? 'No email'}</div>
                            {u.phone && <div className="um-sub">{u.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="um-td um-balance">
                        <div>🪙 {Number(u.coins ?? u.coin_balance ?? 0).toLocaleString()}</div>
                        <div className="um-sub">💎 {Number(u.gems ?? 0).toLocaleString()}</div>
                      </td>
                      <td className="um-td" style={{ textAlign: 'center' }}>
                        <span className="um-level">Lv {u.level ?? 1}</span>
                      </td>
                      <td className="um-td">
                        <select
                          className={`um-role role-${u.role ?? 'user'}`}
                          value={u.role ?? 'user'}
                          disabled={busy || status !== 'active'}
                          title={status !== 'active' ? 'Reactivate the account before changing its role' : 'Change role'}
                          onChange={(e) => askRole(u, e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="um-td" style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`um-star ${u.is_star_account ? 'is-on' : ''}`}
                          disabled={busy}
                          onClick={() => void toggleStar(u)}
                          title={u.is_star_account ? 'Remove Star Creator' : 'Make Star Creator'}
                        >
                          {u.is_star_account ? '★ Star' : '☆ Standard'}
                        </button>
                      </td>
                      <td className="um-td">
                        <span className={`um-badge status-${status}`} title={u.suspended_reason ? `Reason: ${u.suspended_reason}` : undefined}>
                          {status}
                        </span>
                        {status !== 'active' && u.suspended_reason && (
                          <div className="um-sub um-reason" title={u.suspended_reason}>{u.suspended_reason}</div>
                        )}
                      </td>
                      <td className="um-td um-activity">
                        <div>{u.is_online ? <span className="um-online-text">● Online</span> : relativeTime(u.last_seen_at)}</div>
                        <div className="um-sub">Joined {formatDate(u.created_at)}</div>
                      </td>
                      <td className="um-td" style={{ textAlign: 'right' }}>
                        <div className="um-actions">
                          <button
                            type="button"
                            className="um-btn um-btn-primary-soft"
                            disabled={busy || status === 'deactivated'}
                            onClick={() => openAdjust(u)}
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            className="um-btn um-btn-icon"
                            disabled={busy}
                            aria-label="More actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menu?.user.id === u.id) {
                                setMenu(null);
                                return;
                              }
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const menuHeight = 200;
                              const top = r.bottom + menuHeight > window.innerHeight ? r.top - menuHeight - 4 : r.bottom + 4;
                              setMenu({ user: u, top, left: Math.max(8, r.right - 200) });
                            }}
                          >
                            {busy ? '…' : '⋯'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="um-pager">
          <div className="um-pager-info">
            {total > 0 ? <>Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of <strong>{total.toLocaleString()}</strong></> : '—'}
            <label className="um-page-size">
              Rows
              <select value={filters.limit} onChange={(e) => update({ limit: Number(e.target.value) })}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="um-pager-controls">
              <button type="button" className="um-page-btn" disabled={loading || filters.page <= 1} onClick={() => goToPage(1)} aria-label="First page">«</button>
              <button type="button" className="um-page-btn" disabled={loading || filters.page <= 1} onClick={() => goToPage(filters.page - 1)}>‹ Prev</button>
              {pageNumbers().map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="um-page-gap">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`um-page-btn ${p === filters.page ? 'is-active' : ''}`}
                    disabled={loading}
                    onClick={() => goToPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button type="button" className="um-page-btn" disabled={loading || filters.page >= totalPages} onClick={() => goToPage(filters.page + 1)}>Next ›</button>
              <button type="button" className="um-page-btn" disabled={loading || filters.page >= totalPages} onClick={() => goToPage(totalPages)} aria-label="Last page">»</button>
              <form
                className="um-jump"
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

      {menu && (
        <div className="um-menu" style={{ top: menu.top, left: menu.left }} onClick={(e) => e.stopPropagation()} role="menu">
          {(() => {
            const u = menu.user;
            const status = userStatus(u);
            return (
              <>
                <div className="um-menu-head">{displayName(u)} · #{u.id}</div>
                {status === 'active' && (
                  <button type="button" role="menuitem" className="um-menu-item tone-warn" onClick={() => askSuspend(u)}>Suspend…</button>
                )}
                {status === 'suspended' && (
                  <button type="button" role="menuitem" className="um-menu-item tone-ok" onClick={() => askUnsuspend(u)}>Unsuspend</button>
                )}
                {status !== 'deactivated' ? (
                  <button type="button" role="menuitem" className="um-menu-item tone-danger" onClick={() => askDeactivate(u)}>Deactivate account…</button>
                ) : (
                  <button type="button" role="menuitem" className="um-menu-item tone-ok" onClick={() => askRestore(u)}>Restore account…</button>
                )}
                <div className="um-menu-sep" />
                <button type="button" role="menuitem" className="um-menu-item" onClick={() => void copy(String(u.id), 'User ID')}>Copy user ID</button>
                {u.email && (
                  <button type="button" role="menuitem" className="um-menu-item" onClick={() => void copy(u.email!, 'Email')}>Copy email</button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {confirmState && (
        <div className="um-overlay" role="dialog" aria-modal="true" onClick={() => !confirmBusy && setConfirmState(null)}>
          <form className="um-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submitConfirm(e)}>
            <h2>{confirmState.title}</h2>
            <p className="um-modal-text">{confirmState.message}</p>
            {confirmState.reason && (
              <label className="um-modal-label">
                {confirmState.reason.label}{confirmState.reason.required ? ' (required)' : ''}
                <textarea
                  autoFocus
                  rows={3}
                  value={confirmReason}
                  placeholder={confirmState.reason.placeholder}
                  onChange={(e) => setConfirmReason(e.target.value)}
                />
              </label>
            )}
            {confirmError && <div className="um-alert">{confirmError}</div>}
            <div className="um-modal-actions">
              <button type="button" className="um-btn um-btn-ghost" disabled={confirmBusy} onClick={() => setConfirmState(null)}>
                Cancel
              </button>
              <button type="submit" autoFocus={!confirmState.reason} className={`um-btn um-btn-solid tone-${confirmState.tone}`} disabled={confirmBusy}>
                {confirmBusy ? 'Working…' : confirmState.confirmLabel}
              </button>
            </div>
          </form>
        </div>
      )}

      {adjustTarget && (
        <div className="um-overlay" role="dialog" aria-modal="true" onClick={closeAdjust}>
          <div className="um-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Adjust balance</h2>
            <p className="um-modal-text" style={{ marginBottom: 4 }}>{adjustTarget.name} · #{adjustTarget.id}</p>
            <p className="um-modal-text" style={{ color: '#374151' }}>
              Current: 🪙 {adjustTarget.coins.toLocaleString()} · 💎 {adjustTarget.gems.toLocaleString()}
            </p>

            <form onSubmit={(e) => void submitAdjust(e)} style={{ display: 'grid', gap: 14 }}>
              <label className="um-modal-label">
                Asset
                <select value={asset} onChange={(e) => setAsset(e.target.value as 'coins' | 'gems')}>
                  <option value="coins">Coins</option>
                  <option value="gems">Gems</option>
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" onClick={() => setAction('add')} className={`um-seg ${action === 'add' ? 'is-add' : ''}`}>
                  Credit (add)
                </button>
                <button type="button" onClick={() => setAction('deduct')} className={`um-seg ${action === 'deduct' ? 'is-deduct' : ''}`}>
                  Debit (deduct)
                </button>
              </div>

              <label className="um-modal-label">
                Amount
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1000"
                />
              </label>

              <label className="um-modal-label">
                Note {action === 'deduct' ? '(required)' : '(optional)'}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  required={action === 'deduct'}
                  placeholder={action === 'deduct' ? 'Reason for debit (required for audit)' : 'Optional reason for this credit'}
                />
              </label>

              {adjustError && <div className="um-alert">{adjustError}</div>}
              {adjustSuccess && <div className="um-success">{adjustSuccess}</div>}

              <div className="um-modal-actions">
                <button type="button" className="um-btn um-btn-ghost" onClick={closeAdjust} disabled={adjusting}>
                  Close
                </button>
                <button type="submit" disabled={adjusting} className={`um-btn um-btn-solid ${action === 'deduct' ? 'tone-danger' : 'tone-primary'}`}>
                  {adjusting ? 'Saving…' : action === 'add' ? 'Credit' : 'Debit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="um-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`um-toast ${t.kind}`}>
            {t.kind === 'success' ? '✓' : '!'} {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

const STYLES = `
.um { padding: 32px 40px; max-width: 1480px; margin: 0 auto; width: 100%; box-sizing: border-box; }
.um-header h1 { font-size: 1.875rem; font-weight: 700; color: #111827; margin: 0 0 8px; }
.um-header p { color: #6b7280; margin: 0 0 24px; font-size: 0.95rem; }
.um-card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding: 0 0 8px; }

.um-tabs { display: flex; gap: 4px; padding: 0 20px; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
.um .um-tab { background: transparent; color: #6b7280; border-radius: 0; padding: 14px 14px 12px; border-bottom: 2px solid transparent; font-weight: 600; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.um .um-tab:hover { background: transparent; color: #111827; }
.um .um-tab.is-active { color: #111827; border-bottom-color: #4f46e5; }
.um-tab-count { background: #f3f4f6; color: #374151; border-radius: 999px; padding: 2px 8px; font-size: 0.72rem; }
.um-tab.is-active .um-tab-count { background: #eef2ff; color: #4338ca; }
.um-tab.tone-suspended.is-active .um-tab-count { background: #fef3c7; color: #92400e; }
.um-tab.tone-deactivated.is-active .um-tab-count { background: #fee2e2; color: #991b1b; }
.um-tab.tone-active.is-active .um-tab-count { background: #d1fae5; color: #065f46; }

.um-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 18px 20px 8px; }
.um-search { position: relative; flex: 1 1 280px; max-width: 420px; }
.um-search input { padding-left: 34px; padding-right: 32px; margin: 0; }
.um-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 1.05rem; pointer-events: none; }
.um .um-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: transparent; color: #9ca3af; padding: 2px 8px; font-size: 1.1rem; line-height: 1; }
.um .um-search-clear:hover { background: #f3f4f6; color: #374151; }
.um-field { display: grid; gap: 4px; font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
.um select { font: inherit; font-size: 0.875rem; text-transform: none; letter-spacing: normal; font-weight: 500; padding: 9px 10px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; min-width: 140px; cursor: pointer; }
.um select:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.um-reset { align-self: flex-end; }

.um-summary { padding: 4px 20px 12px; color: #6b7280; font-size: 0.85rem; }
.um-summary strong { color: #111827; }

.um-alert { margin: 0 20px 12px; padding: 10px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.um-modal .um-alert { margin: 0; }
.um-success { padding: 10px 12px; border-radius: 8px; background: #ecfdf5; color: #047857; font-size: 0.85rem; }

.um-table-wrap { overflow-x: auto; }
.um-table { width: 100%; border-collapse: collapse; text-align: left; }
.um-th { padding: 11px 14px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; background: #f9fafb; white-space: nowrap; font-weight: 600; }
.um-sort { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 4px; }
.um-sort:hover, .um-sort.is-active { color: #111827; }
.um-sort-icon { font-size: 0.65rem; opacity: 0.5; }
.um-sort.is-active .um-sort-icon { opacity: 1; color: #4f46e5; }
.um-td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; font-size: 0.875rem; }
.um-row:hover { background: #fafafa; }
.um-row.is-busy { opacity: 0.55; pointer-events: none; }
.um-row.is-muted .um-name { color: #6b7280; }
tbody.is-loading { opacity: 0.6; transition: opacity 0.15s; }
.um-id { color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; }
.um-user { display: flex; align-items: center; gap: 10px; min-width: 220px; max-width: 300px; }
.um-avatar { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; background: #eef2ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
.um-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.um-online-dot { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; background: #10b981; border: 2px solid #fff; }
.um-name { font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.um-sub { font-size: 0.78rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.um-reason { max-width: 140px; margin-top: 4px; }
.um-balance { white-space: nowrap; font-variant-numeric: tabular-nums; color: #374151; }
.um-level { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #f3f4f6; color: #374151; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.um-activity { white-space: nowrap; color: #374151; }
.um-online-text { color: #059669; font-weight: 600; }

.um .um-role { min-width: 0; padding: 5px 8px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }
.um .um-role.role-admin { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
.um .um-role.role-seller { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.um .um-role.role-agency { background: #ede9fe; color: #5b21b6; border-color: #ddd6fe; }
.um .um-role:disabled { opacity: 0.6; cursor: not-allowed; }

.um .um-star { padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; white-space: nowrap; }
.um .um-star:hover { background: #fef9c3; color: #a16207; border-color: #fde68a; }
.um .um-star.is-on { background: #fef3c7; color: #b45309; border-color: #fcd34d; }

.um-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.um-badge.status-active { background: #d1fae5; color: #065f46; }
.um-badge.status-suspended { background: #fef3c7; color: #92400e; }
.um-badge.status-deactivated { background: #fee2e2; color: #991b1b; }

.um-actions { display: inline-flex; gap: 6px; align-items: center; }
.um .um-btn { padding: 7px 12px; font-size: 0.8rem; border-radius: 8px; width: auto; white-space: nowrap; }
.um .um-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.um .um-btn-primary-soft { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.um .um-btn-primary-soft:hover:not(:disabled) { background: #dbeafe; }
.um .um-btn-icon { background: #fff; color: #374151; border: 1px solid #d1d5db; padding: 5px 10px; font-size: 1rem; line-height: 1.2; }
.um .um-btn-icon:hover:not(:disabled) { background: #f3f4f6; }
.um .um-btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; }
.um .um-btn-ghost:hover:not(:disabled) { background: #f3f4f6; }
.um .um-btn-solid { color: #fff; border: none; }
.um .um-btn-solid.tone-primary { background: #111827; }
.um .um-btn-solid.tone-primary:hover:not(:disabled) { background: #1f2937; }
.um .um-btn-solid.tone-danger { background: #dc2626; }
.um .um-btn-solid.tone-danger:hover:not(:disabled) { background: #b91c1c; }
.um .um-btn-solid.tone-success { background: #059669; }
.um .um-btn-solid.tone-success:hover:not(:disabled) { background: #047857; }

.um-menu { position: fixed; z-index: 60; width: 200px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.12); padding: 6px; }
.um-menu-head { padding: 6px 10px 8px; font-size: 0.75rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #f3f4f6; margin-bottom: 4px; }
.um .um-menu-item { display: block; width: 100%; text-align: left; background: transparent; color: #374151; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; }
.um .um-menu-item:hover { background: #f3f4f6; }
.um .um-menu-item.tone-warn { color: #b45309; }
.um .um-menu-item.tone-warn:hover { background: #fffbeb; }
.um .um-menu-item.tone-danger { color: #b91c1c; }
.um .um-menu-item.tone-danger:hover { background: #fef2f2; }
.um .um-menu-item.tone-ok { color: #047857; }
.um .um-menu-item.tone-ok:hover { background: #ecfdf5; }
.um-menu-sep { height: 1px; background: #f3f4f6; margin: 4px 0; }

.um-skeleton { height: 36px; border-radius: 8px; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%); background-size: 400% 100%; animation: um-shimmer 1.2s ease infinite; }
@keyframes um-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.um-empty { padding: 48px 16px; text-align: center; color: #6b7280; font-size: 0.875rem; }
.um-empty-title { font-weight: 600; color: #111827; font-size: 1rem; margin-bottom: 4px; }

.um-pager { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 14px 20px 8px; }
.um-pager-info { display: flex; align-items: center; gap: 16px; color: #6b7280; font-size: 0.85rem; }
.um-pager-info strong { color: #111827; }
.um-page-size { display: inline-flex; align-items: center; gap: 6px; }
.um .um-page-size select { min-width: 0; padding: 5px 8px; }
.um-pager-controls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.um .um-page-btn { padding: 6px 11px; min-width: 34px; font-size: 0.8rem; border-radius: 8px; background: #fff; color: #374151; border: 1px solid #e5e7eb; width: auto; }
.um .um-page-btn:hover:not(:disabled) { background: #f3f4f6; }
.um .um-page-btn.is-active { background: #111827; color: #fff; border-color: #111827; }
.um .um-page-btn:disabled:not(.is-active) { opacity: 0.4; cursor: not-allowed; }
.um-page-gap { color: #9ca3af; padding: 0 4px; }
.um-jump { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; color: #6b7280; font-size: 0.8rem; }
.um-jump input { width: 64px; padding: 5px 8px; margin: 0; }

.um-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
.um-modal { width: 100%; max-width: 460px; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 20px 40px rgba(0,0,0,0.15); padding: 24px; display: grid; gap: 14px; }
.um-modal h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #111827; }
.um-modal-text { margin: 0; color: #6b7280; font-size: 0.9rem; line-height: 1.5; }
.um-modal-label { display: grid; gap: 6px; font-size: 0.85rem; color: #374151; font-weight: 500; }
.um-modal textarea { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #d1d5db; resize: vertical; }
.um-modal textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.um-modal input { margin: 0; }
.um-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.um .um-seg { padding: 10px 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #374151; }
.um .um-seg:hover { background: #f9fafb; }
.um .um-seg.is-add { border-color: #86efac; background: #d1fae5; color: #065f46; }
.um .um-seg.is-deduct { border-color: #fca5a5; background: #fee2e2; color: #991b1b; }

.um-toasts { position: fixed; right: 20px; bottom: 20px; display: grid; gap: 8px; z-index: 80; }
.um-toast { padding: 10px 14px; border-radius: 10px; font-size: 0.875rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.12); animation: um-in 0.18s ease-out; max-width: 360px; }
.um-toast.success { background: #064e3b; color: #ecfdf5; }
.um-toast.error { background: #7f1d1d; color: #fef2f2; }
@keyframes um-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 900px) {
  .um { padding: 20px 16px; }
}
`;
