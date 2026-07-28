import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, CategoryBars } from '../../components/panelAnalytics/Kit';
import { STATUS, SERIES, INK } from '../../components/panelAnalytics/vizTheme';
import FunnelChart from '../../components/analytics/FunnelChart';
import StatusPipeline from '../../components/analytics/StatusPipeline';
import { fmtRupees } from '../../lib/money';

/**
 * Analytics → Store. Store operations health for a range: conversion funnel
 * (accurate action names incl. payment_attempt), order/shipment pipelines,
 * COD exposure, geo and payment-method mix.
 */
const StoreAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data: orders, error } = usePanelStats<any>('orders', range);

  const [kpis, setKpis] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [shipmentStats, setShipmentStats] = useState<any[]>([]);
  const [geo, setGeo] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Legacy endpoints default to last-30-days when no dates are sent, so
    // "All time" maps to an explicit epoch..today window.
    const today = new Date().toISOString().slice(0, 10);
    const params = {
      startDate: range.from ?? '2000-01-01',
      endDate: range.to ?? today,
      range: 'custom',
    };
    const rParams = { from: range.from, to: range.to };
    Promise.allSettled([
      api.get('/analytics/store-kpis', { params }),
      api.get('/analytics/funnel', { params }),
      api.get('/analytics/shipments/stats', { params }),
      api.get('/analytics/panels/custom-report', { params: { ...rParams, dimension: 'state' } }),
      api.get('/analytics/panels/custom-report', { params: { ...rParams, dimension: 'payment_method' } }),
    ]).then(([k, f, sh, g, pm]) => {
      if (!alive) return;
      if (k.status === 'fulfilled') setKpis(payload(k.value));
      if (f.status === 'fulfilled') setFunnel(payload(f.value));
      if (sh.status === 'fulfilled') setShipmentStats(payload<any[]>(sh.value) ?? []);
      if (g.status === 'fulfilled') setGeo(payload<any>(g.value)?.rows ?? []);
      if (pm.status === 'fulfilled') setPayments(payload<any>(pm.value)?.rows ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const funnelData = funnel ? [
    { stage: 'Visitors', count: funnel.visitors || 0, fill: SERIES[0] },
    { stage: 'Add to Cart', count: funnel.addToCart || 0, fill: SERIES[0] },
    { stage: 'Checkout', count: funnel.checkout || 0, fill: SERIES[0] },
    { stage: 'Payment', count: funnel.payment || 0, fill: SERIES[0] },
    { stage: 'Orders', count: funnel.orders || 0, fill: SERIES[2] },
  ] : [];

  // StatusPipeline expects {status, count} — map the API shapes explicitly
  // (raw order_status/shipping_provider keys crash its label formatter).
  const orderPipeline = Object.entries(orders?.by_status ?? {})
    .map(([status, v]: [string, any]) => ({ status, count: v.orders }));
  const shipmentPipeline = (shipmentStats ?? [])
    .filter((r: any) => r.shipping_provider)
    .map((r: any) => ({ status: r.shipping_provider, count: r.count }));

  const os = orders?.summary;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Analytics</h1>
          <p className="text-sm text-gray-500">Conversion, fulfilment pipeline and order mix for the selected period.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Revenue (non-cancelled)" value={fmtRupees(kpis?.totalRevenue ?? 0)}
          sub={`${(kpis?.orders ?? 0).toLocaleString('en-IN')} orders`} />
        <StatTile label="Average order value" value={fmtRupees(kpis?.aov ?? 0)} />
        <StatTile label="Sessions" value={(kpis?.totalSessions ?? 0).toLocaleString('en-IN')}
          sub={`Conversion ${(kpis?.conversionRate ?? 0).toFixed(2)}%`} />
        <StatTile label="Cancellation rate" value={`${(os?.cancellation_rate ?? 0).toFixed(1)}%`}
          sub={`${os?.cancelled ?? 0} cancelled orders`} accent={STATUS.serious} />
        <StatTile label="COD outstanding" value={fmtRupees(os?.cod_value_pending ?? 0)}
          sub={`${os?.cod_orders_pending ?? 0} undelivered COD orders`} accent={STATUS.warning} />
        <StatTile label="Returns" value={(os?.returns ?? 0).toLocaleString('en-IN')} />
        <StatTile label="Order value (all statuses)" value={fmtRupees(os?.total_value ?? 0)} />
        <StatTile label="Shipped / delivered"
          value={((orders?.by_status?.shipped?.orders ?? 0) + (orders?.by_status?.delivered?.orders ?? 0)).toLocaleString('en-IN')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-2 font-semibold text-gray-900">Conversion funnel</div>
          <div className="mb-2 text-xs" style={{ color: INK.secondary }}>
            Distinct sessions per step; orders from the orders table.
          </div>
          <FunnelChart data={funnelData} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <StatusPipeline orderStats={orderPipeline} shipmentStats={shipmentPipeline} loading={loading && !orders} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold text-gray-900">Orders by state</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">State</th><th className="py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Gross sales</th></tr>
            </thead>
            <tbody className="divide-y">
              {geo.slice(0, 10).map((g: any) => (
                <tr key={g.dimension}>
                  <td className="px-4 py-1.5">{g.dimension}</td>
                  <td className="py-1.5 text-right">{g.orders}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(g.gross_sales)}</td>
                </tr>
              ))}
              {geo.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-gray-500">No orders in range.</td></tr>}
            </tbody>
          </table>
        </div>

        <ChartCard title="Gross sales by payment method" sub="Non-cancelled orders">
          <CategoryBars height={240} money
            data={payments.map((r: any) => ({ label: r.dimension, value: r.gross_sales }))} />
        </ChartCard>
      </div>
    </div>
  );
};

export default StoreAnalytics;
