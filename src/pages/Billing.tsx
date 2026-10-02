/**
 * Settings ▸ Billing — what Growcord charges this store.
 *
 * Owner, 2026-10-01: *"for each month's invoice show a proper invoice; a list of
 * orders and the GST charged, taxable value and billing value for each order
 * number in a different PDF."* The page used to show an eight-character id, a
 * dash for the period and a dash for the commission, with nothing to download.
 *
 * Every figure here is the server's. An invoice row is the invoice's own lines
 * (`summary`); the order list is `GET /billing/invoices/:id`, which also says
 * whether the list adds up to the invoice; the two documents are PDFs the
 * server prints — the numbered tax invoice from Growcord's books, and the
 * order-wise statement behind it.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, ListOrdered, Loader2, Search } from 'lucide-react';
import { billingAPI, blobErrorMessage } from '../services/api';
import StatusBadge from '../components/order/StatusBadge';
import { formatDay } from '../utils/date';
import InfoTip from '@/components/common/InfoTip';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { saveBlob } from '@/lib/saveBlob';
import { fmtRupees } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface FeeLine {
  type: string; description: string; base: number | null; rate_percent: number | null;
  orders: number | null; units: number | null; amount: number;
}
interface InvoiceSummary {
  id: string; reference: string; invoice_number: string;
  period: { from: string | null; to: string | null; label: string };
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  due_date?: string | null; paid_at?: string | null; created_at?: string | null;
  orders: number; gross_sales: number; commission_base: number;
  commission: number; messaging: number; fixed_fee: number; setup_fee: number;
  fees_subtotal: number; gst: number; cgst: number; sgst: number; igst: number;
  gst_rate: number | null; supply: string | null; total: number;
  lines: FeeLine[];
  tax_invoice: { number: string | null; date: string | null; status: string; available: boolean } | null;
  /** Earlier tax invoices for this bill that were cancelled (a correction re-issued it). */
  cancelled?: Array<{ number: string; date: string | null; cancelled_on: string | null; reason: string | null; total: number }>;
}

/**
 * One line of the register: a bill under its current tax invoice, or a tax
 * invoice that was cancelled. Listed by SERIAL number, so a cancelled number
 * sits in its own place with what replaced it, instead of simply vanishing.
 */
type RegisterRow =
  | { kind: 'bill'; key: string; serial: number; inv: InvoiceSummary }
  | { kind: 'cancelled'; key: string; serial: number; inv: InvoiceSummary; c: NonNullable<InvoiceSummary['cancelled']>[number] };

