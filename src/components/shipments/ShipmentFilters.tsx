import React from 'react';

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
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="pickup_scheduled">Pickup Scheduled</option>
            <option value="picked_up">Picked Up</option>
            <option value="in_transit">In Transit</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
          <select
            value={warehouseFilter}
            onChange={(e) => onWarehouseChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
          >
            <option value="">All Warehouses</option>
            {Array.isArray(warehouses) && warehouses.map(wh => (
              <option key={wh._id} value={wh._id}>{wh.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Provider</label>
          <select
            value={providerFilter}
            onChange={(e) => onProviderChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
          >
            <option value="">All Providers</option>
            <option value="shiprocket">Shiprocket</option>
            <option value="delhivery">DELHIVERY</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            min={startDate || undefined}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
          />
        </div>
      </div>
    </div>
  );
};

export default ShipmentFilters;

