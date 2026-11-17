import React from 'react';
import { RotateCcw, PackagePlus, Wallet, Clock } from 'lucide-react';

/**
 * The returns desk's words for a return's status and outcome: one copy for the queue
 * (pages/Returns.tsx) and the detail panel (ReturnDetailPanel.tsx), which each kept their own.
 * The codes are the server's (commerce domain/returns.rs RETURN_RESOLUTIONS and the status machine).
 */

export const STATUS_TONE: Record<string, any> = {
  pending: 'amber', approved: 'blue', received: 'green',
  completed: 'green', rejected: 'red', cancelled: 'neutral',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Needs a decision', approved: 'Awaiting parcel', received: 'Goods in',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Withdrawn',
};

export const RESOLUTION_META: Record<string, { label: string; icon: React.ElementType; tone: any }> = {
  refund:       { label: 'Refund',       icon: RotateCcw,   tone: 'blue' },
  replacement:  { label: 'Replacement',  icon: PackagePlus, tone: 'green' },
  store_credit: { label: 'Store credit', icon: Wallet,      tone: 'amber' },
  undecided:    { label: 'Undecided',    icon: Clock,       tone: 'neutral' },
};

/** A code from one of the server's `{code, label}` lists (`/returns/meta` qc_outcomes, exceptions) in its words;
 *  the code itself, spaced, when the list does not name it. */
export const wordsFor = (list: unknown, code?: string | null): string => {
  const hit = (Array.isArray(list) ? list : []).find((x: any) => x?.code === code) as { label?: string } | undefined;
  return hit?.label ?? String(code ?? '').replace(/_/g, ' ');
};

/** A return step's answer (commerce `ReturnStepView {result, replayed}`) as the step's own result
 *  (`{message, document, ...}`); an answer without the wrapper as it came. */
export const stepResult = (d: any): any =>
  (d && typeof d === 'object' && d.result && typeof d.result === 'object' ? d.result : d);

/** A return event on the order's timeline (RET-PICKUP-2: `event` such as `return_pickup_booked`) in words,
 *  "Return pickup booked". The entry's `notes` carry the server's own sentence beside it. */
export const returnEventLabel = (code?: string | null): string => {
  const rest = String(code ?? '').replace(/^return_/, '').replace(/_/g, ' ').replace(/\bawb\b/gi, 'AWB').trim();
  return rest ? `Return ${rest}` : 'Return';
};
