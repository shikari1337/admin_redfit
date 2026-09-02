import React from 'react';
import StatusBadge from './StatusBadge';
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

const OrderStatusHistory: React.FC<OrderStatusHistoryProps> = ({ statusHistory }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-base font-bold mb-2.5">Status History</h2>
      {statusHistory && statusHistory.length > 0 ? (
        <div className="space-y-2">
          {statusHistory
            .slice()
            // Newest first, ordering by whichever date field the entry carries.
            .sort((a, b) => {
              const da = pickDate(a, ...HISTORY_DATE_KEYS)?.getTime() ?? 0;
              const db = pickDate(b, ...HISTORY_DATE_KEYS)?.getTime() ?? 0;
              return db - da;
            })
            .map((entry, index) => {
              const changedBy = (typeof entry.changedBy === 'string'
                ? entry.changedBy
                : entry.changedBy?.name || entry.changedBy?.email) || entry.changed_by;
              return (
                <div key={index} className="border-l-4 border-red-500 pl-3 pb-2">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={entry.status} type="order" />
                    <span className="text-xs text-gray-500">
                      {formatPicked(entry, HISTORY_DATE_KEYS)}
                    </span>
                  </div>
                  {entry.location && (
                    <p className="text-xs text-gray-500 mt-1">
                      Location: {entry.location}
                    </p>
                  )}
                  {changedBy && (
                    <p className="text-xs text-gray-500 mt-1">
                      Changed by: {changedBy}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No status history available yet</p>
          <p className="text-sm mt-2">Status changes will appear here</p>
        </div>
      )}
    </div>
  );
};

export default OrderStatusHistory;

