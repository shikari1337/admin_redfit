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
  total?: number;
  paymentMethod?: string;
  orderStatus?: string;
  createdAt?: string;
}

interface PendingOrdersTableProps {
  orders: PendingOrder[];
  onCreateShipment?: (orderId: string) => void;
}

const PendingOrdersTable: React.FC<PendingOrdersTableProps> = ({ orders, onCreateShipment }) => {
  // Debug: log orders to check data structure
  console.log('📦 PendingOrdersTable orders:', JSON.stringify(orders?.slice(0, 2), null, 2));

  const safeFormatDate = (date: any, fmt: string) => formatDate(date, fmt, 'N/A');

  return (
    <div className="bg-white rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order ID</TableHead>
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
                  <Link
                    to={`/orders/${order._id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {order.orderId}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  {order.shippingAddress?.fullName || 'N/A'}
                </TableCell>
                <TableCell className="text-sm">
                  {(order.shippingAddress?.district || order.shippingAddress?.city) && order.shippingAddress?.pincode
                    ? `${order.shippingAddress.district || order.shippingAddress.city}, ${order.shippingAddress.pincode}`
                    : order.shippingAddress?.pincode || 'N/A'}
                </TableCell>
                <TableCell className="text-sm">
                  {order.items?.length || 0} item(s)
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
