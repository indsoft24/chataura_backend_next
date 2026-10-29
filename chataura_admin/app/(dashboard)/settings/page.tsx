'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Field, PageHeader, Switch, Tabs, errorText, useToasts } from '@/components/admin-ui';

type Num = { kind: 'num'; key: string; label: string; hint?: string; unit?: string; min?: number; max?: number; step?: number };
type Toggle = { kind: 'toggle'; key: string; label: string; hint?: string; defaultOn?: boolean };
type Note = { kind: 'note'; text: React.ReactNode };
type Group = { title?: string; hint?: string; cols?: 2 | 3 | 4; items: (Num | Toggle | Note)[] };
type TabId = 'commissions' | 'withdrawals' | 'streaks' | 'games' | 'staff' | 'animations' | 'rooms';

const pct = (key: string, label: string, hint?: string): Num => ({ kind: 'num', key, label, hint, unit: '%', min: 0, max: 100 });
const coins = (key: string, label: string, hint?: string, min = 0): Num => ({ kind: 'num', key, label, hint, unit: 'coins', min });

const TABS: { id: TabId; label: string; groups: Group[] }[] = [
  {
    id: 'commissions',
    label: 'Commissions',
    groups: [
      { title: 'Gifts', cols: 3, items: [
        pct('gift_commission_percent', 'Gift platform commission'),
        coins('lucky_gift_min_coins', 'Lucky gift minimum', 'Lucky gifts start at this many coins. Cheaper lucky gifts are hidden in the app and cannot be sent; admins cannot price one lower. 0 = no minimum. Applies at once, no build needed.'),
        pct('lucky_rebate_min_pct', 'Lucky gift rebate — min', 'Of the gift value.'),
        pct('lucky_rebate_max_pct', 'Lucky gift rebate — max', 'Of the gift value.'),
      ] },
      { title: 'Star chat', items: [
        coins('star_chat_price_per_min', 'Price per minute'),
        pct('star_chat_commission_percent', 'Star chat commission'),
      ] },
    ],
  },
  {
    id: 'withdrawals',
    label: 'Withdrawals & FX',
    groups: [
      { title: 'Withdrawal limits', items: [
        { kind: 'num', key: 'min_withdrawal', label: 'Minimum withdrawal', unit: 'INR', min: 1 },
        { kind: 'num', key: 'max_withdrawal', label: 'Maximum withdrawal', unit: 'INR', min: 1 },
      ] },
      { title: 'Exchange rates', cols: 4, items: [
        { kind: 'num', key: 'inr_per_usd', label: 'INR per USD', step: 0.01 },
        { kind: 'num', key: 'gems_per_rupee', label: 'Gems per rupee', min: 1 },
        { kind: 'num', key: 'gems_per_dollar', label: 'Gems per dollar', min: 1 },
        { kind: 'num', key: 'gems_per_coin', label: 'Gems per coin', min: 1 },
      ] },
    ],
  },
  {
    id: 'streaks',
    label: 'Streaks & Referrals',
    groups: [
      { title: 'Daily streak', items: [{ kind: 'toggle', key: 'streak_enabled', label: 'Daily streak bonus', hint: 'Users earn coins for opening the app on consecutive days.' }] },
      { cols: 4, items: [1, 2, 3, 4, 5, 6, 7].map((d) => coins(`streak_day_${d}_coins`, `Day ${d}`)) },
      { title: 'Referral rewards', items: [
        coins('referral_reward_referrer', 'Referrer reward', 'Paid to the user who invited.'),
        coins('referral_reward_referee', 'Referee signup reward', 'Paid to the new user.'),
      ] },
      { title: 'Referral milestone', items: [{ kind: 'toggle', key: 'referral_milestone_enabled', label: 'Milestone bonus', hint: 'One-time bonus after inviting a set number of friends.' }] },
      { items: [
        { kind: 'num', key: 'referral_milestone_required_count', label: 'Friends required', min: 1 },
        coins('referral_milestone_coins', 'Milestone bonus'),
      ] },
    ],
  },
  {
    id: 'games',
    label: 'Games & Ads',
    groups: [
      { title: 'Mini games', items: [
        { kind: 'toggle', key: 'game_1_enabled', label: 'Greedy Wheel', hint: 'Fruit game 1.' },
        { kind: 'toggle', key: 'game_2_enabled', label: 'Lucky 77 Wheel', hint: 'Game 2.' },
      ] },
      { title: 'Rewarded ads', items: [{ kind: 'toggle', key: 'admob_enabled', label: 'AdMob rewarded video', hint: 'Users can watch an ad to earn coins.' }] },
      { items: [
        coins('admob_ad_coins', 'Coins per watched ad'),
        { kind: 'num', key: 'admob_daily_ad_limit', label: 'Daily ad limit per user', unit: 'ads', min: 0 },
      ] },
    ],
  },
  {
    id: 'staff',
    label: 'Staff Defaults',
    groups: [
      { title: 'Default commission by badge', hint: 'Used when a staff member has no personal rate set.', cols: 3, items: [
        pct('staff_commission_ceo_percent', 'CEO'),
        pct('staff_commission_manager_percent', 'Manager'),
        pct('staff_commission_admin_percent', 'Admin'),
      ] },
    ],
  },
  {
    id: 'animations',
    label: 'Gift Animations',
    groups: [
      { cols: 3, items: [
        coins('room_gift_big_animation_threshold_coins', 'Big animation threshold', 'Gifts worth at least this play the full-screen animation.', 1),
        { kind: 'num', key: 'room_gift_banner_duration_small_ms', label: 'Small gift banner', unit: 'ms', min: 500, max: 30000 },
        { kind: 'num', key: 'room_gift_banner_duration_big_ms', label: 'Big gift banner', unit: 'ms', min: 500, max: 30000 },
      ] },
    ],
  },
  {
    id: 'rooms',
    label: 'Rooms & Video',
    groups: [
      { items: [
        { kind: 'toggle', key: 'room_video_enabled', defaultOn: true, label: 'Party room video & camera', hint: 'Master switch. When on, seated hosts can publish camera video in party rooms; when off, video is disabled in every room instantly — no app update needed.' },
      ] },
      { items: [
        { kind: 'num', key: 'room_member_timeout_seconds', label: 'Member timeout', unit: 'sec', min: 45, max: 600, hint: 'A member with no heartbeat for this long leaves and their seat is freed. 45–600 s, default 90. Lower cleans up faster; higher tolerates weak networks.' },
      ] },
    ],
  },
];

