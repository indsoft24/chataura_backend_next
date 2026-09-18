'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type ComplianceUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  profile_country: string | null;
  client_country: string | null;
  effective_country: string;
  coin_balance: number;
  wallet_balance: number;
  account_status: string;
  registered_at: string;
};

export default function UserLocationCompliancePage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ComplianceUser[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(search ? { q: search } : {}),
        ...(countryFilter ? { country: countryFilter } : {}),
      });
      const res = await api<any>(`/admin/user-location-compliance?${params.toString()}`, token);
      setUsers(res.data?.users ?? []);
      setKpis(res.data?.kpis ?? {});
      setMeta(res.data?.meta ?? {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, page, countryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleExportCsv = async () => {
    if (!token) return;
    try {
      const res = await api<any>('/admin/user-location-compliance/export', token);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-location-compliance-${new Date().toISOString().split('T')[0]}.csv`;
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
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Location Compliance</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Multi-source location telemetry (GeoIP, client header, purchase geo, profile country) for audit and tax reporting.
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
          Export Compliance CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Tracked Active Accounts</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginTop: 4 }}>
            {kpis.total_tracked_users ?? 0}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Distinct Countries Detected</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
            {kpis.countries_detected ?? 0}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
        />
        <input
          type="text"
          placeholder="Filter country (e.g. IN)..."
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value.toUpperCase())}
          style={{ width: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
        />
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
              <th style={{ padding: '12px 16px' }}>USER</th>
              <th style={{ padding: '12px 16px' }}>PROFILE COUNTRY</th>
              <th style={{ padding: '12px 16px' }}>CLIENT COUNTRY</th>
              <th style={{ padding: '12px 16px' }}>EFFECTIVE COUNTRY</th>
              <th style={{ padding: '12px 16px' }}>COINS</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>REGISTERED</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading compliance records...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No matching user compliance records found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{u.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {u.id} • {u.email ?? u.phone ?? 'No contact'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{u.profile_country ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{u.client_country ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                      }}
                    >
                      {u.effective_country}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#ca8a04' }}>
                    {u.coin_balance.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: u.account_status === 'active' ? '#def7ec' : '#fde8e8',
                        color: u.account_status === 'active' ? '#03543f' : '#9b1c1c',
                      }}
                    >
                      {u.account_status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280' }}>
                    {new Date(u.registered_at).toLocaleDateString()}
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
              Page {meta.page} of {meta.pages} ({meta.total} users)
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
