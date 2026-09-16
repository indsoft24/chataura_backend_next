'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Sticker = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  animation_url: string | null;
  is_active: boolean;
};

export default function StickersPage() {
  const router = useRouter();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [animationUrl, setAnimationUrl] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { stickers: Sticker[] } }>('/admin/stickers', token);
      setStickers(json.data?.stickers ?? []);
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
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/stickers', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          coin_cost: Number(coinCost),
          image_url: imageUrl.trim() || undefined,
          animation_url: animationUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setError('');
      setName('');
      setImageUrl('');
      setAnimationUrl('');
      void load(token);
    } catch (e) {
      setError('Network Error');
    }
  }

  async function toggleActive(id: number, current: boolean) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/stickers/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteSticker(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this sticker?')) return;
    try {
      await api(`/admin/stickers/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Chat Stickers Catalog</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Manage emoticons, expressive animations, and room chat sticker packs.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Sticker</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Sticker Name</div>
            <input placeholder="e.g. Laughing Emoji" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '180px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</div>
            <input type="number" placeholder="10" value={coinCost} onChange={(e) => setCoinCost(e.target.value)} style={{ width: '100px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Static Image URL</div>
            <input placeholder="https://.../sticker.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Animation / Lottie URL</div>
            <input placeholder="https://.../anim.json (optional)" value={animationUrl} onChange={(e) => setAnimationUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Sticker
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading stickers...</p>
      ) : stickers.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No stickers configured yet. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {stickers.map((s) => (
            <div key={s.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>😀</span>
                )}
              </div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1rem', marginBottom: '4px', textAlign: 'center' }}>{s.name}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.85rem' }}>
                {s.coin_cost > 0 ? `🪙 ${s.coin_cost} Coins` : 'Free'}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(s.id, s.is_active)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.75rem',
                    background: s.is_active ? '#d1fae5' : '#fee2e2',
                    color: s.is_active ? '#065f46' : '#991b1b',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {s.is_active ? 'Active' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSticker(s.id)}
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
