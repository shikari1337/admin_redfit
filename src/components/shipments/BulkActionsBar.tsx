import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Truck, FileText, ClipboardList, Package } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onBulkPickup: () => void;
  onBulkDownloadLabel?: () => void;
  onBulkDownloadManifest?: () => void;
  onBulkShip?: () => void;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedCount,
  onBulkPickup,
  onBulkDownloadLabel,
  onBulkDownloadManifest,
  onBulkShip,
}) => {
  if (selectedCount === 0) return null;

  return (
    <Card className="mb-4 bg-blue-50/50 border-blue-200 shadow-sm animate-in fade-in slide-in-from-top-2">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <Package className="h-4 w-4" />
              {selectedCount} shipment(s) selected
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBulkShip && (
              <Button variant="default" size="sm" onClick={onBulkShip} className="gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Bulk Ship
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onBulkPickup} className="gap-1.5">
              <Truck className="h-3.5 w-3.5" />
              Schedule Pickup ({selectedCount})
            </Button>
            {onBulkDownloadLabel && (
              <Button variant="outline" size="sm" onClick={onBulkDownloadLabel} className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Download Labels
              </Button>
            )}
            {onBulkDownloadManifest && (
              <Button variant="outline" size="sm" onClick={onBulkDownloadManifest} className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Download Manifest
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkActionsBar;
