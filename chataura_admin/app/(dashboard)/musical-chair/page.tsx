'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { PageHeader, Switch } from '@/components/admin-ui';

/** Musical Chair — host / co-host / room admins play a music highlight over the seated members. */
export default function MusicalChairPage() {
  const { token } = useAdminAuth();
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api<{ data: { enabled: boolean } }>('/admin/musical-chair', token);
    setEnabled(res.data.enabled);
    setSaved(res.data.enabled);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }));
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ data: { enabled: boolean } }>('/admin/musical-chair', token!, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      setSaved(res.data.enabled);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e: any) {
      setMsg({ ok: false, text: `Save failed: ${e?.message ?? e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ad-page">
      <PageHeader title="Musical Chair" subtitle="A room game: the host, co-host or a room admin starts it, and a highlight moves over the seated members with music. Pause stops it on a seat." />
      {msg && <div className={`ad-alert is-flush ${msg.ok ? 'is-success' : ''}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <section className="ad-card">
        <div className="ad-card-head">
          <div><h2>Availability</h2></div>
          <div className="ad-actions">
            <button type="button" className="ad-btn ad-btn-primary" onClick={save} disabled={busy || enabled === saved}>
              {busy ? 'Working…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="ad-card-body">
          <div className="ad-toggle-row">
            <div>
              <div className="ad-toggle-title">Musical Chair</div>
              <div className={`ad-toggle-hint ${enabled ? 'tone-green' : 'tone-red'}`}>
                {enabled ? 'On — rooms can start it' : 'Off — nobody can start it (a running game keeps going until it ends)'}
              </div>
            </div>
            <Switch label="Musical Chair enabled" checked={enabled} onChange={setEnabled} />
          </div>
        </div>
      </section>
    </main>
  );
}
