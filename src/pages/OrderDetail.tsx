/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ordersAPI, shippingAPI, paymentsAPI, shipmentsAPI, invoicesAPI } from '../services/api';
import { formatDate } from '../utils/date';
import { FaCheckCircle, FaEnvelope, FaFileInvoice, FaCreditCard, FaTruck, FaArrowLeft, FaDownload, FaWhatsapp, FaSms, FaChevronDown, FaMoneyCheckAlt } from 'react-icons/fa';
import {
  StatusBadge,
  OrderItems,
  OrderSummary,
  OrderStatusHistory,
  ShippingInformation,
  PaymentInformation,
  OrderNotes,
  DiscountBreakdown,
  ShipmentCreationModal,
  PaymentVerificationModal,
  UpdateEmailModal,
  OrderFulfillmentCard,
  OrderJourneyCard,
  OrderItemsEditModal,
  OrderBillingCard,
  OrderAddressEditor,
  RecordCodPaymentModal,
  DeliveryStatusModal,
  MarkAsPaidModal,
  OrderProgressStepper,
} from '../components/order';
import type { RazorpayAuditResult } from '../components/order';
import { PickupModal } from '../components/shipments';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
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

  const handleStatusUpdate = async (newStatus: string) => {
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

    if (selectedShippingProvider !== 'manual') {
      const selectedWarehouse = warehouses.find(w => w._id === selectedWarehouseId);
      if (selectedWarehouse) {
        let hasProviderEnabled = false;
        if (selectedShippingProvider === 'shiprocket') hasProviderEnabled = selectedWarehouse.shippingProviders?.shiprocket?.enabled || false;
        else if (selectedShippingProvider === 'delhivery') hasProviderEnabled = selectedWarehouse.shippingProviders?.delhivery?.enabled || false;

        if (!hasProviderEnabled) {
          const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 'DELHIVERY';
          if (!confirm(`Warning: ${providerName} is not enabled for the selected warehouse "${selectedWarehouse.name}".\n\nProceed anyway?`)) {
            return;
          }
        }
      }
    }

    if (order?.shippingProvider) {
      if (!confirm(`Warning: This order was previously shipped via ${order.shippingProvider.toUpperCase()}. Are you sure you want to reship it and create a NEW shipment record?`)) {
        return;
      }
    }

    if (selectedShippingProvider === 'manual') {
      if (!manualTrackingId || !manualCarrierName || !manualTrackingUrl) {
        toast({ variant: "destructive", title: "Error", description: 'Please enter all manual tracking details' }); return;
      }
    }

    const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 
                        selectedShippingProvider === 'delhivery' ? 'DELHIVERY' : 'Manual';
    
    if (!confirm(`Create shipment with ${providerName}?`)) return;
    
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
      
      if (response.success) {
        toast({ title: "Shipment Created", description: `Shipment #${response.data?.shipmentNumber || response.data?._id} created successfully.` });
      } else {
        throw new Error(response.message || 'Failed to create shipment');
      }
      
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
  const discountBreakdown = order.discountReason ? order.discountReason.split(',').map((d: string) => d.trim()) : [];
  // Same gate as "Edit items" — charges can only be waived while the order is
  // still unpaid, unshipped, and in an editable status.
  const isOrderEditable = order.paymentStatus !== 'completed'
    && ['pending', 'confirmed', 'on_hold', 'processing'].includes(order.orderStatus)
    && !(order.shipments?.length);
  // Any shipment not already in a final state (delivered/cancelled/returned/
  // RTO-settled) — the "Mark Delivered"/"Mark RTO" buttons only make sense
  // when there's something left to act on.
  const TERMINAL_SHIPMENT = new Set(['delivered', 'cancelled', 'returned', 'rto_delivered', 'rto_failed']);
  const actionableShipments = (order.shipments || []).filter((s: any) => !TERMINAL_SHIPMENT.has(s.status));

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-1">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-3 text-muted-foreground" onClick={() => navigate('/orders')}>
            <FaArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Orders
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Order #{order.orderId}</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-md border">
            <Input
              type="text"
              placeholder="Status note..."
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="h-9 w-40 sm:w-48 bg-background border-none shadow-none"
            />
            <Select value={order.orderStatus} onValueChange={handleStatusUpdate} disabled={updating || !hasPerm('orders.manage')}>
              <SelectTrigger className="h-9 w-[130px] border-none bg-background shadow-none font-medium capitalize">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {STATUS_LABEL[status] ?? status}
                  </SelectItem>
                ))}
                {statusOptions.length === 1 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No further changes — this order is closed.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center isolate">
            {order.shippingAddress?.email && (
              <>
                {/* Each button reflects and disables ONLY its own action, so
                    clicking one no longer greys out (or visually "clicks") the
                    other two. */}
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-r-none border-r-0 text-green-700 hover:text-green-800"
                  onClick={() => handleSendEmail('confirmation')} disabled={sendingEmail === 'confirmation'}>
                  <FaEnvelope className="mr-2 h-3.5 w-3.5" />
                  {sendingEmail === 'confirmation' ? 'Sending…' : 'Confirmation'}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-l-none text-blue-700 hover:text-blue-800 mr-2"
                  onClick={() => setShowUpdateEmailModal(true)} disabled={sendingEmail === 'update'}>
                  <FaEnvelope className="mr-2 h-3.5 w-3.5" />
                  {sendingEmail === 'update' ? 'Sending…' : 'Update'}
                </Button>
              </>
            )}

            {/* Invoice: download the PDF or send it on a specific channel. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-10 text-purple-700 hover:text-purple-800 mr-2"
                  disabled={invoiceBusy !== null}>
                  <FaFileInvoice className="mr-2 h-3.5 w-3.5" />
                  {invoiceBusy ? `Invoice (${invoiceBusy})…` : 'Invoice'}
                  <FaChevronDown className="ml-2 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadInvoice}>
                  <FaDownload className="mr-2 h-3.5 w-3.5" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('email')} disabled={!order.shippingAddress?.email}>
                  <FaEnvelope className="mr-2 h-3.5 w-3.5" /> Send via Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('whatsapp')}>
                  <FaWhatsapp className="mr-2 h-3.5 w-3.5" /> Send via WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendInvoice('sms')}>
                  <FaSms className="mr-2 h-3.5 w-3.5" /> Send via SMS
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasPerm('orders.manage') && order.orderStatus === 'pending' && order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed' && (
              <Button variant="secondary" size="sm" className="h-10 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 mr-2"
                onClick={() => setShowPaymentVerifyModal(true)}>
                <FaCreditCard className="mr-2 h-3.5 w-3.5" /> Verify Payment
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
              <Button variant="secondary" size="sm" className="h-10 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 mr-2"
                onClick={() => setShowMarkAsPaidModal(true)}>
                <FaMoneyCheckAlt className="mr-2 h-3.5 w-3.5" /> Mark as Paid
              </Button>
            )}

            {/* COD settled directly with the customer (UPI/bank transfer/cash) before
                delivery — full or partial. Available any time it isn't already fully
                paid or in a terminal state, not just while order_status is pending. */}
            {hasPerm('orders.manage') && order.paymentMethod === 'cod' && order.paymentStatus !== 'completed'
              && !['cancelled', 'returned'].includes(order.orderStatus) && (
              <Button variant="secondary" size="sm" className="h-10 bg-green-100 text-green-800 hover:bg-green-200 mr-2"
                onClick={() => setShowRecordCodPayment(true)}>
                <FaCreditCard className="mr-2 h-3.5 w-3.5" /> Record Payment
              </Button>
            )}

            {hasPerm('orders.manage') && order.orderStatus === 'pending' && (
              <Button variant="default" size="sm" className="h-10 bg-green-600 hover:bg-green-700 mr-2"
                onClick={handleConfirmOrder} disabled={confirmingOrder || (order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed')}>
                <FaCheckCircle className="mr-2 h-3.5 w-3.5" /> {confirmingOrder ? 'Confirming...' : 'Confirm Order'}
              </Button>
            )}

            {/* Hold / release — parks an order (stock query, address doubt) without cancelling. */}
            {hasPerm('orders.manage') && ['pending', 'confirmed', 'processing'].includes(order.orderStatus) && (
              <Button variant="secondary" size="sm" className="h-10 bg-orange-100 text-orange-800 hover:bg-orange-200 mr-2"
                onClick={() => handleStatusUpdate('on_hold')} disabled={updating}>
                Put on Hold
              </Button>
            )}
            {hasPerm('orders.manage') && order.orderStatus === 'on_hold' && (
              <Button variant="secondary" size="sm" className="h-10 bg-blue-100 text-blue-800 hover:bg-blue-200 mr-2"
                onClick={() => handleStatusUpdate('confirmed')} disabled={updating}>
                Release Hold
              </Button>
            )}

            {canAccess('shipping') && hasPerm('shipments.manage') && ['confirmed', 'processing', 'shipped'].includes(order.orderStatus) && (
              <Button variant="default" size="sm" className="h-10 bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowShipmentModal(true)} disabled={sendingToShiprocket}>
                <FaTruck className="mr-2 h-3.5 w-3.5" /> {sendingToShiprocket ? 'Creating...' : order.shippingProvider ? 'Reship Order' : 'Create Shipment'}
              </Button>
            )}

            {hasPerm('orders.manage') && order.orderStatus === 'delivered' && (
              <Button variant="default" size="sm" className="h-10 bg-indigo-600 hover:bg-indigo-700 ml-2"
                onClick={handleMarkCompleted} disabled={updating}>
                <FaCheckCircle className="mr-2 h-3.5 w-3.5" /> {updating ? 'Updating...' : 'Mark as Completed'}
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
                <Button variant="outline" size="sm" className="h-10 border-green-300 text-green-700 hover:bg-green-50 ml-2"
                  onClick={() => setDeliveryModalMode('delivered')}>
                  <FaCheckCircle className="mr-2 h-3.5 w-3.5" /> Mark Delivered
                </Button>
                <Button variant="outline" size="sm" className="h-10 border-orange-300 text-orange-700 hover:bg-orange-50 ml-2"
                  onClick={() => setDeliveryModalMode('rto')}>
                  <FaTruck className="mr-2 h-3.5 w-3.5" /> Mark RTO / Failed Delivery
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <OrderProgressStepper
        orderStatus={order.orderStatus}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.paymentMethod}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <OrderItems
              items={order.items || []}
              b2bTier={order.b2bTier ?? order.b2b_tier}
              orderDiscount={Number(order.discount) || 0}
            />
            {/* Items are editable only while unpaid and unshipped. */}
            {isOrderEditable && (
              <Button size="sm" variant="outline" className="absolute top-4 right-4"
                onClick={() => setShowEditItems(true)}>
                Edit items
              </Button>
            )}
          </div>

          {/* Review-and-pay link — Shopify-style page the customer can open to
              check the order and pay online (works for COD before dispatch too). */}
          {payLink && (
            <Card className="shadow-sm border-emerald-200 bg-emerald-50/40">
              <CardContent className="py-2 px-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Customer payment / confirmation link</p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{payLink}</p>
                </div>
                <div className="flex gap-2 shrink-0">
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

          <OrderFulfillmentCard
            fulfillment={order.fulfillment}
            shipments={order.shipments}
            sla={order.sla}
          />

          <Card className="shadow-sm">
            <CardHeader className="px-4 py-2.5 border-b">
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <OrderSummary
                subtotal={order.subtotal || 0}
                shipping={order.shippingCost || order.shipping_cost || order.shipping || 0}
                discount={order.discount || 0}
                total={order.total || 0}
                gst={order.gst}
                onRemoveShipping={isOrderEditable ? () => handleRemoveCharge('shipping') : undefined}
                onRemoveCod={isOrderEditable ? () => handleRemoveCharge('cod') : undefined}
                removingCharge={removingCharge}
                amountReceived={order.amountReceived}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <DiscountBreakdown discounts={discountBreakdown} couponCode={order.couponCode} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <ShippingInformation
                shippingAddress={order.shippingAddress}
                warehouseId={order.warehouseId}
                gst={order.gst}
                onWhatsAppClick={handleWhatsAppClick}
                headerAction={
                  <OrderAddressEditor
                    orderId={order._id || order.id}
                    orderStatus={order.orderStatus || order.order_status}
                    kind="shipping"
                    address={order.shippingAddress || order.shipping_address}
                    onSaved={(next: any) => setOrder((o: any) => ({ ...o, shippingAddress: next, shipping_address: next }))}
                  />
                }
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <PaymentInformation
                paymentMethod={order.paymentMethod}
                paymentStatus={order.paymentStatus}
                paymentGateway={order.paymentGateway}
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

          {(() => {
            // Most orders never capture a separate billing address — checkout only
            // asks for one when it differs from shipping. Show it either way instead
            // of hiding the whole card, clearly labeled when it's a fallback.
            const billing = order.billingAddress || order.billing_address;
            const usingShippingFallback = !billing;
            const addr = billing || order.shippingAddress || order.shipping_address;
            if (!addr) return null;
            return (
              <Card className="shadow-sm">
                <CardHeader className="px-4 py-2.5 border-b">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      Billing Address
                      {usingShippingFallback && (
                        <span className="text-xs font-normal text-muted-foreground">(same as shipping)</span>
                      )}
                    </CardTitle>
                    {/* Seeded from the shipping address when none was captured, so
                        saving here CREATES a distinct billing address for the order. */}
                    <OrderAddressEditor
                      orderId={order._id || order.id}
                      orderStatus={order.orderStatus || order.order_status}
                      kind="billing"
                      address={addr}
                      onSaved={(next: any) => setOrder((o: any) => ({ ...o, billingAddress: next, billing_address: next }))}
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-1.5 text-muted-foreground text-sm">
                    <p className="font-semibold text-foreground text-sm mb-0.5">{addr.fullName || addr.full_name}</p>
                    <p>{addr.address}</p>
                    {(addr.addressLine2 || addr.address_line2) && <p>{addr.addressLine2 || addr.address_line2}</p>}
                    <p>{addr.district}, {addr.state} {addr.pincode}</p>
                    <p className="pt-2 font-medium">Phone: {addr.mobileNumber || addr.mobile_number}</p>
                    {addr.email && <p className="font-medium">Email: {addr.email}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="px-4 py-2.5 border-b">
              <CardTitle className="text-base">Order Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Order Status</p>
                  <StatusBadge status={order.orderStatus} type="order" />
                </div>
                {/* Return window — stamped once (whole order, or the delivered portion of a
                    split shipment) delivers; also the date the platform's own billing to this
                    store becomes eligible to count this order/shipment (COMMON_MISTAKES #142). */}
                {(order.returnDeadline ?? order.return_deadline) && (
                  <div>
                    <p className="text-muted-foreground mb-1">Return Window</p>
                    {new Date(order.returnDeadline ?? order.return_deadline) > new Date() ? (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                        Closes {formatDate(order.returnDeadline ?? order.return_deadline)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        Closed {formatDate(order.returnDeadline ?? order.return_deadline)}
                      </Badge>
                    )}
                  </div>
                )}
                {/* Order type — B2B (wholesale) vs retail, plus the tier that priced it. */}
                <div>
                  <p className="text-muted-foreground mb-1">Order Type</p>
                  {(order.orderType ?? order.order_type) === 'b2b' ? (
                    <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 hover:bg-blue-500/25">
                      B2B{(order.b2bTier ?? order.b2b_tier) ? ` — ${order.b2bTier ?? order.b2b_tier} tier` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Retail</Badge>
                  )}
                </div>
                {(order.customerGstin ?? order.customer_gstin) && (
                  <div>
                    <p className="text-muted-foreground mb-0.5">Invoice GSTIN</p>
                    <p className="font-mono text-xs font-semibold text-foreground">{order.customerGstin ?? order.customer_gstin}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground mb-0.5">Payment Method</p>
                  <p className="font-semibold text-foreground">{order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</p>
                </div>
                {order.paymentMethod === 'cod' && (
                  <div>
                    <p className="text-muted-foreground mb-1">COD Verification</p>
                    <Badge className={(order.isOtpVerified ?? order.is_otp_verified)
                      ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25'
                      : 'bg-yellow-500/15 text-yellow-700 border-yellow-200 hover:bg-yellow-500/25'}>
                      {(order.isOtpVerified ?? order.is_otp_verified) ? 'Verified (OTP)' : 'Not verified'}
                    </Badge>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground mb-1">Payment Status</p>
                  <StatusBadge status={order.paymentStatus} type="payment" />
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Order Date</p>
                  <p className="font-medium text-foreground">
                    {formatDate(order.createdAt ?? order.created_at, 'MMM dd, yyyy HH:mm', 'N/A')}
                  </p>
                </div>
                {order.trackingUrl && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Tracking URL</p>
                    <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
                      Track Shipment
                    </a>
                  </div>
                )}
                {order.shippingProvider && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Shipping Provider</p>
                    <p className="font-medium text-foreground capitalize">{order.shippingProvider}</p>
                  </div>
                )}
                {order.courierName && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Courier</p>
                    <p className="font-medium text-foreground">{order.courierName}</p>
                  </div>
                )}
                {order.expectedDelivery && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Estimated Delivery</p>
                    <p className="font-medium text-foreground">{formatDate(order.expectedDelivery, 'MMM dd, yyyy', 'N/A')}</p>
                  </div>
                )}
                {shiprocketAwb && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Shiprocket AWB</p>
                    <p className="font-mono text-foreground font-medium bg-muted px-2 py-1 rounded w-fit">{shiprocketAwb}</p>
                  </div>
                )}
                {/* Booked at the carrier but never dispatched — without this the
                    order looks shipped in Shiprocket while no AWB exists, and the
                    only visible action (Create Shipment) would duplicate it. */}
                {!shiprocketAwb && (order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
                  <div className="pt-1.5 border-t space-y-2">
                    <p className="text-muted-foreground mb-1">Shiprocket AWB</p>
                    <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-200 hover:bg-yellow-500/25">
                      Order created, not dispatched
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Shiprocket order #{order.shiprocketOrderId ?? order.shiprocket_order_id} exists but has no AWB.
                      This usually means the Shiprocket account wallet is below its ₹100 minimum.
                      Top up at shiprocket.in, then assign the AWB here — don&apos;t create the shipment
                      again or a duplicate order is booked.
                    </p>
                    <Button size="sm" variant="outline" onClick={handleAssignAwb} disabled={assigningAwb}>
                      {assigningAwb ? 'Assigning…' : 'Assign AWB'}
                    </Button>
                  </div>
                )}
                {order.delhiveryWaybill && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">DELHIVERY Waybill</p>
                    <p className="font-mono text-foreground font-medium bg-muted px-2 py-1 rounded w-fit">{order.delhiveryWaybill}</p>
                  </div>
                )}
                
                {/* Shipment Actions — Label/Manifest are dispatch-time documents;
                    once the order is done (delivered/cancelled/returned) there's
                    nothing left to print one for. Previously shown on every
                    status as long as an AWB existed, including on a delivered
                    order from weeks ago. */}
                {order.shipmentId && (order.shippingProvider === 'shiprocket' || order.shippingProvider === 'delhivery') && (
                  <div className="pt-3 mt-1 border-t flex flex-wrap gap-2">
                    {order.orderStatus === 'shipped' && order.shippingProvider === 'shiprocket' && !order.shiprocketPickupScheduledDate && (
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setShowPickupModal(true)}>
                        Schedule Pickup
                      </Button>
                    )}
                    {(shiprocketAwb || order.delhiveryWaybill) && !ORDER_TERMINAL_STATUSES.includes(order.orderStatus) && (
                      <Button variant="outline" size="sm" className="h-9" onClick={handleDownloadLabel}>
                        Download Label
                      </Button>
                    )}
                    {((order.shippingProvider === 'shiprocket' && shiprocketAwb) || (order.shippingProvider === 'delhivery' && order.delhiveryWaybill)) && !ORDER_TERMINAL_STATUSES.includes(order.orderStatus) && (
                      <Button variant="outline" size="sm" className="h-9" onClick={handleDownloadManifest}>
                        Download Manifest
                      </Button>
                    )}
                  </div>
                )}
                {order.warehouseId && (
                  <div className="pt-1.5 border-t">
                    <p className="text-muted-foreground mb-1">Assigned Warehouse</p>
                    <p className="font-medium text-foreground">{(order.warehouseId as any)?.name || 'N/A'}</p>
                  </div>
                )}
                {/* No shipment on this order at all — the case where a carrier
                    dashboard (e.g. Shiprocket panel) was used directly instead of
                    this app, so nothing here ever learned an AWB exists. */}
                {!order.shipmentId && !(order.shiprocketShipmentId ?? order.shiprocket_shipment_id) && (
                  <div className="pt-3 mt-1 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      Shipped straight from the carrier&apos;s own dashboard? Paste the AWB to link it here.
                    </p>
                    <Button variant="outline" size="sm" className="h-9" onClick={handleAttachAwb} disabled={attachingAwb}>
                      {attachingAwb ? 'Attaching…' : 'Attach AWB (booked elsewhere)'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {order.risk && (() => {
            // Authenticity reads HIGHER = BETTER (100 = fully trustworthy).
            const authenticity: number = order.risk.authenticity ?? Math.max(0, 100 - (order.risk.score ?? 0));
            const tone = authenticity >= 80
              ? { label: 'Authentic', text: 'text-green-700', chip: 'bg-green-100 text-green-700', bar: 'bg-green-500' }
              : authenticity >= 50
                ? { label: 'Review advised', text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-500' }
                : { label: 'High risk', text: 'text-red-700', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' };
            const standing = order.risk.standing;
            return (
              <Card className="shadow-sm">
                <CardHeader className="px-4 py-2.5 border-b">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Order Authenticity</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tone.chip}`}>
                      {tone.label}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {/* Score gauge — the higher the score, the more authentic. */}
                  <div className="flex items-end justify-between mb-1">
                    <span className={`text-3xl font-bold ${tone.text}`}>{authenticity}</span>
                    <span className="text-xs text-muted-foreground mb-1">/ 100</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-1">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(2, authenticity)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
                    <span className="text-red-600">Risky</span>
                    <span className="text-yellow-600">Review</span>
                    <span className="text-green-600">Authentic</span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">
                    Heuristic score from address completeness, IP-vs-shipping-address location, and this
                    customer's cancellation history across every store on the platform — not a fraud guarantee.
                  </p>
                  {order.risk.flags?.length > 0 ? (
                    <ul className="space-y-2">
                      {order.risk.flags.map((f: any, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                            f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-foreground">{f.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-green-700">No risk signals detected.</p>
                  )}
                  {standing && standing.totalOrders > 0 && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                      Platform history: {standing.totalOrders} order(s) across {standing.storeCount} store(s),
                      {' '}{standing.totalCancelled} cancelled/returned.
                    </p>
                  )}
                  {order.risk.ipGeo && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Order IP geolocates to {[order.risk.ipGeo.city, order.risk.ipGeo.region, order.risk.ipGeo.country].filter(Boolean).join(', ') || 'an unknown location'}.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <OrderJourneyCard attribution={order.attribution} />

          {/* Invoice number from the store's own billing software, salesperson,
              and an uploaded invoice PDF that replaces the generated one. */}
          <OrderBillingCard
            orderId={id!}
            invoiceNumber={order.invoiceNumber ?? order.invoice_number}
            invoiceDate={order.invoiceDate ?? order.invoice_date}
            invoiceNumberSource={order.invoiceNumberSource ?? order.invoice_number_source}
            salesperson={order.salesperson}
            manualInvoiceUrl={order.manualInvoiceUrl ?? order.manual_invoice_url}
            manualInvoiceFilename={order.manualInvoiceFilename ?? order.manual_invoice_filename}
            manualInvoiceUploadedBy={order.manualInvoiceUploadedBy ?? order.manual_invoice_uploaded_by}
            canManage={hasPerm('orders.manage')}
            onSaved={fetchOrder}
          />

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <OrderNotes
                notes={order.orderNotes || order.order_notes || []}
                onAdd={handleAddNote}
                saving={savingNotes}
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <OrderStatusHistory statusHistory={order.statusHistory} />
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
  );
};

export default OrderDetail;
