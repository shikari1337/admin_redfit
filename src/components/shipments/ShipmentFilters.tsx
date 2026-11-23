import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * The board's filters. The status is the tab (one place, so a filter can never contradict the tab that is
 * lit); these narrow it by warehouse, carrier and the day the parcel was booked.
 */
interface ShipmentFiltersProps {
  warehouseFilter: string;
  providerFilter: string;
  startDate: string;
  endDate: string;
  warehouses: any[];
  /** The carriers to filter by: the store's own list (GET /shipping/providers) plus parcels entered by hand. */
  providers: Array<{ id: string; name: string }>;
  onWarehouseChange: (warehouseId: string) => void;
  onProviderChange: (provider: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const ShipmentFilters: React.FC<ShipmentFiltersProps> = ({
  warehouseFilter,
  providerFilter,
  startDate,
  endDate,
  warehouses,
  providers,
  onWarehouseChange,
  onProviderChange,
  onStartDateChange,
  onEndDateChange,
}) => {
  return (
    <Card className="mb-6 border-none shadow-sm bg-white">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Warehouse</Label>
            <Select value={warehouseFilter || 'all'} onValueChange={(value) => onWarehouseChange(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {Array.isArray(warehouses) && warehouses.map(wh => (
                  <SelectItem key={wh._id} value={wh._id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Carrier</Label>
            <Select value={providerFilter || 'all'} onValueChange={(value) => onProviderChange(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All carriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All carriers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Booked from</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              max={endDate || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Booked to</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate || undefined}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ShipmentFilters;
