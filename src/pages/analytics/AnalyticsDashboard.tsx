import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange, PanelRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { ChartCard, TimeSeries, CategoryBars, Donut } from '../../components/panelAnalytics/Kit';
import { SERIES, INK } from '../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';

/**
 * Analytics → Dashboard. Trend + comparison analysis on server-accurate
 * numbers: every KPI carries its change vs the PREVIOUS period of equal
 * length, plus weekday pattern and best-day callouts derived from the series.
 */

function previousRange(range: PanelRange): PanelRange | null {
  if (!range.from || !range.to) return null; // all-time has no "previous"
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const pTo = new Date(from); pTo.setUTCDate(pTo.getUTCDate() - 1);
  const pFrom = new Date(pTo); pFrom.setUTCDate(pFrom.getUTCDate() - (days - 1));
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
}

const Delta: React.FC<{ cur: number; prev: number | null }> = ({ cur, prev }) => {
  if (prev === null) return null;
  if (prev === 0 && cur === 0) return <span className="text-xs text-gray-400">—</span>;
  if (prev === 0) return <span className="text-xs font-medium text-[#006300]">new</span>;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-[#006300]' : 'text-[#d03b3b]'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
};

const KpiTile: React.FC<{ label: string; value: React.ReactNode; cur: number; prev: number | null; sub?: string }> =
  ({ label, value, cur, prev, sub }) => (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <Delta cur={cur} prev={prev} />
      </div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AnalyticsDashboard: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const { data, loading, error } = usePanelStats<any>('commerce', range);
  const [prev, setPrev] = useState<any>(null);

  useEffect(() => {
    const pr = previousRange(range);
    setPrev(null);
    if (!pr) return;
    let alive = true;
    api.get('/analytics/panels/commerce', { params: { from: pr.from, to: pr.to } })
      .then((res) => { if (alive) setPrev(payload(res)); })
      .catch(() => { /* comparison unavailable — tiles just omit deltas */ });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const s = data?.summary;
  const p = prev?.summary ?? null;
  const bucket = data?.bucket ?? 'day';

  // Weekday pattern + best day from the daily series (day-bucket ranges only).
  const analysis = useMemo(() => {
    const rows: any[] = data?.timeseries ?? [];
    if (bucket !== 'day' || rows.length === 0) return null;
    const byDow = Array.from({ length: 7 }, () => ({ revenue: 0, days: 0 }));
    let best: any = null;
    for (const r of rows) {
      const dow = (new Date(`${r.bucket}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
      byDow[dow].revenue += r.gross_sales; byDow[dow].days += 1;
      if (!best || r.gross_sales > best.gross_sales) best = r;
    }
    return {
      weekday: WEEKDAYS.map((label, i) => ({
        label, value: byDow[i].days > 0 ? byDow[i].revenue / byDow[i].days : 0,
      })),
      best,
    };
  }, [data, bucket]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">Server-computed KPIs with change vs the previous period of equal length.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && !data && <div className="p-8 text-sm text-gray-500">Loading analytics…</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Gross sales" value={fmtRupees(s.gross_sales)} cur={s.gross_sales} prev={p ? p.gross_sales : null} />
            <KpiTile label="Collected revenue" value={fmtRupees(s.collected_revenue)} cur={s.collected_revenue} prev={p ? p.collected_revenue : null}
              sub="Payment completed or COD delivered" />
            <KpiTile label="Orders" value={s.orders.toLocaleString('en-IN')} cur={s.orders} prev={p ? p.orders : null}
              sub={`${s.cancelled_orders} cancelled`} />
            <KpiTile label="AOV" value={fmtRupees(s.aov)} cur={s.aov} prev={p ? p.aov : null} />
            <KpiTile label="Units sold" value={s.units_sold.toLocaleString('en-IN')} cur={s.units_sold} prev={p ? p.units_sold : null} />
            <KpiTile label="Sessions" value={s.sessions.toLocaleString('en-IN')} cur={s.sessions} prev={p ? p.sessions : null} />
            <KpiTile label="Conversion" value={`${s.conversion_rate.toFixed(1)}%`} cur={s.conversion_rate} prev={p ? p.conversion_rate : null}
              sub="Orders ÷ sessions" />
            <KpiTile label="New buyers" value={s.new_customers.toLocaleString('en-IN')} cur={s.new_customers} prev={p ? p.new_customers : null}
              sub="First order in period" />
          </div>

          {analysis?.best && analysis.best.gross_sales > 0 && (
            <div className="rounded-lg border bg-white p-4 shadow-sm text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Best day in range: </span>
              {analysis.best.bucket} — {fmtRupees(analysis.best.gross_sales)} from {analysis.best.orders} orders.
              {p && s.gross_sales > 0 && (
                <span className="ml-2 text-gray-500">
                  Period total {fmtRupees(s.gross_sales)} vs {fmtRupees(p.gross_sales)} previous.
                </span>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Revenue trend" sub="Gross (non-cancelled order value) vs collected">
                <TimeSeries data={data.timeseries} granularity={bucket} money
                  series={[
                    { key: 'gross_sales', name: 'Gross sales', color: SERIES[0], kind: 'area', money: true },
                    { key: 'collected_revenue', name: 'Collected', color: SERIES[2], kind: 'line', money: true },
                  ]} />
              </ChartCard>
            </div>
            <ChartCard title="Payment methods" sub="Orders in range">
              <Donut data={(data.payment_split ?? []).map((r: any) => ({ name: r.method, value: r.orders }))} />
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Orders per period">
              <TimeSeries data={data.timeseries} granularity={bucket} height={200}
                series={[{ key: 'orders', name: 'Orders', color: SERIES[0], kind: 'bar' }]} />
            </ChartCard>
            {analysis ? (
              <ChartCard title="Weekday pattern" sub="Average daily gross sales by weekday">
                <CategoryBars data={analysis.weekday} height={200} money />
              </ChartCard>
            ) : (
              <div className="rounded-lg border bg-white p-6 text-sm shadow-sm" style={{ color: INK.secondary }}>
                Weekday pattern is computed for daily-bucketed ranges (≤ ~3 months). Narrow the range to see it.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
