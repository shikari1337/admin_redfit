import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, shippingAPI } from '../services/api';
import { format } from 'date-fns';
import { FaTruck, FaWhatsapp, FaEye } from 'react-icons/fa';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast"; // Assuming useToast is available, fallback to alert if not

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingToShiprocket, setSendingToShiprocket] = useState<string | null>(null);
  
  // Try to use toast, fallback to window.alert if not available
  let toast: any;
  try {
    const hook = useToast();
    toast = hook.toast;
  } catch (e) {
    toast = ({ title, description }: any) => window.alert(`${title ? title + ': ' : ''}${description}`);
  }

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const response = await ordersAPI.getAll({ ...params, limit: 100 });
      
      let fetchedOrders: any[] = [];
      if (Array.isArray(response)) {
        fetchedOrders = response;
      } else if (response?.data && Array.isArray(response.data)) {
        fetchedOrders = response.data;
      } else if (response?.success && response?.data && Array.isArray(response.data)) {
        fetchedOrders = response.data;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        fetchedOrders = response.data.data;
      } else {
        console.warn('Unexpected orders response structure:', response);
      }
      
      setOrders(fetchedOrders);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.response?.data?.message || 'Failed to load orders. Please try again.',
      });
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToShiprocket = async (orderId: string) => {
    if (!confirm('Send this order to Shiprocket for shipment creation?')) return;
    
    setSendingToShiprocket(orderId);
    try {
      const response = await shippingAPI.createShipment(orderId);
      toast({
        title: "Shipment Created",
        description: `Shipment created successfully!${response.data?.shipment?.awbCode ? ` AWB: ${response.data.shipment.awbCode}` : ''}`,
      });
      fetchOrders(); 
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      toast({
        variant: "destructive",
        title: "Shipment Failed",
        description: error.response?.data?.message || 'Failed to create shipment. Please try again.',
      });
    } finally {
      setSendingToShiprocket(null);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | null => {
    const s = status?.toLowerCase();
    if (['delivered', 'completed', 'shipped'].includes(s)) return 'default';
    if (['cancelled', 'failed', 'refunded'].includes(s)) return 'destructive';
    if (['pending'].includes(s)) return 'outline';
    return 'secondary';
  };

  const getPaymentBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | null => {
    return status?.toLowerCase() === 'completed' ? 'default' : 'secondary';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage and track customer orders, shipments, and statuses.</p>
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-md border-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold px-4 py-3">Order ID</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Customer</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Amount</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Payment</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                  <TableHead className="font-semibold px-4 py-3">Date</TableHead>
                  <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                      No orders found matching the filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order._id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium px-4 py-3">
                        {order.orderId || order._id?.substring(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium">{order.shippingAddress?.fullName || 'Unknown Customer'}</div>
                        {order.shippingAddress?.mobileNumber && (
                          <button
                            onClick={() => handleWhatsAppClick(order.shippingAddress?.mobileNumber || '')}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-1 font-medium pb-1"
                            title="Open WhatsApp"
                          >
                            <FaWhatsapp size={13} className="text-green-500" />
                            {order.shippingAddress?.mobileNumber}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        ₹{(order.total || 0).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs text-muted-foreground uppercase font-semibold">
                            {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
                          </span>
                          <Badge variant={getPaymentBadgeVariant(order.paymentStatus)} className="text-[10px] uppercase font-bold tracking-wider rounded-sm px-1.5 py-0">
                            {order.paymentStatus}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={getStatusBadgeVariant(order.orderStatus)} className="uppercase text-[11px] font-bold tracking-wider">
                          {order.orderStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {order.createdAt
                          ? format(new Date(order.createdAt), 'MMM dd, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 isolate">
                          {(order.orderStatus === 'confirmed' || order.orderStatus === 'processing') && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 gap-1.5 px-3 bg-blue-600 hover:bg-blue-700"
                              onClick={() => handleSendToShiprocket(order._id)}
                              disabled={sendingToShiprocket === order._id}
                            >
                              <FaTruck size={12} />
                              <span className="hidden sm:inline">
                                {sendingToShiprocket === order._id ? 'Sending...' : 'Shiprocket'}
                              </span>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8 px-3" asChild>
                            <Link to={`/orders/${order._id}`}>
                              <FaEye className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                              View
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;
