'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { EmptyRow, Field, PageHeader, SkeletonRows, errorText, useConfirm, useToasts } from '@/components/admin-ui';

type Banned = { device_id: string; reason: string | null; created_at: string };
type UserDevice = { device_id: string; last_seen_at: string; accounts_on_device: number; banned: boolean };

export default function BannedDevicesPage() {
  const { token } = useAdminAuth();
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const [list, setList] = useState<Banned[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [userId, setUserId] = useState('');
  const [devices, setDevices] = useState<UserDevice[] | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/banned-devices', token);
      setList(res.data?.devices ?? []);
    } catch (err) {
      toast('error', errorText(err, 'Could not load banned devices'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function ban(id: string, why?: string) {
    if (!token) return;
    try {
      await api('/admin/banned-devices', token, { method: 'POST', body: JSON.stringify({ device_id: id, reason: why || undefined }) });
      toast('success', 'Device banned');
      await load();
      if (devices) await lookup();
    } catch (err) {
      toast('error', errorText(err, 'Failed to ban device'));
    }
  }

  async function lookup() {
    if (!token || !/^\d+$/.test(userId.trim())) return toast('error', 'Enter the numeric account id');
    try {
      const res = await api<any>(`/admin/users/${userId.trim()}/devices`, token);
      setDevices(res.data?.devices ?? []);
    } catch (err) {
      toast('error', errorText(err, 'Could not load devices'));
    }
  }

  function unban(id: string) {
    confirm({
      title: 'Unban this device?',
      message: `${id} will be able to log in and sign up again.`,
      confirmLabel: 'Unban',
      tone: 'danger',
      onConfirm: async () => {
        await api('/admin/banned-devices/remove', token, { method: 'POST', body: JSON.stringify({ device_id: id }) });
        toast('success', 'Device unbanned');
        await load();
        if (devices) await lookup();
      },
    });
  }

  return (
    <main className="cp-page">
      <PageHeader title="Banned Devices" subtitle="A banned phone cannot log in or create an account. Superadmin only. Suspend the account separately from Users." />

      <section className="cp-card">
        <div className="cp-toolbar">
          <Field label="Device ID">
            <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g. c932a7d51473e65e" />
          </Field>
          <Field label="Reason (optional)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <button type="button" className="cp-btn cp-btn-primary" disabled={!deviceId.trim()} onClick={() => { void ban(deviceId.trim(), reason); setDeviceId(''); setReason(''); }}>
            Ban device
          </button>
        </div>
      </section>

      <section className="cp-card">
        <div className="cp-toolbar">
          <Field label="Find an account's devices (account id)">
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. 1641" />
          </Field>
          <button type="button" className="cp-btn cp-btn-ghost" onClick={() => void lookup()}>Show devices</button>
        </div>
        {devices && (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead><tr><th className="cp-th">Device ID</th><th className="cp-th">Accounts on it</th><th className="cp-th">Last seen</th><th className="cp-th cp-num">Action</th></tr></thead>
              <tbody>
                {devices.length === 0 ? (
                  <EmptyRow cols={4} title="No devices recorded" hint="This account has no device history." />
                ) : (
                  devices.map((d) => (
                    <tr key={d.device_id} className="cp-row">
                      <td className="cp-td">{d.device_id}</td>
                      <td className="cp-td">{d.accounts_on_device}</td>
                      <td className="cp-td">{new Date(d.last_seen_at).toLocaleString()}</td>
                      <td className="cp-td cp-num">
                        {d.banned ? <span className="cp-badge">Banned</span> : <button type="button" className="cp-btn cp-btn-danger-soft" onClick={() => void ban(d.device_id)}>Ban</button>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cp-card">
        <div className="cp-summary"><strong>{list.length}</strong> banned devices</div>
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th className="cp-th">Device ID</th><th className="cp-th">Reason</th><th className="cp-th">Banned at</th><th className="cp-th cp-num">Action</th></tr></thead>
            <tbody>
              {loading && list.length === 0 ? (
                <SkeletonRows cols={4} />
              ) : list.length === 0 ? (
                <EmptyRow cols={4} title="No banned devices" hint="Ban one above or from an account's device list." />
              ) : (
                list.map((d) => (
                  <tr key={d.device_id} className="cp-row">
                    <td className="cp-td">{d.device_id}</td>
                    <td className="cp-td">{d.reason ?? '—'}</td>
                    <td className="cp-td">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="cp-td cp-num"><button type="button" className="cp-btn cp-btn-ghost" onClick={() => unban(d.device_id)}>Unban</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {confirmNode}
      {toastNode}
    </main>
  );
}
