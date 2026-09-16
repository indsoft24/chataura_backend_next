'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Pack = {
  id: number;
  audience: string;
  coins: number;
  currency: string;
  price: number;
  original_price: number | null;
  is_active: boolean;
};

export default function PackagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Pack[]>([]);
  const [coins, setCoins] = useState('100');
  const [price, setPrice] = useState('99');
  const [originalPrice, setOriginalPrice] = useState('149');
  const [currency, setCurrency] = useState('INR');
  const [audience, setAudience] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { packages: Pack[] } }>(
        '/admin/packages',
        token,
      );
      setRows(json.data?.packages ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function create() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>(
        '/admin/packages',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            coins: Number(coins),
            price: Number(price),
            original_price: originalPrice ? Number(originalPrice) : undefined,
            currency,
            audience,
          }),
        },
      );
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setError('');
      void load(token);
    } catch (e) {
      setError('Network Error');
    }
  }

  async function toggleActive(id: number, current: boolean) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/packages/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deletePackage(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to permanently delete this package?')) return;
    try {
      await api(`/admin/packages/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Coin Packages</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create, update, toggle availability, and delete coin recharge packages.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Package</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Coins</div>
            <input placeholder="100" value={coins} onChange={(e) => setCoins(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Price</div>
            <input placeholder="99" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Original Price</div>
            <input placeholder="149" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} style={{ width: '100px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Currency</div>
            <input placeholder="INR" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: '90px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Audience</div>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.95rem', margin: 0, height: '42px' }}>
              <option value="user">User</option>
              <option value="coin_seller">Coin Seller</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Package
            </button>
          </div>
        </div>
        {error ? <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p> : null}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>ID</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Audience</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Coins</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'center' }}>Active</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading packages...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No packages found.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', color: '#4b5563', fontSize: '0.9rem' }}>#{p.id}</td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: p.audience === 'user' ? '#e0e7ff' : '#fef3c7', color: p.audience === 'user' ? '#3730a3' : '#92400e', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {p.audience.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700, color: '#111827' }}>🪙 {p.coins.toLocaleString()}</td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                      {p.price} {p.currency}
                      {p.original_price && <span style={{ marginLeft: '6px', fontSize: '0.8rem', color: '#9ca3af', textDecoration: 'line-through' }}>{p.original_price}</span>}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: p.is_active ? '#d1fae5' : '#fee2e2', color: p.is_active ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void toggleActive(p.id, p.is_active)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: p.is_active ? '#fef3c7' : '#d1fae5',
                            color: p.is_active ? '#92400e' : '#047857',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            width: 'auto',
                          }}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePackage(p.id)}
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
                          Delete
                        </button>
                      </div>
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
