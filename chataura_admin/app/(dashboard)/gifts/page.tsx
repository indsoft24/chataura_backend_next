'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Gift = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  animation_url: string | null;
  is_active: boolean;
};

export default function GiftsPage() {
  const router = useRouter();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('50');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<any>('/admin/gifts', token);
      const list = Array.isArray(json.data) ? json.data : (json.data?.gifts ?? []);
      setGifts(list);
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
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/gifts', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          coin_cost: Number(coinCost),
          image_url: imageUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setError('');
      setName('');
      setImageUrl('');
      void load(token);
    } catch (e) {
      setError('Network Error');
    }
  }

  async function toggleActive(id: number, current: boolean) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/gifts/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteGift(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this virtual gift?')) return;
    try {
      await api(`/admin/gifts/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Virtual Gifts Catalog</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create, update, toggle availability, and remove virtual gifts available in live rooms.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Gift</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Name</div>
            <input placeholder="e.g. Diamond Ring" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '180px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</div>
            <input type="number" placeholder="50" value={coinCost} onChange={(e) => setCoinCost(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Image URL</div>
            <input placeholder="https://.../gift.png (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Gift
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading gifts...</p>
      ) : gifts.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No gifts found. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {gifts.map((g) => (
            <div key={g.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '12px', background: '#f3f4f6', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {g.image_url ? (
                  <img src={g.image_url} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>🎁</span>
                )}
              </div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{g.name}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.95rem' }}>🪙 {g.coin_cost.toLocaleString()} Coins</div>
              <div style={{ marginTop: '12px', width: '100%' }}>
                <span style={{ display: 'block', textAlign: 'center', padding: '4px 0', borderRadius: '6px', background: g.is_active ? '#d1fae5' : '#fee2e2', color: g.is_active ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {g.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(g.id, g.is_active)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.75rem',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {g.is_active ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteGift(g.id)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
