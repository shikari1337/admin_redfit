/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, shippingAPI, paymentsAPI, shipmentsAPI, warehousesAPI } from '../services/api';
import { format } from 'date-fns';
import { FaWhatsapp, FaCheckCircle, FaEnvelope, FaFileInvoice, FaCreditCard, FaTruck } from 'react-icons/fa';
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

const OrderDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchOrder();
    fetchWarehouses();
    fetchShippingProviders();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const response = await ordersAPI.getById(id!);
      setOrder(response.data);
      setNotesText(response.data?.notes || '');
    } catch (error) {
      alert('Failed to load order');
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!confirm(`Update order status to ${newStatus}?`)) return;

    setUpdating(true);
    try {
      console.log('Updating order status:', { id, status: newStatus, notes: statusNotes });
      const response = await ordersAPI.updateStatus(id!, newStatus, statusNotes || undefined);
      console.log('Status update response:', response);
      setStatusNotes('');
      fetchOrder();
      alert(`Order status updated to ${newStatus} successfully!`);
    } catch (error: any) {
      console.error('Failed to update order status:', error);
      console.error('Error details:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update order status';
      alert(`Failed to update order status: ${errorMessage}`);
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
    } catch (error) {
      alert('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      // Use shipping API to get warehouses (returns active warehouses only)
      const response = await shippingAPI.getWarehouses();
      // Handle response structure: { success: true, data: [...] }
      const warehousesData = response.data?.data || response.data || [];
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      // Auto-select first warehouse if available and none selected
      if (warehousesData.length > 0 && !selectedWarehouseId) {
        const firstWarehouse = warehousesData[0];
        if (firstWarehouse && firstWarehouse._id) {
          setSelectedWarehouseId(firstWarehouse._id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
      setWarehouses([]); // Set empty array on error
    }
  };

  const fetchShippingProviders = async () => {
    try {
      const response = await shippingAPI.getProviders();
      if (response.success && response.data && response.data.length > 0) {
        setShippingProviders(response.data);
        // Auto-select first provider if no provider selected
        if (!selectedShippingProvider && response.data.length > 0) {
          const firstProvider = response.data[0];
          setSelectedShippingProvider(firstProvider.id || 'manual');
        }
      } else {
        // Always show manual option even if no providers are configured
        setShippingProviders([]);
        setSelectedShippingProvider('manual');
      }
    } catch (error) {
      console.error('Failed to fetch shipping providers:', error);
      // Default to manual if fetch fails
      setShippingProviders([]);
      setSelectedShippingProvider('manual');
    }
  };

  const handleVerifyPayment = async () => {
    setVerifyingPayment(true);
    try {
      if (order.paymentGateway === 'razorpay') {
        if (!razorpayPaymentId) {
          alert('Please enter Razorpay Payment ID (Transaction ID)');
          setVerifyingPayment(false);
          return;
        }
        await paymentsAPI.verifyRazorpay(id!, razorpayPaymentId);
        alert('Razorpay payment verified successfully! Order is now confirmed.');
      } else if (order.paymentGateway === 'upi') {
        if (!upiPaymentId) {
          alert('Please enter UPI Payment ID (Transaction ID)');
          setVerifyingPayment(false);
          return;
        }
        await paymentsAPI.verifyUPI(id!, upiPaymentId, paymentVerificationNotes || undefined);
        alert('UPI payment verified successfully! Order is now confirmed.');
      } else if (order.paymentGateway === 'manual') {
        await paymentsAPI.verifyManual(id!, paymentVerificationNotes || undefined);
        alert('Manual payment verified successfully! Order is now confirmed.');
      }
      setShowPaymentVerifyModal(false);
      setRazorpayPaymentId('');
      setUpiPaymentId('');
      setPaymentVerificationNotes('');
      fetchOrder();
    } catch (error: any) {
      console.error('Failed to verify payment:', error);
      alert(error.response?.data?.message || 'Failed to verify payment. Please try again.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!confirm('Confirm this order? After confirmation, you can create a shipment.')) return;
    
    setConfirmingOrder(true);
    try {
      await ordersAPI.confirmOrder(id!);
      alert('Order confirmed successfully!');
      fetchOrder();
    } catch (error: any) {
      console.error('Failed to confirm order:', error);
      alert(error.response?.data?.message || 'Failed to confirm order. Please try again.');
    } finally {
      setConfirmingOrder(false);
    }
  };

  const handleSendEmail = async (type: 'confirmation' | 'update' | 'invoice', subject?: string, content?: string) => {
    if (!order.shippingAddress?.email) {
      alert('Customer email address is not available');
      return;
    }

    if (type === 'update' && (!subject || !content)) {
      setShowUpdateEmailModal(true);
      return;
    }

    setSendingEmail(type);
    try {
      await ordersAPI.sendEmail(id!, type, subject, content);
      alert(`Email sent successfully to ${order.shippingAddress.email}`);
      setShowUpdateEmailModal(false);
      setUpdateEmailSubject('');
      setUpdateEmailContent('');
    } catch (error: any) {
      alert(error.response?.data?.message || `Failed to send ${type} email`);
    } finally {
      setSendingEmail(null);
    }
  };

  const handleSendUpdateEmail = async () => {
    if (!updateEmailSubject.trim() || !updateEmailContent.trim()) {
      alert('Please enter both subject and content');
      return;
    }
    await handleSendEmail('update', updateEmailSubject, updateEmailContent);
  };

  const handleCreateShipment = async (modalData?: {
    selectedCourierId?: number | null;
    selectedDelhiveryType?: 'express' | 'surface' | null;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    selectedItemIndices?: number[];
  }) => {
    // All shipments (including manual) require a warehouse
    if (!selectedWarehouseId) {
      alert('Please select a warehouse');
      return;
    }

    // Check if selected warehouse has the provider enabled (for non-manual providers)
    if (selectedShippingProvider !== 'manual') {
      const selectedWarehouse = warehouses.find(w => w._id === selectedWarehouseId);
      if (selectedWarehouse) {
        let hasProviderEnabled = false;
        if (selectedShippingProvider === 'shiprocket') {
          hasProviderEnabled = selectedWarehouse.shippingProviders?.shiprocket?.enabled || false;
        } else if (selectedShippingProvider === 'delhivery') {
          hasProviderEnabled = selectedWarehouse.shippingProviders?.delhivery?.enabled || false;
        }

        if (!hasProviderEnabled) {
          const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 'DELHIVERY';
          const confirmProceed = confirm(
            `Warning: ${providerName} is not enabled for the selected warehouse "${selectedWarehouse.name}".\n\n` +
            `Do you want to proceed anyway? You may need to enable ${providerName} for this warehouse in the Warehouses settings.`
          );
          if (!confirmProceed) {
            return;
          }
        }
      }
    }

    // For manual shipments, validate tracking details
    if (selectedShippingProvider === 'manual') {
      if (!manualTrackingId || !manualCarrierName || !manualTrackingUrl) {
        alert('Please enter all manual tracking details (Tracking ID, Carrier Name, and Tracking URL)');
        return;
      }
    }

    const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 
                        selectedShippingProvider === 'delhivery' ? 'DELHIVERY' : 'Manual';
    
    if (!confirm(`Create shipment with ${providerName}?\n\nNote: After creating the shipment, you can manage pickup and generate AWB from the Shipments page.`)) return;
    
    setSendingToShiprocket(true);
    try {
      // Prepare item indices - if provided, use them; otherwise, include all items
      let orderItemIndices: number[] = [];
      if (modalData?.selectedItemIndices && modalData.selectedItemIndices.length > 0) {
        orderItemIndices = modalData.selectedItemIndices;
      } else if (order?.items && order.items.length > 0) {
        // Default to all items if none specified
        orderItemIndices = order.items.map((_, index) => index);
      }

      // Prepare shipment data
      const shipmentData: any = {
        orderIds: [id!],
        warehouseId: selectedWarehouseId,
        shippingProvider: selectedShippingProvider,
        // Package details
        weight: modalData?.weight || 0.5,
        length: modalData?.length || 10,
        breadth: modalData?.breadth || 10,
        height: modalData?.height || 5,
        // Item selection (indices of items to include)
        orderItemIndices: orderItemIndices.length > 0 ? orderItemIndices : undefined,
      };

      // For manual shipments, add tracking details
      if (selectedShippingProvider === 'manual') {
        shipmentData.manualTrackingId = manualTrackingId;
        shipmentData.manualCarrierName = manualCarrierName;
        shipmentData.manualTrackingUrl = manualTrackingUrl;
      } else {
        // Add courier ID for Shiprocket
        if (selectedShippingProvider === 'shiprocket' && modalData?.selectedCourierId) {
          shipmentData.courierCompanyId = modalData.selectedCourierId;
        }
        
        // Add service type for DELHIVERY
        if (selectedShippingProvider === 'delhivery' && modalData?.selectedDelhiveryType) {
          shipmentData.delhiveryServiceType = modalData.selectedDelhiveryType;
        }
      }
      
      console.log('Creating shipment with data:', shipmentData);
      const response = await shipmentsAPI.create(shipmentData);
      console.log('Shipment creation response:', response);
      
      if (response.success) {
        const itemCount = orderItemIndices.length > 0 ? orderItemIndices.length : (order?.items?.length || 0);
        const alertMsg = selectedShippingProvider === 'manual'
          ? `Shipment created successfully! Shipment #${response.data?.shipmentNumber || response.data?._id}\n\nItems: ${itemCount} item(s)\nManual tracking details:\nTracking ID: ${manualTrackingId}\nCarrier: ${manualCarrierName}\n\nGo to Shipments page to manage the shipment.`
          : `Shipment created successfully! Shipment #${response.data?.shipmentNumber || response.data?._id}\n\nItems: ${itemCount} item(s)\nWeight: ${modalData?.weight || 0.5} kg\n\nGo to Shipments page to schedule pickup and generate AWB.`;
        alert(alertMsg);
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
      console.error('Failed to create shipment:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        request: error.config,
      });
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to create shipment. Please try again.';
      alert(`Failed to create shipment:\n${errorMessage}\n\nCheck console for more details.`);
    } finally {
      setSendingToShiprocket(false);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!order) return null;

  const statusOptions = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
  ];

  // Parse discount reason to show breakdown
  const discountBreakdown = order.discountReason
    ? order.discountReason.split(',').map((d: string) => d.trim())
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/orders')}
            className="text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to Orders
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Order {order.orderId}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Email Actions */}
          {order.shippingAddress?.email && (
            <div className="flex items-center gap-2 mr-2 border-r pr-2">
              <button
                onClick={() => handleSendEmail('confirmation')}
                disabled={sendingEmail !== null}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Send Order Confirmation Email"
              >
                <FaEnvelope size={14} />
                {sendingEmail === 'confirmation' ? 'Sending...' : 'Send Confirmation'}
              </button>
              <button
                onClick={() => setShowUpdateEmailModal(true)}
                disabled={sendingEmail !== null}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Send Order Update Email"
              >
                <FaEnvelope size={14} />
                Send Update
              </button>
              <button
                onClick={() => handleSendEmail('invoice')}
                disabled={sendingEmail !== null}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Send Invoice Email"
              >
                <FaFileInvoice size={14} />
                {sendingEmail === 'invoice' ? 'Sending...' : 'Send Invoice'}
              </button>
            </div>
          )}
          {order.orderStatus === 'pending' && order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed' && (
            <button
              onClick={() => setShowPaymentVerifyModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              <FaCreditCard size={16} />
              Verify Payment
            </button>
          )}
          {order.orderStatus === 'pending' && (
            <button
              onClick={handleConfirmOrder}
              disabled={confirmingOrder || (order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={order.paymentMethod === 'prepaid' && order.paymentStatus !== 'completed' ? 'Payment must be verified first' : 'Confirm Order'}
            >
              <FaCheckCircle size={16} />
              {confirmingOrder ? 'Confirming...' : 'Confirm Order'}
            </button>
          )}
          {order.orderStatus === 'confirmed' && !order.shippingProvider && (
            <button
              onClick={() => setShowShipmentModal(true)}
              disabled={sendingToShiprocket}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaTruck size={16} />
              {sendingToShiprocket ? 'Creating...' : 'Create Shipment'}
            </button>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Status notes (optional)"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-48"
            />
            <select
              value={order.orderStatus}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              disabled={updating}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <OrderItems items={order.items || []} />

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Order Summary</h2>
            <OrderSummary
              subtotal={order.subtotal || 0}
              shipping={order.shipping || 0}
              discount={order.discount || 0}
              total={order.total || 0}
              gst={order.gst}
            />
          </div>

          {/* Discount Breakdown */}
          <DiscountBreakdown
            discounts={discountBreakdown}
            couponCode={order.couponCode}
          />

          {/* Shipping Address & Warehouse Information */}
          <ShippingInformation
            shippingAddress={order.shippingAddress}
            warehouseId={order.warehouseId}
            gst={order.gst}
            onWhatsAppClick={handleWhatsAppClick}
          />

          {/* Payment Information */}
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

          {/* Billing Address */}
          {order.billingAddress && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Billing Address</h2>
              <div className="space-y-2 text-gray-700">
                <p className="font-medium">{order.billingAddress?.fullName}</p>
                <p>{order.billingAddress?.address}</p>
                {order.billingAddress?.addressLine2 && (
                  <p>{order.billingAddress.addressLine2}</p>
                )}
                <p>
                  {order.billingAddress?.district}, {order.billingAddress?.state}{' '}
                  {order.billingAddress?.pincode}
                </p>
                <p>Phone: {order.billingAddress?.mobileNumber}</p>
                {order.billingAddress?.email && (
                  <p>Email: {order.billingAddress.email}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Order Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Order Status</p>
                <div className="mt-1">
                  <StatusBadge status={order.orderStatus} type="order" />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-medium">{order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Status</p>
                <div className="mt-1">
                  <StatusBadge status={order.paymentStatus} type="payment" />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Order Date</p>
                <p className="font-medium">
                  {order.createdAt ? format(new Date(order.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                </p>
              </div>
              {order.trackingUrl && (
                <div>
                  <p className="text-sm text-gray-500">Tracking</p>
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 hover:underline"
                  >
                    Track Order
                  </a>
                </div>
              )}
              {order.shippingProvider && (
                <div>
                  <p className="text-sm text-gray-500">Shipping Provider</p>
                  <p className="font-medium text-sm capitalize">{order.shippingProvider}</p>
                </div>
              )}
              {order.shiprocketAWB && (
                <div>
                  <p className="text-sm text-gray-500">Shiprocket AWB</p>
                  <p className="font-mono text-sm">{order.shiprocketAWB}</p>
                </div>
              )}
              {order.delhiveryWaybill && (
                <div>
                  <p className="text-sm text-gray-500">DELHIVERY Waybill</p>
                  <p className="font-mono text-sm">{order.delhiveryWaybill}</p>
                </div>
              )}
              {order.warehouseId && (
                <div>
                  <p className="text-sm text-gray-500">Warehouse</p>
                  <p className="font-medium text-sm">{(order.warehouseId as any)?.name || 'N/A'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Order Notes */}
          <OrderNotes
            notes={notesText}
            editing={editingNotes}
            onEdit={() => setEditingNotes(true)}
            onSave={handleSaveNotes}
            onCancel={() => {
                      setEditingNotes(false);
                      setNotesText(order.notes || '');
                    }}
            onChange={setNotesText}
            saving={savingNotes}
          />

          {/* Status History */}
          <OrderStatusHistory statusHistory={order.statusHistory} />
        </div>
      </div>

      {/* Shipment Creation Modal */}
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

      {/* Payment Verification Modal */}
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

      {/* Update Email Modal */}
      <UpdateEmailModal
        isOpen={showUpdateEmailModal}
        onClose={() => {
          setShowUpdateEmailModal(false);
          setUpdateEmailSubject('');
          setUpdateEmailContent('');
        }}
        onSubmit={handleSendUpdateEmail}
        loading={sendingEmail === 'update'}
        subject={updateEmailSubject}
        content={updateEmailContent}
        onSubjectChange={setUpdateEmailSubject}
        onContentChange={setUpdateEmailContent}
      />
    </div>
  );
};

export default OrderDetail;
