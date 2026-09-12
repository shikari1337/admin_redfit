/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ordersAPI, shippingAPI, paymentsAPI, shipmentsAPI, invoicesAPI } from '../services/api';
import { formatDate } from '../utils/date';
import { fmtRupees, fmtCurrencyMinor } from '../lib/money';
import { FaCheckCircle, FaEnvelope, FaFileInvoice, FaCreditCard, FaTruck, FaArrowLeft, FaDownload, FaWhatsapp, FaSms, FaChevronDown, FaMoneyCheckAlt, FaTag } from 'react-icons/fa';
import {
  StatusBadge,
  OrderItems,
  OrderStatusHistory,
  PaymentInformation,
  OrderNotes,
  ShipmentCreationModal,
  PaymentVerificationModal,
  UpdateEmailModal,
  OrderFulfillmentCard,
  OrderJourneyCard,
  OrderLinksCard,
  OrderItemsEditModal,
  OrderBillingCard,
  OrderAddressEditor,
  RecordCodPaymentModal,
  DeliveryStatusModal,
  MarkAsPaidModal,
  OrderProgressStepper,
  OrderTeamCard,
  CancelOrderModal,
  OrderRefunds,
  OrderCommunicationLog,
  ApplyOrderDiscountModal,
  OrderNavigator,
  OrderCustomerCard,
  OrderAddressPanel,
  RaiseRefundModal,
} from '../components/order';
import type { RazorpayAuditResult, RefundOutcome } from '../components/order';
import { PickupModal } from '../components/shipments';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

/**
 * Legal order-status moves, mirroring ALLOWED_TRANSITIONS in
 * `backend/src/routes/orders.ts`. The API is the authority (it 409s on an
 * illegal move); this is here so the dropdown only offers moves that will work.
 *
 * `on_hold` parks an order that needs attention — stock, address, a payment
 * query — without cancelling it, and is reachable from every pre-shipping state.
 * Terminal states (cancelled, completed) have no exits.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'processing', 'on_hold', 'cancelled'],
  confirmed: ['processing', 'shipped', 'on_hold', 'cancelled'],
  processing: ['shipped', 'on_hold', 'cancelled'],
  on_hold: ['pending', 'confirmed', 'processing', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'returned', 'cancelled'],
  out_for_delivery: ['delivered', 'shipped', 'returned'],
  delivered: ['return_requested', 'completed'],
  // System-derived only (shipment rollup, migration 133) — not a manual
  // dropdown target, but needs its own exits once an order lands here.
  partially_delivered: ['return_requested', 'completed'],
  return_requested: ['returned', 'delivered'],
  returned: ['completed'],
  cancelled: [],
  completed: [],
};

const STATUS_LABEL: Record<string, string> = {
  on_hold: 'On hold',
  out_for_delivery: 'Out for delivery',
  return_requested: 'Return requested',
  partially_delivered: 'Partially delivered',
};

/** One fact in the side rail: a fixed-width label with its value beside it. */
const TrackRow: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-baseline gap-2 text-sm">
    <span className="w-[86px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
    <span className="min-w-0 flex-1 text-slate-700">{v}</span>
  </div>
);

/** Order states past which dispatch-time documents (label/manifest) no longer apply. */
const ORDER_TERMINAL_STATUSES = ['delivered', 'cancelled', 'returned', 'return_requested'];

