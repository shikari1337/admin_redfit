/**
 * Dashboard ▸ Month & year — the financial year month by month, against the
 * year before, and every financial year since the first order.
 *
 * Months and years come from ONE all-time monthly read (shared with the
 * attention board). The headline tiles are a separate pair of reads over the
 * exact same span this year and last year (1 Apr to today vs 1 Apr to the same
 * day last year), because a month bucket cannot say "to the same date".
 * This year wears the series colour; last year is a neutral grey — emphasis,
 * not a second hue.
 */
import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { usePanelStats } from '../panelAnalytics/usePanelStats';
import { ChartCard, KpiTile, TimeSeries, TwinTable, Unavailable, type TileDelta } from '../panelAnalytics/Kit';
import { SERIES } from '../panelAnalytics/vizTheme';
import { fmtRupees } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  currentMonthBucket, fyLabel, fyMonths, fyOptions, fyStartYear, fyToDate, monthName, rangeLabel, yearBefore,
} from './periods';
import { todayIso } from '@/utils/date';
import {
  BlockTitle, FilterRow, FySelect, Toggle, csvMoney, downloadCsv, fmtInt, fmtPct, lastYearGrey, pctChange,
  useAllTimeMonthly,
} from './shared';

type MonthRow = { bucket: string; orders: number; gross_sales: number; collected_revenue: number; cancelled: number; units: number; new_customers: number };

interface FyMonth {
  bucket: string;
  label: string;
  future: boolean;
  cur: MonthRow | null;
  last: MonthRow | null;
}

const MONTH_FIELDS = ['orders', 'gross_sales', 'collected_revenue', 'cancelled', 'units', 'new_customers'] as const;

