'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import { Field, MediaCard, MediaSkeleton, Modal, PageHeader, SearchBox, Switch, Tabs, errorText, useConfirm, useToasts } from '@/components/admin-ui';

type RoomTheme = {
  id: number;
  name: string;
  coin_cost: number;
  image_url: string | null;
  is_active: boolean;
};

type Draft = { id?: number; name: string; coinCost: string; imageUrl: string; isActive: boolean };
const NEW_DRAFT: Draft = { name: '', coinCost: '0', imageUrl: '', isActive: true };
const isImage = (url: string | null) => Boolean(url && /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url));

export default function RoomThemesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [themes, setThemes] = useState<RoomTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [price, setPrice] = useState<'' | 'free' | 'paid'>('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { room_themes: RoomTheme[] } }>('/admin/room-themes', token);
      setThemes(json.data?.room_themes ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load themes'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const free = themes.filter((t) => t.coin_cost <= 0).length;
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return themes.filter((t) => (!price || (price === 'free') === (t.coin_cost <= 0)) && (!term || t.name.toLowerCase().includes(term) || String(t.id) === term));
  }, [themes, price, q]);

  async function save() {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      setFormError('Theme name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    const body = { name: draft.name.trim(), coin_cost: Number(draft.coinCost) || 0, image_url: draft.imageUrl.trim() || undefined };
    try {
      if (draft.id) {
        await api(`/admin/room-themes/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `${body.name} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/room-themes', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${body.name} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save theme'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: RoomTheme) {
    if (!token) return;
    setBusyId(t.id);
    try {
      await api(`/admin/room-themes/${t.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !t.is_active }) });
      setThemes((ts) => ts.map((x) => (x.id === t.id ? { ...x, is_active: !t.is_active } : x)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update theme'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(t: RoomTheme) {
    confirm({
      title: `Delete “${t.name}”?`,
      message: 'Rooms using this theme fall back to the default background. This cannot be undone.',
      confirmLabel: 'Delete theme',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/room-themes/${t.id}`, token, { method: 'DELETE' });
        toast('success', `${t.name} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="cp-page">
      <PageHeader
        title="Room Themes"
        subtitle="Background wallpapers and atmospheres for party rooms."
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New theme</button>}
      />

      <section className="cp-card">
        <Tabs
          value={price}
          onChange={setPrice}
          tabs={[
            { value: '' as const, label: 'All', count: themes.length },
            { value: 'free' as const, label: 'Free', count: free },
            { value: 'paid' as const, label: 'Paid', count: themes.length - free },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name or ID" />
        </div>
        <div className="cp-summary">Showing <strong>{visible.length}</strong> of <strong>{themes.length}</strong></div>
        {loading && themes.length === 0 ? (
          <MediaSkeleton count={4} />
        ) : visible.length === 0 ? (
          <div className="cp-empty">
            <div className="cp-empty-title">{themes.length ? 'No themes match' : 'No themes yet'}</div>
            {themes.length ? 'Try a different filter.' : 'Add the first room background.'}
          </div>
        ) : (
          <div className="cp-media-grid">
            {visible.map((t) => (
              <MediaCard
                key={t.id}
                thumbClass="is-cover is-tall is-dark"
                thumb={
                  isImage(t.image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.image_url!} alt="" loading="lazy" />
                  ) : (
                    <span style={{ color: '#c7d2fe', fontSize: '0.8rem', fontWeight: 600 }}>{t.image_url ? '✨ Animated theme' : 'No asset'}</span>
                  )
                }
                title={t.name}
                meta={`#${t.id}`}
                extra={<div className={t.coin_cost > 0 ? 'cp-media-price' : 'cp-media-price tone-green'}>{t.coin_cost > 0 ? `🪙 ${t.coin_cost.toLocaleString()}` : 'Free'}</div>}
                active={t.is_active}
                busy={busyId === t.id}
                onToggle={() => void toggleActive(t)}
                onEdit={() => {
                  setFormError('');
                  setDraft({ id: t.id, name: t.name, coinCost: String(t.coin_cost), imageUrl: t.image_url ?? '', isActive: t.is_active });
                }}
                onDelete={() => remove(t)}
              />
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal
          title={draft.id ? `Edit theme #${draft.id}` : 'New room theme'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create theme'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Theme name *">
              <input autoFocus placeholder="e.g. Neon Cyberpunk" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Coin cost" hint="0 = free.">
              <div className="cp-unit"><input type="number" inputMode="numeric" value={draft.coinCost} onChange={(e) => set({ coinCost: e.target.value })} /><span>coins</span></div>
            </Field>
          </div>
          <FileUploadInput
            label="Wallpaper (.png, .jpg, .gif, .webp, .json, .svga)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*,.json,.svga,.webp,.gif,.png,.jpg,.jpeg"
            placeholder="https://.../themes/confetti.json or image URL"
            helpText="Background image, or a Lottie .json / .svga animation."
          />
          {draft.id ? (
            <div className="cp-toggle-row">
              <div className="cp-toggle-title">Available in rooms</div>
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
