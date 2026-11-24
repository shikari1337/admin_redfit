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
 * The board's filters: status (a tab sets it too; picking one here narrows the list the same way, as staff
 * used it until 23 Nov 2026 to pull every Pickup Scheduled parcel for a bulk manifest), warehouse, carrier
 * and the day the parcel was booked.
 */
interface ShipmentFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
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
  statusFilter,
  onStatusChange,
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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter || 'all'} onValueChange={(value) => onStatusChange(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="pickup_scheduled">Pickup Scheduled</SelectItem>
                <SelectItem value="picked_up">Picked Up</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                <SelectItem value="ndr_failed_delivery">Failed Delivery (NDR)</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="rto_in_transit">RTO In Transit</SelectItem>
                <SelectItem value="rto_delivered">RTO Delivered</SelectItem>
                <SelectItem value="rto_failed">RTO Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