export const MonthYearTab: React.FC = () => {
  const { hasPerm } = useAuth();
  const salesRead = hasPerm('orders.read');
  const all = useAllTimeMonthly(salesRead);
  const months: MonthRow[] = all.data?.timeseries ?? [];
  const byBucket = useMemo(() => new Map(months.map((m) => [m.bucket, m])), [months]);
  const firstBucket = months.find((m) => m.orders > 0 || m.cancelled > 0)?.bucket ?? null;
  const options = fyOptions(firstBucket);
  const currentFy = fyStartYear(todayIso());
  const [fy, setFy] = useState(currentFy);
  const [compare, setCompare] = useState(true);
  const thisMonth = currentMonthBucket();

  const span = fyToDate(fy);
  const lastSpan = yearBefore(span);
  const ytd = usePanelStats<any>('commerce', span, salesRead, { granularity: 'month' });
  const lytd = usePanelStats<any>('commerce', lastSpan, salesRead && compare, { granularity: 'month' });
  const s = ytd.data?.summary;
  // No comparison against a year that is wholly before the store's first order.
  const lastYearHasHistory = !!firstBucket && lastSpan.to >= firstBucket;
  const ls = compare && lastYearHasHistory ? lytd.data?.summary : null;
  const vs = `vs ${rangeLabel(lastSpan, true)}`;
  const delta = (key: string, value?: (x: any) => number): TileDelta | null => {
    if (!s || !ls) return null;
    const read = value ?? ((x: any) => Number(x?.[key] ?? 0));
    return { current: read(s), previous: read(ls), label: vs, goodWhen: 'up' };
  };
  const isToDate = span.to < `${fy + 1}-03-31`;

  // The twelve months of the chosen year, this year and last, from the all-time read.
  // A month inside the store's history with no row had no orders (a real 0);
  // one before the first order, or still to come, has no figure at all.
  const fyRows: FyMonth[] = useMemo(() => {
    const prevMonths = fyMonths(fy - 1);
    const read = (b: string): MonthRow | null => {
      if (b > thisMonth || !firstBucket || b < firstBucket) return null;
      return byBucket.get(b) ?? { bucket: b, orders: 0, gross_sales: 0, collected_revenue: 0, cancelled: 0, units: 0, new_customers: 0 };
    };
    return fyMonths(fy).map((b, i) => ({
      bucket: b,
      label: monthName(b),
      future: b > thisMonth,
      cur: read(b),
      last: read(prevMonths[i]),
    }));
  }, [fy, byBucket, thisMonth, firstBucket]);

  // Chart rows: null (not 0) for a month that has not happened or has no history.
  const chartRows = fyRows.map((m) => ({
    label: m.label,
    bucket: m.bucket,
    this_gross: m.cur ? m.cur.gross_sales : null,
    last_gross: compare && m.last ? m.last.gross_sales : null,
    this_orders: m.cur ? m.cur.orders : null,
    last_orders: compare && m.last ? m.last.orders : null,
  }));
  let runThis = 0;
  let runLast = 0;
  const runningRows = fyRows.map((m) => {
    if (m.cur) runThis += m.cur.gross_sales;
    if (m.last) runLast += m.last.gross_sales;
    return {
      label: m.label,
      this_run: m.cur ? runThis : null,
      last_run: compare && m.last ? runLast : null,
    };
  });

  // Every financial year since the first order.
  const years = useMemo(() => {
    const map = new Map<number, { fy: number; orders: number; gross: number; collected: number; months: number }>();
    for (const m of months) {
      const y = fyStartYear(m.bucket);
      const cur = map.get(y) ?? { fy: y, orders: 0, gross: 0, collected: 0, months: 0 };
      cur.orders += Number(m.orders) || 0;
      cur.gross += Number(m.gross_sales) || 0;
      cur.collected += Number(m.collected_revenue) || 0;
      if ((Number(m.orders) || 0) + (Number(m.cancelled) || 0) > 0) cur.months += 1;
      map.set(y, cur);
    }
    return [...map.values()].sort((a, b) => a.fy - b.fy).map((y) => ({
      ...y,
      label: `${fyLabel(y.fy)}${y.fy === currentFy ? ' to date' : ''}`,
      short: `${String(y.fy).slice(2)}-${String(y.fy + 1).slice(2)}${y.fy === currentFy ? ' (so far)' : ''}`,
      aov: y.orders > 0 ? y.gross / y.orders : 0,
    }));
  }, [months, currentFy]);

  // Month table.
  const tableRows = fyRows.map((m) => {
    if (!m.cur) {
      return { month: monthName(m.bucket, true), empty: true, future: m.future };
    }
    const c = m.cur;
    return {
      month: monthName(m.bucket, true) + (m.bucket === thisMonth ? ' (so far)' : ''),
      orders: c.orders,
      gross: c.gross_sales,
      collected: c.collected_revenue,
      aov: c.orders > 0 ? c.gross_sales / c.orders : null,
      cancelled: c.cancelled,
      last_gross: m.last ? m.last.gross_sales : null,
      vs: m.last ? pctChange(c.gross_sales, m.last.gross_sales) : null,
    };
  });
  const filled = fyRows.filter((m) => m.cur);
  const tot = filled.reduce((acc, m) => {
    for (const f of MONTH_FIELDS) acc[f] = (acc[f] ?? 0) + (Number(m.cur![f]) || 0);
    return acc;
  }, {} as Record<string, number>);
  const lastSameMonths = filled.reduce((sum, m) => sum + (m.last ? m.last.gross_sales : 0), 0);
  const footer = filled.length ? {
    month: `Total, ${filled.length} month${filled.length === 1 ? '' : 's'}`,
    orders: tot.orders, gross: tot.gross_sales, collected: tot.collected_revenue,
    aov: tot.orders > 0 ? tot.gross_sales / tot.orders : null, cancelled: tot.cancelled,
    last_gross: compare && lastSameMonths > 0 ? lastSameMonths : null,
    vs: compare ? pctChange(tot.gross_sales, lastSameMonths) : null,
  } : undefined;
  const money = (v: any, row: any) => (row?.empty ? '' : v === null || v === undefined ? '—' : fmtRupees(v));
  const int = (v: any, row: any) => (row?.empty ? '' : fmtInt(v));
  const monthColumns = [
    { key: 'month', label: 'Month', format: (v: any, row: any) => (
      <span className={cn(row?.empty && 'text-gray-400')}>{v}{row?.empty ? (row?.future ? ' · not yet' : ' · before your first order') : ''}</span>) },
    { key: 'orders', label: 'Orders', format: int },
    { key: 'gross', label: 'Gross sales', format: money },
    { key: 'collected', label: 'Collected', format: money },
    { key: 'aov', label: 'Average order', format: money },
    { key: 'cancelled', label: 'Cancelled', format: int },
    ...(compare ? [
      { key: 'last_gross', label: `Gross, ${fyLabel(fy - 1)}`, format: money },
      { key: 'vs', label: 'vs last year', format: (v: any, row: any) => (row?.empty ? '' : fmtPct(v, true)) },
    ] : []),
  ];

  const exportCsv = () => {
    const header = ['Month', 'Orders', 'Gross sales', 'Collected', 'Average order', 'Cancelled',
      ...(compare ? [`Gross sales ${fyLabel(fy - 1)}`, 'vs last year %'] : [])];
    const rows: unknown[][] = [header];
    tableRows.forEach((r: any) => rows.push(r.empty
      ? [r.month]
      : [r.month, r.orders, csvMoney(r.gross), csvMoney(r.collected), csvMoney(r.aov), r.cancelled,
        ...(compare ? [csvMoney(r.last_gross), r.vs === null ? null : Math.round(r.vs * 10) / 10] : [])]));
    if (footer) {
      rows.push([footer.month, footer.orders, csvMoney(footer.gross), csvMoney(footer.collected), csvMoney(footer.aov), footer.cancelled,
        ...(compare ? [csvMoney(footer.last_gross), footer.vs === null ? null : Math.round(footer.vs * 10) / 10] : [])]);
    }
    downloadCsv(`sales-by-month-${fyLabel(fy).replace(/\s+/g, '-')}.csv`, rows);
  };

  if (!salesRead) {
    return <Unavailable className="rounded-xl border border-gray-200 bg-white p-4">Sales figures need permission to read orders.</Unavailable>;
  }

  const grey = lastYearGrey();
  const thisName = fyLabel(fy);
  const lastName = fyLabel(fy - 1);
  const dim = (ytd.loading && !!ytd.data) || (all.loading && !!all.data);

  return (
    <div className="space-y-5" data-tab-panel="months">
      <FilterRow aside={dim ? 'Updating…' : (isToDate ? `${thisName} so far: ${rangeLabel(span, true)}` : `${thisName}: 1 April to 31 March`)}>
        <FySelect value={fy} options={options} onChange={setFy} testId="fy-select" />
        <Toggle checked={compare} onChange={setCompare} label="Compare with last year" testId="compare-toggle" />
      </FilterRow>

      {(ytd.error || all.error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Could not load sales: {ytd.error || all.error}</div>
      )}

      {!s && ytd.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : s ? (
        <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-5 transition-opacity', dim && 'opacity-60')}>
          <KpiTile testId="fy-tile-gross" className="col-span-2 lg:col-span-1" label={`Gross sales${isToDate ? ', year to date' : ''}`}
            value={fmtRupees(s.gross_sales)} delta={delta('gross_sales')} />
          <KpiTile testId="fy-tile-orders" label="Orders" value={fmtInt(s.orders)} delta={delta('orders')} />
          <KpiTile testId="fy-tile-aov" label="Average order" value={fmtRupees(s.aov)} delta={delta('aov')} />
          <KpiTile testId="fy-tile-new" label="New buyers" value={fmtInt(s.new_customers)} delta={delta('new_customers')} />
          <KpiTile testId="fy-tile-collected" label="Collected" value={fmtRupees(s.collected_revenue)} delta={delta('collected_revenue')} />
        </div>
      ) : null}

      <div className={cn('space-y-5 transition-opacity', all.loading && !!all.data && 'opacity-60')}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <ChartCard title="Sales by month" testId="chart-fy-sales"
              sub={compare ? `${thisName} against ${lastName}, April to March` : `${thisName}, April to March`}
              table={{
                columns: [
                  { key: 'label', label: 'Month' },
                  { key: 'this_gross', label: thisName, format: (v) => (v === null ? '' : fmtRupees(v)) },
                  ...(compare ? [{ key: 'last_gross', label: lastName, format: (v: any) => (v === null ? '' : fmtRupees(v)) }] : []),
                ],
                rows: chartRows,
              }}>
              <TimeSeries data={chartRows} granularity="month" money xKey="label" xFormat={(v) => String(v)}
                tooltipLabel={(l) => String(l)}
                series={[
                  { key: 'this_gross', name: thisName, color: SERIES[0], kind: 'bar', money: true },
                  ...(compare ? [{ key: 'last_gross', name: lastName, color: grey, kind: 'bar' as const, money: true }] : []),
                ]} />
            </ChartCard>
          </div>
          <div className="min-w-0">
            <ChartCard title="Orders by month" testId="chart-fy-orders"
              sub={compare ? `${thisName} against ${lastName}` : thisName}
              table={{
                columns: [
                  { key: 'label', label: 'Month' },
                  { key: 'this_orders', label: thisName, format: (v) => (v === null ? '' : fmtInt(v)) },
                  ...(compare ? [{ key: 'last_orders', label: lastName, format: (v: any) => (v === null ? '' : fmtInt(v)) }] : []),
                ],
                rows: chartRows,
              }}>
              <TimeSeries data={chartRows} granularity="month" xKey="label" xFormat={(v) => String(v)}
                tooltipLabel={(l) => String(l)}
                series={[
                  ...(compare ? [{ key: 'last_orders', name: lastName, color: grey, kind: 'line' as const }] : []),
                  { key: 'this_orders', name: thisName, color: SERIES[0], kind: 'line' },
                ]} />
            </ChartCard>
          </div>
        </div>

        <ChartCard title="Running total" testId="chart-fy-running"
          sub={compare
            ? 'Are we ahead? Sales added up month by month. The current month counts what has come in so far.'
            : 'Sales added up month by month'}
          table={{
            columns: [
              { key: 'label', label: 'Month' },
              { key: 'this_run', label: `${thisName} so far`, format: (v) => (v === null ? '' : fmtRupees(v)) },
              ...(compare ? [{ key: 'last_run', label: `${lastName} so far`, format: (v: any) => (v === null ? '' : fmtRupees(v)) }] : []),
            ],
            rows: runningRows,
          }}>
          <TimeSeries data={runningRows} granularity="month" money xKey="label" xFormat={(v) => String(v)} height={240}
            tooltipLabel={(l) => `By the end of ${l}`}
            series={[
              ...(compare ? [{ key: 'last_run', name: lastName, color: grey, kind: 'line' as const, money: true }] : []),
              { key: 'this_run', name: thisName, color: SERIES[0], kind: 'area', money: true },
            ]} />
        </ChartCard>

        <div className="space-y-2">
          <BlockTitle aside={firstBucket ? `Since ${monthName(firstBucket, true)}, your first order` : undefined}>Year by year</BlockTitle>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <ChartCard title="Sales by financial year" testId="chart-years-sales"
                sub="Each financial year runs 1 April to 31 March"
                table={{
                  columns: [
                    { key: 'label', label: 'Year' },
                    { key: 'months', label: 'Months with sales', format: (v) => fmtInt(v) },
                    { key: 'orders', label: 'Orders', format: (v) => fmtInt(v) },
                    { key: 'gross', label: 'Gross sales', format: (v) => fmtRupees(v) },
                    { key: 'collected', label: 'Collected', format: (v) => fmtRupees(v) },
                    { key: 'aov', label: 'Average order', format: (v) => fmtRupees(v) },
                  ],
                  rows: years,
                }}>
                {years.length ? (
                  <TimeSeries data={years} granularity="month" money xKey="short" xFormat={(v) => `FY ${v}`} height={220}
                    tooltipLabel={(_l, payload) => payload?.[0]?.payload?.label ?? ''}
                    series={[{ key: 'gross', name: 'Gross sales', color: SERIES[0], kind: 'bar', money: true }]} />
                ) : <Unavailable>No sales yet.</Unavailable>}
              </ChartCard>
            </div>
            <div className="min-w-0">
              <ChartCard title="Orders by financial year" testId="chart-years-orders" sub="Orders placed, cancellations left out"
                table={{
                  columns: [{ key: 'label', label: 'Year' }, { key: 'orders', label: 'Orders', format: (v) => fmtInt(v) }],
                  rows: years,
                }}>
                {years.length ? (
                  <TimeSeries data={years} granularity="month" xKey="short" xFormat={(v) => `FY ${v}`} height={220}
                    tooltipLabel={(_l, payload) => payload?.[0]?.payload?.label ?? ''}
                    series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
                ) : <Unavailable>No orders yet.</Unavailable>}
              </ChartCard>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="month-table">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
            <div>
              <div className="font-semibold text-gray-900">{thisName}, month by month</div>
              <div className="mt-0.5 text-xs text-gray-500">Months still to come are left empty{compare ? ' · vs last year compares gross sales with the same month' : ''}</div>
            </div>
            <button type="button" onClick={exportCsv} data-testid="month-csv"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download aria-hidden className="size-4" />Download CSV
            </button>
          </div>
          <div className="p-3">
            <TwinTable columns={monthColumns} rows={tableRows} footer={footer} maxHeight={560} testId="month-table-grid" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthYearTab;
