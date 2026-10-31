'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Avatar, EmptyRow, Field, Kpi, PageHeader, Section, fmt } from '@/components/admin-ui';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { AdminTier, TIER_LABEL, TIER_RANK, readTier } from '@/lib/tier';

type Overview = {
  total_users: number;
  new_users_in_range: number;
  active_rooms: number;
  calls_in_range: number;
  content_posts_in_range: number;
  feedback_in_range: number;
  reports_in_range: number;
};

type RevenueData = {
  today: number;
  this_week: number;
  current_period: number;
  previous_period: number;
  growth_percent: number;
};

type CommissionData = {
  current_period: number;
  previous_period: number;
  growth_percent: number;
};

type FinanceData = {
  tx_count: number;
  gross_volume: number;
  net_volume: number;
  commission: number;
  gift_volume: number;
  call_volume: number;
  admin_credit_volume: number;
  game_volume: number;
  game_win_volume: number;
};

type CallCommissionData = {
  total_calls: number;
  caller_charged: number;
  creator_paid: number;
  platform_commission_accrued: number;
};

type SystemUser = {
  id: number;
  name: string;
  email: string | null;
  wallet_balance: number;
  coin_balance: number;
} | null;

type CommissionDay = {
  bucket: string;
  tx_count: number;
  commission: number;
  gross_volume: number;
};

type TopUser = {
  rank: number;
  user_id: number;
  user_name: string;
  user_email: string | null;
  avatar_url: string | null;
  tx_count: number;
  commission_total: number;
};

type RechargePurchase = {
  status: string;
  tx_count: number;
  total_coins: number;
  total_amount: number;
};

type WithdrawalRecord = {
  status: string;
  request_count: number;
  total_gems: number;
};

type DashboardData = {
  period: 'daily' | 'weekly' | 'monthly';
  from: string;
  to: string;
  overview: Overview;
  revenue: RevenueData;
  commission: CommissionData;
  finance: FinanceData;
  callCommission: CallCommissionData;
  systemUser: SystemUser;
  commissionByDay: CommissionDay[];
  topUsersByCommission: TopUser[];
  recharge: {
    coin_purchase: RechargePurchase[];
  };
  withdrawals: WithdrawalRecord[];
  // Legacy backward compatible fields
  users: number;
  live_rooms: number;
  coin_burn_today: number;
  recharge_today: number;
  revenue_today: number;
  revenue_this_week: number;
  coin_tx_count: number;
  gross_volume: number;
  net_volume: number;
  commission_total: number;
  gift_volume: number;
  admin_credits: number;
  reports: number;
  pending_withdrawals: number;
};

const money = (n?: number) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctBadge = (n: number, suffix = '') => (
  <span className={`cp-badge ${n >= 0 ? 'green' : 'red'}`}>{n >= 0 ? '+' : ''}{n}%{suffix}</span>
);
const STATUS_TONE: Record<string, string> = { success: 'green', approved: 'green', paid: 'green', pending: 'amber', failed: 'red', rejected: 'red' };

export default function DashboardPage() {
  // Revenue analytics are CEO+ (the API refuses lower tiers); everyone else gets a plain home page.
  const [tier, setTier] = useState<AdminTier | null | undefined>(undefined);
  useEffect(() => setTier(readTier()), []);
  if (tier === undefined) return null;
  if (!tier || TIER_RANK[tier] < TIER_RANK.ceo) {
    return (
      <main className="cp-page">
        <PageHeader
          title="Dashboard"
          subtitle={`Signed in as ${tier ? TIER_LABEL[tier] : 'staff'}. Pick a page from the menu to get started.`}
        />
      </main>
    );
  }
  return <RevenueDashboard />;
}

