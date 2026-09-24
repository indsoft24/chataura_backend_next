'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Campaign = {
  id: number;
  name: string;
  launch_threshold_coins: number;
  reward_pool_percentage: number;
  max_winners_count: number;
  reward_distribution_rules: number[];
  minimum_contribution_required: number;
  eligible_room_types: string[];
  rockit_duration_seconds: number;
  status: boolean;
};

const emptyForm = {
  id: undefined as number | undefined,
  name: 'Rockit',
  launch_threshold_coins: '100000',
  reward_pool_percentage: '50',
  max_winners_count: '7',
  reward_distribution_rules: '40,25,15,10,5,3,2',
  minimum_contribution_required: '1',
  eligible_room_types: 'all',
  rockit_duration_seconds: '3600',
  status: true,
};

export default function RockitCampaignsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');

  async function load(tok: string) {
    setLoading(true);
    try {
      const json = await api<{ success?: boolean; data?: { campaigns: Campaign[] }; campaigns?: Campaign[] }>(
        '/admin/rockit/campaigns',
        tok,
      );
      const list = json.data?.campaigns ?? json.campaigns ?? [];
      setCampaigns(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load(token);
  }, [token]);

  function edit(c: Campaign) {
    setForm({
      id: c.id,
      name: c.name,
      launch_threshold_coins: String(c.launch_threshold_coins),
      reward_pool_percentage: String(c.reward_pool_percentage),
      max_winners_count: String(c.max_winners_count),
      reward_distribution_rules: (c.reward_distribution_rules ?? []).join(','),
      minimum_contribution_required: String(c.minimum_contribution_required),
      eligible_room_types: Array.isArray(c.eligible_room_types)
        ? c.eligible_room_types.join(',')
        : 'all',
      rockit_duration_seconds: String(c.rockit_duration_seconds),
      status: c.status,
    });
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setMsg('');
    try {
      const rules = form.reward_distribution_rules
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const types = form.eligible_room_types
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api('/admin/rockit/campaigns', token, {
        method: 'POST',
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          launch_threshold_coins: Number(form.launch_threshold_coins),
          reward_pool_percentage: Number(form.reward_pool_percentage),
          max_winners_count: Number(form.max_winners_count),
          reward_distribution_rules: rules,
          minimum_contribution_required: Number(form.minimum_contribution_required),
          eligible_room_types: types.length ? types : ['all'],
          rockit_duration_seconds: Number(form.rockit_duration_seconds),
          status: form.status,
        }),
      });
      setMsg(form.id ? 'Campaign updated.' : 'Campaign created.');
      setForm(emptyForm);
      await load(token);
      setTimeout(() => setMsg(''), 3500);
    } catch (e) {
      console.error(e);
      setMsg('Save failed. Check fields and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!token) return;
    if (!confirm(`Delete Rockit campaign #${id}?`)) return;
    try {
      await api(`/admin/rockit/campaigns/${id}`, token, { method: 'DELETE' });
      await load(token);
    } catch (e) {
      console.error(e);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: '0.95rem',
  } as const;

  return (
    <main style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
          Rockit campaigns
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
          Crowdfund threshold, reward pool %, top winners, and room eligibility. Activating a campaign deactivates others.
        </p>
      </div>

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            background: msg.includes('fail') ? '#fee2e2' : '#d1fae5',
            color: msg.includes('fail') ? '#991b1b' : '#065f46',
            borderRadius: 8,
            marginBottom: 20,
            fontWeight: 600,
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>
            {form.id ? `Edit campaign #${form.id}` : 'New campaign'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Name</span>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Launch threshold (coins)</span>
              <input
                style={inputStyle}
                type="number"
                value={form.launch_threshold_coins}
                onChange={(e) => setForm({ ...form, launch_threshold_coins: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Reward pool %</span>
              <input
                style={inputStyle}
                type="number"
                value={form.reward_pool_percentage}
                onChange={(e) => setForm({ ...form, reward_pool_percentage: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Max winners</span>
              <input
                style={inputStyle}
                type="number"
                value={form.max_winners_count}
                onChange={(e) => setForm({ ...form, max_winners_count: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Distribution rules (comma %)</span>
              <input
                style={inputStyle}
                value={form.reward_distribution_rules}
                onChange={(e) => setForm({ ...form, reward_distribution_rules: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Minimum contribution</span>
              <input
                style={inputStyle}
                type="number"
                value={form.minimum_contribution_required}
                onChange={(e) => setForm({ ...form, minimum_contribution_required: e.target.value })}
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Eligible room types</span>
              <input
                style={inputStyle}
                value={form.eligible_room_types}
                onChange={(e) => setForm({ ...form, eligible_room_types: e.target.value })}
                placeholder="all or public,vip,permanent"
              />
            </label>
            <label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Duration (seconds)</span>
              <input
                style={inputStyle}
                type="number"
                value={form.rockit_duration_seconds}
                onChange={(e) => setForm({ ...form, rockit_duration_seconds: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.checked })}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Active</span>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 0,
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving…' : form.id ? 'Update' : 'Create'}
              </button>
              {form.id != null && (
                <button
                  type="button"
                  onClick={() => setForm(emptyForm)}
                  style={{
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Campaigns</h2>
          {loading ? (
            <p style={{ color: '#6b7280' }}>Loading…</p>
          ) : campaigns.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No campaigns yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 14,
                    background: c.status ? '#f0fdf4' : '#f9fafb',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>
                        #{c.id} {c.name}
                      </strong>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                        Threshold {c.launch_threshold_coins.toLocaleString()} · Pool{' '}
                        {c.reward_pool_percentage}% · Top {c.max_winners_count} ·{' '}
                        {c.status ? 'Active' : 'Off'}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                        Rules [{(c.reward_distribution_rules ?? []).join(', ')}] · Min{' '}
                        {c.minimum_contribution_required} ·{' '}
                        {(c.eligible_room_types ?? []).join(', ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button type="button" onClick={() => edit(c)} style={{ cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(c.id)}
                        style={{ color: '#b91c1c', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
