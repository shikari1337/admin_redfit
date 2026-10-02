/**
 * Dashboard ▸ Overview — how the store did in the period picked, against the
 * period before it of the same length.
 *
 * One filter row (period · show by) scopes everything on the tab. The tiles
 * each carry a change vs the NAMED previous period and a small trend; the
 * charts each have a table twin. Every source is gated on the viewer's
 * permission and the store's modules exactly as before.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePanelStats, useRangedGet } from '../panelAnalytics/usePanelStats';
import {
  ChartCard, KpiTile, SplitBar, TimeSeries, Segmented, Unavailable, type TileDelta,
} from '../panelAnalytics/Kit';
import { SERIES, fmtBucket } from '../panelAnalytics/vizTheme';
import { useInView } from '../panelAnalytics/useInView';
import { fmtRupees } from '@/lib/money';
import { cssVar } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { inventoryAPI } from '@/services/api';
import { PeriodPicker } from './PeriodPicker';
import {
  type Granularity, type PanelRange, compareLabel, daysBetween, periodByKey, rangeLabel, shortDay,
} from './periods';
import {
  BlockTitle, FilterRow, fmtInt, fmtPct, orderTypeColor, orderTypeLabel, paymentColor, paymentLabel,
} from './shared';

// ─── helpers ─────────────────────────────────────────────────────────────────

type Row = Record<string, any>;

/** A trend for a tile: the series squeezed to ≤ 24 points (sums, or a ratio of sums). */
function trend(rows: Row[] | undefined, num: string, den?: string, max = 24): Array<number | null> | null {
  if (!rows || rows.length < 3) return null;
  const size = Math.ceil(rows.length / max);
  const out: Array<number | null> = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const a = chunk.reduce((s, r) => s + (Number(r[num]) || 0), 0);
    if (!den) { out.push(a); continue; }
    const b = chunk.reduce((s, r) => s + (Number(r[den]) || 0), 0);
    out.push(b > 0 ? a / b : null);
  }
  return out;
}

const bucketLabel = (b: string, g: 'day' | 'week' | 'month') =>
  (g === 'week' ? `Week of ${fmtBucket(b, 'day')}` : g === 'month' ? fmtBucket(b, 'month') : fmtBucket(b, 'day'));

const FUNNEL_MARKETING: Array<[string, string]> = [
  ['visitors', 'Sessions'], ['product_viewers', 'Viewed a product'], ['cart_adders', 'Added to cart'],
  ['checkout_starters', 'Began checkout'], ['payment_reached', 'Reached payment'], ['orders', 'Placed an order'],
];
const FUNNEL_SHIPPING: Array<[string, string]> = [
  ['shipped', 'Shipped'], ['left_warehouse', 'Left the warehouse'], ['delivered', 'Delivered'],
];