const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate('/orders');
    return null;
  }
  const { canAccess, hasPerm } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [sendingToShiprocket, setSendingToShiprocket] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [shippingProviders, setShippingProviders] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedShippingProvider, setSelectedShippingProvider] = useState<'shiprocket' | 'delhivery' | 'manual'>('shiprocket');
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [manualTrackingId, setManualTrackingId] = useState('');
  const [manualCarrierName, setManualCarrierName] = useState('');
  const [manualTrackingUrl, setManualTrackingUrl] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [showPaymentVerifyModal, setShowPaymentVerifyModal] = useState(false);
  const [showRecordCodPayment, setShowRecordCodPayment] = useState(false);
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');
  const [upiPaymentId, setUpiPaymentId] = useState('');
  const [paymentVerificationNotes, setPaymentVerificationNotes] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  // Which invoice action is running: 'download' | 'email' | 'whatsapp' | 'sms' | null.
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [showEditItems, setShowEditItems] = useState(false);
  const [removingCharge, setRemovingCharge] = useState<'shipping' | 'cod' | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [showUpdateEmailModal, setShowUpdateEmailModal] = useState(false);
  const [updateEmailSubject, setUpdateEmailSubject] = useState('');
  const [updateEmailContent, setUpdateEmailContent] = useState('');
  // 'delivered' | 'rto' picks which action opened the modal; null = closed.
  const [deliveryModalMode, setDeliveryModalMode] = useState<'delivered' | 'rto' | null>(null);
  // Manual "Mark as Paid" — for a payment that settled outside any gateway
  // this system can verify (bank transfer, cash, cheque), distinct from the
  // gateway-specific "Verify Payment" flow above.
  const [showMarkAsPaidModal, setShowMarkAsPaidModal] = useState(false);
  const [showRaiseRefund, setShowRaiseRefund] = useState(false);
  // A retention lever on an order that has not been paid or shipped yet —
  // same editability gate the server enforces, so the button is never offered
  // for an order the route would refuse.
  const [showApplyDiscount, setShowApplyDiscount] = useState(false);
  // Cancelling a PAID order decides where the customer's money goes — the
  // dialog asks, rather than the bare confirm() the other transitions use.
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Read-only re-check of an already-recorded Razorpay payment against
  // Razorpay itself (status + amount) — independent of order/payment status,
  // unlike "Verify Payment" above which only works while still pending.
  const [auditingRazorpay, setAuditingRazorpay] = useState(false);
  const [razorpayAuditResult, setRazorpayAuditResult] = useState<RazorpayAuditResult | null>(null);

  // Shipment actions state
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [assigningAwb, setAssigningAwb] = useState(false);
  const [attachingAwb, setAttachingAwb] = useState(false);

  let toast: any;
  try {
    const hook = useToast();
    toast = hook.toast;
  } catch (e) {
    toast = ({ title, description }: any) => window.alert(`${title ? title + ': ' : ''}${description}`);
  }

  useEffect(() => {
    fetchOrder();
    fetchWarehouses();
    fetchShippingProviders();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const response = await ordersAPI.getById(id);
      const orderData = response?.data || response;
      setOrder(orderData);
      // Shareable review-and-pay link — useful while unpaid, or for COD orders
      // that want to pay online before dispatch.
      if (orderData && (orderData.paymentStatus !== 'completed')) {
        ordersAPI.getPayLink(orderData.orderId || id)
          .then((r: any) => setPayLink(r?.url ?? r?.data?.url ?? null))
          .catch(() => setPayLink(null));
      } else {
        setPayLink(null);
      }
    } catch (error) {
      console.error('Failed to load order:', error);
      toast({ variant: "destructive", title: "Error", description: 'Failed to load order' });
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Finish a booking that stalled after the carrier order was created (empty
   * Shiprocket wallet, courier outage). Re-running "Create Shipment" would book
   * a SECOND order at the carrier, so this reuses the stored shipment id.
   */
  const handleAssignAwb = async () => {
    const shipmentId = order?.shiprocketShipmentId ?? order?.shiprocket_shipment_id;
    if (!shipmentId) return;
    setAssigningAwb(true);
    try {
      const r = await shippingAPI.assignAwb(String(shipmentId));
      toast({ title: 'AWB assigned', description: `${r.awbCode ?? ''} ${r.courierName ? `via ${r.courierName}` : ''}`.trim() });
      await fetchOrder();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'AWB not assigned',
        description: e?.response?.data?.message || e?.message || 'Assignment failed',
      });
    } finally {
      setAssigningAwb(false);
    }
  };

  /**
   * Link a shipment that was booked straight in the carrier's own dashboard
   * (Shiprocket panel) instead of through this app — those never get an AWB
   * here, so nothing about them was ever visible on the order or the board.
   */
  const handleAttachAwb = async () => {
    const awb = window.prompt('Paste the AWB / waybill number from the carrier:');
    if (!awb || !awb.trim()) return;
    const provider = order?.shippingProvider === 'delhivery' ? 'delhivery' : 'shiprocket';
    setAttachingAwb(true);
    try {
      await shipmentsAPI.attachAwb(String(order._id || order.id), awb.trim(), provider);
      toast({ title: 'Shipment attached', description: `AWB ${awb.trim()} linked to this order.` });
      await fetchOrder();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not attach AWB',
        description: e?.response?.data?.message || e?.message || 'Attach failed',
      });
    } finally {
      setAttachingAwb(false);
    }
  };

  /**
   * Cancelling is not just a status change — it decides what happens to money
   * the customer has already paid. It gets a real dialog (CancelOrderModal)
   * that reads the order's paid position and asks which refund rail to use,
   * instead of the bare confirm() every other transition uses.
   */
  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === 'cancelled') { setShowCancelModal(true); return; }
    const label = STATUS_LABEL[newStatus] ?? newStatus;
    if (!confirm(`Update order status to ${label}?`)) return;

    setUpdating(true);
    try {
      await ordersAPI.updateStatus(id!, newStatus, statusNotes || undefined);
      setStatusNotes('');
      fetchOrder();
      toast({ title: "Success", description: `Order status updated to ${label}.` });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update order status';
      toast({ variant: "destructive", title: "Update Failed", description: errorMessage });
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async (text: string) => {
    setSavingNotes(true);
    try {
      await ordersAPI.addNote(id!, text);
      fetchOrder();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: 'Failed to save note' });
    } finally {
      setSavingNotes(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await shippingAPI.getWarehouses();
      let warehousesData: any[] = [];
      if (Array.isArray(response)) warehousesData = response;
      else if (response?.success && Array.isArray(response?.data)) warehousesData = response.data;
      else if (Array.isArray(response?.data)) warehousesData = response.data;
      else if (Array.isArray(response?.data?.data)) warehousesData = response.data.data;
      
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      
      if (warehousesData.length > 0 && !selectedWarehouseId) {
        const firstWarehouse = warehousesData[0];
        if (firstWarehouse && firstWarehouse._id) {
          let warehouseIdStr = String(firstWarehouse._id);
          if (typeof firstWarehouse._id === 'object' && firstWarehouse._id !== null) {
            if ((firstWarehouse._id as any).buffer) {
               const buffer = (firstWarehouse._id as any).buffer;
               if (buffer && typeof buffer === 'object') {
                 warehouseIdStr = Array.from(new Uint8Array(Object.values(buffer) as number[]))
                   .map(b => b.toString(16).padStart(2, '0')).join('');
               }
            } else if ((firstWarehouse._id as any).toString) {
              warehouseIdStr = (firstWarehouse._id as any).toString();
            }
          }
          if (!/^[0-9a-fA-F]{24}$/.test(warehouseIdStr)) warehouseIdStr = String(firstWarehouse._id);
          setSelectedWarehouseId(warehouseIdStr);
        }
      }
    } catch (error) {
      setWarehouses([]);
    }
  };

  const fetchShippingProviders = async () => {
    try {
      const response = await shippingAPI.getProviders();
      let providersData: any[] = [];
      if (Array.isArray(response)) providersData = response;
      else if (response?.success && Array.isArray(response?.data)) providersData = response.data;
      else if (Array.isArray(response?.data)) providersData = response.data;
      else if (Array.isArray(response?.data?.data)) providersData = response.data.data;
      
      if (providersData.length > 0) {
        setShippingProviders(providersData);
        if (!selectedShippingProvider && providersData.length > 0) {
          setSelectedShippingProvider(providersData[0].id || 'manual');
        }
      } else {
        setShippingProviders([]);
        setSelectedShippingProvider('manual');
      }
    } catch (error) {
      setShippingProviders([]);
      setSelectedShippingProvider('manual');
    }
  };

  const handleVerifyPayment = async () => {
    setVerifyingPayment(true);
    try {
      if (order.paymentGateway === 'razorpay') {
        if (!razorpayPaymentId) {
          toast({ variant: "destructive", title: "Missing ID", description: 'Please enter Razorpay Payment ID' });
          setVerifyingPayment(false); return;
        }
        await paymentsAPI.verifyRazorpay(id!, razorpayPaymentId);
        toast({ title: "Verified", description: 'Razorpay payment verified successfully!' });
      } else if (order.paymentGateway === 'upi') {
        if (!upiPaymentId) {
          toast({ variant: "destructive", title: "Missing ID", description: 'Please enter UPI Payment ID' });
          setVerifyingPayment(false); return;
        }
        await paymentsAPI.verifyUPI(id!, upiPaymentId, paymentVerificationNotes || undefined);
        toast({ title: "Verified", description: 'UPI payment verified successfully!' });
      } else if (order.paymentGateway === 'manual') {
        await paymentsAPI.verifyManual(id!, paymentVerificationNotes || undefined);
        toast({ title: "Verified", description: 'Manual payment verified successfully!' });
      }
      setShowPaymentVerifyModal(false);
      setRazorpayPaymentId('');
      setUpiPaymentId('');
      setPaymentVerificationNotes('');
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: error.response?.data?.message || 'Failed to verify payment.' });
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handleAuditRazorpayPayment = async () => {
    setAuditingRazorpay(true);
    try {
      const res: any = await paymentsAPI.auditRazorpay(id!);
      const result: RazorpayAuditResult = res?.data ?? res;
      setRazorpayAuditResult(result);
      toast(
        result.verified
          ? { title: 'Confirmed', description: 'Razorpay confirms this payment: captured, amount matches.' }
          : { variant: 'destructive', title: 'Mismatch found', description: 'This payment does not match what Razorpay has on record — see details below.' }
      );
    } catch (error: any) {
      toast({ variant: "destructive", title: "Check Failed", description: error.response?.data?.message || 'Failed to verify against Razorpay.' });
    } finally {
      setAuditingRazorpay(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!confirm('Confirm this order? After confirmation, you can create a shipment.')) return;
    
    setConfirmingOrder(true);
    try {
      // POST /:id/confirm never existed on the backend — this always 404'd.
      // "Confirmed" is just a normal status transition, already handled by /status.
      await ordersAPI.updateStatus(id!, 'confirmed');
      toast({ title: "Confirmed", description: 'Order confirmed successfully!' });
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to confirm order.' });
    } finally {
      setConfirmingOrder(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!confirm('Mark this order as completed? This action cannot be undone.')) return;
    
    setUpdating(true);
    try {
      // Same story as confirm — POST /:id/complete never existed.
      await ordersAPI.updateStatus(id!, 'completed');
      toast({ title: "Completed", description: 'Order marked as completed successfully!' });
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to finish order.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveCharge = async (charge: 'shipping' | 'cod') => {
    const label = charge === 'shipping' ? 'shipping' : 'COD handling';
    if (!confirm(`Remove the ${label} charge from this order? This reduces the order total and cannot be undone from here.`)) return;

    setRemovingCharge(charge);
    try {
      const res = await ordersAPI.waiveCharge(id!, charge);
      toast({ title: 'Removed', description: res?.message || `${label} charge removed.` });
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || `Failed to remove the ${label} charge.` });
    } finally {
      setRemovingCharge(null);
    }
  };

  /** On-demand order message on a chosen channel. */
  const [sendingNotify, setSendingNotify] = useState<string | null>(null);
  const handleNotify = async (event: string, channel: 'whatsapp' | 'sms' | 'email', label: string) => {
    setSendingNotify(`${event}:${channel}`);
    try {
      const res: any = await ordersAPI.notify(id!, event, channel);
      toast({ title: `${label} sent`, description: res?.message || `Delivered on ${channel}.` });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: `${label} not sent`,
        description: e?.response?.data?.message || `Could not send on ${channel}.`,
      });
    } finally {
      setSendingNotify(null);
    }
  };

  const handleSendEmail = async (type: 'confirmation' | 'update' | 'invoice', subject?: string, content?: string) => {
    if (!order.shippingAddress?.email) {
      toast({ variant: "destructive", title: "No Email", description: 'Customer email address is not available' });
      return;
    }

    if (type === 'update' && (!subject || !content)) {
      setShowUpdateEmailModal(true); return;
    }

    setSendingEmail(type);
    try {
      if (type === 'update' && subject && content) {
        await ordersAPI.sendEmail(id!, type, { subject, content });
      } else {
        await ordersAPI.sendEmail(id!, type);
      }
      toast({ title: "Email Sent", description: `Sent successfully to ${order.shippingAddress.email}` });
      setShowUpdateEmailModal(false);
      setUpdateEmailSubject('');
      setUpdateEmailContent('');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || `Failed to send ${type} email` });
    } finally {
      setSendingEmail(null);
    }
  };

  const handleDownloadInvoice = async () => {
    setInvoiceBusy('download');
    try {
      const blob = await invoicesAPI.downloadPdf(order.orderId || id!);
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${order.orderId || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      // Blob error bodies hide the JSON message — surface something useful anyway.
      toast({ variant: "destructive", title: "Download failed", description: error.response?.status === 422 ? 'Complete the invoice settings (seller details) first' : (error.message || 'Could not generate the invoice PDF') });
    } finally {
      setInvoiceBusy(null);
    }
  };

  const handleSendInvoice = async (channel: 'email' | 'whatsapp' | 'sms') => {
    setInvoiceBusy(channel);
    try {
      const r = await invoicesAPI.send(order.orderId || id!, { channels: [channel] });
      const result = r?.results?.[channel] ?? r?.data?.results?.[channel];
      if (result && result.ok === false) {
        toast({ variant: "destructive", title: `Invoice ${channel} failed`, description: result.reason || 'Send failed' });
      } else {
        toast({ title: "Invoice sent", description: `Invoice sent via ${channel}` });
      }
    } catch (error: any) {
      const missing = error.response?.data?.missing;
      toast({
        variant: "destructive",
        title: `Invoice ${channel} failed`,
        description: Array.isArray(missing) && missing.length
          ? `Complete invoice settings first — missing: ${missing.join(', ')}`
          : (error.response?.data?.message || 'Send failed'),
      });
    } finally {
      setInvoiceBusy(null);
    }
  };

  const handleSendUpdateEmail = async () => {
    if (!updateEmailSubject.trim() || !updateEmailContent.trim()) {
      toast({ variant: "destructive", title: "Incomplete", description: 'Please enter both subject and content' });
      return;
    }
    await handleSendEmail('update', updateEmailSubject, updateEmailContent);
  };

  const handleCreateShipment = async (modalData?: any) => {
    if (!selectedWarehouseId) {
      toast({ variant: "destructive", title: "Error", description: 'Please select a warehouse' }); return;
    }

    // Native confirm() popups that return SILENTLY on cancel — no toast, no
    // network request, nothing visible — are exactly why "click Create
    // Shipment, nothing happens" was reported: the modal's own "Create
    // Shipment" button IS already an explicit confirmation, so stacking a
    // redundant native confirm() after it just adds a step that's easy to
    // miss/dismiss with zero feedback either way. The two warnings below
    // convey real information the user should consciously acknowledge, so
    // they stay — but cancelling them now always shows a toast, so the flow
    // never just goes quiet.
    if (selectedShippingProvider !== 'manual') {
      const selectedWarehouse = warehouses.find(w => w._id === selectedWarehouseId);
      if (selectedWarehouse) {
        let hasProviderEnabled = false;
        if (selectedShippingProvider === 'shiprocket') hasProviderEnabled = selectedWarehouse.shippingProviders?.shiprocket?.enabled || false;
        else if (selectedShippingProvider === 'delhivery') hasProviderEnabled = selectedWarehouse.shippingProviders?.delhivery?.enabled || false;

        if (!hasProviderEnabled) {
          const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 'DELHIVERY';
          if (!confirm(`Warning: ${providerName} is not enabled for the selected warehouse "${selectedWarehouse.name}".\n\nProceed anyway?`)) {
            toast({ title: "Cancelled", description: `Shipment not created — ${providerName} isn't enabled for this warehouse.` });
            return;
          }
        }
      }
    }

    if (order?.shippingProvider) {
      if (!confirm(`Warning: This order was previously shipped via ${order.shippingProvider.toUpperCase()}. Are you sure you want to reship it and create a NEW shipment record?`)) {
        toast({ title: "Cancelled", description: 'Reship cancelled — no new shipment was created.' });
        return;
      }
    }

    if (selectedShippingProvider === 'manual') {
      if (!manualTrackingId || !manualCarrierName || !manualTrackingUrl) {
        toast({ variant: "destructive", title: "Error", description: 'Please enter all manual tracking details' }); return;
      }
    }

    setSendingToShiprocket(true);
    try {
      let orderItemSkus: string[] = [];
      if (modalData?.selectedItemIndices && modalData.selectedItemIndices.length > 0) {
        orderItemSkus = modalData.selectedItemIndices.map((idx: number) => order.items[idx]?.sku).filter(Boolean);
      } else if (order?.items && order.items.length > 0) {
        orderItemSkus = order.items.map((item: any) => item.sku).filter(Boolean);
      }

      // Map warehouseId to name or code for readable backend processing
      // Send the warehouse's real id. This used to send `code` ("human-readable
      // ids"), which the backend looks up with `WHERE id = $1` — a uuid column —
      // so it failed with `invalid input syntax for type uuid: "HWH001"`.
      const selectedW = warehouses.find(w => w._id === selectedWarehouseId);
      const warehouseIdToSend = selectedW?._id || selectedWarehouseId;

      const shipmentData: any = {
        orderIds: [order.orderId || id!], // order_id is resolvable by the backend
        warehouseId: warehouseIdToSend,
        shippingProvider: selectedShippingProvider,
        weight: modalData?.weight || 0.5,
        length: modalData?.length || 10,
        breadth: modalData?.breadth || 10,
        height: modalData?.height || 5,
        orderItemIndices: orderItemSkus.length > 0 ? orderItemSkus : undefined, // We repurposed orderItemIndices to carry SKUs dynamically for readable logging
        // PART-QUANTITY selections win over the plain SKU list when present.
        itemSelections: modalData?.itemSelections?.length ? modalData.itemSelections : undefined,
      };

      if (selectedShippingProvider === 'manual') {
        shipmentData.manualTrackingId = manualTrackingId;
        shipmentData.manualCarrierName = manualCarrierName;
        shipmentData.manualTrackingUrl = manualTrackingUrl;
      } else {
        if (selectedShippingProvider === 'shiprocket' && modalData?.selectedCourierId) shipmentData.courierCompanyId = modalData.selectedCourierId;
        if (selectedShippingProvider === 'delhivery' && modalData?.selectedDelhiveryType) shipmentData.delhiveryServiceType = modalData.selectedDelhiveryType;
      }
      
      const response = await shipmentsAPI.create(shipmentData);

      // The shared axios interceptor (services/api.ts normalizeResponse) already
      // unwraps a successful `{success, data}` envelope down to just the inner
      // `data` object BEFORE it reaches here — `success` is gone by design, and
      // a real failure (4xx/5xx, including the route's own 422 "no shipments
      // created") would have already thrown and landed in the catch block below.
      // Checking `response.success` here could never be true, so this threw its
      // own "Failed to create shipment" on EVERY successful booking — the
      // backend had already created a real shipment while the admin reported
      // failure. `Shipments.tsx`'s own create handler already guards against
      // this shape (`response?.data || response`); this one never did.
      const shipmentObj = response?.data || response;
      const awb = shipmentObj?.awbCode || shipmentObj?.waybill || shipmentObj?.shipment?.awb;
      toast({
        title: "Shipment Created",
        description: awb ? `AWB ${awb} assigned via ${shipmentObj?.courierName || shipmentObj?.provider || 'the carrier'}.` : 'Shipment created successfully.',
      });

      setShowShipmentModal(false);
      setSelectedWarehouseId('');
      setManualTrackingId('');
      setManualCarrierName('');
      setManualTrackingUrl('');
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Shipment Failed", description: error.response?.data?.message || 'Failed to create shipment.' });
    } finally {
      setSendingToShiprocket(false);
    }
  };

  const handleSubmitPickup = async () => {
    if (!pickupDate) {
      toast({ variant: "destructive", title: "Missing Date", description: 'Please select a pickup date' });
      return;
    }
    setSchedulingPickup(true);
    try {
      const shipmentId = typeof order.shipmentId === 'object' ? order.shipmentId._id : order.shipmentId;
      await shipmentsAPI.schedulePickup(shipmentId, {
        scheduledDate: pickupDate,
        pickupTimeSlot: pickupTimeSlot || undefined,
        notes: pickupNotes || undefined,
      });
      toast({ title: "Scheduled", description: 'Pickup scheduled successfully! AWB generated.' });
      setShowPickupModal(false);
      setPickupDate('');
      setPickupTimeSlot('');
      setPickupNotes('');
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to schedule pickup' });
    } finally {
      setSchedulingPickup(false);
    }
  };

  const handleDownloadLabel = async () => {
    const shipmentId = typeof order.shipmentId === 'object' ? order.shipmentId._id : order.shipmentId;
    if (!shipmentId) return;
    try {
      await shipmentsAPI.downloadLabel(shipmentId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to download label' });
    }
  };

  const handleDownloadManifest = async () => {
    const shipmentId = typeof order.shipmentId === 'object' ? order.shipmentId._id : order.shipmentId;
    if (!shipmentId) return;
    try {
      await shipmentsAPI.downloadManifest(shipmentId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to download manifest' });
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) return null;

  // The API aliases snake_case to camelCase mechanically, so `shiprocket_awb`
  // arrives as `shiprocketAwb` — `shiprocketAWB` was never populated and the AWB
  // silently never rendered. Accept every spelling.
  const shiprocketAwb = order.shiprocketAwb ?? order.shiprocket_awb ?? order.shiprocketAWB ?? null;

  // Only the moves the API will actually accept. The flat list this replaced
  // offered every status from every state, so most picks came back 409 ("Cannot
  // move an order from X to Y") with no hint of what WAS allowed. Mirrors
  // ALLOWED_TRANSITIONS in backend/src/routes/orders.ts — keep the two in step.
  const statusOptions = [order.orderStatus, ...(ALLOWED_TRANSITIONS[order.orderStatus] ?? [])]
    .filter((s, i, a) => s && a.indexOf(s) === i);
  // Same gate as "Edit items" — charges can only be waived while the order is
  // still unpaid, unshipped, and in an editable status.
  /**
   * Registered business name the invoice is raised to — written onto the
   * order's billing address at checkout when the buyer asks for a GST invoice.
   * Read from the order's OWN snapshot, never from the customer's global
   * address book (that book spans every store on the platform).
   */
  const customerCompany: string | null =
    (order?.billingAddress ?? order?.billing_address)?.company
    ?? (order?.billingAddress ?? order?.billing_address)?.company_name
    ?? null;

  const isOrderEditable = order.paymentStatus !== 'completed'
    && ['pending', 'confirmed', 'on_hold', 'processing'].includes(order.orderStatus)
    && !(order.shipments?.length);
  // Any shipment not already in a final state (delivered/cancelled/returned/
  // RTO-settled) — the "Mark Delivered"/"Mark RTO" buttons only make sense
  // when there's something left to act on.
  const TERMINAL_SHIPMENT = new Set(['delivered', 'cancelled', 'returned', 'rto_delivered', 'rto_failed']);
  const actionableShipments = (order.shipments || []).filter((s: any) => !TERMINAL_SHIPMENT.has(s.status));

  const poRef = String(order.notes ?? '').match(/PO Ref:\s*([^\n]+)/i)?.[1]?.trim();
  const viaBulkPortal = /Source:\s*Bulk Order Platform/i.test(String(order.notes ?? ''));

  return (
    /* Full-bleed: cancels Layout's own page padding (p-4/md:p-6/lg:p-8) so the
       command bar spans the whole width and the items table gets the room its
       columns need. The wrapper is exactly the parent's padding-box width, so
       nothing overflows horizontally. */
    <div className="-m-4 min-h-full bg-slate-100/70 md:-m-6 lg:-m-8">
      {/* ONE command row (owner call): identity, state, every write, and the
          Prev/Next walk, on a single dark band. The figures that used to sit on
          a second row (total, lines/units, payment, placed) are all in the items
          table's own totals and order-details footer, so repeating them here
          only cost a row. No backdrop-blur -- it softened the text of everything
          scrolling under it. */}
      {/* The app header is 56px of tabs PLUS a 30px breadcrumb row from md up —
          park below the whole thing, not behind its lower half. Light surface
          (owner call): white ground, a bottom border to separate it from the
          page instead of the dark band this used to be. */}
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white shadow-sm md:top-[86px]">
        {/* nowrap + its own scroller: the owner wants ONE line, so a narrow
            window scrolls the bar sideways rather than stacking it. */}
        <div className="flex flex-nowrap items-center gap-x-1.5 overflow-x-auto px-4 py-1.5 md:px-6">
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={() => navigate('/orders')}>
            <FaArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Orders
          </Button>
          <h1 className="shrink-0 text-base font-bold tracking-tight text-slate-900">#{order.orderId}</h1>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
            <StatusBadge status={order.orderStatus} type="order" className="font-semibold uppercase tracking-wide" />
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Payment</span>
            <StatusBadge status={order.paymentStatus} type="payment" className="font-semibold uppercase tracking-wide" />
          </span>
          {(order.orderType ?? order.order_type) === 'b2b' ? (
            <Badge className="border-purple-200 bg-purple-100 font-semibold uppercase text-purple-800 hover:bg-purple-100">
              B2B{(order.b2bTier ?? order.b2b_tier) ? ` · ${order.b2bTier ?? order.b2b_tier}` : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-300 bg-slate-50 font-medium uppercase text-slate-600">Retail</Badge>
          )}
          {/* Placed via the storefront's Bulk Order Platform + the buyer's own
              PO reference — both live in the order notes (portal checkout
              hand-off convention), surfaced here so staff never dig for them. */}
          {viaBulkPortal && (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 font-medium text-amber-800">
              Bulk Order Platform
            </Badge>
          )}
          {poRef && (
            <Badge variant="outline" className="border-blue-300 bg-blue-50 font-medium text-blue-700"
              title="Buyer's purchase-order reference">
              PO: {poRef}
            </Badge>
          )}
          {(order.isFlagged ?? order.is_flagged) && (
            <Badge variant="outline" className="border-red-300 bg-red-50 font-medium text-red-700">Flagged</Badge>
          )}
          {/* Market + presentment (mig 172) and the export tax treatment (the
              order's own GST snapshot, never re-derived from the address). */}
          {(() => {
            const mkt = String(order.marketCode ?? order.market_code ?? '').toLowerCase();
            const cur = String(order.currency ?? '').toUpperCase();
            const pm = order.presentmentTotalMinor ?? order.presentment_total_minor;
            const gw = String(order.paymentGateway ?? order.payment_gateway ?? '').toLowerCase();
            const isExport = String(order.gst?.taxType ?? '').toUpperCase() === 'EXPORT';
            return (
              <>
                {mkt && mkt !== 'in' && (
                  <Badge variant="outline" className="border-sky-300 bg-sky-50 font-medium uppercase text-sky-700"
                    title={`Placed on the ${mkt} market${cur && cur !== 'INR' && pm != null ? ` · paid ${fmtCurrencyMinor(pm, cur)} (booked ${fmtRupees(order.total)})` : ''}`}>
                    {mkt}{cur && cur !== 'INR' && pm != null ? ` · ${fmtCurrencyMinor(pm, cur)}` : ''}
                  </Badge>
                )}
                {isExport && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 font-medium text-emerald-800"
                    title={`Zero-rated export${order.gst?.lutNumber ? ` under LUT ${order.gst.lutNumber}` : ''}${order.gst?.destinationCountry ? ` to ${order.gst.destinationCountry}` : ''}`}>
                    Export{order.gst?.supplyType === 'EXPWP' ? ' · IGST paid' : ' · LUT'}{order.gst?.destinationCountry ? ` · ${order.gst.destinationCountry}` : ''}
                  </Badge>
                )}
                {gw && !['razorpay', 'upi', 'manual', 'wallet', 'cod'].includes(gw) && (
                  <Badge variant="outline" className="border-indigo-300 bg-indigo-50 font-medium capitalize text-indigo-700">{gw}</Badge>
                )}
              </>
            );
          })()}
          {/* Return window and money already returned — neither appears in the
              items table, so both stay on the bar. */}
          {(order.returnDeadline ?? order.return_deadline) && (
            <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
              Return window {new Date(order.returnDeadline ?? order.return_deadline) > new Date() ? 'closes' : 'closed'}{' '}
              <span className="font-medium tabular-nums text-slate-800">
                {formatDate(order.returnDeadline ?? order.return_deadline, 'dd MMM yyyy', '')}
              </span>
            </span>
          )}
          {Number(order.refundedAmount ?? order.refunded_amount ?? 0) > 0 && (
            <Badge variant="outline" className="border-orange-300 bg-orange-50 font-semibold tabular-nums text-orange-700">
              Refunded {fmtRupees(order.refundedAmount ?? order.refunded_amount)}
            </Badge>
          )}
          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

          <div className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <Input
              type="text"
              placeholder="Status note..."
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="h-7 w-28 border-none bg-transparent text-xs text-slate-900 shadow-none placeholder:text-slate-400"
            />
            <Select value={order.orderStatus} onValueChange={handleStatusUpdate} disabled={updating || !hasPerm('orders.manage')}>
              <SelectTrigger className="h-7 w-[112px] border-none bg-transparent text-xs font-medium capitalize text-slate-900 shadow-none">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {STATUS_LABEL[status] ?? status}
                  </SelectItem>
                ))}
                {statusOptions.length === 1 && (
                  <div className="px-2 py-1.5 text-xs text-slate-500">
                    No further changes — this order is closed.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="isolate flex flex-nowrap items-center gap-1.5">
            {/* One menu for every customer message on every channel. WhatsApp/SMS
                go through notifyCustomer (store credentials + real errors);
                email keeps the existing templated sender. A COD order that can
                still be paid online carries its pay-link in the message. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                  disabled={sendingNotify !== null || sendingEmail !== null}>
                  <FaEnvelope className="mr-1.5 h-3.5 w-3.5" />
                  {sendingNotify || sendingEmail ? 'Sending…' : 'Send'}
                  <FaChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {([
                  { event: 'order_confirmation', label: 'Order confirmation' },
                  ...(order.paymentMethod === 'cod'
                    ? [{ event: 'cod_confirm', label: 'COD confirmation + pay link' }] : []),
                  ...(payLink ? [{ event: 'payment_link', label: 'Payment link' }] : []),
                  { event: 'order_status', label: 'Status update' },
                  ...(order.orderStatus === 'shipped' || order.shipments?.length
                    ? [{ event: 'order_shipped', label: 'Shipped + tracking' }] : []),
                  ...(order.orderStatus === 'delivered'
                    ? [{ event: 'order_delivered', label: 'Delivered' }] : []),
                ] as Array<{ event: string; label: string }>).map((m) => (
                  <DropdownMenuSub key={m.event}>
                    <DropdownMenuSubTrigger>{m.label}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem disabled={!order.shippingAddress?.mobileNumber}
                        onClick={() => handleNotify(m.event, 'whatsapp', m.label)}>
                        <FaWhatsapp className="mr-2 h-3.5 w-3.5 text-green-600" /> WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!order.shippingAddress?.mobileNumber}
                        onClick={() => handleNotify(m.event, 'sms', m.label)}>
                        <FaSms className="mr-1.5 h-3.5 w-3.5" /> SMS
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!order.shippingAddress?.email}
                        onClick={() => (m.event === 'order_confirmation'
                          ? handleSendEmail('confirmation')
                          : handleNotify(m.event, 'email', m.label))}>
                        <FaEnvelope className="mr-1.5 h-3.5 w-3.5" /> Email
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
                <DropdownMenuItem disabled={!order.shippingAddress?.email}
                  onClick={() => setShowUpdateEmailModal(true)}>
                  <FaEnvelope className="mr-1.5 h-3.5 w-3.5" /> Custom email…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Invoice: download the PDF or send it on a specific channel. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                  disabled={invoiceBusy !== null}>
                  <FaFileInvoice className="mr-1.5 h-3.5 w-3.5" />
                  {invoiceBusy ? `Invoice (${invoiceBusy})…` : 'Invoice'}
                  <FaChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadInvoice}>
                  <FaDownload className="mr-1.5 h-3.5 w-3.5" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('email')} disabled={!order.shippingAddress?.email}>
                  <FaEnvelope className="mr-1.5 h-3.5 w-3.5" /> Send via Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('whatsapp')}>
                  <FaWhatsapp className="mr-1.5 h-3.5 w-3.5" /> Send via WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('sms')}>
                  <FaSms className="mr-1.5 h-3.5 w-3.5" /> Send via SMS
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasPerm('orders.manage') && order.orderStatus === 'pending' && order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed' && (
              <Button variant="secondary" size="sm" className="h-7 shrink-0 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                onClick={() => setShowPaymentVerifyModal(true)}>
                <FaCreditCard className="mr-1.5 h-3.5 w-3.5" /> Verify
              </Button>
            )}

            {/* Payment settled OUTSIDE any gateway this system can check
                against (bank transfer, cash, cheque) — no transaction id to
                verify, staff assertion IS the record. Prepaid only: COD's
                equivalent is "Record Payment" below (COD's own money-in-hand
                flow — offering both here would just be confusing). Not
                limited to order_status='pending' like "Verify Payment" above,
                since an order can end up confirmed/on_hold while still
                genuinely unpaid. */}
            {hasPerm('orders.manage') && order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed'
              && !['cancelled', 'returned'].includes(order.orderStatus) && (
              <Button variant="secondary" size="sm" className="h-7 shrink-0 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                onClick={() => setShowMarkAsPaidModal(true)}>
                <FaMoneyCheckAlt className="mr-1.5 h-3.5 w-3.5" /> Mark paid
              </Button>
            )}

            {/* COD settled directly with the customer (UPI/bank transfer/cash) before
                delivery — full or partial. Available any time it isn't already fully
                paid or in a terminal state, not just while order_status is pending. */}
            {hasPerm('orders.manage') && order.paymentMethod === 'cod' && order.paymentStatus !== 'completed'
              && !['cancelled', 'returned'].includes(order.orderStatus) && (
              <Button variant="secondary" size="sm" className="h-7 shrink-0 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                onClick={() => setShowRecordCodPayment(true)}>
                <FaCreditCard className="mr-1.5 h-3.5 w-3.5" /> Record payment
              </Button>
            )}

            {hasPerm('orders.manage') && order.orderStatus === 'pending' && (
              <Button variant="default" size="sm" className="h-7 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={handleConfirmOrder} disabled={confirmingOrder || (order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed')}>
                <FaCheckCircle className="mr-1.5 h-3.5 w-3.5" /> {confirmingOrder ? 'Confirming…' : 'Confirm'}
              </Button>
            )}

            {/* Hold / release — parks an order (stock query, address doubt) without cancelling. */}
            {hasPerm('orders.manage') && ['pending', 'confirmed', 'processing'].includes(order.orderStatus) && (
              <Button variant="secondary" size="sm" className="h-7 shrink-0 border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                onClick={() => handleStatusUpdate('on_hold')} disabled={updating}>
                Hold
              </Button>
            )}
            {hasPerm('orders.manage') && order.orderStatus === 'on_hold' && (
              <Button variant="secondary" size="sm" className="h-7 shrink-0 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                onClick={() => handleStatusUpdate('confirmed')} disabled={updating}>
                Release Hold
              </Button>
            )}

            {canAccess('shipping') && hasPerm('shipments.manage') && ['confirmed', 'processing', 'shipped'].includes(order.orderStatus) && (
              <Button variant="default" size="sm" className="h-7 shrink-0 bg-blue-600 text-white hover:bg-blue-500"
                onClick={() => setShowShipmentModal(true)} disabled={sendingToShiprocket}>
                <FaTruck className="mr-1.5 h-3.5 w-3.5" /> {sendingToShiprocket ? 'Creating…' : order.shippingProvider ? 'Reship' : 'Ship'}
              </Button>
            )}

            {hasPerm('orders.manage') && isOrderEditable && (
              <Button variant="outline" size="sm" className="h-7 shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                onClick={() => setShowApplyDiscount(true)}>
                <FaTag className="mr-1.5 h-3.5 w-3.5" /> Add discount
              </Button>
            )}

            {hasPerm('orders.manage')
              && ['cancelled', 'returned', 'partially_refunded'].includes(order.orderStatus)
              && Number(order.refundedAmount ?? order.refunded_amount ?? 0) < Number(order.total ?? 0) && (
              <Button variant="outline" size="sm" className="h-7 shrink-0 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                onClick={() => setShowRaiseRefund(true)}>
                <FaMoneyCheckAlt className="mr-1.5 h-3.5 w-3.5" /> Refund
              </Button>
            )}

            {hasPerm('orders.manage') && order.orderStatus === 'delivered' && (
              <Button variant="default" size="sm" className="h-7 shrink-0 bg-indigo-500 text-white hover:bg-indigo-400"
                onClick={handleMarkCompleted} disabled={updating}>
                <FaCheckCircle className="mr-1.5 h-3.5 w-3.5" /> {updating ? 'Updating…' : 'Complete'}
              </Button>
            )}

            {/* Manual override — automatic Shiprocket/Delhivery sync and
                webhooks don't always catch every delivery/failed-delivery,
                and manual-carrier shipments never get one at all. Acts at
                the SHIPMENT grain so a multi-shipment order rolls up
                correctly instead of being wrongly marked fully delivered
                the instant one parcel arrives. */}
            {canAccess('shipping') && hasPerm('shipments.manage') && actionableShipments.length > 0 && (
              <>
                <Button variant="outline" size="sm" className="h-7 shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => setDeliveryModalMode('delivered')}>
                  <FaCheckCircle className="mr-1.5 h-3.5 w-3.5" /> Delivered
                </Button>
                <Button variant="outline" size="sm" className="h-7 shrink-0 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                  onClick={() => setDeliveryModalMode('rto')}>
                  <FaTruck className="mr-1.5 h-3.5 w-3.5" /> RTO
                </Button>
              </>
            )}

            {/* Carrier + gateway actions — previously buried inside the sidebar's
                Order Information / Payment cards. */}
            {canAccess('shipping') && hasPerm('shipments.manage') && !shiprocketAwb
              && (order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
              <Button variant="outline" size="sm" className="h-7 shrink-0 border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900" onClick={handleAssignAwb} disabled={assigningAwb}>
                {assigningAwb ? 'Assigning…' : 'Assign AWB'}
              </Button>
            )}
            {canAccess('shipping') && hasPerm('shipments.manage')
              && !order.shipmentId && !(order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
              <Button variant="outline" size="sm" className="h-7 shrink-0 border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900" onClick={handleAttachAwb} disabled={attachingAwb}>
                {attachingAwb ? 'Attaching…' : 'AWB'}
              </Button>
            )}
            {hasPerm('orders.manage') && order.razorpayPaymentId && (
              <Button variant="outline" size="sm" className="ml-1 h-7 shrink-0 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                onClick={handleAuditRazorpayPayment} disabled={auditingRazorpay}>
                <FaCreditCard className="mr-1.5 h-3.5 w-3.5" />
                {auditingRazorpay ? 'Checking…' : 'Verify'}
              </Button>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {/* Walks the same sequence the Orders list last rendered — same
                filters, same search — and across its page boundaries. */}
            <OrderNavigator currentId={order._id || order.id} currentOrderNumber={order.orderId} />
          </div>
        </div>

      </div>

      <div className="space-y-4 p-4 md:p-6">
      {/* 80 / 20 for the whole page (owner call): the status timeline and the
          items table lead the wide column, the rail runs beside them from the
          very top. `4fr / 1fr` rather than a fixed rail width so the split stays
          80/20 at every size instead of drifting with the viewport. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <OrderProgressStepper
            orderStatus={order.orderStatus}
            paymentStatus={order.paymentStatus}
            paymentMethod={order.paymentMethod}
            statusHistory={order.statusHistory}
            createdAt={order.createdAt ?? order.created_at}
            deliveredAt={order.deliveredAt ?? order.delivered_at}
          />

          {/* The whole money story of the order — line columns, a total for every
              one of them, and the order calculation itself as footer steps. */}
          <OrderItems
              items={order.items || []}
              b2bTier={order.b2bTier ?? order.b2b_tier}
              orderDiscount={Number(order.discount) || 0}
              subtotal={Number(order.subtotal) || 0}
              shipping={Number(order.shippingCost ?? order.shipping_cost ?? order.shipping ?? 0)}
              total={Number(order.total) || 0}
              gst={order.gst}
              amountReceived={order.amountReceived}
              couponCode={order.couponCode ?? order.coupon_code}
              discountReason={order.discountReason ?? order.discount_reason}
              discountItems={order.discountItems ?? order.discount_items}
              orderNotes={order.notes}
              paymentMethod={order.paymentMethod}
              paymentGateway={order.paymentGateway}
              placedAt={order.createdAt ?? order.created_at}
              orderType={order.orderType ?? order.order_type}
              customerGstin={order.customerGstin ?? order.customer_gstin}
              salesperson={order.salesperson}
              importedFrom={order.importedFrom ?? order.imported_from}
              onRemoveShipping={isOrderEditable ? () => handleRemoveCharge('shipping') : undefined}
              onRemoveCod={isOrderEditable ? () => handleRemoveCharge('cod') : undefined}
              removingCharge={removingCharge}
              /* Items are editable only while unpaid and unshipped. */
              headerAction={isOrderEditable ? (
                <Button size="sm" variant="outline" className="h-7 text-xs font-semibold"
                  onClick={() => setShowEditItems(true)}>
                  Edit items
                </Button>
              ) : undefined}
          />

          {/* Ship-to and bill-to read together, with ships-from / invoiced-by /
              fulfilment as one footer strip — the three facts an invoice or a
              packing query needs, side by side. */}
          <OrderAddressPanel
            shippingAddress={order.shippingAddress || order.shipping_address}
            billingAddress={order.billingAddress || order.billing_address}
            warehouseId={order.warehouseId}
            gst={order.gst}
            customerGstin={order.customerGstin ?? order.customer_gstin}
            customerCompany={customerCompany}
            onWhatsAppClick={handleWhatsAppClick}
            fulfillmentSlot={
              <OrderFulfillmentCard
                variant="inline"
                fulfillment={order.fulfillment}
                shipments={order.shipments}
                sla={order.sla}
              />
            }
            shippingAction={
              <OrderAddressEditor
                orderId={order._id || order.id}
                orderStatus={order.orderStatus || order.order_status}
                kind="shipping"
                address={order.shippingAddress || order.shipping_address}
                onSaved={(next: any) => setOrder((o: any) => ({ ...o, shippingAddress: next, shipping_address: next }))}
              />
            }
            billingAction={
              <OrderAddressEditor
                orderId={order._id || order.id}
                orderStatus={order.orderStatus || order.order_status}
                kind="billing"
                address={order.billingAddress || order.billing_address || order.shippingAddress || order.shipping_address}
                onSaved={(next: any) => setOrder((o: any) => ({ ...o, billingAddress: next, billing_address: next }))}
              />
            }
          />

          {/* Who invoices it · how it is numbered · how it ships — the three
              document facts, read together in one row (owner spec). */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-slate-50/80 px-4 py-2.5">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  Invoiced by
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 text-sm">
                {order.gst?.storeId || order.gst?.storeName ? (
                  <>
                    <p className="text-base font-medium leading-tight text-slate-900">
                      {order.gst.storeName || 'N/A'}
                    </p>
                    {order.gst.storeGstin && (
                      <TrackRow k="GSTIN" v={<span className="font-mono font-medium text-slate-900">{order.gst.storeGstin}</span>} />
                    )}
                    {(order.gst.storeState || order.gst.orderState) && (
                      <TrackRow k="Place of supply" v={
                        <span className="font-medium text-slate-900">
                          {order.gst.storeState ?? '?'} → {order.gst.orderState ?? '?'}
                        </span>
                      } />
                    )}
                    {order.gst.taxType && (
                      <TrackRow k="Tax" v={<span className="font-medium text-slate-900">{order.gst.taxType}</span>} />
                    )}
                  </>
                ) : (
                  <p className="font-medium text-slate-500">
                    No GST snapshot on this order — it was placed before GST was configured.
                  </p>
                )}
                {(order.warehouseId as any)?.name && (
                  <TrackRow k="Ships from" v={<span className="font-medium text-slate-900">{(order.warehouseId as any).name}</span>} />
                )}
              </CardContent>
            </Card>

          <OrderBillingCard
            orderId={id!}
            invoiceNumber={order.invoiceNumber ?? order.invoice_number}
            invoiceDate={order.invoiceDate ?? order.invoice_date}
            invoiceNumberSource={order.invoiceNumberSource ?? order.invoice_number_source}
            manualInvoiceUrl={order.manualInvoiceUrl ?? order.manual_invoice_url}
            manualInvoiceFilename={order.manualInvoiceFilename ?? order.manual_invoice_filename}
            manualInvoiceUploadedBy={order.manualInvoiceUploadedBy ?? order.manual_invoice_uploaded_by}
            gstin={order.gst?.storeGstin}
            taxType={order.gst?.taxType}
            customerGstin={order.customerGstin ?? order.customer_gstin}
            customerCompany={customerCompany}
            canManage={hasPerm('orders.manage')}
            onSaved={fetchOrder}
          />

          <Card className="shadow-sm">
            <CardHeader className="border-b bg-slate-50/80 px-4 py-2.5">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Shipping &amp; tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {order.paymentMethod === 'cod' && (
                <TrackRow k="COD check" v={
                  <Badge className={(order.isOtpVerified ?? order.is_otp_verified)
                    ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                    : 'border-amber-200 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20'}>
                    {(order.isOtpVerified ?? order.is_otp_verified) ? 'OTP verified' : 'Not verified'}
                  </Badge>
                } />
              )}
              {order.shippingProvider && (
                <TrackRow k="Carrier" v={
                  <span className="capitalize">
                    {order.shippingProvider}{order.courierName ? ` · ${order.courierName}` : ''}
                  </span>
                } />
              )}
              {shiprocketAwb && (
                <TrackRow k="AWB" v={<span className="font-mono text-slate-800">{shiprocketAwb}</span>} />
              )}
              {order.delhiveryWaybill && (
                <TrackRow k="Waybill" v={<span className="font-mono text-slate-800">{order.delhiveryWaybill}</span>} />
              )}
              {order.expectedDelivery && (
                <TrackRow k="Est. delivery" v={formatDate(order.expectedDelivery, 'dd MMM yyyy', 'N/A')} />
              )}
              {order.warehouseId && (
                <TrackRow k="Warehouse" v={(order.warehouseId as any)?.name || 'N/A'} />
              )}
              {order.trackingUrl && (
                <TrackRow k="Tracking" v={
                  <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                    className="font-semibold text-blue-700 hover:underline">Track shipment</a>
                } />
              )}

              {/* Booked at the carrier but never dispatched — without this the
                  order looks shipped in Shiprocket while no AWB exists, and the
                  only visible action (Create Shipment) would duplicate it. */}
              {!shiprocketAwb && (order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-xs font-semibold text-amber-800">Order created, not dispatched</p>
                  <p className="text-xs text-amber-700">
                    Shiprocket order #{order.shiprocketOrderId ?? order.shiprocket_order_id} exists but has no AWB —
                    usually the Shiprocket wallet is below its ₹100 minimum. Top up, then assign the AWB here;
                    don&apos;t create the shipment again or a duplicate is booked.
                  </p>
                  <Button size="sm" variant="outline" className="h-8" onClick={handleAssignAwb} disabled={assigningAwb}>
                    {assigningAwb ? 'Assigning…' : 'Assign AWB'}
                  </Button>
                </div>
              )}

              {/* Dispatch-time documents only — once the order is delivered,
                  cancelled or returned there is nothing left to print one for. */}
              {order.shipmentId && (order.shippingProvider === 'shiprocket' || order.shippingProvider === 'delhivery') && (
                <div className="flex flex-wrap gap-2 border-t pt-2.5">
                  {order.orderStatus === 'shipped' && order.shippingProvider === 'shiprocket' && !order.shiprocketPickupScheduledDate && (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setShowPickupModal(true)}>
                      Schedule pickup
                    </Button>
                  )}
                  {(shiprocketAwb || order.delhiveryWaybill) && !ORDER_TERMINAL_STATUSES.includes(order.orderStatus) && (
                    <Button variant="outline" size="sm" className="h-8" onClick={handleDownloadLabel}>Label</Button>
                  )}
                  {((order.shippingProvider === 'shiprocket' && shiprocketAwb) || (order.shippingProvider === 'delhivery' && order.delhiveryWaybill)) && !ORDER_TERMINAL_STATUSES.includes(order.orderStatus) && (
                    <Button variant="outline" size="sm" className="h-8" onClick={handleDownloadManifest}>Manifest</Button>
                  )}
                </div>
              )}

              {/* Nothing booked here at all — the case where a carrier dashboard
                  was used directly, so this app never learned an AWB exists. */}
              {!order.shipmentId && !(order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
                <div className="border-t pt-2.5">
                  <p className="mb-2 text-xs text-slate-500">
                    Shipped straight from the carrier&apos;s own dashboard? Paste the AWB to link it here.
                  </p>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleAttachAwb} disabled={attachingAwb}>
                    {attachingAwb ? 'Attaching…' : 'AWB'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          </div>

          {/* Review-and-pay link — Shopify-style page the customer can open to
              check the order and pay online (works for COD before dispatch too). */}
          {payLink && (
            <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Customer payment / confirmation link</p>
                  <p className="break-all font-mono text-xs text-slate-500">{payLink}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => { navigator.clipboard.writeText(payLink); toast({ title: 'Link copied' }); }}>
                    Copy
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={payLink} target="_blank" rel="noopener noreferrer">Open</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <PaymentInformation
                paymentMethod={order.paymentMethod}
                paymentStatus={order.paymentStatus}
                paymentGateway={order.paymentGateway}
                gatewayRef={order.gatewayRef ?? order.gateway_ref}
                presentmentCurrency={order.currency}
                presentmentTotalMinor={order.presentmentTotalMinor ?? order.presentment_total_minor}
                razorpayOrderId={order.razorpayOrderId}
                razorpayPaymentId={order.razorpayPaymentId}
                razorpaySignature={order.razorpaySignature}
                upiPaymentId={order.upiPaymentId}
                upiPaymentLink={order.upiPaymentLink}
                upiVerificationStatus={order.upiVerifyStatus ?? order.upi_verify_status ?? order.upiVerificationStatus}
                upiPaymentScreenshot={order.upiScreenshot ?? order.upi_screenshot ?? order.upiPaymentScreenshot}
                upiVerificationNotes={order.upiVerifyNotes ?? order.upi_verify_notes ?? order.upiVerificationNotes}
                manualPaymentMethod={order.manualPaymentMethod ?? order.manual_payment_method}
                manualPaymentReference={order.manualPaymentReference ?? order.manual_payment_reference}
                manualPaymentNotes={order.manualPaymentNotes ?? order.manual_payment_notes}
                manualPaymentMarkedBy={order.manualPaymentMarkedBy ?? order.manual_payment_marked_by}
                manualPaymentMarkedAt={order.manualPaymentMarkedAt ?? order.manual_payment_marked_at}
                legacyNotes={order.notes}
                onAuditRazorpay={hasPerm('orders.manage') ? handleAuditRazorpayPayment : undefined}
                auditingRazorpay={auditingRazorpay}
                razorpayAuditResult={razorpayAuditResult}
              />
            </CardContent>
          </Card>

          {/* Money that went BACK — refund id, rail, gateway reference and when.
              Renders nothing when the order has no refunds. */}
          <OrderRefunds
            refunds={order.refunds}
            gatewayPaymentId={order.razorpayPaymentId ?? order.razorpay_payment_id ?? null}
          />

          {/* Every message this order has sent — staff-triggered and automated,
              with the status the provider actually reported and who sent it. */}
          <OrderCommunicationLog orderId={order._id || order.id} />

          {/* The links staff actually send — one per channel, so which message got
              opened is answerable. Loads on demand: minting them calls the
              shortener, and an order desk opens far more orders than it sends
              links from. */}
          <OrderLinksCard orderId={order.orderId ?? order.id ?? order._id} />

          {/* Marketing journey and sales ownership — independent read-mostly
              panels, so they tile rather than stack. `items-start` (C4): the
              default grid stretch was forcing the shorter card (Journey, often
              just one line when there is no attribution) to match the taller
              one's height, leaving a half-empty card with nothing in the gap. */}
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            <OrderJourneyCard attribution={order.attribution} />
            <OrderTeamCard
              orderId={order.id ?? order._id}
              orderNumber={order.orderId}
              salesAgentId={order.salesAgentId ?? order.sales_agent_id ?? null}
              assignedTo={order.assignedTo ?? order.assigned_to ?? null}
              assignedAt={order.assignedAt ?? order.assigned_at ?? null}
              salesType={order.salesType ?? order.sales_type ?? null}
              createdByUserId={order.userId ?? order.user_id ?? null}
              createdByName_={order.createdByName ?? order.created_by_name ?? null}
              salesAgentName={order.salesAgentName ?? order.sales_agent_name ?? null}
              assignedToName={order.assignedToName ?? order.assigned_to_name ?? null}
              salesperson={order.salesperson ?? null}
              canManage={hasPerm('orders.manage')}
              onChanged={fetchOrder}
            />
          </div>
        </div>

        {/* ── Side rail ── */}
        <div className="space-y-4">
          <OrderCustomerCard
            customerId={order.customerId ?? order.customer_id}
            shippingAddress={order.shippingAddress || order.shipping_address}
            orderTotal={Number(order.total) || 0}
            customerGstin={order.customerGstin ?? order.customer_gstin}
            onWhatsAppClick={handleWhatsAppClick}
          />

          {order.risk && (() => {
            // Authenticity reads HIGHER = BETTER (100 = fully trustworthy).
            const authenticity: number = order.risk.authenticity ?? Math.max(0, 100 - (order.risk.score ?? 0));
            const tone = authenticity >= 80
              ? { label: 'Authentic', text: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' }
              : authenticity >= 50
                ? { label: 'Review advised', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' }
                : { label: 'High risk', text: 'text-red-700', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' };
            const standing = order.risk.standing;
            return (
              <Card className="shadow-sm">
                <CardHeader className="border-b bg-slate-50/80 px-4 py-2.5">
                  <CardTitle className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-slate-700">
                    <span>Order authenticity</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.chip}`}>
                      {tone.label}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-end justify-between">
                    <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{authenticity}</span>
                    <span className="mb-1 text-xs text-slate-400">/ 100</span>
                  </div>
                  <div className="mb-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(2, authenticity)}%` }} />
                  </div>
                  <div className="mb-3 flex justify-between text-[10px] text-slate-400">
                    <span>Risky</span><span>Review</span><span>Authentic</span>
                  </div>

                  {order.risk.flags?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {order.risk.flags.map((f: any, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          <span className="text-slate-700">{f.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-emerald-700">No risk signals detected.</p>
                  )}
                  {standing && standing.totalOrders > 0 && (
                    <p className="mt-3 border-t pt-3 text-xs text-slate-500">
                      Platform history: {standing.totalOrders} order(s) across {standing.storeCount} store(s),
                      {' '}{standing.totalCancelled} cancelled/returned.
                    </p>
                  )}
                  {order.risk.ipGeo && (
                    <p className="mt-2 text-xs text-slate-500">
                      Order IP geolocates to {[order.risk.ipGeo.city, order.risk.ipGeo.region, order.risk.ipGeo.country].filter(Boolean).join(', ') || 'an unknown location'}.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* What HAPPENED, then what was SAID about it (owner order): the
              timeline is the record, the notes are the commentary on it. */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <OrderStatusHistory statusHistory={order.statusHistory} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <OrderNotes
                notes={order.orderNotes || order.order_notes || []}
                onAdd={handleAddNote}
                saving={savingNotes}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {canAccess('shipping') && (
        <ShipmentCreationModal
          isOpen={showShipmentModal}
          onClose={() => setShowShipmentModal(false)}
          onSubmit={handleCreateShipment}
          loading={sendingToShiprocket}
          selectedShippingProvider={selectedShippingProvider}
          onShippingProviderChange={setSelectedShippingProvider}
          selectedWarehouseId={selectedWarehouseId}
          onWarehouseChange={setSelectedWarehouseId}
          warehouses={warehouses}
          shippingProviders={shippingProviders}
          manualTrackingId={manualTrackingId}
          manualCarrierName={manualCarrierName}
          manualTrackingUrl={manualTrackingUrl}
          onManualTrackingIdChange={setManualTrackingId}
          onManualCarrierNameChange={setManualCarrierName}
          onManualTrackingUrlChange={setManualTrackingUrl}
          orderId={id!}
          orderItems={order?.items || []}
          remainingByKey={Array.isArray(order?.fulfillment?.lines)
            ? Object.fromEntries(order.fulfillment.lines.map((l: any) => [String(l.sku || l.name || '').trim(), Number(l.remaining) || 0]))
            : undefined}
        />
      )}

      <PaymentVerificationModal
        isOpen={showPaymentVerifyModal}
        onClose={() => setShowPaymentVerifyModal(false)}
        onSubmit={handleVerifyPayment}
        loading={verifyingPayment}
        paymentGateway={order.paymentGateway}
        razorpayPaymentId={razorpayPaymentId}
        upiPaymentId={upiPaymentId}
        paymentVerificationNotes={paymentVerificationNotes}
        upiPaymentScreenshot={order.upiScreenshot ?? order.upi_screenshot ?? order.upiPaymentScreenshot}
        onRazorpayPaymentIdChange={setRazorpayPaymentId}
        onUpiPaymentIdChange={setUpiPaymentId}
        onPaymentVerificationNotesChange={setPaymentVerificationNotes}
      />

      <RecordCodPaymentModal
        isOpen={showRecordCodPayment}
        onClose={() => setShowRecordCodPayment(false)}
        orderId={id!}
        total={Number(order.total) || 0}
        amountReceived={Number(order.amountReceived) || 0}
        onRecorded={() => { toast({ title: 'Payment recorded', description: 'The order has been updated.' }); fetchOrder(); }}
      />

      <MarkAsPaidModal
        isOpen={showMarkAsPaidModal}
        onClose={() => setShowMarkAsPaidModal(false)}
        orderId={id!}
        total={Number(order.total) || 0}
        onMarked={() => { toast({ title: 'Payment recorded', description: 'Order marked as paid.' }); fetchOrder(); }}
      />

      <ApplyOrderDiscountModal
        isOpen={showApplyDiscount}
        onClose={() => setShowApplyDiscount(false)}
        orderId={order._id || order.id}
        orderNumber={order.orderId}
        currentTotal={Number(order.total) || 0}
        onApplied={(r: any) => {
          toast({ title: 'Discount applied', description: r?.message || 'The order total has been recalculated.' });
          fetchOrder();
        }}
      />

      <RaiseRefundModal
        isOpen={showRaiseRefund}
        onClose={() => setShowRaiseRefund(false)}
        orderId={order._id || order.id}
        orderNumber={order.orderId}
        onRaised={() => { toast({ title: 'Refund raised', description: 'It is queued for approval.' }); fetchOrder(); }}
      />

      <CancelOrderModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orderId={id!}
        orderNumber={order.orderId ?? order.order_id ?? id!}
        paymentMethod={order.paymentMethod}
        onCancelled={(refund: RefundOutcome | null) => {
          fetchOrder();
          // Report what happened to the MONEY, not just to the order — a refund
          // that needs approval or that the gateway refused must not be reported
          // as a clean success.
          if (!refund || !refund.attempted) {
            toast({ title: 'Order cancelled', description: refund?.message || 'The order has been cancelled.' });
          } else if (refund.ok) {
            toast({ title: 'Order cancelled and refunded', description: refund.message });
          } else {
            toast({
              variant: 'destructive',
              title: refund.outcome === 'failed' ? 'Cancelled — refund did not go through' : 'Cancelled — refund not finished',
              description: refund.message,
            });
          }
        }}
      />

      <UpdateEmailModal
        isOpen={showUpdateEmailModal}
        onClose={() => { setShowUpdateEmailModal(false); setUpdateEmailSubject(''); setUpdateEmailContent(''); }}
        onSubmit={handleSendUpdateEmail}
        loading={sendingEmail === 'update'}
        subject={updateEmailSubject}
        content={updateEmailContent}
        onSubjectChange={setUpdateEmailSubject}
        onContentChange={setUpdateEmailContent}
      />

      <DeliveryStatusModal
        isOpen={deliveryModalMode !== null}
        onClose={() => setDeliveryModalMode(null)}
        shipments={order.shipments || []}
        mode={deliveryModalMode ?? 'delivered'}
        onUpdated={() => { toast({ title: 'Shipment updated', description: 'The order has been refreshed.' }); fetchOrder(); }}
      />

      <OrderItemsEditModal
        isOpen={showEditItems}
        onClose={() => setShowEditItems(false)}
        orderId={order.orderId || id!}
        items={order.items || []}
        currentDiscount={Number(order.discount) || 0}
        onSaved={() => { toast({ title: 'Order updated', description: 'Items repriced and totals recomputed' }); fetchOrder(); }}
      />

      <PickupModal
        isOpen={showPickupModal}
        isBulk={false}
        onClose={() => {
          setShowPickupModal(false);
          setPickupDate('');
          setPickupTimeSlot('');
          setPickupNotes('');
        }}
        onSubmit={handleSubmitPickup}
        pickupDate={pickupDate}
        pickupTimeSlot={pickupTimeSlot}
        pickupNotes={pickupNotes}
        onDateChange={setPickupDate}
        onTimeSlotChange={setPickupTimeSlot}
        onNotesChange={setPickupNotes}
        isSubmitting={schedulingPickup}
      />
      </div>
    </div>
  );
};

export default OrderDetail;
