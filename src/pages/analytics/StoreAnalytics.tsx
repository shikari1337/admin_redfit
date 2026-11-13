import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { KpiTile, ChartCard, CategoryBars, InsightCard, Insight, Unavailable } from '../../components/panelAnalytics/Kit';
import { SERIES, INK, fmtMoneyShort } from '../../components/panelAnalytics/vizTheme';
import FunnelChart from '../../components/analytics/FunnelChart';
import StatusPipeline from '../../components/analytics/StatusPipeline';
import { fmtRupees } from '../../lib/money';
import { todayIso } from '../../utils/date';

/**
 * Analytics > Store. How the shop runs for a period: what to act on first (the funnel step most
 * shoppers leave at, COD money still out, cancellations, returns), then revenue and orders (the
 * orders panel, `orders.read`), the visit funnel and the order and shipment pipeline, places and
 * payment methods. The visit figures (sessions, funnel, couriers) are the store owner's
 * (`settings.manage`); anyone else reads a plain sentence there instead of zeros that look real.
 */

const count = (n: number | undefined | null) => Number(n ?? 0).toLocaleString('en-IN');
const pct = (v: number) => `${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}%`;
const money = (v: number | undefined | null) => <span title={fmtRupees(v ?? 0)}>{fmtMoneyShort(v ?? 0)}</span>;
const OWNER_ONLY = 'Open to the store owner only';
const refused = (r: PromiseSettledResult<any>) => r.status === 'rejected' && (r.reason as any)?.response?.status === 403;
/** One funnel step's count (`add_to_cart` arrives with its legacy `addToCart` twin). */
const stepOf = (f: any, key: string) => Number(f?.[key] ?? f?.[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] ?? 0);

/** The funnel's steps, in order, with where to act when shoppers leave after each one. */
const STEPS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'addToCart', label: 'Add to cart' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'payment', label: 'Payment' },
  { key: 'orders', label: 'Orders' },
] as const;
const LEAK_ACTION: Record<string, { label: string; to: string; advice: string }> = {
  addToCart: { label: 'See the most viewed products', to: '/analytics/users', advice: 'Check price, stock and photos on the products they look at most.' },
  checkout: { label: 'Open abandoned carts', to: '/orders/abandoned-carts', advice: 'Follow up on carts, and check delivery charges shown in the cart.' },
  payment: { label: 'Open payment settings', to: '/settings/payment-discount', advice: 'Check that the payment methods they expect are on.' },
  orders: { label: 'Open abandoned carts', to: '/orders/abandoned-carts', advice: 'Payments that did not complete show up as abandoned carts.' },
};

const StoreAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data: orders, error, status } = usePanelStats<any>('orders', range);

  const [kpis, setKpis] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [shipmentStats, setShipmentStats] = useState<any[]>([]);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [geo, setGeo] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // The visit routes default to the last 30 days when no dates are sent, so "All time" is an
    // explicit window up to the store's today.
    const params = { from: range.from ?? '2000-01-01', to: range.to ?? todayIso(), range: 'custom' };
    const rParams = { from: range.from, to: range.to };
    Promise.allSettled([
      api.get('/analytics/store-kpis', { params }),
      api.get('/analytics/funnel', { params }),
      api.get('/analytics/shipments/stats', { params }),
      api.get('/analytics/panels/custom-report', { params: { ...rParams, dimension: 'state' } }),
      api.get('/analytics/panels/custom-report', { params: { ...rParams, dimension: 'payment_method' } }),
    ]).then(([k, f, sh, g, pm]) => {
      if (!alive) return;
      setOwnerOnly(refused(k) || refused(f));
      setKpis(k.status === 'fulfilled' ? payload(k.value) : null);
      setFunnel(f.status === 'fulfilled' ? payload(f.value) : null);
      setShipmentStats(sh.status === 'fulfilled' ? (payload<any[]>(sh.value) ?? []) : []);
      setGeo(g.status === 'fulfilled' ? (payload<any>(g.value)?.rows ?? []) : []);
      setPayments(pm.status === 'fulfilled' ? (payload<any>(pm.value)?.rows ?? []) : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const os = orders?.summary;
  const cancelledValue = Number(orders?.by_status?.cancelled?.value ?? 0);
  const revenue = os ? Number(os.total_value ?? 0) - cancelledValue : null;
  const keptOrders = os ? Number(os.total_orders ?? 0) - Number(os.cancelled ?? 0) : null;
  const aov = revenue !== null && keptOrders ? revenue / keptOrders : 0;

  const funnelData = funnel ? STEPS.map((s, i) => ({ stage: s.label, count: stepOf(funnel, s.key), fill: i === STEPS.length - 1 ? SERIES[2] : SERIES[0] })) : [];

  // StatusPipeline takes {status, count}: map the API shapes explicitly.
  const orderPipeline = Object.entries(orders?.by_status ?? {}).map(([st, v]: [string, any]) => ({ status: st, count: v.orders }));
  const shipmentPipeline = (shipmentStats ?? [])
    .filter((r: any) => r.shipping_provider)
    .map((r: any) => ({ status: r.shipping_provider, count: r.count }));

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    if (funnel) {
      // The step that loses the largest share of the shoppers who reached the one before it.
      let worst: { from: string; to: string; key: string; kept: number; base: number } | null = null;
      for (let i = 1; i < STEPS.length; i += 1) {
        const base = stepOf(funnel, STEPS[i - 1].key);
        const next = stepOf(funnel, STEPS[i].key);
        if (base < 20) continue;
        const kept = Math.min(1, next / base);
        if (!worst || kept < worst.kept) worst = { from: STEPS[i - 1].label, to: STEPS[i].label, key: STEPS[i].key, kept, base };
      }
      if (worst && worst.kept < 0.6) {
        const act = LEAK_ACTION[worst.key];
        out.push({
          tone: 'bad', title: `Most shoppers stop before ${worst.to.toLowerCase()}`,
          body: <>Only {pct(worst.kept * 100)} of {count(worst.base)} at {worst.from.toLowerCase()} reached {worst.to.toLowerCase()}. {act?.advice}</>,
          action: act ? { label: act.label, to: act.to } : undefined,
        });
      }
    }
    if (os && Number(os.cod_value_pending ?? 0) > 0) {
      out.push({
        tone: 'info', title: `${fmtMoneyShort(os.cod_value_pending)} of COD still out`,
        body: <>{count(os.cod_orders_pending)} cash on delivery {Number(os.cod_orders_pending) === 1 ? 'order is' : 'orders are'} not delivered yet. Watch them for RTO.</>,
        action: { label: 'Open delivery and RTO', to: '/analytics/outcomes' },
      });
    }
    if (os && Number(os.total_orders ?? 0) >= 10 && Number(os.cancellation_rate ?? 0) >= 10) {
      out.push({
        tone: 'bad', title: `${pct(Number(os.cancellation_rate))} of orders cancelled`,
        body: <>{count(os.cancelled)} of {count(os.total_orders)} orders. See which payment methods and places cancel most.</>,
        action: { label: 'Open delivery and RTO', to: '/analytics/outcomes' },
      });
    }
    if (os && Number(os.returns ?? 0) > 0) {
      out.push({
        tone: 'info', title: `${count(os.returns)} ${Number(os.returns) === 1 ? 'return' : 'returns'} in the period`,
        body: <>Check the reasons so the same item does not keep coming back.</>,
        action: { label: 'Open returns', to: '/returns' },
      });
    }
    return out;
  }, [funnel, os]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store</h1>
          <p className="text-sm text-gray-500">Where shoppers leave, what is still out, then revenue, the funnel and the order pipeline.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && (status === 403
        ? <Unavailable className="rounded-lg border bg-white p-4">Order figures need permission to read orders. Ask the store owner to grant it.</Unavailable>
        : <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>)}

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Revenue" value={revenue !== null ? money(revenue) : undefined} unavailable={revenue === null ? (error ? 'Not available' : 'Loading...') : undefined}
          sub={keptOrders !== null ? `${count(keptOrders)} orders not cancelled` : undefined} />
        <KpiTile label="Average order" value={revenue !== null ? money(aov) : undefined} unavailable={revenue === null ? (error ? 'Not available' : 'Loading...') : undefined} />
        <KpiTile label="Sessions" value={kpis ? count(kpis.totalSessions ?? kpis.sessions) : undefined}
          unavailable={kpis ? undefined : ownerOnly ? OWNER_ONLY : loading ? 'Loading...' : 'Not available'}
          sub={kpis ? `Conversion ${Number(kpis.conversionRate ?? kpis.conversion_rate ?? 0).toFixed(2)}%` : undefined} />
        <KpiTile label="Cancelled" value={os ? pct(Number(os.cancellation_rate ?? 0)) : undefined} unavailable={os ? undefined : (error ? 'Not available' : 'Loading...')}
          sub={os ? `${count(os.cancelled)} orders` : undefined} />
        <KpiTile label="COD not delivered" value={os ? money(os.cod_value_pending) : undefined} unavailable={os ? undefined : (error ? 'Not available' : 'Loading...')}
          sub={os ? `${count(os.cod_orders_pending)} orders` : undefined} />
        <KpiTile label="Returns" value={os ? count(os.returns) : undefined} unavailable={os ? undefined : (error ? 'Not available' : 'Loading...')} />
        <KpiTile label="All order value" value={os ? money(os.total_value) : undefined} unavailable={os ? undefined : (error ? 'Not available' : 'Loading...')} sub="Every status, cancelled too" />
        <KpiTile label="Shipped or delivered" value={os ? count((orders?.by_status?.shipped?.orders ?? 0) + (orders?.by_status?.delivered?.orders ?? 0)) : undefined}
          unavailable={os ? undefined : (error ? 'Not available' : 'Loading...')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-1 font-semibold text-gray-900">Visit funnel</h2>
          <p className="mb-2 text-xs" style={{ color: INK.secondary }}>Distinct sessions at each step; orders from the orders table.</p>
          {ownerOnly && !funnel ? <Unavailable>{OWNER_ONLY}.</Unavailable> : <FunnelChart data={funnelData} loading={loading} />}
        </section>
        <div className="min-w-0 lg:col-span-2">
          <StatusPipeline orderStats={orderPipeline} shipmentStats={shipmentPipeline} loading={loading && !orders} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border bg-white shadow-sm">
          <h2 className="border-b px-4 py-3 font-semibold text-gray-900">Orders by state</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr><th className="px-4 py-2">State</th><th className="py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Gross sales</th></tr>
              </thead>
              <tbody className="divide-y">
                {geo.slice(0, 10).map((g: any) => (
                  <tr key={g.dimension}>
                    <td className="px-4 py-1.5">{g.dimension}</td>
                    <td className="py-1.5 text-right">{count(g.orders)}</td>
                    <td className="px-4 py-1.5 text-right font-mono" title={fmtRupees(g.gross_sales)}>{fmtMoneyShort(g.gross_sales)}</td>
                  </tr>
                ))}
                {geo.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-gray-500">{loading ? 'Loading...' : 'No orders in this period.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <ChartCard title="Gross sales by payment method" sub="Orders not cancelled">
          <CategoryBars height={240} money data={payments.map((r: any) => ({ label: r.dimension, value: Number(r.gross_sales ?? 0) }))} />
        </ChartCard>
      </div>
    </div>
  );
};

export default StoreAnalytics;
