'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';

type Level = {
  id: number;
  level: number;
  min_xp: number;
  max_xp: number;
  label?: string | null;
  badge_url?: string | null;
  icon_url?: string | null;
};

export default function LevelsPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [levelNum, setLevelNum] = useState('1');
  const [minXp, setMinXp] = useState('0');
  const [maxXp, setMaxXp] = useState('1000');
  const [label, setLabel] = useState('Beginner');
  const [badgeUrl, setBadgeUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [editLevelNum, setEditLevelNum] = useState('1');
  const [editMinXp, setEditMinXp] = useState('0');
  const [editMaxXp, setEditMaxXp] = useState('1000');
  const [editLabel, setEditLabel] = useState('');
  const [editBadgeUrl, setEditBadgeUrl] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { levels: Level[] } }>('/admin/levels', tok);
      const list = json.data?.levels ?? [];
      setLevels(list);
      if (list.length > 0) {
        const highestLevel = Math.max(...list.map((l) => l.level));
        const maxCurrentXp = Math.max(...list.map((l) => l.max_xp));
        setLevelNum(String(highestLevel + 1));
        setMinXp(String(maxCurrentXp + 1));
        setMaxXp(String(maxCurrentXp + 5000));
        setLabel(`Level ${highestLevel + 1}`);
      }
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
    setSubmitting(true);
    setError('');
    try {
      const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/levels', token, {
        method: 'POST',
        body: JSON.stringify({
          level: Number(levelNum),
          min_xp: Number(minXp),
          max_xp: Number(maxXp),
          label: label.trim() || undefined,
          badge_url: badgeUrl.trim() || undefined,
        }),
      });
      if (!json.success) {
        setError(json.error?.message ?? 'Create failed');
        return;
      }
      setBadgeUrl('');
      setLevelNum(String(Number(levelNum) + 1));
      setMinXp(String(Number(maxXp) + 1));
      setMaxXp(String(Number(maxXp) + 2000));
      void load(token);
    } catch (e: any) {
      setError(e?.message ?? 'Network Error');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(l: Level) {
    setEditingLevel(l);
    setEditLevelNum(String(l.level));
    setEditMinXp(String(l.min_xp));
    setEditMaxXp(String(l.max_xp));
    setEditLabel(l.label ?? '');
    setEditBadgeUrl(l.badge_url ?? '');
    setEditError('');
    setEditModalOpen(true);
  }

  async function saveEdit() {
    if (!editingLevel) return;
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await api(`/admin/levels/${editingLevel.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          min_xp: Number(editMinXp),
          max_xp: Number(editMaxXp),
          label: editLabel.trim() || undefined,
          badge_url: editBadgeUrl.trim() || undefined,
        }),
      });
      setEditModalOpen(false);
      setEditingLevel(null);
      void load(token);
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to update level');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function deleteLevel(id: number) {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    if (!confirm('Are you sure you want to delete this level configuration?')) return;
    try {
      await api(`/admin/levels/${id}`, token, { method: 'DELETE' });
      void load(token);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Level & Progression Architecture</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Configure user XP thresholds, rank progression badges, and leveling perks.</p>
      </div>

      {/* Creation Box */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Configure New Level</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Level #</div>
            <input type="number" value={levelNum} onChange={(e) => setLevelNum(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Min XP</div>
            <input type="number" value={minXp} onChange={(e) => setMinXp(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Max XP</div>
            <input type="number" value={maxXp} onChange={(e) => setMaxXp(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Label / Title</div>
            <input placeholder="e.g. Master" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          </div>
        </div>

        <FileUploadInput
          label="Level Rank Badge (.png, .svg, .webp)"
          value={badgeUrl}
          onChange={(url) => setBadgeUrl(url)}
          accept="image/*"
          placeholder="https://.../badge.png or upload image"
          helpText="Upload a crisp vector or PNG level badge shown beside the user's name."
        />

        {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>⚠️ {error}</p>}

        <button type="button" onClick={() => void create()} disabled={submitting} style={{ padding: '10px 24px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Adding...' : '+ Add Level'}
        </button>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#111827' }}>Configured Levels ({levels.length})</h2>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Level</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Title</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Min XP</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Max XP</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'center' }}>Badge</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading levels...</td></tr>
              ) : levels.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No levels configured yet.</td></tr>
              ) : (
                levels.map((l) => (
                  <tr key={l.id}>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
                        {l.level}
                      </span>
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, color: '#111827' }}>
                      {l.label || `Level ${l.level}`}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600, color: '#4b5563' }}>
                      {l.min_xp.toLocaleString()} XP
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600, color: '#4b5563' }}>
                      {l.max_xp.toLocaleString()} XP
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                      {l.badge_url ? (
                        <img src={l.badge_url} alt={`Badge ${l.level}`} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '1.2rem' }}>🎖️</span>
                      )}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => openEdit(l)}
                          style={{
                            padding: '6px 12px',
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
                          onClick={() => void deleteLevel(l.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            width: 'auto',
                            fontWeight: 600,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editModalOpen && editingLevel && (
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
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                Edit Level #{editingLevel.level} Configuration
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
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Level Title</label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Min XP</label>
                <input
                  type="number"
                  value={editMinXp}
                  onChange={(e) => setEditMinXp(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>Max XP</label>
                <input
                  type="number"
                  value={editMaxXp}
                  onChange={(e) => setEditMaxXp(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <FileUploadInput
              label="Level Rank Badge (.png, .svg, .webp)"
              value={editBadgeUrl}
              onChange={(url) => setEditBadgeUrl(url)}
              accept="image/*"
              placeholder="https://.../badge.png"
            />

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
