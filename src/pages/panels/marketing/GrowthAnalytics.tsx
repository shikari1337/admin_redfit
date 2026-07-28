import React from 'react';
import { Link } from 'react-router-dom';
import DateRangeBar, { useDateRange } from '../../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../../components/panelAnalytics/usePanelStats';
import { StatTile, ChartCard, TimeSeries, CategoryBars, Donut } from '../../../components/panelAnalytics/Kit';
import { SERIES, INK } from '../../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../../lib/money';

/**
 * Growth & Funnel (performance marketer view). Behavioural layer: full funnel,
 * UTM attribution, cohort retention & LTV, new-vs-returning, coupon economics,
 * geo/device conversion, AOV distribution, abandonment. Economics (MER, CAC,
 * ROAS, budget pace) live in Performance (CMO) — ad spend is entered there.
 */

const FUNNEL_STEPS: Array<[key: string, label: string]> = [
  ['visitors', 'Sessions'],
  ['product_viewers', 'Viewed product'],
  ['cart_adders', 'Added to cart'],
  ['checkout_starters', 'Began checkout'],
  ['payment_reached', 'Reached payment'],
  ['orders', 'Placed order'],
];

/** Sequential blue ramp (light) for the cohort heatmap — one hue, light→dark. */
const SEQ = ['#f4f8fe', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
const seqFor = (pct: number) => SEQ[Math.min(SEQ.length - 1, Math.ceil((pct / 100) * (SEQ.length - 1)))];

const GrowthAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('90d');
  const { data, loading, error } = usePanelStats<any>('marketing', range);

  const s = data?.summary;
  const f = data?.funnel;
  const bucket = data?.bucket ?? 'day';

  // Cohort matrix: cohort → month_offset → {customers, revenue}
  const cohortRows: any[] = data?.cohorts ?? [];
  const cohortKeys = [...new Set(cohortRows.map((r) => r.cohort))].sort();
  const maxOffset = Math.min(11, Math.max(0, ...cohortRows.map((r) => Number(r.month_offset))));
  const cohortCell = (cohort: string, off: number) =>
    cohortRows.find((r) => r.cohort === cohort && Number(r.month_offset) === off);
  const cohortSize = (cohort: string) => Number(cohortCell(cohort, 0)?.customers ?? 0);
  const cohortLtv = (cohort: string) => {
    const size = cohortSize(cohort);
    if (!size) return 0;
    const total = cohortRows.filter((r) => r.cohort === cohort).reduce((t, r) => t + Number(r.revenue), 0);
    return total / size;
  };

  const devSessions: any[] = data?.devices?.sessions ?? [];
  const devOrders: any[] = data?.devices?.orders ?? [];
  const devRow = (device: string) => devOrders.find((d) => d.device === device);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-gray-400"><Link to="/panel/marketing" className="hover:underline">Marketing</Link> / Growth & Funnel</div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Growth & Funnel Analytics</h1>
          <p className="text-sm text-gray-500">
            Acquisition, conversion, retention and promo economics.
            Spend-side KPIs (MER · CAC · ROAS · pacing) are in{' '}
            <Link to="/panel/marketing/performance" className="text-primary underline">Performance (CMO)</Link>.
          </p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && !data && <div className="p-8 text-sm text-gray-500">Loading analytics…</div>}

      {s && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Gross sales" value={fmtRupees(s.gross_sales)}
              sub={`${s.orders.toLocaleString('en-IN')} orders · AOV ${fmtRupees(s.aov)}`} />
            <StatTile label="Sessions" value={s.sessions.toLocaleString('en-IN')}
              sub={`Conversion ${s.conversion_rate.toFixed(1)}%`} />
            <StatTile label="Returning order share" value={`${s.returning_order_share.toFixed(0)}%`}
              sub={`${s.returning_orders} repeat · ${s.new_orders} first · ${s.guest_orders} guest`} />
            <StatTile label="Discounts given" value={fmtRupees(s.discount_total)}
              sub={`${s.coupon_orders} coupon orders`} />
            <StatTile label="Collected revenue" value={fmtRupees(s.collected_revenue)}
              sub="Payment completed or COD delivered" />
            <StatTile label="New-customer revenue" value={fmtRupees(s.new_revenue)} />
            <StatTile label="Returning revenue" value={fmtRupees(s.returning_revenue)} />
            <StatTile label="Abandoned carts" value={s.abandoned_carts.toLocaleString('en-IN')}
              sub={<Link to="/orders/abandoned-carts" className="text-primary">Recover →</Link>} />
          </div>

          {/* Funnel */}
          <ChartCard title="Conversion funnel"
            sub="Distinct sessions per step (orders from the orders table — not consent-gated)">
            <div className="space-y-2">
              {FUNNEL_STEPS.map(([key, label], i) => {
                const val = Number(f?.[key] ?? 0);
                const base = Number(f?.visitors ?? 0);
                const prev = i > 0 ? Number(f?.[FUNNEL_STEPS[i - 1][0]] ?? 0) : val;
                const widthPct = base > 0 ? Math.max(2, (val / base) * 100) : 0;
                const stepCr = prev > 0 ? (val / prev) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-right text-sm text-gray-600">{label}</div>
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
          </ChartCard>

          {/* Trends */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Revenue trend" sub="Gross sales (non-cancelled)">
              <TimeSeries data={data.timeseries} granularity={bucket} money height={220}
                series={[{ key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true }]} />
            </ChartCard>
            <ChartCard title="Traffic vs orders" sub="Sessions and orders per period">
              <TimeSeries data={data.timeseries} granularity={bucket} height={220}
                series={[
                  { key: 'sessions', name: 'Sessions', color: SERIES[2], kind: 'area' },
                  { key: 'orders', name: 'Orders', color: SERIES[0] },
                ]} />
            </ChartCard>
          </div>

          {/* Attribution */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title="Revenue by channel" sub="Last-touch attribution">
              {(data.channels ?? []).length > 0 ? (
                <Donut money data={(data.channels ?? []).map((c: any) => ({ name: c.channel, value: c.revenue }))} />
              ) : <div className="py-8 text-center text-sm text-gray-500">No attributed orders in range.</div>}
            </ChartCard>
            <div className="lg:col-span-2 overflow-x-auto rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="font-semibold text-gray-900">Campaign / UTM performance</div>
                <div className="text-xs text-gray-500">Last-touch source · medium · campaign. For ROAS/CPA add spend in Performance (CMO).</div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Source / Medium / Campaign</th>
                    <th className="py-2 text-right">Orders</th>
                    <th className="py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">AOV</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.utm ?? []).map((u: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-1.5">
                        <span className="font-medium">{u.source}</span>
                        <span className="text-gray-400"> / {u.medium} / </span>{u.campaign}
                      </td>
                      <td className="py-1.5 text-right">{u.orders}</td>
                      <td className="py-1.5 text-right font-mono">{fmtRupees(u.revenue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(u.orders > 0 ? u.revenue / u.orders : 0)}</td>
                    </tr>
                  ))}
                  {(data.utm ?? []).length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-500">
                      No UTM-tagged orders in range — tag campaign links (utm_source/medium/campaign) to populate this.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cohorts */}
          <ChartCard title="Retention cohorts"
            sub="Customers by month of first order; cells = % of cohort ordering again in month N. LTV = revenue to date ÷ cohort size.">
            {cohortKeys.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="py-1 pr-3 text-left font-medium">Cohort</th>
                      <th className="px-2 py-1 text-right font-medium">Size</th>
                      {Array.from({ length: maxOffset + 1 }, (_, i) => (
                        <th key={i} className="px-1 py-1 text-center font-medium">M{i}</th>
                      ))}
                      <th className="px-2 py-1 text-right font-medium">LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortKeys.map((c) => {
                      const size = cohortSize(c);
                      return (
                        <tr key={c}>
                          <td className="py-0.5 pr-3 font-mono">{String(c).slice(0, 7)}</td>
                          <td className="px-2 py-0.5 text-right font-mono">{size}</td>
                          {Array.from({ length: maxOffset + 1 }, (_, off) => {
                            const cell = cohortCell(c, off);
                            const pct = size > 0 && cell ? (Number(cell.customers) / size) * 100 : 0;
                            const bg = cell ? seqFor(pct) : undefined;
                            const darkBg = pct >= 60;
                            return (
                              <td key={off} className="px-1 py-0.5 text-center">
                                <div className="rounded px-1.5 py-1 font-mono"
                                  title={cell ? `${cell.customers} customers · ${fmtRupees(cell.revenue)}` : 'no activity'}
                                  style={{ background: bg, color: darkBg ? '#ffffff' : INK.primary }}>
                                  {cell ? `${Math.round(pct)}%` : '·'}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-2 py-0.5 text-right font-mono">{fmtRupees(cohortLtv(c))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="py-8 text-center text-sm text-gray-500">No identified-customer orders yet — cohorts need signed-in buyers.</div>}
          </ChartCard>

          {/* Promos + AOV */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="font-semibold text-gray-900">Coupon performance</div>
                <div className="text-xs text-gray-500">Revenue vs discount cost per code</div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-2">Code</th><th className="py-2 text-right">Orders</th>
                    <th className="py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Discount</th></tr>
                </thead>
                <tbody className="divide-y">
                  {(data.coupons ?? []).map((c: any) => (
                    <tr key={c.coupon_code}>
                      <td className="px-4 py-1.5 font-mono">{c.coupon_code}</td>
                      <td className="py-1.5 text-right">{c.orders}</td>
                      <td className="py-1.5 text-right font-mono">{fmtRupees(c.revenue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-red-700">−{fmtRupees(c.discount_given)}</td>
                    </tr>
                  ))}
                  {(data.coupons ?? []).length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-500">No coupon orders in range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <ChartCard title="Order value distribution" sub="Non-cancelled orders by basket size">
              <CategoryBars data={data.aov_histogram ?? []} height={220} />
            </ChartCard>
          </div>

          {/* Geo + devices */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3 font-semibold text-gray-900">Revenue by state</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-2">State</th><th className="py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Revenue</th></tr>
                </thead>
                <tbody className="divide-y">
                  {(data.geo ?? []).map((g: any) => (
                    <tr key={g.state}>
                      <td className="px-4 py-1.5">{g.state}</td>
                      <td className="py-1.5 text-right">{g.orders}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(g.revenue)}</td>
                    </tr>
                  ))}
                  {(data.geo ?? []).length === 0 && <tr><td colSpan={3} className="p-6 text-center text-gray-500">No orders in range.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="font-semibold text-gray-900">Devices</div>
                <div className="text-xs text-gray-500">
                  Sessions per device; orders where the session is attributable
                  {devOrders.length === 0 ? ' (no session-linked orders in range yet)' : ''}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-2">Device</th><th className="py-2 text-right">Sessions</th>
                    <th className="py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Revenue</th></tr>
                </thead>
                <tbody className="divide-y">
                  {devSessions.map((d: any) => {
                    const o = devRow(d.device);
                    return (
                      <tr key={d.device}>
                        <td className="px-4 py-1.5 capitalize">{d.device}</td>
                        <td className="py-1.5 text-right">{Number(d.sessions).toLocaleString('en-IN')}</td>
                        <td className="py-1.5 text-right">{o ? o.orders : '—'}</td>
                        <td className="px-4 py-1.5 text-right font-mono">{o ? fmtRupees(o.revenue) : '—'}</td>
                      </tr>
                    );
                  })}
                  {devSessions.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-500">No sessions in range.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GrowthAnalytics;
