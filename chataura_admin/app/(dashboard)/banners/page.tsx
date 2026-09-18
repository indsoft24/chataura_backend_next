'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Banner = {
  id: number;
  title: string;
  subtitle?: string | null;
  category: string;
  badge_text?: string | null;
  image_url: string | null;
  action_type?: string | null;
  action_target?: string | null;
  is_active: boolean;
};

export default function BannersPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('event');
  const [badgeText, setBadgeText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionTarget, setActionTarget] = useState('');
  const [error, setError] = useState('');

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { banners: Banner[] } }>('/admin/banners', tok);
      setBanners(json.data?.banners ?? []);
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
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/banners', token, {
        method: 'POST',
        body: JSON.stringify({
          title,
          category,
          badge_text: badgeText.trim() || undefined,
          image_url: imageUrl.trim() || undefined,
          action_target: actionTarget.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setError('');
      setTitle('');
      setBadgeText('');
      setImageUrl('');
      setActionTarget('');
      void load(token);
    } catch (e) {
      setError('Network Error');
    }
  }

  async function toggleActive(id: number, current: boolean) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/banners/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteBanner(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this banner?')) return;
    try {
      await api(`/admin/banners/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Banners & Events</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create and manage promotional banners and carousel events displayed inside the app.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Banner</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Title</div>
            <input placeholder="e.g. Summer Bonanza" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '200px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.95rem', margin: 0, height: '42px' }}>
              <option value="event">Event</option>
              <option value="promo">Promo</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Badge Tag</div>
            <input placeholder="HOT, NEW, 50% OFF" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} style={{ width: '130px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Image URL</div>
            <input placeholder="https://.../banner.png" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Action Target URL / Route</div>
            <input placeholder="/store or https://..." value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Banner
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading banners...</p>
      ) : banners.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No banners created yet. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {banners.map((b) => (
            <div key={b.id} style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', height: '140px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {b.image_url ? (
                  <img src={b.image_url} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9ca3af' }}>
                    <span style={{ fontSize: '2rem' }}>🖼️</span>
                    <span style={{ fontSize: '0.8rem', marginTop: '4px' }}>No image</span>
                  </div>
                )}
                {b.badge_text && (
                  <span style={{ position: 'absolute', top: '10px', left: '10px', background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                    {b.badge_text}
                  </span>
                )}
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: b.category === 'event' ? '#3b82f6' : '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {b.category}
                </span>
              </div>
              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>{b.title}</h3>
                  {b.action_target && <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#6b7280' }}>Target: {b.action_target}</p>}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                  <button
                    type="button"
                    onClick={() => void toggleActive(b.id, b.is_active)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      background: b.is_active ? '#d1fae5' : '#fee2e2',
                      color: b.is_active ? '#065f46' : '#991b1b',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {b.is_active ? 'Active' : 'Hidden'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteBanner(b.id)}
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
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
