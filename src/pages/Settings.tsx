import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPhone, FaCreditCard, FaArrowLeft, FaSms, FaGlobe, FaCog } from 'react-icons/fa';

const Settings: React.FC = () => {
  const navigate = useNavigate();

  const settingsItems = [
    {
      title: 'General Settings',
      description: 'Configure website URL, logo, and color scheme',
      icon: FaGlobe,
      path: '/settings/general',
    },
    {
      title: 'API & Integrations',
      description: 'Configure SMTP, Meta Pixel, Razorpay, and WhatsApp',
      icon: FaCog,
      path: '/settings/api-integrations',
    },
    {
      title: 'Shipping Settings',
      description: 'Configure shipping providers (Shiprocket, DELHIVERY) and manage warehouses',
      icon: FaCog,
      path: '/settings/shipping',
    },
    {
      title: 'Contact Details',
      description: 'Manage phone number, WhatsApp, and email for contact page',
      icon: FaPhone,
      path: '/settings/contact',
    },
    {
      title: 'Payment Gateway Discount',
      description: 'Configure payment gateway based discount percentage',
      icon: FaCreditCard,
      path: '/settings/payment-discount',
    },
    {
      title: 'Payment Gateways',
      description: 'Configure and enable/disable payment gateways (Razorpay, UPI)',
      icon: FaCreditCard,
      path: '/settings/payment-gateways',
    },
    {
      title: 'SMS Templates',
      description: 'Configure SMSAlert templates for orders and cart recovery',
      icon: FaSms,
      path: '/settings/sms-templates',
    },
    {
      title: 'GST Settings',
      description: 'Configure GST tax brackets and store details',
      icon: FaCog,
      path: '/settings/gst',
    },
    {
      title: 'Warehouses',
      description: 'Manage warehouse locations and shipping provider configurations',
      icon: FaCog,
      path: '/warehouses',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Manage application settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-red-500 hover:shadow-md transition-all text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
                <FaArrowLeft className="w-5 h-5 text-gray-400 rotate-180" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Settings;