function RevenueDashboard() {
  const { token } = useAdminAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function loadData(targetPeriod = period, targetFrom = from, targetTo = to) {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (targetPeriod) params.set('period', targetPeriod);
      if (targetFrom) params.set('from', targetFrom);
      if (targetTo) params.set('to', targetTo);

      const json = await api<{ success: boolean; data?: DashboardData; error?: { message?: string } }>(
        `/admin/dashboard?${params.toString()}`,
        token,
      );
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load analytics');
        return;
      }
      setData(json.data);
      if (!targetFrom && json.data.from) setFrom(json.data.from);
      if (!targetTo && json.data.to) setTo(json.data.to);
    } catch (err: any) {
      console.error(err);
      setError('Network error connecting to backend API');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const handlePeriodChange = (p: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(p);
    setFrom('');
    setTo('');
    loadData(p, '', '');
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(period, from, to);
  };

  const handleResetFilter = () => {
    setPeriod('weekly');
    setFrom('');
    setTo('');
    loadData('weekly', '', '');
  };

  const revGrowth = data?.revenue?.growth_percent ?? 0;
  const maxCommissionDay = data?.commissionByDay && data.commissionByDay.length > 0
    ? Math.max(...data.commissionByDay.map((c) => c.commission), 1)
    : 1;

  const days = data?.commissionByDay ?? [];
  const top = data?.topUsersByCommission ?? [];
  const fin = data?.finance;
  const ov = data?.overview;

  return (
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: DASH_STYLES }} />
      <PageHeader title="Dashboard" subtitle="Platform revenue, live activity and coin flow for the selected period." />

      <form className="cp-card db-range" onSubmit={handleApplyFilter}>
        <div className="cp-seg" role="group" aria-label="Period">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <button type="button" key={p} className={`cp-seg-btn ${period === p ? 'is-active' : ''}`} onClick={() => handlePeriodChange(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="db-dates">
          <Field label="From"><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="db-range-actions">
          <button type="button" className="cp-btn cp-btn-ghost cp-btn-lg" onClick={handleResetFilter}>Reset</button>
          <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg" disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button>
        </div>
      </form>

      {error ? <div className="cp-alert is-flush" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="cp-kpis db-kpis">
        <Kpi label="Revenue" value={data ? money(data.revenue?.current_period) : '—'} badge={data ? pctBadge(revGrowth) : undefined} sub={`Previous period ${money(data?.revenue?.previous_period)}`} tone="green" />
        <Kpi label="Today" value={data ? money(data.revenue?.today) : '—'} sub={`This week ${money(data?.revenue?.this_week)}`} badge={<span className="cp-badge indigo">Live</span>} />
        <Kpi label="Commission" value={data ? fmt(data.commission?.current_period) : '—'} badge={data ? pctBadge(data.commission?.growth_percent ?? 0) : undefined} sub="Platform coins this period" tone="indigo" />
        <Kpi label="Users" value={data ? fmt(ov?.total_users) : '—'} sub={data ? `${fmt(ov?.new_users_in_range)} joined this period` : undefined} />
        <Kpi label="Live rooms" value={data ? fmt(ov?.active_rooms) : '—'} badge={<span className="cp-badge indigo">Live</span>} sub="Party rooms broadcasting" />
        <Kpi label="Content" value={data ? fmt(ov?.content_posts_in_range) : '—'} sub="Posts & reels in period" />
      </div>

      <div className="cp-grid-2-1" style={{ marginBottom: 20 }}>
        <Section
          title="Commission by day"
          subtitle="Admin-retained commission per day, with transaction count and gross volume."
          actions={<span className="cp-badge indigo">{days.length} days</span>}
        >
          {days.length ? (
            <div className="db-bars">
              {days.map((row) => (
                <div key={row.bucket} className="db-bar-row">
                  <div className="db-bar-date">{row.bucket.slice(5)}</div>
                  <div className="db-bar-main">
                    <div className="db-bar-track"><div className="db-bar-fill" style={{ width: `${Math.max(2, Math.round((row.commission / maxCommissionDay) * 100))}%` }} /></div>
                    <div className="db-bar-sub">{fmt(row.tx_count)} tx · gross {fmt(row.gross_volume)}</div>
                  </div>
                  <div className="db-bar-val">{fmt(row.commission)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cp-empty">{loading ? 'Loading commission trend…' : 'No transaction activity in this range.'}</div>
          )}
        </Section>

        <Section title="Coin flow" subtitle="Movement across the platform in this period.">
          <dl className="cp-kv">
            <div><dt>Coin transactions</dt><dd>{fmt(fin?.tx_count)}</dd></div>
            <div><dt>Gross volume</dt><dd>{fmt(fin?.gross_volume)}</dd></div>
            <div><dt>Net user volume</dt><dd className="tone-green">{fmt(fin?.net_volume)}</dd></div>
            <div><dt>Platform commission</dt><dd className="tone-indigo">{fmt(fin?.commission)}</dd></div>
            <div><dt>Gift volume</dt><dd className="tone-red">{fmt(fin?.gift_volume)}</dd></div>
            <div><dt>Mini-game bets</dt><dd className="tone-amber">{fmt(fin?.game_volume)}</dd></div>
            <div><dt>Admin / seller credits</dt><dd>{fmt(fin?.admin_credit_volume)}</dd></div>
            <div><dt>Posts & reels</dt><dd>{fmt(ov?.content_posts_in_range)}</dd></div>
            <div><dt>Feedback & reports</dt><dd className="tone-red">{fmt((ov?.feedback_in_range ?? 0) + (ov?.reports_in_range ?? 0))}</dd></div>
          </dl>
        </Section>
      </div>

      <div className="cp-grid-2" style={{ marginBottom: 20 }}>
        <Section title="System wallet" subtitle="Reserve account used for operational credits.">
          {data?.systemUser ? (
            <div className="db-wallet">
              <div style={{ minWidth: 0 }}>
                <div className="cp-name">{data.systemUser.name} <span className="cp-hint">#{data.systemUser.id}</span></div>
                <div className="cp-sub">{data.systemUser.email}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="cp-kpi-label">Reserve balance</div>
                <div className="db-wallet-val">🪙 {fmt(data.systemUser.coin_balance)}</div>
              </div>
            </div>
          ) : (
            <div className="cp-empty">{loading ? 'Loading…' : 'No system wallet configured.'}</div>
          )}
        </Section>

        <Section title="Recharges & withdrawals" subtitle="Payment outcomes and gem cash-out requests in this period.">
          <div className="db-health">
            <div>
              <div className="cp-kpi-label" style={{ marginBottom: 6 }}>Coin purchases</div>
              <dl className="cp-kv">
                {data?.recharge?.coin_purchase?.length ? data.recharge.coin_purchase.map((r) => (
                  <div key={r.status}>
                    <dt><span className={`cp-badge ${STATUS_TONE[r.status] ?? 'gray'}`}>{r.status}</span> <span className="cp-hint">{fmt(r.tx_count)} tx</span></dt>
                    <dd>{fmt(r.total_coins)}</dd>
                  </div>
                )) : <div><dt className="cp-hint">No purchases in range</dt></div>}
              </dl>
            </div>
            <div>
              <div className="cp-kpi-label" style={{ marginBottom: 6 }}>Gem withdrawals</div>
              <dl className="cp-kv">
                {data?.withdrawals?.length ? data.withdrawals.map((w) => (
                  <div key={w.status}>
                    <dt><span className={`cp-badge ${STATUS_TONE[w.status] ?? 'gray'}`}>{w.status}</span> <span className="cp-hint">{fmt(w.request_count)} req</span></dt>
                    <dd>{fmt(w.total_gems)}</dd>
                  </div>
                )) : <div><dt className="cp-hint">No withdrawal requests</dt></div>}
              </dl>
            </div>
          </div>
        </Section>
      </div>

      <Section
        title="Top users by commission"
        subtitle="Who generated the most platform revenue in this period."
        actions={<Link href="/users" className="cp-btn cp-btn-soft">All users →</Link>}
        bodyClassName=""
      >
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Rank</th>
                <th className="cp-th">User</th>
                <th className="cp-th cp-num">Transactions</th>
                <th className="cp-th cp-num">Commission</th>
                <th className="cp-th cp-num"></th>
              </tr>
            </thead>
            <tbody>
              {top.length ? top.map((u) => (
                <tr key={u.user_id} className="cp-row">
                  <td className="cp-td is-hide-sm"><span className={`db-rank r${u.rank}`}>{u.rank}</span></td>
                  <td className="cp-td is-main">
                    <div className="cp-user">
                      <span className={`db-rank r${u.rank} cp-mobile-only`}>{u.rank}</span>
                      <Avatar name={u.user_name} url={u.avatar_url} />
                      <div>
                        <Link href={`/users?q=${encodeURIComponent(String(u.user_id))}`} className="cp-name db-user-link">{u.user_name}</Link>
                        <div className="cp-sub">#{u.user_id}{u.user_email ? ` · ${u.user_email}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="cp-td cp-num" data-label="Transactions">{fmt(u.tx_count)}</td>
                  <td className="cp-td cp-num tone-indigo" data-label="Commission" style={{ fontWeight: 700 }}>🪙 {fmt(u.commission_total)}</td>
                  <td className="cp-td cp-num is-hide-sm">
                    <div className="cp-actions">
                      <Link href={`/users?q=${encodeURIComponent(String(u.user_id))}`} className="cp-btn cp-btn-ghost">View</Link>
                    </div>
                  </td>
                </tr>
              )) : (
                <EmptyRow cols={5} title={loading ? 'Calculating leaderboard…' : 'No ranking data'} hint={loading ? '' : 'Nobody generated commission in this range.'} />
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}

const DASH_STYLES = `
.db-range { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; padding: 14px 18px; }
.db-dates { display: grid; grid-template-columns: repeat(2, minmax(150px, 180px)); gap: 10px; }
.db-range-actions { display: flex; gap: 8px; margin-left: auto; }
.db-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.db-user-link { display: block; color: #111827; }
.db-user-link:hover { color: #4f46e5; }
.db-bars { display: grid; gap: 12px; }
.db-bar-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.db-bar-date { white-space: nowrap; font-weight: 700; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.db-bar-track { height: 10px; border-radius: 999px; background: #f1f2f6; overflow: hidden; }
.db-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #818cf8, #4f46e5); }
.db-bar-sub { font-size: 0.72rem; color: #9ca3af; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-bar-val { font-weight: 700; color: #4f46e5; font-variant-numeric: tabular-nums; font-size: 0.9rem; min-width: 80px; text-align: right; }
.db-wallet { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb; }
.db-wallet-val { font-size: 1.15rem; font-weight: 700; color: #059669; font-variant-numeric: tabular-nums; white-space: nowrap; }
.db-health { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.db-health .cp-kv dt { display: flex; align-items: center; gap: 6px; }
.db-rank { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; color: #6b7280; background: #f3f4f6; flex-shrink: 0; }
.db-rank.r1 { background: #fef3c7; color: #b45309; }
.db-rank.r2 { background: #e5e7eb; color: #374151; }
.db-rank.r3 { background: #fed7aa; color: #c2410c; }
@media (max-width: 640px) {
  .db-range { padding: 12px; gap: 10px; }
  .db-range .cp-seg { width: 100%; }
  .db-range .cp-seg-btn { flex: 1; }
  .db-dates { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  .db-range-actions { width: 100%; margin: 0; }
  .db-range-actions .cp-btn { flex: 1; }
  .db-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-bar-row { grid-template-columns: 46px minmax(0, 1fr) auto; gap: 10px; }
  .db-bar-val { min-width: 0; font-size: 0.84rem; }
  .db-health { grid-template-columns: minmax(0, 1fr); gap: 16px; }
}
`;
