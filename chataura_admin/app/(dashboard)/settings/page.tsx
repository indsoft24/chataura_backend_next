'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function SettingsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'commissions' | 'withdrawals' | 'streaks' | 'games' | 'staff' | 'animations'>('commissions');

  // Form fields
  const [form, setForm] = useState<Record<string, any>>({
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
    referral_coin_conversion_rate: 1,
    admob_enabled: false,
    admob_ad_coins: 10,
    admob_daily_ad_limit: 5,
    game_1_enabled: true,
    game_2_enabled: true,
    game_3_enabled: true,
    agency_cashback_enabled: true,
    agency_cashback_threshold_coins: 2000,
    staff_commission_ceo_percent: 5,
    staff_commission_manager_percent: 3,
    staff_commission_admin_percent: 2,
    room_gift_big_animation_threshold_coins: 5000,
    room_gift_banner_duration_small_ms: 3000,
    room_gift_banner_duration_big_ms: 6000,
  });

  useEffect(() => {
    if (!token) return;
    async function loadSettings() {
      setLoading(true);
      try {
        const res = await api<any>('/admin/settings', token!);
        if (res.data?.settings) {
          setForm((prev) => ({ ...prev, ...res.data.settings }));
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [token]);

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<any>('/admin/settings', token, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      if (res.data?.settings) {
        setForm((prev) => ({ ...prev, ...res.data.settings }));
      }
      setMessage({ type: 'success', text: 'Settings successfully saved and applied.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'commissions', label: 'Commissions & Rates' },
    { id: 'withdrawals', label: 'Withdrawal & FX' },
    { id: 'streaks', label: 'Streaks & Referrals' },
    { id: 'games', label: 'Games & Ads' },
    { id: 'staff', label: 'Staff Defaults' },
    { id: 'animations', label: 'Gift Animations' },
  ] as const;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Platform Settings</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            Configure global financial rates, daily rewards, mini-games, and call pricing.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            padding: '10px 24px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: saving || loading ? 'not-allowed' : 'pointer',
            opacity: saving || loading ? 0.7 : 1,
            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
          }}
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            backgroundColor: message.type === 'success' ? '#def7ec' : '#fde8e8',
            color: message.type === 'success' ? '#03543f' : '#9b1c1c',
            border: `1px solid ${message.type === 'success' ? '#bcf0da' : '#f8b4b4'}`,
            fontSize: '0.9rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24, gap: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: activeTab === t.id ? '#4f46e5' : '#6b7280',
              borderBottom: activeTab === t.id ? '2px solid #4f46e5' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading platform settings...</div>
      ) : (
        <form onSubmit={handleSave} style={{ backgroundColor: '#fff', padding: 28, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {activeTab === 'commissions' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Gift Platform Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.gift_commission_percent ?? ''}
                  onChange={(e) => handleChange('gift_commission_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Audio Call Price Per Min (Coins)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.audio_call_price_per_min ?? ''}
                  onChange={(e) => handleChange('audio_call_price_per_min', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Audio Call Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.audio_call_commission_percent ?? ''}
                  onChange={(e) => handleChange('audio_call_commission_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Video Call Price Per Min (Coins)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.video_call_price_per_min ?? ''}
                  onChange={(e) => handleChange('video_call_price_per_min', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Video Call Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.video_call_commission_percent ?? ''}
                  onChange={(e) => handleChange('video_call_commission_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Star Chat Price Per Min (Coins)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.star_chat_price_per_min ?? ''}
                  onChange={(e) => handleChange('star_chat_price_per_min', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Star Chat Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.star_chat_commission_percent ?? ''}
                  onChange={(e) => handleChange('star_chat_commission_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'withdrawals' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Min Withdrawal (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.min_withdrawal ?? ''}
                  onChange={(e) => handleChange('min_withdrawal', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Max Withdrawal (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.max_withdrawal ?? ''}
                  onChange={(e) => handleChange('max_withdrawal', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  INR per USD (Exchange Rate)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.inr_per_usd ?? ''}
                  onChange={(e) => handleChange('inr_per_usd', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Gems Per Rupee (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.gems_per_rupee ?? ''}
                  onChange={(e) => handleChange('gems_per_rupee', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Gems Per Dollar (USD)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.gems_per_dollar ?? ''}
                  onChange={(e) => handleChange('gems_per_dollar', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Gems Per Coin
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.gems_per_coin ?? ''}
                  onChange={(e) => handleChange('gems_per_coin', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'streaks' && (
            <div>
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="streak_enabled"
                  checked={Boolean(form.streak_enabled)}
                  onChange={(e) => handleChange('streak_enabled', e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="streak_enabled" style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>
                  Enable Daily Streak Bonus
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <div key={day}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                      Day {day} Coins
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form[`streak_day_${day}_coins`] ?? ''}
                      onChange={(e) => handleChange(`streak_day_${day}_coins`, Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: '20px 0 12px' }}>
                Referral Rewards
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Referrer Reward (Coins)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.referral_reward_referrer ?? ''}
                    onChange={(e) => handleChange('referral_reward_referrer', Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Referee Signup Reward (Coins)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.referral_reward_referee ?? ''}
                    onChange={(e) => handleChange('referral_reward_referee', Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    id="game_1"
                    checked={Boolean(form.game_1_enabled)}
                    onChange={(e) => handleChange('game_1_enabled', e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="game_1" style={{ fontWeight: 600, color: '#111827' }}>
                    Greedy Wheel (Fruit Game 1) Enabled
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="game_2"
                    checked={Boolean(form.game_2_enabled)}
                    onChange={(e) => handleChange('game_2_enabled', e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="game_2" style={{ fontWeight: 600, color: '#111827' }}>
                    Lucky 77 Wheel (Game 2) Enabled
                  </label>
                </div>
              </div>

              <div style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    id="admob_enabled"
                    checked={Boolean(form.admob_enabled)}
                    onChange={(e) => handleChange('admob_enabled', e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="admob_enabled" style={{ fontWeight: 600, color: '#111827' }}>
                    AdMob Rewarded Video Ads Enabled
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Coins Per Watched Ad
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.admob_ad_coins ?? ''}
                      onChange={(e) => handleChange('admob_ad_coins', Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Daily Ad Limit Per User
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.admob_daily_ad_limit ?? ''}
                      onChange={(e) => handleChange('admob_daily_ad_limit', Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  CEO Default Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.staff_commission_ceo_percent ?? ''}
                  onChange={(e) => handleChange('staff_commission_ceo_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Manager Default Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.staff_commission_manager_percent ?? ''}
                  onChange={(e) => handleChange('staff_commission_manager_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Admin Default Commission (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.staff_commission_admin_percent ?? ''}
                  onChange={(e) => handleChange('staff_commission_admin_percent', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'animations' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Big Animation Threshold (Coins)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.room_gift_big_animation_threshold_coins ?? ''}
                  onChange={(e) => handleChange('room_gift_big_animation_threshold_coins', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Small Gift Banner Duration (ms)
                </label>
                <input
                  type="number"
                  min="500"
                  max="30000"
                  value={form.room_gift_banner_duration_small_ms ?? ''}
                  onChange={(e) => handleChange('room_gift_banner_duration_small_ms', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Big Gift Banner Duration (ms)
                </label>
                <input
                  type="number"
                  min="500"
                  max="30000"
                  value={form.room_gift_banner_duration_big_ms ?? ''}
                  onChange={(e) => handleChange('room_gift_banner_duration_big_ms', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: '0.9rem',
  color: '#111827',
  outline: 'none',
  backgroundColor: '#f9fafb',
};
