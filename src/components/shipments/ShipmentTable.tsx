import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { FaCalendar, FaDownload, FaFilePdf } from 'react-icons/fa';

interface Shipment {
  _id: string;
  shipmentNumber: string;
  orders: any[];
  warehouseId: any;
  shippingProvider: string;
  status: string;
  pickup?: {
    scheduledDate?: Date | string;
    pickupTimeSlot?: string;
    pickupId?: string;
  };
  providerData?: {
    shiprocketAWB?: string;
    delhiveryWaybill?: string;
  };
  trackingUrl?: string;
  createdAt: Date | string;
}

interface ShipmentTableProps {
  shipments: Shipment[];
  activeTab: 'all' | 'ready_to_pickup' | 'pickup_scheduled' | 'in_transit' | 'delivered';
  selectedShipments: string[];
  onSelectShipment: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onSchedulePickup: (shipment: Shipment) => void;
  onUpdateStatus: (shipmentId: string, status: string) => void;
  onDownloadLabel?: (shipmentId: string) => void;
  onDownloadPickupReceipt?: (shipmentId: string) => void;
}

const ShipmentTable: React.FC<ShipmentTableProps> = ({
  shipments,
  activeTab,
  selectedShipments,
  onSelectShipment,
  onSelectAll,
  onSchedulePickup,
  onUpdateStatus,
  onDownloadLabel,
  onDownloadPickupReceipt,
}) => {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      pickup_scheduled: 'bg-blue-100 text-blue-800',
      picked_up: 'bg-indigo-100 text-indigo-800',
      in_transit: 'bg-purple-100 text-purple-800',
      out_for_delivery: 'bg-orange-100 text-orange-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      returned: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pending',
      pickup_scheduled: 'Pickup Scheduled',
      picked_up: 'Picked Up',
      in_transit: 'In Transit',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      returned: 'Returned',
    };
    return labels[status] || status;
  };

  const selectableShipments = shipments.filter(
    s => s.status === 'pending' && s.shippingProvider !== 'manual'
  );

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              {activeTab === 'ready_to_pickup' && selectableShipments.length > 0 && (
                <input
                  type="checkbox"
                  checked={selectedShipments.length === selectableShipments.length && selectableShipments.length > 0}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="mr-2"
                />
              )}
              Shipment #
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pickup Date</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AWB/Tracking</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {shipments.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                No shipments found
              </td>
            </tr>
          ) : (
            shipments.map((shipment) => (
              <tr key={shipment._id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {activeTab === 'ready_to_pickup' && shipment.status === 'pending' && shipment.shippingProvider !== 'manual' && (
                      <input
                        type="checkbox"
                        checked={selectedShipments.includes(shipment._id)}
                        onChange={(e) => onSelectShipment(shipment._id, e.target.checked)}
                      />
                    )}
                    <div className="text-sm font-medium text-gray-900">{shipment.shipmentNumber}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {Array.isArray(shipment.orders) ? shipment.orders.length : 0} order(s)
                  </div>
                  {Array.isArray(shipment.orders) && shipment.orders.length > 0 && (
                    <div className="text-xs text-gray-500">
                      {shipment.orders.slice(0, 2).map((order: any) => (
                        <Link
                          key={order._id || order}
                          to={`/orders/${typeof order === 'object' ? order._id : order}`}
                          className="block hover:text-red-600"
                        >
                          {typeof order === 'object' ? order.orderId : order}
                        </Link>
                      ))}
                      {shipment.orders.length > 2 && ` +${shipment.orders.length - 2} more`}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {typeof shipment.warehouseId === 'object' && shipment.warehouseId?.name
                      ? shipment.warehouseId.name
                      : 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 capitalize">{shipment.shippingProvider}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(shipment.status)}`}>
                    {getStatusLabel(shipment.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {shipment.pickup?.scheduledDate ? (
                    <div className="text-sm text-gray-900">
                      {format(new Date(shipment.pickup.scheduledDate), 'MMM dd, yyyy')}
                      {shipment.pickup.pickupTimeSlot && (
                        <div className="text-xs text-gray-500">{shipment.pickup.pickupTimeSlot}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Not scheduled</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {shipment.providerData?.shiprocketAWB ? (
                    <a
                      href={shipment.trackingUrl || `https://shiprocket.co/tracking/${shipment.providerData.shiprocketAWB}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {shipment.providerData.shiprocketAWB}
                    </a>
                  ) : shipment.providerData?.delhiveryWaybill ? (
                    <a
                      href={shipment.trackingUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {shipment.providerData.delhiveryWaybill}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400">No AWB</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {format(new Date(shipment.createdAt), 'MMM dd, yyyy HH:mm')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!shipment.pickup?.scheduledDate && shipment.status === 'pending' && shipment.shippingProvider !== 'manual' && (
                      <button
                        onClick={() => onSchedulePickup(shipment)}
                        className="text-green-600 hover:text-green-900"
                        title="Schedule Pickup (AWB will be generated automatically)"
                      >
                        <FaCalendar size={14} />
                      </button>
                    )}
                    {/* Download Label Button - Show if AWB/Waybill is generated */}
                    {(shipment.providerData?.shiprocketAWB || shipment.providerData?.delhiveryWaybill) && onDownloadLabel && (
                      <button
                        onClick={() => onDownloadLabel(shipment._id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Download Shipping Label (PDF)"
                      >
                        <FaFilePdf size={14} />
                      </button>
                    )}
                    {/* Download Pickup Receipt Button - Show if pickup is scheduled */}
                    {shipment.pickup?.pickupId && onDownloadPickupReceipt && (
                      <button
                        onClick={() => onDownloadPickupReceipt(shipment._id)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Download Pickup Receipt (PDF)"
                      >
                        <FaDownload size={14} />
                      </button>
                    )}
                    {shipment.status !== 'delivered' && shipment.status !== 'cancelled' && (
                      <select
                        onChange={(e) => onUpdateStatus(shipment._id, e.target.value)}
                        value=""
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-red-500"
                      >
                        <option value="">Update Status</option>
                        <option value="picked_up">Picked Up</option>
                        <option value="in_transit">In Transit</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ShipmentTable;

