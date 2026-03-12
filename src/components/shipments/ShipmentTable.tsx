import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar, Download, FileText } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

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
    switch (status) {
      case 'pending': return 'warning';
      case 'pickup_scheduled': return 'default';
      case 'picked_up': return 'default';
      case 'in_transit': return 'secondary';
      case 'out_for_delivery': return 'secondary';
      case 'delivered': return 'success';
      case 'cancelled': return 'destructive';
      case 'returned': return 'outline';
      default: return 'outline';
    }
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
    <div className="bg-white rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">
              <div className="flex items-center gap-2">
                {activeTab === 'ready_to_pickup' && selectableShipments.length > 0 && (
                  <Checkbox
                    checked={selectedShipments.length === selectableShipments.length && selectableShipments.length > 0}
                    onCheckedChange={(checked: boolean | "indeterminate") => onSelectAll(checked as boolean)}
                  />
                )}
                <span>Shipment #</span>
              </div>
            </TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pickup Date</TableHead>
            <TableHead>AWB/Tracking</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                No shipments found.
              </TableCell>
            </TableRow>
          ) : (
            shipments.map((shipment) => (
              <TableRow key={shipment._id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {activeTab === 'ready_to_pickup' && shipment.status === 'pending' && shipment.shippingProvider !== 'manual' && (
                      <Checkbox
                        checked={selectedShipments.includes(shipment._id)}
                        onCheckedChange={(checked: boolean | "indeterminate") => onSelectShipment(shipment._id, checked as boolean)}
                      />
                    )}
                    {shipment.shipmentNumber}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {Array.isArray(shipment.orders) ? shipment.orders.length : 0} order(s)
                  </div>
                  {Array.isArray(shipment.orders) && shipment.orders.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-1">
                      {shipment.orders.slice(0, 2).map((order: any) => (
                        <Link
                          key={order._id || order}
                          to={`/orders/${typeof order === 'object' ? order._id : order}`}
                          className="block hover:text-primary hover:underline"
                        >
                          {typeof order === 'object' ? order.orderId : order}
                        </Link>
                      ))}
                      {shipment.orders.length > 2 && ` +${shipment.orders.length - 2} more`}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {typeof shipment.warehouseId === 'object' && shipment.warehouseId?.name
                    ? shipment.warehouseId.name
                    : 'N/A'}
                </TableCell>
                <TableCell className="capitalize">{shipment.shippingProvider}</TableCell>
                <TableCell>
                  <Badge variant={getStatusColor(shipment.status) as any}>
                    {getStatusLabel(shipment.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {shipment.pickup?.scheduledDate ? (
                    <div className="text-sm">
                      {format(new Date(shipment.pickup.scheduledDate), 'MMM dd, yyyy')}
                      {shipment.pickup.pickupTimeSlot && (
                        <div className="text-xs text-muted-foreground mt-0.5">{shipment.pickup.pickupTimeSlot}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not scheduled</span>
                  )}
                </TableCell>
                <TableCell>
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
                    <span className="text-sm text-muted-foreground">No AWB</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(shipment.createdAt), 'MMM dd, yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {!shipment.pickup?.scheduledDate && shipment.status === 'pending' && shipment.shippingProvider !== 'manual' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSchedulePickup(shipment)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Schedule Pickup (AWB will be generated automatically)"
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Download Label Button */}
                    {(shipment.providerData?.shiprocketAWB || shipment.providerData?.delhiveryWaybill) && onDownloadLabel && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDownloadLabel(shipment._id)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Download Shipping Label (PDF)"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Download Pickup Receipt Button */}
                    {shipment.pickup?.pickupId && onDownloadPickupReceipt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDownloadPickupReceipt(shipment._id)}
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        title="Download Pickup Receipt (PDF)"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {shipment.status !== 'delivered' && shipment.status !== 'cancelled' && (
                      <div className="w-[140px]">
                        <Select
                          onValueChange={(value) => value && onUpdateStatus(shipment._id, value)}
                          value=""
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Update Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="picked_up">Picked Up</SelectItem>
                            <SelectItem value="in_transit">In Transit</SelectItem>
                            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ShipmentTable;

