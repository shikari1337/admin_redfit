import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ordersAPI, shippingAPI } from '../services/api';
import { formatDate } from '../utils/date';
import { fmtRupees } from '../lib/money';
import { FaTruck, FaWhatsapp, FaEye, FaDownload, FaPlus, FaSearchDollar, FaFileExcel } from 'react-icons/fa';
import RecoverPaymentModal from '../components/order/RecoverPaymentModal';
import ErpExportModal from '../components/order/ErpExportModal';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { Search } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast"; // Assuming useToast is available, fallback to alert if not
import { FaCheckCircle } from 'react-icons/fa';

const Orders: React.FC = () => {
  const { canAccess, hasPerm } = useAuth();
  // Backend (routes/orders.ts): status change / manual order create / payment
  // mark-paid all require orders.manage. Send-to-Shiprocket is a DIFFERENT
  // permission (routes/shipping.ts POST /create-shipment -> shipments.manage) —
  // this page previously gated it only on canAccess('shipping'), a module-
  // enabled flag, not an actual permission (same class of gap already fixed on
  // OrderDetail.tsx 2026-08-28). This page had ZERO hasPerm gating before.
  const canManageOrders = hasPerm('orders.manage');
  const canManageShipments = hasPerm('shipments.manage');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  // Retail vs B2B tab — only meaningful (and only shown) when the B2B module is on.
  const [typeFilter, setTypeFilter] = useState<'all' | 'retail' | 'b2b'>('all');
  // Free-text search (order #, SKU, name, email, phone) — debounced the same
  // way Customers.tsx does (plain useState + setTimeout), not useListControls.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Same page size as before pagination existed (100) — adding page controls,
  // not shrinking how many orders staff see per screen.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 100;
  const b2bEnabled = canAccess('b2b');
  const [sendingToShiprocket, setSendingToShiprocket] = useState<string | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showRecoverPayment, setShowRecoverPayment] = useState(false);
  // ERP hand-off: the legacy "Order Items Export" workbook the store's ERP
  // imports (since-last-export watermark or a custom date range).
  const [showErpExport, setShowErpExport] = useState(false);

  // Try to use toast, fallback to window.alert if not available
  let toast: any;
  try {
    const hook = useToast();
    toast = hook.toast;
  } catch (e) {
    toast = ({ title, description }: any) => window.alert(`${title ? title + ': ' : ''}${description}`);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter/search change starts back at page 1 — otherwise a narrower
  // result set can leave the page number pointing past the last real page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, debouncedSearch]);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, typeFilter, debouncedSearch, page]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.order_type = typeFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const response = await ordersAPI.getAll({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

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
      // The axios interceptor unwraps { success, data, total } to the array
      // itself, with `total` preserved as a non-enumerable property (same
      // pattern Customers.tsx relies on) — read it off whichever value above
      // actually held the array.
      setTotal((response as any)?.total ?? (fetchedOrders as any)?.total ?? fetchedOrders.length);
      setSelectedIds([]);
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
      // shippingProvider is REQUIRED by the backend (express-validator
      // `body('shippingProvider').notEmpty()`) — omitting it (as this call
      // always did) 400'd on every single click, always, before the request
      // ever reached the booking logic. This button's own confirm dialog
      // already says "Send this order to Shiprocket" — it just never told
      // the backend that.
      const response = await shippingAPI.createShipment(orderId, { shippingProvider: 'shiprocket' });
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

  const handleConfirmOrder = async (orderId: string) => {
    if (!confirm('Confirm this order? After confirmation, you can create a shipment.')) return;
    
    setConfirmingOrder(orderId);
    try {
      await ordersAPI.confirmOrder(orderId);
      toast({ title: "Confirmed", description: 'Order confirmed successfully!' });
      fetchOrders();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to confirm order.' });
    } finally {
      setConfirmingOrder(null);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? [...new Set([...prev, id])] : prev.filter(x => x !== id));
  };

  /** Export the selected orders' sales data — or everything in the filter. */
  const handleExport = async (onlySelected: boolean) => {
    setExporting(true);
    try {
      await ordersAPI.exportCsv({
        ids: onlySelected ? selectedIds : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.response?.data?.message || 'Could not export orders' });
    } finally {
      setExporting(false);
    }
  };

  // Was a coarse 4-bucket variant scheme (default/secondary/destructive/
  // outline) that couldn't distinguish e.g. 'shipped' from 'confirmed' from
  // 'processing' — now sources real per-status colors from the same palette
  // components/order/StatusBadge.tsx centralizes for every other order/
  // payment-status display in the admin.

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage and track customer orders, shipments, and statuses.
            {total > 0 && <span className="ml-1.5">Total: <span className="font-semibold text-foreground">{total}</span></span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageOrders && (
            <Button variant="default" size="sm" className="h-9 bg-green-600 hover:bg-green-700" asChild>
              <Link to="/orders/new">
                <FaPlus className="mr-1.5 h-3 w-3" /> Create Order
              </Link>
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => handleExport(true)} disabled={exporting}>
              <FaDownload className="mr-1.5 h-3 w-3" />
              Export {selectedIds.length} selected
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={() => handleExport(false)} disabled={exporting}>
            <FaDownload className="mr-1.5 h-3 w-3" />
            {exporting ? 'Exporting…' : 'Export all'}
          </Button>
          <Button variant="outline" size="sm" className="h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setShowErpExport(true)}
            title="Excel in the ERP's Order Items Export layout — since the last export, or a custom date range">
            <FaFileExcel className="mr-1.5 h-3 w-3" />
            Export for ERP
          </Button>
          {canManageOrders && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setShowRecoverPayment(true)}
              title="Recover a payment Razorpay shows as paid that never turned into an order">
              <FaSearchDollar className="mr-1.5 h-3 w-3" />
              Recover Payment
            </Button>
          )}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, SKU, name, email, or phone…"
              className="h-9 pl-8"
            />
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
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Retail / B2B tabs — shown only when the B2B module is enabled. */}
      {b2bEnabled && (
        <div className="flex items-center gap-1 mb-4 border-b border-border">
          {([
            { key: 'all', label: 'All Orders' },
            { key: 'retail', label: 'Retail' },
            { key: 'b2b', label: 'B2B / Wholesale' },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                typeFilter === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-md border-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-10 px-4 py-3">
                    <Checkbox
                      checked={orders.length > 0 && selectedIds.length === orders.length}
                      onCheckedChange={(checked: boolean | "indeterminate") =>
                        setSelectedIds(checked ? orders.map(o => o._id) : [])}
                    />
                  </TableHead>
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
                    <TableCell colSpan={8} className="h-48 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                      No orders found matching the filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order._id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.includes(order._id)}
                          onCheckedChange={(checked: boolean | "indeterminate") => toggleSelect(order._id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{order.orderId || order._id?.substring(0, 8).toUpperCase()}</span>
                          {/* Sale type at a glance — B2B (wholesale) vs retail. */}
                          {(order.orderType ?? order.order_type) === 'b2b' ? (
                            <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0">
                              B2B{(order.b2bTier ?? order.b2b_tier) ? ` · ${order.b2bTier ?? order.b2b_tier}` : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Retail</Badge>
                          )}
                          {(order.isFlagged ?? order.is_flagged) && (
                            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 text-[10px] px-1.5 py-0">Flagged</Badge>
                          )}
                          {/* Placed via the storefront's Bulk Order Platform (marker in
                              order notes, written by the portal's checkout hand-off). */}
                          {/Source:\s*Bulk Order Platform/i.test(String(order.notes ?? '')) && (
                            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 text-[10px] px-1.5 py-0">Bulk Platform</Badge>
                          )}
                          {(() => {
                            const m = String(order.notes ?? '').match(/PO Ref:\s*([^\n]+)/i);
                            return m ? (
                              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0" title="Buyer's purchase-order reference">
                                PO: {m[1].trim()}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
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
                        {fmtRupees(order.total || 0)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs text-muted-foreground uppercase font-semibold">
                            {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
                          </span>
                          <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider rounded-sm px-1.5 py-0 border-transparent ${getStatusColorClass('payment', order.paymentStatus)}`}>
                            {order.paymentStatus}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className={`uppercase text-[11px] font-bold tracking-wider border-transparent ${getStatusColorClass('order', order.orderStatus)}`}>
                          {order.orderStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {/* Date AND time — ops needs to see when the order came in. */}
                        <div>{formatDate(order.createdAt ?? order.created_at, 'MMM dd, yyyy', 'N/A')}</div>
                        <div className="text-xs font-medium text-foreground">{formatDate(order.createdAt ?? order.created_at, 'hh:mm a', '')}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 isolate">
                          {canManageOrders && order.orderStatus === 'pending' && (
                            <Button
                              variant="default"
                              size="sm"
                              title="Confirm Order"
                              className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 rounded-full flex-shrink-0"
                              onClick={() => handleConfirmOrder(order._id)}
                              disabled={confirmingOrder === order._id || (order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed')}
                            >
                              {confirmingOrder === order._id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              ) : (
                                <FaCheckCircle size={14} />
                              )}
                            </Button>
                          )}
                          {canAccess('shipping') && canManageShipments && (order.orderStatus === 'confirmed' || order.orderStatus === 'processing') && (
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} orders
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground mr-1">
              Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(Math.ceil(total / PAGE_SIZE), p + 1))} disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}>
              Next
            </Button>
          </div>
        </div>
      )}

      <RecoverPaymentModal
        isOpen={showRecoverPayment}
        onClose={() => setShowRecoverPayment(false)}
        onRecovered={fetchOrders}
      />
      <ErpExportModal
        isOpen={showErpExport}
        onClose={() => setShowErpExport(false)}
        canManage={canManageOrders}
      />
    </div>
  );
};

export default Orders;
