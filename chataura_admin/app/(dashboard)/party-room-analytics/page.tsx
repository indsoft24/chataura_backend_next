'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type PresenceRecord = {
  id: number;
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  country: string | null;
  room_id: string;
  room_title: string;
  room_display_id: string;
  accumulated_seconds: number;
  is_active: boolean;
  joined_at: string;
};

export default function PartyRoomAnalyticsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>({});
  const [dailyTrend, setDailyTrend] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<PresenceRecord[]>([]);
  const [closingStale, setClosingStale] = useState(false);

  // User sessions modal
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string } | null>(null);
  const [userSessions, setUserSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/party-room-analytics', token);
      setKpis(res.data?.kpis ?? {});
      setDailyTrend(res.data?.daily_trend ?? []);
      setLeaderboard(res.data?.leaderboard ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const handleCloseStale = async () => {
    if (!confirm('Close all inactive/stale sessions older than 5 minutes?')) return;
    if (!token) return;
    setClosingStale(true);
    try {
      const res = await api<any>('/admin/party-room-analytics/sessions/close-stale', token, { method: 'POST' });
      alert(`Closed ${res.data?.closed_count ?? 0} stale sessions.`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to close stale sessions');
    } finally {
      setClosingStale(false);
    }
  };

  const handleSuspendSession = async (id: number) => {
    if (!confirm(`Force suspend and terminate session #${id}?`)) return;
    if (!token) return;
    try {
      await api(`/admin/party-room-analytics/sessions/${id}/suspend`, token, { method: 'POST' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to suspend session');
    }
  };

  const handleViewUserSessions = async (userId: number, name: string) => {
    setSelectedUser({ id: userId, name });
    if (!token) return;
    setLoadingSessions(true);
    try {
      const res = await api<any>(`/admin/party-room-analytics/users/${userId}/sessions`, token);
      setUserSessions(res.data?.sessions ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Party Room Analytics</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Live presence telemetry, participant microphone engagement, and room session logs.
          </p>
        </div>
        <button
          onClick={handleCloseStale}
          disabled={closingStale}
          style={{
            padding: '9px 16px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #f87171',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: closingStale ? 'not-allowed' : 'pointer',
          }}
        >
          {closingStale ? 'Closing...' : 'Close Stale Sessions'}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Active Live Rooms</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginTop: 4 }}>
            {kpis.live_rooms ?? 0}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Current Active Listeners/Speakers</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
            {kpis.active_sessions ?? 0}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Total Rooms Hosted</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
            {kpis.total_rooms ?? 0}
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#111827' }}>
          Top User Engagement & Active Presence
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>USER</th>
              <th style={{ padding: '12px 16px' }}>CURRENT/LAST ROOM</th>
              <th style={{ padding: '12px 16px' }}>TIME ENGAGED</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>JOINED AT</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading analytics data...
                </td>
              </tr>
            ) : leaderboard.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No room presence records found yet.
                </td>
              </tr>
            ) : (
              leaderboard.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{p.user_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {p.user_id} • {p.country ?? 'Global'}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{p.room_title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Code: {p.room_display_id}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#4f46e5' }}>
                    {formatDuration(p.accumulated_seconds)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: p.is_active ? '#def7ec' : '#f3f4f6',
                        color: p.is_active ? '#03543f' : '#6b7280',
                      }}
                    >
                      {p.is_active ? '● In Room' : 'Left'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#6b7280' }}>
                    {new Date(p.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleViewUserSessions(p.user_id, p.user_name)}
                        style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                      >
                        All Sessions
                      </button>
                      {p.is_active && (
                        <button
                          onClick={() => handleSuspendSession(p.id)}
                          style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* User Session History Modal */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                Room Presence History: {selectedUser.name}
              </h3>
              <button
                onClick={() => setSelectedUser(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#9ca3af' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' }}>
              {loadingSessions ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>Loading session logs...</div>
              ) : userSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>No past session history recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {userSessions.map((s) => (
                    <div key={s.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{s.room_title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Joined: {new Date(s.joined_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#4f46e5' }}>{formatDuration(s.duration_seconds)}</div>
                        <div style={{ fontSize: '0.75rem', color: s.is_active ? '#059669' : '#9ca3af' }}>
                          {s.is_active ? 'Active' : s.close_reason ?? 'Completed'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: '20px 24px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};
