import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaHome,
  FaBox,
  FaShoppingCart,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaQuestionCircle,
  FaStar,
  FaTicketAlt,
  FaCog,
  FaLayerGroup,
  FaRulerCombined,
  FaCubes,
  FaSms,
  FaUsers,
  FaImages,
} from 'react-icons/fa';
import { authAPI } from '../services/api';
import PageTransitionLoader from './PageTransitionLoader';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Call logout endpoint to invalidate session on server
      await authAPI.logout();
    } catch (error) {
      // Even if logout fails, clear local token
      console.warn('Logout request failed, clearing local token anyway:', error);
    } finally {
      // Always remove token from local storage
      localStorage.removeItem('admin_token');
      // Navigate to login page
      navigate('/login', { replace: true });
    }
  };

  const menuItems = [
    { path: '/dashboard', icon: FaHome, label: 'Dashboard' },
    {
      path: '/products',
      icon: FaBox,
      label: 'Products',
      children: [
        { path: '/products', label: 'All Products' },
        { path: '/products/bundles', label: 'Bundles', icon: FaCubes },
        { path: '/products/new', label: 'Create Product' },
      ],
    },
    { path: '/categories', icon: FaLayerGroup, label: 'Categories' },
    { path: '/gallery', icon: FaImages, label: 'Gallery' },
    { path: '/size-charts', icon: FaRulerCombined, label: 'Size Charts' },
    {
      path: '/orders',
      icon: FaShoppingCart,
      label: 'Orders',
      children: [
        { path: '/orders', label: 'All Orders' },
        { path: '/orders/abandoned-carts', label: 'Abandoned Carts', icon: FaSms },
      ],
    },
    { path: '/users', icon: FaUsers, label: 'Users' },
    { path: '/coupons', icon: FaTicketAlt, label: 'Coupons' },
    { path: '/reviews', icon: FaStar, label: 'Reviews' },
    { path: '/faqs', icon: FaQuestionCircle, label: 'FAQs' },
    { path: '/settings', icon: FaCog, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <PageTransitionLoader />
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:z-auto flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800 flex-shrink-0">
          <h1 className="text-xl font-bold text-red-500">Redfit Admin</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto mt-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

            if (!hasChildren) {
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-6 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors ${
                    isActive ? 'bg-gray-800 text-white border-r-2 border-red-500' : ''
                  }`}
                >
                  <Icon className="mr-3" size={18} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            }

            const childActive =
              item.children?.some((child) => location.pathname.startsWith(child.path)) ?? false;

            return (
              <div key={item.path} className="px-3">
                <div
                  className={`flex items-center px-3 py-3 text-gray-300 transition-colors ${
                    childActive ? 'bg-gray-800 text-white border-r-2 border-red-500 rounded-md' : ''
                  }`}
                >
                  <Icon className="mr-3" size={18} />
                  <span className="font-medium">{item.label}</span>
                </div>
                <div className="ml-8 mt-1 space-y-1">
                  {item.children?.map((child) => {
                    const isChildActive = location.pathname.startsWith(child.path);
                    return (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                          isChildActive
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        {child.icon && <child.icon className="mr-2" size={14} />}
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="border-t border-gray-800 p-4 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-gray-300 hover:bg-gray-800 hover:text-white rounded transition-colors"
          >
            <FaSignOutAlt className="mr-3" size={18} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900 transition-colors"
          >
            <FaBars size={20} />
          </button>
          <div className="flex items-center space-x-4 ml-auto">
            <span className="text-gray-600 font-medium">Admin Panel</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

