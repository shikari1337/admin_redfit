/**
 * Dashboard ▸ Money — where the money is, as of today: what customers owe,
 * what is owed to suppliers, refunds waiting, COD still to collect, GST, and
 * Growcord's own invoices.
 *
 * Nothing here re-derives money a server already computes: receivables are
 * /ar/outstanding, payables /ap/ageing, GST the orders' own snapshots via the
 * accounting panel, refunds /refunds/summary. Several of those are already
 * read by the attention board (`feed`), so this tab reuses those answers
 * rather than asking twice. A block that cannot be read says why in one quiet
 * line — never a zero that looks real.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePanelStats, useRangedGet } from '../panelAnalytics/usePanelStats';
import { ChartCard, KpiTile, SplitBar, TimeSeries, Unavailable, ordinalRamp } from '../panelAnalytics/Kit';
import { SERIES } from '../panelAnalytics/vizTheme';
import { fmtMinor, fmtRupees } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { HomeSources } from '../home/useHomeFeed';
import { currentMonthBucket, fyLabel, fyMonths, fyOptions, fyStartYear, fyToDate, monthName, shortDay } from './periods';
import { todayIso } from '@/utils/date';
import { BlockTitle, FilterRow, FySelect, fmtInt, fmtPct, useAllTimeMonthly } from './shared';

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const MONTHLY = { granularity: 'month' };
const NO_RANGE = {};

/** Why a block is empty, in plain words. */
function whyNot(opts: { module?: boolean; perm?: boolean; pending?: boolean; failed?: boolean; moduleName?: string }): string | null {
  if (opts.module === false) return `Not available: the ${opts.moduleName ?? 'accounting'} module is not switched on for this store.`;
  if (opts.perm === false) return 'Not available: your role does not include this.';
  if (opts.failed) return 'Could not be read just now. Try again in a moment.';
  if (opts.pending) return 'Checking…';
  return null;
}

const customerName = (c: any) => c.company || c.name || c.phone || `Customer ${String(c.customer_id ?? '').slice(0, 6)}`;

