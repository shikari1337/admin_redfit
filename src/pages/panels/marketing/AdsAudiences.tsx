import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDateTime } from '../../../utils/date';

/**
 * Custom audiences — the GDPR double gate made visible:
 *  1) members must have granted 'ads' consent (consented count shown vs total);
 *  2) an ADMIN must approve the audience before any sync;
 * only then can it be uploaded (SHA-256 hashed) to Google / Meta / Snapchat.
 */
const AdsAudiences: React.FC = () => {
  const { hasPerm } = useAuth();
  const [audiences, setAudiences] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ source: 'list' });
  const [log, setLog] = useState<any>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    const [a, l] = await Promise.all([
      api.get('/marketing-hub/ads/audiences'),
      api.get('/marketing-hub/audiences/lists'),
    ]);
    setAudiences(payload(a) ?? []); setLists(payload(l) ?? []);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, []);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const create = () => act(async () => {
    await api.post('/marketing-hub/ads/audiences', {
      name: form.name, description: form.description, source: form.source,
      list_id: form.source === 'list' ? form.list_id : undefined,
      filter: form.source === 'filter' ? { min_orders: form.min_orders ? Number(form.min_orders) : undefined } : undefined,
    });
    setShowNew(false); setForm({ source: 'list' });
  });

  const sync = (id: string) => act(async () => {
    const r = await api.post(`/marketing-hub/ads/audiences/${id}/sync`, {});
    const d = payload(r);
    setInfo(`Uploaded ${d.consented_uploaded} consented members (hashed); ${d.excluded_no_consent} excluded without consent.`);
  });

  const STATUS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', approved: 'bg-blue-100 text-blue-700',
    syncing: 'bg-amber-100 text-amber-800', synced: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Custom Audiences</h1>
          <p className="text-sm text-gray-500">
            Data is shared with ad platforms only when <b>both</b> the member consented ('ads' channel)
            <b> and</b> an admin approved the audience — and only as SHA-256 hashes.
          </p>
        </div>
        {hasPerm('ads.manage') && (
          <button onClick={() => setShowNew((s) => !s)}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            {showNew ? 'Close' : '+ Audience'}
          </button>
        )}
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {showNew && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Name
              <input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">Source
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="list">Saved list</option>
                <option value="filter">Customer filter (server-side)</option>
              </select>
            </label>
            {form.source === 'list' ? (
              <label className="text-sm">List
                <select value={form.list_id ?? ''} onChange={(e) => setForm({ ...form, list_id: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5">
                  <option value="">— select —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>)}
                </select>
              </label>
            ) : (
              <label className="text-sm">Min orders
                <input type="number" min={0} value={form.min_orders ?? ''}
                  onChange={(e) => setForm({ ...form, min_orders: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5" />
              </label>
            )}
          </div>
          <button onClick={create} disabled={!form.name || (form.source === 'list' && !form.list_id)}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Create (draft)
          </button>
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm divide-y">
        {audiences.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No custom audiences yet.</div>}
        {audiences.map((a) => (
          <div key={a.id} className="px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${STATUS[a.status] ?? ''}`}>{a.status}</span>
              <span className="text-xs text-gray-500">
                {a.consented_count}/{a.member_count} consented
                {a.list_name ? ` · list: ${a.list_name}` : ' · filter'}
              </span>
              {a.approved_by
                ? <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">admin approved</span>
                : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">awaiting admin approval</span>}
              <div className="ml-auto flex gap-1.5">
                <button onClick={() => act(() => api.post(`/marketing-hub/ads/audiences/${a.id}/refresh`))}
                  className="rounded border px-2 py-1 text-xs">Refresh counts</button>
                {hasPerm('marketing.approve') && !a.approved_by && (
                  <button onClick={() => act(() => api.post(`/marketing-hub/ads/audiences/${a.id}/approve`))}
                    className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white">Approve (admin)</button>
                )}
                {hasPerm('ads.manage') && a.approved_by && (
                  <button onClick={() => sync(a.id)}
                    className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    Sync to platforms
                  </button>
                )}
                <button onClick={() => act(async () => {
                  const r = await api.get(`/marketing-hub/ads/audiences/${a.id}/sync-log`);
                  setLog({ audience: a, rows: payload(r) ?? [] });
                })} className="rounded border px-2 py-1 text-xs">Log</button>
                {hasPerm('ads.manage') && (
                  <button onClick={() => { if (window.confirm('Delete audience? (Does not remove already-synced platform lists)')) act(() => api.delete(`/marketing-hub/ads/audiences/${a.id}`)); }}
                    className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
                )}
              </div>
            </div>
            {a.platform_refs && Object.keys(a.platform_refs).length > 0 && (
              <div className="mt-1 flex gap-2 text-xs text-gray-500">
                {Object.entries(a.platform_refs).map(([p, ref]: any) => (
                  <span key={p} className="rounded bg-gray-50 px-1.5 py-0.5">
                    {p}: {ref.id}{ref.mock ? ' (mock)' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {log && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Sync log — {log.audience.name}</div>
            <button onClick={() => setLog(null)} className="text-sm text-gray-500">Close</button>
          </div>
          {log.rows.length === 0 ? <div className="text-sm text-gray-500">No syncs yet.</div> : (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th className="py-1">Platform</th><th>Members</th><th>Status</th><th>At</th></tr></thead>
              <tbody className="divide-y">
                {log.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-1 uppercase text-xs">{r.platform}</td>
                    <td>{r.members_sent}</td>
                    <td className={`text-xs ${r.status === 'error' ? 'text-red-600' : ''}`}>{r.status}{r.error ? ` — ${r.error}` : ''}</td>
                    <td className="text-xs text-gray-400">{localeDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default AdsAudiences;
