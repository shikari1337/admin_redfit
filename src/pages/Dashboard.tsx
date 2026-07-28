import React from 'react';
import { Link } from 'react-router-dom';
import DateRangeBar, { useDateRange } from '../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries, Donut } from '../components/panelAnalytics/Kit';
import { SERIES } from '../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../lib/money';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * E-commerce panel dashboard. All numbers are computed SERVER-SIDE over the
 * selected range (no 1000-order client cap). Two revenue truths, labeled:
 * gross sales = value of non-cancelled orders; collected = payment completed
 * or COD delivered.
 */
const Dashboard: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, loading, error } = usePanelStats<any>('commerce', range);

  const s = data?.summary;
  const bucket = data?.bucket ?? 'day';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Sales, orders and traffic for this store.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && !data && <div className="flex h-40 items-center justify-center"><LoadingSpinner size="lg" color="primary" text="Loading analytics..." /></div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Gross sales" value={fmtRupees(s.gross_sales)}
              sub={`${s.orders.toLocaleString('en-IN')} orders · AOV ${fmtRupees(s.aov)}`} />
            <StatTile label="Collected revenue" value={fmtRupees(s.collected_revenue)}
              sub={`${s.collected_orders} paid / delivered-COD orders`} />
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

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Sales over time"
                sub="Gross = non-cancelled order value · Collected = payment completed or COD delivered">
                <TimeSeries data={data.timeseries} granularity={bucket} money
                  series={[
                    { key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true },
                    { key: 'collected_revenue', name: 'Collected', color: SERIES[2], kind: 'line', money: true },
                  ]} />
              </ChartCard>
            </div>
            <ChartCard title="Payment methods" sub="Non-cancelled orders in range">
              <Donut data={(data.payment_split ?? []).map((p: any) => ({ name: p.method, value: p.orders }))} />
            </ChartCard>
          </div>

          <ChartCard title="Orders per period" sub="Non-cancelled orders">
            <TimeSeries data={data.timeseries} granularity={bucket} height={200}
              series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
          </ChartCard>

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
        </>
      )}
    </div>
  );
};

export default Dashboard;
