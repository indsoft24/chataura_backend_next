'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FileUploadInput from '@/app/components/FileUploadInput';

type Country = {
  id: string;
  name: string;
  flag_emoji: string | null;
  flag_url: string | null;
  approval_status: string;
  is_active: boolean;
};

export default function CountriesPage() {
  const { token } = useAdminAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Form states
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api<any>('/admin/countries', token);
      setCountries(res.data?.countries ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const handleOpenAdd = () => {
    setEditingCountry(null);
    setFormId('');
    setFormName('');
    setFormEmoji('');
    setFormUrl('');
    setShowModal(true);
  };

  const handleOpenEdit = (c: Country) => {
    setEditingCountry(c);
    setFormId(c.id);
    setFormName(c.name);
    setFormEmoji(c.flag_emoji ?? '');
    setFormUrl(c.flag_url ?? '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (editingCountry) {
        await api(`/admin/countries/${editingCountry.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName,
            flag_emoji: formEmoji || undefined,
            flag_url: formUrl || undefined,
          }),
        });
      } else {
        await api('/admin/countries', token, {
          method: 'POST',
          body: JSON.stringify({
            id: formId,
            name: formName,
            flag_emoji: formEmoji || undefined,
            flag_url: formUrl || undefined,
          }),
        });
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Error saving country');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete country ${id}?`)) return;
    if (!token) return;
    try {
      await api(`/admin/countries/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleStatus = async (id: string, action: 'approve' | 'reject') => {
    if (!token) return;
    try {
      await api(`/admin/countries/${id}/${action}`, token, { method: 'POST' });
      await load();
    } catch (err: any) {
      alert(err.message || `Failed to ${action}`);
    }
  };

  const filtered = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Countries</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            Manage regional territories, country codes, and flag icons.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1f2937',
            color: '#fff',
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Add Country
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by country name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 320,
            padding: '9px 14px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: '0.9rem',
          }}
        />
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>CODE</th>
              <th style={{ padding: '12px 16px' }}>FLAG</th>
              <th style={{ padding: '12px 16px' }}>NAME</th>
              <th style={{ padding: '12px 16px' }}>APPROVAL</th>
              <th style={{ padding: '12px 16px' }}>ACTIVE</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Loading countries...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  No countries found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>{c.id}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.flag_emoji ? (
                      <span style={{ fontSize: '1.5rem' }}>{c.flag_emoji}</span>
                    ) : c.flag_url ? (
                      <img src={c.flag_url} alt={c.name} style={{ width: 28, height: 20, objectFit: 'cover', borderRadius: 2 }} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#111827' }}>{c.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: c.approval_status === 'approved' ? '#def7ec' : c.approval_status === 'rejected' ? '#fde8e8' : '#fef08a',
                        color: c.approval_status === 'approved' ? '#03543f' : c.approval_status === 'rejected' ? '#9b1c1c' : '#713f12',
                      }}
                    >
                      {c.approval_status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: c.is_active ? '#059669' : '#9ca3af', fontWeight: 500 }}>
                    {c.is_active ? 'Yes' : 'No'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {c.approval_status !== 'approved' && (
                        <button
                          onClick={() => handleStatus(c.id, 'approve')}
                          style={{ color: '#059669', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                        >
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(c)}
                        style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 440, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>
              {editingCountry ? `Edit Country (${editingCountry.id})` : 'Add New Country'}
            </h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!editingCountry && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                    Country Code (ISO 2-letter)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. IN, US, AE"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value.toUpperCase())}
                    style={modalInputStyle}
                  />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Country Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. India"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Flag Emoji (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 🇮🇳"
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  style={modalInputStyle}
                />
              </div>
              <FileUploadInput
                label="Country Flag Graphic (.png, .svg, .webp)"
                value={formUrl}
                onChange={(url) => setFormUrl(url)}
                accept="image/*"
                placeholder="https://.../flag.png or upload image"
                helpText="Upload a country flag image icon or enter a CDN flag link."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '8px 18px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};
