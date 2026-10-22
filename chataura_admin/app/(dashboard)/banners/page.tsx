'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import { Field, MediaCard, MediaSkeleton, Modal, PageHeader, SearchBox, Switch, Tabs, errorText, useConfirm, useToasts } from '@/components/admin-ui';

type Banner = {
  id: number;
  title: string;
  subtitle?: string | null;
  category: string;
  badge_text?: string | null;
  image_url: string | null;
  action_type?: string | null;
  action_target?: string | null;
  is_active: boolean;
};

const CATEGORIES = [
  { value: 'event', label: 'Event' },
  { value: 'promotion', label: 'Recharge promotion' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'tournament', label: 'Game tournament' },
];
const catLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

type Draft = { id?: number; title: string; category: string; badgeText: string; imageUrl: string; actionTarget: string; isActive: boolean };
const NEW_DRAFT: Draft = { title: '', category: 'event', badgeText: '', imageUrl: '', actionTarget: '', isActive: true };

export default function BannersPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { banners: Banner[] } }>('/admin/banners', token);
      setBanners(json.data?.banners ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load banners'));
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
    banners.forEach((b) => { c[b.category] = (c[b.category] ?? 0) + 1; });
    return c;
  }, [banners]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '');
    return banners.filter((b) =>
      (!cat || b.category === cat) &&
      (!status || (status === 'active') === b.is_active) &&
      (!term || [b.title, b.badge_text, b.action_target, String(b.id)].some((v) => v && v.toLowerCase().includes(term))),
    );
  }, [banners, cat, status, q]);

  async function save() {
    if (!token || !draft) return;
    if (!draft.title.trim()) {
      setFormError('Banner title is required');
      return;
    }
    setSaving(true);
    setFormError('');
    const body = {
      title: draft.title.trim(),
      category: draft.category,
      badge_text: draft.badgeText.trim() || undefined,
      image_url: draft.imageUrl.trim() || undefined,
      action_target: draft.actionTarget.trim() || undefined,
    };
    try {
      if (draft.id) {
        await api(`/admin/banners/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...body, is_active: draft.isActive }) });
        toast('success', `${body.title} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/banners', token, { method: 'POST', body: JSON.stringify(body) });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `${body.title} created`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save banner'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner) {
    if (!token) return;
    setBusyId(b.id);
    try {
      await api(`/admin/banners/${b.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !b.is_active }) });
      setBanners((bs) => bs.map((x) => (x.id === b.id ? { ...x, is_active: !b.is_active } : x)));
    } catch (e) {
      toast('error', errorText(e, 'Could not update banner'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(b: Banner) {
    confirm({
      title: `Delete “${b.title}”?`,
      message: 'The banner disappears from the app home screen. This cannot be undone.',
      confirmLabel: 'Delete banner',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/banners/${b.id}`, token, { method: 'DELETE' });
        toast('success', `${b.title} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="ad-page">
      <PageHeader
        title="Banners"
        subtitle={`Announcements, events and carousels on the app home screen · ${banners.filter((b) => b.is_active).length} live`}
        actions={<button type="button" className="ad-btn ad-btn-accent ad-btn-lg" onClick={() => { setFormError(''); setDraft({ ...NEW_DRAFT }); }}>+ New banner</button>}
      />

      <section className="ad-card">
        <Tabs value={cat} onChange={setCat} tabs={[{ value: '', label: 'All', count: banners.length }, ...CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: counts[c.value] ?? 0 }))]} />
        <div className="ad-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search title, tag or link" />
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Live</option>
              <option value="inactive">Hidden</option>
            </select>
          </Field>
        </div>
        <div className="ad-summary">Showing <strong>{visible.length}</strong> of <strong>{banners.length}</strong></div>
        {loading && banners.length === 0 ? (
          <MediaSkeleton count={3} />
        ) : visible.length === 0 ? (
          <div className="ad-empty">
            <div className="ad-empty-title">{banners.length ? 'No banners match' : 'No banners yet'}</div>
            {banners.length ? 'Try a different filter.' : 'Create the first home-screen banner.'}
          </div>
        ) : (
          <div className="ad-media-grid is-wide">
            {visible.map((b) => (
              <MediaCard
                key={b.id}
                thumbClass="is-wide is-cover is-dark"
                thumb={
                  b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image_url} alt="" loading="lazy" />
                  ) : (
                    <span style={{ color: '#c7d2fe', fontSize: '0.8rem', fontWeight: 600 }}>No image</span>
                  )
                }
                flags={<><span className="ad-badge indigo">{catLabel(b.category)}</span>{b.badge_text ? <span className="ad-badge red">{b.badge_text}</span> : <span />}</>}
                title={b.title}
                meta={b.action_target ? `→ ${b.action_target}` : `#${b.id} · no link`}
                active={b.is_active}
                busy={busyId === b.id}
                onToggle={() => void toggleActive(b)}
                onEdit={() => {
                  setFormError('');
                  setDraft({ id: b.id, title: b.title, category: b.category, badgeText: b.badge_text ?? '', imageUrl: b.image_url ?? '', actionTarget: b.action_target ?? '', isActive: b.is_active });
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
          title={draft.id ? `Edit banner #${draft.id}` : 'New banner'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="ad-btn ad-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create banner'}</button>
            </>
          }
        >
          <div className="ad-form-grid is-2up">
            <Field label="Title *" wide>
              <input autoFocus placeholder="e.g. Diwali Fest Grand Gifting" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Category">
              <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Badge tag">
              <input placeholder="e.g. HOT / 50% EXTRA" value={draft.badgeText} onChange={(e) => set({ badgeText: e.target.value })} />
            </Field>
            <Field label="Action link / target" wide>
              <input placeholder="e.g. /recharge or https://..." value={draft.actionTarget} onChange={(e) => set({ actionTarget: e.target.value })} />
            </Field>
          </div>
          <FileUploadInput
            label="Banner image (.png, .jpg, .webp)"
            value={draft.imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            accept="image/*"
            placeholder="https://.../banner_promo.jpg"
            helpText="High-resolution 16:9 or landscape graphic."
          />
          {draft.id ? (
            <div className="ad-toggle-row">
              <div className="ad-toggle-title">Live on the home screen</div>
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
