import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, Bar, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { token } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { fmtRupees } from '@/lib/money';
import { INK, SERIES, fmtBucket, fmtMoneyCompact, fmtCompact } from './vizTheme';
import { StatCard, SectionCard } from '../erp';
import { CARD } from '../erp/Card';

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

// ─── Table twin ──────────────────────────────────────────────────────────────

export interface TwinColumn {
  key: string;
  label: string;
  /** Numbers right-aligned (and tabular); text left. Default: right unless it is the first column. */
  align?: 'left' | 'right';
  format?: (value: any, row: any) => React.ReactNode;
}
export interface TableTwinSpec {
  columns: TwinColumn[];
  rows: any[];
  /** A totals row, styled apart from the data. */
  footer?: any;
  /** Shown when there are no rows. */
  empty?: string;
}

/** The table every chart can be read as instead — no value is reachable only by hovering. */
export const TwinTable: React.FC<TableTwinSpec & { maxHeight?: number; testId?: string }> = ({
  columns, rows, footer, empty = 'Nothing to show.', maxHeight = 420, testId,
}) => {
  const alignOf = (c: TwinColumn, i: number) => c.align ?? (i === 0 ? 'left' : 'right');
  const cell = (c: TwinColumn, row: any) => (c.format ? c.format(row?.[c.key], row) : row?.[c.key]);
  return (
    <div className="overflow-auto rounded-md border border-gray-100" style={{ maxHeight }} data-testid={testId}>
      <table className="w-full min-w-max text-sm">
        <thead className="sticky top-0 z-[1] bg-gray-50 text-xs text-gray-500">
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col"
                className={cn('whitespace-nowrap px-3 py-2 font-medium', alignOf(c, i) === 'right' ? 'text-right' : 'text-left')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-4 text-gray-500">{empty}</td></tr>
          )}
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50">
              {columns.map((c, i) => (
                <td key={c.key}
                  className={cn('whitespace-nowrap px-3 py-1.5', alignOf(c, i) === 'right' ? 'text-right tabular-nums' : 'text-left text-gray-700')}>
                  {cell(c, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 font-semibold">
            <tr>
              {columns.map((c, i) => (
                <td key={c.key}
                  className={cn('whitespace-nowrap px-3 py-2', alignOf(c, i) === 'right' ? 'text-right tabular-nums' : 'text-left')}>
                  {cell(c, footer)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

// ─── Segmented control ───────────────────────────────────────────────────────

export const Segmented: React.FC<{
  options: ReadonlyArray<{ key: string; label: React.ReactNode }>;
  value: string;
  onChange: (key: string) => void;
  label: string;
  size?: 'sm' | 'md';
  testId?: string;
}> = ({ options, value, onChange, label, size = 'md', testId }) => (
  <div role="group" aria-label={label} data-testid={testId}
    className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
    {options.map((o) => (
      <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
        className={cn(
          'rounded-md font-medium transition-colors',
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
          value === o.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800',
        )}>
        {o.label}
      </button>
    ))}
  </div>
);

// ─── Chart card ──────────────────────────────────────────────────────────────

/**
 * A titled card for one chart. With `table`, the header gets a Chart · Table
 * switch so every value is readable without hovering. `dim` holds the last
 * render at reduced opacity while a refetch is in flight (no skeleton flash).
 */
export const ChartCard: React.FC<{
  title: string; sub?: React.ReactNode; children: React.ReactNode;
  table?: TableTwinSpec; action?: React.ReactNode; dim?: boolean; className?: string; testId?: string;
}> = ({ title, sub, children, table, action, dim, className, testId }) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const headerAction = (table || action) ? (
    <div className="flex items-center gap-2">
      {action}
      {table && (
        <Segmented size="sm" label={`${title}: show as`} value={view} onChange={(k) => setView(k as any)}
          options={[{ key: 'chart', label: 'Chart' }, { key: 'table', label: 'Table' }]} />
      )}
    </div>
  ) : undefined;
  return (
    <SectionCard title={title} description={sub} action={headerAction} className={cn('overflow-visible', className)}>
      <div data-testid={testId} aria-busy={dim || undefined}
        className={cn('min-w-0 transition-opacity duration-200', dim && 'opacity-50')}>
        {table && view === 'table' ? <TwinTable {...table} /> : children}
      </div>
    </SectionCard>
  );
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

/**
 * The tooltip every chart shares. Values lead (strong ink), series names
 * follow (secondary ink), each row keyed by a short stroke of its series
 * colour — the mark beside the text carries identity, never the text itself.
 */
export const VizTooltip: React.FC<{
  active?: boolean; payload?: any[]; label?: any;
  labelFormat?: (label: any, payload: any[]) => React.ReactNode;
  valueFormat?: (value: number, item: any) => string;
}> = ({ active, payload, label, labelFormat, valueFormat }) => {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => p && p.value !== null && p.value !== undefined);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-surface-raised px-3 py-2 text-xs shadow-md">
      <div className="mb-1 text-gray-500">{labelFormat ? labelFormat(label, payload) : String(label ?? '')}</div>
      <div className="space-y-0.5">
        {rows.map((p, i) => (
          <div key={`${p.dataKey}-${i}`} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: p.color ?? p.stroke ?? p.fill }} />
            <span className="font-semibold tabular-nums text-gray-900">
              {valueFormat ? valueFormat(Number(p.value), p) : Number(p.value).toLocaleString('en-IN')}
            </span>
            <span className="text-gray-500">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const axisProps = {
  tick: { fill: INK.muted, fontSize: 11 },
  tickLine: false as const,
  axisLine: { stroke: INK.baseline },
};

/** Legend text wears secondary ink; the swatch beside it carries the colour. */
const legendText = (value: any) => <span style={{ color: INK.secondary }}>{value}</span>;

export interface SeriesDef {
  key: string; name: string; color: string;
  kind?: 'line' | 'area' | 'bar'; money?: boolean; stackId?: string;
  /** Line width; 2 by default. A comparison line (last period) is thinner. */
  strokeWidth?: number;
}

/** Time series over 'bucket' rows. One y-scale only — never mix money and counts here. */
export const TimeSeries: React.FC<{
  data: any[]; series: SeriesDef[]; granularity: 'day' | 'week' | 'month'; height?: number; money?: boolean;
  /** Row field for the x axis (default `bucket`) and how to print it. */
  xKey?: string; xFormat?: (v: any) => string;
  /** Tooltip heading; defaults to the x label. */
  tooltipLabel?: (v: any, payload: any[]) => React.ReactNode;
  legend?: boolean;
}> = ({ data, series, granularity, height = 260, money, xKey = 'bucket', xFormat, tooltipLabel, legend }) => {
  const fmtX = xFormat ?? ((b: any) => fmtBucket(String(b), granularity));
  const isMoney = (name: any) => series.find((s) => s.name === name)?.money ?? money;
  // In a stack only the top segment gets the rounded data end.
  const lastInStack = new Map<string, string>();
  series.forEach((s) => { if (s.kind === 'bar' && s.stackId) lastInStack.set(s.stackId, s.key); });
  const showLegend = legend ?? series.length >= 2;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={fmtX} minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={(v) => (money ? fmtMoneyCompact(v) : fmtCompact(v))} />
        <Tooltip
          cursor={{ stroke: INK.baseline, strokeWidth: 1, fill: INK.grid, fillOpacity: 0.35 }}
          content={(
            <VizTooltip
              labelFormat={(l, p) => (tooltipLabel ? tooltipLabel(l, p) : fmtX(l))}
              valueFormat={(v, item) => (isMoney(item?.name) ? fmtRupees(v) : v.toLocaleString('en-IN'))} />
          )} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
        {series.map((s) =>
          s.kind === 'area' ? (
            <Area key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.strokeWidth ?? 2}
              fill={s.color} fillOpacity={0.1} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: token('surface') }}
              legendType="rect" isAnimationActive={false} />
          ) : s.kind === 'bar' ? (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stackId}
              radius={!s.stackId || lastInStack.get(s.stackId) === s.key ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              stroke={s.stackId ? token('surface') : undefined} strokeWidth={s.stackId ? 2 : 0}
              maxBarSize={28} legendType="rect" isAnimationActive={false} />
          ) : (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.strokeWidth ?? 2}
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: token('surface') }}
              legendType="plainline" connectNulls={false} isAnimationActive={false} />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

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
            paddingAngle={2} stroke={token('surface')} strokeWidth={2} isAnimationActive={false}>
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

// ─── Split bar (part-to-whole, one row) ──────────────────────────────────────

export interface SplitRow { key: string; name: string; value: number; color: string; detail?: React.ReactNode }

/**
 * A single 100% bar split into parts, with the parts listed under it (name,
 * value, share) — the list is the bar's table twin. Colours are passed in by
 * the caller (by entity for identity, an ordered ramp for ageing). Each part
 * answers hover and keyboard focus with its own tooltip.
 */
export const SplitBar: React.FC<{
  rows: SplitRow[]; format?: (v: number) => string; height?: number; testId?: string; label: string;
}> = ({ rows, format = (v) => v.toLocaleString('en-IN'), height = 14, testId, label }) => {
  const [hover, setHover] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  const visible = rows.map((r, i) => ({ ...r, i })).filter((r) => r.value > 0);
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const fmtShare = (v: number) => {
    const p = share(v);
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  };
  return (
    <div data-testid={testId}>
      <div className="relative">
        <div role="img" aria-label={`${label}: ${rows.map((r) => `${r.name} ${format(r.value)}`).join(', ')}`}
          className="flex w-full gap-[2px] overflow-hidden rounded" style={{ height }}>
          {total === 0 && <div className="h-full w-full bg-gray-100" />}
          {visible.map((r) => (
            <button key={r.key} type="button"
              aria-label={`${r.name}: ${format(r.value)} (${fmtShare(r.value)})`}
              onMouseEnter={() => setHover(r.i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.i)} onBlur={() => setHover(null)}
              className={cn('h-full min-w-[3px] outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-focus',
                hover !== null && hover !== r.i && 'opacity-60')}
              style={{ flexGrow: r.value, flexBasis: 0, background: r.color }} />
          ))}
        </div>
        {hover !== null && rows[hover] && (
          <div role="tooltip" className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-gray-200 bg-surface-raised px-3 py-1.5 text-xs shadow-md">
            <span className="font-semibold tabular-nums text-gray-900">{format(rows[hover].value)}</span>
            <span className="ml-2 text-gray-500">{rows[hover].name} · {fmtShare(rows[hover].value)}</span>
          </div>
        )}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.key} className={cn('flex items-center justify-between gap-3', hover === i && 'text-gray-900')}>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
              <span className="truncate text-gray-700">{r.name}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular-nums text-gray-900">{format(r.value)}</span>
              <span className="ml-2 inline-block w-10 text-xs tabular-nums text-gray-400">{fmtShare(r.value)}</span>
              {r.detail && <span className="ml-2 text-xs text-gray-500">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * An ordered ramp from one series hue (lightest → strongest), for ordinal
 * categories such as ageing buckets — never for identity. Mixed with the
 * surface, so it reads the same way in both themes.
 */
export function ordinalRamp(steps: number, base = '--viz-1'): string[] {
  if (steps <= 1) return [`var(${base})`];
  return Array.from({ length: steps }, (_, i) => {
    const pct = Math.round(28 + (72 * i) / (steps - 1));
    return pct >= 100 ? `var(${base})` : `color-mix(in oklab, var(${base}) ${pct}%, var(--surface))`;
  });
}

// ─── KPI tile (with delta + sparkline) ───────────────────────────────────────

export interface TileDelta {
  current: number;
  previous: number | null | undefined;
  /** The named period, e.g. "vs yesterday" / "vs 1 Sep to 2 Sep". */
  label: string;
  /** Which direction is good news. Neutral = never green or red. */
  goodWhen?: 'up' | 'down' | 'neutral';
}

function deltaParts(d: TileDelta): { text: string; dir: 'up' | 'down' | 'flat'; spoken: string } | null {
  if (d.previous === null || d.previous === undefined || !Number.isFinite(d.previous)) return null;
  const cur = Number(d.current) || 0;
  const prev = Number(d.previous) || 0;
  if (prev === 0 && cur === 0) return { text: 'No change', dir: 'flat', spoken: `No change ${d.label}` };
  if (prev === 0) return { text: 'Up from 0', dir: 'up', spoken: `Up from zero ${d.label}` };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { text: '0%', dir: 'flat', spoken: `No change ${d.label}` };
  const abs = Math.abs(pct);
  const n = abs >= 100 ? Math.round(abs).toLocaleString('en-IN') : abs.toFixed(1);
  return pct > 0
    ? { text: `+${n}%`, dir: 'up', spoken: `Up ${n}% ${d.label}` }
    : { text: `−${n}%`, dir: 'down', spoken: `Down ${n}% ${d.label}` };
}

export const DeltaLine: React.FC<{ delta: TileDelta }> = ({ delta }) => {
  const p = deltaParts(delta);
  if (!p) return null;
  const good = delta.goodWhen ?? 'up';
  const tone = p.dir === 'flat' || good === 'neutral'
    ? 'text-gray-500'
    : (p.dir === good ? 'text-good-ink' : 'text-bad-ink');
  const Icon = p.dir === 'up' ? ArrowUpRight : p.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs" aria-label={p.spoken} data-delta={p.text}>
      <Icon aria-hidden className={cn('size-3.5 shrink-0', tone)} />
      <span className={cn('font-medium', tone)}>{p.text}</span>
      <span className="text-gray-400">{delta.label}</span>
    </div>
  );
};

/**
 * A small trend line: the period in the de-emphasis ink, its latest point in
 * the accent. Gaps (null) break the line rather than inventing a zero.
 */
export const Sparkline: React.FC<{ values: Array<number | null>; height?: number; area?: boolean; className?: string }> = ({
  values, height = 28, area, className,
}) => {
  const pts = values.map((v, i) => ({ v: v === null || v === undefined || !Number.isFinite(v) ? null : Number(v), i }));
  const real = pts.filter((p) => p.v !== null) as Array<{ v: number; i: number }>;
  if (real.length < 2) return null;
  const min = Math.min(...real.map((p) => p.v));
  const max = Math.max(...real.map((p) => p.v));
  const span = max - min || 1;
  const n = Math.max(1, values.length - 1);
  const x = (i: number) => (i / n) * 100;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (p.v === null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)} `;
    pen = true;
  }
  const last = real[real.length - 1];
  const areaD = area ? `${d} L${x(last.i).toFixed(2)},${height} L${x(real[0].i).toFixed(2)},${height} Z` : '';
  return (
    <div className={cn('relative w-full', className)} style={{ height }} aria-hidden>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {area && <path d={areaD} style={{ fill: 'var(--viz-1)', fillOpacity: 0.08, stroke: 'none' }} />}
        <path d={d} vectorEffect="non-scaling-stroke"
          style={{ fill: 'none', stroke: 'var(--n-400)', strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
      </svg>
      <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${x(last.i)}%`, top: y(last.v), background: 'var(--viz-1)', boxShadow: '0 0 0 2px var(--surface)' }} />
    </div>
  );
};

/**
 * KPI tile: label · value · change vs a NAMED period · optional sparkline.
 * Values use proportional figures (no tabular-nums) — they stand alone. A
 * figure that cannot be read passes `unavailable` instead of a value: the tile
 * then says why in one quiet line rather than showing a 0 that looks real.
 */
export interface CompareRow { label: string; value: number; text: string; muted?: boolean }

/** This period against the one before, as two bars on one scale — the amounts, not just the change. */
export const CompareBars: React.FC<{ rows: CompareRow[]; className?: string }> = ({ rows, className }) => {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <dl className={cn('space-y-1.5 text-xs', className)} data-compare-bars>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
          <dt className="truncate text-gray-500">{r.label}</dt>
          <div className="h-2 rounded-full bg-gray-100" aria-hidden>
            <div className="h-2 rounded-full" style={{
              width: `${max > 0 ? Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100) : 0}%`,
              background: r.muted ? 'var(--n-300)' : 'var(--viz-1)',
            }} />
          </div>
          <dd className="text-right tabular-nums text-gray-700">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
};

export const KpiTile: React.FC<{
  label: React.ReactNode; value?: React.ReactNode; sub?: React.ReactNode;
  delta?: TileDelta | null; spark?: Array<number | null> | null; hero?: boolean;
  /** Hero only: this period and the one before, as amounts. */
  compareRows?: CompareRow[] | null;
  unavailable?: string; className?: string; testId?: string;
}> = ({ label, value, sub, delta, spark, hero, compareRows, unavailable, className, testId }) => (
  <div className={cn(CARD, 'flex min-w-0 flex-col', hero ? 'p-5' : 'p-4', className)} data-testid={testId}>
    <div className={cn('text-gray-600', hero ? 'text-sm font-medium' : 'text-xs font-medium')}>{label}</div>
    {unavailable ? (
      <div className="mt-2 text-sm text-gray-400" data-unavailable>{unavailable}</div>
    ) : (
      <>
        <div data-value
          className={cn('mt-1 break-words font-semibold leading-tight text-gray-900',
            hero ? 'text-4xl sm:text-5xl' : 'text-lg sm:text-2xl')}>
          {value}
        </div>
        {delta && <DeltaLine delta={delta} />}
        {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
        {(spark && spark.length >= 3) || (compareRows && compareRows.length) ? (
          <div className={cn('mt-auto', hero ? 'space-y-4 pt-5' : 'pt-3')}>
            {spark && spark.length >= 3 && <Sparkline values={spark} height={hero ? 64 : 28} area={hero} />}
            {compareRows && compareRows.length > 0 && <CompareBars rows={compareRows} />}
          </div>
        ) : null}
      </>
    )}
  </div>
);

/** The quiet line a block shows when it cannot be read — never a zero that looks real. */
export const Unavailable: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('text-sm text-gray-400', className)} data-unavailable>{children}</p>
);
