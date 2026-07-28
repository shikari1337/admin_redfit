import React from 'react';
import { cn } from '@/lib/utils';
import { CARD } from './Card';

/**
 * StatCard — the KPI tile shared by every dashboard. Consistent radius, border,
 * label case and number size. A `tone` tints the card for good/bad/attention
 * states; an `accent` dot carries a chart-series colour without recolouring the
 * whole tile.
 */
export type StatTone = 'default' | 'good' | 'bad' | 'warn' | 'info';

const TONE: Record<StatTone, string> = {
  default: 'border-gray-200 bg-white',
  good: 'border-emerald-200 bg-emerald-50/60',
  bad: 'border-red-200 bg-red-50/60',
  warn: 'border-amber-200 bg-amber-50/60',
  info: 'border-blue-200 bg-blue-50/60',
};

export const StatCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  accent?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}> = ({ label, value, sub, tone = 'default', accent, icon: Icon, className }) => (
  <div className={cn(CARD, 'p-4', TONE[tone], className)}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      {Icon && <Icon className="h-4 w-4 text-gray-400" />}
    </div>
    <div className="mt-1.5 flex items-baseline gap-2">
      {accent && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: accent }} />}
      <span className="text-2xl font-bold tabular-nums text-gray-900">{value}</span>
    </div>
    {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
  </div>
);

/** Responsive grid for a row of StatCards. `cols` = the widest breakpoint count. */
export const StatGrid: React.FC<{ cols?: 2 | 3 | 4 | 5; className?: string; children: React.ReactNode }> = ({
  cols = 4, className, children,
}) => (
  <div
    className={cn(
      'grid grid-cols-2 gap-4',
      cols === 3 && 'lg:grid-cols-3',
      cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
      cols === 5 && 'sm:grid-cols-3 lg:grid-cols-5',
      className,
    )}
  >
    {children}
  </div>
);

export default StatCard;
