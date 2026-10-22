'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  Avatar,
  EmptyRow,
  Field,
  Modal,
  PageHeader,
  SearchBox,
  SkeletonRows,
  Switch,
  errorText,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

type StarUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  star_rank: number | null;
  star_bio_tag: string | null;
  country: string | null;
  audio_call_rate: number | null;
  video_call_rate: number | null;
  support_frame: boolean;
};

export default function StarAccountsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [stars, setStars] = useState<StarUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [frame, setFrame] = useState('');
  const [editing, setEditing] = useState<StarUser | null>(null);
  const [formRank, setFormRank] = useState('1');
  const [formTag, setFormTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/star-accounts', token);
      setStars(res.data?.stars ?? []);
    } catch (err) {
      toast('error', errorText(err, 'Could not load star accounts'));
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
    return stars
      .filter((u) =>
        (!frame || (frame === 'on') === u.support_frame) &&
        (!term || [u.name, u.email, u.phone, u.star_bio_tag, u.country, String(u.id)].some((v) => v && v.toLowerCase().includes(term))),
      )
      .sort((a, b) => (a.star_rank ?? 9999) - (b.star_rank ?? 9999));
  }, [stars, q, frame]);

  async function save() {
    if (!token || !editing) return;
    setSaving(true);
    setFormError('');
    try {
      await api(`/admin/star-accounts/${editing.id}/update`, token, {
        method: 'POST',
        body: JSON.stringify({ star_rank: Number(formRank), star_bio_tag: formTag || undefined }),
      });
      toast('success', `${editing.name} updated`);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Failed to update star account'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleFrame(u: StarUser) {
    if (!token) return;
    setBusyId(u.id);
    try {
      const res = await api<any>(`/admin/star-accounts/${u.id}/support-frame`, token, {
        method: 'POST',
        body: JSON.stringify({ enabled: !u.support_frame }),
      });
      setStars(res.data?.stars ?? []);
    } catch (err) {
      toast('error', errorText(err, 'Failed to update support frame'));
    } finally {
      setBusyId(null);
    }
  }

  function remove(u: StarUser) {
    confirm({
      title: `Remove star status from ${u.name}?`,
      message: 'They lose their rank badge, bio tag and spotlight placement.',
      confirmLabel: 'Remove star',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/star-accounts/${u.id}/remove`, token, { method: 'POST' });
        toast('success', `${u.name} is no longer a star`);
        await load();
      },
    });
  }

  return (
    <main className="ad-page">
      <PageHeader
        title="Star Accounts"
        subtitle={<>VIP creators with rank badges, bio tags and spotlight placement. Make someone a star from <Link href="/users?star=no">Users</Link>.</>}
      />

      <section className="ad-card">
        <div className="ad-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, tag, country or ID" />
          <Field label="Support frame">
            <select value={frame} onChange={(e) => setFrame(e.target.value)}>
              <option value="">Any</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </Field>
        </div>
        <div className="ad-summary"><strong>{visible.length}</strong> of <strong>{stars.length}</strong> stars · ordered by spotlight rank</div>
        <div className="ad-table-wrap">
          <table className="ad-table is-stack is-3up">
            <thead>
              <tr>
                <th className="ad-th">Rank</th>
                <th className="ad-th">Star</th>
                <th className="ad-th">Bio tag</th>
                <th className="ad-th">Country</th>
                <th className="ad-th">Support frame</th>
                <th className="ad-th ad-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && stars.length === 0 ? (
                <SkeletonRows cols={6} />
              ) : visible.length === 0 ? (
                <EmptyRow cols={6} title={stars.length ? 'No stars match' : 'No star accounts yet'} hint={stars.length ? 'Try a different search.' : 'Assign star status from the Users page.'} />
              ) : (
                visible.map((u) => (
                  <tr key={u.id} className={`ad-row ${busyId === u.id ? 'is-busy' : ''}`}>
                    <td className="ad-td is-hide-sm"><span className="sa-rank">★ {u.star_rank ?? '—'}</span></td>
                    <td className="ad-td is-main">
                      <div className="ad-user">
                        <Avatar name={u.name} url={u.avatar_url} size={38} />
                        <div>
                          <div className="ad-name">{u.name}</div>
                          <div className="ad-sub">#{u.id} · {u.email ?? u.phone ?? 'No contact'}</div>
                        </div>
                      </div>
                      <span className="ad-mobile-only"><span className="sa-rank">★ {u.star_rank ?? '—'}</span></span>
                    </td>
                    <td className="ad-td" data-label="Bio tag">{u.star_bio_tag ? <span className="ad-badge indigo">{u.star_bio_tag}</span> : <span className="ad-hint">None</span>}</td>
                    <td className="ad-td" data-label="Country">{u.country ?? '—'}</td>
                    <td className="ad-td" data-label="Frame">
                      <Switch label={`Support frame for ${u.name}`} checked={u.support_frame} disabled={busyId === u.id} onChange={() => void toggleFrame(u)} />
                    </td>
                    <td className="ad-td ad-num is-actions">
                      <div className="ad-actions">
                        <button type="button" className="ad-btn ad-btn-ghost" onClick={() => { setFormError(''); setEditing(u); setFormRank(String(u.star_rank ?? 1)); setFormTag(u.star_bio_tag ?? ''); }}>
                          Edit rank & tag
                        </button>
                        <button type="button" className="ad-btn ad-btn-danger-soft" onClick={() => remove(u)}>Remove star</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <Modal
          title={`Star settings · ${editing.name}`}
          busy={saving}
          onClose={() => setEditing(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="ad-btn ad-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="ad-form-grid is-2up">
            <Field label="Spotlight rank" hint="1–999; lower shows first.">
              <input type="number" min="1" max="999" required value={formRank} onChange={(e) => setFormRank(e.target.value)} />
            </Field>
            <Field label="Bio tag" hint="e.g. Top Singer, Celebrity.">
              <input placeholder="Bio tag…" maxLength={64} value={formTag} onChange={(e) => setFormTag(e.target.value)} />
            </Field>
          </div>
          {formError && <div className="ad-alert">{formError}</div>}
        </Modal>
      )}
      <style dangerouslySetInnerHTML={{ __html: '.sa-rank { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; background: #fef3c7; color: #b45309; font-weight: 700; font-size: 0.8rem; white-space: nowrap; }' }} />
      {confirmNode}
      {toastNode}
    </main>
  );
}
