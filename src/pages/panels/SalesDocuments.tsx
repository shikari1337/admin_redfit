import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  FilterBar, Field, TextInput, SelectInput, SearchInput, TabBar, inr,
  ExportMenu, Pagination, DrillLink, TableSkeleton, type CsvColumn,
} from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';
import type { Tone } from '../../components/erp';
import { FileText, Download, RotateCcw, Truck, Package, Search, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Credit / Debit Notes & Challans (Part I §8 sales spine; §11 documents).
 *
 * Plain language throughout — a shopkeeper, not an accountant, uses this:
 *  - A CREDIT NOTE is what you give a customer when they return something (or you
 *    overcharged). It fixes your GST too.
 *  - A DEBIT NOTE is when you UNDER-charged and need to bill a bit more.
 *  - A DELIVERY CHALLAN / PACKING SLIP is the paper the delivery person carries —
 *    it lists the goods, not the money.
 *
 * All pricing + GST are computed on the server. Uses the shared ERP primitive kit.
 */

type Kind = 'credit' | 'debit';
const STATUS_TONE: Record<string, Tone> = { draft: 'amber', issued: 'green', cancelled: 'red', open: 'blue', dispatched: 'green' };
const Pill: React.FC<{ status: string }> = ({ status }) => <StatusChip status={status} tone={STATUS_TONE[status] ?? 'neutral'} />;

/** Rows per page of a register (books answers 50 by default). */
const PAGE_SIZE = 50;
/** A note's states (books `sales_credit_notes.status` / `sales_debit_notes.status`). */
type NoteStatus = 'draft' | 'issued' | 'cancelled';
const NOTE_STATUSES: NoteStatus[] = ['draft', 'issued', 'cancelled'];
const NOTE_STATUS_LABEL: Record<NoteStatus, string> = { draft: 'Draft', issued: 'Issued', cancelled: 'Cancelled' };
/** The challan types books accepts (db/sales_docs.rs `delivery`, `jobwork`), in plain words. */
const CHALLAN_TYPE_LABEL: Record<string, string> = { delivery: 'Delivery', jobwork: 'Job work' };
/** Settlements that send money back (a refund is raised for them, Refunds page). */
const MONEY_BACK = ['cash', 'bank'];
const settlementOf = (r: any): string =>
  typeof r?.settlement === 'string' ? r.settlement : String(r?.settlement?.mode ?? r?.settlement?.method ?? '');
/** The register's full count: the v2 page keeps `total` on the list; an older answer counts its rows. */
const listCount = (d: any, list: any[]): number => {
  const t = Number(d?.total ?? (list as any)?.total);
  return Number.isFinite(t) && t >= list.length ? t : list.length;
};

interface OrderLine { variation_id: string | null; product_id: string; product_name: string; sku: string; quantity: number; price: number; credit: number }

/** The note register as a spreadsheet. `numberField` differs per kind. */
const noteCsvCols = (numberField: string): CsvColumn<any>[] => [
  { key: numberField, label: 'Number' },
  { key: 'order_number', label: 'Against order', format: (r) => r.order_number ?? '' },
  { key: 'reason', label: 'Reason', format: (r) => r.reason ?? '' },
  { key: 'status', label: 'Status' },
  { key: 'taxable', label: 'Taxable', format: (r) => Number(r.taxable ?? 0).toFixed(2) },
  { key: 'cgst', label: 'CGST', format: (r) => Number(r.cgst ?? 0).toFixed(2) },
  { key: 'sgst', label: 'SGST', format: (r) => Number(r.sgst ?? 0).toFixed(2) },
  { key: 'igst', label: 'IGST', format: (r) => Number(r.igst ?? 0).toFixed(2) },
  { key: 'total', label: 'Total', format: (r) => Number(r.total ?? 0).toFixed(2) },
];

const openBlob = async (url: string, setErr: (s: string) => void) => {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const u = URL.createObjectURL(res.data as Blob);
    window.open(u, '_blank');
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
};

// ── Shared: load an order + edit qty-to-process per line ────────────────────
const useOrderLines = () => {
  const [orderNo, setOrderNo] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const load = async () => {
    const id = orderNo.trim();
    if (!id) return;
    setLoading(true); setLoadErr(''); setOrder(null); setLines([]);
    try {
      const o = payload<any>(await api.get(`/orders/${encodeURIComponent(id)}`));
      if (!o || !o.id) { setLoadErr('Order not found.'); return; }
      setOrder(o);
      setLines((o.items ?? []).map((it: any) => ({
        variation_id: it.variation_id ?? null, product_id: it.product_id,
        product_name: it.product_name, sku: it.sku, quantity: Number(it.quantity) || 0,
        price: Number(it.price) || 0, credit: 0,
      })));
    } catch (e: any) { setLoadErr(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  const reset = () => { setOrderNo(''); setOrder(null); setLines([]); setLoadErr(''); };
  return { orderNo, setOrderNo, order, lines, setLines, loading, loadErr, load, reset };
};

const LinePicker: React.FC<{ lines: OrderLine[]; setLines: (l: OrderLine[]) => void; label: string }> = ({ lines, setLines, label }) => (
  <TableShell>
    <table className="w-full text-sm">
      <THead><Th>Product</Th><Th>SKU</Th><Th num>Sold</Th><Th num>Unit price</Th><Th num>{label}</Th></THead>
      <TBody>
        {lines.length === 0 && <EmptyRow colSpan={5}>Load an order to see its lines.</EmptyRow>}
        {lines.map((l, i) => (
          <Tr key={l.variation_id ?? l.product_id ?? i}>
            <Td>{l.product_name}</Td>
            <Td className="font-mono text-xs text-gray-500">{l.sku}</Td>
            <Td num>{l.quantity}</Td>
            <Td num>{inr(l.price)}</Td>
            <Td num>
              <span className="inline-flex items-center gap-1">
                <button className="h-7 w-7 rounded border text-base font-bold" onClick={() => setLines(lines.map((x, j) => j === i ? { ...x, credit: Math.max(0, x.credit - 1) } : x))}>−</button>
                <span className="w-7 text-center">{l.credit}</span>
                <button className="h-7 w-7 rounded border text-base font-bold" onClick={() => setLines(lines.map((x, j) => j === i ? { ...x, credit: Math.min(x.quantity, x.credit + 1) } : x))}>+</button>
              </span>
            </Td>
          </Tr>
        ))}
      </TBody>
    </table>
  </TableShell>
);

// ── Credit / Debit note builder + list ──────────────────────────────────────
const NotePanel: React.FC<{ kind: Kind }> = ({ kind }) => {
  const isCredit = kind === 'credit';
  const base = isCredit ? '/sales-docs/credit-notes' : '/sales-docs/debit-notes';
  const numberField = isCredit ? 'cn_number' : 'dn_number';

  const { orderNo, setOrderNo, order, lines, setLines, loading, loadErr, load, reset } = useOrderLines();
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [settlement, setSettlement] = useState<'credit_note' | 'cash' | 'bank'>('credit_note');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // The register: one page at a time (the server answers 50 by default), with its drafts counted
  // apart so a note left unissued is never lost behind older pages. `null` = still loading.
  const [rows, setRows] = useState<any[] | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [show, setShow] = useState<'' | NoteStatus>('');
  const [drafts, setDrafts] = useState(0);
  const [rowBusy, setRowBusy] = useState('');
  const [find, setFind] = useState('');
  const loadList = async () => {
    setListErr('');
    try {
      const d = payload<any>(await api.get(base, {
        params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(show ? { status: show } : {}) },
      }));
      const list: any[] = Array.isArray(d) ? d : (d?.rows ?? []);
      setRows(list);
      setListTotal(listCount(d, list));
    } catch (e: any) {
      setRows((r) => r ?? []);
      setListErr(e?.response?.data?.message ?? e.message ?? 'The register could not be loaded.');
    }
    // Drafts waiting to be issued, counted on their own (one row is enough to read the total).
    try { const d = payload<any>(await api.get(base, { params: { status: 'draft', limit: 1 } })); setDrafts(listCount(d, Array.isArray(d) ? d : [])); }
    catch { /* the count is advice; the register above already said what failed */ }
  };
  useEffect(() => { setRows(null); loadList(); /* eslint-disable-next-line */ }, [kind, page, show]);
  const showOnly = (s: '' | NoteStatus) => { setShow(s); setPage(1); };

  /** Issue or cancel a draft from the register (a note created and left before "Issue"). */
  const act = async (r: any, step: 'issue' | 'cancel') => {
    if (step === 'cancel' && !window.confirm(`Cancel draft ${r[numberField] ?? ''}? It was never issued, so nothing in your books or stock changes. The number stays used.`)) return;
    setRowBusy(r.id); setErr(''); setMsg('');
    try {
      const doc = payload<any>(await api.post(`${base}/${r.id}/${step}`, {}));
      setMsg(step === 'issue'
        ? `${doc?.[numberField] ?? r[numberField]} issued.${isCredit && doc?.restock ? ' Returned stock is back on the shelf.' : ''}`
        : `Draft ${doc?.[numberField] ?? r[numberField]} cancelled.`);
      if (created?.id === r.id) setCreated(doc);
      await loadList();
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setRowBusy(''); }
  };

  const shown = React.useMemo(() => {
    const all = rows ?? [];
    const q = find.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r: any) => [r[numberField], r.order_number, r.reason, r.customer_name]
      .some((v: any) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, find, numberField]);

  const items = lines.filter((l) => l.credit > 0).map((l) => ({ variationId: l.variation_id || undefined, productId: l.product_id, quantity: l.credit }));

  const create = async () => {
    if (!items.length) { setErr('Set a quantity on at least one line.'); return; }
    if (!reason.trim()) { setErr(isCredit ? 'Enter why the customer is being credited.' : 'Enter why you are charging more.'); return; }
    setSaving(true); setErr(''); setMsg('');
    try {
      const body: any = { order: order?.order_id ?? order?.order_number, reason, items };
      if (isCredit) { body.restock = restock; body.settlement = settlement; }
      const doc = payload<any>(await api.post(base, body));
      setCreated(doc);
      setMsg(`${isCredit ? 'Credit' : 'Debit'} note ${doc[numberField]} created (draft). Review and issue it below.`);
      loadList();
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const issue = async () => {
    if (!created) return;
    setSaving(true); setErr(''); setMsg('');
    try {
      const doc = payload<any>(await api.post(`${base}/${created.id}/issue`, {}));
      setCreated(doc);
      setMsg(`${doc[numberField]} issued.${isCredit && doc.restock ? ' Returned stock is back on the shelf.' : ''}`);
      loadList();
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const startOver = () => { setCreated(null); setReason(''); setRestock(true); setSettlement('credit_note'); reset(); setErr(''); setMsg(''); };

  return (
    <div className="space-y-4">
      <SectionCard
        title={isCredit ? 'New credit note' : 'New debit note'}
        description={isCredit
          ? 'A credit note is what you give a customer when they return something (or you overcharged). Pick the sale, choose what is coming back, and we fix the amounts and GST for you.'
          : 'A debit note is for when you UNDER-charged a customer and need to bill the difference. Pick the sale and the items to charge more for.'}>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

        {!created && (
          <>
            <FilterBar>
              <Field label="Order number">
                <TextInput className="w-56" placeholder="e.g. ORD-00042" value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
              </Field>
              <Btn variant="outline" onClick={load} disabled={loading}><Search className="h-4 w-4" /> {loading ? 'Loading…' : 'Load order'}</Btn>
              {order && <Btn variant="ghost" onClick={reset}>Clear</Btn>}
            </FilterBar>
            {loadErr && <div className="mt-2 text-sm text-red-600">{loadErr}</div>}

            {order && (
              <div className="mt-4 space-y-4">
                <div className="text-sm text-gray-600">Sale <span className="font-mono">{order.order_id}</span> · {order.shipping_address?.fullName ?? 'Customer'}</div>
                <LinePicker lines={lines} setLines={setLines} label={isCredit ? 'Credit qty' : 'Charge qty'} />
                <FilterBar>
                  <Field label="Reason" className="flex-1 min-w-[18rem]">
                    <TextInput value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder={isCredit ? 'e.g. Customer returned 2 bottles (damaged)' : 'e.g. Freight was under-billed'} />
                  </Field>
                  {isCredit && (
                    <Field label="Settle as">
                      <SelectInput value={settlement} onChange={(e) => setSettlement(e.target.value as any)}>
                        <option value="credit_note">Credit to account (reduce what they owe)</option>
                        <option value="cash">Cash refund</option>
                        <option value="bank">Bank/UPI refund</option>
                      </SelectInput>
                    </Field>
                  )}
                </FilterBar>
                {isCredit && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                    Put the returned items back on the shelf (add them back to stock)
                  </label>
                )}
                <div className="flex justify-end">
                  <Btn variant="success" onClick={create} disabled={saving || !items.length}>{saving ? 'Creating…' : `Create ${isCredit ? 'credit' : 'debit'} note`}</Btn>
                </div>
              </div>
            )}
          </>
        )}

        {created && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-semibold">{created[numberField]}</span>
                <Pill status={created.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                {created.status === 'draft' && <Btn variant="primary" onClick={issue} disabled={saving}>{saving ? 'Issuing…' : `Issue ${isCredit ? 'credit' : 'debit'} note`}</Btn>}
                <Btn variant="outline" onClick={() => openBlob(`${base}/${created.id}/pdf`, setErr)}><Download className="h-4 w-4" /> Download PDF</Btn>
                <Btn variant="ghost" onClick={startOver}>New note</Btn>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Taxable value</span><span className="tabular-nums">{inr(created.taxable)}</span></div>
                {created.cgst > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="tabular-nums">{inr(created.cgst)}</span></div>}
                {created.sgst > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="tabular-nums">{inr(created.sgst)}</span></div>}
                {created.igst > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="tabular-nums">{inr(created.igst)}</span></div>}
                <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>{isCredit ? 'Total credited' : 'Total charged'}</span><span className="tabular-nums">{inr(created.total)}</span></div>
              </div>
            </div>
            {created.status === 'draft' && (
              <p className="text-xs text-gray-500">This note is a draft. Issuing it {isCredit ? 'reverses the GST on the returned goods (and, if ticked, restocks them).' : 'records the supplementary charge and its GST.'} You can download the PDF either way.</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* What to act on first: drafts that were created and never issued. */}
      {drafts > 0 && show !== 'draft' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {drafts} draft {isCredit ? 'credit' : 'debit'} note{drafts === 1 ? '' : 's'} not issued yet: {isCredit ? 'the GST and stock are not corrected' : 'the extra charge is not billed'} until you issue {drafts === 1 ? 'it' : 'them'}.
          </span>
          <Btn variant="outline" size="sm" onClick={() => showOnly('draft')}>Show drafts</Btn>
        </div>
      )}

      <SectionCard
        title={isCredit ? 'Credit notes' : 'Debit notes'}
        action={
          <FilterBar>
            <SelectInput aria-label="Show" value={show} onChange={(e) => showOnly(e.target.value as '' | NoteStatus)}>
              <option value="">Every note</option>
              {NOTE_STATUSES.map((s) => <option key={s} value={s}>{NOTE_STATUS_LABEL[s]}</option>)}
            </SelectInput>
            <SearchInput className="w-56" placeholder="Number, order, customer or reason" value={find} onChange={(e) => setFind(e.target.value)} />
            <ExportMenu
              filename={isCredit ? 'credit-notes' : 'debit-notes'}
              columns={noteCsvCols(numberField)}
              rows={shown}
              canExport={shown.length > 0}
            />
          </FilterBar>
        }
      >
        {listErr && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not load the notes: {listErr}</div>}
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Number</Th><Th>Against order</Th><Th>Reason</Th><Th>Status</Th><Th num>Total</Th><Th></Th></THead>
            {rows === null && <TableSkeleton cols={6} rows={4} />}
            <TBody>
              {rows !== null && shown.length === 0 && (
                <EmptyRow colSpan={6}>
                  {find ? 'Nothing matches what you typed.'
                    : show ? `No ${NOTE_STATUS_LABEL[show].toLowerCase()} ${isCredit ? 'credit' : 'debit'} notes.`
                      : `No ${isCredit ? 'credit' : 'debit'} notes yet. Raise one above.`}
                </EmptyRow>
              )}
              {shown.map((r: any) => (
                <Tr key={r.id}>
                  <Td className="font-mono text-xs">{r[numberField]}</Td>
                  <Td className="text-xs">
                    {r.order_id
                      ? <DrillLink to={`/orders/${r.order_id}`} className="font-mono">{r.order_number || 'Order'}</DrillLink>
                      : <span className="font-mono text-gray-500">{r.order_number || '-'}</span>}
                    {r.customer_name && <span className="block text-gray-400">{r.customer_name}</span>}
                  </Td>
                  <Td className="max-w-[16rem] truncate">{r.reason || '-'}</Td>
                  <Td>
                    <Pill status={r.status} />
                    {isCredit && r.status === 'issued' && MONEY_BACK.includes(settlementOf(r)) && (
                      <DrillLink to="/panel/orders/refunds" className="mt-0.5 block text-xs">Money back: Refunds</DrillLink>
                    )}
                  </Td>
                  <Td num>{inr(r.total)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {r.status === 'draft' && (
                        <>
                          <Btn variant="primary" size="sm" disabled={rowBusy === r.id} onClick={() => act(r, 'issue')}>
                            {rowBusy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Issue
                          </Btn>
                          <Btn variant="ghost" size="sm" disabled={rowBusy === r.id} onClick={() => act(r, 'cancel')}>Cancel</Btn>
                        </>
                      )}
                      {r.status === 'issued' && (
                        <InfoTip text={isCredit
                          ? 'An issued credit note stays in your books. To correct it, raise a debit note against the same order.'
                          : 'An issued debit note stays in your books. To correct it, raise a credit note against the same order.'} />
                      )}
                      <Btn variant="ghost" size="sm" title="Download PDF" onClick={() => openBlob(`${base}/${r.id}/pdf`, setErr)}><Download className="h-4 w-4" /></Btn>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={page} pageSize={PAGE_SIZE} total={listTotal} onPage={setPage} />
      </SectionCard>
    </div>
  );
};

// ── Delivery challan / packing slip ─────────────────────────────────────────
const ChallanPanel: React.FC = () => {
  const [orderNo, setOrderNo] = useState('');
  const [type, setType] = useState<'delivery' | 'jobwork'>('delivery');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // `null` = still loading; one page at a time (books answers 50 by default).
  const [rows, setRows] = useState<any[] | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [listErr, setListErr] = useState('');
  const [page, setPage] = useState(1);
  const [find, setFind] = useState('');

  const loadList = async () => {
    setListErr('');
    try {
      const d = payload<any>(await api.get('/sales-docs/challans', { params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }));
      const list: any[] = Array.isArray(d) ? d : (d?.rows ?? []);
      setRows(list);
      setListTotal(listCount(d, list));
    } catch (e: any) {
      setRows((r) => r ?? []);
      setListErr(e?.response?.data?.message ?? e.message ?? 'The challans could not be loaded.');
    }
  };
  useEffect(() => { loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  const shown = React.useMemo(() => {
    const all = rows ?? [];
    const q = find.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r: any) => [r.challan_number, r.order_number, r.type]
      .some((v: any) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, find]);

  const makeChallan = async () => {
    const id = orderNo.trim();
    if (!id) { setErr('Enter an order number first.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const c = payload<any>(await api.post('/sales-docs/challans', { order: id, type }));
      setMsg(`Challan ${c.challan_number} created. Opening the printable copy.`);
      await openBlob(`/sales-docs/challans/${c.id}/pdf`, setErr);
      loadList();
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };
  const printPackingSlip = async () => {
    const id = orderNo.trim();
    if (!id) { setErr('Enter an order number first.'); return; }
    setErr(''); setMsg('');
    await openBlob(`/sales-docs/packing-slip/${encodeURIComponent(id)}/pdf`, setErr);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Print a delivery challan or packing slip"
        description="These are the papers the delivery person carries with the goods. They list the items and quantities, never prices or tax. A delivery challan is NOT a tax invoice.">
        {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}
        <FilterBar>
          <Field label="Order number">
            <TextInput className="w-56" placeholder="e.g. ORD-00042" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </Field>
          <Field label="Challan type">
            <SelectInput value={type} onChange={(e) => setType(e.target.value as any)}>
              {Object.entries(CHALLAN_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </Field>
          <Btn variant="primary" onClick={makeChallan} disabled={busy}><Truck className="h-4 w-4" /> {busy ? 'Working…' : 'Create & print delivery challan'}</Btn>
          <Btn variant="outline" onClick={printPackingSlip}><Package className="h-4 w-4" /> Print packing slip</Btn>
        </FilterBar>
      </SectionCard>

      <SectionCard
        title="Recent challans"
        action={
          <FilterBar>
            <SearchInput className="w-56" placeholder="Challan or order number…" value={find} onChange={(e) => setFind(e.target.value)} />
            <ExportMenu
              filename="delivery-challans"
              columns={[
                { key: 'challan_number', label: 'Challan #' },
                { key: 'order_number', label: 'Order', format: (r: any) => r.order_number ?? '' },
                { key: 'type', label: 'Type' },
                { key: 'status', label: 'Status' },
              ] as CsvColumn<any>[]}
              rows={shown}
              canExport={shown.length > 0}
            />
          </FilterBar>
        }
      >
        {listErr && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not load the challans: {listErr}</div>}
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Challan #</Th><Th>Order</Th><Th>Type</Th><Th>Status</Th><Th></Th></THead>
            {rows === null && <TableSkeleton cols={5} rows={4} />}
            <TBody>
              {rows !== null && shown.length === 0 && <EmptyRow colSpan={5}>{find ? 'Nothing matches what you typed.' : 'No challans yet. Create one above when goods leave.'}</EmptyRow>}
              {shown.map((r: any) => (
                <Tr key={r.id}>
                  <Td className="font-mono text-xs">{r.challan_number}</Td>
                  <Td className="text-xs">
                    {r.order_id
                      ? <DrillLink to={`/orders/${r.order_id}`} className="font-mono">{r.order_number || 'Order'}</DrillLink>
                      : <span className="font-mono text-gray-500">{r.order_number || '-'}</span>}
                  </Td>
                  <Td>{CHALLAN_TYPE_LABEL[r.type] ?? r.type}</Td>
                  <Td><Pill status={r.status} /></Td>
                  <Td><Btn variant="ghost" size="sm" title="Download PDF" onClick={() => openBlob(`/sales-docs/challans/${r.id}/pdf`, setErr)}><Download className="h-4 w-4" /></Btn></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={page} pageSize={PAGE_SIZE} total={listTotal} onPage={setPage} />
      </SectionCard>
    </div>
  );
};

const TABS = [
  { key: 'credit', label: (<span className="flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Credit notes</span>) },
  { key: 'debit', label: (<span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Debit notes</span>) },
  { key: 'challan', label: (<span className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> Challan & packing slip</span>) },
] as const;

const SalesDocuments: React.FC = () => {
  const [tab, setTab] = useState<string>('credit');
  return (
    <Page>
      <PageHeader
        icon={FileText}
        title={
          <span className="inline-flex items-center gap-2">
            Credit / Debit Notes &amp; Challans
            <InfoTip
              side="right"
              text="A credit note CANCELS part of a sale and reverses its GST. Sending the money back is a separate step."
              where="Refunds ▸ money going back to customers."
            />
          </span>
        }
        description="Take goods back with a GST-correct credit note, bill more with a debit note, or print the papers that travel with a shipment." />
      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'credit' && <NotePanel kind="credit" />}
      {tab === 'debit' && <NotePanel kind="debit" />}
      {tab === 'challan' && <ChallanPanel />}
    </Page>
  );
};

export default SalesDocuments;
