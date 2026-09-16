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

export default function RoleFramesPage() {
  const router = useRouter();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [roleType, setRoleType] = useState('Admin Privilege');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames?category=role', token);
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
          name: `${name} (${roleType})`,
          category: 'role',
          level_required: 1,
          is_premium: true,
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
    if (!confirm('Are you sure you want to delete this role frame?')) return;
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Role & VIP Frames</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Configure exclusive avatar frames awarded to Administrators, Star Creators, and Top Hosts.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Role Frame</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Title</div>
            <input placeholder="e.g. Master Host" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '180px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Designated Role</div>
            <select value={roleType} onChange={(e) => setRoleType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.95rem', margin: 0, height: '42px' }}>
              <option value="Admin Privilege">Admin Privilege</option>
              <option value="Star Host">Star Host</option>
              <option value="Coin Seller">Coin Seller</option>
              <option value="VIP Superhost">VIP Superhost</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Frame Image URL</div>
            <input placeholder="https://.../role_frame.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Role Frame
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading role frames...</p>
      ) : frames.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No role frames registered yet. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {frames.map((f) => (
            <div key={f.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: '#fef3c7', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: '2px dashed #f59e0b' }}>
                {f.image_url ? (
                  <img src={f.image_url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>👑</span>
                )}
              </div>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{f.name}</div>
              <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                Exclusive Role
              </span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%' }}>
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
