'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  AdminStyles,
  EmptyRow,
  errorText,
  fmt,
  Pager,
  SearchBox,
  SkeletonRows,
  SortTh,
  Tabs,
  useConfirm,
  useToasts,
} from '@/components/admin-ui';

type RelType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  levels_enabled?: boolean;
  exclusivity_mode?: string;
  formation_rule?: string;
  requires_accept?: boolean;
  bidirectional_scoring?: boolean;
  quantity_multiplies_points?: boolean;
  dm_gifts_count?: boolean;
  room_gifts_count?: boolean;
  max_partners?: number | null;
  formation_cost_coins?: number;
  formation_threshold_coins?: number;
  unbind_cost_coins?: number;
  visual?: Record<string, unknown> | null;
  rank1_rewards?: { xp_bonus?: number; badge?: boolean } | null;
};

type GiftRule = {
  id: string;
  gift_id: number;
  type_code: string;
  point_value: number;
  enabled: boolean;
  gift_name?: string | null;
  gift_coin_cost?: number | null;
  gift_category?: string | null;
  gift_image_url?: string | null;
  gift_active?: boolean | null;
};

type TypeForm = {
  code: string;
  name: string;
  enabled: boolean;
  levels: boolean;
  xpBonus: string;
  iconUrl: string;
  formedUrl: string;
  color: string;
  maxPartners: string;
  threshold: string;
  unbindCost: string;
  rules: string;
};

function typeColor(t: Pick<RelType, 'code' | 'visual'>) {
  const v = (t.visual ?? {}) as Record<string, string>;
  return v.color_primary ?? (t.code === 'bcp' ? '#7C4DFF' : '#FF4D8D');
}

function formFromType(t: RelType): TypeForm {
  const visual = (t.visual ?? {}) as Record<string, string>;
  return {
    code: t.code,
    name: t.name,
    enabled: !!t.enabled,
    levels: !!t.levels_enabled,
    xpBonus: String(t.rank1_rewards?.xp_bonus ?? 100),
    iconUrl: visual.icon_url ?? '',
    formedUrl: visual.formed_lottie_url ?? '',
    color: typeColor(t),
    maxPartners: t.max_partners != null ? String(t.max_partners) : '',
    threshold: String(t.formation_threshold_coins ?? 0),
    unbindCost: String(t.unbind_cost_coins ?? 0),
    rules: visual.rules ?? '',
  };
}

const EMPTY_FORM: TypeForm = {
  code: 'cp',
  name: 'CP',
  enabled: true,
  levels: false,
  xpBonus: '100',
  iconUrl: '',
  formedUrl: '',
  color: '#FF4D8D',
  maxPartners: '1',
  threshold: '2000000',
  unbindCost: '3000000',
  rules: '',
};

const RULES_PAGE_SIZES = [25, 50, 100];