const DEFAULTS: Record<string, any> = {
  gift_commission_percent: 20,
  audio_call_price_per_min: 20,
  audio_call_commission_percent: 20,
  video_call_price_per_min: 40,
  video_call_commission_percent: 20,
  star_chat_price_per_min: 5,
  star_chat_commission_percent: 30,
  min_withdrawal: 100,
  max_withdrawal: 50000,
  inr_per_usd: 83.5,
  gems_per_rupee: 10,
  gems_per_dollar: 835,
  gems_per_coin: 10,
  min_gems_convert: 100,
  min_inr_withdrawal: 100,
  max_inr_withdrawal: 50000,
  streak_enabled: true,
  streak_day_1_coins: 10,
  streak_day_2_coins: 20,
  streak_day_3_coins: 30,
  streak_day_4_coins: 40,
  streak_day_5_coins: 50,
  streak_day_6_coins: 60,
  streak_day_7_coins: 100,
  referral_reward_referrer: 50,
  referral_reward_referee: 50,
  referral_milestone_enabled: true,
  referral_milestone_required_count: 5,
  referral_milestone_coins: 100,
  referral_coin_conversion_rate: 1,
  admob_enabled: false,
  admob_ad_coins: 10,
  admob_daily_ad_limit: 5,
  game_1_enabled: true,
  game_2_enabled: true,
  game_3_enabled: true,
  staff_commission_ceo_percent: 5,
  staff_commission_manager_percent: 3,
  staff_commission_admin_percent: 2,
  room_gift_big_animation_threshold_coins: 5000,
  room_gift_banner_duration_small_ms: 3000,
  room_gift_banner_duration_big_ms: 6000,
  room_video_enabled: true,
  room_member_timeout_seconds: 90,
  lucky_gift_min_coins: 2000,
  lucky_rebate_min_pct: 1,
  lucky_rebate_max_pct: 40,
};

