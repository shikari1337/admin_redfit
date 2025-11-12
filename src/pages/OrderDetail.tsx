/**
 * OrderDetail Page
 * Comprehensive order detail view with notes, status history, discounts, and payment gateway data
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, shippingAPI } from '../services/api';
import { format } from 'date-fns';
import { FaTruck, FaWhatsapp, FaEdit, FaSave, FaTimes, FaCreditCard, FaImage, FaCheckCircle, FaClock, FaTimesCircle } from 'react-icons/fa';

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

  useEffect(() => {
    fetchOrder();
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

  const handleSendToShiprocket = async () => {
    if (!confirm('Send this order to Shiprocket for shipment creation?')) return;
    
    setSendingToShiprocket(true);
    try {
      const response = await shippingAPI.createShipment(id!);
      alert(`Shipment created successfully!${response.data?.shipment?.awbCode ? ` AWB: ${response.data.shipment.awbCode}` : ''}`);
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
          {(order.orderStatus === 'confirmed' || order.orderStatus === 'processing') && !order.shiprocketShipmentId && (
            <button
              onClick={handleSendToShiprocket}
              disabled={sendingToShiprocket}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaTruck size={16} />
              {sendingToShiprocket ? 'Sending...' : 'Send to Shiprocket'}
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
              {order.shiprocketAWB && (
                <div>
                  <p className="text-sm text-gray-500">AWB Code</p>
                  <p className="font-mono text-sm">{order.shiprocketAWB}</p>
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
    </div>
  );
};

export default OrderDetail;
