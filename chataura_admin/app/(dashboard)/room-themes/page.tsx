'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';

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

  // Creation Form state
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('0');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<RoomTheme | null>(null);
  const [editName, setEditName] = useState('');
  const [editCoinCost, setEditCoinCost] = useState('0');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

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
    if (!name.trim()) {
      setError('Theme name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/room-themes', token, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          coin_cost: Number(coinCost) || 0,
          image_url: imageUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setName('');
      setCoinCost('0');
      setImageUrl('');
      setIsActive(true);
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(theme: RoomTheme) {
    setEditingTheme(theme);
    setEditName(theme.name);
    setEditCoinCost(String(theme.coin_cost));
    setEditImageUrl(theme.image_url ?? '');
    setEditIsActive(theme.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingTheme) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!editName.trim()) {
      setEditError('Theme name is required');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/room-themes/${editingTheme.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          coin_cost: Number(editCoinCost) || 0,
          image_url: editImageUrl.trim() || undefined,
          is_active: editIsActive,
        }),
      });
      setEditModalOpen(false);
      setEditingTheme(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update theme');
    } finally {
      setEditSubmitting(false);
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

      {/* Creation Card */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Room Theme</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Theme Name *</label>
            <input
              type="text"
              placeholder="e.g. Confetti Drop / Neon Cyberpunk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost / Rate (0 = Free)</label>
            <input
              type="number"
              placeholder="0"
              value={coinCost}
              onChange={(e) => setCoinCost(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        {/* Reusable File Upload & URL input */}
        <FileUploadInput
          label="Theme Asset / Wallpaper (.json, .svga, .png, .jpg, .gif, .webp)"
          value={imageUrl}
          onChange={(url) => setImageUrl(url)}
          accept="image/*,.json,.svga,.webp,.gif,.png,.jpg,.jpeg"
          helpText="Upload a background image or Lottie .json / .svga animation, or enter a direct CDN/storage URL."
          placeholder="https://your-domain.com/storage/themes/confetti.json or image URL"
        />

        {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>⚠️ {error}</p>}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void create()}
            disabled={submitting}
            style={{
              padding: '10px 24px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {submitting ? 'Creating...' : '+ Create Theme'}
          </button>
        </div>
      </div>

      {/* Existing Themes Grid */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading room themes...</p>
      ) : themes.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No room themes created yet. Create one above!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {themes.map((t) => (
            <div key={t.id} style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', height: '160px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {t.image_url ? (
                  t.image_url.endsWith('.json') || t.image_url.endsWith('.svga') ? (
                    <div style={{ color: '#818cf8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '2.5rem' }}>✨</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Lottie / Animation</span>
                    </div>
                  ) : (
                    <img src={t.image_url} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>🌆 No Preview</div>
                )}
              </div>

              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>{t.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>#{t.id}</span>
                  </div>
                  <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.9rem' }}>
                    {t.coin_cost > 0 ? `🪙 ${t.coin_cost} Coins` : 'Free Theme'}
                  </div>
                </div>

                {/* Card Action Buttons: Toggle Active, Edit, Delete */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => void toggleActive(t.id, t.is_active)}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      fontSize: '0.8rem',
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
                    onClick={() => openEdit(t)}
                    style={{
                      padding: '7px 14px',
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
                    onClick={() => void deleteTheme(t.id)}
                    style={{
                      padding: '7px 12px',
                      fontSize: '0.8rem',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
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

      {/* Edit Modal */}
      {editModalOpen && editingTheme && (
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
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                Edit Room Theme #{editingTheme.id}
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Theme Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost / Rate (0 = Free)</label>
              <input
                type="number"
                value={editCoinCost}
                onChange={(e) => setEditCoinCost(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <FileUploadInput
              label="Theme Asset / Wallpaper"
              value={editImageUrl}
              onChange={(url) => setEditImageUrl(url)}
              accept="image/*,.json,.svga,.webp,.gif,.png,.jpg,.jpeg"
              placeholder="https://your-domain.com/storage/themes/confetti.json or image URL"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input
                type="checkbox"
                id="editIsActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editIsActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                Active & Visible to Live Rooms
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
