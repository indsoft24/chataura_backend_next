'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import { EmptyRow, Field, Modal, PageHeader, Pager, SearchBox, SkeletonRows, errorText, useClientPager, useConfirm, useToasts } from '@/components/admin-ui';

type Level = {
  id: number;
  level: number;
  min_xp: number;
  max_xp: number;
  label?: string | null;
  badge_url?: string | null;
  icon_url?: string | null;
};

type Draft = { id?: number; level: string; minXp: string; maxXp: string; label: string; badgeUrl: string };

export default function LevelsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('asc');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { levels: Level[] } }>('/admin/levels', token);
      setLevels(json.data?.levels ?? []);
    } catch (e) {
      toast('error', errorText(e, 'Could not load levels'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const maxXp = useMemo(() => Math.max(1, ...levels.map((l) => l.max_xp)), [levels]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^(lv|level)\s*/, '');
    return levels
      .filter((l) => !term || String(l.level) === term || (l.label ?? '').toLowerCase().includes(term))
      .sort((a, b) => (sort === 'asc' ? a.level - b.level : b.level - a.level));
  }, [levels, q, sort]);
  const { pageItems, pagerProps } = useClientPager(visible, `${q}|${sort}`);

  function openNew() {
    const top = levels.length ? Math.max(...levels.map((l) => l.level)) : 0;
    const topXp = levels.length ? Math.max(...levels.map((l) => l.max_xp)) : -1;
    setFormError('');
    setDraft({
      level: String(top + 1),
      minXp: String(topXp + 1),
      maxXp: String(levels.length ? topXp + 5000 : 1000),
      label: levels.length ? `Level ${top + 1}` : 'Beginner',
      badgeUrl: '',
    });
  }

  async function save() {
    if (!token || !draft) return;
    setSaving(true);
    setFormError('');
    try {
      if (draft.id) {
        await api(`/admin/levels/${draft.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            min_xp: Number(draft.minXp),
            max_xp: Number(draft.maxXp),
            label: draft.label.trim() || undefined,
            badge_url: draft.badgeUrl.trim() || undefined,
          }),
        });
        toast('success', `Level ${draft.level} updated`);
      } else {
        const json = await api<{ success: boolean; error?: { message?: string } }>('/admin/levels', token, {
          method: 'POST',
          body: JSON.stringify({
            level: Number(draft.level),
            min_xp: Number(draft.minXp),
            max_xp: Number(draft.maxXp),
            label: draft.label.trim() || undefined,
            badge_url: draft.badgeUrl.trim() || undefined,
          }),
        });
        if (!json.success) throw new Error(json.error?.message ?? 'Create failed');
        toast('success', `Level ${draft.level} added`);
      }
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save level'));
    } finally {
      setSaving(false);
    }
  }

  function remove(l: Level) {
    confirm({
      title: `Delete level ${l.level}?`,
      message: <>&ldquo;{l.label || `Level ${l.level}`}&rdquo; ({l.min_xp.toLocaleString()}–{l.max_xp.toLocaleString()} XP) is removed from the progression.</>,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/levels/${l.id}`, token, { method: 'DELETE' });
        toast('success', `Level ${l.level} deleted`);
        void load();
      },
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: LV_STYLES }} />
      <PageHeader
        title="User Levels"
        subtitle="XP thresholds, titles and rank badges for user progression."
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={openNew} disabled={loading}>+ New level</button>}
      />

      <section className="cp-card">
        <div className="cp-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search level number or title" />
          <Field label="Order">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="asc">Level 1 → top</option>
              <option value="desc">Top → level 1</option>
            </select>
          </Field>
        </div>
        <div className="cp-summary">
          <strong>{visible.length}</strong> of <strong>{levels.length}</strong> levels · up to <strong>{maxXp.toLocaleString()}</strong> XP
        </div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Level</th>
                <th className="cp-th">XP range</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && levels.length === 0 ? (
                <SkeletonRows cols={3} rows={6} />
              ) : visible.length === 0 ? (
                <EmptyRow cols={3} title={levels.length ? 'No level matches' : 'No levels yet'} hint={levels.length ? 'Try a different search.' : 'Add the first level to start user progression.'} />
              ) : (
                pageItems.map((l) => (
                  <tr key={l.id} className="cp-row">
                    <td className="cp-td is-main">
                      <div className="cp-user" style={{ minWidth: 0 }}>
                        <div className="lv-badge">
                          {l.badge_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.badge_url} alt="" />
                          ) : (
                            <span>{l.level}</span>
                          )}
                        </div>
                        <div>
                          <div className="cp-name">{l.label || `Level ${l.level}`}</div>
                          <div className="cp-sub">Level {l.level}</div>
                        </div>
                      </div>
                    </td>
                    <td className="cp-td" data-label="XP range">
                      <div className="lv-range">
                        <span>{l.min_xp.toLocaleString()} – {l.max_xp.toLocaleString()} XP</span>
                        <div className="lv-track">
                          <div style={{ marginLeft: `${(l.min_xp / maxXp) * 100}%`, width: `${Math.max(1.5, ((l.max_xp - l.min_xp) / maxXp) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="cp-td cp-num is-actions is-half">
                      <div className="cp-actions">
                        <button
                          type="button"
                          className="cp-btn cp-btn-ghost"
                          onClick={() => {
                            setFormError('');
                            setDraft({ id: l.id, level: String(l.level), minXp: String(l.min_xp), maxXp: String(l.max_xp), label: l.label ?? '', badgeUrl: l.badge_url ?? '' });
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => remove(l)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {visible.length > 25 && <Pager {...pagerProps} />}
      </section>

      {draft && (
        <Modal
          title={draft.id ? `Edit level ${draft.level}` : 'New level'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add level'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Level #">
              <input type="number" inputMode="numeric" value={draft.level} disabled={Boolean(draft.id)} onChange={(e) => set({ level: e.target.value })} />
            </Field>
            <Field label="Title">
              <input placeholder="e.g. Master" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
            </Field>
            <Field label="Min XP">
              <input type="number" inputMode="numeric" value={draft.minXp} onChange={(e) => set({ minXp: e.target.value })} />
            </Field>
            <Field label="Max XP">
              <input type="number" inputMode="numeric" value={draft.maxXp} onChange={(e) => set({ maxXp: e.target.value })} />
            </Field>
          </div>
          <FileUploadInput
            label="Rank badge (.png, .svg, .webp)"
            value={draft.badgeUrl}
            onChange={(url) => set({ badgeUrl: url })}
            accept="image/*"
            placeholder="https://.../badge.png"
            helpText="Shown beside the user's name."
          />
          {formError && <div className="cp-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}

const LV_STYLES = `
.lv-badge { flex: 0 0 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #818cf8, #4f46e5); color: #fff; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.lv-badge img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.lv-range { display: grid; gap: 6px; min-width: 220px; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 0.86rem; }
.lv-track { height: 6px; border-radius: 999px; background: #f1f2f6; overflow: hidden; }
.lv-track > div { height: 100%; border-radius: 999px; background: #818cf8; }
@media (max-width: 640px) { .lv-range { min-width: 0; } }
`;
