'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Transaction = {
  id: number;
  user_id: number;
  user_name: string;
  type: string;
  amount: number;
  net_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
};

export default function TransactionsPage() {
  const { token } = useAdminAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(sourceFilter ? { source: sourceFilter } : {}),
        ...(search ? { q: search } : {}),
      });
      const res = await api<any>(`/admin/transactions?${params.toString()}`, token);
      setTransactions(res.data?.transactions ?? []);
      setAnalytics(res.data?.analytics ?? {});
      setMeta(res.data?.meta ?? {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, page, sourceFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleExportCsv = async () => {
    if (!token) return;
    try {
      const res = await api<any>('/admin/transactions/export', token);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert(err.message || 'Failed to export CSV');
    }
  };

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Financial Transactions</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Auditable platform ledger recording coin purchases, gifts, call charges, commissions, and withdrawals.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          style={{
            padding: '9px 18px',
            backgroundColor: '#059669',
            color: '#fff',
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Export Ledger CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Gross Coin Volume</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginTop: 4 }}>
            {(analytics.total_coins ?? 0).toLocaleString()}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Platform Commission Retained</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
            {(analytics.total_commission ?? 0).toLocaleString()}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Net Beneficiary Credits</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
            {(analytics.total_net ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by user name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
        />
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem' }}
        >
          <option value="">All Transaction Types</option>
          <option value="RECHARGE">Coin Recharges</option>
          <option value="GIFT">Gifts Sent/Received</option>
          <option value="CALL">Call Minutes Billing</option>
          <option value="ADMIN_CREDIT">Admin Credits</option>
          <option value="WITHDRAWAL">Withdrawals</option>
          <option value="COMMISSION">Staff Commissions</option>
        </select>
        <button
          type="submit"
          style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: '#1f2937', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Filter
        </button>
      </form>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>TXN ID</th>
              <th style={{ padding: '12px 16px' }}>USER</th>
              <th style={{ padding: '12px 16px' }}>TYPE</th>
              <th style={{ padding: '12px 16px' }}>GROSS AMOUNT</th>
              <th style={{ padding: '12px 16px' }}>COMMISSION</th>
              <th style={{ padding: '12px 16px' }}>NET CREDITED</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>DATE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading transaction ledger...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No transactions recorded yet.
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>#{t.id}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{t.user_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {t.user_id}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                      }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#ca8a04' }}>
                    {t.amount.toLocaleString()} coins
                  </td>
                  <td style={{ padding: '12px 16px', color: '#dc2626', fontWeight: 500 }}>
                    {t.commission_amount ? `-${t.commission_amount.toLocaleString()}` : '0'}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#059669' }}>
                    {t.net_amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: '#def7ec',
                        color: '#03543f',
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280' }}>
                    {new Date(t.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta.pages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Page {meta.page} of {meta.pages} ({meta.total} transactions)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={pageBtnStyle}
              >
                Previous
              </button>
              <button
                disabled={page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
                style={pageBtnStyle}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: '16px 20px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const pageBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  backgroundColor: '#fff',
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
};
