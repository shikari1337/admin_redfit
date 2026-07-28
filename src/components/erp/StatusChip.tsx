import React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusChip — one status→colour map shared by EVERY panel so "posted",
 * "paid", "rejected" etc. always look the same wherever they appear.
 * A neutral grey is the safe default for anything unmapped (never a raw
 * default-blue link colour).
 */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  neutral: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

// Canonical status vocabulary → tone. Keys are lower-cased + underscored.
const STATUS_TONE: Record<string, Tone> = {
  // done / good
  posted: 'green', completed: 'green', complete: 'green', paid: 'green', matched: 'green',
  active: 'green', delivered: 'green', received: 'green', approved: 'green', generated: 'green',
  api_generated: 'green', in_stock: 'green', ok: 'green', balanced: 'green', synced: 'green',
  success: 'green', done: 'green', confirmed: 'green', picked: 'green', acknowledged: 'green',
  // in progress / attention
  open: 'amber', draft: 'amber', pending: 'amber', recorded: 'amber', counting: 'amber',
  review: 'amber', quarantine: 'amber', unpaid: 'amber', processing: 'amber', partial: 'amber',
  partially_received: 'amber', partially_refunded: 'amber', qty_mismatch: 'amber',
  price_mismatch: 'amber', near_expiry: 'amber', low_stock: 'amber', 'under_count': 'amber',
  // bad
  rejected: 'red', cancelled: 'red', canceled: 'red', expired: 'red', failed: 'red', dead: 'red',
  out_of_stock: 'red', unmatched: 'red', oversell: 'red', short: 'red', written_off: 'red',
  error: 'red', overdue: 'red', out_of_balance: 'red', blocked: 'red',
  // neutral / informational
  issued: 'blue', entered: 'blue', reversed: 'neutral', returned: 'neutral', depleted: 'neutral',
  informational: 'neutral', info: 'neutral', closed: 'neutral', inactive: 'neutral',
  unknown: 'neutral', cancelled_reversed: 'neutral',
};

export function toneForStatus(status: string | null | undefined): Tone {
  const key = String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STATUS_TONE[key] ?? 'neutral';
}

/** Pretty label: "partially_received" → "Partially received". */
function humanize(status: string): string {
  const s = status.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const StatusChip: React.FC<{
  status: string | null | undefined;
  tone?: Tone;
  label?: React.ReactNode;
  className?: string;
}> = ({ status, tone, label, className }) => {
  const t = tone ?? toneForStatus(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[t],
        className,
      )}
    >
      {label ?? humanize(String(status ?? '—'))}
    </span>
  );
};

/** Freeform pill (explicit tone) — for non-status chips (counts, filters). */
export const Chip: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral', className, children,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      TONE_CLASS[tone], className,
    )}
  >
    {children}
  </span>
);

export default StatusChip;