const serialOf = (n?: string | null) => {
  const m = String(n ?? '').match(/(\d+)$/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};
interface OrderLine {
  order_id: string; order_number: string; sold_on: string | null; delivered_on: string | null;
  channel_label: string; tier_label: string;
  billing_value: number; order_gst: number; taxable_value: number; refunded: number;
  commission_base: number; rate_percent: number; commission: number; commission_gst: number; charge: number;
}
interface Statement {
  invoice: InvoiceSummary;
  orders: OrderLine[];
  totals: {
    orders: number; billing_value: number; order_gst: number; taxable_value: number; refunded: number;
    commission_base: number; commission: number; commission_gst: number; charge: number;
  };
  tie_out: { commission_on_invoice: number; commission_from_orders: number; difference: number; exact: boolean; note: string | null };
  withheld: string[];
}
interface Money { orders: number; taxable_base: number; commission: number; gst: number; total: number }
interface Usage {
  totalDue: number; overdue: number; openInvoices: number;
  commission?: { ready: Money; in_progress: Money };
  messaging?: {
    units: number; amount: number;
    not_charged?: { own_account: number; account_not_recorded: number; switched_off: number };
  } | null;
  rates?: { gst: number } | null;
}

const PAGE = 50;
const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)}%`;
const day = (iso?: string | null) => (iso ? formatDay(`${String(iso).slice(0, 10)}T12:00:00`) : '—');
/** dd/mm/yy — the order table has fourteen columns and no room for a long date. */
const shortDay = (iso?: string | null) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '—';
};
/** A figure without its ₹ — the column header carries the symbol. */
const num = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DENSE = 'px-2 py-1.5 text-[12.5px] whitespace-nowrap';
const DENSE_NUM = `${DENSE} text-right tabular-nums`;
/** Headers may wrap onto two lines; the figures under them may not. */
const DENSE_HEAD = 'px-2 py-1.5 whitespace-normal leading-tight align-bottom';
const DENSE_HEAD_NUM = `${DENSE_HEAD} text-right`;

/** The order list as a spreadsheet — the same columns the table and the PDF show. */
const ORDER_CSV: CsvColumn<OrderLine>[] = [
  { key: 'order_number', label: 'Order no.' },
  { key: 'sold_on', label: 'Order date', format: (o) => o.sold_on ?? '' },
  { key: 'delivered_on', label: 'Delivered', format: (o) => o.delivered_on ?? '' },
  { key: 'channel_label', label: 'Channel' },
  { key: 'tier_label', label: 'Price book' },
  { key: 'billing_value', label: 'Billing value', format: (o) => o.billing_value.toFixed(2) },
  { key: 'order_gst', label: 'GST charged', format: (o) => o.order_gst.toFixed(2) },
  { key: 'taxable_value', label: 'Taxable value', format: (o) => o.taxable_value.toFixed(2) },
  { key: 'refunded', label: 'Refunded', format: (o) => o.refunded.toFixed(2) },
  { key: 'commission_base', label: 'Commission charged on', format: (o) => o.commission_base.toFixed(2) },
  { key: 'rate_percent', label: 'Rate %', format: (o) => String(o.rate_percent) },
  { key: 'commission', label: 'Commission', format: (o) => o.commission.toFixed(2) },
  { key: 'commission_gst', label: 'GST on commission', format: (o) => o.commission_gst.toFixed(2) },
  { key: 'charge', label: 'Total charge', format: (o) => o.charge.toFixed(2) },
];

function Tile({ label, value, sub, tone, tip }: { label: string; value: string; sub?: string; tone?: 'warn' | 'plain'; tip?: string }) {
  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${tone === 'warn' ? 'border-l-4 border-l-warn' : ''}`}>
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}{tip && <InfoTip text={tip} />}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs leading-snug text-gray-500">{sub}</div>}
    </div>
  );
}

