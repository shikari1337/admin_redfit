import React from 'react';
import { getStatusColorClass, getStatusLabel } from './StatusBadge';
import { formatPicked, pickDate, HISTORY_DATE_KEYS } from '../../utils/date';

interface StatusHistoryEntry {
  status: string;
  /** Entries have drifted between changed_at / timestamp — read whichever exists. */
  changedAt?: string | Date;
  changed_at?: string | Date;
  timestamp?: string | Date;
  changedBy?: {
    name?: string;
    email?: string;
  } | string;
  /** The raw field the backend actually writes (`status_history` is JSONB and
   *  deliberately never camelCased by the API layer's response normalizer —
   *  see OPAQUE_VALUE_KEYS in services/api.ts — so this is what's really here). */
  changed_by?: string;
  notes?: string;
  location?: string;
}

interface OrderStatusHistoryProps {
  statusHistory?: StatusHistoryEntry[];
}

/**
 * Order timeline — ONE compact line per change.
 *
 * Each entry used to be a bordered block with the status, the date, and then
 * "Location: …" / "Changed by: …" / notes each on their own line — four rows of
 * chrome for one fact, so a normal order's history filled most of a screen. It
 * is now a single dense row: status pill · date **and time** · who · note, with
 * a hairline rail connecting them. Nothing was dropped, it just stopped
 * spending a paragraph per event.
 */
const OrderStatusHistory: React.FC<OrderStatusHistoryProps> = ({ statusHistory }) => {
  const entries = (statusHistory ?? []).slice().sort((a, b) => {
    const da = pickDate(a, ...HISTORY_DATE_KEYS)?.getTime() ?? 0;
    const db = pickDate(b, ...HISTORY_DATE_KEYS)?.getTime() ?? 0;
    return db - da; // newest first
  });

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Timeline</h2>
        {entries.length > 0 && (
          <span className="text-xs font-bold text-slate-400">{entries.length} change{entries.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-3 text-center text-sm font-semibold text-slate-400">
          No status changes yet.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {entries.map((entry, index) => {
            const changedBy = (typeof entry.changedBy === 'string'
              ? entry.changedBy
              : entry.changedBy?.name || entry.changedBy?.email) || entry.changed_by;
            return (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 py-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${getStatusColorClass('order', entry.status)}`}>
                  {getStatusLabel('order', entry.status)}
                </span>
                {/* Date AND time — an ops timeline is useless without the clock. */}
                <span className="whitespace-nowrap text-xs font-bold tabular-nums text-slate-600">
                  {formatPicked(entry, HISTORY_DATE_KEYS, 'dd MMM yyyy, hh:mm a')}
                </span>
                {changedBy && (
                  <span className="text-xs font-semibold text-slate-500">by {changedBy}</span>
                )}
                {entry.location && (
                  <span className="text-xs font-medium text-slate-400">· {entry.location}</span>
                )}
                {entry.notes && (
                  <span className="w-full text-xs font-medium text-slate-500">{entry.notes}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default OrderStatusHistory;
