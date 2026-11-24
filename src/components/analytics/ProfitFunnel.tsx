import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { fmtRupees } from '../../lib/money';
import { usePanelStats, useRangedGet } from '../panelAnalytics/usePanelStats';
import type { PanelRange } from '../panelAnalytics/DateRangeBar';
import { ChartCard, CompareBars, Segmented, Unavailable, type CompareRow } from '../panelAnalytics/Kit';
import { useInView } from '../panelAnalytics/useInView';

/**
 * The profitability funnel (owner, 24 Nov 2026: "Total MRP Value, total additional charges and
 * fees, total discount (then type of discount), then total (with each step show totals), then
 * shipping charges paid, total payment gateway charges, actual cod charges paid, and show reports
 * with option to with and without gst calculations, like claimable, total gst to be paid").
 *
 * Every figure is the backend's (`GET /api/v2/insights/panels/profitability`, insights
 * `domain/profit.rs`); this file only orders and words them. The store's funnel on Analytics and
 * one order's card on the order page draw the SAME ladder from the same answer shape.
 */

type View = 'with' | 'without';

interface Figures {
  outcome?: string;
  orders: Record<string, number>;
  sales: {
    mrp_value: number; price_below_mrp: number; selling_value: number;
    charges: { shipping: number; cod_fee: number; total: number };
    discounts: { coupons_offers: number; quantity: number; online_payment: number; staff: number; other: number; total: number };
    adjustment: number; gst_on_top_orders: number; order_total: number;
    not_kept: { returned: number; rto: number; lost: number; total: number };
    kept_total: number; open_total: number;
  };
  gst: {
    on_sales: { total: number; cgst: number; sgst: number; igst: number };
    reversed: number;
    claimable: { gateway: number; shipping: number; total: number };
    not_stated: { shipping: number; cod_charges: number };
    net_payable: number;
  };
  costs: {
    shipping: { with_gst: number; gst: number; without_gst: number; parcels: number; unpriced: number; orders_without_parcel: number };
    gateway: { with_gst: number; gst: number; without_gst: number; payments: number; fee_unknown: number };
    cod: { with_gst: number; without_gst: number; from_payouts: number; from_booking: number; orders_with_payout: number; orders_charge_unknown: number };
    other_deductions: number;
    total: { with_gst: number; without_gst: number };
  };
  left: { with_gst: number; without_gst: number };
  checks: { lines_without_mrp: number; lines_mrp_below_price: number };
}

