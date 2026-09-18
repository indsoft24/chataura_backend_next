'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type StarUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  star_rank: number | null;
  star_bio_tag: string | null;
  country: string | null;
  audio_call_rate: number | null;
  video_call_rate: number | null;
};

export default function StarAccountsPage() {
  const { token } = useAdminAuth();
  const [stars, setStars] = useState<StarUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<StarUser | null>(null);
  const [formRank, setFormRank] = useState('1');
  const [formTag, setFormTag] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/star-accounts', token);
      setStars(res.data?.stars ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const handleOpenEdit = (u: StarUser) => {
    setEditingUser(u);
    setFormRank(String(u.star_rank ?? 1));
    setFormTag(u.star_bio_tag ?? '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;
    setSaving(true);
    try {
      await api(`/admin/star-accounts/${editingUser.id}/update`, token, {
        method: 'POST',
        body: JSON.stringify({
          star_rank: Number(formRank),
          star_bio_tag: formTag || undefined,
        }),
      });
      setEditingUser(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to update star account');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (u: StarUser) => {
    if (!confirm(`Remove star account status from ${u.name}?`)) return;
    if (!token) return;
    try {
      await api(`/admin/star-accounts/${u.id}/remove`, token, { method: 'POST' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to remove star status');
    }
  };

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Star Accounts</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            VIP creators with customized rank badges, bio tags, and priority spotlight.
          </p>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px', width: 80 }}>RANK</th>
              <th style={{ padding: '12px 16px' }}>STAR USER</th>
              <th style={{ padding: '12px 16px' }}>BIO TAG</th>
              <th style={{ padding: '12px 16px' }}>CALL RATES</th>
              <th style={{ padding: '12px 16px' }}>COUNTRY</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading star accounts...
                </td>
              </tr>
            ) : stars.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No star accounts currently assigned. Assign users via the Users page.
                </td>
              </tr>
            ) : (
              stars.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 9999,
                        backgroundColor: '#fef3c7',
                        color: '#d97706',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      ★ {u.star_rank ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 9999,
                          backgroundColor: '#e5e7eb',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#6b7280' }}>
                            {u.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {u.id} • {u.email ?? u.phone ?? 'No contact'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.star_bio_tag ? (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          fontWeight: 500,
                          fontSize: '0.8rem',
                        }}
                      >
                        {u.star_bio_tag}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563' }}>
                    <div>Audio: {u.audio_call_rate ?? 20} coins/min</div>
                    <div>Video: {u.video_call_rate ?? 40} coins/min</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#4b5563' }}>{u.country ?? '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleOpenEdit(u)}
                        style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Edit Tag/Rank
                      </button>
                      <button
                        onClick={() => handleRemove(u)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Remove Star
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 400, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>
              Edit Star Settings: {editingUser.name}
            </h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Spotlight Star Rank (1-999)
                </label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  required
                  value={formRank}
                  onChange={(e) => setFormRank(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Star Bio Tag (e.g. "Top Singer", "Celebrity")
                </label>
                <input
                  type="text"
                  placeholder="Bio Tag..."
                  maxLength={64}
                  value={formTag}
                  onChange={(e) => setFormTag(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '8px 18px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
