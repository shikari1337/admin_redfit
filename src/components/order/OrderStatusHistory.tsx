import React from 'react';
import { format } from 'date-fns';
import StatusBadge from './StatusBadge';

interface StatusHistoryEntry {
  status: string;
  changedAt: string | Date;
  changedBy?: {
    name?: string;
    email?: string;
  };
  notes?: string;
  location?: string;
}

interface OrderStatusHistoryProps {
  statusHistory?: StatusHistoryEntry[];
}

const OrderStatusHistory: React.FC<OrderStatusHistoryProps> = ({ statusHistory }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Status History</h2>
      {statusHistory && statusHistory.length > 0 ? (
        <div className="space-y-3">
          {statusHistory
            .slice()
            .reverse()
            .map((entry, index) => (
              <div key={index} className="border-l-4 border-red-500 pl-4 pb-3">
                <div className="flex items-center justify-between">
                  <StatusBadge status={entry.status} type="order" />
                  <span className="text-xs text-gray-500">
                    {format(new Date(entry.changedAt), 'MMM dd, yyyy HH:mm')}
                  </span>
                </div>
                {entry.location && (
                  <p className="text-xs text-gray-500 mt-1">
                    Location: {entry.location}
                  </p>
                )}
                {entry.changedBy && (
                  <p className="text-xs text-gray-500 mt-1">
                    Changed by: {entry.changedBy.name || entry.changedBy.email || 'Admin'}
                  </p>
                )}
                {entry.notes && (
                  <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                )}
              </div>
            ))}
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

