'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb, { compositeForAnimation } from '@/app/components/MediaThumb';

const ANIMATION_ACCEPT =
  '.svga,.json,.gif,.webp,.mp4,.webm,video/mp4,video/webm,image/gif,image/webp';

type Frame = {
  id: number;
  name: string;
  category: string;
  level_required: number;
  coin_cost: number | null;
  is_premium: boolean;
  is_active: boolean;
  image_url: string | null;
  animation_url: string | null;
  animation_key: string | null;
  composite_mode: 'alpha' | 'screen' | null;
};

export default function RoleFramesPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [roleType, setRoleType] = useState('admin');
  const ROLE_KEYS: { value: string; label: string }[] = [
    { value: 'admin', label: 'Admin' },
    { value: 'ceo', label: 'CEO' },
    { value: 'manager', label: 'Manager' },
    { value: 'superadmin', label: 'Superadmin' },
    { value: 'coin_seller', label: 'Coin Seller' },
  ];
  const [imageUrl, setImageUrl] = useState('');
  const [animationUrl, setAnimationUrl] = useState('');
  const [composite, setComposite] = useState<'alpha' | 'screen'>('alpha');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoleKey, setEditRoleKey] = useState('admin');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editAnimationUrl, setEditAnimationUrl] = useState('');
  const [editComposite, setEditComposite] = useState<'alpha' | 'screen'>('alpha');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames?category=role', tok);
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
      setError('Role frame name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/frames', token, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category: 'role',
          level_required: 1,
          is_premium: true,
          animation_key: roleType,
          slug: `role_${roleType}_${Date.now()}`,
          image_url: imageUrl.trim(),
          animation_url: animationUrl.trim(),
          composite_mode: composite,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setName('');
      setImageUrl('');
      setAnimationUrl('');
      setComposite('alpha');
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
    setEditRoleKey(frame.animation_key || 'admin');
    setEditImageUrl(frame.image_url ?? '');
    setEditAnimationUrl(frame.animation_url ?? '');
    setEditComposite(frame.composite_mode === 'screen' ? 'screen' : 'alpha');
    setEditIsActive(frame.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingFrame) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!editName.trim()) {
      setEditError('Role frame name is required');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/frames/${editingFrame.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          animation_key: editRoleKey,
          image_url: editImageUrl.trim(),
          animation_url: editAnimationUrl.trim(),
          composite_mode: editComposite,
          is_active: editIsActive,
        }),
      });
      setEditModalOpen(false);
      setEditingFrame(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update role frame');
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Staff & Role Frames</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Special prestige frames exclusive to Admins, CEOs, Managers, and Coin Sellers.</p>
      </div>

      {/* Creation Box */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Role Frame</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Role Frame Name *</label>
            <input
              type="text"
              placeholder="e.g. Commander Frame"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Role</label>
            <select
              value={roleType}
              onChange={(e) => setRoleType(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
            >
              {ROLE_KEYS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <FileUploadInput
            label="Role Frame Poster (.png, .webp)"
            value={imageUrl}
            onChange={(url) => setImageUrl(url)}
            accept="image/*"
            placeholder="https://.../role_frame_poster.png or upload image"
            helpText="Still preview. Leave empty when uploading a video and a poster is generated."
          />
          <FileUploadInput
            label="Role Frame Animation (.svga, .gif, .webp, .mp4, .webm)"
            value={animationUrl}
            onChange={(url) => {
              setAnimationUrl(url);
              setComposite(compositeForAnimation(url));
            }}
            accept={ANIMATION_ACCEPT}
            placeholder="https://.../role_frame.mp4 or upload file"
            helpText="Looping staff frame. MP4 glow clips on black use Screen composite."
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Composite</label>
          <select
            value={composite}
            onChange={(e) => setComposite(e.target.value === 'screen' ? 'screen' : 'alpha')}
            style={{ width: '100%', maxWidth: '360px', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
          >
            <option value="alpha">Alpha (transparent PNG, WebM, SVGA)</option>
            <option value="screen">Screen (black background glow video)</option>
          </select>
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
          {submitting ? 'Creating...' : '+ Create Role Frame'}
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading role frames...</p>
      ) : frames.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No role frames found. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {frames.map((f) => (
            <div key={f.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '92px', height: '92px', borderRadius: '50%', background: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                <MediaThumb
                  imageUrl={f.image_url}
                  animationUrl={f.animation_url}
                  composite={f.composite_mode}
                  alt={f.name}
                  fallback="🛡️"
                  rounded
                />
              </div>

              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{f.name}</div>
              
              <div style={{ margin: '4px 0 8px 0' }}>
                <span style={{ fontSize: '0.72rem', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  Prestige Role Frame
                </span>
              </div>

              <div style={{ width: '100%', marginTop: '8px' }}>
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
                Edit Role Frame #{editingFrame.id}
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Role Frame Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Role Key</label>
              <select
                value={editRoleKey}
                onChange={(e) => setEditRoleKey(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                {ROLE_KEYS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <FileUploadInput
                label="Role Frame Poster (.png, .webp)"
                value={editImageUrl}
                onChange={(url) => setEditImageUrl(url)}
                accept="image/*"
                placeholder="https://.../role_frame_poster.png"
              />
              <FileUploadInput
                label="Role Frame Animation (.svga, .gif, .webp, .mp4, .webm)"
                value={editAnimationUrl}
                onChange={(url) => {
                  setEditAnimationUrl(url);
                  setEditComposite(compositeForAnimation(url));
                }}
                accept={ANIMATION_ACCEPT}
                placeholder="https://.../role_frame.mp4"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Composite</label>
              <select
                value={editComposite}
                onChange={(e) => setEditComposite(e.target.value === 'screen' ? 'screen' : 'alpha')}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                <option value="alpha">Alpha (transparent PNG, WebM, SVGA)</option>
                <option value="screen">Screen (black background glow video)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input
                type="checkbox"
                id="editRoleFrameActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editRoleFrameActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                Active & Enabled for Privileged Staff
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
