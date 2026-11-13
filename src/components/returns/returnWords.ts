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
