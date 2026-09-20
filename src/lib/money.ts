/**
 * Canonical currency/number formatters for the whole admin app — ERP surfaces
 * (`components/erp/Money.tsx`) and every other page both funnel through this file.
 * One rule everywhere: ₹ symbol, exactly 2 decimals, en-IN grouping.
 */

/** Display helpers for backend minor-unit strings (paise as string/bigint-safe). */
export function fmtMinor(minor: string | number | null | undefined): string {
  const n = Number(minor ?? 0) / 100;
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRupees(rupees: number | string | null | undefined): string {
  return Number(rupees ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Any ISO currency (the presentment memo on international orders — mig 172:
 * `orders.currency` + `presentment_total_minor`). INR stays `fmtRupees`; this
 * exists so a USD/CAD figure is never printed with a ₹ sign. Minor units in.
 */
export function fmtCurrencyMinor(minor: string | number | null | undefined, currency: string, locale = 'en'): string {
  const code = String(currency || 'INR').toUpperCase();
  const digits = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'XAF', 'XOF'].includes(code) ? 0 : ['BHD', 'KWD', 'OMR', 'JOD', 'TND'].includes(code) ? 3 : 2;
  const n = Number(minor ?? 0) / 10 ** digits;
  try { return n.toLocaleString(locale, { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  catch { return `${code} ${n.toFixed(digits)}`; }
}

/** Same as `fmtRupees`, but nullish/NaN → "—" instead of "₹0.00". */
export function fmtRupeesOrDash(rupees: number | string | null | undefined): string {
  if (rupees === null || rupees === undefined || Number.isNaN(Number(rupees))) return '—';
  return fmtRupees(rupees);
}

/** Same as `fmtMinor`, but nullish/NaN → "—" instead of "₹0.00". */
export function fmtMinorOrDash(minor: string | number | null | undefined): string {
  if (minor === null || minor === undefined || Number.isNaN(Number(minor))) return '—';
  return fmtMinor(minor);
}

/** Plain integer/decimal with en-IN grouping (no currency symbol). Nullish/NaN → "—". */
export function fmtNumber(n: number | string | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-IN');
}
