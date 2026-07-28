import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';

/**
 * Audiences & Lists: saved lists (CSV import, CRM snapshots) + CRM sources.
 * Customer sources (B2C/B2B) are server-side filters — counts only, PII never
 * reaches the browser. Leads/contacts (tenant data) can be copied into lists.
 */
const MarketingAudiences: React.FC = () => {
  const { hasPerm } = useAuth();
  const [sources, setSources] = useState<any[]>([]);
  const [systemAudiences, setSystemAudiences] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [members, setMembers] = useState<any>(null); // {list, rows, total}
  const [newList, setNewList] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importTarget, setImportTarget] = useState<any>(null);

  const load = async () => {
    const [s, l, sys] = await Promise.all([
      api.get('/marketing-hub/audiences/sources'),
      api.get('/marketing-hub/audiences/lists'),
      api.get('/marketing-hub/audiences/system'),
    ]);
    setSources(payload(s)?.sources ?? []);
    setLists(payload(l) ?? []);
    setSystemAudiences(payload(sys) ?? []);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, []);

  const act = async (fn: () => Promise<any>) => {
    setError(''); setInfo('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const createList = () => act(async () => {
    await api.post('/marketing-hub/audiences/lists', { name: newList });
    setNewList('');
  });

  const openMembers = async (list: any) => {
    const r = await api.get(`/marketing-hub/audiences/lists/${list.id}/members`);
    setMembers({ list, rows: payload(r) ?? [], total: r.data.total ?? 0 });
  };

  /** Client-side CSV parse: name,email,phone,consent columns (header row). */
  const importCsv = async (file: File, listId: string) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setError('CSV needs a header row and at least one data row'); return; }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        name: idx('name') >= 0 ? cols[idx('name')] : undefined,
        email: idx('email') >= 0 ? cols[idx('email')] : undefined,
        phone: idx('phone') >= 0 ? cols[idx('phone')] : undefined,
        consent: idx('consent') >= 0 ? cols[idx('consent')] : undefined,
      };
    }).filter((r) => r.email || r.phone);
    await act(async () => {
      const r = await api.post(`/marketing-hub/audiences/lists/${listId}/import`, { members: rows });
      setInfo(`Imported: ${payload(r).inserted} new of ${payload(r).valid} valid (${payload(r).consent_recorded} consent rows recorded).`);
    });
  };

  const snapshotSource = (listId: string, source: string) => act(async () => {
    const r = await api.post(`/marketing-hub/audiences/lists/${listId}/from-source`, { source });
    setInfo(`Copied ${payload(r).inserted} of ${payload(r).source_rows} ${source} into the list.`);
  });

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div>
        <div className="text-xs text-gray-400">
          <a href="/panel/marketing" className="hover:underline">Marketing</a> / Audiences & Lists
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Audiences & Lists</h1>
        <p className="text-sm text-gray-500">
          Lists are <b>marketing-only</b> (campaigns & automation) and are always born populated — from a dynamic
          audience, a CRM snapshot or a CSV import. Customer PII stays server-side (lists hold ids + hashes; contacts
          are re-resolved live at send time).
        </p>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">
          Dynamic audiences
          <span className="ml-2 text-xs font-normal text-gray-400">
            — built-in, always fresh. Use directly in a campaign, or turn one into an auto-populated marketing list.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {systemAudiences.map((a) => (
            <div key={a.key} className="rounded border p-3" title={a.description}>
              <div className="text-xs text-gray-500">{a.label}</div>
              <div className="text-xl font-bold">{a.count}</div>
              {hasPerm('marketing.manage') && a.key !== 'push_subscribers' && (
                <button onClick={() => act(async () => {
                  const r = await api.post('/marketing-hub/audiences/lists/from-system', { system: a.key });
                  setInfo(`List "${payload(r).list.name}" created with ${payload(r).inserted} members (auto-populated).`);
                })} className="mt-1 text-xs text-primary hover:underline">→ make list</button>
              )}
            </div>
          ))}
          {systemAudiences.length === 0 && <div className="col-span-5 text-sm text-gray-400">Loading…</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {sources.map((s) => (
          <div key={s.key} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold">{s.count}</div>
            <div className="mt-0.5 text-xs text-gray-400">
              {s.kind === 'server_filter' ? 'target via campaign filter' : 'copyable into lists'}
            </div>
          </div>
        ))}
      </div>

      {hasPerm('marketing.manage') && (
        <div className="flex gap-2">
          <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="New list name…"
            className="w-64 rounded border px-2 py-1.5 text-sm" />
          <button onClick={createList} disabled={!newList.trim()}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Create list
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && importTarget) importCsv(f, importTarget.id);
          if (fileRef.current) fileRef.current.value = '';
        }} />

      <div className="rounded-lg border bg-white shadow-sm divide-y">
        {lists.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No lists yet.</div>}
        {lists.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <button onClick={() => openMembers(l)} className="min-w-[200px] flex-1 text-left">
              <span className="font-medium">{l.name}</span>
              <span className="ml-2 text-xs text-gray-500">{l.member_count} members · {l.source}</span>
            </button>
            {hasPerm('marketing.manage') && (
              <div className="flex gap-1.5">
                {(l.filter as any)?.system && (
                  <button onClick={() => act(async () => {
                    const r = await api.post(`/marketing-hub/audiences/lists/${l.id}/refresh`);
                    setInfo(`Refreshed: +${payload(r).inserted} new members (now ${payload(r).total}).`);
                  })} className="rounded border px-2 py-1 text-xs" title="Re-populate from its dynamic audience">⟳ Refresh</button>
                )}
                <button onClick={() => { setImportTarget(l); fileRef.current?.click(); }}
                  className="rounded border px-2 py-1 text-xs">Import CSV</button>
                <button onClick={() => snapshotSource(l.id, 'leads')} className="rounded border px-2 py-1 text-xs">+ Leads</button>
                <button onClick={() => snapshotSource(l.id, 'contacts')} className="rounded border px-2 py-1 text-xs">+ Contacts</button>
                <button onClick={() => { if (window.confirm('Delete list?')) act(() => api.delete(`/marketing-hub/audiences/lists/${l.id}`)); }}
                  className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {members && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{members.list.name} — {members.total} members (masked view)</div>
            <button onClick={() => setMembers(null)} className="text-sm text-gray-500">Close</button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr><th className="py-1">Name</th><th>Email</th><th>Phone</th><th>Type</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {members.rows.map((m: any) => (
                <tr key={m.id}>
                  <td className="py-1.5">{m.name ?? '—'}</td>
                  <td className="font-mono text-xs">{m.email ?? '—'}</td>
                  <td className="font-mono text-xs">{m.phone ?? '—'}</td>
                  <td className="text-xs capitalize">{m.subject_type}</td>
                  <td className="text-right">
                    {hasPerm('marketing.manage') && (
                      <button onClick={() => act(async () => {
                        await api.delete(`/marketing-hub/audiences/lists/${members.list.id}/members/${m.id}`);
                        await openMembers(members.list);
                      })} className="text-xs text-red-600">remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400">
            CSV columns: <code>name,email,phone,consent</code> — rows with consent=yes also record an opt-in
            (source: import) in the consent ledger.
          </p>
        </div>
      )}
    </div>
  );
};

export default MarketingAudiences;
