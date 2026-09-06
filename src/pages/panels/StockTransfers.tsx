import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Plus, Loader2, Truck, FileText, CheckCircle2, X, Send, PackageCheck } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { localeDate } from '../../utils/date';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput, SearchInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * Inter-branch Stock Transfers (migration 062, spec §6). Plain-language screen:
 * "Move stock from your warehouse to a branch. It stays 'in transit' until the
 * branch confirms it arrived." Draft → Approve → Dispatch (goes in transit) →
 * Receive (branch confirms, short/damaged handled). Delivery-challan PDF + a
 * branch e-way-bill draft when the value crosses the threshold.
 */

const num = (n: any) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const inr = (minor: any) => { const n = Number(minor); return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'; };

interface Loc { id: string; name: string; code: string; kind: string; city?: string }
interface Item { id: string; variation_id: string; sku?: string; product_name?: string; batch_number?: string; expiry_date?: string; qty_requested: number; qty_dispatched: number; qty_received: number; unit_cost_minor: string }
interface Transfer {
  id: string; transfer_number: string | null; status: string;
  from_name?: string; to_name?: string; from_kind?: string; to_kind?: string;
  total_value_minor: string; ewb_document_id: string | null; ewb?: any;
  dispatched_at?: string | null; received_at?: string | null; note?: string | null;
  created_at: string; item_count?: number; items?: Item[];
}

const STATUS_TONE: Record<string, any> = {
  draft: 'neutral', approved: 'blue', dispatched: 'amber', in_transit: 'amber', received: 'green', cancelled: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', approved: 'Approved', dispatched: 'Dispatched', in_transit: 'In transit', received: 'Received', cancelled: 'Cancelled',
};
const ORDER: Record<string, number> = { draft: 0, approved: 1, dispatched: 2, in_transit: 2, received: 3 };
const MILESTONES: Array<{ label: string; at: number }> = [
  { label: 'Draft', at: 0 }, { label: 'Approved', at: 1 }, { label: 'Dispatched', at: 2 },
  { label: 'In transit', at: 2 }, { label: 'Received', at: 3 },
];

const locLabel = (l: Loc) => `${l.kind === 'outlet' ? '🏪' : '🏬'} ${l.name}${l.code ? ` (${l.code})` : ''}`;

const StockTransfers: React.FC = () => {
  const [list, setList] = useState<Transfer[] | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [detail, setDetail] = useState<Transfer | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // create form
  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [note, setNote] = useState('');
  const [lines, setLines] = useState<Array<{ variationId: string; sku: string; name: string; qty: string }>>([]);
  const [results, setResults] = useState<any[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // receive form
  const [receiveMode, setReceiveMode] = useState(false);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [recvNote, setRecvNote] = useState<Record<string, string>>({});

  const loadList = () => api.get('/transfers').then((r) => setList(payload<Transfer[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  const loadLocs = () => api.get('/transfers/locations').then((r) => setLocs(payload<Loc[]>(r) ?? [])).catch(() => {});
  useEffect(() => { loadList(); loadLocs(); }, []);

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setReceiveMode(false); setRecv({}); setRecvNote({});
    try {
      const t = payload<Transfer>(await api.get(`/transfers/${id}`));
      setDetail(t); setCreating(false);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const search = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep last */ }
    }, 250);
  };
  const addLine = (r: any) => {
    const vid = r.variation_id ?? r.id;
    if (lines.some((l) => l.variationId === vid)) { setResults([]); return; }
    setLines([...lines, { variationId: vid, sku: r.sku ?? '', name: r.name, qty: '1' }]);
    setResults([]);
  };

  const create = async () => {
    if (!from || !to) { setMsg('Choose where the stock moves from and to.'); return; }
    if (from === to) { setMsg('Source and destination must be different.'); return; }
    const payloadLines = lines.map((l) => ({ variationId: l.variationId, qty: Math.round(Number(l.qty) || 0) })).filter((l) => l.qty > 0);
    if (payloadLines.length === 0) { setMsg('Add at least one product with a quantity.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const t = payload<Transfer>(await api.post('/transfers', { fromWarehouseId: from, toWarehouseId: to, note: note.trim() || null, lines: payloadLines }));
      setOk('Draft transfer created. Approve it, then dispatch.');
      setCreating(false); setFrom(''); setTo(''); setNote(''); setLines([]);
      loadList(); if (t?.id) openDetail(t.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const act = async (path: string, body?: any, successMsg?: string) => {
    if (!detail || busy) return;
    setBusy(true); setMsg(''); setOk('');
    try {
      await api.post(`/transfers/${detail.id}/${path}`, body ?? {});
      if (successMsg) setOk(successMsg);
      await openDetail(detail.id); loadList();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const confirmReceive = async () => {
    if (!detail) return;
    const recvLines = (detail.items ?? []).map((it) => ({
      itemId: it.id,
      qtyReceived: recv[it.id] !== undefined && recv[it.id] !== '' ? Math.round(Number(recv[it.id]) || 0) : it.qty_dispatched,
      note: recvNote[it.id] || null,
    }));
    setReceiveMode(false);
    await act('receive', { lines: recvLines }, 'Receipt confirmed. Any short/damaged units were recorded.');
  };

  const downloadPdf = async () => {
    if (!detail) return;
    try {
      const res = await api.get(`/transfers/${detail.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (e: any) { setMsg(e?.response?.data?.message ?? 'Could not build the PDF'); }
  };

  const genEway = () => act('eway', {}, 'E-way bill draft created — open the E-way Bills screen to upload it on the NIC portal.');

  const cur = detail ? (ORDER[detail.status] ?? -1) : -1;
  const cancelled = detail?.status === 'cancelled';

  return (
    <Page>
      <PageHeader
        title="Stock Transfers"
        icon={ArrowLeftRight}
        description="Move stock from your warehouse to a branch. It stays 'in transit' until the branch confirms it arrived — short or damaged units are handled on receipt."
        actions={<Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Cancel' : 'New transfer'}</Btn>}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* CREATE */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New stock transfer</h3>
          <FilterBar>
            <Field label="From (source)">
              <SelectInput value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choose source…</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{locLabel(l)}</option>)}
              </SelectInput>
            </Field>
            <Field label="To (branch / destination)">
              <SelectInput value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose destination…</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{locLabel(l)}</option>)}
              </SelectInput>
            </Field>
            <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. weekly branch top-up" /></Field>
          </FilterBar>

          <div>
            <SearchInput placeholder="Search product name, brand or SKU to add…" onChange={(e) => search(e.target.value)} />
            {results.length > 0 && (
              <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                {results.map((r: any) => {
                  const vid = r.variation_id ?? r.id;
                  return (
                    <button key={vid} onClick={() => addLine(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Product</Th><Th>SKU</Th><Th num>Units to move</Th><Th></Th></THead>
                <TBody>
                  {lines.map((l, i) => (
                    <Tr key={l.variationId}>
                      <Td>{l.name}</Td>
                      <Td muted className="font-mono text-xs">{l.sku}</Td>
                      <Td num><TextInput type="number" min={1} value={l.qty} onChange={(e) => { const c = [...lines]; c[i] = { ...c[i], qty: e.target.value }; setLines(c); }} className="w-24 text-right" /></Td>
                      <Td><Btn variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Btn></Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          )}
          <Btn variant="success" disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create draft transfer</Btn>
        </div>
      )}

      {/* DETAIL */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                {detail.transfer_number || '(draft — no number until dispatch)'}
                <Chip tone={STATUS_TONE[detail.status] ?? 'default'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.from_name} → {detail.to_name} · {detail.item_count ?? detail.items?.length ?? 0} line(s) · value {inr(detail.total_value_minor)}
                {detail.note ? ` · ${detail.note}` : ''}
              </div>
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          {/* Timeline */}
          {!cancelled ? (
            <div className="flex items-center gap-1 overflow-x-auto">
              {MILESTONES.map((m, i) => {
                const done = cur >= m.at;
                return (
                  <React.Fragment key={m.label}>
                    {i > 0 && <div className={`h-0.5 w-8 shrink-0 ${cur >= m.at ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                    <div className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-current" />}
                      {m.label}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">This transfer was cancelled before dispatch — no stock moved.</div>
          )}

          {/* Current-step action */}
          <div className="flex flex-wrap gap-2">
            {detail.status === 'draft' && <Btn variant="primary" disabled={busy} onClick={() => act('approve', {}, 'Approved. You can dispatch it now.')}><CheckCircle2 className="h-4 w-4" />Approve</Btn>}
            {detail.status === 'approved' && <Btn variant="primary" disabled={busy} onClick={() => act('dispatch', {}, 'Dispatched — the stock is now in transit.')}><Send className="h-4 w-4" />Dispatch (send)</Btn>}
            {detail.status === 'in_transit' && !receiveMode && <Btn variant="success" disabled={busy} onClick={() => setReceiveMode(true)}><PackageCheck className="h-4 w-4" />Receive at branch</Btn>}
            {(detail.status === 'draft' || detail.status === 'approved') && <Btn variant="danger" disabled={busy} onClick={() => act('cancel', { reason: 'cancelled by staff' }, 'Transfer cancelled.')}><X className="h-4 w-4" />Cancel</Btn>}
            {detail.transfer_number && <Btn variant="outline" onClick={downloadPdf}><FileText className="h-4 w-4" />Transfer note (PDF)</Btn>}
            {(detail.status === 'in_transit' || detail.status === 'received') && !detail.ewb_document_id && <Btn variant="outline" disabled={busy} onClick={genEway}><Truck className="h-4 w-4" />Generate e-way bill</Btn>}
            {detail.ewb && <Chip tone="blue">E-way: {detail.ewb.ewb_number || detail.ewb.status || 'draft'}</Chip>}
          </div>

          {/* Items / receive */}
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU / Batch</Th><Th num>Requested</Th><Th num>Dispatched</Th>
                {receiveMode ? <Th num>Received now</Th> : <Th num>Received</Th>}
                {receiveMode && <Th>Short/damaged note</Th>}
              </THead>
              <TBody>
                {(detail.items ?? []).length === 0 ? (
                  <EmptyRow colSpan={receiveMode ? 6 : 5}>No lines.</EmptyRow>
                ) : (detail.items ?? []).map((it) => (
                  <Tr key={it.id}>
                    <Td>{it.product_name}</Td>
                    <Td muted className="font-mono text-xs">{it.sku}{it.batch_number ? ` · ${it.batch_number}` : ''}</Td>
                    <Td num>{num(it.qty_requested)}</Td>
                    <Td num>{num(it.qty_dispatched)}</Td>
                    {receiveMode ? (
                      <Td num><TextInput type="number" min={0} max={it.qty_dispatched} className="w-24 text-right"
                        value={recv[it.id] ?? String(it.qty_dispatched)} onChange={(e) => setRecv({ ...recv, [it.id]: e.target.value })} /></Td>
                    ) : (
                      <Td num className={detail.status === 'received' && it.qty_received < it.qty_dispatched ? 'text-red-600 font-semibold' : ''}>
                        {detail.status === 'received' ? num(it.qty_received) : '—'}
                      </Td>
                    )}
                    {receiveMode && <Td><TextInput placeholder="e.g. 2 damaged in transit" value={recvNote[it.id] ?? ''} onChange={(e) => setRecvNote({ ...recvNote, [it.id]: e.target.value })} /></Td>}
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          {receiveMode && (
            <div className="flex gap-2">
              <Btn variant="success" disabled={busy} onClick={confirmReceive}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Confirm receipt</Btn>
              <Btn variant="ghost" onClick={() => setReceiveMode(false)}>Cancel</Btn>
              <span className="self-center text-xs text-gray-500">Enter what actually arrived. Anything less than dispatched is recorded as a loss (short/damaged).</span>
            </div>
          )}
        </div>
      )}

      {/* LIST */}
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Transfer</Th><Th>Route</Th><Th num>Lines</Th><Th num>Value</Th><Th>Status</Th><Th>Dispatched</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={6}>Loading transfers…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={6}>
                <EmptyState title="No transfers yet" description="Create your first transfer above to move stock from your warehouse to a branch." />
              </EmptyRow>
            ) : list.map((t) => (
              <Tr key={t.id} className="cursor-pointer" onClick={() => openDetail(t.id)}>
                <Td className="font-mono text-xs">{t.transfer_number || '(draft)'}</Td>
                <Td>{t.from_name} → {t.to_name}</Td>
                <Td num>{num(t.item_count)}</Td>
                <Td num>{inr(t.total_value_minor)}</Td>
                <Td><Chip tone={STATUS_TONE[t.status] ?? 'default'}>{STATUS_LABEL[t.status] ?? t.status}</Chip></Td>
                <Td muted className="text-xs">{t.dispatched_at ? localeDate(t.dispatched_at) : '—'}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default StockTransfers;
