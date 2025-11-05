import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, shippingAPI } from '../services/api';
import { format } from 'date-fns';
import { FaTruck, FaWhatsapp } from 'react-icons/fa';

const OrderDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sendingToShiprocket, setSendingToShiprocket] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const response = await ordersAPI.getById(id!);
      setOrder(response.data);
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
      await ordersAPI.updateStatus(id!, newStatus);
      fetchOrder();
    } catch (error) {
      alert('Failed to update order status');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendToShiprocket = async () => {
    if (!confirm('Send this order to Shiprocket for shipment creation?')) return;
    
    setSendingToShiprocket(true);
    try {
      const response = await shippingAPI.createShipment(id!);
      alert(`Shipment created successfully!${response.data?.shipment?.awbCode ? ` AWB: ${response.data.shipment.awbCode}` : ''}`);
      fetchOrder(); // Refresh order to show updated status
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      alert(error.response?.data?.message || 'Failed to create shipment. Please try again.');
    } finally {
      setSendingToShiprocket(false);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    // Remove any non-digit characters and ensure it starts with country code
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
  ];

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
              {sendingToShiprocket ? 'Sending to Shiprocket...' : 'Send to Shiprocket'}
            </button>
          )}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                  </div>
                  <div className="text-right">
                    <p className="font-medium">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{order.subtotal?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span>₹{order.shipping?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span>
                <span>₹{order.total?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Shipping Address</h2>
            <div className="space-y-2 text-gray-700">
              <p className="font-medium">{order.shippingAddress?.fullName}</p>
              <p>{order.shippingAddress?.address}</p>
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
              {order.shippingAddress?.landmark && (
                <p className="text-sm text-gray-500">Landmark: {order.shippingAddress.landmark}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Order Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Order Status</p>
                <p className="font-medium">{order.orderStatus}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-medium">{order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Status</p>
                <p className="font-medium">{order.paymentStatus}</p>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;

