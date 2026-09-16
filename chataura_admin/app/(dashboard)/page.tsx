'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Dash = {
  users: number;
  live_rooms: number;
  coin_burn_today: number;
  recharge_today: number;
  reports: number;
  pending_withdrawals: number;
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
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
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
  }, [router]);

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Dashboard</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Live production analytics for operations, finance, and moderation.</p>
        </div>
        
        {/* Mock Date Picker */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>Period</div>
            <select style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.9rem' }}>
              <option>Weekly</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>From</div>
            <input type="date" defaultValue="2026-09-14" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>To</div>
            <input type="date" defaultValue="2026-09-16" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', margin: 0 }} />
          </div>
          <button style={{ padding: '10px 16px', borderRadius: '8px', background: '#1c2536', color: '#fff', border: 'none', fontWeight: 600 }}>Apply</button>
          <button style={{ padding: '10px 16px', borderRadius: '8px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', fontWeight: 600 }}>Reset</button>
        </div>
      </div>

      {error ? <p className="err">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="REVENUE (TODAY)" value="8,785" />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="REVENUE (THIS WEEK)" value="87,830" />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard 
            title="REVENUE (SELECTED)" 
            value="87,830" 
            subtext={<span style={{ color: '#ef4444' }}>-94.71% vs previous period</span>} 
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard 
            title="TOTAL USERS" 
            value={data?.users ?? '...'} 
            subtext={<span style={{ color: '#10b981' }}>+76 in range</span>} 
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="ACTIVE ROOMS" value={data?.live_rooms ?? '...'} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <StatCard title="CALLS IN RANGE" value="0" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Commission Trend Table */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 20px 0' }}>Commission trend by day</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase' }}>Transactions</th>
                <th style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Commission</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>2026-09-14</td>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>236</td>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>38,353</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>2026-09-15</td>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>230</td>
                <td style={{ padding: '16px 0', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>40,692</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0' }}>2026-09-16</td>
                <td style={{ padding: '16px 0' }}>81</td>
                <td style={{ padding: '16px 0', textAlign: 'right' }}>8,785</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Platform Flow Snapshot */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 20px 0' }}>Platform flow snapshot</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Coin tx count</span><strong style={{ color: '#111827' }}>547</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Gross volume</span><strong style={{ color: '#111827' }}>4,732,493</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Net volume</span><strong style={{ color: '#111827' }}>5,641,979</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Commission</span><strong style={{ color: '#111827' }}>87,830</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Gift volume</span><strong style={{ color: '#111827' }}>175,746</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Call volume</span><strong style={{ color: '#111827' }}>0</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563', fontSize: '0.9rem' }}>
              <span>Admin credits</span><strong style={{ color: '#111827' }}>4,556,667</strong>
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
