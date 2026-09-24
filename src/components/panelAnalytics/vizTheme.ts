/**
 * Chart theme for panel dashboards.
 *
 * The colours are no longer written here: they come from the one theme
 * (`src/styles/theme.css`, mirrored from `suite/packages/kit/src/theme.json`) and
 * are read through `src/lib/theme.ts`. Charts need RESOLVED values — recharts puts
 * them on SVG `fill`/`stroke` attributes, where `var()` is not allowed — so each
 * name below is a live getter rather than a stored string. Reading it is a cached
 * Map lookup, and the cache is dropped when the theme changes, so a chart follows
 * the theme without a reload.
 *
 * Slot ORDER is the colour-vision-deficiency safety mechanism: assign series
 * colours in this fixed order by entity, never cycled or re-ranked by value.
 * Status colours are reserved for state (never "series 4") and always ship with an
 * icon or a label, never colour alone.
 */
import { cssVar, token, vizSeries } from '@/lib/theme';

/**
 * The eight categorical series. Indexable and `.length`-able exactly as before —
 * each read resolves from the theme, so consumers did not have to change.
 */
export const SERIES: readonly string[] = new Proxy([] as string[], {
  get: (_t, prop) => {
    const live = vizSeries();
    const v = Reflect.get(live, prop, live);
    return typeof v === 'function' ? v.bind(live) : v;
  },
  has: (_t, prop) => Reflect.has(vizSeries(), prop),
  ownKeys: () => Reflect.ownKeys(vizSeries()),
  getOwnPropertyDescriptor: (_t, prop) => {
    const d = Reflect.getOwnPropertyDescriptor(vizSeries(), prop);
    return d ? { ...d, configurable: true } : d;
  },
});

/** State, never a series. Four steps from "fine" to "deal with this now". */
export const STATUS = {
  get good() { return token('good'); },
  get warning() { return token('warn'); },
  get serious() { return cssVar('--d-400'); },  // between attention and failure
  get critical() { return token('bad'); },
} as const;

/** The non-data ink of a chart: labels, gridlines, the baseline. */
export const INK = {
  get primary() { return token('ink'); },
  get secondary() { return token('inkSoft'); },
  get muted() { return token('inkMute'); },
  get grid() { return token('vizGrid'); },
  get baseline() { return token('vizAxis'); },
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
