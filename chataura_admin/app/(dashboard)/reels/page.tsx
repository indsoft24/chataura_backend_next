'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Reel = {
  id: number;
  caption: string | null;
  media_url: string;
  thumbnail_url: string | null;
  likes_count: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  user: { id: number; name: string; avatar_url: string | null };
};

export default function ReelsPage() {
  const { token } = useAdminAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = search ? `?q=${encodeURIComponent(search)}` : '';
      const res = await api<any>(`/admin/media/reels${params}`, token);
      setReels(res.data?.reels ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const handleDelete = async (id: number) => {
    if (!confirm(`Permanently delete video reel #${id}?`)) return;
    if (!token) return;
    try {
      await api(`/admin/media/reels/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete reel');
    }
  };

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Video Reels Moderation</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Review uploaded short videos, play back content, and moderate community reels.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by caption or creator name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ width: 320, padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }}
        />
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px', width: 80 }}>VIDEO</th>
              <th style={{ padding: '12px 16px' }}>CREATOR</th>
              <th style={{ padding: '12px 16px' }}>CAPTION</th>
              <th style={{ padding: '12px 16px' }}>PERFORMANCE</th>
              <th style={{ padding: '12px 16px' }}>POSTED</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading video reels...
                </td>
              </tr>
            ) : reels.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No video reels found.
                </td>
              </tr>
            ) : (
              reels.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div
                      onClick={() => setActiveVideo(r.media_url)}
                      style={{ width: 50, height: 75, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', backgroundColor: '#111827', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {r.thumbnail_url ? (
                        <img src={r.thumbnail_url} alt="Reel" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ color: '#fff', fontSize: '1.2rem' }}>▶</div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{r.user?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {r.user?.id}</div>
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                    <div style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.caption || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No caption</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563' }}>
                    <div>👁️ {r.views_count.toLocaleString()} views</div>
                    <div>❤️ {r.likes_count} likes • 💬 {r.comments_count} comments</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setActiveVideo(r.media_url)}
                        style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Play
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
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

      {/* Video Player Modal */}
      {activeVideo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ position: 'relative', width: 380, maxHeight: '85vh', backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
            <button
              onClick={() => setActiveVideo(null)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 70, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 9999, width: 32, height: 32, cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
            <video
              src={activeVideo}
              controls
              autoPlay
              style={{ width: '100%', height: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
