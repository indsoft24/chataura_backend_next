'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

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
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<Pack[]>([]);
  const [coins, setCoins] = useState('100');
  const [price, setPrice] = useState('99');
  const [originalPrice, setOriginalPrice] = useState('149');
  const [currency, setCurrency] = useState('INR');
  const [audience, setAudience] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [editCoins, setEditCoins] = useState('100');
  const [editPrice, setEditPrice] = useState('99');
  const [editOriginalPrice, setEditOriginalPrice] = useState('');
  const [editCurrency, setEditCurrency] = useState('INR');
  const [editAudience, setEditAudience] = useState('user');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { packages: Pack[] } }>(
        '/admin/packages',
        tok,
      );
      setRows(json.data?.packages ?? []);
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

  async function create() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setSubmitting(true);
    setError('');
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
      setCoins('100');
      setPrice('99');
      setOriginalPrice('149');
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(pack: Pack) {
    setEditingPack(pack);
    setEditCoins(String(pack.coins));
    setEditPrice(String(pack.price));
    setEditOriginalPrice(pack.original_price ? String(pack.original_price) : '');
    setEditCurrency(pack.currency);
    setEditAudience(pack.audience);
    setEditIsActive(pack.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingPack) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/packages/${editingPack.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          coins: Number(editCoins),
          price: Number(editPrice),
          original_price: editOriginalPrice ? Number(editOriginalPrice) : undefined,
          currency: editCurrency,
          audience: editAudience,
          is_active: editIsActive,
        }),
      });
      setEditModalOpen(false);
      setEditingPack(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update package');
    } finally {
      setEditSubmitting(false);
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
    if (!confirm('Are you sure you want to delete this coin package?')) return;
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Coin Recharge Packages</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Configure coin bundles, pricing, discounts, and target audiences for payment recharges.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Create Coin Package</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Target Audience</div>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}>
              <option value="user">Standard User</option>
              <option value="coin_seller">Authorized Seller</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coins Amount</div>
            <input type="number" placeholder="100" value={coins} onChange={(e) => setCoins(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Price</div>
            <input type="number" placeholder="99" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Original Price (Strike)</div>
            <input type="number" placeholder="149" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Currency</div>
            <input placeholder="INR" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <button type="button" onClick={() => void create()} disabled={submitting} style={{ width: '100%', padding: '10px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Creating...' : '+ Add Package'}
            </button>
          </div>
        </div>
        {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: '12px', marginBottom: 0 }}>⚠️ {error}</p>}
      </div>

      {/* Packages Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#111827' }}>Active Bundles ({rows.length})</h2>
        </div>

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
                            fontWeight: 500,
                          }}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: '#e0e7ff',
                            color: '#3730a3',
                            border: '1px solid #c7d2fe',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          ✏️ Edit
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
                            fontWeight: 600,
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

      {/* Edit Modal */}
      {editModalOpen && editingPack && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                Edit Package #{editingPack.id}
              </h2>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Target Audience</label>
              <select
                value={editAudience}
                onChange={(e) => setEditAudience(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                <option value="user">Standard User</option>
                <option value="coin_seller">Authorized Seller</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coins</label>
                <input
                  type="number"
                  value={editCoins}
                  onChange={(e) => setEditCoins(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Price</label>
                <input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Original Price</label>
                <input
                  type="number"
                  placeholder="Optional"
                  value={editOriginalPrice}
                  onChange={(e) => setEditOriginalPrice(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Currency</label>
                <input
                  type="text"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input
                type="checkbox"
                id="editPackActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editPackActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                Active & Visible on App Recharge Store
              </label>
            </div>

            {editError && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>⚠️ {editError}</p>}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={editSubmitting}
                style={{
                  padding: '9px 22px',
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: editSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
