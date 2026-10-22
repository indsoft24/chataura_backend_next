'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb, { compositeForAnimation, isLoopingVideo } from '@/app/components/MediaThumb';
import {
  EmptyRow,
  Field,
  Kpi,
  MediaCard,
  MediaSkeleton,
  Modal,
  PageHeader,
  Pager,
  SearchBox,
  Switch,
  errorText,
  useClientPager,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

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

type Draft = {
  id?: number;
  name: string;
  category: string;
  levelReq: string;
  coinCost: string;
  isPremium: boolean;
  imageUrl: string;
  animationUrl: string;
  composite: 'alpha' | 'screen';
  avatarScale: string;
  avatarOffsetY: string;
  isActive: boolean;
};
const NEW_DRAFT: Draft = { name: '', category: 'avatar', levelReq: '1', coinCost: '0', isPremium: false, imageUrl: '', animationUrl: '', composite: 'alpha', avatarScale: '0.58', avatarOffsetY: '0', isActive: true };

function CategoryBadge({ cat }: { cat: string }) {
  const st = getCategoryStyle(cat);
  return <span className="ad-badge" style={{ background: st.bg, color: st.text }}>{st.icon} {cat}</span>;
}

export default function FramesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [mediaFilter, setMediaFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ID_ASC' | 'ID_DESC' | 'NAME_ASC' | 'NAME_DESC' | 'LEVEL_ASC' | 'PRICE_DESC'>('ID_ASC');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames', token);
      setFrames(json.data?.frames ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load frames'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function copySlug(slug: string) {
    if (!slug) return;
    void navigator.clipboard.writeText(slug);
    toast('success', `Copied ${slug}`);
  }

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    frames.forEach((f) => {
      if (f.category) set.add(f.category);
    });
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

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    frames.forEach((f) => { const k = (f.category || '').toLowerCase(); m[k] = (m[k] ?? 0) + 1; });
    return m;
  }, [frames]);

  const metrics = useMemo(() => {
    let relationship = 0;
    let role = 0;
    let animated = 0;
    let active = 0;
    frames.forEach((f) => {
      if ((f.category || '').toUpperCase() === 'RELATIONSHIP') relationship++;
      if ((f.category || '').toLowerCase() === 'role') role++;
      if (detectMediaMeta(f).type !== 'static') animated++;
      if (f.is_active) active++;
    });
    return { total: frames.length, relationship, role, animated, active, disabled: frames.length - active };
  }, [frames]);

  const filteredFrames = useMemo(() => {
    let result = [...frames];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((f) =>
        String(f.id) === q || `#${f.id}` === q ||
        f.name?.toLowerCase().includes(q) || f.slug?.toLowerCase().includes(q) || f.category?.toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== 'ALL') result = result.filter((f) => (f.category || '').toLowerCase() === categoryFilter.toLowerCase());
    if (mediaFilter !== 'ALL') {
      result = result.filter((f) => {
        const t = detectMediaMeta(f).type;
        if (mediaFilter === 'ANIMATED') return t !== 'static';
        if (mediaFilter === 'STATIC') return t === 'static';
        if (mediaFilter === 'REAL_MOTION') return t === 'real_motion';
        if (mediaFilter === 'SPARKLE') return t === 'sparkle';
        if (mediaFilter === 'VIDEO') return t === 'video';
        return true;
      });
    }
    if (statusFilter !== 'ALL') result = result.filter((f) => (statusFilter === 'ACTIVE' ? f.is_active : !f.is_active));
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
  const { pageItems, pagerProps } = useClientPager(filteredFrames, `${searchQuery}|${categoryFilter}|${mediaFilter}|${statusFilter}|${sortBy}`, 50);

  const hasActiveFilters = searchQuery.trim() !== '' || categoryFilter !== 'ALL' || mediaFilter !== 'ALL' || statusFilter !== 'ALL';
  function resetFilters() {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setMediaFilter('ALL');
    setStatusFilter('ALL');
  }

  function openEdit(f: Frame) {
    setFormError('');
    setDraft({
      id: f.id,
      name: f.name,
      category: f.category,
      levelReq: String(f.level_required),
      coinCost: f.coin_cost !== null ? String(f.coin_cost) : '0',
      isPremium: f.is_premium,
      imageUrl: f.image_url ?? '',
      animationUrl: f.animation_url ?? '',
      composite: f.composite_mode === 'screen' ? 'screen' : 'alpha',
      avatarScale: f.avatar_scale != null ? String(f.avatar_scale) : '',
      avatarOffsetY: f.avatar_offset_y != null ? String(f.avatar_offset_y) : '',
      isActive: f.is_active,
    });
  }

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Frame name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    const base = {
      name: draft.name.trim(),
      category: draft.category,
      level_required: Number(draft.levelReq) || 1,
      coin_cost: draft.coinCost ? Number(draft.coinCost) : null,
      is_premium: draft.isPremium,
      image_url: draft.imageUrl.trim(),
      animation_url: draft.animationUrl.trim(),
      composite_mode: draft.composite,
    };
    try {
      if (draft.id) {
        await api(`/admin/frames/${draft.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            ...base,
            avatar_scale: draft.avatarScale.trim() ? Number(draft.avatarScale) : null,
            avatar_offset_y: draft.avatarOffsetY.trim() ? Number(draft.avatarOffsetY) : null,
            is_active: draft.isActive,
          }),
        });
        toast('success', `${base.name} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/frames', token, {
          method: 'POST',
          body: JSON.stringify({
            ...base,
            avatar_scale: draft.avatarScale.trim() ? Number(draft.avatarScale) : 0.58,
            avatar_offset_y: draft.avatarOffsetY.trim() ? Number(draft.avatarOffsetY) : 0,
          }),
        });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${base.name} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save frame'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(f: Frame) {
    if (!token) return;
    setBusyId(f.id);
    try {
      await api(`/admin/frames/${f.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !f.is_active }) });
      setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, is_active: !f.is_active } : x)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update frame'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(f: Frame) {
    confirm({
      title: `Delete “${f.name}”?`,
      message: 'The frame is removed from the catalog. Users who own it may lose it. This cannot be undone.',
      confirmLabel: 'Delete frame',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/frames/${f.id}`, token, { method: 'DELETE' });
        toast('success', `${f.name} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const thumb = (f: Frame) => <MediaThumb imageUrl={f.image_url} animationUrl={f.animation_url} composite={f.composite_mode} alt={f.name} fallback="🖼️" />;

  return (
    <main className="ad-page">
      <style dangerouslySetInnerHTML={{ __html: FR_STYLES }} />
      <PageHeader
        title="Frames"
        subtitle="Avatar store frames, role & VIP badges, and CP/BCP couple frames."
        actions={<button type="button" className="ad-btn ad-btn-accent ad-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New frame</button>}
      />

      <div className="ad-kpis fr-kpis">
        <Kpi label="Total frames" value={metrics.total} sub="All catalog entries" active={!hasActiveFilters} onClick={resetFilters} />
        <Kpi label="❤️ Relationship" value={metrics.relationship} sub="CP / BCP frames" active={categoryFilter === 'RELATIONSHIP'} onClick={() => { resetFilters(); setCategoryFilter('RELATIONSHIP'); }} />
        <Kpi label="👑 Staff & role" value={metrics.role} sub="Admin, CEO, Manager" active={categoryFilter === 'role'} onClick={() => { resetFilters(); setCategoryFilter('role'); }} />
        <Kpi label="🎬 Animated" value={metrics.animated} sub="WebP & video" active={mediaFilter === 'ANIMATED'} onClick={() => { resetFilters(); setMediaFilter('ANIMATED'); }} />
        <Kpi label="Disabled" value={metrics.disabled} sub={`${metrics.active} active`} tone={metrics.disabled ? 'red' : undefined} active={statusFilter === 'DISABLED'} onClick={() => { resetFilters(); setStatusFilter('DISABLED'); }} />
      </div>

      <section className="ad-card">
        <div className="ad-toolbar">
          <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search name, slug, ID or category" />
          <Field label="Category">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">All categories ({frames.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c} ({categoryCounts[c.toLowerCase()] ?? 0})</option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value)}>
              <option value="ALL">All formats</option>
              <option value="ANIMATED">Animated (any)</option>
              <option value="STATIC">Static (PNG)</option>
              <option value="REAL_MOTION">Real motion (WebP)</option>
              <option value="SPARKLE">Sparkle (WebP)</option>
              <option value="VIDEO">Video (screen)</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="ID_ASC">ID (oldest first)</option>
              <option value="ID_DESC">ID (newest first)</option>
              <option value="NAME_ASC">Name A–Z</option>
              <option value="NAME_DESC">Name Z–A</option>
              <option value="LEVEL_ASC">Level required</option>
              <option value="PRICE_DESC">Price (high → low)</option>
            </select>
          </Field>
          <div className="ad-seg fr-view" role="group" aria-label="View">
            <button type="button" className={`ad-seg-btn ${viewMode === 'GRID' ? 'is-active' : ''}`} onClick={() => setViewMode('GRID')}>Grid</button>
            <button type="button" className={`ad-seg-btn ${viewMode === 'TABLE' ? 'is-active' : ''}`} onClick={() => setViewMode('TABLE')}>Table</button>
          </div>
        </div>
        <div className="ad-summary">
          Showing <strong>{filteredFrames.length}</strong> of <strong>{frames.length}</strong> frames
          {hasActiveFilters ? <>{' · '}<button type="button" className="ad-link" onClick={resetFilters}>Clear filters</button></> : null}
        </div>

        {loading && frames.length === 0 ? (
          <MediaSkeleton />
        ) : filteredFrames.length === 0 ? (
          <div className="ad-empty">
            <div className="ad-empty-title">{frames.length ? 'No frames match' : 'No frames yet'}</div>
            {frames.length ? 'Try a different filter.' : 'Add the first avatar frame.'}
          </div>
        ) : viewMode === 'GRID' ? (
          <div className="ad-media-grid">
            {pageItems.map((f) => {
              const meta = detectMediaMeta(f);
              return (
                <MediaCard
                  key={f.id}
                  thumbClass={f.composite_mode === 'screen' ? 'is-dark' : ''}
                  thumb={thumb(f)}
                  flags={
                    <>
                      <span className="ad-badge gray">#{f.id}</span>
                      <span className="ad-badge" style={{ background: '#fff', color: meta.color }} title={meta.label}>{meta.icon}</span>
                    </>
                  }
                  title={f.name}
                  meta={
                    f.slug ? (
                      <button type="button" className="fr-slug" title="Copy slug" onClick={() => copySlug(f.slug!)}>{f.slug}</button>
                    ) : (
                      <span className="ad-hint">no slug</span>
                    )
                  }
                  extra={
                    <>
                      <div className="fr-tags">
                        <CategoryBadge cat={f.category} />
                        {f.level_required > 1 ? <span className="ad-tag">Lv {f.level_required}+</span> : null}
                        {f.is_premium ? <span className="ad-badge amber">Premium</span> : null}
                      </div>
                      <div className="ad-media-price">{f.coin_cost ? `🪙 ${f.coin_cost.toLocaleString()}` : <span className="tone-green">Free</span>}</div>
                    </>
                  }
                  active={f.is_active}
                  busy={busyId === f.id}
                  onToggle={() => void toggleActive(f)}
                  onEdit={() => openEdit(f)}
                  onDelete={() => remove(f)}
                />
              );
            })}
          </div>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table is-stack is-3up">
              <thead>
                <tr>
                  <th className="ad-th">Frame</th>
                  <th className="ad-th">Category</th>
                  <th className="ad-th ad-num">Level</th>
                  <th className="ad-th ad-num">Cost</th>
                  <th className="ad-th">Format</th>
                  <th className="ad-th ad-num">Hole</th>
                  <th className="ad-th">Active</th>
                  <th className="ad-th ad-num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <EmptyRow cols={8} title="No frames" hint="" />
                ) : (
                  pageItems.map((f) => {
                    const meta = detectMediaMeta(f);
                    return (
                      <tr key={f.id} className={`ad-row ${busyId === f.id ? 'is-busy' : ''} ${f.is_active ? '' : 'is-muted'}`}>
                        <td className="ad-td is-main">
                          <div className="ad-user">
                            <div className={`ad-thumb ${f.composite_mode === 'screen' ? 'fr-dark' : ''}`}>{thumb(f)}</div>
                            <div>
                              <div className="ad-name">{f.name}</div>
                              <div className="ad-sub">#{f.id}{f.slug ? <> · <button type="button" className="fr-slug" onClick={() => copySlug(f.slug!)}>{f.slug}</button></> : null}</div>
                            </div>
                          </div>
                        </td>
                        <td className="ad-td" data-label="Category"><CategoryBadge cat={f.category} /></td>
                        <td className="ad-td ad-num" data-label="Level">{f.level_required}+</td>
                        <td className="ad-td ad-num" data-label="Cost">{f.coin_cost ? `🪙 ${f.coin_cost.toLocaleString()}` : 'Free'}{f.is_premium ? <span className="ad-badge amber" style={{ marginLeft: 6 }}>Premium</span> : null}</td>
                        <td className="ad-td" data-label="Format" style={{ color: meta.color, fontWeight: 600, fontSize: '0.8rem' }}>{meta.icon} {meta.label}</td>
                        <td className="ad-td ad-num" data-label="Hole">{f.avatar_scale != null ? `${Math.round(f.avatar_scale * 100)}%` : '—'}</td>
                        <td className="ad-td" data-label="Active"><Switch label={`${f.name} active`} checked={f.is_active} disabled={busyId === f.id} onChange={() => void toggleActive(f)} /></td>
                        <td className="ad-td ad-num is-actions is-half">
                          <div className="ad-actions">
                            <button type="button" className="ad-btn ad-btn-ghost" onClick={() => openEdit(f)}>Edit</button>
                            <button type="button" className="ad-btn ad-btn-danger-soft" onClick={() => remove(f)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {filteredFrames.length > 50 && <Pager {...pagerProps} />}
      </section>

      {draft && (
        <Modal
          size="wide"
          title={draft.id ? `Edit frame #${draft.id}` : 'New frame'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="ad-btn ad-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create frame'}</button>
            </>
          }
        >
          <div className="ad-form-grid is-2up">
            <Field label="Frame name *" wide>
              <input autoFocus placeholder="e.g. CP Normal Frame / Phoenix Wing" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Category" wide>
              <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>{c} {c.toUpperCase() === 'RELATIONSHIP' ? '(CP / BCP)' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Level required">
              <input type="number" inputMode="numeric" value={draft.levelReq} onChange={(e) => set({ levelReq: e.target.value })} />
            </Field>
            <Field label="Coin cost">
              <div className="ad-unit"><input type="number" inputMode="numeric" placeholder="0" value={draft.coinCost} onChange={(e) => set({ coinCost: e.target.value })} /><span>coins</span></div>
            </Field>
          </div>
          <FileUploadInput
            label="Poster (.png, .webp)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*"
            placeholder="https://storage.googleapis.com/chataura/.../frame.png"
            helpText="Still preview for the catalog. 512×512 transparent PNG."
          />
          <FileUploadInput
            label="Animation (.webp, .mp4, .webm, .svga)"
            value={draft.animationUrl}
            onChange={(url) => set({ animationUrl: url, composite: compositeForAnimation(url) })}
            accept={ANIMATION_ACCEPT}
            placeholder="https://storage.googleapis.com/chataura/.../frame.webp"
            helpText="Looping avatar ring. Transparent WebP or MP4 video glow."
          />
          <div className="ad-form-grid is-2up">
            <Field label="Composite mode" wide>
              <select value={draft.composite} onChange={(e) => set({ composite: e.target.value === 'screen' ? 'screen' : 'alpha' })}>
                <option value="alpha">Alpha (transparent WebP, PNG, WebM)</option>
                <option value="screen">Screen (black-background glow MP4)</option>
              </select>
            </Field>
            <Field label="Photo scale" hint="Hole ratio; spec standard 0.58.">
              <input type="number" step="0.01" min="0.2" max="1.0" placeholder="0.58" value={draft.avatarScale} onChange={(e) => set({ avatarScale: e.target.value })} />
            </Field>
            <Field label="Photo offset Y" hint="0 = centered.">
              <input type="number" step="0.01" min="-0.5" max="0.5" placeholder="0" value={draft.avatarOffsetY} onChange={(e) => set({ avatarOffsetY: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="ad-btn ad-btn-soft" style={{ justifySelf: 'start' }} onClick={() => set({ avatarScale: '0.58', avatarOffsetY: '0' })}>
            📐 Apply spec standard (58% hole)
          </button>
          <div className="ad-toggle-row">
            <div className="ad-toggle-title">Premium frame</div>
            <Switch label="Premium" checked={draft.isPremium} onChange={(v) => set({ isPremium: v })} />
          </div>
          {draft.id ? (
            <div className="ad-toggle-row">
              <div className="ad-toggle-title">Active in catalog</div>
              <Switch label="Active" checked={draft.isActive} onChange={(v) => set({ isActive: v })} />
            </div>
          ) : null}
          {formError && <div className="ad-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}

const FR_STYLES = `
.fr-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.fr-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0; }
.fr-tags .ad-badge { font-size: 0.62rem; padding: 2px 7px; }
.ad-page .fr-slug { all: unset; cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; color: #6b7280; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.ad-page .fr-slug:hover { color: #4f46e5; text-decoration: underline; }
.fr-dark { background: #020617; }
.fr-view { align-self: flex-end; }
@media (max-width: 1100px) { .fr-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .fr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fr-kpis > :first-child { grid-column: 1 / -1; }
  .fr-view .ad-seg-btn { flex: 1; }
}
`;
