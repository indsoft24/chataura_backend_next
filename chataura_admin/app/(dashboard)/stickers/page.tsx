'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import MediaThumb from '@/app/components/MediaThumb';
import {
  Field,
  MediaCard,
  MediaSkeleton,
  Modal,
  PageHeader,
  Pager,
  SearchBox,
  Switch,
  Tabs,
  errorText,
  useClientPager,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

const ANIMATION_ACCEPT =
  '.svga,.json,.gif,.webp,.mp4,.webm,video/mp4,video/webm,image/gif,image/webp';

type Sticker = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  animation_url: string | null;
  is_active: boolean;
};

type Draft = { id?: number; name: string; coinCost: string; imageUrl: string; animationUrl: string; isActive: boolean };
const NEW_DRAFT: Draft = { name: '', coinCost: '10', imageUrl: '', animationUrl: '', isActive: true };

export default function StickersPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [price, setPrice] = useState<'' | 'free' | 'paid'>('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { stickers: Sticker[] } }>('/admin/stickers', token);
      setStickers(json.data?.stickers ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load stickers'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const free = stickers.filter((x) => x.coin_cost <= 0).length;
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    const out = stickers.filter((x) =>
      (!price || (price === 'free') === (x.coin_cost <= 0)) &&
      (!status || (status === 'active') === x.is_active) &&
      (!term || x.name.toLowerCase().includes(term) || String(x.id) === term),
    );
    const by: Record<string, (a: Sticker, b: Sticker) => number> = {
      newest: (a, b) => b.id - a.id,
      name: (a, b) => a.name.localeCompare(b.name),
      price_asc: (a, b) => a.coin_cost - b.coin_cost,
      price_desc: (a, b) => b.coin_cost - a.coin_cost,
    };
    return out.sort(by[sort]);
  }, [stickers, price, status, q, sort]);
  const { pageItems, pagerProps } = useClientPager(visible, `${price}|${status}|${q}|${sort}`, 50);

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Sticker name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    const body = {
      name: draft.name.trim(),
      coin_cost: Number(draft.coinCost) || 0,
      image_url: draft.imageUrl.trim() || undefined,
      animation_url: draft.animationUrl.trim() || undefined,
    };
    try {
      if (draft.id) {
        await api(`/admin/stickers/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `${body.name} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/stickers', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${body.name} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save sticker'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(x: Sticker) {
    if (!token) return;
    setBusyId(x.id);
    try {
      await api(`/admin/stickers/${x.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !x.is_active }) });
      setStickers((xs) => xs.map((y) => (y.id === x.id ? { ...y, is_active: !x.is_active } : y)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update sticker'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(x: Sticker) {
    confirm({
      title: `Delete “${x.name}”?`,
      message: 'Users can no longer send this sticker. This cannot be undone.',
      confirmLabel: 'Delete sticker',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/stickers/${x.id}`, token, { method: 'DELETE' });
        toast('success', `${x.name} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const filtered = Boolean(price || status || q);
  const clear = () => { setPrice(''); setStatus(''); setQ(''); };

  return (
    <main className="cp-page">
      <PageHeader
        title="Stickers"
        subtitle={`Stickers users send in room chats and direct messages · ${stickers.filter((x) => x.is_active).length} of ${stickers.length} active`}
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New sticker</button>}
      />

      <section className="cp-card">
        <Tabs
          value={price}
          onChange={setPrice}
          tabs={[
            { value: '' as const, label: 'All', count: stickers.length },
            { value: 'free' as const, label: 'Free', count: free },
            { value: 'paid' as const, label: 'Paid', count: stickers.length - free },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" />
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          </Field>
        </div>
        <div className="cp-summary">
          Showing <strong>{visible.length}</strong> of <strong>{stickers.length}</strong>
          {filtered ? <>{' · '}<button type="button" className="cp-link" onClick={clear}>Clear filters</button></> : null}
        </div>

        {loading && stickers.length === 0 ? (
          <MediaSkeleton />
        ) : visible.length === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-title">{stickers.length ? 'No stickers match' : 'No stickers yet'}</div>
            {stickers.length ? 'Try a different filter.' : 'Create the first sticker for chats.'}
          </div>
        ) : (
          <div className="cp-media-grid">
            {pageItems.map((x) => (
              <MediaCard
                key={x.id}
                thumb={<MediaThumb imageUrl={x.image_url} animationUrl={x.animation_url} alt={x.name} fallback="✨" />}
                flags={x.animation_url ? <><span /><span className="cp-badge indigo" title="Animated">✨</span></> : undefined}
                title={x.name}
                meta={`#${x.id}`}
                extra={<div className={x.coin_cost > 0 ? 'cp-media-price' : 'cp-media-price tone-green'}>{x.coin_cost > 0 ? `🪙 ${x.coin_cost.toLocaleString()}` : 'Free'}</div>}
                active={x.is_active}
                busy={busyId === x.id}
                onToggle={() => void toggleActive(x)}
                onEdit={() => {
                  setFormError('');
                  setDraft({ id: x.id, name: x.name, coinCost: String(x.coin_cost), imageUrl: x.image_url ?? '', animationUrl: x.animation_url ?? '', isActive: x.is_active });
                }}
                onDelete={() => remove(x)}
              />
            ))}
          </div>
        )}
        {visible.length > 50 && <Pager {...pagerProps} />}
      </section>

      {draft && (
        <Modal
          size="wide"
          title={draft.id ? `Edit sticker #${draft.id}` : 'New sticker'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create sticker'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Sticker name *">
              <input autoFocus placeholder="e.g. Laughing Emoji" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Coin cost" hint="0 = free.">
              <div className="cp-unit"><input type="number" inputMode="numeric" value={draft.coinCost} onChange={(e) => set({ coinCost: e.target.value })} /><span>coins</span></div>
            </Field>
          </div>
          <FileUploadInput
            label="Static image (.png, .webp, .svg)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*"
            placeholder="https://.../sticker.png"
            helpText="Transparent PNG/WebP sticker icon."
          />
          <FileUploadInput
            label="Animation (.gif, .webp, .json, .svga, .mp4, .webm)"
            value={draft.animationUrl}
            onChange={(url) => set({ animationUrl: url })}
            accept={ANIMATION_ACCEPT}
            placeholder="https://.../sticker_anim.mp4"
            helpText="Looping sticker. GIF, WebP, Lottie JSON, SVGA, MP4 or WebM."
          />
          {draft.id ? (
            <div className="cp-toggle-row">
              <div className="cp-toggle-title">Available to users</div>
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
