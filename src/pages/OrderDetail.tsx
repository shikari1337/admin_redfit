/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, shippingAPI, paymentsAPI, shipmentsAPI } from '../services/api';
import { format } from 'date-fns';
import { FaCheckCircle, FaEnvelope, FaFileInvoice, FaCreditCard, FaTruck, FaArrowLeft } from 'react-icons/fa';
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
} from '../components/order';
import { PickupModal } from '../components/shipments';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate('/orders');
    return null;
  }
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [sendingToShiprocket, setSendingToShiprocket] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
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
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');
  const [upiPaymentId, setUpiPaymentId] = useState('');
  const [paymentVerificationNotes, setPaymentVerificationNotes] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [showUpdateEmailModal, setShowUpdateEmailModal] = useState(false);
  const [updateEmailSubject, setUpdateEmailSubject] = useState('');
  const [updateEmailContent, setUpdateEmailContent] = useState('');

  // Shipment actions state
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [schedulingPickup, setSchedulingPickup] = useState(false);

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
      setNotesText(orderData?.notes || '');
    } catch (error) {
      console.error('Failed to load order:', error);
      toast({ variant: "destructive", title: "Error", description: 'Failed to load order' });
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!confirm(`Update order status to ${newStatus}?`)) return;

    setUpdating(true);
    try {
      await ordersAPI.updateStatus(id!, newStatus, statusNotes || undefined);
      setStatusNotes('');
      fetchOrder();
      toast({ title: "Success", description: `Order status updated to ${newStatus} successfully!` });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update order status';
      toast({ variant: "destructive", title: "Update Failed", description: errorMessage });
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await ordersAPI.updateNotes(id!, notesText);
      setEditingNotes(false);
      fetchOrder();
      toast({ title: "Success", description: "Notes updated successfully" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: 'Failed to save notes' });
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

  const handleConfirmOrder = async () => {
    if (!confirm('Confirm this order? After confirmation, you can create a shipment.')) return;
    
    setConfirmingOrder(true);
    try {
      await ordersAPI.confirmOrder(id!);
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
      await ordersAPI.markOrderCompleted(id!);
      toast({ title: "Completed", description: 'Order marked as completed successfully!' });
      fetchOrder();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.response?.data?.message || 'Failed to finish order.' });
    } finally {
      setUpdating(false);
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
      let readableWarehouseId = selectedWarehouseId;
      const selectedW = warehouses.find(w => w._id === selectedWarehouseId);
      if (selectedW) {
        readableWarehouseId = selectedW.code || selectedW.name || selectedWarehouseId;
      }

      const shipmentData: any = {
        orderIds: [order.orderId || id!], // Pass human-readable string IDs
        warehouseId: readableWarehouseId, // Pass human-readable string IDs
        shippingProvider: selectedShippingProvider,
        weight: modalData?.weight || 0.5,
        length: modalData?.length || 10,
        breadth: modalData?.breadth || 10,
        height: modalData?.height || 5,
        orderItemIndices: orderItemSkus.length > 0 ? orderItemSkus : undefined, // We repurposed orderItemIndices to carry SKUs dynamically for readable logging
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

  const statusOptions = ['pending','confirmed','processing','shipped','delivered','cancelled','returned','completed'];
  const discountBreakdown = order.discountReason ? order.discountReason.split(',').map((d: string) => d.trim()) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
        <div>
          <Button variant="ghost" className="mb-2 -ml-3 text-muted-foreground" onClick={() => navigate('/orders')}>
            <FaArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Orders
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Order #{order.orderId}</h1>
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
            <Select value={order.orderStatus} onValueChange={handleStatusUpdate} disabled={updating}>
              <SelectTrigger className="h-9 w-[130px] border-none bg-background shadow-none font-medium capitalize">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center isolate">
            {order.shippingAddress?.email && (
              <>
                <Button variant="outline" size="sm" className="h-10 rounded-r-none border-r-0 text-green-700 hover:text-green-800"
                  onClick={() => handleSendEmail('confirmation')} disabled={sendingEmail !== null}>
                  <FaEnvelope className="mr-2 h-3.5 w-3.5" /> Confirmation
                </Button>
                <Button variant="outline" size="sm" className="h-10 rounded-none border-r-0 text-blue-700 hover:text-blue-800"
                  onClick={() => setShowUpdateEmailModal(true)} disabled={sendingEmail !== null}>
                  <FaEnvelope className="mr-2 h-3.5 w-3.5" /> Update
                </Button>
                <Button variant="outline" size="sm" className="h-10 rounded-l-none text-purple-700 hover:text-purple-800 mr-2"
                  onClick={() => handleSendEmail('invoice')} disabled={sendingEmail !== null}>
                  <FaFileInvoice className="mr-2 h-3.5 w-3.5" /> Invoice
                </Button>
              </>
            )}

            {order.orderStatus === 'pending' && order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed' && (
              <Button variant="secondary" size="sm" className="h-10 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 mr-2"
                onClick={() => setShowPaymentVerifyModal(true)}>
                <FaCreditCard className="mr-2 h-3.5 w-3.5" /> Verify Payment
              </Button>
            )}

            {order.orderStatus === 'pending' && (
              <Button variant="default" size="sm" className="h-10 bg-green-600 hover:bg-green-700 mr-2"
                onClick={handleConfirmOrder} disabled={confirmingOrder || (order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed')}>
                <FaCheckCircle className="mr-2 h-3.5 w-3.5" /> {confirmingOrder ? 'Confirming...' : 'Confirm Order'}
              </Button>
            )}

            {['confirmed', 'processing', 'shipped'].includes(order.orderStatus) && (
              <Button variant="default" size="sm" className="h-10 bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowShipmentModal(true)} disabled={sendingToShiprocket}>
                <FaTruck className="mr-2 h-3.5 w-3.5" /> {sendingToShiprocket ? 'Creating...' : order.shippingProvider ? 'Reship Order' : 'Create Shipment'}
              </Button>
            )}

            {order.orderStatus === 'delivered' && (
              <Button variant="default" size="sm" className="h-10 bg-indigo-600 hover:bg-indigo-700 ml-2"
                onClick={handleMarkCompleted} disabled={updating}>
                <FaCheckCircle className="mr-2 h-3.5 w-3.5" /> {updating ? 'Updating...' : 'Mark as Completed'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <OrderItems items={order.items || []} />

          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-xl">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <OrderSummary
                subtotal={order.subtotal || 0}
                shipping={order.shipping || 0}
                discount={order.discount || 0}
                total={order.total || 0}
                gst={order.gst}
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
                upiVerificationStatus={order.upiVerificationStatus}
                upiPaymentScreenshot={order.upiPaymentScreenshot}
                upiVerificationNotes={order.upiVerificationNotes}
              />
            </CardContent>
          </Card>

          {order.billingAddress && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-xl">Billing Address</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-2 text-muted-foreground text-sm">
                  <p className="font-semibold text-foreground text-base mb-1">{order.billingAddress?.fullName}</p>
                  <p>{order.billingAddress?.address}</p>
                  {order.billingAddress?.addressLine2 && <p>{order.billingAddress.addressLine2}</p>}
                  <p>{order.billingAddress?.district}, {order.billingAddress?.state} {order.billingAddress?.pincode}</p>
                  <p className="pt-2 font-medium">Phone: {order.billingAddress?.mobileNumber}</p>
                  {order.billingAddress?.email && <p className="font-medium">Email: {order.billingAddress.email}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-xl">Order Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Order Status</p>
                  <StatusBadge status={order.orderStatus} type="order" />
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Payment Method</p>
                  <p className="font-semibold text-foreground">{order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Payment Status</p>
                  <StatusBadge status={order.paymentStatus} type="payment" />
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Order Date</p>
                  <p className="font-medium text-foreground">
                    {order.createdAt ? format(new Date(order.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                  </p>
                </div>
                {order.trackingUrl && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Tracking URL</p>
                    <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
                      Track Shipment
                    </a>
                  </div>
                )}
                {order.shippingProvider && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Shipping Provider</p>
                    <p className="font-medium text-foreground capitalize">{order.shippingProvider}</p>
                  </div>
                )}
                {order.shiprocketAWB && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Shiprocket AWB</p>
                    <p className="font-mono text-foreground font-medium bg-muted px-2 py-1 rounded w-fit">{order.shiprocketAWB}</p>
                  </div>
                )}
                {order.delhiveryWaybill && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">DELHIVERY Waybill</p>
                    <p className="font-mono text-foreground font-medium bg-muted px-2 py-1 rounded w-fit">{order.delhiveryWaybill}</p>
                  </div>
                )}
                
                {/* Shipment Actions */}
                {order.shipmentId && (order.shippingProvider === 'shiprocket' || order.shippingProvider === 'delhivery') && (
                  <div className="pt-4 mt-2 border-t flex flex-wrap gap-2">
                    {order.orderStatus === 'shipped' && order.shippingProvider === 'shiprocket' && !order.shiprocketPickupScheduledDate && (
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setShowPickupModal(true)}>
                        Schedule Pickup
                      </Button>
                    )}
                    {(order.shiprocketAWB || order.delhiveryWaybill) && (
                      <Button variant="outline" size="sm" className="h-9" onClick={handleDownloadLabel}>
                        Download Label
                      </Button>
                    )}
                    {((order.shippingProvider === 'shiprocket' && order.shiprocketAWB) || (order.shippingProvider === 'delhivery' && order.delhiveryWaybill)) && (
                      <Button variant="outline" size="sm" className="h-9" onClick={handleDownloadManifest}>
                        Download Manifest
                      </Button>
                    )}
                  </div>
                )}
                {order.warehouseId && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Assigned Warehouse</p>
                    <p className="font-medium text-foreground">{(order.warehouseId as any)?.name || 'N/A'}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <OrderNotes
                notes={notesText}
                editing={editingNotes}
                onEdit={() => setEditingNotes(true)}
                onSave={handleSaveNotes}
                onCancel={() => { setEditingNotes(false); setNotesText(order.notes || ''); }}
                onChange={setNotesText}
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
      />

      <PaymentVerificationModal
        isOpen={showPaymentVerifyModal}
        onClose={() => setShowPaymentVerifyModal(false)}
        onSubmit={handleVerifyPayment}
        loading={verifyingPayment}
        paymentGateway={order.paymentGateway}
        razorpayPaymentId={razorpayPaymentId}
        upiPaymentId={upiPaymentId}
        paymentVerificationNotes={paymentVerificationNotes}
        upiPaymentScreenshot={order.upiPaymentScreenshot}
        onRazorpayPaymentIdChange={setRazorpayPaymentId}
        onUpiPaymentIdChange={setUpiPaymentId}
        onPaymentVerificationNotesChange={setPaymentVerificationNotes}
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
