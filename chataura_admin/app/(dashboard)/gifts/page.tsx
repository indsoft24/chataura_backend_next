'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';

type Gift = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  animation_url: string | null;
  is_active: boolean;
};

export default function GiftsPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [coinCost, setCoinCost] = useState('50');
  const [imageUrl, setImageUrl] = useState('');
  const [animationUrl, setAnimationUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState<Gift | null>(null);
  const [editName, setEditName] = useState('');
  const [editCoinCost, setEditCoinCost] = useState('50');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editAnimationUrl, setEditAnimationUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<any>('/admin/gifts', tok);
      const list = Array.isArray(json.data) ? json.data : (json.data?.gifts ?? []);
      setGifts(list);
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
      setError('Gift name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/gifts', token, {
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
      setCoinCost('50');
      setImageUrl('');
      setAnimationUrl('');
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(gift: Gift) {
    setEditingGift(gift);
    setEditName(gift.name);
    setEditCoinCost(String(gift.coin_cost));
    setEditImageUrl(gift.image_url ?? '');
    setEditAnimationUrl(gift.animation_url ?? '');
    setEditIsActive(gift.is_active);
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingGift) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!editName.trim()) {
      setEditError('Gift name is required');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/gifts/${editingGift.id}`, token, {
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
      setEditingGift(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update gift');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleActive(id: number, current: boolean) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    try {
      await api(`/admin/gifts/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteGift(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this virtual gift?')) return;
    try {
      await api(`/admin/gifts/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Virtual Gifts Catalog</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Create, update, toggle availability, and remove virtual gifts available in live rooms.</p>
      </div>

      {/* Creation Box */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Gift</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Gift Name *</label>
            <input
              type="text"
              placeholder="e.g. Diamond Ring / Sports Car"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Coin Cost</label>
            <input
              type="number"
              placeholder="50"
              value={coinCost}
              onChange={(e) => setCoinCost(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <FileUploadInput
            label="Gift Icon / Image (.png, .jpg, .webp)"
            value={imageUrl}
            onChange={(url) => setImageUrl(url)}
            accept="image/*"
            placeholder="https://.../gift_icon.png or upload image"
            helpText="Upload a thumbnail or static display icon for the gift catalog."
          />

          <FileUploadInput
            label="Gift Animation Effect (.svga, .json, .webp, .gif)"
            value={animationUrl}
            onChange={(url) => setAnimationUrl(url)}
            accept=".svga,.json,image/*"
            placeholder="https://.../gift_anim.svga or upload file"
            helpText="Upload SVGA or Lottie JSON played on screen during room gifting."
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
          {submitting ? 'Creating...' : '+ Create Gift'}
        </button>
      </div>

      {/* Gifts Grid */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading gifts...</p>
      ) : gifts.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No gifts found. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {gifts.map((g) => (
            <div key={g.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ width: '96px', height: '96px', borderRadius: '12px', background: '#f8fafc', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                {g.image_url ? (
                  <img src={g.image_url} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '2.5rem' }}>🎁</span>
                )}
              </div>

              <div style={{ fontWeight: 600, color: '#111827', fontSize: '1.05rem', marginBottom: '4px', textAlign: 'center' }}>{g.name}</div>
              <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.95rem' }}>🪙 {g.coin_cost.toLocaleString()} Coins</div>
              
              {g.animation_url && (
                <div style={{ marginTop: '6px', fontSize: '0.72rem', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  ✨ Animation Attached
                </div>
              )}

              <div style={{ marginTop: '12px', width: '100%' }}>
                <span style={{ display: 'block', textAlign: 'center', padding: '4px 0', borderRadius: '6px', background: g.is_active ? '#d1fae5' : '#fee2e2', color: g.is_active ? '#065f46' : '#991b1b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  {g.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Action Buttons: Toggle, Edit, Delete */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => void toggleActive(g.id, g.is_active)}
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
                  {g.is_active ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(g)}
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
                  onClick={() => void deleteGift(g.id)}
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
      {editModalOpen && editingGift && (
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
                Edit Gift #{editingGift.id}
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Gift Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
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
              label="Gift Icon / Image"
              value={editImageUrl}
              onChange={(url) => setEditImageUrl(url)}
              accept="image/*"
              placeholder="https://.../gift_icon.png"
            />

            <FileUploadInput
              label="Gift Animation Effect (.svga, .json, .webp)"
              value={editAnimationUrl}
              onChange={(url) => setEditAnimationUrl(url)}
              accept=".svga,.json,image/*"
              placeholder="https://.../gift_anim.svga"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input
                type="checkbox"
                id="editGiftActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editGiftActive" style={{ fontSize: '0.9rem', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                Active in Catalog & Live Rooms
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
