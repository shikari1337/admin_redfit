import React, { useEffect, useMemo, useState } from 'react';
import DateRangeBar, { useDateRange, previousRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats, fetchRanged } from '../../components/panelAnalytics/usePanelStats';
import { ChartCard, TimeSeries, CategoryBars, Donut, KpiTile, InsightCard, Insight, TileDelta, Unavailable } from '../../components/panelAnalytics/Kit';
import { SERIES, fmtBucket, fmtMoneyShort } from '../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';
import ShopperReport from '../../components/analytics/ShopperReport';
import { ProfitFunnel } from '../../components/analytics/ProfitFunnel';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Analytics > Dashboard. Opens with what to act on (money held for refunds, sales and conversion
 * against the previous period of equal length, cancellations, the best weekday), then the period's
 * numbers, each with its change against that previous period, then the trends. Every figure is the
 * commerce panel's (`GET /api/v2/insights/panels/commerce`, rupees); the page only words them.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const count = (n: number | undefined | null) => Number(n ?? 0).toLocaleString('en-IN');
const pct = (v: number) => `${v.toFixed(Math.abs(v) >= 10 ? 0 : 1)}%`;
const change = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const money = (v: number | undefined | null) => <span title={fmtRupees(v ?? 0)}>{fmtMoneyShort(v ?? 0)}</span>;

