'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Avatar, errorText, useConfirm, useToasts } from '@/components/admin-ui';

type SellerRow = {
  id: number;
  whatsapp: string;
  countries: string[];
  sort_order: number;
  is_active: boolean;
  visible_in_app: boolean;
  user: {
    id: number;
    display_id: string;
    name: string | null;
    avatar_url: string | null;
    role: string;
    phone: string | null;
    is_online: boolean;
  };
};

type UserHit = { id: number; display_id?: string; display_name?: string | null; avatar_url?: string | null; phone?: string | null; role?: string };
type Country = { id: string; name: string; flag_emoji: string | null; is_active: boolean };

type Draft = { id?: number; user: UserHit | null; whatsapp: string; countries: string[]; is_active: boolean };

const TEMPLATE_KEY = 'coin_seller_message_template';
const DIAL_SHORTCUTS = [
  { label: '🇮🇳 +91', code: '+91 ' },
  { label: '🇧🇩 +880', code: '+880 ' },
  { label: '🇦🇪 +971', code: '+971 ' },
];
const PREVIEW_VALUES: Record<string, string> = {
  appName: 'ChatAura',
  userId: '100245',
  userName: 'Rahul',
  coins: '10,000',
  price: '₹99',
};

/** Same placeholder rules as the app: a line whose placeholder is empty is dropped. */
function renderTemplate(t: string, values: Record<string, string>) {
  return t
    .split('\n')
    .filter((line) => !/\{(\w+)\}/.test(line) || [...line.matchAll(/\{(\w+)\}/g)].every((m) => values[m[1]]))
    .map((line) => line.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? ''))
    .join('\n')
    .trim();
}

function prettyNumber(digits: string) {
  return `+${digits}`;
}

