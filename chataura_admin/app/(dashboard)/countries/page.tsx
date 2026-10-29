'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';
import {
  EmptyRow,
  Field,
  Modal,
  PageHeader,
  Pager,
  SearchBox,
  SkeletonRows,
  Tabs,
  errorText,
  useClientPager,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

type Country = {
  id: string;
  name: string;
  flag_emoji: string | null;
  flag_url: string | null;
  approval_status: string;
  is_active: boolean;
};

type Draft = { editing: boolean; id: string; name: string; emoji: string; url: string };
const APPROVAL_TONE: Record<string, string> = { approved: 'green', rejected: 'red', pending: 'amber' };

export default function CountriesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [approval, setApproval] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/countries', token);
      setCountries(res.data?.countries ?? []);
    } catch (err) {
      toast('error', errorText(err, 'Could not load countries'));
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
    countries.forEach((x) => { c[x.approval_status] = (c[x.approval_status] ?? 0) + 1; });
    return c;
  }, [countries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return countries.filter((c) =>
      (!approval || c.approval_status === approval) &&
      (!term || c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)),
    );
  }, [countries, approval, search]);
  const { pageItems, pagerProps } = useClientPager(filtered, `${approval}|${search}`, 50);

  async function save() {
    if (!token || !draft) return;
    setSaving(true);
    setFormError('');
    try {
      if (draft.editing) {
        await api(`/admin/countries/${draft.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ name: draft.name, flag_emoji: draft.emoji || undefined, flag_url: draft.url || undefined }),
        });
      } else {
        await api('/admin/countries', token, {
          method: 'POST',
          body: JSON.stringify({ id: draft.id, name: draft.name, flag_emoji: draft.emoji || undefined, flag_url: draft.url || undefined }),
        });
      }
      toast('success', `${draft.name} saved`);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Error saving country'));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(c: Country, action: 'approve' | 'reject') {
    if (!token) return;
    setBusyId(c.id);
    try {
      await api(`/admin/countries/${c.id}/${action}`, token, { method: 'POST' });
      toast('success', `${c.name} ${action === 'approve' ? 'approved' : 'rejected'}`);
      await load();
    } catch (err) {
      toast('error', errorText(err, `Failed to ${action}`));
    } finally {
      setBusyId(null);
    }
  }

  function remove(c: Country) {
    confirm({
      title: `Delete ${c.name} (${c.id})?`,
      message: 'Users in this country lose their flag. This cannot be undone.',
      confirmLabel: 'Delete country',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/countries/${c.id}`, token, { method: 'DELETE' });
        toast('success', `${c.name} deleted`);
        await load();
      },
    });
  }

  const flag = (c: Country) =>
    c.flag_emoji ? (
      <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{c.flag_emoji}</span>
    ) : c.flag_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={c.flag_url} alt="" style={{ width: 30, height: 21, objectFit: 'cover', borderRadius: 3 }} />
    ) : (
      <span className="cp-hint">—</span>
    );

  return (
    <main className="cp-page">
      <PageHeader
        title="Countries"
        subtitle="Country codes and flags users pick on their profile."
        actions={<button type="button" className="cp-btn cp-btn-accent cp-btn-lg" onClick={() => { setFormError(''); setDraft({ editing: false, id: '', name: '', emoji: '', url: '' }); }}>+ Add country</button>}
      />

      <section className="cp-card">
        <Tabs
          value={approval}
          onChange={setApproval}
          tabs={[
            { value: '', label: 'All', count: countries.length },
            { value: 'approved', label: 'Approved', count: counts.approved ?? 0, tone: 'green' },
            { value: 'pending', label: 'Pending', count: counts.pending ?? 0, tone: 'amber' },
            { value: 'rejected', label: 'Rejected', count: counts.rejected ?? 0, tone: 'red' },
          ]}
        />
        <div className="cp-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search country name or code" />
        </div>
        <div className="cp-summary">Showing <strong>{filtered.length}</strong> of <strong>{countries.length}</strong></div>
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th">Country</th>
                <th className="cp-th">Approval</th>
                <th className="cp-th">Active</th>
                <th className="cp-th cp-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && countries.length === 0 ? (
                <SkeletonRows cols={4} />
              ) : filtered.length === 0 ? (
                <EmptyRow cols={4} title="No countries found" hint={countries.length ? 'Try a different search or tab.' : 'Add the first country.'} />
              ) : (
                pageItems.map((c) => (
                  <tr key={c.id} className={`cp-row ${busyId === c.id ? 'is-busy' : ''}`}>
                    <td className="cp-td is-main">
                      <div className="cp-user">
                        <div style={{ width: 34, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{flag(c)}</div>
                        <div>
                          <div className="cp-name">{c.name}</div>
                          <div className="cp-sub cp-mono">{c.id}</div>
                        </div>
                      </div>
                      <span className="cp-mobile-only"><span className={`cp-badge ${APPROVAL_TONE[c.approval_status] ?? 'gray'}`}>{c.approval_status}</span></span>
                    </td>
                    <td className="cp-td is-hide-sm"><span className={`cp-badge ${APPROVAL_TONE[c.approval_status] ?? 'gray'}`}>{c.approval_status}</span></td>
                    <td className="cp-td" data-label="Active">{c.is_active ? <span className="tone-green" style={{ fontWeight: 600 }}>Yes</span> : <span className="cp-hint">No</span>}</td>
                    <td className="cp-td cp-num is-actions is-half">
                      <div className="cp-actions">
                        {c.approval_status !== 'approved' && (
                          <button type="button" className="cp-btn cp-btn-success-soft" onClick={() => void setStatus(c, 'approve')}>Approve</button>
                        )}
                        {c.approval_status === 'pending' && (
                          <button type="button" className="cp-btn cp-btn-ghost" onClick={() => void setStatus(c, 'reject')}>Reject</button>
                        )}
                        <button type="button" className="cp-btn cp-btn-ghost" onClick={() => { setFormError(''); setDraft({ editing: true, id: c.id, name: c.name, emoji: c.flag_emoji ?? '', url: c.flag_url ?? '' }); }}>Edit</button>
                        <button type="button" className="cp-btn cp-btn-danger-soft cp-icon-btn" aria-label={`Delete ${c.name}`} title="Delete" onClick={() => remove(c)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 50 && <Pager {...pagerProps} />}
      </section>

      {draft && (
        <Modal
          title={draft.editing ? `Edit ${draft.name || draft.id}` : 'Add country'}
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={() => void save()}
          footer={
            <>
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving || !draft.name || !draft.id}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="cp-form-grid is-2up">
            <Field label="Country code" hint="ISO 2-letter, e.g. IN, US, AE.">
              <input required maxLength={10} disabled={draft.editing} placeholder="IN" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Flag emoji" hint="Optional.">
              <input placeholder="🇮🇳" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
            </Field>
            <Field label="Country name" wide>
              <input required placeholder="India" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
          </div>
          <FileUploadInput
            label="Flag image (.png, .svg, .webp)"
            value={draft.url}
            onChange={(url) => setDraft({ ...draft, url })}
            accept="image/*"
            placeholder="https://.../flag.png"
            helpText="Optional image used when there is no emoji."
          />
          {formError && <div className="cp-alert">{formError}</div>}
        </Modal>
      )}
      {confirmNode}
      {toastNode}
    </main>
  );
}
