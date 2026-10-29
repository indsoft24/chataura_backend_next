'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb, { compositeForAnimation } from '@/app/components/MediaThumb';
import { Field, MediaCard, MediaSkeleton, Modal, PageHeader, SearchBox, Switch, Tabs, errorText, useConfirm, useToasts } from '@/components/admin-ui';

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
  avatar_scale?: number | null;
  avatar_offset_y?: number | null;
};

const ROLE_KEYS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Manager' },
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'coin_seller', label: 'Coin Seller' },
];
const roleLabel = (k: string | null) => ROLE_KEYS.find((r) => r.value === (k || 'admin'))?.label ?? k ?? 'Admin';

type Draft = { id?: number; name: string; roleKey: string; imageUrl: string; animationUrl: string; composite: 'alpha' | 'screen'; avatarScale: string; avatarOffsetY: string; isActive: boolean };
const NEW_DRAFT: Draft = { name: '', roleKey: 'admin', imageUrl: '', animationUrl: '', composite: 'alpha', avatarScale: '', avatarOffsetY: '', isActive: true };

export default function RoleFramesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { frames: Frame[] } }>('/admin/frames?category=role', token);
      setFrames(json.data?.frames ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load role frames'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    frames.forEach((f) => { const k = f.animation_key || 'admin'; c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [frames]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return frames.filter((f) => (!role || (f.animation_key || 'admin') === role) && (!term || f.name.toLowerCase().includes(term) || String(f.id) === term));
  }, [frames, role, q]);

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Role frame name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (draft.id) {
        await api(`/admin/frames/${draft.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            name: draft.name.trim(),
            animation_key: draft.roleKey,
            image_url: draft.imageUrl.trim(),
            animation_url: draft.animationUrl.trim(),
            composite_mode: draft.composite,
            // Empty = null = app default fit.
            avatar_scale: draft.avatarScale.trim() ? Number(draft.avatarScale) : null,
            avatar_offset_y: draft.avatarOffsetY.trim() ? Number(draft.avatarOffsetY) : null,
            is_active: draft.isActive,
          }),
        });
        toast('success', `${draft.name.trim()} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/frames', token, {
          method: 'POST',
          body: JSON.stringify({
            name: draft.name.trim(),
            category: 'role',
            level_required: 1,
            is_premium: true,
            animation_key: draft.roleKey,
            slug: `role_${draft.roleKey}_${Date.now()}`,
            image_url: draft.imageUrl.trim(),
            animation_url: draft.animationUrl.trim(),
            composite_mode: draft.composite,
          }),
        });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${draft.name.trim()} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save role frame'));
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
      toast('error', errorText(e, 'Could not update role frame'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(f: Frame) {
    confirm({
      title: `Delete “${f.name}”?`,
      message: 'Staff using this frame fall back to the default. This cannot be undone.',
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

  return (
    <main className="cp-page">
      <PageHeader
        title="Role Frames"
        subtitle="Prestige frames reserved for Admins, CEOs, Managers and Coin Sellers."
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New role frame</button>}
      />

      <section className="cp-card">
        <Tabs value={role} onChange={setRole} tabs={[{ value: '', label: 'All', count: frames.length }, ...ROLE_KEYS.map((r) => ({ value: r.value, label: r.label, count: counts[r.value] ?? 0 }))]} />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" />
        </div>
        <div className="cp-summary">Showing <strong>{visible.length}</strong> of <strong>{frames.length}</strong></div>
        {loading && frames.length === 0 ? (
          <MediaSkeleton count={4} />
        ) : visible.length === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-title">{frames.length ? 'No role frames match' : 'No role frames yet'}</div>
            {frames.length ? 'Try another role or search.' : 'Add the first staff frame.'}
          </div>
        ) : (
          <div className="cp-media-grid">
            {visible.map((f) => (
              <MediaCard
                key={f.id}
                thumbClass={f.composite_mode === 'screen' ? 'is-dark' : ''}
                thumb={<MediaThumb imageUrl={f.image_url} animationUrl={f.animation_url} composite={f.composite_mode} alt={f.name} fallback="🛡️" rounded />}
                flags={<><span className="cp-badge indigo">{roleLabel(f.animation_key)}</span><span /></>}
                title={f.name}
                meta={`#${f.id}${f.avatar_scale != null ? ` · hole ${Math.round(f.avatar_scale * 100)}%` : ''}`}
                active={f.is_active}
                busy={busyId === f.id}
                onToggle={() => void toggleActive(f)}
                onEdit={() => {
                  setFormError('');
                  setDraft({
                    id: f.id,
                    name: f.name,
                    roleKey: f.animation_key || 'admin',
                    imageUrl: f.image_url ?? '',
                    animationUrl: f.animation_url ?? '',
                    composite: f.composite_mode === 'screen' ? 'screen' : 'alpha',
                    avatarScale: f.avatar_scale != null ? String(f.avatar_scale) : '',
                    avatarOffsetY: f.avatar_offset_y != null ? String(f.avatar_offset_y) : '',
                    isActive: f.is_active,
                  });
                }}
                onDelete={() => remove(f)}
              />
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal
          size="wide"
          title={draft.id ? `Edit role frame #${draft.id}` : 'New role frame'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create frame'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Frame name *">
              <input autoFocus placeholder="e.g. Commander Frame" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Role">
              <select value={draft.roleKey} onChange={(e) => set({ roleKey: e.target.value })}>
                {ROLE_KEYS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <FileUploadInput
            label="Poster (.png, .webp)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*"
            placeholder="https://.../role_frame_poster.png"
            helpText="Still preview. Leave empty when uploading a video and a poster is generated."
          />
          <FileUploadInput
            label="Animation (.svga, .gif, .webp, .mp4, .webm)"
            value={draft.animationUrl}
            onChange={(url) => set({ animationUrl: url, composite: compositeForAnimation(url) })}
            accept={ANIMATION_ACCEPT}
            placeholder="https://.../role_frame.mp4"
            helpText="Looping staff frame. MP4 glow clips on black use Screen composite."
          />
          <Field label="Composite mode">
            <select value={draft.composite} onChange={(e) => set({ composite: e.target.value === 'screen' ? 'screen' : 'alpha' })}>
              <option value="alpha">Alpha (transparent PNG, WebM, SVGA)</option>
              <option value="screen">Screen (black background glow video)</option>
            </select>
          </Field>
          {draft.id ? (
            <>
              <div className="cp-form-grid is-2up">
                <Field label="Photo size (0.2–1)">
                  <input type="number" step="0.01" min="0.2" max="1" placeholder="Default" value={draft.avatarScale} onChange={(e) => set({ avatarScale: e.target.value })} />
                </Field>
                <Field label="Photo move down (−0.5–0.5)">
                  <input type="number" step="0.01" min="-0.5" max="0.5" placeholder="0" value={draft.avatarOffsetY} onChange={(e) => set({ avatarOffsetY: e.target.value })} />
                </Field>
              </div>
              <div className="cp-field-hint">Photo size = hole width ÷ frame width. Move down = how far the hole centre sits below the frame centre, as a share of frame height. Leave empty for the default.</div>
              <div className="cp-toggle-row">
                <div className="cp-toggle-title">Active for privileged staff</div>
                <Switch label="Active" checked={draft.isActive} onChange={(v) => set({ isActive: v })} />
              </div>
            </>
          ) : null}
          {formError && <div className="cp-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}
