import React from 'react';
import { RotateCcw, PackagePlus, Wallet, Clock } from 'lucide-react';
import { collectionState, type CollectionState, type ReturnPickupView } from './ReturnPickup';

/**
 * The returns desk's words for a return's status and outcome: one copy for the queue
 * (pages/Returns.tsx) and the detail panel (ReturnDetailPanel.tsx), which each kept their own.
 * The codes are the server's (commerce domain/returns.rs RETURN_RESOLUTIONS and the status machine).
 * Also the one reading of where a return stands (`returnStage`), which every block of the panel acts on.
 */

/**
 * Where a return stands (RET-FLOW-UI, owner 17 Nov 2026: "why approve button and reject button is showing after
 * pickup request creating, check the ui layout and flow and make it logical"). In the order things happen:
 * - `decide`: needs a decision and no collection is live. Approve, reject or withdraw; the collection waits
 *   for the approval (the server refuses a booking before it).
 * - `decide_booked`: needs a decision, but a collection was booked before approval (older returns such as
 *   RET/26-27/00018). Approve only.
 * - `arrange`: approved, nothing back yet, no live collection. Arrange the collection (another attempt only after
 *   a failed or cancelled one), reject or withdraw.
 * - `collecting`: approved and its collection is live. Follow it and Get AWB; no reject, withdraw or second booking.
 * - `goods_in`: goods are booked in and the money is not decided. Book in the rest, decide each unit's condition,
 *   settle or deny after inspection.
 * - `closed`: settled, rejected or withdrawn.
 * The collection read is the return's current one (`pickup`: the one it points at, else its newest).
 */
export type ReturnStage = 'decide' | 'decide_booked' | 'arrange' | 'collecting' | 'goods_in' | 'closed';

export interface ReturnStageOf {
  stage: ReturnStage;
  /** The return's current collection, or null when none was booked. */
  current: ReturnPickupView | null;
  /** Where that collection stands; null without one. */
  collection: CollectionState | null;
  /** Units booked in so far, over every line. */
  received: number;
  /** Every line has all its expected units in. */
  allIn: boolean;
  /** The money is decided: a credit note, or settled in the store's ERP. */
  settled: boolean;
}

export const returnStage = (doc: any): ReturnStageOf => {
  const lines: any[] = Array.isArray(doc?.lines) ? doc.lines : [];
  const received = lines.reduce((s, l) => s + Number(l?.qty_received || 0), 0);
  const allIn = lines.length > 0
    && lines.every((l) => Number(l?.qty_received || 0) >= Number(l?.qty_expected || 0));
  const current: ReturnPickupView | null = doc?.pickup && typeof doc.pickup === 'object' ? doc.pickup : null;
  const collection = collectionState(current);
  const live = collection === 'live';
  const settled = !!doc?.credit_note_id || !!doc?.settled_at;
  const status = String(doc?.status ?? '');
  const stage: ReturnStage =
    settled || status === 'rejected' || status === 'cancelled' ? 'closed'
    : received > 0 || status === 'received' || status === 'completed' ? 'goods_in'
    : status === 'pending' ? (live ? 'decide_booked' : 'decide')
    : status === 'approved' ? (live ? 'collecting' : 'arrange')
    : 'closed';
  return { stage, current, collection, received, allIn, settled };
};

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
