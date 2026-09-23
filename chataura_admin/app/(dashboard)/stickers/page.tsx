'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb from '@/app/components/MediaThumb';

const ANIMATION_ACCEPT =
  '.svga,.json,.gif,.webp,.mp4,.webm,video/mp4,video/webm,image/gif,image/webp';

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
  const { token } = useAdminAuth();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [animationUrl, setAnimationUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSticker, setEditingSticker] = useState<Sticker | null>(null);
  const [editName, setEditName] = useState('');
  const [editCoinCost, setEditCoinCost] = useState('10');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editAnimationUrl, setEditAnimationUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { stickers: Sticker[] } }>('/admin/stickers', tok);
      setStickers(json.data?.stickers ?? []);
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
      setError('Sticker name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/stickers', token, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          coin_cost: Number(coinCost) || 0,
          image_url: imageUrl.trim() || undefined,
          animation_url: animationUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setName('');
      setCoinCost('10');
      setImageUrl('');
      setAnimationUrl('');
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(sticker: Sticker) {
    setEditingSticker(sticker);
    setEditName(sticker.name);
    setEditCoinCost(String(sticker.coin_cost));
    setEditImageUrl(sticker.image_url ?? '');
    setEditAnimationUrl(sticker.animation_url ?? '');
    setEditIsActive(sticker.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingSticker) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!editName.trim()) {
      setEditError('Sticker name is required');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/stickers/${editingSticker.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          coin_cost: Number(editCoinCost) || 0,
          image_url: editImageUrl.trim() || undefined,
          animation_url: editAnimationUrl.trim() || undefined,
          is_active: editIsActive,
        }),
      });
      setEditModalOpen(false);
      setEditingSticker(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update sticker');
    } finally {
      setEditSubmitting(false);
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Chat & Room Stickers</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Manage stickers that users can send in live room chats and direct messages.</p>
      </div>

      {/* Creation Form */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Sticker</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Sticker Name *</label>
            <input
              type="text"
              placeholder="e.g. Laughing Emoji / Thumbs Up"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost (0 = Free)</label>
            <input
              type="number"
              placeholder="10"
              value={coinCost}
              onChange={(e) => setCoinCost(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <FileUploadInput
            label="Static Sticker Image (.png, .webp, .svg)"
            value={imageUrl}
            onChange={(url) => setImageUrl(url)}
            accept="image/*"
            placeholder="https://.../sticker.png or upload image"
            helpText="Upload a transparent PNG/WebP static sticker icon."
          />

          <FileUploadInput
            label="Animated Sticker (.gif, .webp, .json, .svga, .mp4, .webm)"
            value={animationUrl}
            onChange={(url) => setAnimationUrl(url)}
            accept={ANIMATION_ACCEPT}
            placeholder="https://.../sticker_anim.mp4 or upload file"
            helpText="Looping sticker. GIF, WebP, Lottie JSON, SVGA, MP4, or WebM."
          />
        </div>

        {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>⚠️ {error}</p>}

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
          }}
        >
          {submitting ? 'Creating...' : '+ Create Sticker'}
        </button>
      </div>

      {/* Stickers Grid */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading stickers...</p>
      ) : stickers.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No stickers found. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {stickers.map((s) => (
            <div key={s.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '84px', height: '84px', borderRadius: '12px', background: '#f8fafc', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                <MediaThumb
                  imageUrl={s.image_url}
                  animationUrl={s.animation_url}
                  alt={s.name}
                  fallback="✨"
                />
              </div>

              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{s.name}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.95rem' }}>
                {s.coin_cost > 0 ? `🪙 ${s.coin_cost} Coins` : 'Free Sticker'}
              </div>

              {s.animation_url && (
                <div style={{ marginTop: '6px', fontSize: '0.72rem', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  ✨ Animated
                </div>
              )}

              <div style={{ marginTop: '12px', width: '100%' }}>
                <span style={{ display: 'block', textAlign: 'center', padding: '4px 0', borderRadius: '6px', background: s.is_active ? '#d1fae5' : '#fee2e2', color: s.is_active ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {s.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(s.id, s.is_active)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.75rem',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {s.is_active ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
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
                  onClick={() => void deleteSticker(s.id)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
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
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && editingSticker && (
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
                Edit Sticker #{editingSticker.id}
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Sticker Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost (0 = Free)</label>
              <input
                type="number"
                value={editCoinCost}
                onChange={(e) => setEditCoinCost(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <FileUploadInput
              label="Static Sticker Image (.png, .webp, .svg)"
              value={editImageUrl}
              onChange={(url) => setEditImageUrl(url)}
              accept="image/*"
              placeholder="https://.../sticker.png"
            />

            <FileUploadInput
              label="Animated Sticker (.gif, .webp, .json, .svga, .mp4, .webm)"
              value={editAnimationUrl}
              onChange={(url) => setEditAnimationUrl(url)}
              accept={ANIMATION_ACCEPT}
              placeholder="https://.../sticker_anim.mp4"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input
                type="checkbox"
                id="editStickerActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editStickerActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                Active in Chat Sticker Selector
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
