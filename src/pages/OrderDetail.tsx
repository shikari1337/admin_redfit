/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, shippingAPI, paymentsAPI } from '../services/api';
import { format } from 'date-fns';
import { FaTruck, FaWhatsapp, FaEdit, FaSave, FaTimes, FaCreditCard, FaImage, FaCheckCircle, FaClock, FaTimesCircle, FaWarehouse } from 'react-icons/fa';

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
      await ordersAPI.updateStatus(id!, newStatus, statusNotes || undefined);
      setStatusNotes('');
      fetchOrder();
    } catch (error) {
      alert('Failed to update order status');
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
      const response = await shippingAPI.getWarehouses();
      if (response.data.success) {
        setWarehouses(response.data.data || []);
        // Auto-select first warehouse if available
        if (response.data.data && response.data.data.length > 0) {
          setSelectedWarehouseId(response.data.data[0]._id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  };

  const fetchShippingProviders = async () => {
    try {
      const response = await shippingAPI.getProviders();
      if (response.data.success && response.data.data && response.data.data.length > 0) {
        setShippingProviders(response.data.data);
        // Auto-select first provider
        const firstProvider = response.data.data[0];
        setSelectedShippingProvider(firstProvider.id || 'shiprocket');
      }
    } catch (error) {
      console.error('Failed to fetch shipping providers:', error);
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

  const handleCreateShipment = async () => {
    if (!selectedWarehouseId && selectedShippingProvider !== 'manual') {
      alert('Please select a warehouse');
      return;
    }

    if (selectedShippingProvider === 'manual') {
      if (!manualTrackingId) {
        alert('Please enter tracking ID for manual shipping');
        return;
      }
    }

    const providerName = selectedShippingProvider === 'shiprocket' ? 'Shiprocket' : 
                        selectedShippingProvider === 'delhivery' ? 'DELHIVERY' : 'Manual';
    
    if (!confirm(`Create shipment with ${providerName}?`)) return;
    
    setSendingToShiprocket(true);
    try {
      const response = await shippingAPI.createShipment(id!, {
        warehouseId: selectedWarehouseId || undefined,
        shippingProvider: selectedShippingProvider,
        trackingId: manualTrackingId || undefined,
        carrierName: manualCarrierName || undefined,
        trackingUrl: manualTrackingUrl || undefined,
      });
      
      const trackingId = response.data?.shipment?.awbCode || 
                        response.data?.shipment?.waybill || 
                        response.data?.shipment?.trackingId ||
                        response.data?.shipment?.trackingId ||
                        'N/A';
      
      alert(`Shipment created successfully!${trackingId !== 'N/A' ? ` Tracking ID: ${trackingId}` : ''}`);
      setShowShipmentModal(false);
      setManualTrackingId('');
      setManualCarrierName('');
      setManualTrackingUrl('');
      fetchOrder();
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      alert(error.response?.data?.message || 'Failed to create shipment. Please try again.');
    } finally {
      setSendingToShiprocket(false);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      processing: 'bg-purple-100 text-purple-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      returned: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getVerificationStatusIcon = (status?: string) => {
    switch (status) {
      case 'verified':
        return <FaCheckCircle className="text-green-500" />;
      case 'rejected':
        return <FaTimesCircle className="text-red-500" />;
      case 'pending':
      default:
        return <FaClock className="text-yellow-500" />;
    }
  };

  const getVerificationStatusText = (status?: string) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      case 'pending':
      default:
        return 'Pending Verification';
    }
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
        <div className="flex items-center gap-2">
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
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.items?.map((item: any, index: number) => (
                <div key={index} className="flex items-center space-x-4 border-b pb-4">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="w-20 h-20 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-medium">{item.productName}</h3>
                    <p className="text-sm text-gray-500">
                      Size: {item.size} | Qty: {item.quantity}
                    </p>
                    {item.variant && (
                      <p className="text-sm text-gray-500">
                        Color: {item.variant.colorName}
                      </p>
                    )}
                    {item.bundleApplied && (
                      <p className="text-sm text-blue-600 font-semibold">
                        Bundle: {item.bundleApplied.title}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
                    {item.originalPrice > item.price && (
                      <p className="text-sm text-gray-500 line-through">
                        ₹{(item.originalPrice * item.quantity).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{order.subtotal?.toLocaleString('en-IN')}</span>
              </div>
              {order.shipping > 0 && (
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>₹{order.shipping?.toLocaleString('en-IN')}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-₹{order.discount?.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span>
                <span>₹{order.total?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Discount Breakdown */}
          {discountBreakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Discounts Applied</h2>
              <div className="space-y-2">
                {discountBreakdown.map((discount: string, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                    <FaCheckCircle className="text-green-500" size={16} />
                    <span className="text-sm text-gray-700">{discount}</span>
                  </div>
                ))}
                {order.couponCode && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 rounded mt-2">
                    <span className="text-sm font-semibold text-blue-700">Coupon Code: {order.couponCode}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Gateway Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FaCreditCard />
              Payment Information
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="font-medium">{order.paymentMethod === 'cod' ? 'Cash on Delivery (COD)' : 'Prepaid'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Payment Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                    {order.paymentStatus}
                  </span>
                </div>
              </div>

              {order.paymentGateway && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-500 mb-2">Payment Gateway</p>
                  <p className="font-semibold text-lg mb-4">
                    {order.paymentGateway === 'razorpay' ? 'Razorpay' : 'UPI'}
                  </p>

                  {order.paymentGateway === 'razorpay' && (
                    <div className="space-y-3 bg-blue-50 p-4 rounded">
                      <div>
                        <p className="text-sm text-gray-600">Razorpay Order ID</p>
                        <p className="font-mono text-sm">{order.razorpayOrderId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Razorpay Payment ID</p>
                        <p className="font-mono text-sm">{order.razorpayPaymentId || 'N/A'}</p>
                      </div>
                      {order.razorpaySignature && (
                        <div>
                          <p className="text-sm text-gray-600">Payment Signature</p>
                          <p className="font-mono text-xs break-all">{order.razorpaySignature}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {order.paymentGateway === 'upi' && (
                    <div className="space-y-3 bg-purple-50 p-4 rounded">
                      <div>
                        <p className="text-sm text-gray-600">UPI Transaction ID</p>
                        <p className="font-mono text-sm">{order.upiPaymentId || 'Not provided'}</p>
                      </div>
                      {order.upiPaymentLink && (
                        <div>
                          <p className="text-sm text-gray-600">UPI Payment Link</p>
                          <a
                            href={order.upiPaymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm break-all"
                          >
                            {order.upiPaymentLink}
                          </a>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Verification Status</p>
                        <div className="flex items-center gap-2">
                          {getVerificationStatusIcon(order.upiVerificationStatus)}
                          <span className="font-medium">{getVerificationStatusText(order.upiVerificationStatus)}</span>
                        </div>
                      </div>
                      {order.upiPaymentScreenshot && (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Payment Screenshot</p>
                          <a
                            href={order.upiPaymentScreenshot}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                          >
                            <FaImage />
                            View Screenshot
                          </a>
                          <div className="mt-2">
                            <img
                              src={order.upiPaymentScreenshot}
                              alt="Payment screenshot"
                              className="max-w-xs rounded border border-gray-300"
                            />
                          </div>
                        </div>
                      )}
                      {order.upiVerificationNotes && (
                        <div>
                          <p className="text-sm text-gray-600">Verification Notes</p>
                          <p className="text-sm text-gray-700 bg-white p-2 rounded border">{order.upiVerificationNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Shipping Address</h2>
            <div className="space-y-2 text-gray-700">
              <p className="font-medium">{order.shippingAddress?.fullName}</p>
              <p>{order.shippingAddress?.address}</p>
              {order.shippingAddress?.addressLine2 && (
                <p>{order.shippingAddress.addressLine2}</p>
              )}
              <p>
                {order.shippingAddress?.district}, {order.shippingAddress?.state}{' '}
                {order.shippingAddress?.pincode}
              </p>
              <div className="flex items-center gap-2">
                <span>Phone:</span>
                <button
                  onClick={() => handleWhatsAppClick(order.shippingAddress?.mobileNumber || '')}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                  title="Open WhatsApp"
                >
                  <FaWhatsapp size={16} />
                  {order.shippingAddress?.mobileNumber}
                </button>
              </div>
              {order.shippingAddress?.email && (
                <p>Email: {order.shippingAddress.email}</p>
              )}
              {order.shippingAddress?.landmark && (
                <p className="text-sm text-gray-500">Landmark: {order.shippingAddress.landmark}</p>
              )}
            </div>
          </div>

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
                <span className={`inline-block px-2 py-1 rounded text-sm font-medium mt-1 ${getStatusColor(order.orderStatus)}`}>
                  {order.orderStatus}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-medium">{order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Status</p>
                <span className={`inline-block px-2 py-1 rounded text-sm font-medium mt-1 ${getPaymentStatusColor(order.paymentStatus)}`}>
                  {order.paymentStatus}
                </span>
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
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Order Notes</h2>
              {!editingNotes ? (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="text-blue-600 hover:text-blue-800"
                  title="Edit notes"
                >
                  <FaEdit size={16} />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="text-green-600 hover:text-green-800 disabled:opacity-50"
                    title="Save notes"
                  >
                    <FaSave size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingNotes(false);
                      setNotesText(order.notes || '');
                    }}
                    className="text-red-600 hover:text-red-800"
                    title="Cancel"
                  >
                    <FaTimes size={16} />
                  </button>
                </div>
              )}
            </div>
            {editingNotes ? (
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 min-h-32"
                placeholder="Add order notes..."
              />
            ) : (
              <div className="text-gray-700 min-h-32">
                {order.notes ? (
                  <p className="whitespace-pre-wrap">{order.notes}</p>
                ) : (
                  <p className="text-gray-400 italic">No notes added yet</p>
                )}
              </div>
            )}
          </div>

          {/* Status History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Status History</h2>
              <div className="space-y-3">
                {order.statusHistory
                  .slice()
                  .reverse()
                  .map((entry: any, index: number) => (
                    <div key={index} className="border-l-4 border-red-500 pl-4 pb-3">
                      <div className="flex items-center justify-between">
                        <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getStatusColor(entry.status)}`}>
                          {entry.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {format(new Date(entry.changedAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                      {entry.changedBy && (
                        <p className="text-xs text-gray-500 mt-1">
                          Changed by: {entry.changedBy.name || entry.changedBy.email || 'Admin'}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shipment Creation Modal */}
      {showShipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Shipment</h2>
              <button
                onClick={() => setShowShipmentModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Shipping Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping Provider *
                </label>
                <select
                  value={selectedShippingProvider}
                  onChange={(e) => {
                    setSelectedShippingProvider(e.target.value as any);
                    // Auto-select first warehouse if provider changes
                    if (warehouses.length > 0) {
                      setSelectedWarehouseId(warehouses[0]._id);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="manual">Manual</option>
                  {shippingProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse Selection */}
              {selectedShippingProvider !== 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Warehouse *
                  </label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehouses
                      .filter(w => {
                        if (selectedShippingProvider === 'shiprocket') {
                          return w.shippingProviders?.shiprocket?.enabled;
                        } else if (selectedShippingProvider === 'delhivery') {
                          return w.shippingProviders?.delhivery?.enabled;
                        }
                        return w.isActive;
                      })
                      .map((warehouse) => (
                        <option key={warehouse._id} value={warehouse._id}>
                          {warehouse.name} ({warehouse.code})
                          {selectedShippingProvider === 'delhivery' && warehouse.shippingProviders?.delhivery?.warehouseCode && 
                            ` - ${warehouse.shippingProviders.delhivery.warehouseCode}`
                          }
                        </option>
                      ))}
                  </select>
                  {selectedShippingProvider === 'delhivery' && warehouses.find(w => w._id === selectedWarehouseId)?.shippingProviders?.delhivery?.warehouseCode && (
                    <p className="text-xs text-gray-500 mt-1">
                      DELHIVERY Warehouse: {warehouses.find(w => w._id === selectedWarehouseId)?.shippingProviders?.delhivery?.warehouseCode}
                    </p>
                  )}
                </div>
              )}

              {/* Manual Shipping Fields */}
              {selectedShippingProvider === 'manual' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tracking ID *
                    </label>
                    <input
                      type="text"
                      value={manualTrackingId}
                      onChange={(e) => setManualTrackingId(e.target.value)}
                      placeholder="Enter tracking ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Carrier Name *
                    </label>
                    <input
                      type="text"
                      value={manualCarrierName}
                      onChange={(e) => setManualCarrierName(e.target.value)}
                      placeholder="Enter carrier name (e.g., Blue Dart, FedEx)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tracking URL *
                    </label>
                    <input
                      type="url"
                      value={manualTrackingUrl}
                      onChange={(e) => setManualTrackingUrl(e.target.value)}
                      placeholder="https://www.carrier.com/track/TRACKING_ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Full URL where users can track their shipment
                    </p>
                  </div>
                </>
              )}

            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowShipmentModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
              onClick={handleCreateShipment}
              disabled={sendingToShiprocket || (selectedShippingProvider !== 'manual' && !selectedWarehouseId) || (selectedShippingProvider === 'manual' && (!manualTrackingId || !manualCarrierName || !manualTrackingUrl))}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaTruck size={14} />
              {sendingToShiprocket ? 'Creating...' : 'Create Shipment'}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Verification Modal */}
      {showPaymentVerifyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Verify Payment</h2>
              <button
                onClick={() => {
                  setShowPaymentVerifyModal(false);
                  setRazorpayPaymentId('');
                  setUpiPaymentId('');
                  setPaymentVerificationNotes('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {order.paymentGateway === 'razorpay' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Razorpay Payment ID (Transaction ID) *
                  </label>
                  <input
                    type="text"
                    value={razorpayPaymentId}
                    onChange={(e) => setRazorpayPaymentId(e.target.value)}
                    placeholder="pay_xxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    System will verify with Razorpay API and check amount, order ID, and status.
                  </p>
                </div>
              )}

              {order.paymentGateway === 'upi' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      UPI Transaction ID *
                    </label>
                    <input
                      type="text"
                      value={upiPaymentId}
                      onChange={(e) => setUpiPaymentId(e.target.value)}
                      placeholder="UPI Transaction ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the UPI transaction ID from the payment screenshot or receipt.
                    </p>
                  </div>
                  {order.upiPaymentScreenshot && (
                    <div>
                      <p className="text-sm text-gray-700 mb-2">Payment Screenshot:</p>
                      <img
                        src={order.upiPaymentScreenshot}
                        alt="Payment screenshot"
                        className="max-w-full rounded border border-gray-300"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Verification Notes (Optional)
                    </label>
                    <textarea
                      value={paymentVerificationNotes}
                      onChange={(e) => setPaymentVerificationNotes(e.target.value)}
                      placeholder="Add any verification notes..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </>
              )}

              {order.paymentGateway === 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Notes *
                  </label>
                  <textarea
                    value={paymentVerificationNotes}
                    onChange={(e) => setPaymentVerificationNotes(e.target.value)}
                    placeholder="Enter payment verification details (e.g., Bank transfer reference, Cash received, etc.)"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentVerifyModal(false);
                  setRazorpayPaymentId('');
                  setUpiPaymentId('');
                  setPaymentVerificationNotes('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPayment}
                disabled={verifyingPayment || (order.paymentGateway === 'razorpay' && !razorpayPaymentId) || (order.paymentGateway === 'upi' && !upiPaymentId) || (order.paymentGateway === 'manual' && !paymentVerificationNotes)}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaCreditCard size={14} />
                {verifyingPayment ? 'Verifying...' : 'Verify Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetail;
