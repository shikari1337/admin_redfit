import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, StatCard, StatGrid, StatusChip, Chip, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, inrMinor,
  FilterBar, Field, SelectInput, TextInput,
  ExportMenu, Pagination, DrillLink, AttachmentPanel, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * Payments Received — the accountant's AR workflow that Zoho has and we lacked:
 * record a customer payment as a first-class RECEIPT, then APPLY it across one or
 * more open orders, or leave it on account as an ADVANCE. Each receipt posts a
 * balanced GL journal (Dr Bank/Cash · Cr Accounts Receivable) automatically; the
 * storefront's order-level payment capture is untouched and keeps working.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const MODES = [
  { key: 'bank', label: 'Bank transfer' },
  { key: 'upi', label: 'UPI' },
  { key: 'razorpay', label: 'Razorpay' },
  { key: 'cash', label: 'Cash' },
  { key: 'adjustment', label: 'Adjustment' },
];
const toMinor = (rupees: string | number) => Math.max(0, Math.round(Number(rupees || 0) * 100));

const STATUS_TONE = { open: 'amber', partial: 'amber', allocated: 'green', void: 'neutral' } as const;
const statusLabel = (s: string) =>
  s === 'open' ? 'Advance' : s === 'partial' ? 'Part-applied' : s === 'allocated' ? 'Applied' : s === 'void' ? 'Void' : s;

// Client CSV of the visible receipts page. Money cells are minor units (→ inrMinor).
const receiptCsvCols: CsvColumn<any>[] = [
  { key: 'receipt_number', label: 'Receipt #' },
  { key: 'receipt_date', label: 'Date' },
  { key: 'customer_name', label: 'Customer', format: (r) => r.customer_name ?? '' },
  { key: 'mode', label: 'Method' },
  { key: 'reference', label: 'Reference', format: (r) => r.reference ?? '' },
  { key: 'amount_minor', label: 'Amount', money: true },
  { key: 'allocated_minor', label: 'Applied', money: true },
  { key: 'unallocated_minor', label: 'Unapplied', money: true },
  { key: 'status', label: 'Status' },
  { key: 'journal_number', label: 'Journal #', format: (r) => r.journal_number ?? '' },
];

interface CustOpt { id: string; name: string | null; outstanding: number; }

const blankForm = () => ({
  receiptDate: todayStr(),
  customerId: '' as string,
  customerName: '' as string,
  amountRupees: '' as string,
  mode: 'bank' as string,
  bankAccountCode: '' as string,   // '' = derive from mode
  reference: '' as string,
  notes: '' as string,
});

