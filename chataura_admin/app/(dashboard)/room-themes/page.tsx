'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type RoomTheme = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  is_active: boolean;
};

export default function RoomThemesPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [themes, setThemes] = useState<RoomTheme[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('0');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { room_themes: RoomTheme[] } }>('/admin/room-themes', tok);
      setThemes(json.data?.room_themes ?? []);
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
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/room-themes', token, {
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
      await api(`/admin/room-themes/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteTheme(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this room theme?')) return;
    try {
      await api(`/admin/room-themes/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Party Room Themes</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Customize and publish background atmospheres & wallpapers for audio live rooms.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Room Theme</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Theme Name</div>
            <input placeholder="e.g. Neon Cyberpunk" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '220px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</div>
            <input type="number" placeholder="0" value={coinCost} onChange={(e) => setCoinCost(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Background Wallpaper URL</div>
            <input placeholder="https://.../theme_bg.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Theme
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading room themes...</p>
      ) : themes.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No room themes created yet. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {themes.map((t) => (
            <div key={t.id} style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', height: '150px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {t.image_url ? (
                  <img src={t.image_url} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>🌆 No Preview</div>
                )}
              </div>
              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>{t.name}</h3>
                  <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.9rem' }}>
                    {t.coin_cost > 0 ? `🪙 ${t.coin_cost} Coins` : 'Free Theme'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => void toggleActive(t.id, t.is_active)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: '0.75rem',
                      background: t.is_active ? '#d1fae5' : '#fee2e2',
                      color: t.is_active ? '#065f46' : '#991b1b',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {t.is_active ? 'Active' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTheme(t.id)}
                    style={{
                      padding: '6px 12px',
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
