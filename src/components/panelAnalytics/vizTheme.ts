/**
 * Chart theme for panel dashboards — the dataviz skill's validated reference
 * palette (light mode). Slot ORDER is the CVD-safety mechanism: assign series
 * colors in this fixed order by entity, never cycled or re-ranked by value.
 * Status colors are reserved for state (never "series 4") and always ship with
 * an icon/label, never color alone.
 */
export const SERIES = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
} as const;

/** Compact Indian-locale number (12.3K, 1.2L style via en-IN compact). */
export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);

/** Compact rupee amount for axis ticks / tiles. */
export const fmtMoneyCompact = (n: number): string => `₹${fmtCompact(n ?? 0)}`;

/** 'YYYY-MM-DD' bucket → short label; month buckets show "Jul 26". No Date parsing. */
export function fmtBucket(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const [y, m, d] = String(bucket ?? '').split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[Number(m) - 1] ?? m;
  if (granularity === 'month') return `${mon} ${String(y).slice(2)}`;
  return `${Number(d)} ${mon}`;
}
