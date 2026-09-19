'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';

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
  const { token } = useAdminAuth();
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
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('avatar');
  const [editLevelReq, setEditLevelReq] = useState('1');
  const [editCoinCost, setEditCoinCost] = useState('0');
  const [editIsPremium, setEditIsPremium] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames', tok);
      setFrames(json.data?.frames ?? []);
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
      setError('Frame name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/frames', token, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category,
          level_required: Number(levelReq) || 1,
          coin_cost: coinCost ? Number(coinCost) : null,
          is_premium: isPremium,
          image_url: imageUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setName('');
      setImageUrl('');
      setIsPremium(false);
      setCoinCost('0');
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(frame: Frame) {
    setEditingFrame(frame);
    setEditName(frame.name);
    setEditCategory(frame.category);
    setEditLevelReq(String(frame.level_required));
    setEditCoinCost(frame.coin_cost !== null ? String(frame.coin_cost) : '0');
    setEditIsPremium(frame.is_premium);
    setEditImageUrl(frame.image_url ?? '');
    setEditIsActive(frame.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingFrame) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!editName.trim()) {
      setEditError('Frame name is required');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/frames/${editingFrame.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          category: editCategory,
          level_required: Number(editLevelReq) || 1,
          coin_cost: editCoinCost ? Number(editCoinCost) : null,
          is_premium: editIsPremium,
          image_url: editImageUrl.trim() || undefined,
          is_active: editIsActive,
        }),
      });
      setEditModalOpen(false);
      setEditingFrame(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update frame');
    } finally {
      setEditSubmitting(false);
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
    if (!confirm('Are you sure you want to delete this avatar frame?')) return;
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Avatar Frames</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create, update, and manage decorative border frames for user profile pictures and room seats.</p>
      </div>

      {/* Creation Box */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Frame</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Frame Name *</label>
            <input
              type="text"
              placeholder="e.g. Royal Crown / Golden Ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
            >
              <option value="avatar">Avatar</option>
              <option value="seat">Seat Border</option>
              <option value="vip">VIP / Elite</option>
              <option value="event">Event Special</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Level Required</label>
            <input
              type="number"
              value={levelReq}
              onChange={(e) => setLevelReq(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</label>
            <input
              type="number"
              placeholder="0"
              value={coinCost}
              onChange={(e) => setCoinCost(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        <FileUploadInput
          label="Frame Asset (.svga, .png, .webp, .gif)"
          value={imageUrl}
          onChange={(url) => setImageUrl(url)}
          accept="image/*,.svga,.json"
          placeholder="https://.../frame.svga or upload file"
          helpText="Upload an animated SVGA frame or a transparent PNG/WebP frame overlay."
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input
            type="checkbox"
            id="isPremium"
            checked={isPremium}
            onChange={(e) => setIsPremium(e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <label htmlFor="isPremium" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
            Mark as Premium Frame
          </label>
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
          {submitting ? 'Creating...' : '+ Create Frame'}
        </button>
      </div>

      {/* Frames Grid */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading frames...</p>
      ) : frames.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No frames found. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {frames.map((f) => (
            <div key={f.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '92px', height: '92px', borderRadius: '50%', background: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                {f.image_url ? (
                  <img src={f.image_url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>⭕</span>
                )}
              </div>

              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{f.name}</div>
              
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', margin: '4px 0 8px 0' }}>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' }}>
                  {f.category}
                </span>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  Lvl {f.level_required}+
                </span>
                {f.is_premium && (
                  <span style={{ fontSize: '0.72rem', backgroundColor: '#fae8ff', color: '#86198f', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                    ⭐ Premium
                  </span>
                )}
              </div>

              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>
                {f.coin_cost && f.coin_cost > 0 ? `🪙 ${f.coin_cost} Coins` : 'Free / Level Unlock'}
              </div>

              <div style={{ width: '100%' }}>
                <span style={{ display: 'block', textAlign: 'center', padding: '4px 0', borderRadius: '6px', background: f.is_active ? '#d1fae5' : '#fee2e2', color: f.is_active ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {f.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(f.id, f.is_active)}
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
                  {f.is_active ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(f)}
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
                  onClick={() => void deleteFrame(f.id)}
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
      {editModalOpen && editingFrame && (
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
                Edit Frame #{editingFrame.id}
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Frame Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
                >
                  <option value="avatar">Avatar</option>
                  <option value="seat">Seat Border</option>
                  <option value="vip">VIP / Elite</option>
                  <option value="event">Event Special</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Level Required</label>
                <input
                  type="number"
                  value={editLevelReq}
                  onChange={(e) => setEditLevelReq(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</label>
              <input
                type="number"
                value={editCoinCost}
                onChange={(e) => setEditCoinCost(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <FileUploadInput
              label="Frame Asset (.svga, .png, .webp, .gif)"
              value={editImageUrl}
              onChange={(url) => setEditImageUrl(url)}
              accept="image/*,.svga,.json"
              placeholder="https://.../frame.svga"
            />

            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="editIsPremium"
                  checked={editIsPremium}
                  onChange={(e) => setEditIsPremium(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="editIsPremium" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                  Premium Frame
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="editFrameActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="editFrameActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                  Active in Store
                </label>
              </div>
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
