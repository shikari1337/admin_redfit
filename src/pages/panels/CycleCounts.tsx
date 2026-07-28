import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import {
  Page, PageHeader, Btn, StatusChip, TextInput,
  TableShell, THead, Th, TBody, Tr, Td,
} from '../../components/erp';

/**
 * Cycle counting (WMS slice 3): snapshot bins → count (blind option hides
 * expected qty) → review variances → post (the approval step — corrections
 * hit the stock ledger). Bins under a count are frozen for picks/putaway.
 */

const CycleCounts: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [bins, setBins] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [selBins, setSelBins] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const [blind, setBlind] = useState(false);
  const [entry, setEntry] = useState<Record<string, string>>({});

  const fail = (e: any) => setError(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const load = async () => {
    try {
      setError('');
      const res = await api.get('/wms/counts');
      setRows(res.data.rows ?? []);
      const lr = await api.get('/wms/locations');
      setBins((lr.data.rows ?? []).filter((l: any) => l.kind === 'bin'));
    } catch (e) { fail(e); }
  };
  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    try {
      const res = await api.get(`/wms/counts/${id}`);
      setDetail(res.data); setEntry({});
    } catch (e) { fail(e); }
  };

  const create = async () => {
    if (!selBins.length) { setError('Select at least one bin.'); return; }
    try {
      const res = await api.post('/wms/counts', { binIds: selBins, reference: reference.trim() || null, blind });
      flash('Count created — bins are now frozen for movements');
      setCreating(false); setSelBins([]); setReference(''); setBlind(false);
      load(); if (res.data?.id) open(res.data.id);
    } catch (e) { fail(e); }
  };

  const saveEntry = async (item: any) => {
    const v = entry[item.id];
    if (v === undefined || v === '') return;
    try {
      await api.post(`/wms/counts/items/${item.id}`, { countedQty: parseInt(v) });
      open(detail.id);
    } catch (e) { fail(e); }
  };

  const act = async (path: string, msg?: string) => {
    try {
      await api.post(path, {});
      if (msg) flash(msg);
      if (detail) open(detail.id);
      load();
    } catch (e) { fail(e); }
  };

  return (
    <Page>
      <PageHeader
        title="Cycle Counts"
        description="Bins under a count are frozen for picks and putaway until the count posts or is cancelled. Blind counts hide the expected quantity until review. Posting is the variance approval — corrections are written to the stock ledger."
        actions={<Btn onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ New count'}</Btn>}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      {creating && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <TextInput className="w-64" placeholder="Reference (optional)" value={reference}
                   onChange={(e) => setReference(e.target.value)} />
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
              Blind count (hide expected)
            </label>
          </div>
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {bins.map((b: any) => (
              <label key={b.id}
                className={`cursor-pointer rounded border px-2 py-1 font-mono text-xs ${selBins.includes(b.id) ? 'border-gray-900 bg-gray-900 text-white' : b.status !== 'active' ? 'opacity-40' : ''}`}>
                <input type="checkbox" className="hidden" disabled={b.status !== 'active'}
                       checked={selBins.includes(b.id)}
                       onChange={(e) => setSelBins(e.target.checked ? [...selBins, b.id] : selBins.filter((x) => x !== b.id))} />
                {b.code}{b.status !== 'active' ? ` (${b.status})` : ''}
              </label>
            ))}
            {bins.length === 0 && <span className="text-gray-500">No bins — build the warehouse layout first.</span>}
          </div>
          <Btn onClick={create}>Create count</Btn>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Reference</Th><Th>Status</Th><Th num>Counted</Th><Th>Created</Th>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No cycle counts yet.</td></tr>
              )}
              {rows.map((r: any) => (
                <Tr key={r.id} className="cursor-pointer" onClick={() => open(r.id)}>
                  <Td className="font-mono text-xs">{r.reference ?? r.id.slice(0, 8)}{r.blind ? ' 🙈' : ''}</Td>
                  <Td><StatusChip status={r.status} /></Td>
                  <Td num>{r.counted_count}/{r.item_count}</Td>
                  <Td muted className="text-xs">{new Date(r.created_at).toLocaleString()}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>

        {detail && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                <span className="font-mono">{detail.reference ?? detail.id.slice(0, 8)}</span>
                <StatusChip status={detail.status} />
              </h2>
              <span className="flex gap-2">
                {detail.status === 'counting' && (
                  <Btn size="sm" onClick={() => act(`/wms/counts/${detail.id}/review`, 'Submitted for review')}>Submit for review</Btn>
                )}
                {detail.status === 'review' && (
                  <Btn variant="success" size="sm" onClick={() => act(`/wms/counts/${detail.id}/post`, 'Variances posted — bins released')}>Approve &amp; post</Btn>
                )}
                {(detail.status === 'counting' || detail.status === 'review') && (
                  <Btn variant="outline" size="sm" onClick={() => act(`/wms/counts/${detail.id}/cancel`, 'Cancelled — bins released')}>Cancel</Btn>
                )}
              </span>
            </div>
            <table className="w-full text-xs">
              <THead sticky={false}>
                <Th>Bin</Th><Th>SKU</Th><Th>Batch</Th>
                <Th num>Expected</Th><Th num>Counted</Th><Th num>Variance</Th><Th></Th>
              </THead>
              <TBody>
                {detail.items?.map((i: any) => (
                  <Tr key={i.id} className={i.variance ? 'bg-amber-50' : ''}>
                    <Td className="font-mono">{i.bin_code}</Td>
                    <Td className="font-mono">{i.sku}</Td>
                    <Td>{i.batch_number ?? '—'}</Td>
                    <Td num>{i.expected_qty ?? '🙈'}</Td>
                    <Td num>
                      {detail.status === 'counting' ? (
                        <input type="number" min={0}
                               value={entry[i.id] ?? i.counted_qty ?? ''}
                               onChange={(e) => setEntry({ ...entry, [i.id]: e.target.value })}
                               onBlur={() => saveEntry(i)}
                               className="w-16 rounded border px-1 py-0.5 text-right" />
                      ) : (i.counted_qty ?? '—')}
                    </Td>
                    <Td num className={`font-mono ${i.variance > 0 ? 'text-emerald-700' : i.variance < 0 ? 'text-red-700' : ''}`}>
                      {i.variance == null ? '—' : i.variance > 0 ? `+${i.variance}` : i.variance}
                    </Td>
                    <Td muted className="pl-1">{i.note ?? ''}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
};

export default CycleCounts;
