'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Settings = {
  id: number;
  coin_to_xp_ratio: number;
  audio_call_price_per_min: number;
  video_call_price_per_min: number;
  star_chat_price_per_min: number;
  spin_cost: number;
};

export default function PartyBonusesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [spinCost, setSpinCost] = useState('50');
  const [coinToXp, setCoinToXp] = useState('0.1');
  const [audioPrice, setAudioPrice] = useState('20');
  const [videoPrice, setVideoPrice] = useState('40');
  const [starChatPrice, setStarChatPrice] = useState('5');

  async function load(token: string) {
    setLoading(true);
    try {
      const json = await api<{ success: boolean; data?: { settings: Settings } }>('/admin/settings', token);
      if (json.data?.settings) {
        const s = json.data.settings;
        setSpinCost(String(s.spin_cost ?? 50));
        setCoinToXp(String(s.coin_to_xp_ratio ?? 0.1));
        setAudioPrice(String(s.audio_call_price_per_min ?? 20));
        setVideoPrice(String(s.video_call_price_per_min ?? 40));
        setStarChatPrice(String(s.star_chat_price_per_min ?? 5));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    void load(token);
  }, [router]);

  async function save() {
    const token = localStorage.getItem('ca_admin_token');
    if (!token) return;
    setSaving(true);
    setSuccessMsg('');
    try {
      await api('/admin/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({
          spin_cost: Number(spinCost),
          coin_to_xp_ratio: Number(coinToXp),
          audio_call_price_per_min: Number(audioPrice),
          video_call_price_per_min: Number(videoPrice),
          star_chat_price_per_min: Number(starChatPrice),
        }),
      });
      setSuccessMsg('Party room bonuses and rates updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Party Room Bonuses & Call Rates</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Control gamification costs, lucky wheel spin pricing, XP accrual rates, and 1-on-1 calling fees.</p>
      </div>

      {successMsg && (
        <div style={{ padding: '14px 20px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', marginBottom: '24px', fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading settings...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 20px 0', color: '#111827' }}>Lucky Spin & XP Mechanics</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Lucky Wheel Spin Cost (Coins)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={spinCost}
                    onChange={(e) => setSpinCost(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Coins per bonus spin</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Coin Spend to User XP Ratio
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step="0.01"
                    value={coinToXp}
                    onChange={(e) => setCoinToXp(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>XP awarded per 1 coin spent (e.g. 0.1 = 1 XP per 10 coins)</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 20px 0', color: '#111827' }}>Private Audio & Video Call Rates</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Private Audio Call Rate (Coins / Minute)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={audioPrice}
                    onChange={(e) => setAudioPrice(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Coins charged per minute</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Private Video Call Rate (Coins / Minute)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={videoPrice}
                    onChange={(e) => setVideoPrice(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Coins charged per minute</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Star Host Direct Chat (Coins / Minute)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={starChatPrice}
                    onChange={(e) => setStarChatPrice(e.target.value)}
                    style={{ width: '120px', margin: 0 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Coins charged per minute</span>
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  style={{ width: '100%', height: '46px', fontSize: '1rem', fontWeight: 600 }}
                >
                  {saving ? 'Saving...' : 'Save Bonus & Rate Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
