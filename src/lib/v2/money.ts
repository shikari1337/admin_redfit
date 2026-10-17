/**
 * Money at the v2 boundary — the ONLY place the admin converts between the
 * wire's `Money {minor, currency}` (integer minor units) and the rupee numbers
 * every screen reads and types. Both directions are DECIMAL-STRING arithmetic:
 * no `minor / 100`, no `rupees * 100`, so 0.1 + 0.2 never becomes 30.000000004
 * paise and ₹309.05 is exactly 30905 on the way back.
 *
 * Minor digits come from the platform's own currency data (`Intl`, CLDR) for
 * EVERY ISO 4217 code — no hand-kept list (the old `fmtCurrencyMinor` carries a
 * ten-code shortcut; it is display-only and not used here).
 */

export interface Money {
  minor: number;
  currency: string;
}

const digitsCache = new Map<string, number>();

/** The currency's minor digits (INR 2, JPY 0, KWD 3 …) for any ISO code. */
export function minorDigits(currency: string | undefined | null): number {
  const code = String(currency || 'INR').toUpperCase();
  const hit = digitsCache.get(code);
  if (hit !== undefined) return hit;
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2; // an unknown code: the common case, never a throw at the boundary
  }
  digitsCache.set(code, d);
  return d;
}

/** True for exactly the wire's Money object (`{minor, currency}`, nothing else). */
export function isMoney(v: unknown): v is Money {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length === 2
    && typeof o.currency === 'string'
    && (typeof o.minor === 'number' || (typeof o.minor === 'string' && /^-?\d+$/.test(o.minor)));
}

/** Integer minor units → the rupee (major-unit) number a screen shows. */
export function minorToMajor(minor: number | string, currency?: string | null): number {
  const d = minorDigits(currency);
  let s = String(typeof minor === 'number' ? Math.trunc(minor) : minor).trim();
  if (!/^-?\d+$/.test(s)) return 0;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  if (d === 0) return Number(`${neg ? '-' : ''}${s}`);
  s = s.padStart(d + 1, '0');
  const text = `${neg ? '-' : ''}${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`;
  return Number(text);
}

/** A typed rupee value (number or string, "1,234.50" allowed) → integer minor units, half-up. */
export function majorToMinor(value: number | string | null | undefined, currency?: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const d = minorDigits(currency);
  let s = typeof value === 'number'
    ? (Number.isFinite(value) ? value.toFixed(Math.min(d + 4, 20)) : '')
    : String(value).replace(/[,\s₹]/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [intPart = '0', fracRaw = ''] = s.split('.');
  const frac = fracRaw.padEnd(d + 1, '0');
  const kept = frac.slice(0, d);
  const next = frac.charCodeAt(d) - 48; // the first dropped digit decides the rounding
  let digits = `${intPart.replace(/^0+(?=\d)/, '') || '0'}${kept}`;
  if (next >= 5) {
    // add one to the decimal string (carry), never through a float
    const arr = digits.split('').map((c) => c.charCodeAt(0) - 48);
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === 9) { arr[i] = 0; i -= 1; } else { arr[i] += 1; break; }
    }
    if (i < 0) arr.unshift(1);
    digits = arr.join('');
  }
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return null;
  return neg ? -n : n;
}

/** Rupees → the wire's Money object. */
export function toMoney(value: number | string | null | undefined, currency = 'INR'): Money | null {
  const minor = majorToMinor(value, currency);
  return minor === null ? null : { minor, currency };
}

/**
 * Deep: every `Money` in a v2 payload becomes its rupee number (the shape the
 * screens were written against). Opaque blobs are walked too — Money is never a
 * legitimate stored JSON value elsewhere.
 */
export function moneyToMajorDeep<T = unknown>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => moneyToMajorDeep(v)) as unknown as T;
  if (isMoney(value)) return minorToMajor(value.minor, value.currency) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Blob) && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = moneyToMajorDeep(v);
    return out as T;
  }
  return value;
}

/**
 * A write body: the named rupee fields become Money (`{minor, currency}`) or plain
 * minor integers, as the route's typed input declares. Unknown/absent fields are
 * left alone; a blank becomes null (the field cleared), never 0.
 */
export function moneyFieldsToWire(
  body: Record<string, unknown>,
  fields: readonly string[],
  as: 'money' | 'minor' = 'money',
  currency = 'INR',
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const f of fields) {
    if (!(f in out)) continue;
    const v = out[f];
    if (isMoney(v)) continue;
    if (v === null || v === undefined || v === '') { out[f] = null; continue; }
    const minor = majorToMinor(v as number | string, currency);
    out[f] = minor === null ? null : as === 'money' ? { minor, currency } : minor;
  }
  return out;
}
