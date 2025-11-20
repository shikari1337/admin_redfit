import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, shippingAPI } from '../services/api';
import { format } from 'date-fns';
import { FaTruck, FaWhatsapp } from 'react-icons/fa';

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const [sendingToShiprocket, setSendingToShiprocket] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = statusFilter ? { status: statusFilter } : {};
      const response = await ordersAPI.getAll({ ...params, limit: 100 });
      // Handle different response structures
      const orders = Array.isArray(response?.data) 
        ? response.data 
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
            ? response
            : [];
      setOrders(orders);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      alert(error?.response?.data?.message || 'Failed to load orders. Please try again.');
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
      alert(`Shipment created successfully!${response.data?.shipment?.awbCode ? ` AWB: ${response.data.shipment.awbCode}` : ''}`);
      fetchOrders(); // Refresh orders to show updated status
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      alert(error.response?.data?.message || 'Failed to create shipment. Please try again.');
    } finally {
      setSendingToShiprocket(null);
    }
  };

  const handleWhatsAppClick = (phoneNumber: string) => {
    // Remove any non-digit characters and ensure it starts with country code
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
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Order ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Payment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {order.orderId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{order.shippingAddress?.fullName}</div>
                    <button
                      onClick={() => handleWhatsAppClick(order.shippingAddress?.mobileNumber || '')}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      title="Open WhatsApp"
                    >
                      <FaWhatsapp size={14} />
                      {order.shippingAddress?.mobileNumber}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₹{order.total?.toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        order.paymentStatus === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'} - {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                        order.orderStatus
                      )}`}
                    >
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.createdAt
                      ? format(new Date(order.createdAt), 'MMM dd, yyyy')
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {order.orderStatus === 'confirmed' || order.orderStatus === 'processing' ? (
                        <button
                          onClick={() => handleSendToShiprocket(order._id)}
                          disabled={sendingToShiprocket === order._id}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Send to Shiprocket"
                        >
                          <FaTruck size={12} />
                          {sendingToShiprocket === order._id ? 'Sending...' : 'Shiprocket'}
                        </button>
                      ) : null}
                      <Link
                        to={`/orders/${order._id}`}
                        className="text-red-600 hover:text-red-900"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Orders;