/** The orders behind one invoice, with its own search, paging and exports. */
function InvoiceDetail({ invoice, onDownload, busy }: {
  invoice: InvoiceSummary;
  onDownload: (kind: 'tax' | 'orders', inv: InvoiceSummary) => void;
  busy: string | null;
}) {
  const [st, setSt] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let live = true;
    billingAPI.getInvoiceStatement(invoice.id)
      .then((d) => { if (live) setSt(d as Statement); })
      .catch((e: any) => { if (live) setError(e?.response?.data?.message || 'The order list could not be loaded.'); });
    return () => { live = false; };
  }, [invoice.id]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = st?.orders ?? [];
    return needle
      ? rows.filter((o) => [o.order_number, o.channel_label, o.tier_label, o.sold_on, o.delivered_on]
        .some((v) => String(v ?? '').toLowerCase().includes(needle)))
      : rows;
  }, [st, q]);
  useEffect(() => { setPage(0); }, [q]);

  if (error) return <p className="px-4 py-6 text-sm text-bad-ink">{error}</p>;
  if (!st) {
    return <p className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading the orders on this invoice…</p>;
  }

  const t = st.totals;
  const showRefunds = t.refunded > 0 || Math.abs(t.taxable_value - t.commission_base) >= 0.005;
  const showGst = invoice.gst > 0;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const rows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const gstLabel = invoice.supply === 'intra' ? 'CGST + SGST' : invoice.supply === 'inter' ? 'IGST' : 'GST';

  return (
    <div className="space-y-5 bg-gray-50/60 px-4 py-5" data-invoice-detail>
      {/* What the invoice charges, line by line */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>On this invoice</TableHead>
                <TableHead className="text-right">Charged on</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-normal">{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.base != null ? fmtRupees(l.base) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.rate_percent != null ? pct(l.rate_percent) : '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtRupees(l.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Fees before GST</TableCell>
                <TableCell className="text-right tabular-nums">{fmtRupees(invoice.fees_subtotal)}</TableCell>
              </TableRow>
              {showGst && (
                <TableRow>
                  <TableCell colSpan={3} className="font-normal">
                    {gstLabel}{invoice.gst_rate != null ? ` @ ${pct(invoice.gst_rate)}` : ''} on the fees
                    {invoice.supply === 'intra' && ` (CGST ${fmtRupees(invoice.cgst)} + SGST ${fmtRupees(invoice.sgst)})`}
                  </TableCell>
                  <TableCell className="text-right font-normal tabular-nums">{fmtRupees(invoice.gst)}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={3}>Invoice total</TableCell>
                <TableCell className="text-right tabular-nums">{fmtRupees(invoice.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className="min-w-0 rounded-lg border bg-white p-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-gray-500">Orders billed</dt><dd className="text-right font-medium tabular-nums">{t.orders || invoice.orders}</dd>
            <dt className="text-gray-500">Billing value (with GST)</dt><dd className="text-right tabular-nums">{fmtRupees(t.orders ? t.billing_value : invoice.gross_sales)}</dd>
            <dt className="text-gray-500">GST charged to shoppers</dt><dd className="text-right tabular-nums">{fmtRupees(t.order_gst)}</dd>
            <dt className="text-gray-500">Taxable value</dt><dd className="text-right tabular-nums">{fmtRupees(t.taxable_value)}</dd>
            {showRefunds && (<><dt className="text-gray-500">Charged on, after refunds</dt><dd className="text-right tabular-nums">{fmtRupees(t.commission_base)}</dd></>)}
          </dl>
          <p className={`mt-3 border-t pt-3 text-xs ${st.tie_out.exact ? 'text-good-ink' : 'text-warn-ink'}`} data-tie-out>
            {st.orders.length === 0
              ? (st.tie_out.note ?? st.withheld[0] ?? 'This invoice carries no order-based commission.')
              : st.tie_out.exact
                ? 'The order list adds up to the invoice exactly.'
                : `The order list differs from the invoice by ${fmtRupees(Math.abs(st.tie_out.difference))}. ${st.tie_out.note ?? ''}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!invoice.tax_invoice?.available || busy === `tax:${invoice.id}`} onClick={() => onDownload('tax', invoice)}>
              <FileText className="size-3.5" /> Tax invoice (PDF)
            </Button>
            <Button size="sm" variant="outline" disabled={busy === `orders:${invoice.id}`} onClick={() => onDownload('orders', invoice)}>
              <ListOrdered className="size-3.5" /> Order list (PDF)
            </Button>
          </div>
        </div>
      </div>

      {/* Order by order */}
      {st.orders.length > 0 && (
        <div className="min-w-0 rounded-lg border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Orders on this invoice</h3>
              <p className="text-xs text-gray-500">
                Commission is charged on an order’s taxable value: what the shopper was billed, less the GST inside it and any refund.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an order…" className="h-8 w-48 pl-8 text-sm" aria-label="Find an order" />
              </div>
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`growcord-orders-${invoice.invoice_number}`, ORDER_CSV, shown)}>
                <Download className="size-3.5" /> CSV
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={DENSE_HEAD}>Order no.</TableHead>
                <TableHead className={DENSE_HEAD}>Ordered</TableHead>
                <TableHead className={DENSE_HEAD}>Delivered</TableHead>
                <TableHead className={DENSE_HEAD}>Channel</TableHead>
                <TableHead className={DENSE_HEAD}>Price book</TableHead>
                <TableHead className={DENSE_HEAD_NUM}>Billing value ₹</TableHead>
                <TableHead className={DENSE_HEAD_NUM}>GST charged ₹</TableHead>
                <TableHead className={DENSE_HEAD_NUM}>Taxable value ₹</TableHead>
                {showRefunds && <TableHead className={DENSE_HEAD_NUM}>Refunded ₹</TableHead>}
                {showRefunds && <TableHead className={DENSE_HEAD_NUM}>Charged on ₹</TableHead>}
                <TableHead className={DENSE_HEAD_NUM}>Rate</TableHead>
                <TableHead className={DENSE_HEAD_NUM}>Commission ₹</TableHead>
                {showGst && <TableHead className={DENSE_HEAD_NUM}>GST on it ₹</TableHead>}
                {showGst && <TableHead className={DENSE_HEAD_NUM}>Total ₹</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.order_id} data-order-row>
                  <TableCell className={`${DENSE} font-medium`}>{o.order_number}</TableCell>
                  <TableCell className={DENSE}>{shortDay(o.sold_on)}</TableCell>
                  <TableCell className={DENSE}>{shortDay(o.delivered_on)}</TableCell>
                  <TableCell className={DENSE}>{o.channel_label}</TableCell>
                  <TableCell className={DENSE}>{o.tier_label}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(o.billing_value)}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(o.order_gst)}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(o.taxable_value)}</TableCell>
                  {showRefunds && <TableCell className={DENSE_NUM}>{o.refunded ? num(o.refunded) : '—'}</TableCell>}
                  {showRefunds && <TableCell className={DENSE_NUM}>{num(o.commission_base)}</TableCell>}
                  <TableCell className={DENSE_NUM}>{pct(o.rate_percent)}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(o.commission)}</TableCell>
                  {showGst && <TableCell className={DENSE_NUM}>{num(o.commission_gst)}</TableCell>}
                  {showGst && <TableCell className={`${DENSE_NUM} font-medium`}>{num(o.charge)}</TableCell>}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={14} className="py-6 text-center text-gray-500">No order matches “{q}”.</TableCell></TableRow>
              )}
            </TableBody>
            {!q && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className={DENSE}>{t.orders} order{t.orders === 1 ? '' : 's'}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(t.billing_value)}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(t.order_gst)}</TableCell>
                  <TableCell className={DENSE_NUM}>{num(t.taxable_value)}</TableCell>
                  {showRefunds && <TableCell className={DENSE_NUM}>{num(t.refunded)}</TableCell>}
                  {showRefunds && <TableCell className={DENSE_NUM}>{num(t.commission_base)}</TableCell>}
                  <TableCell className={DENSE} />
                  <TableCell className={DENSE_NUM}>{num(t.commission)}</TableCell>
                  {showGst && <TableCell className={DENSE_NUM}>{num(t.commission_gst)}</TableCell>}
                  {showGst && <TableCell className={DENSE_NUM}>{num(t.charge)}</TableCell>}
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-500">
              <span>Showing {page * PAGE + 1}–{Math.min(shown.length, page * PAGE + PAGE)} of {shown.length}</span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page + 1} of {pages}</span>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Billing() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([billingAPI.getInvoices(), billingAPI.getUsage({ period: 'current' })])
      .then(([inv, use]) => {
        if (!live) return;
        const list: any[] = Array.isArray(inv) ? inv : inv?.invoices ?? [];
        setInvoices(list.map((i) => i.summary).filter(Boolean));
        setUsage(use as Usage);
      })
      .catch((e: any) => { if (live) setError(e?.response?.data?.message || e?.response?.data?.error?.message || 'Billing could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const download = useCallback(async (kind: 'tax' | 'orders', inv: InvoiceSummary) => {
    setBusy(`${kind}:${inv.id}`);
    setError(null);
    try {
      const blob = kind === 'tax' ? await billingAPI.downloadTaxInvoice(inv.id) : await billingAPI.downloadOrderStatement(inv.id);
      saveBlob(blob, kind === 'tax' ? `growcord-tax-invoice-${inv.invoice_number}.pdf` : `growcord-orders-${inv.invoice_number}.pdf`);
    } catch (e) {
      setError(await blobErrorMessage(e, kind === 'tax' ? 'The tax invoice could not be downloaded.' : 'The order list could not be downloaded.'));
    } finally { setBusy(null); }
  }, []);

  const shown = useMemo(() => invoices.filter((inv) => {
    if (statusFilter && statusFilter !== 'cancelled' && inv.status !== statusFilter) return false;
    const q = find.trim().toLowerCase();
    if (!q) return true;
    return [inv.invoice_number, inv.reference, inv.period.label, inv.status, ...(inv.cancelled ?? []).map((c) => c.number)]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  }), [invoices, find, statusFilter]);
  /** The register in serial order, newest number first; a bill not yet numbered sits on top. */
  const register = useMemo<RegisterRow[]>(() => {
    const rows: RegisterRow[] = [];
    for (const inv of shown) {
      if (statusFilter !== 'cancelled') {
        rows.push({ kind: 'bill', key: inv.id, serial: inv.tax_invoice?.available ? serialOf(inv.tax_invoice.number) : Number.POSITIVE_INFINITY, inv });
      }
      for (const c of inv.cancelled ?? []) rows.push({ kind: 'cancelled', key: `${inv.id}:${c.number}`, serial: serialOf(c.number), inv, c });
    }
    return rows.sort((a, b) => (b.serial - a.serial) || 0);
  }, [shown, statusFilter]);
  /** A waived bill was never charged, so the totals row does not add it up. */
  const charged = shown.filter((i) => i.status !== 'waived');
  const waived = shown.length - charged.length;
  const cancelledCount = register.filter((r) => r.kind === 'cancelled').length;
  const sum = (k: 'commission' | 'gst' | 'total' | 'orders') => charged.reduce((t, i) => t + Number(i[k] ?? 0), 0);
  const otherFees = (i: InvoiceSummary) => i.messaging + i.fixed_fee + i.setup_fee;
  const showOther = shown.some((i) => otherFees(i) > 0);

  const ready = usage?.commission?.ready;
  const progress = usage?.commission?.in_progress;
  const msg = usage?.messaging;
  const notCharged = msg?.not_charged ? msg.not_charged.own_account + msg.not_charged.switched_off + msg.not_charged.account_not_recorded : 0;

  return (
    <div className="space-y-6" data-billing-page>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">What Growcord charges you</h1>
        <p className="mt-1 text-sm text-gray-500">
          One invoice a month, raised on the 1st for the month before. Each has a tax invoice and an order-by-order list.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad-ink" role="alert">
          <span>{error}</span>
          <button className="text-base leading-none" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-billing-tiles>
            <Tile
              label="Due now" value={fmtRupees(usage?.totalDue ?? 0)} tone={(usage?.totalDue ?? 0) > 0 ? 'warn' : 'plain'}
              sub={(usage?.openInvoices ?? 0) === 0 ? 'Nothing is outstanding.'
                : `${usage!.openInvoices} open invoice${usage!.openInvoices === 1 ? '' : 's'}${(usage?.overdue ?? 0) > 0 ? ` · ${fmtRupees(usage!.overdue)} overdue` : ''}`}
            />
            <Tile
              label="Next invoice so far" value={fmtRupees(ready?.total ?? 0)}
              tip="Orders that are delivered and past their return window, and not yet on an invoice. This is what the next invoice will charge."
              sub={ready?.orders ? `${ready.orders} order${ready.orders === 1 ? '' : 's'} · commission ${fmtRupees(ready.commission)} + GST ${fmtRupees(ready.gst)}` : 'No order is ready to bill yet.'}
            />
            <Tile
              label="Still in progress" value={fmtRupees(progress?.commission ?? 0)}
              tip="Commission on orders that are placed, shipped or delivered but still inside the return window. It is charged only once the window closes, and not at all if the order is cancelled or returned."
              sub={progress?.orders ? `${progress.orders} order${progress.orders === 1 ? '' : 's'} awaiting delivery or the return window` : 'No order is in progress.'}
            />
            <Tile
              label="Messages this month" value={fmtRupees(msg?.amount ?? 0)}
              tip="Order updates, OTPs and cart reminders are charged only when they go out on a Growcord account. Messages sent on your own SMS, WhatsApp or email accounts are not charged."
              sub={(msg?.amount ?? 0) > 0 ? `${msg!.units} message${msg!.units === 1 ? '' : 's'} sent on Growcord accounts`
                : notCharged > 0 ? `${notCharged.toLocaleString('en-IN')} sent on your own accounts — not charged` : 'Nothing to charge.'}
            />
          </div>

          <div className="rounded-lg border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">Invoices</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an invoice…" className="h-8 w-44 text-sm" aria-label="Find an invoice" />
                <select
                  className="h-8 rounded-md border border-input bg-surface px-2 text-sm"
                  value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                  <option value="">Any status</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="waived">Waived</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {register.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                {invoices.length === 0 ? 'No invoices yet. The first is raised on the 1st of the month after your first billable orders.' : 'No invoice matches those filters.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Invoice</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    {showOther && <TableHead className="text-right">Other fees</TableHead>}
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.map((row) => {
                    if (row.kind === 'cancelled') {
                      const { c, inv } = row;
                      const replacedBy = inv.tax_invoice?.available ? inv.tax_invoice.number : null;
                      return (
                        <TableRow key={row.key} data-cancelled-row className="text-gray-400 hover:bg-transparent">
                          <TableCell />
                          <TableCell>
                            <span className="font-semibold text-gray-500 line-through">{c.number}</span>
                            {c.date && <span className="block text-xs">dated {day(c.date)}</span>}
                          </TableCell>
                          <TableCell>{inv.period.label || '—'}</TableCell>
                          <TableCell colSpan={showOther ? 4 : 3} className="whitespace-normal text-xs leading-snug">
                            Cancelled{c.cancelled_on ? ` on ${day(c.cancelled_on)}` : ''}{replacedBy ? `, replaced by ${replacedBy}` : ''}.
                            {c.reason && <span className="block text-gray-500">{c.reason}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums line-through">{fmtRupees(c.total)}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell><StatusBadge status="cancelled" type="billing" /></TableCell>
                          <TableCell className="text-right text-xs">Not payable</TableCell>
                        </TableRow>
                      );
                    }
                    const { inv } = row;
                    const isOpen = open === inv.id;
                    return (
                      <Fragment key={inv.id}>
                        <TableRow
                          data-invoice-row className="cursor-pointer"
                          onClick={() => setOpen(isOpen ? null : inv.id)}>
                          <TableCell className="pr-0 text-gray-400">
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-gray-900">{inv.invoice_number}</span>
                            {!inv.tax_invoice?.available && (
                              <span className="block text-xs text-gray-400">{inv.status === 'waived' ? 'No tax invoice (waived)' : 'Tax invoice not issued yet'}</span>
                            )}
                            {inv.tax_invoice?.available && inv.tax_invoice.date && (
                              <span className="block text-xs text-gray-400">dated {day(inv.tax_invoice.date)}</span>
                            )}
                          </TableCell>
                          <TableCell>{inv.period.label || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{inv.orders || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtRupees(inv.commission)}</TableCell>
                          {showOther && <TableCell className="text-right tabular-nums">{otherFees(inv) ? fmtRupees(otherFees(inv)) : '—'}</TableCell>}
                          <TableCell className="text-right tabular-nums">{inv.gst ? fmtRupees(inv.gst) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{fmtRupees(inv.total)}</TableCell>
                          <TableCell>{inv.due_date ? formatDay(inv.due_date) : '—'}</TableCell>
                          <TableCell>
                            <StatusBadge status={inv.status} type="billing" />
                            {inv.status === 'paid' && inv.paid_at && <span className="block text-xs text-gray-400">{formatDay(inv.paid_at)}</span>}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm" variant="outline" title={inv.tax_invoice?.available ? 'Download the tax invoice' : 'No tax invoice was issued for this bill'}
                                disabled={!inv.tax_invoice?.available || busy === `tax:${inv.id}`} onClick={() => download('tax', inv)}>
                                {busy === `tax:${inv.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />} Tax invoice
                              </Button>
                              <Button
                                size="sm" variant="outline" title="Download the order-by-order list"
                                disabled={busy === `orders:${inv.id}`} onClick={() => download('orders', inv)}>
                                {busy === `orders:${inv.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <ListOrdered className="size-3.5" />} Order list
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={showOther ? 11 : 10} className="p-0">
                              {/* w-0 min-w-full: a wide order table inside this cell must scroll in
                                  its own box, never widen the invoice table (and the page) around it. */}
                              <div className="w-0 min-w-full">
                                <InvoiceDetail invoice={inv} onDownload={download} busy={busy} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell />
                    <TableCell colSpan={2}>
                      {charged.length} invoice{charged.length === 1 ? '' : 's'}
                      {waived > 0 && <span className="font-normal text-gray-500"> · totals leave out {waived} waived</span>}
                      {cancelledCount > 0 && <span className="font-normal text-gray-500"> · {cancelledCount} cancelled, not counted</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sum('orders') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRupees(sum('commission'))}</TableCell>
                    {showOther && <TableCell className="text-right tabular-nums">{fmtRupees(charged.reduce((t, i) => t + otherFees(i), 0))}</TableCell>}
                    <TableCell className="text-right tabular-nums">{fmtRupees(sum('gst'))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRupees(sum('total'))}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