/** One row of the ladder: a step (level 0) or a part of the step above it (level 1). */
interface Rung {
  key: string;
  label: string;
  amount: number;
  /** `start` the first figure, `plus`/`less` a step, `total` a running total, `part` a breakdown line. */
  kind: 'start' | 'plus' | 'less' | 'total' | 'part';
  running?: number;
  hint?: string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const nonZero = (v: number) => Math.abs(v) >= 0.005;
const count = (v: number) => n(v).toLocaleString('en-IN');

/** The ladder for one view. Parts with nothing in them are left out; steps always show. */
function ladder(f: Figures, view: View): Rung[] {
  const s = f.sales;
  const c = f.costs;
  const out: Rung[] = [];
  let run = n(s.mrp_value);
  const step = (r: Omit<Rung, 'running'>, delta: number) => {
    run += delta;
    out.push({ ...r, running: run });
  };
  const part = (key: string, label: string, amount: number, always = false, hint?: string) => {
    if (always || nonZero(amount)) out.push({ key, label, amount, kind: 'part', hint });
  };

  out.push({ key: 'mrp', label: 'MRP value', amount: n(s.mrp_value), kind: 'start', running: run,
    hint: 'Every line at its MRP times the quantity not cancelled. A line with no MRP, or an MRP below its price, counts at its price.' });

  step({ key: 'charges', label: 'Additional charges and fees', amount: n(s.charges.total), kind: 'plus' }, n(s.charges.total));
  part('ch_ship', 'Shipping charged to customers', n(s.charges.shipping), true);
  part('ch_cod', 'COD convenience fee, with its GST', n(s.charges.cod_fee), true);

  const discountTotal = n(s.price_below_mrp) + n(s.discounts.total);
  step({ key: 'discounts', label: 'Total discount', amount: discountTotal, kind: 'less' }, -discountTotal);
  part('d_mrp', 'Selling price below MRP', n(s.price_below_mrp), true);
  part('d_coupon', 'Coupons and offers', n(s.discounts.coupons_offers), false,
    'A coupon and an automatic offer used together are stored as one line, so they show together.');
  part('d_qty', 'Quantity discount', n(s.discounts.quantity));
  part('d_online', 'Online payment discount', n(s.discounts.online_payment));
  part('d_staff', 'Discounts given by staff', n(s.discounts.staff));
  part('d_other', 'Other discounts and adjustments', n(s.discounts.other), false,
    'The part of the order discount its stored lines do not explain (older orders, or a total capped at the subtotal).');

  if (nonZero(n(s.adjustment))) {
    const adj = n(s.adjustment);
    step({
      key: 'adjust',
      label: n(s.gst_on_top_orders) > 0 ? 'GST added on top of prices, and rounding' : 'Rounding and later price edits',
      amount: Math.abs(adj), kind: adj >= 0 ? 'plus' : 'less',
      hint: 'What makes the steps above equal the stored order totals.',
    }, adj);
  }
  out.push({ key: 'order_total', label: 'Order total', amount: n(s.order_total), kind: 'total', running: n(s.order_total) });
  run = n(s.order_total);

  step({ key: 'not_kept', label: 'Returned, RTO and lost', amount: n(s.not_kept.total), kind: 'less' }, -n(s.not_kept.total));
  part('nk_ret', 'Returned by customers', n(s.not_kept.returned));
  part('nk_rto', 'Returned to origin (RTO)', n(s.not_kept.rto));
  part('nk_lost', 'Lost or damaged in transit', n(s.not_kept.lost));
  out.push({ key: 'kept', label: 'Kept sales', amount: n(s.kept_total), kind: 'total', running: n(s.kept_total),
    hint: nonZero(n(s.open_total)) ? `${fmtRupees(s.open_total)} of this is in orders not delivered yet.` : undefined });
  run = n(s.kept_total);

  if (view === 'without') {
    step({ key: 'gst_sales', label: 'GST on kept sales, to pay', amount: n(f.gst.on_sales.total), kind: 'less' }, -n(f.gst.on_sales.total));
    out.push({ key: 'kept_net', label: 'Kept sales without GST', amount: run, kind: 'total', running: run });
  }

  const pick = (o: { with_gst: number; without_gst: number }) => n(view === 'with' ? o.with_gst : o.without_gst);
  const ship = pick(c.shipping);
  step({ key: 'ship', label: 'Shipping charges paid', amount: ship, kind: 'less',
    hint: 'What the parcels\' bookings priced, the COD part taken out (it is below). A parcel shared by several orders is split between them.' }, -ship);
  const fee = pick(c.gateway);
  step({ key: 'gateway', label: 'Payment gateway charges', amount: fee, kind: 'less',
    hint: 'The fee the gateway reported for each payment, cancelled orders included.' }, -fee);
  const cod = pick(c.cod);
  step({ key: 'cod', label: 'COD charges paid', amount: cod, kind: 'less' }, -cod);
  part('cod_pay', 'From courier payouts', n(c.cod.from_payouts));
  part('cod_book', 'From the booking, payout not recorded yet', n(c.cod.from_booking));
  if (nonZero(n(c.other_deductions))) {
    step({ key: 'other_ded', label: 'Other courier deductions on payouts', amount: n(c.other_deductions), kind: 'less' }, -n(c.other_deductions));
  }
  out.push({
    key: 'left', label: view === 'with' ? 'Left after selling costs' : 'Left after selling costs, without GST',
    amount: n(view === 'with' ? f.left.with_gst : f.left.without_gst), kind: 'total',
    running: n(view === 'with' ? f.left.with_gst : f.left.without_gst),
  });
  return out;
}

const SIGN: Record<Rung['kind'], string> = { start: '', plus: '+', less: '-', total: '=', part: '' };

/** The ladder as a table: step, amount, running total, share of the MRP value. */
const Ladder: React.FC<{ rungs: Rung[]; mrp: number; compact?: boolean }> = ({ rungs, mrp, compact }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[22rem] text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
          <th className="py-1.5 pr-2 font-medium">Step</th>
          <th className="py-1.5 pr-2 text-right font-medium">Amount</th>
          <th className="py-1.5 pr-2 text-right font-medium">Running total</th>
          {!compact && <th className="py-1.5 text-right font-medium">Of MRP</th>}
        </tr>
      </thead>
      <tbody>
        {rungs.map((r) => {
          const isTotal = r.kind === 'total' || r.kind === 'start';
          const isPart = r.kind === 'part';
          return (
            <tr key={r.key} className={cn('border-b border-gray-100 last:border-0', isTotal && 'bg-gray-50 font-semibold text-gray-900')}>
              <td className={cn('py-1.5 pr-2', isPart ? 'pl-6 text-gray-500' : 'text-gray-800')}>
                <span className="inline-block w-4 text-gray-400 tabular-nums">{SIGN[r.kind]}</span>
                <span title={r.hint}>{r.label}</span>
                {r.hint && !isPart && <span className="ml-1 cursor-help text-gray-400" title={r.hint}>(?)</span>}
              </td>
              <td className={cn('py-1.5 pr-2 text-right tabular-nums', isPart ? 'text-gray-500' : 'text-gray-900')}>
                {fmtRupees(r.amount)}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                {r.running !== undefined && !isPart ? fmtRupees(r.running) : ''}
              </td>
              {!compact && (
                <td className="py-1.5 text-right tabular-nums text-gray-500">
                  {mrp > 0 && !isPart ? `${((isTotal ? (r.running ?? 0) : r.amount) / mrp * 100).toFixed(1)}%` : ''}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/** GST to pay, GST to claim, and what nobody recorded GST on. */
const GstBox: React.FC<{ f: Figures }> = ({ f }) => {
  const g = f.gst;
  const row = (label: string, value: number, strong = false, sub?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className={cn('text-sm', strong ? 'font-semibold text-gray-900' : 'text-gray-700')}>
        {label}
        {sub && <div className="text-xs font-normal text-gray-500">{sub}</div>}
      </div>
      <div className={cn('text-right tabular-nums text-sm', strong ? 'font-semibold text-gray-900' : 'text-gray-800')}>{fmtRupees(value)}</div>
    </div>
  );
  const split = [
    nonZero(g.on_sales.cgst) && `CGST ${fmtRupees(g.on_sales.cgst)}`,
    nonZero(g.on_sales.sgst) && `SGST ${fmtRupees(g.on_sales.sgst)}`,
    nonZero(g.on_sales.igst) && `IGST ${fmtRupees(g.on_sales.igst)}`,
  ].filter(Boolean).join(', ');
  const claimParts = [
    nonZero(g.claimable.gateway) && `gateway fees ${fmtRupees(g.claimable.gateway)}`,
    nonZero(g.claimable.shipping) && `Growcord Ship ${fmtRupees(g.claimable.shipping)}`,
  ].filter(Boolean).join(', ');
  return (
    <div className="divide-y divide-gray-100">
      {row('GST on kept sales', g.on_sales.total, false, split || undefined)}
      {row('GST claimable on costs', g.claimable.total, false, claimParts || 'No cost in the period states its GST.')}
      {row('Net GST to pay', g.net_payable, true, 'GST on kept sales less what the costs let you claim.')}
      {nonZero(g.reversed) && row('GST reversed on returned, RTO and lost orders', g.reversed, false, 'Taken off by their credit notes, so not in the GST to pay.')}
      {(nonZero(g.not_stated.shipping) || nonZero(g.not_stated.cod_charges)) && (
        <p className="pt-2 text-xs text-amber-700">
          {nonZero(g.not_stated.shipping) && <>{fmtRupees(g.not_stated.shipping)} of shipping charges (a carrier account's own quote or a charge typed by staff) state no GST. </>}
          {nonZero(g.not_stated.cod_charges) && <>{fmtRupees(g.not_stated.cod_charges)} of COD charges on courier payouts state no GST. </>}
          No input credit is counted on these until the courier's tax invoice is recorded, and they count in full in both views.
        </p>
      )}
    </div>
  );
};

/** What the figures could not see, in plain words (only what applies). */
function gaps(f: Figures, single: boolean): string[] {
  const c = f.costs;
  const out: string[] = [];
  const o = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('{n}', count(k)));
  if (n(c.shipping.unpriced) > 0) out.push(o(n(c.shipping.unpriced), '1 parcel has no shipping charge recorded, so its cost is missing.', '{n} parcels have no shipping charge recorded, so their cost is missing.'));
  if (n(c.shipping.orders_without_parcel) > 0) out.push(single ? 'No parcel is booked for this order yet, so there is no shipping cost.' : o(n(c.shipping.orders_without_parcel), '1 order has no parcel booked, so no shipping cost.', '{n} orders have no parcel booked (not shipped yet, or sent outside the system), so no shipping cost.'));
  if (n(c.gateway.fee_unknown) > 0) out.push(o(n(c.gateway.fee_unknown), 'The gateway has not reported the fee of 1 payment yet.', 'The gateway has not reported the fee of {n} payments yet.'));
  if (n(c.cod.orders_charge_unknown) > 0) out.push(o(n(c.cod.orders_charge_unknown), '1 delivered COD order has no COD charge recorded (no payout line and none in the booking).', '{n} delivered COD orders have no COD charge recorded (no payout line and none in the booking).'));
  const noMrp = n(f.checks.lines_without_mrp) + n(f.checks.lines_mrp_below_price);
  if (noMrp > 0) out.push(o(noMrp, '1 order line has no MRP, or an MRP below its price, so its price is used as MRP.', '{n} order lines have no MRP, or an MRP below their price, so their price is used as MRP.'));
  return out;
}

const VIEW_OPTIONS = [{ key: 'with', label: 'With GST' }, { key: 'without', label: 'Without GST' }] as const;

/** The funnel bars: MRP value, order total, kept sales and what is left, on one scale. */
function funnelBars(f: Figures, view: View): CompareRow[] {
  const kept = view === 'with' ? n(f.sales.kept_total) : n(f.sales.kept_total) - n(f.gst.on_sales.total);
  const left = n(view === 'with' ? f.left.with_gst : f.left.without_gst);
  return [
    { label: 'MRP value', value: n(f.sales.mrp_value), text: fmtRupees(f.sales.mrp_value) },
    { label: 'Order total', value: n(f.sales.order_total), text: fmtRupees(f.sales.order_total) },
    { label: view === 'with' ? 'Kept sales' : 'Kept, no GST', value: kept, text: fmtRupees(kept) },
    { label: 'Left after costs', value: Math.max(0, left), text: fmtRupees(left), muted: left < 0 },
  ];
}

/**
 * Analytics > Dashboard: the store's profitability funnel for the picked period. Asked for only
 * once scrolled into view, and only for a person who may read the accounts.
 */
export const ProfitFunnel: React.FC<{ range: PanelRange; allowed: boolean }> = ({ range, allowed }) => {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [view, setView] = useState<View>('with');
  const { data, loading, error, status } = usePanelStats<Figures>('profitability', range, allowed && inView);
  const rungs = useMemo(() => (data?.sales ? ladder(data, view) : []), [data, view]);
  const notes = data?.sales ? gaps(data, false) : [];

  return (
    <section ref={ref} data-profit-funnel>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Profitability</h2>
          <p className="text-sm text-gray-500">
            Orders placed in the period, cancelled ones aside: from MRP to what is left after shipping, gateway and COD charges. Product cost is not in it.
          </p>
        </div>
        <Segmented label="Show amounts" value={view} onChange={(k) => setView(k as View)} options={VIEW_OPTIONS} />
      </div>
      {!allowed ? (
        <Unavailable className="rounded-lg border bg-white p-4">Profitability needs permission to read the accounts. Ask the store owner to grant it.</Unavailable>
      ) : error ? (
        status === 403
          ? <Unavailable className="rounded-lg border bg-white p-4">Profitability needs permission to read the accounts. Ask the store owner to grant it.</Unavailable>
          : <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : !data?.sales ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">{loading || !inView ? 'Loading profitability...' : 'No figures for this period.'}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <ChartCard title="The funnel" sub={`${count(data.orders.counted)} orders counted, ${count(data.orders.kept)} kept (${count(data.orders.delivered)} delivered, ${count(data.orders.open)} not delivered yet)`} dim={loading}>
              <CompareBars rows={funnelBars(data, view)} />
            </ChartCard>
            <ChartCard title="Step by step" sub={view === 'with' ? 'Amounts as paid, GST inside' : 'GST on sales to pay and GST the costs state are taken out'} dim={loading}>
              <Ladder rungs={rungs} mrp={n(data.sales.mrp_value)} />
            </ChartCard>
          </div>
          <div className="min-w-0 space-y-4">
            <ChartCard title="GST" sub="To pay on kept sales, and what the costs let you claim" dim={loading}>
              <GstBox f={data} />
            </ChartCard>
            {notes.length > 0 && (
              <ChartCard title="Not in these figures yet" dim={loading}>
                <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600">
                  {notes.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </ChartCard>
            )}
            <p className="text-xs text-gray-500">
              Returned, RTO and lost follow the rules of <Link className="text-blue-700 hover:underline" to="/analytics/outcomes">Delivery and RTO</Link>.
              Cancelled orders are left out of sales; the parcels and gateway fees spent on them still count as costs. Imported and replacement orders are left out.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

const OUTCOME: Record<string, string> = {
  delivered: 'Delivered',
  open: 'Not delivered yet',
  returned: 'Returned by the customer',
  rto: 'Returned to origin (RTO)',
  lost: 'Lost or damaged in transit',
  cancelled: 'Cancelled',
  unknown: 'Not counted (an imported or replacement order)',
};

/**
 * The order page: what this one order earned after its shipping, gateway and COD charges, and its
 * GST to pay and to claim. Asked for only when scrolled into view, and only for a person who may
 * read the accounts.
 */
export const OrderProfitCard: React.FC<{ orderId: string; allowed: boolean }> = ({ orderId, allowed }) => {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [view, setView] = useState<View>('with');
  const { data, loading, error } = useRangedGet<Figures>(
    `/analytics/panels/profitability/orders/${orderId}`, {}, allowed && !!orderId && inView,
  );
  const rungs = useMemo(() => (data?.sales ? ladder(data, view) : []), [data, view]);
  if (!allowed) return null;
  const notes = data?.sales ? gaps(data, true) : [];
  return (
    <div ref={ref} data-order-profit>
      <ChartCard
        title="Profit on this order"
        sub={data?.outcome ? OUTCOME[data.outcome] ?? data.outcome : 'After shipping, gateway and COD charges'}
        action={<Segmented size="sm" label="Show amounts" value={view} onChange={(k) => setView(k as View)} options={VIEW_OPTIONS} />}
        dim={loading}
      >
        {error ? (
          <Unavailable>{error}</Unavailable>
        ) : !data?.sales ? (
          <Unavailable>{loading || !inView ? 'Loading...' : 'No figures for this order.'}</Unavailable>
        ) : (
          <div className="space-y-3">
            <Ladder rungs={rungs} mrp={n(data.sales.mrp_value)} compact />
            <GstBox f={data} />
            {notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600">
                {notes.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </div>
        )}
      </ChartCard>
    </div>
  );
};

export default ProfitFunnel;
