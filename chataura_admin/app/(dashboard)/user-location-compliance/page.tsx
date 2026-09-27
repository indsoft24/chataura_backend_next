'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  AdminStyles,
  applyRange,
  Avatar,
  DateRangeChips,
  downloadCsv,
  EmptyRow,
  errorText,
  fmt,
  formatDate,
  Pager,
  pick,
  positiveInt,
  RANGE_KEYS,
  RangeKey,
  SearchBox,
  SkeletonRows,
  SortTh,
  Tabs,
  useDebouncedCommit,
  useToasts,
  useUrlFilters,
  ymd,
} from '@/components/admin-ui';

type ComplianceUser = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url?: string | null;
  profile_country: string | null;
  client_country: string | null;
  effective_country: string;
  country_mismatch?: boolean;
  coin_balance: number;
  status?: 'active' | 'suspended' | 'deactivated';
  account_status: string;
  registered_at: string;
};

type Kpis = { total_tracked_users?: number; countries_detected?: number; mismatches?: number; unknown?: number };
type CountryCount = { code: string; count: number };

const DEFAULTS = {
  q: '',
  country: '',
  match: '' as '' | 'mismatch' | 'match' | 'missing',
  status: '' as '' | 'active' | 'suspended' | 'deactivated',
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
    country: (p.get('country') ?? '').toUpperCase().slice(0, 8),
    match: pick(p.get('match'), ['', 'mismatch', 'match', 'missing'] as const, ''),
    status: pick(p.get('status'), ['', 'active', 'suspended', 'deactivated'] as const, ''),
    range: pick(p.get('range'), RANGE_KEYS, 'all'),
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    sort: pick(p.get('sort'), ['id', 'created_at', 'coins', 'name', 'country'] as const, 'id'),
    order: pick(p.get('order'), ['asc', 'desc'] as const, 'desc'),
    limit: [25, 50, 100].includes(Number(p.get('limit'))) ? Number(p.get('limit')) : 25,
    page: positiveInt(p.get('page'), 1),
  };
}

