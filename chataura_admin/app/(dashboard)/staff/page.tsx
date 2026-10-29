'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { AdminTier, TIER_LABEL, TIER_RANK, canCreate, creatableTiers, readTier } from '@/lib/tier';
import {
  Avatar,
  Field,
  Kpi,
  PageHeader,
  Pager,
  useClientPager,
  Section,
  EmptyRow,
  SearchBox,
  SkeletonRows,
  Tabs,
  errorText,
  fmt,
  pick,
  useConfirm,
  useDebouncedCommit,
  useToasts,
  useUrlFilters,
} from '@/components/admin-ui';

type StaffRow = {
  id: number;
  display_id?: string;
  email?: string | null;
  phone?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: string;
  staff_badge_type?: string | null;
  account_status?: string;
  business?: {
    users_brought?: number;
    users_brought_today?: number;
    rooms_hosted_today: number;
    gift_coins_today: number;
    recharge_coins_today: number;
  };
};

const ROLES = ['', 'admin', 'seller', 'agency'] as const;
const TIERS = ['', 'superadmin', 'ceo', 'manager', 'admin'] as const;
const SORTS = ['id', 'users', 'rooms', 'gifts', 'name'] as const;
type Role = (typeof ROLES)[number];

const ROLE_META: Record<string, { label: string; tone: string }> = {
  admin: { label: 'Administrator', tone: 'red' },
  seller: { label: 'Coin Seller', tone: 'amber' },
  agency: { label: 'Agency', tone: 'indigo' },
};

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  id: 'ID (oldest first)',
  users: 'Most users brought',
  rooms: 'Most rooms today',
  gifts: 'Highest gift volume',
  name: 'Name (A–Z)',
};

const DEFAULTS = { q: '', role: '' as Role, tier: '', sort: 'id', page: 1 };

/** Admin with no/unknown badge counts as the lowest tier, same as the backend. */
function tierOf(s: StaffRow): AdminTier | null {
  if (s.role !== 'admin') return null;
  const b = String(s.staff_badge_type ?? 'admin').toLowerCase();
  return (b in TIER_RANK ? b : 'admin') as AdminTier;
}

