import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Truck } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onBulkPickup: () => void;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({ selectedCount, onBulkPickup }) => {
  if (selectedCount === 0) return null;

  return (
    <Card className="mb-6 bg-blue-50/50 border-blue-200 shadow-sm animate-in fade-in slide-in-from-top-2">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Bulk Pickup Pending
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Select multiple shipments from the same provider and warehouse to schedule bulk pickup.
            </p>
          </div>
          <Button
            onClick={onBulkPickup}
            disabled={selectedCount === 0}
            className="w-full sm:w-auto"
          >
            Schedule Bulk Pickup ({selectedCount} selected)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkActionsBar;