export default function SettingsPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('commissions');
  const [form, setForm] = useState<Record<string, any>>(DEFAULTS);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api<any>('/admin/settings', token);
        const next = { ...DEFAULTS, ...(res.data?.settings ?? {}) };
        setForm(next);
        setSaved(JSON.stringify(next));
      } catch (err) {
        toast('error', errorText(err, 'Failed to load settings'));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, toast]);

  const dirty = !loading && saved !== '' && JSON.stringify(form) !== saved;
  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      // Send only what changed: sending the whole form made the server pick up stale copies of a setting
      // (e.g. the old gift commission next to the one just typed).
      const before = JSON.parse(saved || '{}');
      const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
      const res = await api<any>('/admin/settings', token, { method: 'PATCH', body: JSON.stringify(changed) });
      const next = { ...form, ...(res.data?.settings ?? {}) };
      setForm(next);
      setSaved(JSON.stringify(next));
      toast('success', 'Settings saved and applied');
    } catch (err) {
      toast('error', errorText(err, 'Failed to update settings'));
    } finally {
      setSaving(false);
    }
  }

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <main className="cp-page">
      <style dangerouslySetInnerHTML={{ __html: SET_STYLES }} />
      <PageHeader
        title="Platform Settings"
        subtitle="Global financial rates, rewards, games and room behaviour. Changes apply as soon as you save."
      />

      <form
        className="cp-card"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Tabs value={activeTab} onChange={setActiveTab} tabs={TABS.map((t) => ({ value: t.id, label: t.label }))} />
        {loading ? (
          <div className="cp-card-body" style={{ display: 'grid', gap: 12 }}>
            <div className="cp-skeleton" /><div className="cp-skeleton" /><div className="cp-skeleton" />
          </div>
        ) : (
          <div className="cp-card-body set-body">
            {tab.groups.map((g, gi) => (
              <section key={gi} className="set-group">
                {g.title ? (
                  <div className="set-group-head">
                    <h3>{g.title}</h3>
                    {g.hint ? <p>{g.hint}</p> : null}
                  </div>
                ) : null}
                <div className={`set-grid cols-${g.cols ?? 2}`}>
                  {g.items.map((it, i) =>
                    it.kind === 'toggle' ? (
                      <div key={it.key} className="cp-toggle-row is-wide">
                        <div>
                          <div className="cp-toggle-title">{it.label}</div>
                          {it.hint ? <div className="cp-toggle-hint">{it.hint}</div> : null}
                        </div>
                        <Switch
                          label={it.label}
                          checked={it.defaultOn ? form[it.key] !== false : Boolean(form[it.key])}
                          onChange={(v) => set(it.key, v)}
                        />
                      </div>
                    ) : it.kind === 'note' ? (
                      <div key={i} className="cp-note is-wide">{it.text}</div>
                    ) : (
                      <Field key={it.key} label={it.label} hint={it.hint}>
                        <div className="cp-unit">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={it.min}
                            max={it.max}
                            step={it.step}
                            value={form[it.key] ?? ''}
                            onChange={(e) => set(it.key, Number(e.target.value))}
                          />
                          {it.unit ? <span>{it.unit}</span> : null}
                        </div>
                      </Field>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className={`set-savebar ${dirty ? 'is-dirty' : ''}`}>
          <span>{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          <button type="submit" className="cp-btn cp-btn-accent cp-btn-lg" disabled={saving || loading || !dirty}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
      {toastNode}
    </main>
  );
}

const SET_STYLES = `
.set-body { display: grid; gap: 26px; }
.set-group-head { margin-bottom: 12px; }
.set-group-head h3 { margin: 0; font-size: 0.95rem; font-weight: 700; color: #111827; }
.set-group-head p { margin: 2px 0 0; font-size: 0.82rem; color: #6b7280; }
.set-group + .set-group:not(:has(.set-group-head)) { margin-top: -12px; }
.set-grid { display: grid; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 880px; }
.set-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.set-grid.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.set-grid .is-wide { grid-column: 1 / -1; }
.set-savebar { position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 12px 20px; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96); backdrop-filter: blur(6px); border-radius: 0 0 14px 14px; z-index: 5; }
.set-savebar span { font-size: 0.84rem; color: #9ca3af; }
.set-savebar.is-dirty { position: sticky; bottom: 0; box-shadow: 0 -6px 16px rgba(16,24,40,0.06); }
.set-savebar.is-dirty span { color: #b45309; font-weight: 600; }
@media (max-width: 900px) {
  .set-grid.cols-3, .set-grid.cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .set-body { gap: 22px; }
  .set-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .set-grid.cols-3, .set-grid.cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .set-savebar { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); justify-content: space-between; }
}
`;
