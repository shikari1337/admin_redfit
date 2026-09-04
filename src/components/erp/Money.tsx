import React from 'react';
import { cn } from '@/lib/utils';
import { fmtRupeesOrDash, fmtMinorOrDash, fmtNumber } from '@/lib/money';

/**
 * Money + number formatting for the ERP surfaces. One rule everywhere:
 * ₹ symbol, exactly 2 decimals, en-IN grouping, tabular figures so columns of
 * numbers line up. Amounts render right-aligned by default.
 *
 * This is a thin wrapper — `lib/money.ts` is the canonical implementation
 * (shared with every non-ERP page); these names are kept as the established
 * ERP-surface call sites (`inr`/`inrMinor`/`num`, `<Money>`) so no consumer
 * needs to change.
 */

/** Rupee amount → "₹1,23,456.00". Nullish/NaN → "—". */
export const inr = fmtRupeesOrDash;

/** Minor units (paise, string/number/bigint-safe) → "₹1,234.56". Nullish/NaN → "—". */
export const inrMinor = fmtMinorOrDash;

/** Plain integer with en-IN grouping. Nullish/NaN → "—". */
export const num = fmtNumber;

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
