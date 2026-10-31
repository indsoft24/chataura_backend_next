'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb, { compositeForAnimation } from '@/app/components/MediaThumb';
import { Field, MediaCard, MediaSkeleton, Modal, PageHeader, SearchBox, Switch, errorText, useConfirm, useToasts } from '@/components/admin-ui';

type EntryBar = {
  id: number;
  name: string;
  level_required: number;
  image_url: string | null;
  animation_url?: string | null;
  svip_level?: number;
  composite_mode?: 'alpha' | 'screen';
  sort_order?: number;
  coin_cost?: number;
  is_active: boolean;
};

type Draft = {
  id?: number;
  name: string;
  levelReq: string;
  svipLevel: string;
  imageUrl: string;
  animationUrl: string;
  composite: 'alpha' | 'screen';
  sortOrder: string;
  coinCost: string;
  isActive: boolean;
};
const NEW_DRAFT: Draft = { name: '', levelReq: '5', svipLevel: '0', imageUrl: '', animationUrl: '', composite: 'alpha', sortOrder: '0', coinCost: '0', isActive: true };

export default function EntryBarsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [bars, setBars] = useState<EntryBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('level');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { entry_bars: EntryBar[] } }>('/admin/entry-bars', token);
      setBars(json.data?.entry_bars ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load entry bars'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return bars
      .filter((b) => (!status || (status === 'active') === b.is_active) && (!term || b.name.toLowerCase().includes(term) || String(b.id) === term))
      .sort((a, b) => (sort === 'level' ? a.level_required - b.level_required : sort === 'name' ? a.name.localeCompare(b.name) : b.id - a.id));
  }, [bars, q, status, sort]);

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Entry bar name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    const body = {
      name: draft.name.trim(),
      level_required: Number(draft.levelReq) || 1,
      svip_level: Math.max(0, Number(draft.svipLevel) || 0),
      image_url: draft.imageUrl.trim() || undefined,
      animation_url: draft.animationUrl.trim() || undefined,
      composite_mode: draft.composite,
      sort_order: Number(draft.sortOrder) || 0,
      coin_cost: Math.max(0, Math.floor(Number(draft.coinCost)) || 0),
    };
    try {
      if (draft.id) {
        await api(`/admin/entry-bars/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `${body.name} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/entry-bars', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${body.name} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save entry bar'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: EntryBar) {
    if (!token) return;
    setBusyId(b.id);
    try {
      await api(`/admin/entry-bars/${b.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !b.is_active }) });
      setBars((bs) => bs.map((x) => (x.id === b.id ? { ...x, is_active: !b.is_active } : x)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update entry bar'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(b: EntryBar) {
    confirm({
      title: `Delete “${b.name}”?`,
      message: 'This entrance effect is removed for everyone. This cannot be undone.',
      confirmLabel: 'Delete entry bar',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/entry-bars/${b.id}`, token, { method: 'DELETE' });
        toast('success', `${b.name} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="cp-page">
      <PageHeader
        title="Entry Bars"
        subtitle="Arrival effects shown when users enter party rooms, unlocked by user level or SVIP level. A video plays full screen over the room."
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New entry bar</button>}
      />

      <section className="cp-card">
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" />
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Disabled</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="level">Unlock level</option>
              <option value="name">Name A–Z</option>
              <option value="newest">Newest first</option>
            </select>
          </Field>
        </div>
        <div className="cp-summary">Showing <strong>{visible.length}</strong> of <strong>{bars.length}</strong></div>
        {loading && bars.length === 0 ? (
          <MediaSkeleton count={4} />
        ) : visible.length === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-title">{bars.length ? 'No entry bars match' : 'No entry bars yet'}</div>
            {bars.length ? 'Try a different filter.' : 'Add the first arrival banner.'}
          </div>
        ) : (
          <div className="cp-media-grid is-wide">
            {visible.map((b) => (
              <MediaCard
                key={b.id}
                thumbClass="is-wide is-dark"
                thumb={<MediaThumb imageUrl={b.image_url} animationUrl={b.animation_url} composite={b.composite_mode} alt={b.name} fallback="🚀" />}
                flags={
                  <>
                    <span className="cp-badge amber">{b.svip_level ? `SVIP ${b.svip_level}+` : `Lv ${b.level_required}+`}</span>
                    {(b.coin_cost ?? 0) > 0 && !b.svip_level ? <span className="cp-badge green" title="Coins to buy for the period">🪙 {(b.coin_cost ?? 0).toLocaleString()}</span> : <span />}
                  </>
                }
                title={b.name}
                meta={`#${b.id}`}
                active={b.is_active}
                busy={busyId === b.id}
                onToggle={() => void toggleActive(b)}
                onEdit={() => {
                  setFormError('');
                  setDraft({
                    id: b.id,
                    name: b.name,
                    levelReq: String(b.level_required),
                    svipLevel: String(b.svip_level ?? 0),
                    imageUrl: b.image_url ?? '',
                    animationUrl: b.animation_url ?? '',
                    composite: b.composite_mode === 'screen' ? 'screen' : 'alpha',
                    sortOrder: String(b.sort_order ?? 0),
                    coinCost: String(b.coin_cost ?? 0),
                    isActive: b.is_active,
                  });
                }}
                onDelete={() => remove(b)}
              />
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal
          size="wide"
          title={draft.id ? `Edit entry bar #${draft.id}` : 'New entry bar'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create entry bar'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Name *">
              <input autoFocus placeholder="e.g. Phoenix Dragon Entrance" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Unlock level">
              <input type="number" inputMode="numeric" value={draft.levelReq} onChange={(e) => set({ levelReq: e.target.value })} />
            </Field>
            <Field label="SVIP level (0 = not SVIP)">
              <input type="number" inputMode="numeric" min={0} value={draft.svipLevel} onChange={(e) => set({ svipLevel: e.target.value })} />
            </Field>
            <Field label="Price to buy (coins, 0 = not for sale)" hint="Buying lasts 30 days; renewing costs 20% of this. Not used for SVIP bars.">
              <div className="cp-unit"><input type="number" inputMode="numeric" min={0} value={draft.coinCost} onChange={(e) => set({ coinCost: e.target.value })} /><span>coins</span></div>
            </Field>
            <Field label="Sort order (lowest = SVIP default)">
              <input type="number" inputMode="numeric" value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
            </Field>
          </div>
          <FileUploadInput
            label="Still / poster image (optional)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
            placeholder="https://.../entry_bar_poster.png"
            helpText="Optional still preview. Prefer a poster when the animation is video/SVGA."
          />
          <FileUploadInput
            label="Entry effect (.json, .svga, .mp4, .webm)"
            value={draft.animationUrl}
            onChange={(url) => set({ animationUrl: url, composite: compositeForAnimation(url) })}
            accept=".svga,.json,.gif,.webp,.mp4,.webm,video/mp4,video/webm,image/gif,image/webp"
            placeholder="https://.../entry_effect.json"
            helpText="Video (.mp4 / .webm) plays full screen over the room with sound, about 4 s, 1080×1920."
          />
          <Field label="Video composite" wide>
            <select value={draft.composite} onChange={(e) => set({ composite: e.target.value === 'screen' ? 'screen' : 'alpha' })}>
              <option value="screen">Screen — black background drops out (.mp4 on pure black)</option>
              <option value="alpha">Alpha — video has its own transparency (.webm)</option>
            </select>
          </Field>
          {draft.id ? (
            <div className="cp-toggle-row">
              <div className="cp-toggle-title">Active</div>
              <Switch label="Active" checked={draft.isActive} onChange={(v) => set({ isActive: v })} />
            </div>
          ) : null}
          {formError && <div className="cp-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}
