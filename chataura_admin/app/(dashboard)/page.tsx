'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

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

function MetricCard({
  title,
  value,
  subtext,
  badge,
  badgeType = 'neutral',
}: {
  title: string;
  value: string | number;
  subtext?: React.ReactNode;
  badge?: string;
  badgeType?: 'positive' | 'negative' | 'neutral' | 'indigo';
}) {
  const badgeStyles = {
    positive: { bg: '#def7ec', color: '#03543f' },
    negative: { bg: '#fde8e8', color: '#9b1c1c' },
    neutral: { bg: '#f3f4f6', color: '#4b5563' },
    indigo: { bg: '#e0e7ff', color: '#3730a3' },
  }[badgeType];

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '22px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {badge && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 600,
              backgroundColor: badgeStyles.bg,
              color: badgeStyles.color,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {subtext && (
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
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

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header & Range Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
            Production Analytics & Operations
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Multi-source platform analytics, live telemetry, and financial ledger audit.
          </p>
        </div>

        {/* Date Filter Bar */}
        <form
          onSubmit={handleApplyFilter}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#fff',
            padding: '8px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            flexWrap: 'wrap',
          }}
        >
          {/* Quick Period Buttons */}
          <div style={{ display: 'flex', backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => handlePeriodChange(p)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  backgroundColor: period === p ? '#fff' : 'transparent',
                  color: period === p ? '#111827' : '#6b7280',
                  boxShadow: period === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>From:</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                width: '135px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>To:</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                width: '135px',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#1f2937',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {loading ? '...' : 'Apply'}
          </button>
          <button
            type="button"
            onClick={handleResetFilter}
            style={{
              padding: '6px 10px',
              fontSize: '0.8rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#4b5563',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </form>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '24px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* 6 Top Key Performance Indicator Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <MetricCard
          title="Revenue (Period)"
          value={data ? `$${(data.revenue?.current_period ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'}
          badge={data ? `${revGrowth >= 0 ? '+' : ''}${revGrowth}% vs prev` : undefined}
          badgeType={revGrowth >= 0 ? 'positive' : 'negative'}
          subtext={`Prev: $${(data?.revenue?.previous_period ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <MetricCard
          title="Revenue (Today)"
          value={data ? `$${(data.revenue?.today ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'}
          subtext={`Week: $${(data?.revenue?.this_week ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          badge="Live"
          badgeType="indigo"
        />
        <MetricCard
          title="Commission (Period)"
          value={data ? (data.commission?.current_period ?? 0).toLocaleString() : '...'}
          badge={data ? `${(data.commission?.growth_percent ?? 0) >= 0 ? '+' : ''}${data.commission?.growth_percent ?? 0}%` : undefined}
          badgeType={(data?.commission?.growth_percent ?? 0) >= 0 ? 'positive' : 'negative'}
          subtext="Net platform earnings (coins)"
        />
        <MetricCard
          title="Total Users"
          value={data ? data.overview?.total_users?.toLocaleString() ?? 0 : '...'}
          badge={data ? `+${data.overview?.new_users_in_range ?? 0} new` : undefined}
          badgeType="positive"
          subtext="Active platform accounts"
        />
        <MetricCard
          title="Active Live Rooms"
          value={data ? data.overview?.active_rooms?.toLocaleString() ?? 0 : '...'}
          badge="Live"
          badgeType="indigo"
          subtext="Party rooms with audio broadcast"
        />
        <MetricCard
          title="Content Created"
          value={data ? data.overview?.content_posts_in_range?.toLocaleString() ?? 0 : '...'}
          subtext="Posts and reels in selected range"
          badge="Media"
          badgeType="neutral"
        />
      </div>

      {/* Row 2: Commission Trend & Platform Flow Snapshot */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '28px' }}>
        {/* Commission Trend By Day */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#111827' }}>Commission Trend by Day</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
                Daily coin volume and admin retained commission in selected date range.
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4f46e5', backgroundColor: '#eef2ff', padding: '4px 10px', borderRadius: 9999 }}>
              {data?.commissionByDay?.length ?? 0} Recorded Days
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 0' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Tx Count</th>
                  <th style={{ padding: '10px 12px' }}>Gross Volume</th>
                  <th style={{ padding: '10px 0', textAlign: 'right' }}>Commission</th>
                  <th style={{ padding: '10px 12px', width: '120px' }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {data?.commissionByDay && data.commissionByDay.length > 0 ? (
                  data.commissionByDay.map((row) => {
                    const pct = Math.round((row.commission / maxCommissionDay) * 100);
                    return (
                      <tr key={row.bucket} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '14px 0', fontWeight: 600, color: '#111827' }}>{row.bucket}</td>
                        <td style={{ padding: '14px 12px', color: '#4b5563' }}>{row.tx_count.toLocaleString()}</td>
                        <td style={{ padding: '14px 12px', color: '#4b5563' }}>{row.gross_volume.toLocaleString()}</td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 600, color: '#4f46e5' }}>
                          {row.commission.toLocaleString()}
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ width: '100%', backgroundColor: '#f3f4f6', height: '6px', borderRadius: 9999, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, backgroundColor: '#4f46e5', height: '100%' }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                      {loading ? 'Loading commission trend...' : 'No transaction activity in selected date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform Flow Snapshot */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 6px 0', color: '#111827' }}>Platform Flow Snapshot</h2>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: '#6b7280' }}>Global coin movement summary.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Total Coin Tx</span>
              <strong style={{ color: '#111827' }}>{(data?.finance?.tx_count ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Gross Volume</span>
              <strong style={{ color: '#111827' }}>{(data?.finance?.gross_volume ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Net User Volume</span>
              <strong style={{ color: '#059669' }}>{(data?.finance?.net_volume ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Platform Commission</span>
              <strong style={{ color: '#4f46e5' }}>{(data?.finance?.commission ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Gift Volume</span>
              <strong style={{ color: '#e11d48' }}>{(data?.finance?.gift_volume ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Mini-Games Bets</span>
              <strong style={{ color: '#d97706' }}>{(data?.finance?.game_volume ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Admin / Seller Credits</span>
              <strong style={{ color: '#111827' }}>{(data?.finance?.admin_credit_volume ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
              <span style={{ color: '#4b5563' }}>Posts & Reels Created</span>
              <strong style={{ color: '#111827' }}>{(data?.overview?.content_posts_in_range ?? 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#4b5563' }}>Feedback & User Reports</span>
              <strong style={{ color: '#dc2626' }}>
                {((data?.overview?.feedback_in_range ?? 0) + (data?.overview?.reports_in_range ?? 0)).toLocaleString()}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: System Wallet & Call Telemetry vs Recharge & Withdrawal Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
        {/* System Wallet Reserve */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 6px 0', color: '#111827' }}>System Wallet Reserve</h2>
          <p style={{ margin: '0 0 18px 0', fontSize: '0.82rem', color: '#6b7280' }}>
            Platform reserve account balance used for operational credits.
          </p>

          {data?.systemUser && (
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem' }}>
                    {data.systemUser.name} <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>#{data.systemUser.id}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{data.systemUser.email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Reserve Balance</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#059669' }}>
                    {data.systemUser.coin_balance.toLocaleString()} coins
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recharge & Withdrawal Health */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 6px 0', color: '#111827' }}>Recharge & Withdrawal Health</h2>
          <p style={{ margin: '0 0 18px 0', fontSize: '0.82rem', color: '#6b7280' }}>
            Payment processing success and gem cash-out requests.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Purchases */}
            <div>
              <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 8px 0', fontWeight: 600 }}>
                Coin Purchases
              </h3>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    {data?.recharge?.coin_purchase && data.recharge.coin_purchase.length > 0 ? (
                      data.recharge.coin_purchase.map((r) => (
                        <tr key={r.status} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 10px', textTransform: 'uppercase', fontWeight: 600 }}>
                            <span style={{ color: r.status === 'success' ? '#059669' : '#d97706' }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                            {r.tx_count} tx
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                            {r.total_coins.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#9ca3af' }}>
                          No purchases in range
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Withdrawals */}
            <div>
              <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 8px 0', fontWeight: 600 }}>
                Gems Withdrawals
              </h3>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    {data?.withdrawals && data.withdrawals.length > 0 ? (
                      data.withdrawals.map((w) => (
                        <tr key={w.status} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 10px', textTransform: 'uppercase', fontWeight: 600 }}>
                            <span style={{ color: w.status === 'approved' ? '#059669' : w.status === 'pending' ? '#d97706' : '#dc2626' }}>
                              {w.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                            {w.request_count} req
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                            {w.total_gems.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#9ca3af' }}>
                          No withdrawal records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Top Users by Generated Commission (Leaderboard) */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#111827' }}>
              Top Creators & Users by Generated Commission
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
              Ranked leaderboard of users driving the highest platform revenue.
            </p>
          </div>
          <Link
            href="/users"
            style={{
              fontSize: '0.82rem',
              color: '#4f46e5',
              fontWeight: 600,
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#eef2ff',
            }}
          >
            Manage All Users →
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', width: '70px' }}>Rank</th>
                <th style={{ padding: '12px 16px' }}>User</th>
                <th style={{ padding: '12px 16px' }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Transactions</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Commission Generated</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.topUsersByCommission && data.topUsersByCommission.length > 0 ? (
                data.topUsersByCommission.map((u) => {
                  const rankBadgeBg = u.rank === 1 ? '#fef3c7' : u.rank === 2 ? '#f3f4f6' : u.rank === 3 ? '#fed7aa' : 'transparent';
                  const rankBadgeColor = u.rank === 1 ? '#b45309' : u.rank === 2 ? '#4b5563' : u.rank === 3 ? '#c2410c' : '#6b7280';
                  return (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '28px',
                            height: '28px',
                            lineHeight: '28px',
                            textAlign: 'center',
                            borderRadius: '50%',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            backgroundColor: rankBadgeBg,
                            color: rankBadgeColor,
                          }}
                        >
                          #{u.rank}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              backgroundColor: '#e0e7ff',
                              color: '#3730a3',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              overflow: 'hidden',
                            }}
                          >
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              (u.user_name || 'U').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{u.user_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: #{u.user_id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#4b5563', fontSize: '0.85rem' }}>
                        {u.user_email ?? '—'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: '#111827' }}>
                        {u.tx_count.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                        {u.commission_total.toLocaleString()} coins
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <Link
                          href={`/users?q=${encodeURIComponent(String(u.user_id))}`}
                          style={{
                            fontSize: '0.8rem',
                            color: '#4f46e5',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                    {loading ? 'Calculating leaderboard...' : 'No ranking data recorded for this range.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
