'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Withdrawal = {
  id: number;
  user_id: number;
  amount: string | number;
  currency: string;
  source: string;
  status: string;
  note: string | null;
  created_at: string;
  user?: {
    id: number;
    name: string;
  };
};

export default function WithdrawalsPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<number | null>(null);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { withdrawals: Withdrawal[] } }>('/admin/withdrawals', tok);
      setWithdrawals(json.data?.withdrawals ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void load(token);
    }
  }, [token]);

  async function handleAction(id: number, action: 'approve' | 'reject') {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setProcessingId(id);
    try {
      await api(`/admin/withdrawals/${id}/${action}`, token, { method: 'POST' });
      void load(token);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = withdrawals.filter((w) => {
    if (filter === 'all') return true;
    return w.status === filter;
  });

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Withdrawal Requests</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Review, approve, and process coin cashout requests from users.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: filter === tab ? '1px solid #3b82f6' : '1px solid #e5e7eb',
              background: filter === tab ? '#eff6ff' : '#fff',
              color: filter === tab ? '#1d4ed8' : '#4b5563',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab} ({tab === 'all' ? withdrawals.length : withdrawals.filter((w) => w.status === tab).length})
          </button>
        ))}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Date</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>User</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Source</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading requests...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No withdrawal requests found.</td></tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{w.user?.name ?? `User #${w.user_id}`}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>ID: #{w.user_id}</div>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700, color: '#10b981', fontSize: '1.05rem' }}>
                      {Number(w.amount).toFixed(2)} {w.currency}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {w.source}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: w.status === 'pending' ? '#fef3c7' : w.status === 'approved' || w.status === 'success' ? '#d1fae5' : '#fee2e2',
                        color: w.status === 'pending' ? '#92400e' : w.status === 'approved' || w.status === 'success' ? '#065f46' : '#991b1b',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {w.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      {w.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            disabled={processingId === w.id}
                            onClick={() => void handleAction(w.id, 'approve')}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.8rem',
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              width: 'auto',
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={processingId === w.id}
                            onClick={() => void handleAction(w.id, 'reject')}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.8rem',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              width: 'auto',
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
