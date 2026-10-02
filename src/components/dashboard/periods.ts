/**
 * Periods for the store dashboard — the presets the period picker lists, the
 * period each one is compared with, and the financial-year arithmetic the
 * Month & year and Money tabs share.
 *
 * Every date here is a store-civil `YYYY-MM-DD` string. "Today" comes from
 * `todayIso()` (the store's own day, rule 8) — never the browser's clock and
 * never `toISOString()` on `new Date()`, which is the UTC day. Arithmetic is
 * done on UTC-noon dates built from those strings, so no zone can move a day.
 */
import { todayIso } from '@/utils/date';
import type { PanelRange } from '../panelAnalytics/DateRangeBar';

export type { PanelRange };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` → a UTC-noon Date (only ever read with UTC getters). */
function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function out(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return out(d);
}

/** Last day of the month `iso` falls in. */
export function endOfMonth(iso: string): string {
  const d = parse(iso);
  return out(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

/** Shift by whole months, keeping the day where the month allows (31 Oct − 1 → 30 Sep). */
export function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return out(target);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

const isMonthEnd = (iso: string) => endOfMonth(iso) === iso;

/** Shift a range back by `months`, keeping a month-end a month-end. */
function shiftMonths(r: Required<PanelRange>, months: number): Required<PanelRange> {
  const from = addMonths(r.from, -months);
  const to = isMonthEnd(r.to) ? endOfMonth(addMonths(`${r.to.slice(0, 8)}01`, -months)) : addMonths(r.to, -months);
  return { from, to };
}

/** The equal-length span immediately before. */
function shiftDays(r: Required<PanelRange>): Required<PanelRange> {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

// ─── Financial year (1 April) ────────────────────────────────────────────────

/** The calendar year a financial year starts in: 2 Oct 2026 → 2026 (FY 2026-27). */
export function fyStartYear(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}
export const fyLabel = (startYear: number) => `FY ${startYear}-${String(startYear + 1).slice(2)}`;
export const fyRange = (startYear: number): Required<PanelRange> =>
  ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });

/** The twelve month buckets of a financial year, April first, as `YYYY-MM-01`. */
export function fyMonths(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    const y = i < 9 ? startYear : startYear + 1;
    return `${y}-${String(m).padStart(2, '0')}-01`;
  });
}

/** "Apr" for a `YYYY-MM-DD` bucket; "Apr 2026" with `withYear`. */
export function monthName(bucket: string, withYear = false): string {
  const [y, m] = bucket.split('-');
  const name = MONTHS[Number(m) - 1] ?? m;
  return withYear ? `${name} ${y}` : name;
}

/** "2 Oct" / "2 Oct 2025" — the year only when it is not the current one. */
export function shortDay(iso: string, forceYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  const yearNow = Number(todayIso().slice(0, 4));
  return `${d} ${MONTHS[m - 1]}${forceYear || y !== yearNow ? ` ${y}` : ''}`;
}

/** "1 Sep to 2 Sep" / "2 Oct" for a single day. */
export function rangeLabel(r: PanelRange, forceYear = false): string {
  if (!r.from && !r.to) return 'All time';
  if (r.from && r.to && r.from === r.to) return shortDay(r.from, forceYear);
  const yearNow = String(todayIso().slice(0, 4));
  const needYear = forceYear || (r.from && r.from.slice(0, 4) !== yearNow) || (r.to && r.to.slice(0, 4) !== yearNow);
  return `${r.from ? shortDay(r.from, !!needYear) : 'the start'} to ${r.to ? shortDay(r.to, !!needYear) : 'today'}`;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export type PeriodGroup = 'Days' | 'Months' | 'Years';

export interface PeriodDef {
  key: string;
  label: string;
  group: PeriodGroup;
  range: () => PanelRange;
  /** The period this one is compared with, or null (all time). */
  compare: (r: PanelRange) => PanelRange | null;
  /** How the comparison is named on a tile, when a plain name reads better than dates. */
  compareName?: string;
}

/** The current Indian-FY quarter (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar), to today. */
function fyQuarter(today: string): Required<PanelRange> {
  const [y, m] = today.split('-').map(Number);
  const startMonth = [4, 4, 4, 7, 7, 7, 10, 10, 10, 1, 1, 1][(m + 8) % 12];
  const from = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  const end = endOfMonth(addMonths(from, 2));
  return { from, to: end > today ? today : end };
}

const lastNDays = (n: number) => (): PanelRange => ({ from: addDays(todayIso(), -(n - 1)), to: todayIso() });
const dayShift = (r: PanelRange) => (r.from && r.to ? shiftDays(r as Required<PanelRange>) : null);

export const PERIODS: PeriodDef[] = [
  { key: 'today', label: 'Today', group: 'Days', range: lastNDays(1), compare: dayShift, compareName: 'yesterday' },
  { key: 'yesterday', label: 'Yesterday', group: 'Days', range: () => ({ from: addDays(todayIso(), -1), to: addDays(todayIso(), -1) }), compare: dayShift, compareName: 'the day before' },
  { key: '3d', label: 'Past 3 days', group: 'Days', range: lastNDays(3), compare: dayShift, compareName: 'the 3 days before' },
  { key: '7d', label: 'Past 7 days', group: 'Days', range: lastNDays(7), compare: dayShift, compareName: 'the 7 days before' },
  { key: '14d', label: 'Past 14 days', group: 'Days', range: lastNDays(14), compare: dayShift, compareName: 'the 14 days before' },
  { key: '30d', label: 'Past 30 days', group: 'Days', range: lastNDays(30), compare: dayShift, compareName: 'the 30 days before' },
  {
    key: 'month', label: 'This month', group: 'Months',
    range: () => ({ from: `${todayIso().slice(0, 8)}01`, to: todayIso() }),
    compare: (r) => (r.from && r.to ? shiftMonths(r as Required<PanelRange>, 1) : null),
  },
  {
    key: 'lastmonth', label: 'Last month', group: 'Months',
    range: () => { const from = addMonths(`${todayIso().slice(0, 8)}01`, -1); return { from, to: endOfMonth(from) }; },
    compare: (r) => (r.from && r.to ? shiftMonths(r as Required<PanelRange>, 1) : null),
  },
  {
    key: 'fq', label: 'This quarter', group: 'Months', range: () => fyQuarter(todayIso()),
    compare: (r) => (r.from && r.to ? shiftMonths(r as Required<PanelRange>, 3) : null),
  },
  { key: '3m', label: 'Past 3 months', group: 'Months', range: lastNDays(90), compare: dayShift, compareName: 'the 3 months before' },
  { key: '12m', label: 'Past 12 months', group: 'Months', range: lastNDays(365), compare: dayShift, compareName: 'the 12 months before' },
  {
    key: 'fy', label: 'This financial year', group: 'Years',
    range: () => ({ from: fyRange(fyStartYear(todayIso())).from, to: todayIso() }),
    compare: (r) => (r.from && r.to ? shiftMonths(r as Required<PanelRange>, 12) : null),
  },
  {
    key: 'lastfy', label: 'Last financial year', group: 'Years',
    range: () => fyRange(fyStartYear(todayIso()) - 1),
    compare: (r) => (r.from && r.to ? shiftMonths(r as Required<PanelRange>, 12) : null),
  },
  { key: 'all', label: 'All time', group: 'Years', range: () => ({}), compare: () => null },
];

export const CUSTOM_PERIOD: PeriodDef = {
  key: 'custom', label: 'Custom range', group: 'Years', range: () => ({}), compare: dayShift,
};

export function periodByKey(key: string): PeriodDef {
  return PERIODS.find((p) => p.key === key) ?? (key === 'custom' ? CUSTOM_PERIOD : PERIODS[0]);
}

/** "vs yesterday" / "vs 1 Sep to 2 Sep". */
export function compareLabel(def: PeriodDef, prev: PanelRange | null): string {
  if (!prev) return '';
  if (def.key === 'today') return 'vs yesterday';
  return `vs ${rangeLabel(prev)}`;
}

export type Granularity = 'auto' | 'day' | 'week' | 'month';

/** The same span one year earlier (1 Apr to 2 Oct 2026 → 1 Apr to 2 Oct 2025). */
export function yearBefore(r: Required<PanelRange>): Required<PanelRange> {
  return shiftMonths(r, 12);
}

/** Financial year to date: 1 April to today, or the whole year once it is over. */
export function fyToDate(startYear: number): Required<PanelRange> {
  const full = fyRange(startYear);
  const today = todayIso();
  return { from: full.from, to: full.to < today ? full.to : today };
}

/** Every financial year from the first one with data to the current one, newest first. */
export function fyOptions(firstBucket: string | null | undefined): number[] {
  const current = fyStartYear(todayIso());
  const first = firstBucket ? Math.min(fyStartYear(firstBucket), current) : current;
  const out: number[] = [];
  for (let y = current; y >= first; y--) out.push(y);
  return out;
}

/** `YYYY-MM-01` for the store's current month. */
export const currentMonthBucket = () => `${todayIso().slice(0, 8)}01`;
