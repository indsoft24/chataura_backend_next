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

const GIFT_CATEGORIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'customize', label: 'Customize' },
  { value: 'lucky', label: 'Lucky (coin rebate)' },
  { value: 'cp', label: 'CP (Couple)' },
  { value: 'bcp', label: 'BCP (Best Friend Couple)' },
  { value: 'svip', label: 'SVIP (members only)' },
] as const;

type GiftCategory = (typeof GIFT_CATEGORIES)[number]['value'];

type Gift = {
  id: number;
  gift_key?: string | null;
  name: string;
  coin_cost: number;
  category?: string | null;
  required_svip_level?: number;
  image_url: string | null;
  animation_url: string | null;
  is_active: boolean;
};

function categoryLabel(value: string | null | undefined) {
  const key = (value ?? 'standard').toLowerCase();
  return GIFT_CATEGORIES.find((c) => c.value === key)?.label ?? 'Standard';
}

type Draft = { id?: number; giftKey?: string | null; name: string; coinCost: string; category: GiftCategory; svipLevel: string; imageUrl: string; animationUrl: string; isActive: boolean };
const NEW_DRAFT: Draft = { name: '', coinCost: '50', category: 'standard', svipLevel: '0', imageUrl: '', animationUrl: '', isActive: true };

function catOf(g: Gift): GiftCategory {
  const c = (g.category ?? 'standard').toLowerCase();
  return (GIFT_CATEGORIES.some((x) => x.value === c) ? c : 'standard') as GiftCategory;
}

