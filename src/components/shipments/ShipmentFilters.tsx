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

interface ShipmentFiltersProps {
  statusFilter: string;
  warehouseFilter: string;
  providerFilter: string;
  startDate: string;
  endDate: string;
  warehouses: any[];
  onStatusChange: (status: string) => void;
  onWarehouseChange: (warehouseId: string) => void;
  onProviderChange: (provider: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const ShipmentFilters: React.FC<ShipmentFiltersProps> = ({
  statusFilter,
  warehouseFilter,
  providerFilter,
  startDate,
  endDate,
  warehouses,
  onStatusChange,
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
            <Select value={statusFilter} onValueChange={(value) => onStatusChange(value === 'all' ? '' : value)}>
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
            <Select value={warehouseFilter} onValueChange={(value) => onWarehouseChange(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {Array.isArray(warehouses) && warehouses.map(wh => (
                  <SelectItem key={wh._id} value={wh._id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Shipping Provider</Label>
            <Select value={providerFilter} onValueChange={(value) => onProviderChange(value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="shiprocket">Shiprocket</SelectItem>
                <SelectItem value="delhivery">DELHIVERY</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>End Date</Label>
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

