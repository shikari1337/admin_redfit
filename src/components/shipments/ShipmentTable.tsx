import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar, ClipboardList, Download, FileText, RotateCcw, Phone } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  awb?: string;
  courierName?: string;
  expectedDelivery?: Date | string;
  trackingUrl?: string;
  createdAt: Date | string;
}

interface ShipmentTableProps {
  shipments: Shipment[];
  activeTab: string;
  selectedShipments: string[];
  onSelectShipment: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onSchedulePickup: (shipment: Shipment) => void;
  onUpdateStatus: (shipmentId: string, status: string) => void;
  onDownloadLabel?: (shipmentId: string, size?: '4R' | 'A4') => void;
  onDownloadManifest?: (shipmentId: string) => void;
  onDownloadPickupReceipt?: (shipmentId: string) => void;
  onNdrReattempt?: (shipmentId: string) => void;
  onNdrUpdatePhone?: (shipmentId: string, phone: string) => void;
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
  onDownloadManifest,
  onDownloadPickupReceipt,
  onNdrReattempt,
  onNdrUpdatePhone,
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
      case 'ndr_failed_delivery': return 'destructive';
      case 'rto_in_transit': return 'warning';
      case 'rto_delivered': return 'outline';
      case 'rto_failed': return 'destructive';
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
      ndr_failed_delivery: 'Failed Delivery',
      rto_in_transit: 'RTO In Transit',
      rto_delivered: 'RTO Delivered',
      rto_failed: 'RTO Failed',
    };
    return labels[status] || status;
  };

  const safeFormatDate = (date: any, fmt: string) => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return format(d, fmt);
    } catch {
      return 'N/A';
    }
  };

  // Allow selection on non-terminal tabs for bulk actions
  const showCheckboxes = ['ready_to_pick', 'pickup_scheduled', 'in_transit'].includes(activeTab);
  const selectableShipments = shipments.filter(
    s => !['delivered', 'cancelled', 'rto_delivered', 'rto_failed'].includes(s.status) && s.shippingProvider !== 'manual'
  );

  return (
    <div className="bg-white rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">
              <div className="flex items-center gap-2">
                {showCheckboxes && selectableShipments.length > 0 && (
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
            <TableHead>Courier</TableHead>
            <TableHead>Est. Delivery</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="h-24 text-center">
                No shipments found.
              </TableCell>
            </TableRow>
          ) : (
            shipments.map((shipment) => (
              <TableRow key={shipment._id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {showCheckboxes && shipment.shippingProvider !== 'manual' && !['delivered', 'cancelled', 'rto_delivered', 'rto_failed'].includes(shipment.status) && (
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
                      {safeFormatDate(shipment.pickup.scheduledDate, 'MMM dd, yyyy')}
                      {shipment.pickup.pickupTimeSlot && (
                        <div className="text-xs text-muted-foreground mt-0.5">{shipment.pickup.pickupTimeSlot}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not scheduled</span>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const awb = shipment.awb || shipment.providerData?.shiprocketAWB || shipment.providerData?.delhiveryWaybill;
                    if (!awb) return <span className="text-sm text-muted-foreground">No AWB</span>;
                    const href = shipment.trackingUrl
                      || (shipment.providerData?.shiprocketAWB ? `https://shiprocket.co/tracking/${awb}` : '#');
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                        {awb}
                      </a>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm">
                  {shipment.courierName || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {shipment.expectedDelivery ? safeFormatDate(shipment.expectedDelivery, 'MMM dd, yyyy') : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {safeFormatDate(shipment.createdAt, 'MMM dd, yyyy HH:mm')}
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
                    {/* Download Label — page size picker (4R thermal / A4) */}
                    {(shipment.providerData?.shiprocketAWB || shipment.providerData?.delhiveryWaybill) && onDownloadLabel && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Download Shipping Label (PDF)"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onDownloadLabel(shipment._id, '4R')}>
                            Label — 4R (thermal)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDownloadLabel(shipment._id, 'A4')}>
                            Label — A4
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {/* Download Manifest Button */}
                    {(shipment.providerData?.shiprocketAWB || shipment.providerData?.delhiveryWaybill) && onDownloadManifest && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDownloadManifest(shipment._id)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Download Manifest (PDF)"
                      >
                        <ClipboardList className="h-4 w-4" />
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
                    {/* NDR Actions for Failed Delivery */}
                    {shipment.status === 'ndr_failed_delivery' && onNdrReattempt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onNdrReattempt(shipment._id)}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        title="Re-attempt Delivery"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {shipment.status === 'ndr_failed_delivery' && onNdrUpdatePhone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const phone = prompt('Enter updated phone number for delivery:');
                          if (phone) onNdrUpdatePhone(shipment._id, phone);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        title="Update Delivery Phone Number"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    )}
                    {!['delivered', 'cancelled', 'returned', 'rto_delivered', 'rto_failed'].includes(shipment.status) && (
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
                            <SelectItem value="rto_in_transit">RTO In Transit</SelectItem>
                            <SelectItem value="rto_delivered">RTO Delivered</SelectItem>
                            <SelectItem value="rto_failed">RTO Failed / Lost / Damaged</SelectItem>
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

