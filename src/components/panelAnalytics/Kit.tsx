import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, Bar, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { INK, SERIES, fmtBucket, fmtMoneyCompact, fmtCompact } from './vizTheme';
import { StatCard, SectionCard } from '../erp';

/* Shared chart building blocks for the panel dashboards. Mark specs follow the
 * dataviz skill: 2px lines without point dots, top-rounded 4px bars anchored to
 * the baseline with 2px gaps, hairline horizontal grid only, muted axis ink,
 * legend only when ≥2 series. Values in tooltips/labels wear text ink — the
 * colored mark carries identity. */

/**
 * StatTile / ChartCard are thin aliases over the shared ERP kit (StatCard /
 * SectionCard) so the dashboards and the ERP panels are ONE implementation.
 * The chart card overrides the kit card's `overflow-hidden` back to visible so
 * Recharts tooltips near a card edge are never clipped.
 */
export const StatTile: React.FC<{
  label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; accent?: string;
}> = ({ label, value, sub, accent }) => (
  <StatCard label={label} value={value} sub={sub} accent={accent} />
);

export const ChartCard: React.FC<{ title: string; sub?: string; children: React.ReactNode }> =
  ({ title, sub, children }) => (
    <SectionCard title={title} description={sub} className="overflow-visible">
      {children}
    </SectionCard>
  );

const axisProps = {
  tick: { fill: INK.muted, fontSize: 11 },
  tickLine: false as const,
  axisLine: { stroke: INK.baseline },
};

export interface SeriesDef {
  key: string; name: string; color: string;
  kind?: 'line' | 'area' | 'bar'; money?: boolean; stackId?: string;
}

/** Time series over 'bucket' rows. One y-scale only — never mix money and counts here. */
export const TimeSeries: React.FC<{
  data: any[]; series: SeriesDef[]; granularity: 'day' | 'week' | 'month'; height?: number; money?: boolean;
}> = ({ data, series, granularity, height = 260, money }) => (
  <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
      <CartesianGrid stroke={INK.grid} vertical={false} />
      <XAxis dataKey="bucket" {...axisProps} tickFormatter={(b) => fmtBucket(b, granularity)} minTickGap={24} />
      <YAxis {...axisProps} width={52} tickFormatter={(v) => (money ? fmtMoneyCompact(v) : fmtCompact(v))} />
      <Tooltip
        labelFormatter={(b) => fmtBucket(String(b), granularity)}
        formatter={(v: any, name: any) => {
          const def = series.find((s) => s.name === name);
          const isMoney = def?.money ?? money;
          return [isMoney ? `₹${Number(v).toLocaleString('en-IN')}` : Number(v).toLocaleString('en-IN'), name];
        }}
        contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: INK.grid }} />
      {series.length >= 2 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />}
      {series.map((s) =>
        s.kind === 'area' ? (
          <Area key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            fill={s.color} fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ) : s.kind === 'bar' ? (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stackId}
            radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        ) : (
          <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
    </ComposedChart>
  </ResponsiveContainer>
);

/** Category → value bars, single hue (magnitude across categories, not identity). */
export const CategoryBars: React.FC<{
  data: Array<{ label: string; value: number }>; color?: string; height?: number; money?: boolean;
}> = ({ data, color = SERIES[0], height = 240, money }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
      <CartesianGrid stroke={INK.grid} vertical={false} />
      <XAxis dataKey="label" {...axisProps} interval={0} />
      <YAxis {...axisProps} width={52} tickFormatter={(v) => (money ? fmtMoneyCompact(v) : fmtCompact(v))} />
      <Tooltip
        formatter={(v: any) => (money ? `₹${Number(v).toLocaleString('en-IN')}` : Number(v).toLocaleString('en-IN'))}
        contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: INK.grid }} />
      <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
);

/**
 * Donut for a small split (≤5 slices + Other). Slice colors follow the fixed
 * slot order of first appearance; 2px white gaps separate fills.
 */
export const Donut: React.FC<{
  data: Array<{ name: string; value: number }>; height?: number; money?: boolean;
}> = ({ data, height = 240, money }) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, r) => s + r.value, 0);
  const rows = rest > 0 ? [...head, { name: 'Other', value: rest }] : head;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%"
            paddingAngle={2} stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
            {rows.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v: any) => (money ? `₹${Number(v).toLocaleString('en-IN')}` : Number(v).toLocaleString('en-IN'))}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: INK.grid }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="truncate capitalize text-gray-700">{r.name}</span>
            </span>
            <span className="font-mono text-gray-900">
              {money ? fmtMoneyCompact(r.value) : r.value.toLocaleString('en-IN')}
              <span className="ml-1 text-xs text-gray-400">
                {total > 0 ? `${Math.round((r.value / total) * 100)}%` : ''}
              </span>
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-gray-500">No data in range.</div>}
      </div>
    </div>
  );
};
