import React, { useEffect, useState } from 'react';
import { api, searchAPI } from '../../services/api';
import {
  Page, PageHeader, Btn, StatusChip, TextInput,
  TableShell, THead, Th, TBody, Tr, Td,
} from '../../components/erp';

/**
 * Pick lists (WMS slice 2): FEFO-allocated from bins, ordered along the
 * serpentine pick path. Confirming a pick moves stock bin → loose pool
 * (paired ledger rows); short marks a bin that came up empty.
 */

const PickLists: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<{ sku: string; variationId?: string; label?: string; qty: string }[]>(
    [{ sku: '', qty: '1' }]);

  const fail = (e: any) => setError(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const load = async () => {
    try {
      setError('');
      const res = await api.get('/wms/pick-lists');
      setRows(res.data.rows ?? []);
    } catch (e) { fail(e); }
  };
  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    try {
      const res = await api.get(`/wms/pick-lists/${id}`);
      setDetail(res.data);
    } catch (e) { fail(e); }
  };

  const resolveLine = async (idx: number) => {
    const l = lines[idx];
    const hits = await searchAPI.query('variation', l.sku, 1);
    const hit = hits[0];
    if (!hit) { setError(`No variation for "${l.sku}" (min 3 chars)`); return; }
    const next = [...lines];
    next[idx] = { ...l, variationId: hit.id, label: `${hit.label}${hit.sublabel ? ` (${hit.sublabel})` : ''}` };
    setLines(next);
  };

  const create = async () => {
    const ready = lines.filter((l) => l.variationId && parseInt(l.qty) > 0);
    if (!ready.length) { setError('Resolve at least one SKU line first.'); return; }
    try {
      const res = await api.post('/wms/pick-lists', {
        reference: reference.trim() || null,
        lines: ready.map((l) => ({ variationId: l.variationId, qty: parseInt(l.qty) })),
      });
      const created = res.data;
      if (created?.uncovered?.length) {
        flash(`Created — ${created.uncovered.reduce((s: number, u: any) => s + u.qty, 0)} unit(s) not binned (pick from loose stock)`);
      } else flash('Pick list created');
      setCreating(false); setReference(''); setLines([{ sku: '', qty: '1' }]);
      load(); if (created?.id) open(created.id);
    } catch (e) { fail(e); }
  };

  const act = async (path: string, refresh = true) => {
    try {
      await api.post(path, {});
      if (refresh && detail) { open(detail.id); load(); }
    } catch (e) { fail(e); }
  };

  return (
    <Page>
      <PageHeader
        title="Pick Lists"
        description="Allocated FEFO from bins, walked in serpentine pick-path order. Confirming a pick moves stock out of the bin; the bin re-check is done at confirm time."
        actions={<Btn onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ New pick list'}</Btn>}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      {creating && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm">
          <TextInput className="w-72" placeholder="Reference (optional — order no, wave…)" value={reference}
                 onChange={(e) => setReference(e.target.value)} />
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <TextInput className="w-56 font-mono" placeholder="SKU" value={l.sku}
                     onChange={(e) => { const n = [...lines]; n[i] = { ...l, sku: e.target.value, variationId: undefined, label: undefined }; setLines(n); }} />
              <TextInput className="w-20" type="number" min={1} value={l.qty}
                     onChange={(e) => { const n = [...lines]; n[i] = { ...l, qty: e.target.value }; setLines(n); }} />
              {l.variationId
                ? <span className="text-xs text-emerald-700">✓ {l.label}</span>
                : <Btn variant="outline" size="sm" onClick={() => resolveLine(i)}>Resolve</Btn>}
            </div>
          ))}
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setLines([...lines, { sku: '', qty: '1' }])}>+ line</Btn>
            <Btn size="sm" onClick={create}>Create</Btn>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Reference</Th><Th>Status</Th><Th num>Items</Th><Th>Created</Th>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No pick lists yet.</td></tr>
              )}
              {rows.map((r: any) => (
                <Tr key={r.id} className="cursor-pointer" onClick={() => open(r.id)}>
                  <Td className="font-mono text-xs">{r.reference ?? r.id.slice(0, 8)}</Td>
                  <Td><StatusChip status={r.status} /></Td>
                  <Td num>{r.done_count}/{r.item_count}</Td>
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
              {detail.status === 'open' && (
                <span className="flex gap-2">
                  <Btn variant="success" size="sm" onClick={() => act(`/wms/pick-lists/${detail.id}/complete`)}>Complete</Btn>
                  <Btn variant="outline" size="sm" onClick={() => act(`/wms/pick-lists/${detail.id}/cancel`)}>Cancel</Btn>
                </span>
              )}
            </div>
            <table className="w-full text-xs">
              <THead sticky={false}>
                <Th>#</Th><Th>Bin</Th><Th>SKU</Th><Th>Batch</Th>
                <Th num>Qty</Th><Th num>Picked</Th><Th></Th>
              </THead>
              <TBody>
                {detail.items?.map((i: any, idx: number) => (
                  <Tr key={i.id}>
                    <Td muted>{idx + 1}</Td>
                    <Td className="font-mono">{i.bin_code}</Td>
                    <Td className="font-mono">{i.sku}</Td>
                    <Td>{i.batch_number ? `${i.batch_number} (${i.expiry_date ?? '—'})` : '—'}</Td>
                    <Td num>{i.qty}</Td>
                    <Td num>{i.qty_picked}</Td>
                    <Td>
                      {detail.status === 'open' && i.status === 'pending' ? (
                        <span className="flex gap-1">
                          <Btn size="sm" onClick={() => act(`/wms/pick-lists/items/${i.id}/pick`)}>Pick</Btn>
                          <Btn variant="outline" size="sm" onClick={() => act(`/wms/pick-lists/items/${i.id}/short`)}>Short</Btn>
                        </span>
                      ) : <StatusChip status={i.status} />}
                    </Td>
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

export default PickLists;
