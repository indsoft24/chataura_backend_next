'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Frame = {
  id: number;
  name: string;
  category: string;
  level_required: number;
  coin_cost: number | null;
  is_premium: boolean;
  is_active: boolean;
  image_url: string | null;
};

export default function FramesPage() {
  const router = useRouter();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('avatar');
  const [levelReq, setLevelReq] = useState('1');
  const [coinCost, setCoinCost] = useState('0');
  const [isPremium, setIsPremium] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames', token);
      setFrames(json.data?.frames ?? []);
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
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/frames', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          category,
          level_required: Number(levelReq),
          coin_cost: coinCost ? Number(coinCost) : null,
          is_premium: isPremium,
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
      await api(`/admin/frames/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteFrame(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this frame?')) return;
    try {
      await api(`/admin/frames/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Avatar Frames Catalog</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create, manage, and configure decorative profile & room avatar frames.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Avatar Frame</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Name</div>
            <input placeholder="e.g. Golden Crown" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '180px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.95rem', margin: 0, height: '42px' }}>
              <option value="avatar">Avatar</option>
              <option value="gold">Gold VIP</option>
              <option value="diamond">Diamond VIP</option>
              <option value="event">Special Event</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Level Req</div>
            <input type="number" placeholder="1" value={levelReq} onChange={(e) => setLevelReq(e.target.value)} style={{ width: '90px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</div>
            <input type="number" placeholder="0" value={coinCost} onChange={(e) => setCoinCost(e.target.value)} style={{ width: '100px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Frame Image URL (PNG/SVG)</div>
            <input placeholder="https://.../frame.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: '62px', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
              Premium
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Frame
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading frames...</p>
      ) : frames.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No avatar frames created yet. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {frames.map((f) => (
            <div key={f.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {f.is_premium && (
                <span style={{ position: 'absolute', top: '12px', right: '12px', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  VIP
                </span>
              )}
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#f3f4f6', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '2px dashed #d1d5db' }}>
                {f.image_url ? (
                  <img src={f.image_url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '2rem' }}>🖼️</span>
                )}
              </div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{f.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>Level Req: {f.level_required}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.9rem' }}>
                {f.coin_cost ? `🪙 ${f.coin_cost} Coins` : 'Free / Unlocked'}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(f.id, f.is_active)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.75rem',
                    background: f.is_active ? '#d1fae5' : '#fee2e2',
                    color: f.is_active ? '#065f46' : '#991b1b',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {f.is_active ? 'Active' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteFrame(f.id)}
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
