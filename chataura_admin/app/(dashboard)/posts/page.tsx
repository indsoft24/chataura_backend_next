'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Post = {
  id: number;
  caption: string | null;
  media_url: string;
  thumbnail_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user: { id: number; name: string; avatar_url: string | null };
};

export default function PostsPage() {
  const { token } = useAdminAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = search ? `?q=${encodeURIComponent(search)}` : '';
      const res = await api<any>(`/admin/media/posts${params}`, token);
      setPosts(res.data?.posts ?? []);
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
    if (!confirm(`Permanently delete post #${id}?`)) return;
    if (!token) return;
    try {
      await api(`/admin/media/posts/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete post');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Feed Posts Moderation</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            Monitor public feed posts, review user images, and purge policy-violating content.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by caption or author name..."
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
              <th style={{ padding: '12px 16px', width: 80 }}>PREVIEW</th>
              <th style={{ padding: '12px 16px' }}>AUTHOR</th>
              <th style={{ padding: '12px 16px' }}>CAPTION</th>
              <th style={{ padding: '12px 16px' }}>ENGAGEMENT</th>
              <th style={{ padding: '12px 16px' }}>POSTED</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading posts...
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No posts found.
                </td>
              </tr>
            ) : (
              posts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div
                      onClick={() => setPreviewMedia(p.media_url)}
                      style={{ width: 50, height: 50, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', backgroundColor: '#e5e7eb', position: 'relative' }}
                    >
                      <img src={p.thumbnail_url ?? p.media_url} alt="Post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{p.user?.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {p.user?.id}</div>
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                    <div style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.caption || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No caption</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563' }}>
                    <div>❤️ {p.likes_count} likes</div>
                    <div>💬 {p.comments_count} comments</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                    >
                      Delete Post
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewMedia && (
        <div
          onClick={() => setPreviewMedia(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, cursor: 'zoom-out' }}
        >
          <img src={previewMedia} alt="Full preview" style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}
