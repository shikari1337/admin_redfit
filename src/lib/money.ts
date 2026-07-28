/** Display helpers for backend minor-unit strings (paise as string/bigint-safe). */
export function fmtMinor(minor: string | number | null | undefined): string {
  const n = Number(minor ?? 0) / 100;
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
}

export function fmtRupees(rupees: number | string | null | undefined): string {
  return Number(rupees ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
}