const SORTS = [
  { value: 'id:desc', label: 'Newest accounts' },
  { value: 'id:asc', label: 'Oldest accounts' },
  { value: 'country:asc', label: 'Country: A → Z' },
  { value: 'coins:desc', label: 'Coins: high → low' },
  { value: 'coins:asc', label: 'Coins: low → high' },
  { value: 'name:asc', label: 'Name: A → Z' },
];

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string | null | undefined): string {
  if (!code || code === 'UNKNOWN' || code === 'Unknown') return 'Unknown';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const STATUS_BADGE = {
  active: 'green',
  suspended: 'amber',
  deactivated: 'red',
} as const;

export default function UserLocationCompliancePage() {
  const { token } = useAdminAuth();
  const { filters, setFilters, update, reset, ready, isDirty } = useUrlFilters(DEFAULTS, parse);
  const [searchInput, setSearchInput] = useState('');
  const [users, setUsers] = useState<ComplianceUser[]>([]);
  const [kpis, setKpis] = useState<Kpis>({});
  const [countries, setCountries] = useState<CountryCount[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { toast, toastNode } = useToasts();
  const seq = useRef(0);

  useEffect(() => {
    if (ready) setSearchInput(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useDebouncedCommit(searchInput, (q) => {
    if (ready) setFilters((f) => (f.q === q ? f : { ...f, q, page: 1 }));
  });

  const buildParams = useCallback((f: Filters) => {
    const p = new URLSearchParams({ sort: f.sort, order: f.order });
    (['q', 'country', 'match', 'status'] as const).forEach((k) => {
      if (f[k]) p.set(k, f[k]);
    });
    applyRange(p, f.range, f.from, f.to);
    return p;
  }, []);

  const load = useCallback(async () => {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const id = ++seq.current;
    setLoading(true);
    setLoadError(null);
    const p = buildParams(filters);
    p.set('page', String(filters.page));
    p.set('limit', String(filters.limit));
    try {
      const res = await api<{
        data?: { users?: ComplianceUser[]; kpis?: Kpis; countries?: CountryCount[]; meta?: { total?: number; pages?: number } };
      }>(`/admin/user-location-compliance?${p.toString()}`, tok);
      if (id !== seq.current) return;
      const pages = Math.max(1, Number(res.data?.meta?.pages ?? 1));
      setUsers(res.data?.users ?? []);
      setKpis(res.data?.kpis ?? {});
      setCountries(res.data?.countries ?? []);
      setTotal(Number(res.data?.meta?.total ?? 0));
      setTotalPages(pages);
      if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
    } catch (err) {
      if (id !== seq.current) return;
      setLoadError(errorText(err, 'Failed to load compliance records'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters, buildParams, setFilters]);

  useEffect(() => {
    if (ready && token) void load();
  }, [ready, token, load]);

  function onSort(column: string, defaultOrder: 'asc' | 'desc') {
    if (filters.sort === column) update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    else update({ sort: column, order: defaultOrder });
  }

  function resetAll() {
    setSearchInput('');
    reset();
  }

  async function handleExport() {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    setExporting(true);
    try {
      const res = await api<{ data?: string } | string>(`/admin/user-location-compliance/export?${buildParams(filters).toString()}`, tok);
      await downloadCsv(typeof res === 'string' ? res : res.data ?? '', `user-location-compliance-${ymd(new Date())}.csv`);
      toast('success', `Exported ${fmt(Math.min(total, 20000))} accounts`);
    } catch (err) {
      toast('error', errorText(err, 'Failed to export CSV'));
    } finally {
      setExporting(false);
    }
  }

  const topCountries = useMemo(() => countries.filter((c) => c.code !== 'UNKNOWN').slice(0, 10), [countries]);
  const sortValue = `${filters.sort}:${filters.order}`;
  const sortKnown = SORTS.some((s) => s.value === sortValue);

  return (
    <main className="ad-page">
      <AdminStyles />

      <div className="ad-header">
        <div>
          <h1>User Location Compliance</h1>
          <p>
            Where accounts really are. Profile country is what the user chose; client country comes from their device/network. The effective country
            (client first, then profile) is used for audit and tax reporting.
          </p>
        </div>
        <div className="ad-header-actions">
          <button type="button" className="ad-btn ad-btn-export ad-btn-lg" onClick={() => void handleExport()} disabled={exporting || total === 0}>
            {exporting ? 'Exporting…' : `Export CSV${isDirty ? ' (filtered)' : ''}`}
          </button>
        </div>
      </div>

      <div className="ad-kpis">
        <div className="ad-kpi is-clickable" onClick={resetAll} title="Show all accounts">
          <div className="ad-kpi-label">Tracked accounts</div>
          <div className="ad-kpi-value">{fmt(kpis.total_tracked_users)}</div>
          <div className="ad-kpi-sub">excluding deactivated</div>
        </div>
        <div className="ad-kpi">
          <div className="ad-kpi-label">Countries detected</div>
          <div className="ad-kpi-value tone-indigo">{fmt(kpis.countries_detected)}</div>
          <div className="ad-kpi-sub">by effective country</div>
        </div>
        <div className="ad-kpi is-clickable" onClick={() => update({ match: 'mismatch' })} title="Show mismatched accounts">
          <div className="ad-kpi-label">Country mismatch</div>
          <div className={`ad-kpi-value ${kpis.mismatches ? 'tone-amber' : ''}`}>{fmt(kpis.mismatches)}</div>
          <div className="ad-kpi-sub">profile ≠ client country</div>
        </div>
        <div className="ad-kpi is-clickable" onClick={() => update({ country: 'UNKNOWN' })} title="Show accounts with no location">
          <div className="ad-kpi-label">Unknown location</div>
          <div className={`ad-kpi-value ${kpis.unknown ? 'tone-red' : ''}`}>{fmt(kpis.unknown)}</div>
          <div className="ad-kpi-sub">no profile or client country</div>
        </div>
      </div>

      <div className="ad-card">
        <Tabs
          value={filters.match}
          onChange={(v) => update({ match: v })}
          tabs={[
            { value: '', label: 'All accounts' },
            { value: 'mismatch', label: 'Country mismatch', count: kpis.mismatches, tone: 'amber' },
            { value: 'match', label: 'Consistent', tone: 'green' },
            { value: 'missing', label: 'Missing data', tone: 'red' },
          ]}
        />

        {topCountries.length > 0 && (
          <div className="ad-range-row">
            <span className="ad-sub" style={{ fontWeight: 600 }}>Top countries:</span>
            <div className="ad-chips">
              {topCountries.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`ad-chip ${filters.country === c.code ? 'is-active' : ''}`}
                  onClick={() => update({ country: filters.country === c.code ? '' : c.code })}
                  title={countryName(c.code)}
                >
                  {flag(c.code)} {c.code} · {fmt(c.count)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ad-toolbar">
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            onEnter={() => update({ q: searchInput.trim() })}
            placeholder="Search name, email, phone or #ID…"
          />
          <label className="ad-field">
            <span>Country</span>
            <select value={filters.country} onChange={(e) => update({ country: e.target.value })}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code === 'UNKNOWN' ? 'Unknown' : `${countryName(c.code)} (${c.code})`} · {fmt(c.count)}
                </option>
              ))}
              {filters.country && !countries.some((c) => c.code === filters.country) && (
                <option value={filters.country}>{countryName(filters.country)}</option>
              )}
            </select>
          </label>
          <label className="ad-field">
            <span>Account status</span>
            <select value={filters.status} onChange={(e) => update({ status: e.target.value as Filters['status'] })}>
              <option value="">Active + suspended</option>
              <option value="active">Active only</option>
              <option value="suspended">Suspended only</option>
              <option value="deactivated">Deactivated</option>
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

        <div className="ad-range-row" style={{ paddingTop: 0 }}>
          <span className="ad-sub" style={{ fontWeight: 600 }}>Registered:</span>
          <DateRangeChips range={filters.range} from={filters.from} to={filters.to} onChange={(patch) => update(patch)} />
        </div>

        <div className="ad-summary" style={{ paddingTop: 12 }}>
          {loading ? 'Loading…' : (
            <>
              <strong>{fmt(total)}</strong> account{total === 1 ? '' : 's'}
              {filters.country ? <> in {filters.country === 'UNKNOWN' ? 'unknown location' : countryName(filters.country)}</> : null}
              {filters.q ? <> matching “{filters.q}”</> : null}
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
                <SortTh column="name" label="User" sort={filters.sort} order={filters.order} onSort={onSort} defaultOrder="asc" />
                <th className="ad-th">Profile country</th>
                <th className="ad-th">Client country</th>
                <SortTh column="country" label="Effective" sort={filters.sort} order={filters.order} onSort={onSort} defaultOrder="asc" />
                <SortTh column="coins" label="Coins" sort={filters.sort} order={filters.order} onSort={onSort} align="right" />
                <th className="ad-th">Status</th>
                <SortTh column="created_at" label="Registered" sort={filters.sort} order={filters.order} onSort={onSort} />
              </tr>
            </thead>
            <tbody className={loading && users.length > 0 ? 'is-loading' : ''}>
              {loading && users.length === 0 ? (
                <SkeletonRows cols={7} />
              ) : users.length === 0 ? (
                <EmptyRow cols={7} title="No accounts found" hint="Try another country or clear filters." onReset={isDirty ? resetAll : undefined} />
              ) : (
                users.map((u) => {
                  const status = u.status ?? (u.account_status === 'deleted' ? 'deactivated' : u.account_status === 'suspended' ? 'suspended' : 'active');
                  const name = u.name || `User #${u.id}`;
                  return (
                    <tr key={u.id} className="ad-row">
                      <td className="ad-td">
                        <div className="ad-user" style={{ maxWidth: 320 }}>
                          <Avatar name={name} url={u.avatar_url} />
                          <div style={{ minWidth: 0 }}>
                            <div className="ad-name" title={name}>{name}</div>
                            <div className="ad-sub" title={u.email ?? u.phone ?? ''}>
                              <Link href={`/users?q=%23${u.id}`} className="ad-link" title="Open in User Management">ID {u.id}</Link>
                              {' · '}
                              {u.email ?? u.phone ?? 'No contact'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="ad-td ad-nowrap" title={countryName(u.profile_country)}>
                        {u.profile_country ? <>{flag(u.profile_country)} {u.profile_country}</> : <span className="ad-hint">—</span>}
                      </td>
                      <td className="ad-td ad-nowrap" title={countryName(u.client_country)}>
                        {u.client_country ? <>{flag(u.client_country)} {u.client_country}</> : <span className="ad-hint">—</span>}
                        {u.country_mismatch && (
                          <span className="ad-badge amber" style={{ marginLeft: 8 }} title="Profile country differs from device/network country">
                            ⚠ Mismatch
                          </span>
                        )}
                      </td>
                      <td className="ad-td ad-nowrap">
                        <button
                          type="button"
                          className="ad-link"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => update({ country: u.effective_country === 'Unknown' ? 'UNKNOWN' : u.effective_country.toUpperCase() })}
                          title={`Show all accounts in ${countryName(u.effective_country)}`}
                        >
                          <span className={`ad-badge ${u.effective_country === 'Unknown' ? 'gray' : 'indigo'}`} style={{ textTransform: 'none' }}>
                            {flag(u.effective_country)} {countryName(u.effective_country)}
                          </span>
                        </button>
                      </td>
                      <td className="ad-td ad-num" style={{ fontWeight: 600, color: '#b45309' }}>🪙 {fmt(u.coin_balance)}</td>
                      <td className="ad-td"><span className={`ad-badge ${STATUS_BADGE[status]}`}>{status}</span></td>
                      <td className="ad-td ad-nowrap">{formatDate(u.registered_at)}</td>
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

      {toastNode}
    </main>
  );
}