const AnalyticsDashboard: React.FC = () => {
  const { hasPerm } = useAuth();
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, loading, error, status } = usePanelStats<any>('commerce', range);
  const prevRange = useMemo(() => previousRange(range), [range.from, range.to]);
  const [prev, setPrev] = useState<any>(null);

  useEffect(() => {
    setPrev(null);
    if (!prevRange) return undefined;
    let alive = true;
    fetchRanged<any>('/analytics/panels/commerce', prevRange)
      .then((d) => { if (alive) setPrev(d); })
      .catch(() => { /* no comparison: the tiles simply carry no change line */ });
    return () => { alive = false; };
  }, [prevRange?.from, prevRange?.to]);

  const s = data?.summary;
  const p = prev?.summary ?? null;
  const bucket: 'day' | 'week' | 'month' = data?.bucket ?? 'day';
  const vs = prevRange ? 'vs previous period' : '';
  const delta = (cur: number, before: number | undefined | null, extra?: Partial<TileDelta>): TileDelta | null =>
    (prevRange && p ? { current: Number(cur ?? 0), previous: before === undefined || before === null ? null : Number(before), label: vs, ...extra } : null);

  // Weekday pattern and the best day, from the daily series (day buckets only).
  const analysis = useMemo(() => {
    const rows: any[] = data?.timeseries ?? [];
    if (bucket !== 'day' || rows.length === 0) return null;
    const byDow = Array.from({ length: 7 }, () => ({ revenue: 0, days: 0 }));
    let best: any = null;
    for (const r of rows) {
      const dow = (new Date(`${r.bucket}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
      byDow[dow].revenue += Number(r.gross_sales ?? 0); byDow[dow].days += 1;
      if (!best || Number(r.gross_sales) > Number(best.gross_sales)) best = r;
    }
    const weekday = WEEKDAYS.map((label, i) => ({ label: label.slice(0, 3), full: label, value: byDow[i].days > 0 ? byDow[i].revenue / byDow[i].days : 0 }));
    return { weekday, best };
  }, [data, bucket]);

  const insights = useMemo<Insight[]>(() => {
    if (!s) return [];
    const out: Insight[] = [];
    const refundDue = Number(s.refund_due ?? 0);
    if (refundDue > 0) {
      out.push({
        tone: 'bad', title: `${fmtMoneyShort(refundDue)} waiting to be refunded`,
        body: <>{count(s.refund_due_orders)} paid {Number(s.refund_due_orders) === 1 ? 'order was' : 'orders were'} cancelled or returned and not refunded yet. This money is held, not earned.</>,
        action: { label: 'Open refunds', to: '/panel/orders/refunds' },
      });
    }
    if (p) {
      const sales = change(Number(s.gross_sales), Number(p.gross_sales));
      if (sales !== null && sales <= -10) {
        out.push({
          tone: 'bad', title: `Sales down ${pct(Math.abs(sales))}`,
          body: <>{fmtMoneyShort(s.gross_sales)} against {fmtMoneyShort(p.gross_sales)} in the previous period of the same length. See which brands and items fell.</>,
          action: { label: 'Open sales insights', to: '/analytics/insights' },
        });
      } else if (sales !== null && sales >= 10) {
        out.push({
          tone: 'good', title: `Sales up ${pct(sales)}`,
          body: <>{fmtMoneyShort(s.gross_sales)} against {fmtMoneyShort(p.gross_sales)} in the previous period. See what moved so you can keep it in stock.</>,
          action: { label: 'Open sales insights', to: '/analytics/insights' },
        });
      }
      const conv = Number(s.conversion_rate ?? 0);
      const convBefore = Number(p.conversion_rate ?? 0);
      if (Number(s.sessions) >= 100 && Number(p.sessions) >= 100 && convBefore - conv >= 0.3) {
        const shop = Number(s.shopping_conversion_rate ?? 0);
        const shopBefore = Number(p.shopping_conversion_rate ?? 0);
        const fresh = Number(s.new_user_conversion ?? 0);
        const checks = Number(s.order_check_sessions ?? 0);
        const shopHeld = shopBefore - shop < 0.3;
        out.push({
          tone: shopHeld && checks > 0 ? 'info' : 'bad',
          title: shopHeld && checks > 0 ? 'Headline conversion includes people opening an old order' : 'Fewer visits turn into orders',
          body: shopHeld && checks > 0
            ? <>{conv.toFixed(1)}% of all visits ordered, down from {convBefore.toFixed(1)}%. {count(checks)} visits only opened an existing order or account. Without those, conversion is {shop.toFixed(1)}%, from {shopBefore.toFixed(1)}%. New-user conversion is {fresh.toFixed(1)}%.</>
            : <>{conv.toFixed(1)}% of visits ordered, down from {convBefore.toFixed(1)}%. Without visits that only opened an old order it is {shop.toFixed(1)}%. New-user conversion is {fresh.toFixed(1)}%. See where shoppers leave the funnel.</>,
          action: { label: 'Open the store funnel', to: '/analytics/store' },
        });
      }
    }
    const placed = Number(s.orders ?? 0) + Number(s.cancelled_orders ?? 0);
    const cancelled = Number(s.cancelled_orders ?? 0);
    if (placed >= 10 && cancelled / placed >= 0.1) {
      out.push({
        tone: 'bad', title: `${pct((cancelled / placed) * 100)} of orders cancelled`,
        body: <>{count(cancelled)} of {count(placed)} orders placed were cancelled. Check delivery outcomes for COD and RTO.</>,
        action: { label: 'Open delivery and RTO', to: '/analytics/outcomes' },
      });
    }
    if (Number(s.orders) > 0 && Number(s.sessions) === 0) {
      out.push({
        tone: 'info', title: 'Orders came in, but no visits were recorded',
        body: <>Visits are counted only from shoppers who allowed analytics in the cookie banner, so conversion cannot be worked out for this period.</>,
      });
    }
    if (analysis) {
      const top = [...analysis.weekday].sort((a, b) => b.value - a.value)[0];
      const avg = analysis.weekday.reduce((t, w) => t + w.value, 0) / 7;
      if (top && top.value > 0 && avg > 0 && top.value >= avg * 1.25) {
        out.push({
          tone: 'info', title: `${top.full} sells most`,
          body: <>{fmtMoneyShort(top.value)} on an average {top.full}, against {fmtMoneyShort(avg)} across the week. Plan offers and messages for that day.</>,
        });
      }
      if (analysis.best && Number(analysis.best.gross_sales) > 0) {
        out.push({
          tone: 'info', title: `Best day: ${fmtBucket(analysis.best.bucket, 'day')}`,
          body: <>{fmtMoneyShort(analysis.best.gross_sales)} from {count(analysis.best.orders)} orders.</>,
        });
      }
    }
    return out;
  }, [s, p, analysis]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500">What to act on first, then the period's numbers. Conversion counts every visit. New-user conversion leaves out people who only opened an existing order.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && (status === 403
        ? <Unavailable className="rounded-lg border bg-white p-4">Sales figures need permission to read orders. Ask the store owner to grant it.</Unavailable>
        : <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>)}
      {loading && !data && <div className="p-8 text-sm text-gray-500">Loading the period...</div>}

      {s && (
        <>
          {insights.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <KpiTile label="Gross sales" value={money(s.gross_sales)} delta={delta(s.gross_sales, p?.gross_sales)} sub="Orders not cancelled" />
            <KpiTile label="Collected" value={money(s.collected_revenue)} delta={delta(s.collected_revenue, p?.collected_revenue)} sub="Paid, less refunds" />
            <KpiTile label="Orders" value={count(s.orders)} delta={delta(s.orders, p?.orders)} sub={`${count(s.cancelled_orders)} cancelled`} />
            <KpiTile label="Average order" value={money(s.aov)} delta={delta(s.aov, p?.aov)} />
            <KpiTile label="Units sold" value={count(s.units_sold)} delta={delta(s.units_sold, p?.units_sold)} />
            <KpiTile label="Total visitors" value={count(s.sessions)} delta={delta(s.sessions, p?.sessions)} sub="Every visit" />
            <KpiTile label="New visitors" value={count(s.new_visitor_sessions)} delta={delta(s.new_visitor_sessions, p?.new_visitor_sessions)}
              sub="No earlier order. Guests count." />
            <KpiTile label="Registered visitors" value={count(s.registered_visitors)} delta={delta(s.registered_visitors, p?.registered_visitors)}
              sub="Signed in on the visit" />
            <KpiTile label="Conversion" value={`${Number(s.conversion_rate ?? 0).toFixed(1)}%`}
              delta={delta(s.conversion_rate, p?.conversion_rate, { mode: 'points' })} sub="Every visit, including an old order" />
            <KpiTile label="New-user conversion" value={`${Number(s.new_user_conversion ?? 0).toFixed(1)}%`}
              delta={delta(s.new_user_conversion, p?.new_user_conversion, { mode: 'points' })} sub="First orders over new visits" />
            <KpiTile label="Order checks" value={count(s.order_check_sessions)} delta={delta(s.order_check_sessions, p?.order_check_sessions)}
              sub="Only an existing order or account" />
            <KpiTile label="New buyers" value={count(s.new_customers)} delta={delta(s.new_customers, p?.new_customers)} sub="First order in the period" />
          </div>
          <p className="text-sm text-gray-500">
            A new visitor is a visit that looked at the shop, not one that only opened an existing order, tracking, the account, login, or a pay link for an order already placed. A guest counts as new, because that visit is not tied to an earlier order. A signed-in customer counts as new only when they had not ordered before this period. The conversion above still divides orders by every visit, so people checking an old order pull that rate down. New-user conversion is first orders divided by the new visits. A first order with no recorded visit still counts in that rate.
          </p>

          <ProfitFunnel range={range} allowed={hasPerm('accounting.read')} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ChartCard title="Sales over time" sub="Gross (orders not cancelled) against collected">
                <TimeSeries data={data.timeseries} granularity={bucket} money
                  series={[
                    { key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true },
                    { key: 'collected_revenue', name: 'Collected', color: SERIES[2], kind: 'line', money: true },
                  ]} />
              </ChartCard>
            </div>
            <ChartCard title="Payment methods" sub="Orders in the period">
              <Donut data={(data.payment_split ?? []).map((r: any) => ({ name: r.method, value: r.orders }))} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Orders over time">
              <TimeSeries data={data.timeseries} granularity={bucket} height={200}
                series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
            </ChartCard>
            {analysis ? (
              <ChartCard title="Weekday pattern" sub="Average gross sales per weekday">
                <CategoryBars data={analysis.weekday.map((w) => ({ label: w.label, value: w.value }))} height={200} money />
              </ChartCard>
            ) : (
              <Unavailable className="rounded-lg border bg-white p-6">
                The weekday pattern needs daily figures. Pick a period of about three months or less.
              </Unavailable>
            )}
          </div>
        </>
      )}

      {!loading && !error && data && !s && <Unavailable>No figures for this period.</Unavailable>}

      <ShopperReport range={range} orderChecks={s ? Number(s.order_check_sessions ?? 0) : null} />
    </div>
  );
};

export default AnalyticsDashboard;
