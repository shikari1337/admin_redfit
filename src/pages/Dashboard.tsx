import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DateRangeBar, { useDateRange, DASHBOARD_PRESETS } from '../components/panelAnalytics/DateRangeBar';
import { usePanelStats, useRangedGet } from '../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries, Donut } from '../components/panelAnalytics/Kit';
import { SERIES, STATUS, INK } from '../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../lib/money';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { inventoryAPI } from '../services/api';

/**
 * Narrowing funnel bar — the same visual GrowthAnalytics uses for the
 * marketing conversion funnel, reused here for both the marketing and
 * shipping funnels rather than inventing a second chart type.
 */
const FunnelBars: React.FC<{
  steps: Array<[key: string, label: string]>; values: Record<string, number>;
}> = ({ steps, values }) => (
  <div className="space-y-2">
    {steps.map(([key, label], i) => {
      const val = Number(values[key] ?? 0);
      const base = Number(values[steps[0][0]] ?? 0);
      const prev = i > 0 ? Number(values[steps[i - 1][0]] ?? 0) : val;
      const widthPct = base > 0 ? Math.max(2, (val / base) * 100) : 0;
      const stepCr = prev > 0 ? (val / prev) * 100 : 0;
      return (
        <div key={key} className="flex items-center gap-3">
          <div className="w-36 shrink-0 text-right text-sm text-gray-600">{label}</div>
          <div className="relative h-7 flex-1 rounded bg-gray-50">
            <div className="h-7 rounded" style={{ width: `${widthPct}%`, background: SERIES[0], opacity: 1 - i * 0.09 }} />
            <span className="absolute inset-y-0 left-2 flex items-center font-mono text-xs font-medium"
              style={{ color: widthPct > 22 ? '#ffffff' : INK.primary }}>
              {val.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="w-24 shrink-0 text-right text-xs text-gray-500">
            {i === 0 ? '100%' : `${stepCr.toFixed(0)}% of prev`}
          </div>
        </div>
      );
    })}
  </div>
);

const MARKETING_FUNNEL_STEPS: Array<[string, string]> = [
  ['visitors', 'Sessions'],
  ['product_viewers', 'Viewed product'],
  ['cart_adders', 'Added to cart'],
  ['checkout_starters', 'Began checkout'],
  ['payment_reached', 'Reached payment'],
  ['orders', 'Placed order'],
];

const SHIPPING_FUNNEL_STEPS: Array<[string, string]> = [
  ['shipped', 'Shipped'],
  ['left_warehouse', 'Left warehouse'],
  ['delivered', 'Delivered'],
];

/** Product row for the low-stock/out-of-stock lists, linking to the edit page — same pattern as OrderItems.tsx / Products.tsx. */
const ProductRow: React.FC<{ id: string; name: string; sku?: string; sub: React.ReactNode }> = ({ id, name, sku, sub }) => (
  <Link to={`/products/${id}/edit`} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
    <div className="min-w-0 pr-3">
      <div className="truncate font-medium text-gray-800">{name}</div>
      {sku && <div className="font-mono text-xs text-gray-400">{sku}</div>}
    </div>
    <div className="shrink-0 pl-3 text-right text-sm">{sub}</div>
  </Link>
);

/**
 * Store-health home dashboard. `commerce` (sales/orders/traffic, B2B/B2C and
 * payment splits, top sellers) is always fetched — it's the store owner's
 * baseline view and was never gated. Every OTHER section (Q&A, reviews,
 * low-stock, shipping funnel, marketing funnel + campaigns, GA4) only fetches
 * once the store's module map has loaded AND the signed-in role actually has
 * the matching module + permission — a `staff` user landing here by default
 * has no `marketing.read`, so that section simply never fires a doomed request.
 */
const Dashboard: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('today', DASHBOARD_PRESETS);
  const { hasPerm, canAccess, modulesLoaded } = useAuth();

  const { data, loading, error } = usePanelStats<any>('commerce', range);
  const s = data?.summary;
  const bucket = data?.bucket ?? 'day';

  const qaEnabled = modulesLoaded && canAccess('product_qa') && hasPerm('content.read');
  const reviewsEnabled = modulesLoaded && canAccess('reviews') && hasPerm('content.read');
  const inventoryEnabled = modulesLoaded && canAccess('inventory') && hasPerm('inventory.read');
  const shippingEnabled = modulesLoaded && canAccess('shipping') && hasPerm('shipments.read');
  const marketingEnabled = modulesLoaded && canAccess('marketing') && hasPerm('marketing.read');
  const gaEnabled = hasPerm('reports.read');

  const { data: qa } = useRangedGet<any>('/product-questions/admin/counts', range, qaEnabled);
  const { data: reviews } = useRangedGet<any>('/reviews/admin/counts', range, reviewsEnabled);
  const { data: shipping } = usePanelStats<any>('shipping', range, shippingEnabled);
  const { data: marketing } = usePanelStats<any>('marketing', range, marketingEnabled);
  const { data: campaignRows } = useRangedGet<any[]>('/marketing-hub/analytics/campaigns', range, marketingEnabled);
  // Best-effort — GA4 connector may not be connected; useRangedGet swallows the
  // resulting 409 into `error` and leaves `data` null, so the tile below just
  // never renders instead of showing an error state for an optional feature.
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

  const b2bOrder = (data?.order_type_split ?? []).find((t: any) => t.type === 'b2b');

  const campaignTotals = (campaignRows ?? []).reduce((acc: any, c: any) => ({
    sent: acc.sent + Number(c.recipients_sent || 0),
    failed: acc.failed + Number(c.recipients_failed || 0),
    opened: acc.opened + Number(c.opened || 0),
    clicked: acc.clicked + Number(c.clicked || 0),
    converted: acc.converted + Number(c.converted || 0),
  }), { sent: 0, failed: 0, opened: 0, clicked: 0, converted: 0 });

  // Shipping isn't a strict conversion funnel (it branches into delivered vs
  // NDR vs RTO) — "left warehouse" = everything past pickup, regardless of
  // eventual outcome, so the bar still narrows monotonically toward "delivered".
  const sc = shipping?.status_counts;
  const shippingValues = shipping && sc ? {
    shipped: shipping.total_shipments,
    left_warehouse: Math.max(0, shipping.total_shipments - sc.ready_to_pick - sc.pickup_scheduled),
    delivered: sc.delivered,
  } : { shipped: 0, left_warehouse: 0, delivered: 0 };
  const rtoCount = sc ? sc.rto_in_transit + sc.rto_delivered + sc.rto_failed : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Store health — sales, orders, service and fulfilment for this store.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} presets={DASHBOARD_PRESETS} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && !data && <div className="flex h-40 items-center justify-center"><LoadingSpinner size="lg" color="primary" text="Loading analytics..." /></div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Gross sales" value={fmtRupees(s.gross_sales)}
              sub={`${s.orders.toLocaleString('en-IN')} orders · AOV ${fmtRupees(s.aov)}`} />
            <StatTile label="Collected revenue" value={fmtRupees(s.collected_revenue)}
              sub={s.refund_due > 0
                ? `${s.collected_orders} paid orders · ${fmtRupees(s.refund_due)} refunds due`
                : `${s.collected_orders} paid / delivered-COD orders`} />
            <StatTile label="Units sold" value={s.units_sold.toLocaleString('en-IN')}
              sub={`${s.cancelled_orders} cancelled orders excluded`} />
            <StatTile label="New buyers" value={s.new_customers.toLocaleString('en-IN')}
              sub="First order placed in this period" />
            <StatTile label="Sessions" value={s.sessions.toLocaleString('en-IN')}
              sub={`Conversion ${s.conversion_rate.toFixed(1)}%`} />
            <StatTile label="Page views" value={s.page_views.toLocaleString('en-IN')} />
            <StatTile label="Orders" value={s.orders.toLocaleString('en-IN')}
              sub={(data.order_type_split ?? [])
                .map((t: any) => `${t.orders} ${t.type} (${fmtRupees(t.value)})`)
                .join(' · ') || undefined} />
            <StatTile label="Cancelled" value={s.cancelled_orders.toLocaleString('en-IN')} />
          </div>

          {ga?.totals && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Active users (GA4)" value={Number(ga.totals.activeUsers ?? 0).toLocaleString('en-IN')}
                sub={ga.deltas?.activeUsers !== undefined
                  ? `${ga.deltas.activeUsers > 0 ? '+' : ''}${ga.deltas.activeUsers}% vs prior period` : undefined} />
            </div>
          )}

          {/* Received this period */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {qaEnabled && qa && (
              <StatTile label="Questions received" value={qa.total.toLocaleString('en-IN')}
                sub={`${qa.unanswered} unanswered`}
                accent={qa.unanswered > 0 ? STATUS.warning : undefined} />
            )}
            {reviewsEnabled && reviews && (
              <StatTile label="Reviews received" value={reviews.total.toLocaleString('en-IN')}
                sub={reviews.total > 0 ? `Avg rating ${Number(reviews.avg_rating ?? 0).toFixed(1)}★` : undefined} />
            )}
            <StatTile label="B2B orders received" value={(b2bOrder?.orders ?? 0).toLocaleString('en-IN')}
              sub={b2bOrder ? fmtRupees(b2bOrder.value) : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Sales over time"
                sub="Gross = non-cancelled order value · Collected = money kept (paid, less refunds, excluding cancelled)">
                <TimeSeries data={data.timeseries} granularity={bucket} money
                  series={[
                    { key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true },
                    { key: 'collected_revenue', name: 'Collected', color: SERIES[2], kind: 'line', money: true },
                  ]} />
              </ChartCard>
            </div>
            <div className="space-y-6">
              <ChartCard title="Payment methods" sub="Prepaid vs COD, non-cancelled orders in range">
                <Donut data={(data.payment_split ?? []).map((p: any) => ({ name: p.method, value: p.orders }))} />
              </ChartCard>
              <ChartCard title="B2B vs B2C" sub="Order type, non-cancelled orders in range">
                <Donut data={(data.order_type_split ?? []).map((t: any) => ({ name: t.type, value: t.orders }))} />
              </ChartCard>
            </div>
          </div>

          <ChartCard title="Orders per period" sub="Non-cancelled orders">
            <TimeSeries data={data.timeseries} granularity={bucket} height={200}
              series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
          </ChartCard>

          {shippingEnabled && shipping && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartCard title="Shipping funnel" sub={`${shipping.total_shipments.toLocaleString('en-IN')} shipments in range`}>
                  <FunnelBars steps={SHIPPING_FUNNEL_STEPS} values={shippingValues} />
                </ChartCard>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <StatTile label="Delivery rate" value={`${shipping.delivery_rate.toFixed(1)}%`} accent={STATUS.good} />
                <StatTile label="NDR rate" value={`${shipping.ndr_rate.toFixed(1)}%`}
                  sub={`${sc.ndr_failed_delivery} failed deliveries`}
                  accent={shipping.ndr_rate > 5 ? STATUS.critical : STATUS.warning} />
                <StatTile label="RTO rate" value={`${shipping.rto_rate.toFixed(1)}%`}
                  sub={`${rtoCount} returned to origin`}
                  accent={shipping.rto_rate > 5 ? STATUS.critical : STATUS.warning} />
              </div>
            </div>
          )}

          {marketingEnabled && marketing && (
            <>
              <ChartCard title="Marketing funnel" sub="Distinct sessions per step, orders from the orders table">
                <FunnelBars steps={MARKETING_FUNNEL_STEPS} values={marketing.funnel ?? {}} />
              </ChartCard>
              {campaignRows && campaignRows.length > 0 && (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  <StatTile label="Campaigns sent" value={campaignTotals.sent.toLocaleString('en-IN')} />
                  <StatTile label="Failed" value={campaignTotals.failed.toLocaleString('en-IN')} />
                  <StatTile label="Opened" value={campaignTotals.opened.toLocaleString('en-IN')} />
                  <StatTile label="Clicked" value={campaignTotals.clicked.toLocaleString('en-IN')} />
                  <StatTile label="Converted" value={campaignTotals.converted.toLocaleString('en-IN')} />
                </div>
              )}
            </>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3 font-semibold text-gray-900">Top products by revenue</div>
              <div className="divide-y text-sm">
                {(data.top_products ?? []).length === 0 && <div className="p-4 text-gray-500">No sales in range.</div>}
                {(data.top_products ?? []).map((p: any, i: number) => (
                  <div key={p.id ?? i} className="flex items-center justify-between px-4 py-2">
                    <div className="min-w-0 pr-3">
                      <span className="mr-2 font-mono text-xs text-gray-400">#{i + 1}</span>
                      <span className="font-medium text-gray-800">{p.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono">{fmtRupees(p.revenue)}</div>
                      <div className="text-xs text-gray-400">{p.units} units</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3 font-semibold text-gray-900">Top customers</div>
              <div className="divide-y text-sm">
                {(data.top_customers ?? []).length === 0 && <div className="p-4 text-gray-500">No customer orders in range.</div>}
                {(data.top_customers ?? []).map((c: any, i: number) => (
                  <Link key={c.customer_id ?? i} to={`/customers/${c.customer_id}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                    <div className="min-w-0 pr-3">
                      <span className="mr-2 font-mono text-xs text-gray-400">#{i + 1}</span>
                      <span className="font-medium text-gray-800">{c.name ?? 'Guest'}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono">{fmtRupees(c.spent)}</div>
                      <div className="text-xs text-gray-400">{c.orders} orders</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {inventoryEnabled && lowStock && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-4 py-3 font-semibold text-gray-900">
                  Out of stock <span className="ml-1 text-xs font-normal text-gray-400">({outOfStock.length})</span>
                </div>
                <div className="divide-y text-sm">
                  {outOfStock.length === 0 && <div className="p-4 text-gray-500">Nothing out of stock.</div>}
                  {outOfStock.slice(0, 10).map((r: any) => (
                    <ProductRow key={r.variation_id} id={r.product_id} name={r.product_name} sku={r.sku}
                      sub={<span className="font-mono text-red-600">{r.available} left</span>} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-4 py-3 font-semibold text-gray-900">
                  Low stock <span className="ml-1 text-xs font-normal text-gray-400">({lowOnly.length})</span>
                </div>
                <div className="divide-y text-sm">
                  {lowOnly.length === 0 && <div className="p-4 text-gray-500">Nothing low on stock.</div>}
                  {lowOnly.slice(0, 10).map((r: any) => (
                    <ProductRow key={r.variation_id} id={r.product_id} name={r.product_name} sku={r.sku}
                      sub={<span className="font-mono text-amber-600">{r.available} left</span>} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
