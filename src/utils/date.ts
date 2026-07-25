import { format as dfFormat } from 'date-fns';

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

/** Format safely. Returns `fallback` when the value isn't a usable date. */
export function formatDate(value: unknown, fmt = 'MMM dd, yyyy HH:mm', fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  try {
    return dfFormat(d, fmt);
  } catch {
    return fallback;
  }
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