export default function StaffPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'admin' | 'seller'>('admin');
  const [badgeType, setBadgeType] = useState<AdminTier>('admin');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [myTier, setMyTier] = useState<AdminTier | null>(null);
  useEffect(() => setMyTier(readTier()), []);
  // Tiers this user may assign (never superadmin); seller is superadmin-only.
  const assignable = myTier ? creatableTiers(myTier) : [];
  useEffect(() => {
    if (assignable.length && !assignable.includes(badgeType)) setBadgeType(assignable[0]);
  }, [myTier]);

  const { filters, update, reset, isDirty, ready } = useUrlFilters(DEFAULTS, (p) => ({
    q: p.get('q') ?? '',
    role: pick(p.get('role'), ROLES, ''),
    tier: pick(p.get('tier'), TIERS, ''),
    sort: pick(p.get('sort'), SORTS, 'id'),
    page: 1,
  }));
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (ready) setSearch(filters.q);
  }, [ready]);
  useDebouncedCommit(search, (q) => q !== filters.q && update({ q }), 200);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ data?: { staff: StaffRow[] } }>('/admin/staff', tok);
      setStaff(json.data?.staff ?? []);
      setLoadError('');
    } catch (e) {
      setLoadError(errorText(e, 'Could not load staff'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load(token);
  }, [token]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': staff.length, admin: 0, seller: 0, agency: 0 };
    staff.forEach((s) => { if (s.role && s.role in c) c[s.role] += 1; });
    return c;
  }, [staff]);

  const rows = useMemo(() => {
    const q = filters.q.toLowerCase().replace(/^#/, '');
    const out = staff.filter((s) => {
      if (filters.role && s.role !== filters.role) return false;
      if (filters.tier && tierOf(s) !== filters.tier) return false;
      if (!q) return true;
      return [String(s.id), s.display_id, s.display_name, s.email, s.phone]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
    const b = (s: StaffRow) => s.business;
    const by: Record<string, (a: StaffRow, z: StaffRow) => number> = {
      id: (a, z) => a.id - z.id,
      users: (a, z) => (b(z)?.users_brought ?? 0) - (b(a)?.users_brought ?? 0),
      rooms: (a, z) => (b(z)?.rooms_hosted_today ?? 0) - (b(a)?.rooms_hosted_today ?? 0),
      gifts: (a, z) => (b(z)?.gift_coins_today ?? 0) - (b(a)?.gift_coins_today ?? 0),
      name: (a, z) => (a.display_name ?? '').localeCompare(z.display_name ?? ''),
    };
    return out.sort(by[filters.sort] ?? by.id);
  }, [staff, filters]);

  async function linkExisting() {
    if (!token || !userId.trim()) return;
    setAssigning(true);
    try {
      const json = await api<{ success?: boolean; error?: { message?: string } }>(`/admin/users/${encodeURIComponent(userId.trim())}/link`, token, {
        method: 'POST',
        body: JSON.stringify({
          role,
          ...(role === 'admin' ? { staff_badge_type: badgeType } : {}),
        }),
      });
      if (json.success === false) throw new Error(json.error?.message ?? 'Link failed');
      setError('');
      setUserId('');
      toast('success', `User ${userId.trim()} is now ${role === 'admin' ? TIER_LABEL[badgeType] : 'a Coin Seller'}`);
      void load(token);
    } catch (e) {
      setError(errorText(e, 'Link failed'));
    } finally {
      setAssigning(false);
    }
  }

  function demoteStaff(s: StaffRow) {
    confirm({
      title: 'Demote to regular user?',
      message: <>#{s.id} <strong>{s.display_name ?? 'Staff user'}</strong> will lose all staff and seller access.</>,
      confirmLabel: 'Demote',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/users/${s.id}/link`, token, {
          method: 'POST',
          body: JSON.stringify({ role: 'user' }),
        });
        toast('success', `#${s.id} demoted to user`);
        if (token) void load(token);
      },
    });
  }

  const roleTabs = [
    { value: '' as Role, label: 'All', count: counts[''] },
    { value: 'admin' as Role, label: 'Administrators', count: counts.admin, tone: 'red' as const },
    { value: 'seller' as Role, label: 'Coin Sellers', count: counts.seller, tone: 'amber' as const },
    ...(counts.agency ? [{ value: 'agency' as Role, label: 'Agencies', count: counts.agency }] : []),
  ];

  const totals = useMemo(() => staff.reduce(
    (t, s) => ({
      users: t.users + (s.business?.users_brought ?? 0),
      gifts: t.gifts + (s.business?.gift_coins_today ?? 0),
      rooms: t.rooms + (s.business?.rooms_hosted_today ?? 0),
    }),
    { users: 0, gifts: 0, rooms: 0 },
  ), [staff]);
  const clearAll = () => { setSearch(''); reset(); };
  const { pageItems, pagerProps } = useClientPager(rows, `${filters.q}|${filters.role}|${filters.tier}|${filters.sort}`);

  return (
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: STAFF_STYLES }} />
      <PageHeader
        title="Staff & Sellers"
        subtitle="Authorize staff administrators, designate coin sellers, and track what each one brings in."
      />

      <div className="cp-kpis">
        <Kpi label="Total staff" value={loading && !staff.length ? '—' : fmt(staff.length)} sub={`${fmt(counts.admin)} admins · ${fmt(counts.seller)} sellers`} />
        <Kpi label="Users brought" value={fmt(totals.users)} sub="All time, by all staff" tone="indigo" />
        <Kpi label="Rooms today" value={fmt(totals.rooms)} sub="Hosted by staff" />
        <Kpi label="Gift volume today" value={`🪙 ${fmt(totals.gifts)}`} sub="Sent by staff" tone="amber" />
      </div>

      {assignable.length > 0 ? (
        <Section collapsible title="Promote a user" subtitle="Give an existing user a staff badge or make them a coin seller.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void linkExisting();
            }}
          >
            <div className="cp-form-grid is-2up st-promote">
              <Field label="User ID / Display ID" wide>
                <input placeholder="e.g. 102 or 5575178" value={userId} onChange={(e) => setUserId(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Role" wide={role !== 'admin'}>
                <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'seller')}>
                  <option value="admin">Administrator</option>
                  {myTier === 'superadmin' ? <option value="seller">Coin Seller</option> : null}
                </select>
              </Field>
              {role === 'admin' ? (
                <Field label="Staff badge">
                  <select value={badgeType} onChange={(e) => setBadgeType(e.target.value as AdminTier)}>
                    {assignable.map((t) => (
                      <option key={t} value={t}>{TIER_LABEL[t]}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <div className="st-submit">
                <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={assigning || !userId.trim()}>
                  {assigning ? 'Assigning…' : 'Assign role'}
                </button>
              </div>
            </div>
            {error ? <div className="cp-alert is-flush" style={{ marginTop: 12 }}>{error}</div> : null}
          </form>
        </Section>
      ) : null}

      <section className="cp-card">
        <Tabs value={filters.role} onChange={(v) => update({ role: v, tier: v === 'admin' || v === '' ? filters.tier : '' })} tabs={roleTabs} />
        <div className="cp-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone or ID" />
          {filters.role === '' || filters.role === 'admin' ? (
            <Field label="Badge">
              <select value={filters.tier} onChange={(e) => update({ tier: e.target.value })}>
                <option value="">All badges</option>
                {TIERS.filter(Boolean).map((t) => (
                  <option key={t} value={t}>{TIER_LABEL[t as AdminTier]}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Sort by">
            <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s} value={s}>{SORT_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="cp-summary">
          Showing <strong>{rows.length}</strong> of <strong>{staff.length}</strong>
          {isDirty ? (
            <>
              {' · '}
              <button type="button" className="cp-link" onClick={clearAll}>Clear filters</button>
            </>
          ) : null}
        </div>
        {loadError ? (
          <div className="cp-alert">
            {loadError}
            <button type="button" className="cp-btn cp-btn-ghost" onClick={() => token && void load(token)}>Retry</button>
          </div>
        ) : null}

        <div className="cp-table-wrap">
          <table className="cp-table is-stack is-3up">
            <thead>
              <tr>
                <th className="cp-th">Staff</th>
                <th className="cp-th">Role</th>
                <th className="cp-th cp-num">Users brought</th>
                <th className="cp-th cp-num">Rooms today</th>
                <th className="cp-th cp-num">Gifts today</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && staff.length === 0 ? (
                <SkeletonRows cols={6} rows={5} />
              ) : rows.length === 0 ? (
                <EmptyRow
                  cols={6}
                  title={staff.length ? 'No staff match these filters' : 'No staff yet'}
                  hint={staff.length ? 'Try a different search or badge.' : 'Promote a user above to add staff or sellers.'}
                  onReset={isDirty ? clearAll : undefined}
                />
              ) : (
                pageItems.map((s) => {
                  const meta = ROLE_META[s.role ?? ''] ?? { label: s.role ?? '—', tone: 'gray' };
                  const tier = tierOf(s);
                  const roleBadge = (
                    <span className="st-role">
                      <span className={`cp-badge ${meta.tone}`}>{tier ? TIER_LABEL[tier] : meta.label}</span>
                    </span>
                  );
                  return (
                    <tr key={s.id} className="cp-row">
                      <td className="cp-td is-main">
                        <div className="cp-user">
                          <Avatar name={s.display_name} url={s.avatar_url} />
                          <div>
                            <div className="cp-name">{s.display_name ?? 'Staff User'}</div>
                            <div className="cp-sub">{s.email ?? s.phone ?? 'No email'}</div>
                            <div className="cp-sub">#{s.id}{s.display_id && s.display_id !== String(s.id) ? ` · ID ${s.display_id}` : ''}</div>
                          </div>
                        </div>
                        <span className="cp-mobile-only">{roleBadge}</span>
                      </td>
                      <td className="cp-td is-hide-sm">{roleBadge}</td>
                      <td className="cp-td cp-num tone-indigo" data-label="Users brought">{fmt(s.business?.users_brought)}</td>
                      <td className="cp-td cp-num" data-label="Rooms today">{fmt(s.business?.rooms_hosted_today)}</td>
                      <td className="cp-td cp-num tone-amber" data-label="Gifts today">🪙 {fmt(s.business?.gift_coins_today)}</td>
                      <td className="cp-td cp-num is-actions">
                        {/* Mirrors the API: staff only by a higher tier, sellers/agencies only by the superadmin. */}
                        {myTier && (tier ? canCreate(myTier, tier) : myTier === 'superadmin') ? (
                          <div className="cp-actions">
                            <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => demoteStaff(s)}>
                              Demote to user
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 25 && <Pager {...pagerProps} />}
      </section>
      {confirmNode}
      {toastNode}
    </main>
  );
}

const STAFF_STYLES = `
.st-submit { display: flex; align-items: flex-end; }
@media (min-width: 641px) {
  .st-promote { grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(150px, 1fr)); align-items: end; }
  .st-promote .cp-field.is-wide { grid-column: auto; }
}
@media (max-width: 640px) {
  .st-submit { grid-column: 1 / -1; }
}
`;