/** Narrowing funnel: one hue, each step's share of the first, and of the step before. */
const FunnelBars: React.FC<{ steps: Array<[string, string]>; values: Record<string, number> }> = ({ steps, values }) => (
  <div className="space-y-2">
    {steps.map(([key, label], i) => {
      const val = Number(values[key] ?? 0);
      const base = Number(values[steps[0][0]] ?? 0);
      const prev = i > 0 ? Number(values[steps[i - 1][0]] ?? 0) : val;
      const widthPct = base > 0 ? Math.max(1.5, (val / base) * 100) : 0;
      return (
        <div key={key} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-sm">
          <div className="truncate text-right text-gray-600">{label}</div>
          <div className="relative h-6 rounded bg-gray-50">
            <div className="h-6 rounded" style={{ width: `${widthPct}%`, background: SERIES[0] }} />
          </div>
          <div className="w-28 text-right">
            <span className="font-medium tabular-nums text-gray-900">{val.toLocaleString('en-IN')}</span>
            <span className="ml-1.5 text-xs tabular-nums text-gray-400">
              {i === 0 ? '' : prev > 0 ? `${Math.round((val / prev) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      );
    })}
    <p className="pt-1 text-xs text-gray-400">The percentage is each step against the step before it.</p>
  </div>
);

/** A one-bucket period has no line to draw; say so in one quiet line instead of an empty plot. */
const SingleBucket: React.FC<{ bucket: 'day' | 'week' | 'month' }> = ({ bucket }) => (
  <p className="py-6 text-center text-sm text-gray-500">
    This period is a single {bucket}, so there is nothing to draw over time. The figures are in the tiles above;
    pick a longer period, or show it by day, to see the trend.
  </p>
);

const ListCard: React.FC<{ title: string; count?: number; children: React.ReactNode; testId?: string }> = ({ title, count, children, testId }) => (
  <div className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid={testId}>
    <div className="flex items-baseline justify-between border-b border-gray-100 px-4 py-3">
      <span className="font-semibold text-gray-900">{title}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-gray-400">{count.toLocaleString('en-IN')}</span>}
    </div>
    <div className="divide-y divide-gray-100 text-sm">{children}</div>
  </div>
);

// ─── the tab ─────────────────────────────────────────────────────────────────

const SHOW_BY: Array<{ key: Granularity; label: string }> = [
  { key: 'auto', label: 'Auto' }, { key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' },
];

export const OverviewTab: React.FC = () => {
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const [periodKey, setPeriodKey] = useState('today');
  const [custom, setCustom] = useState<PanelRange | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('auto');

  const def = periodByKey(periodKey);
  const range = useMemo<PanelRange>(
    () => (periodKey === 'custom' && custom ? custom : def.range()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodKey, custom?.from, custom?.to]);
  const prevRange = useMemo(() => def.compare(range), [def, range]);
  const vsLabel = compareLabel(def, prevRange);

  const salesRead = hasPerm('orders.read');
  const extra = granularity === 'auto' ? undefined : { granularity };
  const cur = usePanelStats<any>('commerce', range, salesRead, extra);
  // The previous period has the same length, so the server picks the same bucket for it.
  const prev = usePanelStats<any>('commerce', prevRange ?? {}, salesRead && !!prevRange, extra);

  const data = cur.data;
  const s = data?.summary;
  const p = prevRange ? prev.data?.summary : null;
  const bucket: 'day' | 'week' | 'month' = data?.bucket ?? 'day';
  const ts: Row[] = data?.timeseries ?? [];
  const dim = cur.loading && !!data;

  const d = (key: string, goodWhen: TileDelta['goodWhen'] = 'up', value?: (x: any) => number): TileDelta | null => {
    if (!s || !p || !prevRange) return null;
    const read = value ?? ((x: any) => Number(x?.[key] ?? 0));
    return { current: read(s), previous: read(p), label: vsLabel, goodWhen };
  };

  // Previous period as a thin grey line under this period's sales, aligned by position.
  const prevTs: Row[] = prevRange ? (prev.data?.timeseries ?? []) : [];
  const salesRows = ts.map((r, i) => ({
    ...r,
    prev_gross: prevTs.length ? (prevTs[i]?.gross_sales ?? null) : undefined,
    prev_bucket: prevTs[i]?.bucket,
  }));

  // ── below the fold ──
  const [belowRef, below] = useInView<HTMLDivElement>();
  const qaEnabled = modulesLoaded && canAccess('product_qa') && hasPerm('content.read');
  const reviewsEnabled = modulesLoaded && canAccess('reviews') && hasPerm('content.read');
  const inventoryEnabled = below && modulesLoaded && canAccess('inventory') && hasPerm('inventory.read');
  const shippingEnabled = below && modulesLoaded && canAccess('shipping') && hasPerm('shipments.read');
  const marketingEnabled = below && modulesLoaded && canAccess('marketing') && hasPerm('marketing.read');
  // GA4 reads go through the Google connector; a 409 "not connected" is swallowed by design.
  const gaEnabled = below && modulesLoaded && canAccess('connectors') && hasPerm('reports.read');

  const { data: qa } = useRangedGet<any>('/product-questions/admin/counts', range, qaEnabled);
  const { data: reviews } = useRangedGet<any>('/reviews/admin/counts', range, reviewsEnabled);
  const { data: shipping } = usePanelStats<any>('shipping', range, shippingEnabled);
  const { data: marketing } = usePanelStats<any>('marketing', range, marketingEnabled);
  const { data: campaignRows } = useRangedGet<any[]>('/marketing-hub/analytics/campaigns', range, marketingEnabled);
  const { data: ga } = useRangedGet<any>('/connectors/google/analytics/overview', range, gaEnabled);

  const [lowStock, setLowStock] = useState<any[] | null>(null);
  useEffect(() => {
    if (!inventoryEnabled) { setLowStock(null); return; }
    let alive = true;
    inventoryAPI.getLowStock(10)
      .then((rows: any[]) => { if (alive) setLowStock(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setLowStock([]); });
    return () => { alive = false; };
  }, [inventoryEnabled]);
  const outOfStock = (lowStock ?? []).filter((r) => Number(r.available) <= 0);
  const lowOnly = (lowStock ?? []).filter((r) => Number(r.available) > 0);

  const campaignTotals = (campaignRows ?? []).reduce((acc: any, c: any) => ({
    sent: acc.sent + Number(c.recipients_sent || 0),
    failed: acc.failed + Number(c.recipients_failed || 0),
    opened: acc.opened + Number(c.opened || 0),
    clicked: acc.clicked + Number(c.clicked || 0),
    converted: acc.converted + Number(c.converted || 0),
  }), { sent: 0, failed: 0, opened: 0, clicked: 0, converted: 0 });

  // Shipping isn't a strict funnel (it branches into delivered vs NDR vs RTO) —
  // "left the warehouse" = everything past pickup, regardless of outcome.
  const sc = shipping?.status_counts;
  const shippingValues = shipping && sc ? {
    shipped: shipping.total_shipments,
    left_warehouse: Math.max(0, shipping.total_shipments - sc.ready_to_pick - sc.pickup_scheduled),
    delivered: sc.delivered,
  } : { shipped: 0, left_warehouse: 0, delivered: 0 };
  const rtoCount = sc ? sc.rto_in_transit + sc.rto_delivered + sc.rto_failed : 0;

  // ── derived tile values ──
  const placed = s ? s.orders + s.cancelled_orders : 0;
  const cancelRate = s && placed > 0 ? (s.cancelled_orders / placed) * 100 : 0;
  const daysInRange = range.from && range.to ? daysBetween(range.from, range.to) + 1 : null;
  const conversionPartial = !!s?.conversion_since && (
    !range.from || s.conversion_since > range.from || (daysInRange !== null && Number(s.conversion_days ?? 0) < daysInRange));
  const b2bOrder = (data?.order_type_split ?? []).find((t: any) => t.type === 'b2b');

  const paymentRows = (data?.payment_split ?? []).map((r: any) => ({
    key: r.method, name: paymentLabel(r.method), value: Number(r.orders), color: paymentColor(r.method),
    detail: fmtRupees(r.value),
  }));
  const typeRows = (data?.order_type_split ?? []).map((r: any) => ({
    key: r.type, name: orderTypeLabel(r.type), value: Number(r.orders), color: orderTypeColor(r.type),
    detail: fmtRupees(r.value),
  }));

  if (!salesRead) {
    return <Unavailable className="rounded-xl border border-gray-200 bg-white p-4">Sales figures need permission to read orders. Ask the store owner if you need them.</Unavailable>;
  }

  const periodText = rangeLabel(range);

  return (
    <div className="space-y-5" data-tab-panel="overview">
      <FilterRow aside={dim ? 'Updating…' : (prevRange ? `Compared with ${rangeLabel(prevRange)}` : 'No comparison for all time')}>
        <PeriodPicker value={periodKey} range={range} custom={custom}
          onChange={(k, c) => { if (c) setCustom(c); setPeriodKey(k); }} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Show by</span>
          <Segmented label="Show by" value={granularity} onChange={(k) => setGranularity(k as Granularity)} options={SHOW_BY} testId="show-by" />
        </div>
      </FilterRow>

      {cur.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load sales: {cur.error}</div>}

      {!s && cur.loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          <div className="col-span-2 h-56 animate-pulse rounded-xl bg-gray-100 lg:row-span-2" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      )}

      {s && (
        <div className={cn('space-y-5 transition-opacity duration-200', dim && 'opacity-60')} aria-busy={dim || undefined}>
          {/* Headline tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile hero className="col-span-2 lg:row-span-2" testId="tile-gross"
              label={`Gross sales · ${periodText}`} value={fmtRupees(s.gross_sales)}
              sub={`${s.orders.toLocaleString('en-IN')} orders, cancellations left out`}
              delta={d('gross_sales')} spark={trend(ts, 'gross_sales')}
              compareRows={p && prevRange ? [
                { label: periodText, value: s.gross_sales, text: fmtRupees(s.gross_sales) },
                { label: rangeLabel(prevRange), value: p.gross_sales, text: fmtRupees(p.gross_sales), muted: true },
              ] : null} />
            <KpiTile testId="tile-collected" label="Collected" value={fmtRupees(s.collected_revenue)}
              sub={`${s.collected_orders.toLocaleString('en-IN')} paid orders, less refunds`}
              delta={d('collected_revenue')} spark={trend(ts, 'collected_revenue')} />
            <KpiTile testId="tile-orders" label="Orders" value={s.orders.toLocaleString('en-IN')}
              delta={d('orders')} spark={trend(ts, 'orders')} />
            <KpiTile testId="tile-aov" label="Average order" value={fmtRupees(s.aov)}
              delta={d('aov')} spark={trend(ts, 'gross_sales', 'orders')} />
            <KpiTile testId="tile-units" label="Units sold" value={s.units_sold.toLocaleString('en-IN')}
              delta={d('units_sold')} spark={trend(ts, 'units')} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiTile testId="tile-new-buyers" label="New buyers" value={s.new_customers.toLocaleString('en-IN')}
              sub="First order ever placed in this period" delta={d('new_customers')} spark={trend(ts, 'new_customers')} />
            <KpiTile testId="tile-cancelled" label="Cancelled" value={s.cancelled_orders.toLocaleString('en-IN')}
              sub={placed > 0 ? `${fmtPct(cancelRate)} of orders placed` : undefined}
              delta={d('cancelled_orders', 'down')} spark={trend(ts, 'cancelled')} />
            <KpiTile testId="tile-refund-due" className="col-span-2 lg:col-span-1" label="Refunds due" value={fmtRupees(s.refund_due)}
              sub={s.refund_due_orders > 0
                ? `${s.refund_due_orders.toLocaleString('en-IN')} paid orders cancelled, not yet refunded`
                : 'Nothing paid and cancelled is waiting for a refund'}
              delta={d('refund_due', 'down')} />
          </div>

          {/* Traffic */}
          <div className="space-y-2">
            <BlockTitle aside="Visits are recorded only when a shopper allows it">Traffic</BlockTitle>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <KpiTile testId="tile-sessions" label="Sessions" value={s.sessions.toLocaleString('en-IN')} delta={d('sessions')} />
              <KpiTile testId="tile-page-views" label="Page views" value={s.page_views.toLocaleString('en-IN')} delta={d('page_views')} />
              <KpiTile testId="tile-conversion" className="col-span-2 lg:col-span-1" label="Conversion"
                value={s.sessions > 0 ? fmtPct(s.conversion_rate) : undefined}
                unavailable={s.sessions > 0 ? undefined : 'No visits were recorded in this period, so conversion cannot be worked out.'}
                sub={s.sessions > 0 ? (conversionPartial
                  ? `${fmtInt(s.conversion_orders)} orders ÷ ${fmtInt(s.sessions)} sessions, counting only days with visits recorded (since ${shortDay(s.conversion_since)})`
                  : `${fmtInt(s.conversion_orders)} orders ÷ ${fmtInt(s.sessions)} sessions`) : undefined}
                delta={p && p.sessions > 0 && s.sessions > 0 ? d('conversion_rate') : null} />
            </div>
            {ga?.totals && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <KpiTile label="Active users (Google Analytics)" value={Number(ga.totals.activeUsers ?? 0).toLocaleString('en-IN')}
                  sub={ga.deltas?.activeUsers !== undefined ? `${ga.deltas.activeUsers > 0 ? '+' : ''}${ga.deltas.activeUsers}% vs the period before` : undefined} />
              </div>
            )}
          </div>

          {/* Sales over time + splits */}
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ChartCard title="Sales over time" testId="chart-sales"
                sub={`Gross is order value less cancellations · collected is money kept${prevTs.length ? ' · grey is the period before' : ''}`}
                table={{
                  columns: [
                    { key: 'bucket', label: bucket === 'week' ? 'Week of' : 'Period', format: (v) => bucketLabel(v, bucket) },
                    { key: 'gross_sales', label: 'Gross sales', format: (v) => fmtRupees(v) },
                    { key: 'collected_revenue', label: 'Collected', format: (v) => fmtRupees(v) },
                    { key: 'orders', label: 'Orders', format: (v) => fmtInt(v) },
                    ...(prevTs.length ? [{ key: 'prev_gross', label: 'Gross, period before', format: (v: any) => (v === null || v === undefined ? '' : fmtRupees(v)) }] : []),
                  ],
                  rows: salesRows,
                  footer: { bucket: 'Total', gross_sales: s.gross_sales, collected_revenue: s.collected_revenue, orders: s.orders, prev_gross: p?.gross_sales ?? null },
                }}>
                {ts.length <= 1 ? (
                  <SingleBucket bucket={bucket} />
                ) : (
                  <TimeSeries data={salesRows} granularity={bucket} money
                    tooltipLabel={(b, payload) => {
                      const prevB = payload?.[0]?.payload?.prev_bucket;
                      return prevB ? `${bucketLabel(b, bucket)} (before: ${bucketLabel(prevB, bucket)})` : bucketLabel(b, bucket);
                    }}
                    series={[
                      { key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true },
                      { key: 'collected_revenue', name: 'Collected', color: SERIES[2], kind: 'line', money: true },
                      ...(prevTs.length ? [{ key: 'prev_gross', name: 'Gross, period before', color: cssVar('--n-300'), kind: 'line' as const, money: true, strokeWidth: 1.5 }] : []),
                    ]} />
                )}
              </ChartCard>
            </div>
            <div className="grid min-w-0 gap-5">
              <ChartCard title="How customers paid" sub="Orders by payment method, cancellations left out" testId="chart-payment">
                {paymentRows.length ? <SplitBar label="Payment methods" rows={paymentRows} /> : <Unavailable>No orders in this period.</Unavailable>}
              </ChartCard>
              <ChartCard title="Retail and B2B" sub="Orders by price book, cancellations left out" testId="chart-type">
                {typeRows.length ? <SplitBar label="Retail and B2B" rows={typeRows} /> : <Unavailable>No orders in this period.</Unavailable>}
              </ChartCard>
            </div>
          </div>

          <ChartCard title="Orders per period" sub="Orders placed, cancellations left out" testId="chart-orders"
            table={{
              columns: [
                { key: 'bucket', label: bucket === 'week' ? 'Week of' : 'Period', format: (v) => bucketLabel(v, bucket) },
                { key: 'orders', label: 'Orders', format: (v) => fmtInt(v) },
                { key: 'cancelled', label: 'Cancelled', format: (v) => fmtInt(v) },
                { key: 'units', label: 'Units', format: (v) => fmtInt(v) },
                { key: 'new_customers', label: 'New buyers', format: (v) => fmtInt(v) },
              ],
              rows: ts,
              footer: { bucket: 'Total', orders: s.orders, cancelled: s.cancelled_orders, units: s.units_sold, new_customers: s.new_customers },
            }}>
            {ts.length <= 1 ? <SingleBucket bucket={bucket} /> : (
              <TimeSeries data={ts} granularity={bucket} height={220}
                tooltipLabel={(b) => bucketLabel(b, bucket)}
                series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
            )}
          </ChartCard>

          {/* From here down: requested only once scrolled towards (useInView). */}
          <div ref={belowRef} aria-hidden className="h-px" />

          {(qaEnabled && qa) || (reviewsEnabled && reviews) || b2bOrder ? (
            <div className="space-y-2">
              <BlockTitle>Received in this period</BlockTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {qaEnabled && qa && (
                  <KpiTile label="Questions received" value={qa.total.toLocaleString('en-IN')}
                    sub={qa.unanswered > 0 ? `${qa.unanswered} not answered yet` : 'All answered'} />
                )}
                {reviewsEnabled && reviews && (
                  <KpiTile label="Reviews received" value={reviews.total.toLocaleString('en-IN')}
                    sub={reviews.total > 0 ? `Average ${Number(reviews.avg_rating ?? 0).toFixed(1)} out of 5` : undefined} />
                )}
                <KpiTile label="B2B orders" value={(b2bOrder?.orders ?? 0).toLocaleString('en-IN')}
                  sub={b2bOrder ? fmtRupees(b2bOrder.value) : 'None in this period'} />
              </div>
            </div>
          ) : null}

          {shippingEnabled && shipping && (
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <ChartCard title="Deliveries" sub={`${shipping.total_shipments.toLocaleString('en-IN')} shipments created in this period`} testId="chart-shipping">
                  <FunnelBars steps={FUNNEL_SHIPPING} values={shippingValues} />
                </ChartCard>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <KpiTile label="Delivered" value={fmtPct(shipping.delivery_rate)} sub="Of shipments created" />
                <KpiTile label="Failed delivery attempts" value={fmtPct(shipping.ndr_rate)}
                  sub={`${sc.ndr_failed_delivery} shipments${shipping.ndr_rate > 5 ? ' · above 5%, worth a look' : ''}`} />
                <KpiTile className="col-span-2 lg:col-span-1" label="Returned to you" value={fmtPct(shipping.rto_rate)}
                  sub={`${rtoCount} shipments came back${shipping.rto_rate > 5 ? ' · above 5%, worth a look' : ''}`} />
              </div>
            </div>
          )}

          {marketingEnabled && marketing && (
            <>
              <ChartCard title="From visit to order" sub="Sessions reaching each step; orders from the orders table" testId="chart-funnel">
                <FunnelBars steps={FUNNEL_MARKETING} values={marketing.funnel ?? {}} />
              </ChartCard>
              {campaignRows && campaignRows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <KpiTile label="Campaign messages sent" value={campaignTotals.sent.toLocaleString('en-IN')} />
                  <KpiTile label="Failed" value={campaignTotals.failed.toLocaleString('en-IN')} />
                  <KpiTile label="Opened" value={campaignTotals.opened.toLocaleString('en-IN')} />
                  <KpiTile label="Clicked" value={campaignTotals.clicked.toLocaleString('en-IN')} />
                  <KpiTile className="col-span-2 md:col-span-1" label="Led to an order" value={campaignTotals.converted.toLocaleString('en-IN')} />
                </div>
              )}
            </>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <ListCard title="Top products by revenue" testId="list-top-products">
              {(data.top_products ?? []).length === 0 && <div className="p-4 text-gray-500">No sales in this period.</div>}
              {(data.top_products ?? []).map((pr: any, i: number) => (
                <div key={pr.id ?? i} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                    <span className="truncate font-medium text-gray-800">{pr.name}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums text-gray-900">{fmtRupees(pr.revenue)}</div>
                    <div className="text-xs tabular-nums text-gray-400">{Number(pr.units).toLocaleString('en-IN')} units</div>
                  </div>
                </div>
              ))}
            </ListCard>
            <ListCard title="Top customers" testId="list-top-customers">
              {(data.top_customers ?? []).length === 0 && <div className="p-4 text-gray-500">No customer orders in this period.</div>}
              {(data.top_customers ?? []).map((c: any, i: number) => (
                <Link key={c.customer_id ?? i} to={`/customers/${c.customer_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
                    <span className="truncate font-medium text-gray-800">{c.name ?? 'Customer'}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums text-gray-900">{fmtRupees(c.spent)}</div>
                    <div className="text-xs tabular-nums text-gray-400">{c.orders} orders</div>
                  </div>
                </Link>
              ))}
            </ListCard>
          </div>

          {inventoryEnabled && lowStock && (
            <div className="grid gap-5 lg:grid-cols-2">
              <ListCard title="Out of stock" count={outOfStock.length} testId="list-out-of-stock">
                {outOfStock.length === 0 && <div className="p-4 text-gray-500">Nothing is out of stock.</div>}
                {outOfStock.slice(0, 10).map((r: any) => (
                  <Link key={r.variation_id} to={`/products/${r.product_id}/edit`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800">{r.product_name}</div>
                      {r.sku && <div className="font-mono text-xs text-gray-400">{r.sku}</div>}
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-bad-ink">{r.available} left</span>
                  </Link>
                ))}
              </ListCard>
              <ListCard title="Running low" count={lowOnly.length} testId="list-low-stock">
                {lowOnly.length === 0 && <div className="p-4 text-gray-500">Nothing is running low.</div>}
                {lowOnly.slice(0, 10).map((r: any) => (
                  <Link key={r.variation_id} to={`/products/${r.product_id}/edit`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800">{r.product_name}</div>
                      {r.sku && <div className="font-mono text-xs text-gray-400">{r.sku}</div>}
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-gray-600">{r.available} left</span>
                  </Link>
                ))}
              </ListCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OverviewTab;