export default function RelationshipsAdminPage() {
  const { token } = useAdminAuth();
  const [types, setTypes] = useState<RelType[]>([]);
  const [rules, setRules] = useState<GiftRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TypeForm>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<TypeForm>(EMPTY_FORM);
  const [savingType, setSavingType] = useState(false);
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();

  const [newGiftId, setNewGiftId] = useState('');
  const [newTypeCode, setNewTypeCode] = useState('cp');
  const [newPoints, setNewPoints] = useState('100');
  const [savingRule, setSavingRule] = useState(false);

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleType, setRuleType] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState<'' | 'on' | 'off'>('');
  const [ruleSort, setRuleSort] = useState<{ sort: string; order: 'asc' | 'desc' }>({ sort: 'gift', order: 'asc' });
  const [rulePage, setRulePage] = useState(1);
  const [ruleLimit, setRuleLimit] = useState(25);
  const [editingPoints, setEditingPoints] = useState<Record<string, string>>({});
  const [busyRule, setBusyRule] = useState<string | null>(null);

  const load = useCallback(
    async (keepCode?: string) => {
      const tok = localStorage.getItem('ca_admin_token');
      if (!tok) return;
      setLoading(true);
      setLoadError(null);
      try {
        const [t, r] = await Promise.all([
          api<{ data?: { types?: RelType[] } }>('/admin/relationships/types', tok),
          api<{ data?: { rules?: GiftRule[] } }>('/admin/relationships/gift-rules', tok),
        ]);
        const list = t.data?.types ?? [];
        setTypes(list);
        setRules(r.data?.rules ?? []);
        const pickType = list.find((x) => x.code === keepCode) ?? list[0];
        if (pickType) {
          const f = formFromType(pickType);
          setForm(f);
          setSavedForm(f);
        }
      } catch (err) {
        setLoadError(errorText(err, 'Failed to load relationship settings'));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const formDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  function selectType(t: RelType) {
    if (t.code === form.code) return;
    const apply = () => {
      const f = formFromType(t);
      setForm(f);
      setSavedForm(f);
    };
    if (formDirty) {
      confirm({
        title: 'Discard unsaved changes?',
        message: <>You have unsaved changes to <strong>{form.name}</strong>. Switching types will discard them.</>,
        confirmLabel: 'Discard & switch',
        tone: 'danger',
        onConfirm: async () => apply(),
      });
    } else {
      apply();
    }
  }

  function setField<K extends keyof TypeForm>(key: K, value: TypeForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveType() {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const code = form.code.trim().toLowerCase();
    setSavingType(true);
    try {
      await api('/admin/relationships/types', tok, {
        method: 'PUT',
        body: JSON.stringify({
          code,
          name: form.name,
          enabled: form.enabled,
          levels_enabled: form.levels,
          exclusivity_mode: 'none',
          formation_rule: Number(form.threshold) > 0 ? 'gift_threshold' : 'first_qualifying_gift',
          requires_accept: false,
          bidirectional_scoring: true,
          quantity_multiplies_points: true,
          dm_gifts_count: true,
          room_gifts_count: true,
          visual: {
            color_primary: form.color,
            icon_url: form.iconUrl || undefined,
            formed_lottie_url: form.formedUrl || undefined,
            hub_label: code === 'bcp' ? 'BCP' : 'CP',
            hub_tabs: code === 'bcp' ? ['home', 'privileges', 'rules'] : ['home', 'privileges', 'rings'],
            rules: form.rules || undefined,
          },
          rank1_rewards: { xp_bonus: Number(form.xpBonus) || 0, badge: true },
          max_partners: form.maxPartners.trim() === '' ? null : Number(form.maxPartners),
          formation_cost_coins: 0,
          formation_threshold_coins: Number(form.threshold) || 0,
          unbind_cost_coins: Number(form.unbindCost) || 0,
          mic_exp_per_tick: code === 'bcp' ? 120 : 0,
          mic_exp_daily_cap: code === 'bcp' ? 12000 : 0,
        }),
      });
      toast('success', `${form.name} saved`);
      await load(code);
    } catch (err) {
      toast('error', errorText(err, 'Failed to save type'));
    } finally {
      setSavingType(false);
    }
  }

  function askEnsureDefaults() {
    confirm({
      title: 'Ensure CP/BCP defaults',
      message: 'Creates the CP and BCP relationship types if they are missing. Existing types are left as they are.',
      confirmLabel: 'Ensure defaults',
      tone: 'primary',
      onConfirm: async () => {
        const tok = localStorage.getItem('ca_admin_token');
        if (!tok) return;
        await api('/admin/relationships/ensure-defaults', tok, { method: 'POST' });
        toast('success', 'CP/BCP defaults ensured');
        await load(form.code);
      },
    });
  }

  function askSync() {
    confirm({
      title: 'Sync rules from gift categories',
      message: 'Creates or updates gift rules based on each gift’s category (e.g. CP / BCP gifts). Custom point values set here may be overwritten for those gifts.',
      confirmLabel: 'Sync rules',
      tone: 'primary',
      onConfirm: async () => {
        const tok = localStorage.getItem('ca_admin_token');
        if (!tok) return;
        const res = await api<{ data?: { count?: number } }>('/admin/relationships/gift-rules/sync-from-categories', tok, { method: 'POST' });
        toast('success', `Synced ${fmt(res.data?.count ?? 0)} gift rules`);
        await load(form.code);
      },
    });
  }

  async function putRule(rule: { gift_id: number; type_code: string; point_value: number; enabled: boolean }, successText: string) {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    await api('/admin/relationships/gift-rules', tok, { method: 'PUT', body: JSON.stringify(rule) });
    toast('success', successText);
  }

  async function addRule() {
    const giftId = Number(newGiftId);
    const points = Number(newPoints);
    if (!Number.isInteger(giftId) || giftId <= 0) {
      toast('error', 'Enter a valid gift ID');
      return;
    }
    if (!Number.isFinite(points) || points < 0) {
      toast('error', 'Enter a valid point value');
      return;
    }
    setSavingRule(true);
    try {
      await putRule({ gift_id: giftId, type_code: newTypeCode, point_value: points, enabled: true }, `Rule saved for gift #${giftId}`);
      setNewGiftId('');
      await load(form.code);
    } catch (err) {
      toast('error', errorText(err, 'Failed to save rule'));
    } finally {
      setSavingRule(false);
    }
  }

  async function savePoints(r: GiftRule) {
    const raw = editingPoints[r.id];
    if (raw === undefined) return;
    const points = Number(raw);
    if (!Number.isFinite(points) || points < 0 || points === r.point_value) {
      setEditingPoints(({ [r.id]: _, ...rest }) => rest);
      return;
    }
    setBusyRule(r.id);
    try {
      await putRule({ gift_id: r.gift_id, type_code: r.type_code, point_value: points, enabled: r.enabled }, `Points updated for ${r.gift_name ?? `gift #${r.gift_id}`}`);
      setRules((list) => list.map((x) => (x.id === r.id ? { ...x, point_value: points } : x)));
      setEditingPoints(({ [r.id]: _, ...rest }) => rest);
    } catch (err) {
      toast('error', errorText(err, 'Failed to update points'));
    } finally {
      setBusyRule(null);
    }
  }

  async function toggleRule(r: GiftRule) {
    setBusyRule(r.id);
    try {
      await putRule(
        { gift_id: r.gift_id, type_code: r.type_code, point_value: r.point_value, enabled: !r.enabled },
        `${r.gift_name ?? `Gift #${r.gift_id}`} ${r.enabled ? 'disabled' : 'enabled'} for ${r.type_code.toUpperCase()}`,
      );
      setRules((list) => list.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)));
    } catch (err) {
      toast('error', errorText(err, 'Failed to update rule'));
    } finally {
      setBusyRule(null);
    }
  }

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rules.forEach((r) => {
      m[r.type_code] = (m[r.type_code] ?? 0) + 1;
    });
    return m;
  }, [rules]);

  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase().replace(/^#/, '');
    const list = rules.filter((r) => {
      if (ruleType && r.type_code !== ruleType) return false;
      if (ruleEnabled === 'on' && !r.enabled) return false;
      if (ruleEnabled === 'off' && r.enabled) return false;
      if (q && !String(r.gift_id).includes(q) && !(r.gift_name ?? '').toLowerCase().includes(q) && !(r.gift_category ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    const dir = ruleSort.order === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (ruleSort.sort) {
        case 'points':
          return (a.point_value - b.point_value) * dir;
        case 'cost':
          return ((a.gift_coin_cost ?? 0) - (b.gift_coin_cost ?? 0)) * dir;
        case 'name':
          return (a.gift_name ?? '').localeCompare(b.gift_name ?? '') * dir;
        default:
          return (a.gift_id - b.gift_id) * dir;
      }
    });
    return list;
  }, [rules, ruleSearch, ruleType, ruleEnabled, ruleSort]);

  useEffect(() => setRulePage(1), [ruleSearch, ruleType, ruleEnabled, ruleSort, ruleLimit]);

  const rulePages = Math.max(1, Math.ceil(filteredRules.length / ruleLimit));
  const pageRules = filteredRules.slice((rulePage - 1) * ruleLimit, rulePage * ruleLimit);
  const rulesDirty = ruleSearch !== '' || ruleType !== '' || ruleEnabled !== '';

  function onRuleSort(column: string, defaultOrder: 'asc' | 'desc') {
    setRuleSort((s) => (s.sort === column ? { sort: column, order: s.order === 'desc' ? 'asc' : 'desc' } : { sort: column, order: defaultOrder }));
  }

  const typeOptions = types.length ? types.map((t) => t.code) : ['cp', 'bcp'];
  const selectedType = types.find((t) => t.code === form.code);

  return (
    <main className="ad-page">
      <AdminStyles />
      <style>{REL_STYLES}</style>

      <div className="ad-header">
        <div>
          <h1>Relationships (CP / BCP)</h1>
          <p>Configure relationship types and decide which gifts count towards them, and how many points each gift is worth.</p>
        </div>
        <div className="ad-header-actions">
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={() => void load(form.code)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={askEnsureDefaults}>Ensure CP/BCP defaults</button>
          <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" onClick={askSync}>Sync rules from gift categories</button>
        </div>
      </div>

      {loadError && (
        <div className="ad-alert" style={{ margin: '0 0 16px' }}>
          {loadError}
          <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load(form.code)}>Retry</button>
        </div>
      )}

      <div className="rel-types">
        {loading && types.length === 0
          ? [0, 1].map((i) => <div key={i} className="ad-skeleton" style={{ height: 150 }} />)
          : types.map((t) => {
              const active = t.code === form.code;
              const color = typeColor(t);
              return (
                <button key={t.id} type="button" className={`rel-type-card ${active ? 'is-active' : ''}`} onClick={() => selectType(t)} style={{ ['--rel-color' as string]: color }}>
                  <div className="rel-type-top">
                    <span className="rel-swatch" style={{ background: color }} />
                    <div style={{ minWidth: 0, textAlign: 'left' }}>
                      <div className="rel-type-name">{t.name}</div>
                      <div className="ad-sub">Code: {t.code}</div>
                    </div>
                    <span className={`ad-badge ${t.enabled ? 'green' : 'gray'}`} style={{ marginLeft: 'auto' }}>{t.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="rel-type-stats">
                    <div><span>Levels</span><strong>{t.levels_enabled ? 'On' : 'Off'}</strong></div>
                    <div><span>#1 XP bonus</span><strong>{fmt(t.rank1_rewards?.xp_bonus ?? 0)}</strong></div>
                    <div><span>Forms at</span><strong>{t.formation_threshold_coins ? fmt(t.formation_threshold_coins) : '1st gift'}</strong></div>
                    <div><span>Break cost</span><strong>{fmt(t.unbind_cost_coins ?? 0)}</strong></div>
                    <div><span>Max partners</span><strong>{t.max_partners ?? '∞'}</strong></div>
                    <div><span>Gift rules</span><strong>{fmt(typeCounts[t.code] ?? 0)}</strong></div>
                  </div>
                  <div className="rel-type-foot">{active ? 'Editing below' : 'Click to edit'}</div>
                </button>
              );
            })}
      </div>

      <div className="ad-card">
        <div className="ad-card-head">
          <div>
            <h2>
              Edit type: <span style={{ color: form.color }}>{form.name || form.code.toUpperCase()}</span>
            </h2>
            <p>
              {selectedType?.formation_threshold_coins
                ? `Forms automatically once the two users' combined ${selectedType.name} gifts reach ${fmt(selectedType.formation_threshold_coins)} coins. `
                : 'Forms on the first qualifying gift. '}
              Changes apply to the app as soon as you save.
            </p>
          </div>
          <div className="ad-actions">
            {formDirty && <span className="ad-badge amber">Unsaved changes</span>}
            <button
              type="button"
              className="ad-btn ad-btn-ghost ad-btn-lg"
              disabled={!formDirty || savingType}
              onClick={() => setForm(savedForm)}
            >
              Discard
            </button>
            <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" disabled={!formDirty || savingType} onClick={() => void saveType()}>
              {savingType ? 'Saving…' : 'Save type'}
            </button>
          </div>
        </div>

        <div className="ad-card-body rel-form">
          <section>
            <h3>Basics</h3>
            <div className="rel-grid">
              <label className="rel-label">
                Name
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </label>
              <label className="rel-label">
                Primary colour
                <div className="rel-color">
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : '#000000'} onChange={(e) => setField('color', e.target.value.toUpperCase())} />
                  <input value={form.color} onChange={(e) => setField('color', e.target.value)} placeholder="#FF4D8D" />
                </div>
              </label>
              <div className="rel-label">
                Status
                <div className="rel-toggles">
                  <label className="rel-switch">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setField('enabled', e.target.checked)} />
                    <span className="rel-switch-track" />
                    Enabled
                  </label>
                  <label className="rel-switch">
                    <input type="checkbox" checked={form.levels} onChange={(e) => setField('levels', e.target.checked)} />
                    <span className="rel-switch-track" />
                    Levels enabled
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3>Costs, limits &amp; rewards</h3>
            <div className="rel-grid">
              <label className="rel-label">
                Formation threshold (coins gifted)
                <input type="number" min={0} value={form.threshold} onChange={(e) => setField('threshold', e.target.value)} />
                <span className="rel-help">Combined gifts both ways. 0 = forms on the first gift.</span>
              </label>
              <label className="rel-label">
                Break cost (coins)
                <input type="number" min={0} value={form.unbindCost} onChange={(e) => setField('unbindCost', e.target.value)} />
                <span className="rel-help">Paid by the user who removes the pair.</span>
              </label>
              <label className="rel-label">
                Max partners per user
                <input type="number" min={1} value={form.maxPartners} onChange={(e) => setField('maxPartners', e.target.value)} placeholder="Unlimited" />
                <span className="rel-help">1 = one {form.name || 'partner'} at a time. Blank = unlimited.</span>
              </label>
              <label className="rel-label">
                #1 rank XP bonus
                <input type="number" min={0} value={form.xpBonus} onChange={(e) => setField('xpBonus', e.target.value)} />
              </label>
            </div>
          </section>

          <section>
            <h3>Visual assets</h3>
            <div className="rel-grid rel-grid-2">
              <label className="rel-label">
                Icon URL
                <div className="rel-url">
                  {form.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.iconUrl} alt="" className="rel-icon-preview" />
                  ) : (
                    <span className="rel-icon-preview rel-icon-empty" style={{ background: form.color }} />
                  )}
                  <input value={form.iconUrl} onChange={(e) => setField('iconUrl', e.target.value)} placeholder="https://…/icon.png" />
                </div>
              </label>
              <label className="rel-label">
                Formed animation (Lottie) URL
                <input value={form.formedUrl} onChange={(e) => setField('formedUrl', e.target.value)} placeholder="https://…/formed.json" />
                <span className="rel-help">Played when the relationship forms.</span>
              </label>
            </div>
          </section>

          <section>
            <h3>Rules text</h3>
            <textarea rows={6} value={form.rules} onChange={(e) => setField('rules', e.target.value)} placeholder="Shown to users on the relationship rules screen…" />
          </section>
        </div>
      </div>

      <div className="ad-card">
        <div className="ad-card-head">
          <div>
            <h2>Gift rules</h2>
            <p>Which gifts count towards each relationship, and how many points they add. Edit points inline and press Enter to save.</p>
          </div>
        </div>

        <div className="rel-add">
          <span className="rel-add-title">Add or update a rule</span>
          <input className="rel-add-input" type="number" min={1} placeholder="Gift ID" value={newGiftId} onChange={(e) => setNewGiftId(e.target.value)} />
          <select value={newTypeCode} onChange={(e) => setNewTypeCode(e.target.value)}>
            {typeOptions.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
          <input
            className="rel-add-input"
            type="number"
            min={0}
            placeholder="Points"
            value={newPoints}
            onChange={(e) => setNewPoints(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addRule();
            }}
          />
          <button type="button" className="ad-btn ad-btn-primary ad-btn-lg" disabled={savingRule || !newGiftId} onClick={() => void addRule()}>
            {savingRule ? 'Saving…' : 'Save rule'}
          </button>
        </div>

        <Tabs
          value={ruleType}
          onChange={setRuleType}
          tabs={[
            { value: '', label: 'All types', count: rules.length },
            ...typeOptions.map((c) => ({ value: c, label: c.toUpperCase(), count: typeCounts[c] ?? 0 })),
          ]}
        />

        <div className="ad-toolbar">
          <SearchBox value={ruleSearch} onChange={setRuleSearch} placeholder="Search gift name, category or #ID…" />
          <label className="ad-field">
            <span>Status</span>
            <select value={ruleEnabled} onChange={(e) => setRuleEnabled(e.target.value as '' | 'on' | 'off')}>
              <option value="">Any</option>
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </label>
          {rulesDirty && (
            <button
              type="button"
              className="ad-btn ad-btn-ghost ad-btn-lg"
              onClick={() => {
                setRuleSearch('');
                setRuleType('');
                setRuleEnabled('');
              }}
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="ad-summary">
          <strong>{fmt(filteredRules.length)}</strong> rule{filteredRules.length === 1 ? '' : 's'}
          {rulesDirty ? <> (of {fmt(rules.length)})</> : null}
        </div>

        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <SortTh column="gift" label="Gift" sort={ruleSort.sort} order={ruleSort.order} onSort={onRuleSort} defaultOrder="asc" />
                <SortTh column="name" label="Name" sort={ruleSort.sort} order={ruleSort.order} onSort={onRuleSort} defaultOrder="asc" />
                <SortTh column="cost" label="Gift price" sort={ruleSort.sort} order={ruleSort.order} onSort={onRuleSort} align="right" />
                <th className="ad-th">Type</th>
                <SortTh column="points" label="Points" sort={ruleSort.sort} order={ruleSort.order} onSort={onRuleSort} align="right" />
                <th className="ad-th" style={{ textAlign: 'center' }}>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {loading && rules.length === 0 ? (
                <SkeletonRows cols={6} rows={5} />
              ) : pageRules.length === 0 ? (
                <EmptyRow
                  cols={6}
                  title={rules.length === 0 ? 'No gift rules yet' : 'No rules match your filters'}
                  hint={rules.length === 0 ? 'Use “Sync rules from gift categories” or add a rule above.' : 'Try clearing filters.'}
                />
              ) : (
                pageRules.map((r) => {
                  const t = types.find((x) => x.code === r.type_code);
                  const color = t ? typeColor(t) : '#6b7280';
                  const editing = editingPoints[r.id];
                  return (
                    <tr key={r.id} className={`ad-row ${busyRule === r.id ? 'is-busy' : ''} ${r.enabled ? '' : 'is-muted'}`}>
                      <td className="ad-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="rel-gift-img">
                            {r.gift_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.gift_image_url} alt="" loading="lazy" />
                            ) : (
                              <span>🎁</span>
                            )}
                          </div>
                          <span className="ad-id">#{r.gift_id}</span>
                        </div>
                      </td>
                      <td className="ad-td">
                        <div className="ad-name">{r.gift_name ?? <span className="ad-hint">Unknown gift</span>}</div>
                        <div className="ad-sub">
                          {r.gift_category ?? '—'}
                          {r.gift_active === false && <span className="ad-badge gray" style={{ marginLeft: 6, padding: '1px 6px', fontSize: '0.62rem' }}>Gift inactive</span>}
                        </div>
                      </td>
                      <td className="ad-td ad-num">{r.gift_coin_cost != null ? <>🪙 {fmt(r.gift_coin_cost)}</> : '—'}</td>
                      <td className="ad-td">
                        <span className="ad-badge" style={{ background: `${color}1f`, color }}>{r.type_code.toUpperCase()}</span>
                      </td>
                      <td className="ad-td ad-num">
                        <input
                          className={`rel-points ${editing !== undefined && Number(editing) !== r.point_value ? 'is-dirty' : ''}`}
                          type="number"
                          min={0}
                          value={editing ?? String(r.point_value)}
                          onChange={(e) => setEditingPoints((m) => ({ ...m, [r.id]: e.target.value }))}
                          onBlur={() => void savePoints(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingPoints(({ [r.id]: _, ...rest }) => rest);
                          }}
                          aria-label={`Points for gift ${r.gift_id}`}
                        />
                      </td>
                      <td className="ad-td" style={{ textAlign: 'center' }}>
                        <label className="rel-switch" style={{ justifyContent: 'center' }} title={r.enabled ? 'Disable this rule' : 'Enable this rule'}>
                          <input type="checkbox" checked={r.enabled} onChange={() => void toggleRule(r)} />
                          <span className="rel-switch-track" />
                        </label>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pager
          page={rulePage}
          totalPages={rulePages}
          total={filteredRules.length}
          limit={ruleLimit}
          loading={false}
          limits={RULES_PAGE_SIZES}
          onPage={setRulePage}
          onLimit={setRuleLimit}
        />
      </div>

      {confirmNode}
      {toastNode}
    </main>
  );
}

const REL_STYLES = `
.rel-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
.ad-page .rel-type-card { display: flex; flex-direction: column; gap: 14px; text-align: left; background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer; width: auto; font-weight: 400; transition: border-color 0.15s, box-shadow 0.15s; }
.ad-page .rel-type-card:hover { background: #fff; border-color: var(--rel-color); }
.ad-page .rel-type-card.is-active { border-color: var(--rel-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--rel-color) 18%, transparent); }
.rel-type-top { display: flex; align-items: center; gap: 12px; }
.rel-swatch { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }
.rel-type-name { font-weight: 700; font-size: 1.05rem; }
.rel-type-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; }
.rel-type-stats div { display: grid; gap: 2px; }
.rel-type-stats span { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; }
.rel-type-stats strong { font-size: 0.95rem; color: #111827; font-variant-numeric: tabular-nums; }
.rel-type-foot { font-size: 0.75rem; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 10px; }
.rel-type-card.is-active .rel-type-foot { color: var(--rel-color); font-weight: 600; }

.rel-form { display: grid; gap: 24px; }
.rel-form section { display: grid; gap: 12px; }
.rel-form section + section { border-top: 1px solid #f3f4f6; padding-top: 20px; }
.rel-form h3 { margin: 0; font-size: 0.8rem; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; }
.rel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px 16px; }
.rel-grid-2 { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.rel-label { display: grid; gap: 6px; font-size: 0.82rem; font-weight: 600; color: #374151; align-content: start; }
.rel-label input { margin: 0; font-weight: 400; }
.rel-help { font-size: 0.75rem; color: #9ca3af; font-weight: 400; }
.rel-color { display: flex; gap: 8px; align-items: center; }
.rel-color input[type=color] { width: 44px; height: 40px; padding: 2px; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
.rel-url { display: flex; gap: 8px; align-items: center; }
.rel-icon-preview { width: 40px; height: 40px; border-radius: 8px; object-fit: contain; background: #f3f4f6; flex-shrink: 0; border: 1px solid #e5e7eb; }
.rel-icon-empty { display: inline-block; opacity: 0.35; }
.rel-toggles { display: flex; gap: 18px; flex-wrap: wrap; padding-top: 8px; }

.rel-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500; color: #374151; font-size: 0.85rem; user-select: none; }
.rel-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.rel-switch-track { position: relative; width: 38px; height: 22px; border-radius: 999px; background: #d1d5db; transition: background 0.15s; flex-shrink: 0; }
.rel-switch-track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: transform 0.15s; }
.rel-switch input:checked + .rel-switch-track { background: #059669; }
.rel-switch input:checked + .rel-switch-track::after { transform: translateX(16px); }
.rel-switch input:focus-visible + .rel-switch-track { box-shadow: 0 0 0 3px rgba(99,102,241,0.3); }

.rel-add { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px 20px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
.rel-add-title { font-size: 0.8rem; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.03em; margin-right: 4px; }
.rel-add-input { width: 130px !important; margin: 0; }
.ad-page .rel-add select { min-width: 100px; }

.rel-gift-img { width: 36px; height: 36px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.rel-gift-img img { width: 100%; height: 100%; object-fit: contain; }
.rel-points { width: 96px !important; text-align: right; padding: 6px 8px !important; margin: 0; font-variant-numeric: tabular-nums; }
.rel-points.is-dirty { border-color: #f59e0b; background: #fffbeb; }
`;
