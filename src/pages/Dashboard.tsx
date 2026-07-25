import React, { useEffect, useState } from 'react';
import { ordersAPI, productsAPI } from '../services/api';
import { analyticsAPI } from '../services/analyticsService';
import { FaBox, FaShoppingCart, FaRupeeSign, FaUsers, FaEye, FaUserClock } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    pageViews: 0,
    uniqueVisitors: 0,
    liveVisitors: 0,
  });
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [productsRes, ordersRes, analyticsRes] = await Promise.all([
          productsAPI.getAll(),
          ordersAPI.getAll({ limit: 1000 }),
          analyticsAPI.getDashboardStats(),
        ]);

        // Backend returns: { success: true, data: products[], count: number }
        // Handle different response structures
        let products: any[] = [];
        if (Array.isArray(productsRes)) {
          products = productsRes;
        } else if (Array.isArray(productsRes?.data)) {
          products = productsRes.data;
        } else if (Array.isArray(productsRes?.data?.data)) {
          products = productsRes.data.data;
        }

        // Backend returns: { success: true, data: orders[], pagination: {...} }
        let orders: any[] = [];
        if (Array.isArray(ordersRes)) {
          orders = ordersRes;
        } else if (ordersRes?.data && Array.isArray(ordersRes.data)) {
          orders = ordersRes.data;
        } else if (ordersRes?.success && ordersRes?.data && Array.isArray(ordersRes.data)) {
          orders = ordersRes.data;
        } else if (ordersRes?.data?.data && Array.isArray(ordersRes.data.data)) {
          orders = ordersRes.data.data;
        }

        const revenue = orders.reduce((sum: number, order: any) => {
          const total = Number(order.total ?? order.totalAmount ?? 0);
          // PG columns are snake_case (payment_status / order_status). Count paid orders,
          // plus delivered/completed COD orders whose payment lands on delivery.
          const paymentStatus = order.payment_status ?? order.paymentStatus ?? 'pending';
          const orderStatus = order.order_status ?? order.orderStatus ?? '';
          const isRealised = paymentStatus === 'completed' || ['delivered', 'completed'].includes(orderStatus);
          return sum + (isRealised ? total : 0);
        }, 0);

        const pending = orders.filter((order: any) => {
          const status = order.order_status ?? order.orderStatus ?? 'pending';
          return status === 'pending' || status === 'confirmed' || status === 'processing';
        }).length;

        // Real totals come from the paginated count metadata, not the page length.
        const totalOrders = (ordersRes as any)?.total ?? (ordersRes as any)?.pagination?.total ?? orders.length;
        const totalProducts = (productsRes as any)?.total ?? (productsRes as any)?.pagination?.total ?? products.length;

        // Analytics Data
        const analyticsData: any = analyticsRes?.data || analyticsRes || {};
        const pageViews = analyticsData.pageViews || 0;
        const uniqueVisitors = analyticsData.uniqueVisitors || 0;
        const liveVisitors = analyticsData.liveVisitors || 0;
        const topViewedProducts = analyticsData.topViewedProducts || [];

        setStats({
          totalProducts,
          totalOrders,
          totalRevenue: revenue,
          pendingOrders: pending,
          pageViews,
          uniqueVisitors,
          liveVisitors,
        });
        setTopViewed(topViewedProducts);

      } catch (error) {
        console.error('Failed to fetch stats:', error);
        // Set default values on error to prevent crash
        setStats({
          totalProducts: 0,
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
          pageViews: 0,
          uniqueVisitors: 0,
          liveVisitors: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading dashboard..." />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Revenue',
      value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`,
      icon: FaRupeeSign,
      color: 'bg-green-600',
    },
    {
      title: 'Total Orders',
      value: stats.totalOrders,
      icon: FaShoppingCart,
      color: 'bg-blue-500',
    },
    {
      title: 'Unique Visitors',
      value: stats.uniqueVisitors,
      icon: FaUsers,
      color: 'bg-purple-500',
    },
    {
      title: 'Page Views',
      value: stats.pageViews,
      icon: FaEye,
      color: 'bg-indigo-500',
    },
    {
      title: 'Live Now',
      value: stats.liveVisitors,
      icon: FaUserClock,
      color: 'bg-red-500',
    },
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: FaBox,
      color: 'bg-gray-500',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{stat.title}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-2 rounded-lg opacity-90`}>
                  <Icon className="text-white text-lg" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top Value Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Viewed Products */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Top Viewed Products</h3>
          {topViewed.length > 0 ? (
            <div className="space-y-4">
              {topViewed.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono text-sm w-4">#{idx + 1}</span>
                    <span className="text-gray-800 font-medium truncate max-w-xs">{item.name}</span>
                  </div>
                  <span className="text-indigo-600 font-semibold text-sm">{item.views} views</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic">No view data available yet.</p>
          )}
        </div>

        {/* Quick Actions (Placeholder for now) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors text-left">
              <span className="block text-sm font-semibold text-gray-700">Add Product</span>
              <span className="text-xs text-gray-500">Create a new listing</span>
            </button>
            <button className="p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors text-left">
              <span className="block text-sm font-semibold text-gray-700">View Orders</span>
              <span className="text-xs text-gray-500">Process pending orders</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

