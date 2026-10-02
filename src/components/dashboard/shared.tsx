/**
 * Small pieces the three dashboard tabs share: the all-time monthly sales feed
 * (one request, read by the attention board, Month & year and Money), number
 * formats, the filter row, the financial-year select and CSV export.
 */
import React from 'react';
import { usePanelStats } from '../panelAnalytics/usePanelStats';
import { SERIES } from '../panelAnalytics/vizTheme';
import { cssVar } from '@/lib/theme';
import { saveBlob } from '@/lib/saveBlob';
import { fyLabel } from './periods';
import { Switch } from '@/components/ui/switch';

const ALL_TIME = {};
const MONTHLY = { granularity: 'month' };

/**
 * The store's whole history, month by month. Asked for once and shared (the
 * panel cache dedups the identical request): the attention board reads its
 * refund-due figure, Month & year reads every month, Money reads which
 * financial years exist.
 */
export function useAllTimeMonthly(enabled: boolean) {
  return usePanelStats<any>('commerce', ALL_TIME, enabled, MONTHLY);
}

export const fmtInt = (v: number | null | undefined) =>
  (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Math.round(Number(v)).toLocaleString('en-IN'));

/** Exact percentage for tables: one decimal under 100, whole numbers above. */
export function fmtPct(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const n = abs >= 100 ? Math.round(abs).toLocaleString('en-IN') : abs.toFixed(1);
  if (!signed) return `${n}%`;
  if (abs < 0.05) return '0%';
  return `${v > 0 ? '+' : '−'}${n}%`;
}

export const pctChange = (cur: number, prev: number | null | undefined): number | null =>
  prev === null || prev === undefined || !Number.isFinite(prev) || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;

/** Neutral grey for "last year" — emphasis, not a second hue. */
export const lastYearGrey = () => cssVar('--n-300');

// ─── Payment methods and order types: colour by entity, never by rank ────────

const PAYMENT_ORDER = ['prepaid', 'cod', 'razorpay', 'upi', 'card', 'netbanking', 'bank_transfer', 'manual'];
const PAYMENT_LABEL: Record<string, string> = {
  prepaid: 'Paid online', cod: 'Cash on delivery', razorpay: 'Online (Razorpay)', upi: 'UPI', card: 'Card', netbanking: 'Net banking',
  wallet: 'Wallet', bank_transfer: 'Bank transfer', manual: 'Recorded by staff', paypal: 'PayPal', unknown: 'Not recorded',
};
export const paymentLabel = (m: string) => PAYMENT_LABEL[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ') : 'Not recorded');

/** Slot for a payment method: its place in a fixed list, so a method keeps its colour across periods. */
export function paymentColor(method: string): string {
  const i = PAYMENT_ORDER.indexOf(method);
  return i >= 0 ? SERIES[i] : cssVar('--n-400');
}

const TYPE_ORDER = ['retail', 'b2b'];
export const orderTypeLabel = (t: string) => (t === 'retail' ? 'Retail' : t === 'b2b' ? 'B2B' : paymentLabel(t));
export function orderTypeColor(t: string): string {
  const i = TYPE_ORDER.indexOf(t);
  return i >= 0 ? SERIES[i] : SERIES[2];
}

// ─── Layout bits ─────────────────────────────────────────────────────────────

/** ONE filter row above what it scopes. */
export const FilterRow: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-wrap items-center justify-between gap-2" data-filter-row>
    <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    {aside && <div className="text-xs text-gray-500">{aside}</div>}
  </div>
);

export const FySelect: React.FC<{ value: number; options: number[]; onChange: (y: number) => void; label?: string; testId?: string }> = ({
  value, options, onChange, label = 'Financial year', testId,
}) => (
  <label className="inline-flex items-center gap-2 text-sm text-gray-600">
    <span className="sr-only sm:not-sr-only">{label}</span>
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testId}
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900 shadow-sm">
      {options.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
    </select>
  </label>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }> = ({
  checked, onChange, label, testId,
}) => {
  const id = React.useId();
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={testId} />
      <label htmlFor={id} className="cursor-pointer">{label}</label>
    </span>
  );
};

/** A block heading inside a tab. */
export const BlockTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2">
    <h3 className="text-sm font-semibold text-gray-900">{children}</h3>
    {aside && <span className="text-xs text-gray-500">{aside}</span>}
  </div>
);

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  // A text cell a spreadsheet would run as a formula is written as text.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  saveBlob(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Round money to paise for a CSV cell (no currency symbol, no grouping). */
export const csvMoney = (v: number | null | undefined) =>
  (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
