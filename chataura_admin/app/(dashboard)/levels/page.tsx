'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [levelNum, setLevelNum] = useState('1');
  const [minXp, setMinXp] = useState('0');
  const [maxXp, setMaxXp] = useState('1000');
  const [label, setLabel] = useState('Beginner');
  const [badgeUrl, setBadgeUrl] = useState('');
  const [error, setError] = useState('');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { levels: Level[] } }>('/admin/levels', token);
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
      setError('');
      setLevelNum(String(Number(levelNum) + 1));
      setMinXp(String(Number(maxXp) + 1));
      setMaxXp(String(Number(maxXp) + 2000));
      void load(token);
    } catch (e) {
      setError('Network Error');
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
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>User Levels & XP Milestones</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Configure level progression thresholds, XP requirements, and unlocked milestone badges.</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 16px 0', color: '#111827' }}>Add New Level Tier</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Level #</div>
            <input type="number" placeholder="1" value={levelNum} onChange={(e) => setLevelNum(e.target.value)} style={{ width: '90px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Min XP</div>
            <input type="number" placeholder="0" value={minXp} onChange={(e) => setMinXp(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Max XP</div>
            <input type="number" placeholder="1000" value={maxXp} onChange={(e) => setMaxXp(e.target.value)} style={{ width: '110px', margin: 0 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Label / Title</div>
            <input placeholder="e.g. Master, Elite" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '160px', margin: 0 }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Badge URL (Optional)</div>
            <input placeholder="https://.../badge.png" value={badgeUrl} onChange={(e) => setBadgeUrl(e.target.value)} style={{ margin: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '62px' }}>
            <button type="button" onClick={() => void create()} style={{ width: 'auto', height: '42px' }}>
              Create Level
            </button>
          </div>
        </div>
        {error && <p className="err" style={{ marginTop: '16px', marginBottom: 0, maxWidth: '400px' }}>{error}</p>}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Level</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', background: '#f9fafb' }}>Label</th>
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
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No level tiers configured yet. Create one above!</td></tr>
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
                        <img src={l.badge_url} alt={`Badge ${l.level}`} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '1.2rem' }}>🎖️</span>
                      )}
                    </td>
                    <td style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
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
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
