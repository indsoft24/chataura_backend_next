'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

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
};

export default function RelationshipsAdminPage() {
  const { token } = useAdminAuth();
  const [types, setTypes] = useState<RelType[]>([]);
  const [rules, setRules] = useState<GiftRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [giftId, setGiftId] = useState('');
  const [typeCode, setTypeCode] = useState('cp');
  const [pointValue, setPointValue] = useState('100');

  const [editCode, setEditCode] = useState('cp');
  const [editName, setEditName] = useState('CP');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editLevels, setEditLevels] = useState(false);
  const [editXpBonus, setEditXpBonus] = useState('100');
  const [editIconUrl, setEditIconUrl] = useState('');
  const [editFormedUrl, setEditFormedUrl] = useState('');
  const [editColorPrimary, setEditColorPrimary] = useState('#FF4D8D');
  const [editMax, setEditMax] = useState('');
  const [editFormCost, setEditFormCost] = useState('0');
  const [editUnbindCost, setEditUnbindCost] = useState('0');
  const [editRules, setEditRules] = useState('');

  async function load(tok: string) {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([
        api<any>('/admin/relationships/types', tok),
        api<any>('/admin/relationships/gift-rules', tok),
      ]);
      const list: RelType[] = t.data?.types ?? [];
      setTypes(list);
      setRules(r.data?.rules ?? []);
      const first = list.find((x) => x.code === editCode) ?? list[0];
      if (first) applyTypeToForm(first);
    } catch (e) {
      console.error(e);
      setMsg(String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyTypeToForm(t: RelType) {
    setEditCode(t.code);
    setEditName(t.name);
    setEditEnabled(!!t.enabled);
    setEditLevels(!!t.levels_enabled);
    setEditXpBonus(String(t.rank1_rewards?.xp_bonus ?? 100));
    const visual = (t.visual ?? {}) as Record<string, string>;
    setEditIconUrl(visual.icon_url ?? '');
    setEditFormedUrl(visual.formed_lottie_url ?? '');
    setEditColorPrimary(visual.color_primary ?? (t.code === 'bcp' ? '#7C4DFF' : '#FF4D8D'));
    setEditMax(t.max_partners != null ? String(t.max_partners) : '');
    setEditFormCost(String(t.formation_cost_coins ?? 0));
    setEditUnbindCost(String(t.unbind_cost_coins ?? 0));
    setEditRules(visual.rules ?? '');
  }

  useEffect(() => {
    if (token) void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function ensureDefaults() {
    if (!token) return;
    await api('/admin/relationships/ensure-defaults', token, { method: 'POST' });
    setMsg('Defaults ensured (cp/bcp)');
    await load(token);
  }

  async function syncFromCategories() {
    if (!token) return;
    const res = await api<any>('/admin/relationships/gift-rules/sync-from-categories', token, {
      method: 'POST',
    });
    setMsg(`Synced ${res.data?.count ?? 0} gift rules from categories`);
    await load(token);
  }

  async function saveRule() {
    if (!token) return;
    await api('/admin/relationships/gift-rules', token, {
      method: 'PUT',
      body: JSON.stringify({
        gift_id: Number(giftId),
        type_code: typeCode,
        point_value: Number(pointValue),
        enabled: true,
      }),
    });
    setMsg('Gift rule saved');
    setGiftId('');
    await load(token);
  }

  async function saveType() {
    if (!token) return;
    await api('/admin/relationships/types', token, {
      method: 'PUT',
      body: JSON.stringify({
        code: editCode.trim().toLowerCase(),
        name: editName,
        enabled: editEnabled,
        levels_enabled: editLevels,
        exclusivity_mode: editCode.trim().toLowerCase() === 'bcp' ? 'none' : 'none',
        formation_rule: 'first_qualifying_gift',
        requires_accept: editCode.trim().toLowerCase() === 'bcp',
        bidirectional_scoring: true,
        quantity_multiplies_points: true,
        dm_gifts_count: true,
        room_gifts_count: true,
        visual: {
          color_primary: editColorPrimary,
          icon_url: editIconUrl || undefined,
          formed_lottie_url: editFormedUrl || undefined,
          hub_label: editCode.trim().toLowerCase() === 'bcp' ? 'BCP' : 'CP',
          hub_tabs:
            editCode.trim().toLowerCase() === 'bcp'
              ? ['home', 'privileges', 'rules']
              : ['home', 'privileges', 'rings'],
          rules: editRules || undefined,
        },
        rank1_rewards: {
          xp_bonus: Number(editXpBonus) || 0,
          badge: true,
        },
        max_partners: editMax.trim() === '' ? null : Number(editMax),
        formation_cost_coins: Number(editFormCost) || 0,
        unbind_cost_coins: Number(editUnbindCost) || 0,
        mic_exp_per_tick: editCode.trim().toLowerCase() === 'bcp' ? 120 : 0,
        mic_exp_daily_cap: editCode.trim().toLowerCase() === 'bcp' ? 12000 : 0,
      }),
    });
    setMsg(`Type ${editCode} saved`);
    await load(token);
  }

  return (
    <div style={{ padding: 24, color: '#e5e7eb' }}>
      <h1 style={{ marginTop: 0 }}>Relationships (CP / BCP)</h1>
      <p style={{ color: '#9ca3af' }}>
        Generic relationship engine. Edit type config, sync gift rules from categories, or set custom
        points per gift.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => void ensureDefaults()} style={btnStyle}>
          Ensure CP/BCP defaults
        </button>
        <button onClick={() => void syncFromCategories()} style={btnStyle}>
          Sync rules from gift categories
        </button>
        <button onClick={() => token && void load(token)} style={btnStyleSecondary}>
          Refresh
        </button>
      </div>

      {msg && <p style={{ color: '#F5C542' }}>{msg}</p>}
      {loading && <p>Loading…</p>}

      <h2>Edit type</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          marginBottom: 16,
          background: '#111827',
          padding: 16,
          borderRadius: 12,
        }}
      >
        <label style={labelStyle}>
          Code
          <select
            value={editCode}
            onChange={(e) => {
              const code = e.target.value;
              setEditCode(code);
              const t = types.find((x) => x.code === code);
              if (t) applyTypeToForm(t);
            }}
            style={inputStyle}
          >
            {types.length === 0 && (
              <>
                <option value="cp">cp</option>
                <option value="bcp">bcp</option>
              </>
            )}
            {types.map((t) => (
              <option key={t.id} value={t.code}>
                {t.code}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Name
          <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Primary color
          <input
            value={editColorPrimary}
            onChange={(e) => setEditColorPrimary(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          #1 XP bonus
          <input value={editXpBonus} onChange={(e) => setEditXpBonus(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Icon URL
          <input value={editIconUrl} onChange={(e) => setEditIconUrl(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Formed Lottie URL
          <input
            value={editFormedUrl}
            onChange={(e) => setEditFormedUrl(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Max partners (blank = unlimited)
          <input value={editMax} onChange={(e) => setEditMax(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Formation cost
          <input value={editFormCost} onChange={(e) => setEditFormCost(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Unbind cost
          <input value={editUnbindCost} onChange={(e) => setEditUnbindCost(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Rules text
          <textarea
            value={editRules}
            onChange={(e) => setEditRules(e.target.value)}
            style={{ ...inputStyle, minHeight: 120 }}
          />
        </label>
        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={editEnabled}
            onChange={(e) => setEditEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={editLevels}
            onChange={(e) => setEditLevels(e.target.checked)}
          />
          Levels enabled
        </label>
        <button onClick={() => void saveType()} style={btnStyle}>
          Save type
        </button>
      </div>

      <h2>Types</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Enabled</th>
            <th>Levels</th>
            <th>Exclusivity</th>
            <th>#1 XP</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr
              key={t.id}
              style={{ cursor: 'pointer' }}
              onClick={() => applyTypeToForm(t)}
            >
              <td>{t.code}</td>
              <td>{t.name}</td>
              <td>{t.enabled ? 'yes' : 'no'}</td>
              <td>{t.levels_enabled ? 'on' : 'off'}</td>
              <td>{t.exclusivity_mode ?? 'none'}</td>
              <td>{t.rank1_rewards?.xp_bonus ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32 }}>Upsert gift rule</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Gift ID"
          value={giftId}
          onChange={(e) => setGiftId(e.target.value)}
          style={inputStyle}
        />
        <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} style={inputStyle}>
          <option value="cp">cp</option>
          <option value="bcp">bcp</option>
        </select>
        <input
          placeholder="Point value"
          value={pointValue}
          onChange={(e) => setPointValue(e.target.value)}
          style={inputStyle}
        />
        <button onClick={() => void saveRule()} style={btnStyle}>
          Save rule
        </button>
      </div>

      <h2>Gift rules</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th>Gift ID</th>
            <th>Type</th>
            <th>Points</th>
            <th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.gift_id}</td>
              <td>{r.type_code}</td>
              <td>{r.point_value}</td>
              <td>{r.enabled ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const btnStyle = {
  background: '#F5C542',
  color: '#0B0B12',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const btnStyleSecondary = {
  ...btnStyle,
  background: '#374151',
  color: '#fff',
} as const;

const inputStyle = {
  background: '#111827',
  color: '#fff',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '8px 12px',
  width: '100%',
} as const;

const labelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  fontSize: 12,
  color: '#9ca3af',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  background: '#111827',
};
