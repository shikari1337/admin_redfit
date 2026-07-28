import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Money + number formatting for the ERP surfaces. One rule everywhere:
 * ₹ symbol, exactly 2 decimals, en-IN grouping, tabular figures so columns of
 * numbers line up. Amounts render right-aligned by default.
 */

/** Rupee amount → "₹1,23,456.00". Nullish/NaN → "—". */
export function inr(rupees: number | string | null | undefined): string {
  if (rupees === null || rupees === undefined || Number.isNaN(Number(rupees))) return '—';
  return Number(rupees).toLocaleString('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** Minor units (paise, string/number/bigint-safe) → "₹1,234.56". */
export function inrMinor(minor: string | number | null | undefined): string {
  return inr(Number(minor ?? 0) / 100);
}

/** Plain integer with en-IN grouping. Nullish → "—". */
export function num(n: number | string | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString('en-IN');
}

/**
 * Inline money. Pass `rupees` OR `minor`. Right-aligned + tabular by default so
 * it drops straight into a numeric table cell.
 */
export const Money: React.FC<{
  rupees?: number | string | null;
  minor?: number | string | null;
  className?: string;
  muted?: boolean;
}> = ({ rupees, minor, className, muted }) => (
  <span className={cn('tabular-nums', muted && 'text-gray-500', className)}>
    {minor !== undefined ? inrMinor(minor) : inr(rupees)}
  </span>
);

export default Money;
