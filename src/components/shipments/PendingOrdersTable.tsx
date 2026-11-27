import React from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import StatusBadge from '@/components/order/StatusBadge';
import { formatDate } from '../../utils/date';

interface PendingOrder {
  _id: string;
  orderId: string;
  shippingAddress?: {
    fullName?: string;
    mobileNumber?: string;
    district?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  items?: any[];
  /** How many lines the order has (the board's pending list carries the count, not the lines). */
  itemCount?: number;
  total?: number;
  paymentMethod?: string;
  orderStatus?: string;
  /** The buyer's name on the order (the board's pending list carries it beside the address). */
  customerName?: string;
  createdAt?: string;
  [k: string]: any;
}

interface PendingOrdersTableProps {
  orders: PendingOrder[];
  onCreateShipment?: (orderId: string) => void;
  /**
   * Ticking orders to book together (the bulk bar above the table). The boxes show only when `onSelect` is given,
   * the same way the shipments table shows them.
   */
  selectedIds?: string[];
  onSelect?: (orderId: string, checked: boolean) => void;
  /** Ticks or clears every order on this page. */
  onSelectAll?: (checked: boolean) => void;
}

const PendingOrdersTable: React.FC<PendingOrdersTableProps> = ({ orders, onCreateShipment, selectedIds = [], onSelect, onSelectAll }) => {
  const safeFormatDate = (date: any, fmt: string) => formatDate(date, fmt, 'N/A');
  const allTicked = orders.length > 0 && orders.every((o) => selectedIds.includes(o._id));

  return (
    <div className="bg-white rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {onSelect ? (
                <div className="flex items-center gap-2">
                  {onSelectAll && orders.length > 0 && (
                    <Checkbox
                      checked={allTicked}
                      onCheckedChange={(checked: boolean | 'indeterminate') => onSelectAll(checked === true)}
                      aria-label="Select every order on this page"
                    />
                  )}
                  <span>Order ID</span>
                </div>
              ) : 'Order ID'}
            </TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center">
                No pending orders found.
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order._id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {onSelect && (
                      <Checkbox
                        checked={selectedIds.includes(order._id)}
                        onCheckedChange={(checked: boolean | 'indeterminate') => onSelect(order._id, checked === true)}
                        aria-label={`Select order ${order.orderId ?? ''}`}
                      />
                    )}
                    <Link
                      to={`/orders/${order._id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {order.orderId}
                    </Link>
                  </div>
                  {/* Where the order itself stands (confirmed, processing...), so an order on hold is not booked by mistake. */}
                  {(order.orderStatus || order.order_status) && (
                    <div className="mt-1">
                      <StatusBadge status={order.orderStatus || order.order_status} type="order" className="text-[10px]" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {order.customerName || order.customer_name || order.shippingAddress?.fullName || 'N/A'}
                  {order.shippingAddress?.fullName && (order.customerName || order.customer_name)
                    && order.shippingAddress.fullName.trim().toLowerCase() !== String(order.customerName || order.customer_name).trim().toLowerCase() && (
                    <div className="text-xs text-muted-foreground">ship to {order.shippingAddress.fullName}</div>
                  )}
                  {order.shippingAddress?.mobileNumber && (
                    <div className="text-xs text-muted-foreground tabular-nums">{order.shippingAddress.mobileNumber}</div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {(order.shippingAddress?.district || order.shippingAddress?.city) && order.shippingAddress?.pincode
                    ? `${order.shippingAddress.district || order.shippingAddress.city}, ${order.shippingAddress.pincode}`
                    : order.shippingAddress?.pincode || 'N/A'}
                </TableCell>
                <TableCell className="text-sm">
                  {(() => { const n = order.itemCount ?? order.items?.length ?? 0; return `${n} line${n === 1 ? '' : 's'}`; })()}
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {order.total != null ? `₹${order.total.toFixed(2)}` : 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant={order.paymentMethod === 'cod' ? 'outline' : 'secondary'} className="text-xs">
                    {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {safeFormatDate(order.createdAt, 'MMM dd, yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  {onCreateShipment && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCreateShipment(order._id)}
                      className="gap-1.5"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Create Shipment
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default PendingOrdersTable;
