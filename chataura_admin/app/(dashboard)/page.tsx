'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

import { useAdminAuth } from '@/hooks/useAdminAuth';

type Dash = {
  users: number;
  live_rooms: number;
  coin_burn_today: number;
  recharge_today: number;
  revenue_today?: number;
  revenue_this_week?: number;
  coin_tx_count?: number;
  gross_volume?: number;
  net_volume?: number;
  commission_total?: number;
  gift_volume?: number;
  admin_credits?: number;
  reports: number;
  pending_withdrawals: number;
  recent_commissions?: { date: string; transactions: number; commission: number }[];
};

function StatCard({ title, value, subtext }: { title: string; value: string | number; subtext?: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      border: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>
        {value}
      </div>
      {subtext && (
        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, loading } = useAdminAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    void api<{ success: boolean; data?: Dash; error?: { message?: string } }>(
      '/admin/dashboard',
      token,
    ).then((json) => {
      if (!json.success) {
        setError(json.error?.message ?? 'Unauthorized');
        if (json.error?.message) router.replace('/login');
        return;
      }
      setData(json.data ?? null);
    }).catch(err => {
      console.error(err);
      setError('Network Error');
    });
  }, [token, router]);

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Dashboard</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Live production analytics for operations, finance, and moderation.</p>
        </div>
      </div>

      {error ? <p className="err">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard
            title="REVENUE (TODAY)"
            value={data ? `$${(data.revenue_today ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'}
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard
            title="REVENUE (THIS WEEK)"
            value={data ? `$${(data.revenue_this_week ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'}
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard 
            title="COIN BURN (TODAY)" 
            value={data ? (data.coin_burn_today ?? 0).toLocaleString() : '...'} 
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard 
            title="TOTAL USERS" 
            value={data ? data.users.toLocaleString() : '...'} 
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="ACTIVE ROOMS" value={data ? data.live_rooms.toLocaleString() : '...'} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="RECHARGE COINS (TODAY)" value={data ? (data.recharge_today ?? 0).toLocaleString() : '...'} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Commission Trend Table */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 20px 0' }}>Recent commission activity</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Transactions</th>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Commission</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_commissions && data.recent_commissions.length > 0 ? (
                data.recent_commissions.map((item) => (
                  <tr key={item.date}>
                    <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>{item.date}</td>
                    <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>{item.transactions.toLocaleString()}</td>
                    <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{item.commission.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af' }}>
                    {data ? 'No recent transactions recorded' : 'Loading analytics...'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Platform Flow Snapshot */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 20px 0' }}>Platform flow snapshot</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Coin tx count</span><strong style={{ color: '#111827' }}>{data ? (data.coin_tx_count ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Gross volume</span><strong style={{ color: '#111827' }}>{data ? (data.gross_volume ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Net volume</span><strong style={{ color: '#111827' }}>{data ? (data.net_volume ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Commission total</span><strong style={{ color: '#111827' }}>{data ? (data.commission_total ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Gift volume</span><strong style={{ color: '#111827' }}>{data ? (data.gift_volume ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Admin credits</span><strong style={{ color: '#111827' }}>{data ? (data.admin_credits ?? 0).toLocaleString() : '...'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Feedback items</span><strong style={{ color: '#111827' }}>{data?.reports ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Pending withdrawals</span><strong style={{ color: '#111827' }}>{data?.pending_withdrawals ?? 0}</strong>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
