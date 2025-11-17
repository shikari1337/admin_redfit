import React from 'react';

interface BulkActionsBarProps {
  selectedCount: number;
  onBulkPickup: () => void;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({ selectedCount, onBulkPickup }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-blue-900">Bulk Pickup</h3>
          <p className="text-sm text-blue-700 mt-1">
            Select multiple shipments from the same provider and warehouse to schedule bulk pickup
          </p>
        </div>
        <button
          onClick={onBulkPickup}
          disabled={selectedCount === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Schedule Bulk Pickup ({selectedCount} selected)
        </button>
      </div>
    </div>
  );
};

export default BulkActionsBar;

