import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { fmtRupees } from '../../lib/money';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries, CategoryBars, Donut } from '../../components/panelAnalytics/Kit';
import { SERIES, STATUS } from '../../components/panelAnalytics/vizTheme';
import { Page, PageHeader, StatusChip } from '../../components/erp';
import { ShoppingCart, Truck, RotateCcw, AlertTriangle } from 'lucide-react';

/** Orders & Fulfilment panel home — range-aware ops analytics + manual fulfilment tools. */
const OrdersPanelDashboard: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, loading, error } = usePanelStats<any>('orders', range);

  const [recent, setRecent] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/orders', { params: { limit: 8 } });
        const p = payload<any>(res);
        const list = Array.isArray(p) ? p : p?.orders ?? [];
        setRecent(Array.isArray(list) ? list : []);
      } catch { /* list unavailable — analytics still render */ }
      try {
        const cRes = await api.get('/channels/connections');
        const list = payload<any>(cRes);
        setChannels(Array.isArray(list) ? list : list?.connections ?? []);
      } catch { /* channel_sync module off — hide the section */ }
    })();
  }, []);

  const s = data?.summary;
  const by = data?.by_status ?? {};
  const bucket = data?.bucket ?? 'day';
  const statusRows = Object.entries(by)
    .map(([label, v]: [string, any]) => ({ label, value: v.orders }))
    .sort((a, b) => b.value - a.value);

  return (
    <Page>
      <PageHeader
        title="Orders & Fulfilment"
        description="Everything from order to doorstep."
        actions={<DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Orders in range" value={s.total_orders.toLocaleString('en-IN')}
              sub={fmtRupees(s.total_value)} />
            <StatTile label="Cancelled" value={s.cancelled.toLocaleString('en-IN')}
              sub={`${s.cancellation_rate.toFixed(1)}% of orders`} accent={STATUS.critical} />
            <StatTile label="COD outstanding" value={fmtRupees(s.cod_value_pending)}
              sub={`${s.cod_orders_pending} undelivered COD orders`} accent={STATUS.warning} />
            <StatTile label="Returns" value={s.returns.toLocaleString('en-IN')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ['Pending', by.pending?.orders ?? 0, '/orders?status=pending'],
              ['Processing', by.processing?.orders ?? 0, '/orders?status=processing'],
              ['Shipped', by.shipped?.orders ?? 0, '/shipments'],
            ] as const).map(([label, n, to]) => (
              <Link key={label} to={to} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
                <div className="text-2xl font-bold text-gray-900">{loading ? '…' : Number(n).toLocaleString('en-IN')}</div>
                <div className="text-sm text-gray-500">{label} (in range) →</div>
              </Link>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Order volume" sub="All orders vs cancelled vs shipped/delivered">
                <TimeSeries data={data.timeseries} granularity={bucket}
                  series={[
                    { key: 'orders', name: 'Orders', color: SERIES[0], kind: 'area' },
                    { key: 'shipped', name: 'Shipped', color: SERIES[2] },
                    { key: 'cancelled', name: 'Cancelled', color: SERIES[7] },
                  ]} />
              </ChartCard>
            </div>
            <ChartCard title="Attribution" sub="Last-touch channel (non-cancelled)">
              {(data.attribution ?? []).length > 0 ? (
                <Donut data={(data.attribution ?? []).map((a: any) => ({ name: a.channel, value: a.orders }))} />
              ) : <div className="py-10 text-center text-sm text-gray-500">No attribution recorded in range.</div>}
            </ChartCard>
          </div>

          <ChartCard title="Status distribution" sub="Orders by current status, in range">
            <CategoryBars data={statusRows} height={220} />
          </ChartCard>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/orders" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <ShoppingCart className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold">All Orders</div>
        </Link>
        <Link to="/shipments" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <Truck className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold">Shipments</div>
        </Link>
        <Link to="/returns" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
          <RotateCcw className="h-6 w-6 text-gray-700" />
          <div className="mt-2 font-semibold">Returns</div>
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="font-semibold text-gray-900">Sales channels & manual fulfilment</div>
          <p className="text-sm text-gray-500">
            API channels sync automatically. Channels without an API (shop counter, WhatsApp,
            offline resellers) are fulfilled manually: record the order, adjust stock — everything
            stays attributed and ledgered.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {channels !== null && (
            <div className="flex flex-wrap gap-2">
              {channels.length === 0 && (
                <span className="text-sm text-gray-500">No channels connected yet.</span>
              )}
              {channels.map((c: any) => (
                <span key={c.id ?? c._id}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    (c.platform_code ?? c.platformCode) === 'offline'
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                  {c.display_name ?? c.displayName ?? c.platform_code ?? c.platformCode}
                  {(c.platform_code ?? c.platformCode) === 'offline' ? ' · manual' : ' · synced'}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link to="/orders/new" className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              + Record manual order
            </Link>
            <Link to="/inventory" className="rounded border px-3 py-1.5 text-sm font-medium">
              Adjust stock manually
            </Link>
            <Link to="/channels" className="rounded border px-3 py-1.5 text-sm font-medium">
              Manage channels
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Recent orders</div>
        <div className="divide-y divide-gray-100 text-sm">
          {recent.length === 0 && <div className="p-4 text-gray-500">No orders yet.</div>}
          {recent.map((o: any) => (
            <Link key={o.id ?? o._id} to={`/orders/${o.order_id ?? o.orderId ?? o.id}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/70">
              <div>
                <span className="font-mono font-medium">{o.order_id ?? o.orderId}</span>
                <span className="ml-2 text-gray-500">{o.shipping_address?.name ?? ''}</span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="tabular-nums">₹{Number(o.total ?? 0).toLocaleString('en-IN')}</span>
                <StatusChip status={o.order_status ?? o.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {!s && !error && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <AlertTriangle className="h-4 w-4" /> Loading analytics…
        </div>
      )}
    </Page>
  );
};

export default OrdersPanelDashboard;
