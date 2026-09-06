import { format as dfFormat } from 'date-fns';

/**
 * THE date module for the admin panel — one timezone, one set of formatters.
 *
 * Two problems, both of which showed up as "the analytics say one time and the
 * rest of the page says another":
 *
 *  1. Every timestamp the API returns is an absolute instant (`timestamptz`).
 *     `toLocaleDateString()` / date-fns `format()` render it in the VIEWER's
 *     browser timezone. The server, meanwhile, computes every day boundary,
 *     report bucket and GST period in the STORE's timezone. So a staff member
 *     on a laptop set to anything but the store's zone — or simply travelling —
 *     saw orders on a different calendar day than the dashboard totals that
 *     counted them, and the two could never be reconciled.
 *  2. The timezone itself was written in several places and read from none:
 *     `stores.settings.timezone` (super admin) and `storeConfig.regional
 *     .timezone` (Store Configuration) were both write-only decoys.
 *
 * So: the backend resolves the store's zone once (`config/timezone.ts`) and
 * publishes it on `GET /settings` as `data.timezone`; this module holds that
 * one value and every date the admin renders goes through it. Nothing else in
 * `admin/src` may call `toLocaleDateString`, `toLocaleTimeString` or date-fns
 * `format` on a timestamp directly.
 */

/**
 * Fallback until the API answers — the platform default, matching the
 * backend's own `PLATFORM_DEFAULT_TIMEZONE`. A build-time override exists for
 * a deployment that is wholly outside India, but the API value always wins.
 */
const FALLBACK_TIMEZONE =
  (import.meta as any).env?.VITE_STORE_TIMEZONE?.trim() || 'Asia/Kolkata';

const CACHE_KEY = 'admin_store_timezone';

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Seeded from localStorage so the very first paint after a reload is already
 * in the right zone, rather than rendering in the fallback and then jumping
 * once `/settings` comes back.
 */
let storeTimeZone: string = (() => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (isValidTimeZone(cached)) return cached;
  } catch { /* private mode / storage disabled — fallback is fine */ }
  return FALLBACK_TIMEZONE;
})();

/** The store's civil timezone, as the server reckons it. */
export function getStoreTimeZone(): string {
  return storeTimeZone;
}

/**
 * Adopt the timezone the API reported. Called from the api layer whenever a
 * `/settings` payload goes past, so no page has to remember to do it.
 */
export function setStoreTimeZone(tz: unknown): void {
  if (!isValidTimeZone(tz)) return;
  const next = tz.trim();
  if (next === storeTimeZone) return;
  storeTimeZone = next;
  try { localStorage.setItem(CACHE_KEY, next); } catch { /* non-fatal */ }
}

/**
 * The same instant, re-expressed so that reading it with LOCAL getters yields
 * the store's civil clock — which is exactly what date-fns `format()` does.
 *
 * Display only. The result is a lie about which instant it is, so it must
 * never be compared, subtracted, or sent anywhere; it exists purely to let a
 * local-getter formatter print a zoned wall clock.
 */
function asStoreCivilDate(d: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: storeTimeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
}

/**
 * Defensive date helpers.
 *
 * date-fns `format()` THROWS "Invalid time value" on an invalid Date, which is
 * enough to white-screen a whole page from one bad field. Everything here fails
 * soft: bad input renders a placeholder instead of crashing.
 */

/** Parse anything into a valid Date, or null. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Format safely, in the STORE's timezone. Returns `fallback` when the value
 * isn't a usable date. Accepts the same pattern strings as date-fns.
 */
export function formatDate(value: unknown, fmt = 'MMM dd, yyyy HH:mm', fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  try {
    return dfFormat(asStoreCivilDate(d), fmt);
  } catch {
    return fallback;
  }
}

/** "12 Mar 2026" — the store's calendar day. */
export function formatDay(value: unknown, fallback = '—'): string {
  return formatDate(value, 'dd MMM yyyy', fallback);
}

/** "12 Mar 2026, 14:35" — the store's wall clock. */
export function formatDateTime(value: unknown, fallback = '—'): string {
  return formatDate(value, 'dd MMM yyyy, HH:mm', fallback);
}

/** "14:35" — the store's wall clock, time only. */
export function formatTime(value: unknown, fallback = '—'): string {
  return formatDate(value, 'HH:mm', fallback);
}

/** "12 Mar 2026" with the year dropped when it is the current one. */
export function formatDayShort(value: unknown, fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  const sameYear = isoDate(d).slice(0, 4) === todayIso().slice(0, 4);
  return formatDate(d, sameYear ? 'dd MMM' : 'dd MMM yyyy', fallback);
}

/**
 * `toLocaleDateString`, pinned to the store's zone.
 *
 * The drop-in for `new Date(x).toLocaleDateString(locale, opts)`: each caller
 * keeps the format it chose, but the calendar day is the STORE's rather than
 * the viewer's browser's. Invalid input renders empty so existing `x ? … : '—'`
 * guards keep working.
 */
export function localeDate(
  value: unknown,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { ...(options || {}), timeZone: storeTimeZone });
}

/** `toLocaleTimeString`, pinned to the store's zone. See `localeDate`. */
export function localeTime(
  value: unknown,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(locale, { ...(options || {}), timeZone: storeTimeZone });
}

/** `toLocaleString` (date + time), pinned to the store's zone. See `localeDate`. */
export function localeDateTime(
  value: unknown,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(locale, { ...(options || {}), timeZone: storeTimeZone });
}

/** `YYYY-MM-DD` for an instant, in the store's timezone. */
export function isoDate(value: unknown = new Date()): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: storeTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * TODAY as the store reckons it (`YYYY-MM-DD`) — for date-range pickers, whose
 * value must mean the same day the server will filter on. `new Date()
 * .toISOString().slice(0, 10)` is the UTC day and is wrong for part of every
 * day; so is a `<input type="date">` default built from local getters.
 */
export function todayIso(): string {
  return isoDate(new Date());
}

/** `YYYY-MM-DD`, `n` days from the store's today (negative = in the past). */
export function isoDaysFromToday(n: number): string {
  const [y, m, d] = todayIso().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * First usable date across several possible field names.
 *
 * Order history entries have drifted over time (`changed_at` from the shipping
 * service, `timestamp` from order creation, and camelCase aliases added by the
 * API response transform), so read all of them rather than trusting one.
 */
export function pickDate(obj: Record<string, any> | null | undefined, ...keys: string[]): Date | null {
  if (!obj) return null;
  for (const k of keys) {
    const d = toDate(obj[k]);
    if (d) return d;
  }
  return null;
}

/** Convenience: pick + format in one go. */
export function formatPicked(
  obj: Record<string, any> | null | undefined,
  keys: string[],
  fmt = 'MMM dd, yyyy HH:mm',
  fallback = '—'
): string {
  return formatDate(pickDate(obj, ...keys), fmt, fallback);
}

/** Field names an order status/timeline entry might carry its date under. */
export const HISTORY_DATE_KEYS = ['changedAt', 'changed_at', 'timestamp', 'date', 'createdAt', 'created_at'];
