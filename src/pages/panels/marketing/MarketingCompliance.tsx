import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Compliance & Consent (GDPR / DPDP): consent ledger, manual consent
 * recording, and DSAR export / erase (admin only).
 */
const MarketingCompliance: React.FC = () => {
  const { user, hasPerm } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<{ channel?: string; status?: string }>({});
  const [consentForm, setConsentForm] = useState<any>({ channels: ['email'], granted: true });
  const [dsar, setDsar] = useState<any>({ });
  const [dsarResult, setDsarResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    const r = await api.get('/marketing-hub/compliance/consents', { params: filter });
    setRows(payload(r) ?? []);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, [filter]);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const toggleChannel = (c: string) => {
    const set = new Set(consentForm.channels ?? []);
    set.has(c) ? set.delete(c) : set.add(c);
    setConsentForm({ ...consentForm, channels: [...set] });
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Compliance & Consent</h1>
        <p className="text-sm text-gray-500">
          Opt-in first: marketing sends and ad-platform sharing only reach contacts with recorded consent.
          Ad sharing additionally requires admin approval of each audience — both gates are enforced server-side.
        </p>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {hasPerm('marketing.manage') && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <div className="text-sm font-semibold">Record consent (e.g. written / offline opt-in)</div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label>Email
              <input value={consentForm.email ?? ''} onChange={(e) => setConsentForm({ ...consentForm, email: e.target.value })}
                className="mt-1 block w-56 rounded border px-2 py-1.5" />
            </label>
            <label>Phone
              <input value={consentForm.phone ?? ''} onChange={(e) => setConsentForm({ ...consentForm, phone: e.target.value })}
                className="mt-1 block w-40 rounded border px-2 py-1.5" />
            </label>
            <div className="flex gap-2 pb-1.5">
              {['email', 'sms', 'whatsapp', 'push', 'ads'].map((c) => (
                <label key={c} className="capitalize">
                  <input type="checkbox" checked={(consentForm.channels ?? []).includes(c)} onChange={() => toggleChannel(c)} /> {c}
                </label>
              ))}
            </div>
            <select value={consentForm.granted ? 'granted' : 'revoked'}
              onChange={(e) => setConsentForm({ ...consentForm, granted: e.target.value === 'granted' })}
              className="rounded border px-2 py-1.5">
              <option value="granted">Granted</option>
              <option value="revoked">Revoked</option>
            </select>
            <button onClick={() => act(async () => {
              await api.post('/marketing-hub/compliance/consents', consentForm);
              setInfo('Consent recorded.'); await load();
            })} disabled={!consentForm.email && !consentForm.phone}
              className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50">
              Record
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 text-sm">
        <select value={filter.channel ?? ''} onChange={(e) => setFilter({ ...filter, channel: e.target.value || undefined })}
          className="rounded border px-2 py-1.5">
          <option value="">All channels</option>
          {['email', 'sms', 'whatsapp', 'push', 'ads', 'analytics'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filter.status ?? ''} onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })}
          className="rounded border px-2 py-1.5">
          <option value="">All statuses</option>
          <option value="granted">Granted</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="px-4 py-2">Contact</th><th>Channel</th><th>Status</th><th>Source</th><th>When</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-1.5 font-mono text-xs">{r.email ?? r.phone ?? r.contact_hash}</td>
                <td className="uppercase text-xs">{r.channel}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === 'granted' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="text-xs">{r.source}</td>
                <td className="text-xs text-gray-400">{new Date(r.occurred_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No consent records yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <div className="text-sm font-semibold">DSAR tools (admin only)</div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label>Email
              <input value={dsar.email ?? ''} onChange={(e) => setDsar({ ...dsar, email: e.target.value })}
                className="mt-1 block w-56 rounded border px-2 py-1.5" />
            </label>
            <label>Phone
              <input value={dsar.phone ?? ''} onChange={(e) => setDsar({ ...dsar, phone: e.target.value })}
                className="mt-1 block w-40 rounded border px-2 py-1.5" />
            </label>
            <button onClick={() => act(async () => {
              const r = await api.get('/marketing-hub/compliance/export', { params: dsar });
              setDsarResult(payload(r));
            })} className="rounded border px-3 py-1.5">Export data</button>
            <button onClick={() => act(async () => {
              if (!window.confirm('Erase this contact from ALL marketing data? This cannot be undone.')) return;
              const r = await api.post('/marketing-hub/compliance/erase', dsar);
              setInfo(`Erased: ${payload(r).members} list memberships, ${payload(r).consents} consent rows (revocation tombstones written).`);
              setDsarResult(null); await load();
            })} className="rounded border px-3 py-1.5 text-red-600">Erase (right to be forgotten)</button>
          </div>
          {dsarResult && (
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(dsarResult, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketingCompliance;
