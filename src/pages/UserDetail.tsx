import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersAPI } from '../services/api';
import { format } from 'date-fns';
import {
  FaUser,
  FaEnvelope,
  FaPhone,
  FaShoppingCart,
  FaMapMarkerAlt,
  FaKey,
  FaEye,
  FaEyeSlash,
  FaArrowLeft,
  FaBox,
} from 'react-icons/fa';

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [browsedProducts, setBrowsedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'browsed' | 'password'>(
    'orders'
  );
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchUserDetails();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'orders') {
      fetchOrders();
    } else if (id && activeTab === 'addresses') {
      fetchAddresses();
    } else if (id && activeTab === 'browsed') {
      fetchBrowsedProducts();
    }
  }, [id, activeTab]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getById(id!);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await usersAPI.getOrders(id!, { limit: 50 });
      setOrders(response.data || []);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchAddresses = async () => {
    try {
      const response = await usersAPI.getAddresses(id!);
      setAddresses(response.data || []);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
    }
  };

  const fetchBrowsedProducts = async () => {
    try {
      const response = await usersAPI.getBrowsedProducts(id!);
      setBrowsedProducts(response.data || []);
    } catch (error) {
      console.error('Failed to fetch browsed products:', error);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (!confirm('Are you sure you want to reset this user\'s password?')) {
      return;
    }

    try {
      setResetting(true);
      await usersAPI.resetPassword(id!, newPassword);
      alert('Password reset successfully!');
      setNewPassword('');
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      alert(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
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

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">User not found</p>
        <Link to="/users" className="text-red-600 hover:text-red-900 mt-4 inline-block">
          Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft size={14} />
          Back to Users
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">User Details</h1>
      </div>

      {/* User Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center">
              <FaUser className="text-gray-600 text-2xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{user.displayName || user.name || 'No name'}</h2>
              <div className="mt-2 space-y-1">
                {user.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <FaEnvelope size={14} />
                    {user.email}
                  </div>
                )}
                {user.phoneNumber && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <FaPhone size={14} />
                    {user.phoneNumber}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                user.role === 'admin'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {user.role}
            </span>
            <div className="mt-2">
              <span
                className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                  user.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
          <div>Created: {user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}</div>
          {user.lastLogin && (
            <div>Last Login: {format(new Date(user.lastLogin), 'MMM dd, yyyy HH:mm')}</div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'orders'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FaShoppingCart className="inline mr-2" />
              Orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'addresses'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FaMapMarkerAlt className="inline mr-2" />
              Saved Addresses ({addresses.length})
            </button>
            <button
              onClick={() => setActiveTab('browsed')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'browsed'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FaBox className="inline mr-2" />
              Browsed Products ({browsedProducts.length})
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'password'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FaKey className="inline mr-2" />
              Password Reset
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div>
              {orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No orders found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Order ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {orders.map((order) => (
                        <tr key={order._id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {order.orderId}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            ₹{order.total?.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                                order.orderStatus
                              )}`}
                            >
                              {order.orderStatus}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {order.createdAt
                              ? format(new Date(order.createdAt), 'MMM dd, yyyy')
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Link
                              to={`/orders/${order._id}`}
                              className="text-red-600 hover:text-red-900"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === 'addresses' && (
            <div>
              {addresses.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No saved addresses found</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <div
                      key={address._id}
                      className={`border rounded-lg p-4 ${
                        address.isDefault ? 'border-red-500 bg-red-50' : 'border-gray-200'
                      }`}
                    >
                      {address.isDefault && (
                        <span className="inline-block mb-2 px-2 py-1 text-xs font-semibold bg-red-500 text-white rounded">
                          Default
                        </span>
                      )}
                      <div className="font-semibold text-gray-900 mb-2">{address.fullName}</div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>{address.address}</div>
                        {address.addressLine2 && <div>{address.addressLine2}</div>}
                        <div>
                          {address.district && `${address.district}, `}
                          {address.state} - {address.pincode}
                        </div>
                        <div className="mt-2">
                          <span className="font-medium">Phone:</span> {address.mobileNumber}
                        </div>
                        {address.email && (
                          <div>
                            <span className="font-medium">Email:</span> {address.email}
                          </div>
                        )}
                        {address.label && (
                          <div className="mt-2">
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                              {address.label === 'other' && address.customLabel
                                ? address.customLabel
                                : address.label}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Browsed Products Tab */}
          {activeTab === 'browsed' && (
            <div>
              {browsedProducts.length === 0 ? (
                <div className="text-center py-8">
                  <FaBox className="mx-auto text-gray-400 text-4xl mb-4" />
                  <p className="text-gray-500">
                    Browsed products tracking is not currently implemented in the database.
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Product views are tracked via analytics services but not stored in the database.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {browsedProducts.map((product) => (
                    <div key={product._id} className="border border-gray-200 rounded-lg p-4">
                      {/* Product display would go here */}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Password Reset Tab */}
          {activeTab === 'password' && (
            <div className="max-w-md">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Password must be at least 6 characters long
                </p>
              </div>
              <button
                onClick={handleResetPassword}
                disabled={!newPassword || newPassword.length < 6 || resetting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetail;

