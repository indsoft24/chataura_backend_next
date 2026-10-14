'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb, { compositeForAnimation, isLoopingVideo } from '@/app/components/MediaThumb';

const ANIMATION_ACCEPT =
  '.svga,.json,.gif,.webp,.mp4,.webm,video/mp4,video/webm,image/gif,image/webp';

type Frame = {
  id: number;
  name: string;
  slug?: string | null;
  category: string;
  level_required: number;
  coin_cost: number | null;
  is_premium: boolean;
  is_active: boolean;
  image_url: string | null;
  animation_url: string | null;
  composite_mode: 'alpha' | 'screen' | null;
  avatar_scale?: number | null;
  avatar_offset_y?: number | null;
};

const STANDARD_CATEGORIES = [
  'RELATIONSHIP',
  'role',
  'LEGENDARY',
  'MYTHIC',
  'EPIC',
  'RARE',
  'SPECIAL',
  'avatar',
  'seat',
  'vip',
  'event',
];

function getCategoryStyle(cat: string) {
  const c = (cat || '').toUpperCase();
  if (c === 'RELATIONSHIP') {
    return { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d', icon: '❤️' };
  }
  if (c === 'ROLE') {
    return { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', icon: '👑' };
  }
  if (c === 'LEGENDARY') {
    return { bg: '#fffbeb', border: '#fde68a', text: '#b45309', icon: '⭐' };
  }
  if (c === 'MYTHIC') {
    return { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', icon: '🔥' };
  }
  if (c === 'EPIC') {
    return { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca', icon: '⚡' };
  }
  if (c === 'RARE') {
    return { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', icon: '💎' };
  }
  if (c === 'SPECIAL') {
    return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', icon: '✨' };
  }
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', icon: '🏷️' };
}

function detectMediaMeta(f: Frame) {
  const hasAnim = Boolean(f.animation_url && f.animation_url.trim() && f.animation_url !== f.image_url);
  if (!hasAnim) {
    return { type: 'static', label: 'Static (PNG)', icon: '🖼️', color: '#64748b' };
  }
  const url = f.animation_url || '';
  const slug = f.slug || '';
  if (f.composite_mode === 'screen' || isLoopingVideo(url) || url.toLowerCase().includes('.mp4')) {
    return { type: 'video', label: 'Video (Screen)', icon: '🎥', color: '#7c3aed' };
  }
  if (slug.includes('real_motion') || url.includes('real_motion')) {
    return { type: 'real_motion', label: 'Real Motion (WebP)', icon: '✨', color: '#0284c7' };
  }
  if (slug.includes('sparkle') || url.includes('sparkle')) {
    return { type: 'sparkle', label: 'Sparkle (WebP)', icon: '💫', color: '#d97706' };
  }
  return { type: 'animated', label: 'Animated (WebP)', icon: '🎬', color: '#2563eb' };
}

export default function FramesPage() {
  const router = useRouter();
  const { token } = useAdminAuth();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [mediaFilter, setMediaFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ID_ASC' | 'ID_DESC' | 'NAME_ASC' | 'NAME_DESC' | 'LEVEL_ASC' | 'PRICE_DESC'>('ID_ASC');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [showCreateBox, setShowCreateBox] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('avatar');
  const [levelReq, setLevelReq] = useState('1');
  const [coinCost, setCoinCost] = useState('0');
  const [isPremium, setIsPremium] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [animationUrl, setAnimationUrl] = useState('');
  const [composite, setComposite] = useState<'alpha' | 'screen'>('alpha');
  const [avatarScale, setAvatarScale] = useState('0.58');
  const [avatarOffsetY, setAvatarOffsetY] = useState('0');
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
  const [editAnimationUrl, setEditAnimationUrl] = useState('');
  const [editComposite, setEditComposite] = useState<'alpha' | 'screen'>('alpha');
  const [editAvatarScale, setEditAvatarScale] = useState('');
  const [editAvatarOffsetY, setEditAvatarOffsetY] = useState('');
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

  // Copy helper
  function copySlug(slug: string) {
    if (!slug) return;
    navigator.clipboard.writeText(slug);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  // Categories present in database
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    frames.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    // Combine with standards and sort
    const all = Array.from(new Set([...STANDARD_CATEGORIES, ...Array.from(set)]));
    return all.sort((a, b) => {
      const ia = STANDARD_CATEGORIES.indexOf(a);
      const ib = STANDARD_CATEGORIES.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [frames]);

  // Metrics
  const metrics = useMemo(() => {
    const total = frames.length;
    let relationship = 0;
    let role = 0;
    let animated = 0;
    let staticCount = 0;
    let active = 0;
    let disabled = 0;

    frames.forEach((f) => {
      const isRel = (f.category || '').toUpperCase() === 'RELATIONSHIP';
      const isRole = (f.category || '').toLowerCase() === 'role';
      const hasAnim = Boolean(f.animation_url && f.animation_url.trim() && f.animation_url !== f.image_url);

      if (isRel) relationship++;
      if (isRole) role++;
      if (hasAnim) animated++;
      else staticCount++;
      if (f.is_active) active++;
      else disabled++;
    });

    return { total, relationship, role, animated, staticCount, active, disabled };
  }, [frames]);

  // Filtered & Sorted frames
  const filteredFrames = useMemo(() => {
    let result = [...frames];

    // Search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((f) => {
        const idMatch = String(f.id) === q || `#${f.id}` === q;
        const nameMatch = f.name?.toLowerCase().includes(q);
        const slugMatch = f.slug?.toLowerCase().includes(q);
        const catMatch = f.category?.toLowerCase().includes(q);
        return idMatch || nameMatch || slugMatch || catMatch;
      });
    }

    // Category filter
    if (categoryFilter !== 'ALL') {
      result = result.filter(
        (f) => (f.category || '').toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    // Media filter
    if (mediaFilter !== 'ALL') {
      result = result.filter((f) => {
        const meta = detectMediaMeta(f);
        if (mediaFilter === 'ANIMATED') return meta.type !== 'static';
        if (mediaFilter === 'STATIC') return meta.type === 'static';
        if (mediaFilter === 'REAL_MOTION') return meta.type === 'real_motion';
        if (mediaFilter === 'SPARKLE') return meta.type === 'sparkle';
        if (mediaFilter === 'VIDEO') return meta.type === 'video';
        return true;
      });
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((f) => (statusFilter === 'ACTIVE' ? f.is_active : !f.is_active));
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'ID_ASC') return a.id - b.id;
      if (sortBy === 'ID_DESC') return b.id - a.id;
      if (sortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      if (sortBy === 'NAME_DESC') return b.name.localeCompare(a.name);
      if (sortBy === 'LEVEL_ASC') return a.level_required - b.level_required;
      if (sortBy === 'PRICE_DESC') return (b.coin_cost ?? 0) - (a.coin_cost ?? 0);
      return 0;
    });

    return result;
  }, [frames, searchQuery, categoryFilter, mediaFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'ALL' ||
    mediaFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  function resetFilters() {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setMediaFilter('ALL');
    setStatusFilter('ALL');
  }

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
          image_url: imageUrl.trim(),
          animation_url: animationUrl.trim(),
          composite_mode: composite,
          avatar_scale: avatarScale.trim() ? Number(avatarScale) : 0.58,
          avatar_offset_y: avatarOffsetY.trim() ? Number(avatarOffsetY) : 0,
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
      setIsPremium(false);
      setCoinCost('0');
      setShowCreateBox(false);
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
    setEditAnimationUrl(frame.animation_url ?? '');
    setEditComposite(frame.composite_mode === 'screen' ? 'screen' : 'alpha');
    setEditAvatarScale(frame.avatar_scale != null ? String(frame.avatar_scale) : '');
    setEditAvatarOffsetY(frame.avatar_offset_y != null ? String(frame.avatar_offset_y) : '');
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
          image_url: editImageUrl.trim(),
          animation_url: editAnimationUrl.trim(),
          composite_mode: editComposite,
          avatar_scale: editAvatarScale.trim() ? Number(editAvatarScale) : null,
          avatar_offset_y: editAvatarOffsetY.trim() ? Number(editAvatarOffsetY) : null,
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
    <main style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Avatar & Relationship Frames
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Comprehensive catalog for Avatar store frames, Role & VIP badges, and CP/BCP couple frames.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateBox(!showCreateBox)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: showCreateBox ? '#4b5563' : '#4f46e5',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {showCreateBox ? '✕ Close Form' : '+ Add New Frame'}
        </button>
      </div>

      {/* KPI / Quick Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        {/* Total */}
        <div
          onClick={() => {
            setCategoryFilter('ALL');
            setMediaFilter('ALL');
            setStatusFilter('ALL');
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '14px 18px',
            border: categoryFilter === 'ALL' && mediaFilter === 'ALL' && statusFilter === 'ALL' ? '2px solid #4f46e5' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Frames
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginTop: '4px' }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>All catalog entries</div>
        </div>

        {/* Relationship Frames */}
        <div
          onClick={() => {
            setCategoryFilter('RELATIONSHIP');
            setMediaFilter('ALL');
            setStatusFilter('ALL');
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '14px 18px',
            border: categoryFilter.toUpperCase() === 'RELATIONSHIP' ? '2px solid #ec4899' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#be185d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ❤️ Relationship (CP/BCP)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#be185d', marginTop: '4px' }}>
            {metrics.relationship}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>Couple & Rank 1 frames</div>
        </div>

        {/* Role Frames */}
        <div
          onClick={() => {
            setCategoryFilter('role');
            setMediaFilter('ALL');
            setStatusFilter('ALL');
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '14px 18px',
            border: categoryFilter.toLowerCase() === 'role' ? '2px solid #7c3aed' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            👑 Staff & Role
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#6d28d9', marginTop: '4px' }}>
            {metrics.role}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>Admin, CEO, Manager</div>
        </div>

        {/* Animated Frames */}
        <div
          onClick={() => {
            setMediaFilter('ANIMATED');
            setCategoryFilter('ALL');
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '14px 18px',
            border: mediaFilter === 'ANIMATED' ? '2px solid #0284c7' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🎬 Animated Motion
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>
            {metrics.animated}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>WebP & Video glow</div>
        </div>

        {/* Active vs Disabled */}
        <div
          onClick={() => {
            setStatusFilter(statusFilter === 'DISABLED' ? 'ALL' : 'DISABLED');
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '14px 18px',
            border: statusFilter === 'DISABLED' ? '2px solid #ef4444' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ✅ {metrics.active} Active / {metrics.disabled} Off
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: metrics.disabled > 0 ? '#b91c1c' : '#059669', marginTop: '4px' }}>
            {metrics.active}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            {metrics.disabled > 0 ? `⚠️ ${metrics.disabled} disabled (click)` : 'All frames active'}
          </div>
        </div>
      </div>

      {/* Creation Box (Collapsible) */}
      {showCreateBox && (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            border: '2px solid #c7d2fe',
            marginBottom: '28px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#111827' }}>
              Add New Avatar / Relationship Frame
            </h2>
            <button
              type="button"
              onClick={() => {
                setAvatarScale('0.58');
                setAvatarOffsetY('0');
              }}
              style={{
                fontSize: '0.78rem',
                background: '#e0e7ff',
                color: '#3730a3',
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid #c7d2fe',
                cursor: 'pointer',
              }}
            >
              📐 Apply Spec Standard (58% Hole)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Frame Name *
              </label>
              <input
                type="text"
                placeholder="e.g. CP Normal Frame / Phoenix Wing"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c} {c.toUpperCase() === 'RELATIONSHIP' ? '(CP / BCP)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Level Required
              </label>
              <input
                type="number"
                value={levelReq}
                onChange={(e) => setLevelReq(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Coin Cost
              </label>
              <input
                type="number"
                placeholder="0"
                value={coinCost}
                onChange={(e) => setCoinCost(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <FileUploadInput
              label="Frame Poster (.png, .webp)"
              value={imageUrl}
              onChange={(url) => setImageUrl(url)}
              accept="image/*"
              placeholder="https://storage.googleapis.com/chataura/.../frame.png"
              helpText="Still preview for the catalog. 512×512 square transparent PNG."
            />
            <FileUploadInput
              label="Frame Animation (.webp, .mp4, .webm, .svga)"
              value={animationUrl}
              onChange={(url) => {
                setAnimationUrl(url);
                setComposite(compositeForAnimation(url));
              }}
              accept={ANIMATION_ACCEPT}
              placeholder="https://storage.googleapis.com/chataura/.../frame.webp"
              helpText="Looping avatar ring. WebP transparent animation or MP4 video glow."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Composite Mode
              </label>
              <select
                value={composite}
                onChange={(e) => setComposite(e.target.value === 'screen' ? 'screen' : 'alpha')}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                <option value="alpha">Alpha (Transparent WebP, PNG, WebM)</option>
                <option value="screen">Screen (Black Background Glow MP4)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Photo Scale (Hole Ratio: 0.58)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.2"
                max="1.0"
                value={avatarScale}
                onChange={(e) => setAvatarScale(e.target.value)}
                placeholder="0.58"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Photo Offset Y (0.0 = Centered)
              </label>
              <input
                type="number"
                step="0.01"
                min="-0.5"
                max="0.5"
                value={avatarOffsetY}
                onChange={(e) => setAvatarOffsetY(e.target.value)}
                placeholder="0"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
          </div>

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

          <div style={{ display: 'flex', gap: '12px' }}>
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
            <button
              type="button"
              onClick={() => setShowCreateBox(false)}
              style={{
                padding: '10px 20px',
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
          </div>
        </div>
      )}

      {/* FILTER & CONTROL TOOLBAR */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e5e7eb',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                fontSize: '1rem',
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, slug, ID or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 34px 9px 38px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '1rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            {/* Category Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Category:
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: categoryFilter !== 'ALL' ? '#eef2ff' : '#fff',
                  color: categoryFilter !== 'ALL' ? '#3730a3' : '#374151',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Categories ({frames.length})</option>
                {availableCategories.map((cat) => {
                  const count = frames.filter((f) => (f.category || '').toLowerCase() === cat.toLowerCase()).length;
                  const isRel = cat.toUpperCase() === 'RELATIONSHIP';
                  return (
                    <option key={cat} value={cat}>
                      {isRel ? '❤️ ' : ''}{cat} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Media Animation Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Media:
              </span>
              <select
                value={mediaFilter}
                onChange={(e) => setMediaFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: mediaFilter !== 'ALL' ? '#e0f2fe' : '#fff',
                  color: mediaFilter !== 'ALL' ? '#0369a1' : '#374151',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Formats ({frames.length})</option>
                <option value="ANIMATED">🎬 Animated Only ({metrics.animated})</option>
                <option value="STATIC">🖼️ Static Only ({metrics.staticCount})</option>
                <option value="REAL_MOTION">✨ Real Motion WebP</option>
                <option value="SPARKLE">💫 Sparkle WebP</option>
                <option value="VIDEO">🎥 Video Screen (MP4)</option>
              </select>
            </div>

            {/* Status Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: statusFilter !== 'ALL' ? '#fef3c7' : '#fff',
                  color: statusFilter !== 'ALL' ? '#92400e' : '#374151',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">✅ Active Only ({metrics.active})</option>
                <option value="DISABLED">🚫 Disabled Only ({metrics.disabled})</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                Sort:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                <option value="ID_ASC">ID (Oldest first)</option>
                <option value="ID_DESC">ID (Newest first)</option>
                <option value="NAME_ASC">Name (A → Z)</option>
                <option value="NAME_DESC">Name (Z → A)</option>
                <option value="LEVEL_ASC">Level Req (Low → High)</option>
                <option value="PRICE_DESC">Price (High → Low)</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div
              style={{
                display: 'inline-flex',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                overflow: 'hidden',
                marginLeft: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                style={{
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  backgroundColor: viewMode === 'GRID' ? '#111827' : '#fff',
                  color: viewMode === 'GRID' ? '#fff' : '#4b5563',
                  borderRadius: 0,
                  border: 'none',
                  cursor: 'pointer',
                }}
                title="Grid Card View"
              >
                ⊞ Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                style={{
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  backgroundColor: viewMode === 'TABLE' ? '#111827' : '#fff',
                  color: viewMode === 'TABLE' ? '#fff' : '#4b5563',
                  borderRadius: 0,
                  border: 'none',
                  cursor: 'pointer',
                }}
                title="Dense Table View"
              >
                ☰ Table
              </button>
            </div>
          </div>
        </div>

        {/* Quick Filter Chips & Results Count */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid #f3f4f6',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
              Quick:
            </span>
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('RELATIONSHIP');
                setMediaFilter('ALL');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                backgroundColor: categoryFilter.toUpperCase() === 'RELATIONSHIP' ? '#be185d' : '#fdf2f8',
                color: categoryFilter.toUpperCase() === 'RELATIONSHIP' ? '#fff' : '#be185d',
                border: '1px solid #fbcfe8',
                cursor: 'pointer',
              }}
            >
              ❤️ Relationship ({metrics.relationship})
            </button>

            <button
              type="button"
              onClick={() => {
                setCategoryFilter('role');
                setMediaFilter('ALL');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                backgroundColor: categoryFilter.toLowerCase() === 'role' ? '#6d28d9' : '#f5f3ff',
                color: categoryFilter.toLowerCase() === 'role' ? '#fff' : '#6d28d9',
                border: '1px solid #ddd6fe',
                cursor: 'pointer',
              }}
            >
              👑 Roles ({metrics.role})
            </button>

            <button
              type="button"
              onClick={() => {
                setCategoryFilter('LEGENDARY');
                setMediaFilter('ALL');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                backgroundColor: categoryFilter.toUpperCase() === 'LEGENDARY' ? '#b45309' : '#fffbeb',
                color: categoryFilter.toUpperCase() === 'LEGENDARY' ? '#fff' : '#b45309',
                border: '1px solid #fde68a',
                cursor: 'pointer',
              }}
            >
              ⭐ Legendary
            </button>

            <button
              type="button"
              onClick={() => {
                setMediaFilter(mediaFilter === 'ANIMATED' ? 'ALL' : 'ANIMATED');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                backgroundColor: mediaFilter === 'ANIMATED' ? '#0284c7' : '#f0f9ff',
                color: mediaFilter === 'ANIMATED' ? '#fff' : '#0369a1',
                border: '1px solid #bae6fd',
                cursor: 'pointer',
              }}
            >
              🎬 Animated ({metrics.animated})
            </button>

            <button
              type="button"
              onClick={() => {
                setMediaFilter(mediaFilter === 'STATIC' ? 'ALL' : 'STATIC');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                backgroundColor: mediaFilter === 'STATIC' ? '#475569' : '#f8fafc',
                color: mediaFilter === 'STATIC' ? '#fff' : '#475569',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
              }}
            >
              🖼️ Static ({metrics.staticCount})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Showing <strong style={{ color: '#111827' }}>{filteredFrames.length}</strong> of {frames.length} frames
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fca5a5',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ✕ Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Copied Slug Toast Feedback */}
      {copiedSlug && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#111827',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
          }}
        >
          ✓ Copied slug: <code>{copiedSlug}</code>
        </div>
      )}

      {/* MAIN FRAMES CONTENT */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔄</div>
          <p style={{ margin: 0, fontWeight: 500 }}>Loading frames catalog...</p>
        </div>
      ) : filteredFrames.length === 0 ? (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 8px 0', color: '#111827' }}>
            No frames match your filters
          </h3>
          <p style={{ color: '#6b7280', margin: '0 0 16px 0', fontSize: '0.9rem' }}>
            Try clearing the search query or changing your category and media filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: '8px 18px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'GRID' ? (
        /* GRID VIEW */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredFrames.map((f) => {
            const catStyle = getCategoryStyle(f.category);
            const mediaMeta = detectMediaMeta(f);
            return (
              <div
                key={f.id}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '14px',
                  padding: '20px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  border: f.is_active ? '1px solid #e5e7eb' : '1px solid #fecaca',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                {/* ID & Media Type Badges Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#6b7280',
                      backgroundColor: '#f3f4f6',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    #{f.id}
                  </span>

                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: mediaMeta.color,
                      backgroundColor: `${mediaMeta.color}15`,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {mediaMeta.icon} {mediaMeta.label}
                  </span>
                </div>

                {/* Thumbnail Circle */}
                <div style={{ alignSelf: 'center', marginBottom: '14px', position: 'relative' }}>
                  <div
                    style={{
                      width: '104px',
                      height: '104px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                    }}
                  >
                    <MediaThumb
                      imageUrl={f.image_url}
                      animationUrl={f.animation_url}
                      composite={f.composite_mode}
                      alt={f.name}
                      fallback="⭕"
                      rounded
                    />
                  </div>

                  {/* Hole Fit Tag (If explicitly set) */}
                  {f.avatar_scale != null && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '-6px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        backgroundColor: '#111827',
                        color: '#f9fafb',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Scale: ${f.avatar_scale}, Offset: ${f.avatar_offset_y ?? 0}`}
                    >
                      Hole: {Math.round(f.avatar_scale * 100)}%
                    </span>
                  )}
                </div>

                {/* Frame Name */}
                <div
                  style={{
                    fontWeight: 700,
                    color: '#111827',
                    fontSize: '1.05rem',
                    marginBottom: '4px',
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}
                  title={f.name}
                >
                  {f.name}
                </div>

                {/* Slug with Click-to-Copy */}
                {f.slug && (
                  <div
                    onClick={() => copySlug(f.slug!)}
                    style={{
                      fontSize: '0.72rem',
                      color: '#6b7280',
                      fontFamily: 'monospace',
                      textAlign: 'center',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      alignSelf: 'center',
                    }}
                    title="Click to copy slug"
                  >
                    <span>{f.slug}</span>
                    <span style={{ fontSize: '0.7rem' }}>📋</span>
                  </div>
                )}

                {/* Category & Attributes Badges */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', margin: '4px 0 10px 0' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      backgroundColor: catStyle.bg,
                      color: catStyle.text,
                      border: `1px solid ${catStyle.border}`,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {catStyle.icon} {f.category}
                  </span>

                  <span
                    style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}
                  >
                    Lvl {f.level_required}+
                  </span>

                  {f.is_premium && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: '#fae8ff',
                        color: '#86198f',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}
                    >
                      ⭐ Premium
                    </span>
                  )}
                </div>

                {/* Price / Unlock */}
                <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.88rem', textAlign: 'center', marginBottom: '10px' }}>
                  {f.coin_cost && f.coin_cost > 0 ? `🪙 ${f.coin_cost.toLocaleString()} Coins` : 'Free / Relationship Unlock'}
                </div>

                {/* Active Indicator */}
                <div style={{ width: '100%', marginBottom: '10px' }}>
                  <span
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      padding: '4px 0',
                      borderRadius: '6px',
                      background: f.is_active ? '#d1fae5' : '#fee2e2',
                      color: f.is_active ? '#065f46' : '#991b1b',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {f.is_active ? '● Active in Catalog' : '○ Disabled'}
                  </span>
                </div>

                {/* Actions Footer */}
                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => void toggleActive(f.id, f.is_active)}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      fontSize: '0.75rem',
                      background: f.is_active ? '#f3f4f6' : '#dcfce7',
                      color: f.is_active ? '#374151' : '#15803d',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {f.is_active ? 'Disable' : 'Enable'}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEdit(f)}
                    style={{
                      padding: '7px 12px',
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
                      padding: '7px 10px',
                      fontSize: '0.75rem',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 16px', width: '56px' }}>Media</th>
                <th style={{ padding: '12px 14px' }}>ID & Name</th>
                <th style={{ padding: '12px 14px' }}>Slug</th>
                <th style={{ padding: '12px 14px' }}>Category</th>
                <th style={{ padding: '12px 14px' }}>Level & Cost</th>
                <th style={{ padding: '12px 14px' }}>Format</th>
                <th style={{ padding: '12px 14px' }}>Fit (Hole)</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFrames.map((f) => {
                const catStyle = getCategoryStyle(f.category);
                const mediaMeta = detectMediaMeta(f);
                return (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      opacity: f.is_active ? 1 : 0.65,
                    }}
                  >
                    {/* Media Preview */}
                    <td style={{ padding: '10px 16px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <MediaThumb
                          imageUrl={f.image_url}
                          animationUrl={f.animation_url}
                          composite={f.composite_mode}
                          alt={f.name}
                          fallback="⭕"
                          rounded
                        />
                      </div>
                    </td>

                    {/* ID & Name */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{f.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>#{f.id}</div>
                    </td>

                    {/* Slug */}
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#4b5563' }}>
                      <span
                        onClick={() => copySlug(f.slug ?? '')}
                        style={{ cursor: 'pointer', borderBottom: '1px dashed #9ca3af' }}
                        title="Click to copy"
                      >
                        {f.slug || '—'}
                      </span>
                    </td>

                    {/* Category */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          backgroundColor: catStyle.bg,
                          color: catStyle.text,
                          border: `1px solid ${catStyle.border}`,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {catStyle.icon} {f.category}
                      </span>
                    </td>

                    {/* Level & Cost */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                        Lvl {f.level_required}+
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 600 }}>
                        {f.coin_cost && f.coin_cost > 0 ? `🪙 ${f.coin_cost}` : 'Free'}
                      </div>
                    </td>

                    {/* Format */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: mediaMeta.color,
                          backgroundColor: `${mediaMeta.color}15`,
                          padding: '2px 8px',
                          borderRadius: '999px',
                        }}
                      >
                        {mediaMeta.icon} {mediaMeta.label}
                      </span>
                    </td>

                    {/* Fit */}
                    <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#6b7280' }}>
                      {f.avatar_scale != null ? (
                        <span style={{ fontWeight: 600, color: '#111827' }}>
                          {Math.round(f.avatar_scale * 100)}%
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Default (58%)</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: f.is_active ? '#d1fae5' : '#fee2e2',
                          color: f.is_active ? '#065f46' : '#991b1b',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {f.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => void toggleActive(f.id, f.is_active)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          {f.is_active ? 'Disable' : 'Enable'}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            background: '#e0e7ff',
                            color: '#3730a3',
                            border: '1px solid #c7d2fe',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteFrame(f.id)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EDIT MODAL */}
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
              borderRadius: '14px',
              padding: '28px',
              maxWidth: '580px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                  Edit Frame #{editingFrame.id}
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace', marginTop: '2px' }}>
                  {editingFrame.slug}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Frame Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Frame Name *
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            {/* Category & Level */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c} {c.toUpperCase() === 'RELATIONSHIP' ? '(CP / BCP)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Level Required
                </label>
                <input
                  type="number"
                  value={editLevelReq}
                  onChange={(e) => setEditLevelReq(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            {/* Coin Cost */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Coin Cost
              </label>
              <input
                type="number"
                value={editCoinCost}
                onChange={(e) => setEditCoinCost(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>

            {/* Media Uploads */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <FileUploadInput
                label="Frame Poster (.png, .webp)"
                value={editImageUrl}
                onChange={(url) => setEditImageUrl(url)}
                accept="image/*"
                placeholder="https://storage.googleapis.com/.../poster.png"
              />
              <FileUploadInput
                label="Frame Animation (.webp, .mp4, .webm, .svga)"
                value={editAnimationUrl}
                onChange={(url) => {
                  setEditAnimationUrl(url);
                  setEditComposite(compositeForAnimation(url));
                }}
                accept={ANIMATION_ACCEPT}
                placeholder="https://storage.googleapis.com/.../animation.webp"
              />
            </div>

            {/* Composite */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                Composite Mode
              </label>
              <select
                value={editComposite}
                onChange={(e) => setEditComposite(e.target.value === 'screen' ? 'screen' : 'alpha')}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff' }}
              >
                <option value="alpha">Alpha (Transparent PNG, WebM, WebP, SVGA)</option>
                <option value="screen">Screen (Black background glow video)</option>
              </select>
            </div>

            {/* Fit Controls */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Photo Size / Hole (0.2–1.0)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.2"
                  max="1.0"
                  value={editAvatarScale}
                  onChange={(e) => setEditAvatarScale(e.target.value)}
                  placeholder="0.58 (Standard)"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Photo Move Down (-0.5–0.5)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="-0.5"
                  max="0.5"
                  value={editAvatarOffsetY}
                  onChange={(e) => setEditAvatarOffsetY(e.target.value)}
                  placeholder="0.0 (Centered)"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                Standard: Scale = 0.58 (58% hole), Move Down = 0.0.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditAvatarScale('0.58');
                  setEditAvatarOffsetY('0');
                }}
                style={{
                  fontSize: '0.74rem',
                  padding: '3px 8px',
                  background: '#f3f4f6',
                  color: '#4f46e5',
                  border: '1px solid #c7d2fe',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Set 58% Standard
              </button>
            </div>

            {/* Checkboxes */}
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
                  Active in Store & App
                </label>
              </div>
            </div>

            {editError && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>⚠️ {editError}</p>}

            {/* Modal Buttons */}
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