export default function GiftsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Lucky gifts cheaper than this are off sale (Settings → Lucky gift minimum).
  const [luckyMin, setLuckyMin] = useState(0);

  const [cat, setCat] = useState<'' | GiftCategory>('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('price_asc');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<any>('/admin/gifts', token);
      setGifts(Array.isArray(json.data) ? json.data : (json.data?.gifts ?? []));
    } catch (e) {
      toast('error', errorText(e, 'Could not load gifts'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (token) {
      api<any>('/admin/settings', token)
        .then((r) => setLuckyMin(Number(r.data?.settings?.lucky_gift_min_coins) || 0))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': gifts.length };
    gifts.forEach((g) => { c[catOf(g)] = (c[catOf(g)] ?? 0) + 1; });
    return c;
  }, [gifts]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    const out = gifts.filter((g) =>
      (!cat || catOf(g) === cat) &&
      (!status || (status === 'active') === g.is_active) &&
      (!term || [g.name, g.gift_key, String(g.id)].some((v) => v && v.toLowerCase().includes(term))),
    );
    const by: Record<string, (a: Gift, b: Gift) => number> = {
      price_asc: (a, b) => a.coin_cost - b.coin_cost,
      price_desc: (a, b) => b.coin_cost - a.coin_cost,
      name: (a, b) => a.name.localeCompare(b.name),
      newest: (a, b) => b.id - a.id,
    };
    return out.sort(by[sort]);
  }, [gifts, cat, status, q, sort]);
  const { pageItems, pagerProps } = useClientPager(visible, `${cat}|${status}|${q}|${sort}`, 50);
  const activeCount = gifts.filter((g) => g.is_active).length;

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Gift name is required');
      return;
    }
    if (draft.category === 'lucky' && (Number(draft.coinCost) || 0) < luckyMin) {
      setFormError(`Lucky gifts start at ${luckyMin.toLocaleString()} coins. Raise the price, or lower "Lucky gift minimum" in Settings.`);
      return;
    }
    setSaving(true);
    setFormError('');
    const body = {
      name: draft.name.trim(),
      coin_cost: Number(draft.coinCost) || 0,
      category: draft.category,
      required_svip_level: Math.min(9, Math.max(0, Number(draft.svipLevel) || 0)),
      image_url: draft.imageUrl.trim() || undefined,
      animation_url: draft.animationUrl.trim() || undefined,
    };
    try {
      if (draft.id) {
        await api(`/admin/gifts/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `${body.name} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/gifts', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${body.name} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save gift'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: Gift) {
    if (!token) return;
    setBusyId(g.id);
    try {
      await api(`/admin/gifts/${g.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !g.is_active }) });
      setGifts((gs) => gs.map((x) => (x.id === g.id ? { ...x, is_active: !g.is_active } : x)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update gift'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(g: Gift) {
    confirm({
      title: `Delete “${g.name}”?`,
      message: 'The gift disappears from the catalog and live rooms. This cannot be undone.',
      confirmLabel: 'Delete gift',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/gifts/${g.id}`, token, { method: 'DELETE' });
        toast('success', `${g.name} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const filtered = Boolean(cat || status || q);
  const clear = () => { setCat(''); setStatus(''); setQ(''); };

  return (
    <main className="cp-page">
      <PageHeader
        title="Gifts"
        subtitle={`Virtual gifts sent in live rooms · ${activeCount} of ${gifts.length} active`}
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New gift</button>}
      />

      <section className="cp-card">
        <Tabs
          value={cat}
          onChange={setCat}
          tabs={[{ value: '' as const, label: 'All', count: counts[''] ?? 0 }, ...GIFT_CATEGORIES.map((c) => ({ value: c.value, label: c.label.split(' (')[0], count: counts[c.value] ?? 0 }))]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, key or ID" />
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="name">Name A–Z</option>
              <option value="newest">Newest first</option>
            </select>
          </Field>
        </div>
        <div className="cp-summary">
          Showing <strong>{visible.length}</strong> of <strong>{gifts.length}</strong>
          {filtered ? <>{' · '}<button type="button" className="cp-link" onClick={clear}>Clear filters</button></> : null}
        </div>

        {loading && gifts.length === 0 ? (
          <MediaSkeleton />
        ) : visible.length === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-title">{gifts.length ? 'No gifts match' : 'No gifts yet'}</div>
            {gifts.length ? 'Try a different filter.' : 'Create the first gift for live rooms.'}
            {filtered && <div><button type="button" className="cp-btn cp-btn-ghost" style={{ marginTop: 12 }} onClick={clear}>Reset filters</button></div>}
          </div>
        ) : (
          <div className="cp-media-grid">
            {pageItems.map((g) => (
              <MediaCard
                key={g.id}
                thumb={<MediaThumb imageUrl={g.image_url} animationUrl={g.animation_url} alt={g.name} fallback="🎁" />}
                flags={
                  <>
                    <span className="cp-badge gray">{categoryLabel(g.category).split(' (')[0]}</span>
                    {(g.required_svip_level ?? 0) > 0 && <span className="cp-badge amber">SVIP {g.required_svip_level}</span>}
                    {catOf(g) === 'lucky' && g.coin_cost < luckyMin && (
                      <span className="cp-badge red" title={`Lucky gifts start at ${luckyMin.toLocaleString()} coins (Settings). This one is hidden in the app.`}>Hidden</span>
                    )}
                    {g.animation_url ? <span className="cp-badge indigo" title="Animation attached">✨</span> : <span />}
                  </>
                }
                title={g.name}
                meta={<span className="cp-mono" title="Unique gift key (permanent, used by the app)">#{g.id}{g.gift_key ? ` · ${g.gift_key}` : ''}</span>}
                extra={<div className="cp-media-price">🪙 {g.coin_cost.toLocaleString()}</div>}
                active={g.is_active}
                busy={busyId === g.id}
                onToggle={() => void toggleActive(g)}
                onEdit={() => {
                  setFormError('');
                  setDraft({ id: g.id, giftKey: g.gift_key, name: g.name, coinCost: String(g.coin_cost), category: catOf(g), svipLevel: String(g.required_svip_level ?? 0), imageUrl: g.image_url ?? '', animationUrl: g.animation_url ?? '', isActive: g.is_active });
                }}
                onDelete={() => remove(g)}
              />
            ))}
          </div>
        )}
        {visible.length > 50 && <Pager {...pagerProps} />}
      </section>

      {draft && (
        <Modal
          size="wide"
          title={draft.id ? <>Edit gift #{draft.id} {draft.giftKey ? <span className="cp-mono cp-hint">{draft.giftKey}</span> : null}</> : 'New gift'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create gift'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Gift name *" wide>
              <input autoFocus placeholder="e.g. Diamond Ring / Sports Car" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field
              label="Coin cost"
              hint={draft.category === 'lucky' && luckyMin > 0 ? `Lucky gifts start at ${luckyMin.toLocaleString()} coins. Change this in Settings → Commissions → Lucky gift minimum.` : undefined}
            >
              <div className="cp-unit"><input type="number" inputMode="numeric" value={draft.coinCost} onChange={(e) => set({ coinCost: e.target.value })} /><span>coins</span></div>
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) => {
                  const category = e.target.value as GiftCategory;
                  set({ category, ...(category === 'svip' && draft.svipLevel === '0' ? { svipLevel: '1' } : {}) });
                }}
              >
                {GIFT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="SVIP required" hint="0 = anyone. N = only SVIP N or higher can send it (server-enforced).">
              <input type="number" min={0} max={9} inputMode="numeric" value={draft.svipLevel} onChange={(e) => set({ svipLevel: e.target.value })} />
            </Field>
          </div>
          <FileUploadInput
            label="Icon / image (.png, .jpg, .webp)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*"
            placeholder="https://.../gift_icon.png"
            helpText="Static icon shown in the gift catalog."
          />
          <FileUploadInput
            label="Animation (.svga, .json, .gif, .webp, .mp4, .webm)"
            value={draft.animationUrl}
            onChange={(url) => set({ animationUrl: url })}
            accept={ANIMATION_ACCEPT}
            placeholder="https://.../gift_anim.mp4"
            helpText="Looping gift sticker. MP4 plays full-screen in the room."
          />
          {draft.id ? (
            <div className="cp-toggle-row">
              <div className="cp-toggle-title">Active in catalog & live rooms</div>
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