function waLink(digits: string, text?: string) {
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Best-effort client preview; the server is the real validator. */
function digitsPreview(input: string) {
  const raw = input.trim().replace(/^00/, '+');
  if (!raw.startsWith('+')) return null;
  const d = raw.replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

export default function CoinSellersPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();

  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  const [template, setTemplate] = useState('');
  const [savedTemplate, setSavedTemplate] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ data?: { template: string; sellers: SellerRow[] } }>('/admin/coin-sellers', token);
      setRows(res.data?.sellers ?? []);
      setTemplate(res.data?.template ?? '');
      setSavedTemplate(res.data?.template ?? '');
    } catch (e) {
      setLoadError(errorText(e, 'Failed to load coin sellers'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    api<{ data?: { countries: Country[] } }>('/admin/countries', token)
      .then((r) => setCountries((r.data?.countries ?? []).filter((c) => c.is_active)))
      .catch(() => setCountries([]));
  }, [token]);

  // Seller search (role = seller) while the add dialog is open.
  useEffect(() => {
    if (!token || !draft || draft.id) return;
    const term = search.trim();
    if (!term) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const qs = new URLSearchParams({ q: term, role: 'seller', limit: '8', page: '1' });
        const res = await api<{ data?: { users: UserHit[] } }>(`/admin/users?${qs}`, token);
        setHits(res.data?.users ?? []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, token, draft]);

  const countryLabel = useMemo(() => {
    const map = new Map(countries.map((c) => [c.id.toUpperCase(), c]));
    return (code: string) => {
      const c = map.get(code);
      return c ? `${c.flag_emoji ?? ''} ${code}`.trim() : code;
    };
  }, [countries]);

  const listedUserIds = useMemo(() => new Set(rows.map((r) => r.user.id)), [rows]);

  function openAdd() {
    setDraft({ user: null, whatsapp: '', countries: [], is_active: true });
    setDraftError(null);
    setSearch('');
    setHits([]);
  }

  function openEdit(r: SellerRow) {
    setDraft({
      id: r.id,
      user: { id: r.user.id, display_id: r.user.display_id, display_name: r.user.name, avatar_url: r.user.avatar_url, phone: r.user.phone },
      whatsapp: prettyNumber(r.whatsapp),
      countries: r.countries,
      is_active: r.is_active,
    });
    setDraftError(null);
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!token || !draft) return;
    if (!draft.user) {
      setDraftError('Pick a coin seller first');
      return;
    }
    setSaving(true);
    setDraftError(null);
    try {
      const body = { whatsapp: draft.whatsapp, countries: draft.countries, is_active: draft.is_active };
      if (draft.id) {
        await api(`/admin/coin-sellers/${draft.id}`, token, { method: 'PATCH', body: JSON.stringify(body) });
        toast('success', 'Seller updated');
      } else {
        await api('/admin/coin-sellers', token, {
          method: 'POST',
          body: JSON.stringify({ ...body, user_id: draft.user.id }),
        });
        toast('success', 'Seller added');
      }
      setDraft(null);
      await load();
    } catch (err) {
      setDraftError(errorText(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: SellerRow) {
    if (!token) return;
    setBusyId(r.id);
    try {
      await api(`/admin/coin-sellers/${r.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      await load();
    } catch (e) {
      toast('error', errorText(e, 'Update failed'));
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!token) return;
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    try {
      await api('/admin/coin-sellers/order', token, {
        method: 'PUT',
        body: JSON.stringify({ ids: next.map((r) => r.id) }),
      });
    } catch (e) {
      toast('error', errorText(e, 'Reorder failed'));
      await load();
    }
  }

  function remove(r: SellerRow) {
    confirm({
      title: 'Remove from offline recharge?',
      message: (
        <>
          <b>{r.user.name ?? r.user.display_id}</b> will no longer be shown in the app’s Offline tab. Their coin seller role
          is not changed.
        </>
      ),
      confirmLabel: 'Remove',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/coin-sellers/${r.id}`, token, { method: 'DELETE' });
        toast('success', 'Seller removed');
        await load();
      },
    });
  }

  async function saveTemplate() {
    if (!token) return;
    setSavingTemplate(true);
    try {
      await api('/admin/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({ [TEMPLATE_KEY]: template.trim() }),
      });
      setSavedTemplate(template.trim());
      toast('success', 'Message template saved');
    } catch (e) {
      toast('error', errorText(e, 'Save failed'));
    } finally {
      setSavingTemplate(false);
    }
  }

  const previewDigits = draft ? digitsPreview(draft.whatsapp) : null;

  return (
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      {toastNode}
      {confirmNode}

      <div className="cp-header">
        <div>
          <h1>Coin Sellers</h1>
          <p>
            Offline recharge. Sellers listed here appear in the app’s <b>Offline</b> recharge tab. Users tap a seller,
            WhatsApp opens with a ready message, they pay the seller, and the seller sends coins with Seller Transfer.
          </p>
        </div>
        <div className="cp-header-actions">
          <button className="cp-btn cp-btn-lg cp-btn-primary" onClick={openAdd}>
            + Add seller
          </button>
        </div>
      </div>

      <div className="cp-card">
        <div className="cp-card-head">
          <div>
            <h2>Listed sellers</h2>
            <p>Shown in the app in this order. Hidden automatically if the user loses the seller role or is suspended.</p>
          </div>
        </div>
        {loadError && (
          <div className="cp-alert" style={{ marginTop: 12 }}>
            {loadError}
            <button className="cp-btn cp-btn-ghost" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        <div className="cp-table-wrap">
          <table className="cp-table is-stack">
            <thead>
              <tr>
                <th className="cp-th" style={{ width: 70 }}>Order</th>
                <th className="cp-th">Seller</th>
                <th className="cp-th">WhatsApp</th>
                <th className="cp-th">Countries</th>
                <th className="cp-th">Status</th>
                <th className="cp-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td className="cp-td" colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="cp-td" colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontWeight: 600 }}>No coin sellers listed yet</div>
                    <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>
                      Add a user with the Coin Seller role to show them in the app’s Offline tab.
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className={`cp-row ${busyId === r.id ? 'is-busy' : ''} ${r.visible_in_app ? '' : 'is-muted'}`}>
                    <td className="cp-td is-hide-sm">
                      <div className="cs-order">
                        <button aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                          ▲
                        </button>
                        <button aria-label="Move down" disabled={i === rows.length - 1} onClick={() => void move(i, 1)}>
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="cp-td is-main">
                      <div className="cp-user">
                        <Avatar name={r.user.name} url={r.user.avatar_url} dot={r.user.is_online} />
                        <div style={{ minWidth: 0 }}>
                          <div className="cp-name">{r.user.name ?? 'Unnamed'}</div>
                          <div className="cp-sub">ID {r.user.display_id}</div>
                        </div>
                      </div>
                      <span className="cp-mobile-only">
                        <span className="cs-order is-row">
                          <button aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>▲</button>
                          <button aria-label="Move down" disabled={i === rows.length - 1} onClick={() => void move(i, 1)}>▼</button>
                        </span>
                      </span>
                    </td>
                    <td className="cp-td" data-label="WhatsApp">
                      <a className="cs-wa" href={waLink(r.whatsapp)} target="_blank" rel="noreferrer">
                        {prettyNumber(r.whatsapp)} ↗
                      </a>
                    </td>
                    <td className="cp-td" data-label="Countries">
                      {r.countries.length === 0 ? (
                        <span className="cp-tag">🌍 All</span>
                      ) : (
                        <div className="cs-tags">
                          {r.countries.map((c) => (
                            <span key={c} className="cp-tag">
                              {countryLabel(c)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="cp-td is-full" data-label="Status">
                      {r.visible_in_app ? (
                        <span className="cp-badge green">Visible</span>
                      ) : !r.is_active ? (
                        <span className="cp-badge gray">Turned off</span>
                      ) : (
                        <span className="cp-badge amber" title="Not a seller anymore, suspended or deleted">
                          Hidden – account
                        </span>
                      )}
                    </td>
                    <td className="cp-td is-actions is-fill" style={{ textAlign: 'right' }}>
                      <div className="cp-actions">
                        <button
                          className={`cp-btn ${r.is_active ? 'cp-btn-ghost' : 'cp-btn-success-soft'}`}
                          onClick={() => void toggleActive(r)}
                        >
                          {r.is_active ? 'Turn off' : 'Turn on'}
                        </button>
                        <button className="cp-btn cp-btn-soft" onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        <button className="cp-btn cp-btn-danger-soft" onClick={() => remove(r)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cp-card">
        <div className="cp-card-head">
          <div>
            <h2>WhatsApp message template</h2>
            <p>
              Placeholders: <code>{'{userId}'}</code> <code>{'{userName}'}</code> <code>{'{coins}'}</code>{' '}
              <code>{'{price}'}</code> <code>{'{appName}'}</code>. A line is skipped when its value is empty (e.g. no
              package picked).
            </p>
          </div>
          <button
            className="cp-btn cp-btn-lg cp-btn-primary"
            disabled={savingTemplate || !template.trim() || template.trim() === savedTemplate}
            onClick={() => void saveTemplate()}
          >
            {savingTemplate ? 'Saving…' : 'Save template'}
          </button>
        </div>
        <div className="cp-card-body cs-template">
          <label className="cp-field">
            Template
            <textarea rows={7} maxLength={1000} value={template} onChange={(e) => setTemplate(e.target.value)} />
          </label>
          <div className="cp-field">
            Preview (with package)
            <div className="cs-bubble">{renderTemplate(template, PREVIEW_VALUES) || '—'}</div>
            Preview (no package picked)
            <div className="cs-bubble">
              {renderTemplate(template, { ...PREVIEW_VALUES, coins: '', price: '' }) || '—'}
            </div>
          </div>
        </div>
      </div>

      {draft && (
        <div className="cp-overlay" role="dialog" aria-modal="true" onClick={() => !saving && setDraft(null)}>
          <form className="cp-modal cs-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void saveDraft(e)}>
            <h2>{draft.id ? 'Edit coin seller' : 'Add coin seller'}</h2>

            {draft.user ? (
              <div className="cs-picked">
                <div className="cp-user">
                  <Avatar name={draft.user.display_name} url={draft.user.avatar_url} />
                  <div style={{ minWidth: 0 }}>
                    <div className="cp-name">{draft.user.display_name ?? 'Unnamed'}</div>
                    <div className="cp-sub">ID {draft.user.display_id ?? draft.user.id}</div>
                  </div>
                </div>
                {!draft.id && (
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setDraft({ ...draft, user: null })}>
                    Change
                  </button>
                )}
              </div>
            ) : (
              <label className="cp-field">
                Coin seller (users with the Coin Seller role)
                <input
                  autoFocus
                  placeholder="Search by name, ID or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="cs-hits">
                  {searching && <div className="cs-hit-empty">Searching…</div>}
                  {!searching && search.trim() && hits.length === 0 && (
                    <div className="cs-hit-empty">No coin seller found. Set the user’s role to Coin Seller on the Users page.</div>
                  )}
                  {hits.map((h) => {
                    const listed = listedUserIds.has(h.id);
                    return (
                      <button
                        type="button"
                        key={h.id}
                        className="cs-hit"
                        disabled={listed}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            user: h,
                            whatsapp: draft.whatsapp || (h.phone?.startsWith('+') ? h.phone : ''),
                          })
                        }
                      >
                        <Avatar name={h.display_name} url={h.avatar_url} size={28} />
                        <span className="cp-name">{h.display_name ?? 'Unnamed'}</span>
                        <span className="cp-sub">ID {h.display_id ?? h.id}</span>
                        {listed && <span className="cp-badge gray">Listed</span>}
                      </button>
                    );
                  })}
                </div>
              </label>
            )}

            <label className="cp-field">
              WhatsApp number (with country code)
              <input
                required
                inputMode="tel"
                placeholder="+91 98765 43210"
                value={draft.whatsapp}
                onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
              />
            </label>
            <div className="cs-row">
              {DIAL_SHORTCUTS.map((d) => (
                <button
                  type="button"
                  key={d.code}
                  className="cp-chip"
                  onClick={() => setDraft({ ...draft, whatsapp: d.code })}
                >
                  {d.label}
                </button>
              ))}
              {draft.user?.phone && (
                <button
                  type="button"
                  className="cp-chip"
                  onClick={() => setDraft({ ...draft, whatsapp: draft.user?.phone ?? '' })}
                >
                  Use login phone
                </button>
              )}
              {previewDigits && (
                <a className="cs-wa" href={waLink(previewDigits)} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>
                  Test on WhatsApp ↗
                </a>
              )}
            </div>

            <div className="cp-field">
              Show to users in
              <div className="cs-row">
                <button
                  type="button"
                  className={`cp-chip ${draft.countries.length === 0 ? 'is-active' : ''}`}
                  onClick={() => setDraft({ ...draft, countries: [] })}
                >
                  🌍 All countries
                </button>
                {countries.map((c) => {
                  const code = c.id.toUpperCase();
                  const on = draft.countries.includes(code);
                  return (
                    <button
                      type="button"
                      key={code}
                      className={`cp-chip ${on ? 'is-active' : ''}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          countries: on ? draft.countries.filter((x) => x !== code) : [...draft.countries, code],
                        })
                      }
                    >
                      {c.flag_emoji ?? ''} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="cp-check">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              Show in app
            </label>

            {draftError && <div className="cp-alert">{draftError}</div>}

            <div className="cp-modal-actions">
              <button type="button" className="cp-btn cp-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="cp-btn cp-btn-primary" disabled={saving || !draft.user}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add seller'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

const PAGE_STYLES = `
.cs-order { display: inline-flex; flex-direction: column; gap: 2px; }
.cs-order.is-row { flex-direction: row; gap: 4px; }
.cp-page .cs-order.is-row button { width: 34px; padding: 6px 0; font-size: 0.75rem; }
.cp-page .cs-order button { width: 28px; padding: 1px 0; font-size: 0.65rem; border-radius: 6px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
.cp-page .cs-order button:disabled { opacity: 0.35; cursor: not-allowed; }
.cs-wa { color: #059669; font-weight: 600; text-decoration: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cs-wa:hover { text-decoration: underline; }
.cs-tags { display: flex; flex-wrap: wrap; gap: 4px; max-width: 260px; }
.cs-template { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 900px) { .cs-template { grid-template-columns: 1fr; } }
.cs-bubble { white-space: pre-wrap; text-transform: none; letter-spacing: normal; font-weight: 400; font-size: 0.9rem; color: #111827; background: #dcf8c6; border-radius: 10px 10px 2px 10px; padding: 10px 12px; margin-bottom: 8px; line-height: 1.45; }
.cs-modal { max-width: 560px; max-height: calc(100vh - 32px); overflow-y: auto; }
.cs-modal input:not([type=checkbox]) { font: inherit; font-size: 0.9rem; text-transform: none; letter-spacing: normal; padding: 9px 12px; border-radius: 8px; border: 1px solid #d1d5db; width: 100%; box-sizing: border-box; margin: 0; }
.cs-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; text-transform: none; letter-spacing: normal; }
.cs-picked { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb; }
.cs-hits { display: grid; gap: 2px; text-transform: none; letter-spacing: normal; max-height: 220px; overflow-y: auto; }
.cp-page .cs-hit { display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: #fff; border: none; border-radius: 8px; text-align: left; width: 100%; cursor: pointer; }
.cp-page .cs-hit:hover:not(:disabled) { background: #f3f4f6; }
.cp-page .cs-hit:disabled { opacity: 0.6; cursor: not-allowed; }
.cs-hit-empty { font-size: 0.85rem; color: #6b7280; font-weight: 400; padding: 6px 2px; }
`;