const PaymentsReceived: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const canRead = hasPerm('accounting.read');

  const [tab, setTab] = useState<'receipts' | 'advances'>('receipts');
  const [error, setError] = useState('');

  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [custs, setCusts] = useState<CustOpt[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [allocFor, setAllocFor] = useState<any | null>(null);

  // Server-side filters (date range + status via useListControls; mode + customer
  // are separate state) and server pagination — all supported by listReceipts.
  const lc = useListControls({ pageSize: 25 });
  const [mode, setMode] = useState('');
  const [custFilter, setCustFilter] = useState('');

  const load = async () => {
    try {
      const params: Record<string, any> = { limit: lc.pageSize, offset: (lc.page - 1) * lc.pageSize };
      if (tab === 'advances') params.advancesOnly = 'true';
      if (lc.from) params.from = lc.from;
      if (lc.to) params.to = lc.to;
      if (lc.status) params.status = lc.status;
      if (mode) params.mode = mode;
      if (custFilter) params.customerId = custFilter;
      const res = await api.get('/receipts', { params });
      const d = payload<any>(res);
      setRows(d.rows ?? []);
      setSummary(d.summary ?? null);
      setTotal(Number(d.total ?? (d.rows?.length ?? 0)));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, lc.from, lc.to, lc.status, mode, custFilter, lc.page, lc.pageSize]);
  useEffect(() => {
    // Customers who owe money — the natural source for "record a payment".
    api.get('/ar/outstanding').then((r) => {
      const d = payload<any>(r);
      setCusts((d.customers ?? []).map((c: any) => ({ id: c.customer_id, name: c.name, outstanding: c.outstanding })));
    }).catch(() => {});
  }, []);

  const submit = async () => {
    setError(''); setSaving(true);
    try {
      await api.post('/receipts', {
        receiptDate: form.receiptDate,
        customerId: form.customerId || null,
        customerName: form.customerName || null,
        amountRupees: Number(form.amountRupees) || 0,
        mode: form.mode,
        bankAccountCode: form.bankAccountCode || null,
        reference: form.reference || null,
        notes: form.notes || null,
      });
      setForm(blankForm()); setShowNew(false);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  const voidReceipt = async (id: string, number: string) => {
    setError('');
    if (!window.confirm(`Void receipt ${number}? This reverses its accounting journal and unlinks any applied orders.`)) return;
    try { await api.post(`/receipts/${id}/void`, { voidDate: todayStr() }); await load(); if (allocFor?.id === id) setAllocFor(null); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const advanceTotal = summary ? inrMinor(summary.unallocated_minor) : '—';

  return (
    <Page>
      <PageHeader
        title="Payments Received"
        description="Record customer payments as receipts, apply them across open orders, or hold them as advances. Every receipt posts a balanced accounting journal (Dr Bank/Cash · Cr Accounts Receivable) automatically."
        actions={
          <div className="flex items-end gap-2">
            <ExportMenu filename="payments-received" columns={receiptCsvCols} rows={rows} canExport={canRead} />
            {canPost && <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Record payment'}</Btn>}
          </div>
        }
      />

      <TabBar
        tabs={[{ key: 'receipts', label: 'All receipts' }, { key: 'advances', label: 'Advances (unapplied)' }]}
        active={tab}
        onChange={(k) => { setError(''); setAllocFor(null); lc.setPage(1); setTab(k as any); }}
      />

      <FilterBar>
        <Field label="From"><TextInput type="date" value={lc.from} onChange={(e) => lc.setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={lc.to} onChange={(e) => lc.setTo(e.target.value)} /></Field>
        <Field label="Customer">
          <SelectInput value={custFilter} onChange={(e) => { setCustFilter(e.target.value); lc.setPage(1); }}>
            <option value="">All customers</option>
            {custs.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
          </SelectInput>
        </Field>
        <Field label="Method">
          <SelectInput value={mode} onChange={(e) => { setMode(e.target.value); lc.setPage(1); }}>
            <option value="">Any method</option>
            {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Status">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="open">Advance (unapplied)</option>
            <option value="partial">Part-applied</option>
            <option value="allocated">Applied</option>
            <option value="void">Void</option>
          </SelectInput>
        </Field>
      </FilterBar>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showNew && canPost && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-gray-600">Date</span>
              <input type="date" value={form.receiptDate}
                onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-gray-600">Customer</span>
              <select value={form.customerId || '__other'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__other') { setForm((f) => ({ ...f, customerId: '', customerName: '' })); return; }
                  const c = custs.find((x) => x.id === v);
                  setForm((f) => ({ ...f, customerId: v, customerName: c?.name ?? '' }));
                }}
                className="w-full rounded border px-2 py-1.5">
                <option value="__other">— Advance / other (enter name) —</option>
                {custs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)} · owes {c.outstanding.toFixed(2)}</option>
                ))}
              </select>
            </label>
            {!form.customerId && (
              <label className="space-y-1 sm:col-span-2">
                <span className="text-gray-600">Customer name (for an unlinked / advance receipt)</span>
                <input placeholder="Walk-in / paid on account" value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  className="w-full rounded border px-2 py-1.5" />
              </label>
            )}
            <label className="space-y-1">
              <span className="text-gray-600">Amount received (₹) *</span>
              <input type="number" min={0} step="0.01" value={form.amountRupees}
                onChange={(e) => setForm((f) => ({ ...f, amountRupees: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Method</span>
              <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
                className="w-full rounded border px-2 py-1.5">
                {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Deposit to</span>
              <select value={form.bankAccountCode} onChange={(e) => setForm((f) => ({ ...f, bankAccountCode: e.target.value }))}
                className="w-full rounded border px-2 py-1.5">
                <option value="">Auto (from method)</option>
                <option value="1010">Bank (1010)</option>
                <option value="1000">Cash (1000)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Reference (UTR / cheque / txn id)</span>
              <input placeholder="Optional" value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="space-y-1 sm:col-span-2 lg:col-span-3">
              <span className="text-gray-600">Notes</span>
              <input placeholder="Optional" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              The receipt is created as an unapplied advance — use <b>Apply</b> on its row to spread it across the customer's open orders.
            </p>
            <Btn onClick={submit} disabled={saving || !(Number(form.amountRupees) > 0)}>
              {saving ? 'Saving…' : 'Record payment'}
            </Btn>
          </div>
        </div>
      )}

      {summary && (
        <StatGrid cols={3}>
          <StatCard label="Receipts (this view)" value={summary.count ?? 0} />
          <StatCard label="Total received" value={inrMinor(summary.amount_minor)} />
          <StatCard label="Unapplied advances" value={advanceTotal} tone={Number(summary.unallocated_minor) > 0 ? 'warn' : 'good'} />
        </StatGrid>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Receipt</Th><Th>Date</Th><Th>Customer</Th><Th>Method</Th>
            <Th num>Amount</Th><Th num>Applied</Th><Th num>Unapplied</Th><Th>Status</Th>
            {canPost && <Th num>Action</Th>}
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={canPost ? 9 : 8}>
              {tab === 'advances' ? 'No unapplied advances.' : 'No receipts recorded yet.'}
            </EmptyRow>}
            {rows.map((r: any) => (
              <Tr key={r.id}>
                <Td className="font-mono">{r.receipt_number}</Td>
                <Td>{r.receipt_date}</Td>
                <Td>{r.customer_name ?? '—'}</Td>
                <Td className="capitalize">{r.mode}{r.reference ? <span className="block text-xs text-gray-400">{r.reference}</span> : null}</Td>
                <Td num className="font-medium">{inrMinor(r.amount_minor)}</Td>
                <Td num>{inrMinor(r.allocated_minor)}</Td>
                <Td num>
                  {Number(r.unallocated_minor) > 0 && r.status !== 'void'
                    ? <Chip tone="amber">{inrMinor(r.unallocated_minor)}</Chip>
                    : <span className="text-gray-400">—</span>}
                </Td>
                <Td><StatusChip status={r.status} tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]} label={statusLabel(r.status)} /></Td>
                {canPost && (
                  <Td num>
                    {r.status !== 'void' ? (
                      <span className="whitespace-nowrap">
                        {r.customer_id && (
                          <>
                            <button onClick={() => setAllocFor(allocFor?.id === r.id ? null : r)}
                              className="font-medium text-gray-900 hover:underline">
                              {allocFor?.id === r.id ? 'Close' : 'Apply'}
                            </button>
                            <span className="text-gray-300"> · </span>
                          </>
                        )}
                        <button onClick={() => voidReceipt(r.id, r.receipt_number)} className="font-medium text-red-600 hover:underline">Void</button>
                      </span>
                    ) : '—'}
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={total} onPage={lc.setPage} onPageSize={lc.setPageSize} />

      {allocFor && (
        <AllocatePanel receipt={allocFor} onDone={async () => { setAllocFor(null); await load(); }} onError={setError} />
      )}
    </Page>
  );
};

// ── Allocate panel ─────────────────────────────────────────────────────────────
// Distribute a receipt across the customer's open orders. The per-order headroom
// EXCLUDES this receipt's own current allocation (so re-applying shows true room),
// and remaining = receipt amount − Σ inputs, live. Submitting sends the full set
// (0 removes an order's allocation).
const AllocatePanel: React.FC<{ receipt: any; onDone: () => void; onError: (m: string) => void }> = ({ receipt, onDone, onError }) => {
  const [orders, setOrders] = useState<{ order_id: string; order_no: string | null; order_date: string; maxMinor: number; total_minor: string }[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});   // order_id → rupees
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [openRes, detRes] = await Promise.all([
          api.get('/receipts/open-orders', { params: { customerId: receipt.customer_id } }),
          api.get(`/receipts/${receipt.id}`),
        ]);
        const open = (payload<any>(openRes)?.rows ?? []) as any[];
        const det = payload<any>(detRes);
        const mine: Record<string, string> = {};
        for (const a of det?.allocations ?? []) mine[a.order_id] = a.allocated_minor;
        // Union of the customer's open orders and orders THIS receipt already touches.
        const byId = new Map<string, any>();
        for (const o of open) {
          const current = Number(mine[o.order_id] ?? 0);              // this receipt's current share (already netted out of open)
          byId.set(o.order_id, {
            order_id: o.order_id, order_no: o.order_no, order_date: o.order_date,
            total_minor: o.total_minor,
            maxMinor: Number(o.outstanding_minor) + current,          // outstanding excluding this receipt
          });
        }
        for (const a of det?.allocations ?? []) {
          if (byId.has(a.order_id)) continue;                          // already settled by this receipt → not in open list
          byId.set(a.order_id, {
            order_id: a.order_id, order_no: a.order_no, order_date: a.order_date ?? '',
            total_minor: a.order_total_minor, maxMinor: Number(a.allocated_minor),
          });
        }
        const list = [...byId.values()].sort((x, y) => (x.order_date < y.order_date ? -1 : 1));
        setOrders(list);
        const seed: Record<string, string> = {};
        for (const o of list) if (mine[o.order_id]) seed[o.order_id] = (Number(mine[o.order_id]) / 100).toFixed(2);
        setInputs(seed);
      } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    })();
  }, [receipt.id]);

  const amountMinor = Number(receipt.amount_minor);
  const allocatedMinor = Object.values(inputs).reduce((s, v) => s + toMinor(v), 0);
  const remainingMinor = amountMinor - allocatedMinor;

  const autoFill = () => {
    let rem = amountMinor;
    const next: Record<string, string> = {};
    for (const o of orders) {
      const take = Math.max(0, Math.min(rem, o.maxMinor));
      if (take > 0) next[o.order_id] = (take / 100).toFixed(2);
      rem -= take;
    }
    setInputs(next);
  };

  const submit = async () => {
    onError(''); setSaving(true);
    try {
      const allocations = orders.map((o) => ({ orderId: o.order_id, allocatedRupees: Number(inputs[o.order_id] || 0) }));
      await api.post(`/receipts/${receipt.id}/allocate`, { allocations });
      onDone();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">Apply receipt {receipt.receipt_number}</div>
          <div className="text-xs text-gray-500">{receipt.customer_name ?? 'Customer'} · amount {inrMinor(receipt.amount_minor)}</div>
        </div>
        <Btn variant="outline" onClick={autoFill}>Auto-apply oldest first</Btn>
      </div>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Order</Th><Th>Date</Th><Th num>Order total</Th><Th num>Outstanding</Th><Th num>Apply (₹)</Th>
          </THead>
          <TBody>
            {orders.length === 0 && <EmptyRow colSpan={5}>This customer has no open orders to apply to.</EmptyRow>}
            {orders.map((o) => {
              const over = toMinor(inputs[o.order_id] || 0) > o.maxMinor;
              return (
                <Tr key={o.order_id}>
                  <Td className="font-mono">
                    <DrillLink to={`/orders/${o.order_id}`} title="Open this order">{o.order_no ?? o.order_id.slice(0, 8)}</DrillLink>
                  </Td>
                  <Td>{o.order_date}</Td>
                  <Td num>{inrMinor(o.total_minor)}</Td>
                  <Td num>{inrMinor(String(o.maxMinor))}</Td>
                  <Td num>
                    <input type="number" min={0} step="0.01"
                      value={inputs[o.order_id] ?? ''}
                      onChange={(e) => setInputs((m) => ({ ...m, [o.order_id]: e.target.value }))}
                      className={`w-28 rounded border px-2 py-1 text-right ${over ? 'border-red-400 bg-red-50' : ''}`} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-gray-600">Applying </span><b>{inrMinor(String(allocatedMinor))}</b>
          <span className="text-gray-600"> of </span>{inrMinor(receipt.amount_minor)}
          <span className={`ml-3 ${remainingMinor < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {remainingMinor < 0 ? 'Over by ' : 'Remaining advance '}{inrMinor(String(Math.abs(remainingMinor)))}
          </span>
        </div>
        <Btn onClick={submit} disabled={saving || remainingMinor < 0 || orders.some((o) => toMinor(inputs[o.order_id] || 0) > o.maxMinor)}>
          {saving ? 'Applying…' : 'Apply to orders'}
        </Btn>
      </div>

      <AttachmentPanel
        entityType="payment"
        entityId={receipt.id}
        title="Payment proof"
        description="Attach the bank slip, cheque image or UTR screenshot for this receipt."
      />
    </div>
  );
};

export default PaymentsReceived;