export const MoneyTab: React.FC<{ feed: HomeSources }> = ({ feed }) => {
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const accountingOn = !modulesLoaded || canAccess('accounting');
  const booksPerm = hasPerm('accounting.read');
  const booksOk = modulesLoaded && canAccess('accounting') && booksPerm;
  const salesRead = hasPerm('orders.read');

  const today = todayIso();
  const currentFy = fyStartYear(today);
  const all = useAllTimeMonthly(salesRead);
  const firstBucket = (all.data?.timeseries ?? []).find((m: any) => m.orders > 0 || m.cancelled > 0)?.bucket ?? null;
  const options = fyOptions(firstBucket);
  const [fy, setFy] = useState(currentFy);

  const ap = useRangedGet<any>('/ap/ageing', NO_RANGE, booksOk);
  // As of today (this FY to date): GST this month + the books' balances today.
  const accNow = usePanelStats<any>('accounting', fyToDate(currentFy), booksOk, MONTHLY);
  // The FY picked for the GST chart (the same request when it is this year).
  const accFy = usePanelStats<any>('accounting', fyToDate(fy), booksOk, MONTHLY);

  // ── receivables (shared with the board) ──
  const ar = feed.receivables;
  const arState = whyNot({
    module: accountingOn, perm: booksPerm,
    pending: feed.pending.includes('Receivables'), failed: feed.failed.includes('Receivables'),
  });
  const arCustomers: any[] = (ar?.customers ?? []).filter((c: any) => n(c.outstanding) > 0.005);
  const arTotal = n(ar?.summary?.total_outstanding);
  const arAge = ar?.summary?.ageing ?? {};
  const ar90 = n(arAge.d90_plus);

  // ── payables ──
  const apState = whyNot({ module: accountingOn, perm: booksPerm, pending: ap.loading && !ap.data, failed: !!ap.error });
  const apVendors: any[] = (ap.data?.vendors ?? []).filter((v: any) => n(v.total_outstanding) > 0.005);
  const apTotal = n(ap.data?.summary?.total_outstanding);
  const apAge = ap.data?.summary?.ageing ?? {};
  const breachedVendors = apVendors.filter((v) => n(v.breached_amount) > 0.005).length;
  const maxDays = n(ap.data?.statutory_max_days) || 45;

  // ── refunds, COD, Growcord bill (shared with the board) ──
  const refundState = whyNot({ perm: salesRead, pending: feed.pending.includes('Refunds'), failed: feed.failed.includes('Refunds') });
  const codState = whyNot({ perm: salesRead, pending: feed.pending.includes('Order queues'), failed: feed.failed.includes('Order queues') });
  const billState = whyNot({ perm: hasPerm('billing.read'), pending: feed.pending.includes('Your Growcord bill'), failed: feed.failed.includes('Your Growcord bill') });

  // ── GST ──
  const gstState = whyNot({ module: accountingOn, perm: booksPerm, pending: accNow.loading && !accNow.data, failed: !!accNow.error });
  const gstNowRow = (accNow.data?.gst_by_month ?? []).find((r: any) => r.bucket === currentMonthBucket());
  const gstNow = gstNowRow ? n(gstNowRow.cgst) + n(gstNowRow.sgst) + n(gstNowRow.igst) : 0;
  const gstByBucket = new Map<string, any>((accFy.data?.gst_by_month ?? []).map((r: any) => [r.bucket, r]));
  const thisMonth = currentMonthBucket();
  const gstRows = fyMonths(fy).map((b) => {
    const r = gstByBucket.get(b);
    const future = b > thisMonth;
    return {
      bucket: b, label: monthName(b), month: monthName(b, true), future,
      taxable: future ? null : n(r?.taxable), cgst: future ? null : n(r?.cgst), sgst: future ? null : n(r?.sgst),
      igst: future ? null : n(r?.igst), total: future ? null : n(r?.cgst) + n(r?.sgst) + n(r?.igst),
      orders: future ? null : n(r?.orders),
    };
  });
  const gstFooter = gstRows.filter((r) => !r.future).reduce((acc: any, r: any) => {
    for (const k of ['taxable', 'cgst', 'sgst', 'igst', 'total', 'orders']) acc[k] = (acc[k] ?? 0) + n(r[k]);
    return acc;
  }, { month: 'Total' });

  // ── from the books (general ledger) ──
  const journals = n(accFy.data?.journals?.journals);
  const pnlBy = new Map<string, any>((accFy.data?.pnl ?? []).map((r: any) => [r.bucket, r]));
  const pnlRows = fyMonths(fy).map((b) => {
    const r = pnlBy.get(b);
    const future = b > thisMonth;
    const income = future ? null : n(r?.income_minor) / 100;
    const expense = future ? null : n(r?.expense_minor) / 100;
    return { label: monthName(b), month: monthName(b, true), income, expense, net: income === null || expense === null ? null : income - expense };
  });
  const pos = accNow.data?.positions_minor;
  const nowJournals = n(accNow.data?.journals?.journals);

  const ramp4 = ordinalRamp(4);
  const dimAcc = accFy.loading && !!accFy.data;

  return (
    <div className="space-y-5" data-tab-panel="money">
      <FilterRow aside={`Figures as of ${shortDay(today, true)} · the year picks the GST and books charts`}>
        <span className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">As of today</span>
        <FySelect value={fy} options={options} onChange={setFy} label="GST and books for" testId="money-fy" />
      </FilterRow>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile testId="money-ar" label="Customers owe you"
          value={arState ? undefined : fmtRupees(arTotal)} unavailable={arState ?? undefined}
          sub={!arState ? (arTotal > 0
            ? `${fmtInt(arCustomers.length)} customers · ${fmtPct(arTotal > 0 ? (ar90 / arTotal) * 100 : 0)} is over 90 days old`
            : 'Nobody owes you anything') : undefined} />
        <KpiTile testId="money-ap" label="You owe suppliers"
          value={apState ? undefined : fmtRupees(apTotal)} unavailable={apState ?? undefined}
          sub={!apState ? (n(ap.data?.summary?.msme_breached_amount) > 0
            ? `${fmtRupees(ap.data.summary.msme_breached_amount)} owed to ${breachedVendors} small suppliers past the ${maxDays}-day limit`
            : `${fmtInt(apVendors.length)} suppliers · no small-supplier bill past ${maxDays} days`) : undefined} />
        <KpiTile testId="money-refunds" label="Refunds waiting for approval"
          value={refundState ? undefined : fmtMinor(feed.refunds?.awaitingApproval?.amountMinor)} unavailable={refundState ?? undefined}
          sub={!refundState ? `${fmtInt(n(feed.refunds?.awaitingApproval?.count))} requests${n(feed.refunds?.readyToSend?.count) ? ` · ${fmtInt(feed.refunds.readyToSend.count)} approved, not sent` : ''}` : undefined} />
        <KpiTile testId="money-cod" label="COD still to collect"
          value={codState ? undefined : fmtRupees(feed.orders?.summary?.cod_value_pending)} unavailable={codState ?? undefined}
          sub={!codState ? `${fmtInt(n(feed.orders?.summary?.cod_orders_pending))} cash-on-delivery orders not delivered yet` : undefined} />
        <KpiTile testId="money-gst" label={`GST charged in ${monthName(thisMonth)}`}
          value={gstState ? undefined : fmtRupees(gstNow)} unavailable={gstState ?? undefined}
          sub={!gstState ? (gstNowRow ? `On ${fmtRupees(gstNowRow.taxable)} taxable, ${fmtInt(gstNowRow.orders)} orders` : 'No order with GST this month yet') : undefined} />
        <KpiTile testId="money-bill" label="Growcord invoices due"
          value={billState ? undefined : fmtRupees(feed.platformBill?.totalDue)} unavailable={billState ?? undefined}
          sub={!billState ? (n(feed.platformBill?.totalDue) > 0
            ? <Link to="/settings/billing" className="text-brand hover:underline">See your invoices</Link>
            : `${fmtInt(n(feed.platformBill?.invoiceCount))} invoices, nothing due`) : undefined} />
      </div>

      {/* Receivables + payables */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="What customers owe, by age" testId="chart-ar"
          sub={arState ? undefined : `${fmtRupees(arTotal)} across ${fmtInt(arCustomers.length)} customers · deeper colour is older · old website history left out`}
          action={!arState ? <Link to="/panel/accounting/receivables" className="text-xs font-medium text-brand hover:underline">Receivables</Link> : undefined}>
          {arState ? <Unavailable>{arState}</Unavailable> : (
            <div className="space-y-4">
              <SplitBar label="Receivables by age" format={(v) => fmtRupees(v)} testId="ar-ageing"
                rows={[
                  { key: 'd0_30', name: '0 to 30 days', value: n(arAge.d0_30), color: ramp4[0] },
                  { key: 'd31_60', name: '31 to 60 days', value: n(arAge.d31_60), color: ramp4[1] },
                  { key: 'd61_90', name: '61 to 90 days', value: n(arAge.d61_90), color: ramp4[2] },
                  { key: 'd90_plus', name: 'Over 90 days', value: ar90, color: ramp4[3] },
                ]} />
              <div>
                <BlockTitle>Owing the most</BlockTitle>
                <ul className="mt-1 divide-y divide-gray-100 text-sm" data-testid="ar-top">
                  {arCustomers.length === 0 && <li className="py-2 text-gray-500">Nobody owes you anything.</li>}
                  {arCustomers.slice(0, 10).map((c: any) => (
                    <li key={c.customer_id}>
                      <Link to={`/customers/${c.customer_id}`} className="group flex items-center justify-between gap-3 py-1.5 hover:bg-gray-50">
                        <span className="min-w-0">
                          <span className="block truncate text-gray-800">{customerName(c)}</span>
                          <span className="block text-xs text-gray-400">
                            {c.oldest_unpaid_age_days !== null && c.oldest_unpaid_age_days !== undefined ? `Oldest unpaid ${fmtInt(c.oldest_unpaid_age_days)} days` : ''}
                            {c.unpaid_count ? ` · ${fmtInt(c.unpaid_count)} unpaid orders` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 tabular-nums text-gray-900">
                          {fmtRupees(c.outstanding)}<ChevronRight aria-hidden className="size-4 text-gray-300 group-hover:text-gray-500" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="What you owe suppliers, by age" testId="chart-ap"
          sub={apState ? undefined : `${fmtRupees(apTotal)} across ${fmtInt(apVendors.length)} suppliers · deeper colour is older`}
          action={!apState ? <Link to="/panel/accounting/payables" className="text-xs font-medium text-brand hover:underline">Payables</Link> : undefined}>
          {apState ? <Unavailable>{apState}</Unavailable> : (
            <div className="space-y-4">
              <SplitBar label="Payables by age" format={(v) => fmtRupees(v)} testId="ap-ageing"
                rows={[
                  { key: 'd0_30', name: '0 to 30 days', value: n(apAge.d0_30), color: ramp4[0] },
                  { key: 'd31_45', name: '31 to 45 days', value: n(apAge.d31_45), color: ramp4[1] },
                  { key: 'd46_90', name: '46 to 90 days', value: n(apAge.d46_90), color: ramp4[2] },
                  { key: 'd90_plus', name: 'Over 90 days', value: n(apAge.d90_plus), color: ramp4[3] },
                ]} />
              <div>
                <BlockTitle>Owed the most</BlockTitle>
                <ul className="mt-1 divide-y divide-gray-100 text-sm" data-testid="ap-top">
                  {apVendors.length === 0 && <li className="py-2 text-gray-500">You owe no supplier anything.</li>}
                  {apVendors.slice(0, 10).map((v: any) => (
                    <li key={v.vendor_id}>
                      <Link to="/panel/accounting/payables" className="group flex items-center justify-between gap-3 py-1.5 hover:bg-gray-50">
                        <span className="min-w-0">
                          <span className="block truncate text-gray-800">{v.vendor_name ?? 'Supplier'}</span>
                          <span className="block text-xs text-gray-400">
                            {fmtInt(v.open_count)} open bills
                            {v.oldest_open_age_days !== null && v.oldest_open_age_days !== undefined ? ` · oldest ${fmtInt(v.oldest_open_age_days)} days` : ''}
                            {n(v.breached_amount) > 0 ? ` · ${fmtRupees(v.breached_amount)} past ${maxDays} days` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 tabular-nums text-gray-900">
                          {fmtRupees(v.total_outstanding)}<ChevronRight aria-hidden className="size-4 text-gray-300 group-hover:text-gray-500" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* GST */}
      <ChartCard title={`GST charged by month, ${fyLabel(fy)}`} testId="chart-gst" dim={dimAcc}
        sub="From each order's own GST record, cancellations left out"
        table={gstState ? undefined : {
          columns: [
            { key: 'month', label: 'Month', format: (v, row) => <span className={cn(row?.future && 'text-gray-400')}>{v}{row?.future ? ' · not yet' : ''}</span> },
            { key: 'taxable', label: 'Taxable value', format: (v) => (v === null ? '' : fmtRupees(v)) },
            { key: 'cgst', label: 'CGST', format: (v) => (v === null ? '' : fmtRupees(v)) },
            { key: 'sgst', label: 'SGST', format: (v) => (v === null ? '' : fmtRupees(v)) },
            { key: 'igst', label: 'IGST', format: (v) => (v === null ? '' : fmtRupees(v)) },
            { key: 'total', label: 'Total GST', format: (v) => (v === null ? '' : fmtRupees(v)) },
            { key: 'orders', label: 'Orders', format: (v) => (v === null ? '' : fmtInt(v)) },
          ],
          rows: gstRows,
          footer: gstFooter,
        }}>
        {gstState ? <Unavailable>{gstState}</Unavailable> : (
          <TimeSeries data={gstRows} granularity="month" money xKey="label" xFormat={(v) => String(v)}
            tooltipLabel={(_l, payload) => payload?.[0]?.payload?.month ?? ''}
            series={[
              { key: 'cgst', name: 'CGST', color: SERIES[0], kind: 'bar', money: true, stackId: 'gst' },
              { key: 'sgst', name: 'SGST', color: SERIES[1], kind: 'bar', money: true, stackId: 'gst' },
              { key: 'igst', name: 'IGST', color: SERIES[2], kind: 'bar', money: true, stackId: 'gst' },
            ]} />
        )}
      </ChartCard>

      {/* From the books — only when the ledger actually has entries. */}
      {booksOk && accFy.data && (journals > 0 ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <ChartCard title={`From your books: income and expenses, ${fyLabel(fy)}`} testId="chart-books" dim={dimAcc}
              sub={`From ${fmtInt(journals)} journal entries in your accounts`}
              table={{
                columns: [
                  { key: 'month', label: 'Month' },
                  { key: 'income', label: 'Income', format: (v) => (v === null ? '' : fmtRupees(v)) },
                  { key: 'expense', label: 'Expenses', format: (v) => (v === null ? '' : fmtRupees(v)) },
                  { key: 'net', label: 'Income less expenses', format: (v) => (v === null ? '' : fmtRupees(v)) },
                ],
                rows: pnlRows,
              }}>
              <TimeSeries data={pnlRows} granularity="month" money xKey="label" xFormat={(v) => String(v)}
                tooltipLabel={(_l, payload) => payload?.[0]?.payload?.month ?? ''}
                series={[
                  { key: 'income', name: 'Income', color: SERIES[0], kind: 'bar', money: true },
                  { key: 'expense', name: 'Expenses', color: SERIES[1], kind: 'bar', money: true },
                ]} />
            </ChartCard>
          </div>
          {pos && nowJournals > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="books-balances">
              <div className="font-semibold text-gray-900">Balances in your books today</div>
              <div className="mt-0.5 text-xs text-gray-500">As your accounts record them; they can differ from the order figures above.</div>
              <dl className="mt-3 divide-y divide-gray-100 text-sm">
                {[
                  ['Cash and bank', pos.cash_and_bank],
                  ['Receivable', pos.accounts_receivable],
                  ['Payable', pos.accounts_payable],
                  ['GST to pay', pos.gst_output],
                  ['GST to claim back', pos.gst_input],
                  ['Stock', pos.inventory],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="text-gray-600">{k}</dt>
                    <dd className="tabular-nums text-gray-900">{fmtMinor(v as string)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      ) : (
        <Unavailable className="rounded-xl border border-gray-200 bg-white p-4">
          Your books have no journal entries for {fyLabel(fy)}, so income and expenses are not shown. Sales figures above come from your orders.
        </Unavailable>
      ))}
    </div>
  );
};

export default MoneyTab;
