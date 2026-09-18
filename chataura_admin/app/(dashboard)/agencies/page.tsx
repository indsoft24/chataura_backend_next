'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type AgencyUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  coin_balance: number;
  wallet_balance: number;
  account_status: string;
};

type Affiliation = {
  id: number;
  agency_user_id: number;
  room_owner_id: number;
  room_id: string | null;
  status: string;
  joined_at: string | null;
  left_at: string | null;
  cooldown_until: string | null;
  agency: { id: number; name: string; country: string | null };
  room_owner: { id: number; name: string; country: string | null };
  room: { id: string; title: string; display_id: string } | null;
};

export default function AgenciesPage() {
  const { token } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'affiliations' | 'agencies'>('affiliations');
  const [agencies, setAgencies] = useState<AgencyUser[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const url = statusFilter ? `/admin/agencies?status=${statusFilter}` : '/admin/agencies';
      const res = await api<any>(url, token);
      setAgencies(res.data?.agencies ?? []);
      setAffiliations(res.data?.affiliations ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, statusFilter]);

  const handleClearCooldown = async (id: number) => {
    if (!token) return;
    try {
      await api(`/admin/agencies/affiliations/${id}/clear-cooldown`, token, { method: 'POST' });
      await load();
      alert(`Cooldown cleared for affiliation #${id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to clear cooldown');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Agencies Management</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
          Monitor agency partners, room creator affiliations, and manage transfer cooldowns.
        </p>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('affiliations')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'affiliations' ? '#4f46e5' : '#6b7280',
            borderBottom: activeTab === 'affiliations' ? '2px solid #4f46e5' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Agency Affiliations ({affiliations.length})
        </button>
        <button
          onClick={() => setActiveTab('agencies')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'agencies' ? '#4f46e5' : '#6b7280',
            borderBottom: activeTab === 'agencies' ? '2px solid #4f46e5' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Agency Accounts ({agencies.length})
        </button>
      </div>

      {activeTab === 'affiliations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem' }}
            >
              <option value="">All Statuses</option>
              <option value="accepted">Accepted / Active</option>
              <option value="pending">Pending Request</option>
              <option value="rejected">Rejected</option>
              <option value="left">Left / In Cooldown</option>
            </select>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 16px' }}>ID</th>
                  <th style={{ padding: '12px 16px' }}>AGENCY OWNER</th>
                  <th style={{ padding: '12px 16px' }}>ROOM OWNER (CREATOR)</th>
                  <th style={{ padding: '12px 16px' }}>LINKED ROOM</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                  <th style={{ padding: '12px 16px' }}>COOLDOWN UNTIL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                      Loading affiliations...
                    </td>
                  </tr>
                ) : affiliations.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                      No agency affiliations found.
                    </td>
                  </tr>
                ) : (
                  affiliations.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>#{a.id}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{a.agency?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {a.agency_user_id} • {a.agency?.country ?? 'Global'}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{a.room_owner?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {a.room_owner_id} • {a.room_owner?.country ?? 'Global'}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.room ? (
                          <div>
                            <div style={{ fontWeight: 500, color: '#111827' }}>{a.room.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Code: {a.room.display_id}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>No Room</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 9999,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: a.status === 'accepted' ? '#def7ec' : a.status === 'rejected' ? '#fde8e8' : '#fef08a',
                            color: a.status === 'accepted' ? '#03543f' : a.status === 'rejected' ? '#9b1c1c' : '#713f12',
                          }}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                        {a.cooldown_until ? (
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>
                            {new Date(a.cooldown_until).toLocaleDateString()}
                          </span>
                        ) : (
                          <span style={{ color: '#059669' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {a.cooldown_until && (
                          <button
                            onClick={() => handleClearCooldown(a.id)}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fca5a5',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Clear Cooldown
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'agencies' && (
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>USER ID</th>
                <th style={{ padding: '12px 16px' }}>AGENCY NAME</th>
                <th style={{ padding: '12px 16px' }}>CONTACT</th>
                <th style={{ padding: '12px 16px' }}>COUNTRY</th>
                <th style={{ padding: '12px 16px' }}>COINS</th>
                <th style={{ padding: '12px 16px' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                    Loading agency accounts...
                  </td>
                </tr>
              ) : agencies.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                    No agency accounts registered yet.
                  </td>
                </tr>
              ) : (
                agencies.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>#{u.id}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>{u.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#4b5563' }}>
                      {u.email && <div>{u.email}</div>}
                      {u.phone && <div>{u.phone}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#4b5563' }}>{u.country ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#eab308' }}>
                      {u.coin_balance.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: u.account_status === 'active' ? '#def7ec' : '#fde8e8',
                          color: u.account_status === 'active' ? '#03543f' : '#9b1c1c',
                        }}
                      >
                        {u.account_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
