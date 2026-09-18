'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type EntryBar = {
  id: number;
  name: string;
  level_required: number;
  image_url: string | null;
  is_active: boolean;
};

export default function EntryBarsPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [bars, setBars] = useState<EntryBar[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [levelReq, setLevelReq] = useState('5');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { entry_bars: EntryBar[] } }>('/admin/entry-bars', tok);
      setBars(json.data?.entry_bars ?? []);
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
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/entry-bars', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          level_required: Number(levelReq),
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
      await api(`/admin/entry-bars/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteBar(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this room entry bar?')) return;
    try {
      await api(`/admin/entry-bars/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Room Entry Bars Catalog</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Manage animated entrance bars displayed across live party rooms when VIP users join.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Entry Bar</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Name</div>
            <input placeholder="e.g. Phoenix Dragon Entrance" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '220px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Level Required</div>
            <input type="number" placeholder="5" value={levelReq} onChange={(e) => setLevelReq(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Banner Image URL</div>
            <input placeholder="https://.../entry_banner.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Entry Bar
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading entry bars...</p>
      ) : bars.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No entry bars found. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {bars.map((b) => (
            <div key={b.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', height: '70px', borderRadius: '8px', background: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {b.image_url ? (
                  <img src={b.image_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✨</span> {b.name}
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px' }}>{b.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '12px' }}>Requires Level {b.level_required}+</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(b.id, b.is_active)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.75rem',
                    background: b.is_active ? '#d1fae5' : '#fee2e2',
                    color: b.is_active ? '#065f46' : '#991b1b',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {b.is_active ? 'Active' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteBar(b.id)}
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
          ))}
        </div>
      )}
    </main>
  );
}
