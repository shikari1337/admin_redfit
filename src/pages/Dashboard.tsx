import React, { useEffect, useState } from 'react';
import { ordersAPI, productsAPI } from '../services/api';
import { FaBox, FaShoppingCart, FaRupeeSign, FaUsers } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [productsRes, ordersRes] = await Promise.all([
          productsAPI.getAll(),
          ordersAPI.getAll({ limit: 1000 }),
        ]);

        // Handle different response structures
        const products = Array.isArray(productsRes?.data) 
          ? productsRes.data 
          : Array.isArray(productsRes?.data?.data) 
            ? productsRes.data.data 
            : Array.isArray(productsRes) 
              ? productsRes 
              : [];
        
        const orders = Array.isArray(ordersRes?.data) 
          ? ordersRes.data 
          : Array.isArray(ordersRes?.data?.data) 
            ? ordersRes.data.data 
            : Array.isArray(ordersRes) 
              ? ordersRes 
              : [];

        const revenue = orders.reduce((sum: number, order: any) => {
          const total = order.total || order.totalAmount || 0;
          const paymentStatus = order.paymentStatus || order.payment?.status || 'pending';
          return sum + (paymentStatus === 'completed' ? total : 0);
        }, 0);

        const pending = orders.filter((order: any) => {
          const status = order.orderStatus || order.status || 'pending';
          return status === 'pending' || status === 'confirmed';
        }).length;

        setStats({
          totalProducts: products.length,
          totalOrders: orders.length,
          totalRevenue: revenue,
          pendingOrders: pending,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        // Set default values on error to prevent crash
        setStats({
          totalProducts: 0,
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
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
      title: 'Total Products',
      value: stats.totalProducts,
      icon: FaBox,
      color: 'bg-blue-500',
    },
    {
      title: 'Total Orders',
      value: stats.totalOrders,
      icon: FaShoppingCart,
      color: 'bg-green-500',
    },
    {
      title: 'Total Revenue',
      value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`,
      icon: FaRupeeSign,
      color: 'bg-purple-500',
    },
    {
      title: 'Pending Orders',
      value: stats.pendingOrders,
      icon: FaUsers,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-full`}>
                  <Icon className="text-white text-2xl" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;

