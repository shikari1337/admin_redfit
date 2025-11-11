import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaEnvelope, FaFacebook, FaCreditCard, FaTruck, FaWhatsapp } from 'react-icons/fa';

import api from '../services/api';

const ApiIntegrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    smtp: {
      useEnvVars: false,
      host: '',
      port: 587,
      user: '',
      password: '',
      secure: false,
      requireTls: true,
      ignoreTls: false,
      fromEmail: '',
      adminEmail: '',
      isEnabled: false,
    },
    metaPixel: {
      useEnvVars: false,
      pixelId: '',
      accessToken: '',
      apiVersion: 'v18.0',
      isEnabled: false,
    },
    razorpay: {
      useEnvVars: false,
      keyId: '',
      keySecret: '',
      isEnabled: false,
    },
    shiprocket: {
      useEnvVars: false,
      email: '',
      password: '',
      apiUrl: 'https://apiv2.shiprocket.in',
      pickupPincode: '',
      pickupLocation: '',
      channelId: '',
      isEnabled: false,
    },
    whatsapp: {
      useEnvVars: false,
      accessToken: '',
      phoneNumberId: '',
      businessAccountId: '',
      apiVersion: 'v21.0',
      apiUrl: '',
      accountSid: '',
      authToken: '',
      fromNumber: '',
      isEnabled: false,
      useMetaApi: true,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        const settings = response.data.data;
        
        // SMTP settings (don't load password, only show if set)
        if (settings.smtp) {
          setFormData(prev => ({
            ...prev,
            smtp: {
              ...prev.smtp,
              useEnvVars: settings.smtp.useEnvVars || false,
              ...settings.smtp,
              password: settings.smtp.passwordSet ? '••••••••' : '',
            },
          }));
        }

        // Meta Pixel settings
        if (settings.metaPixel) {
          setFormData(prev => ({
            ...prev,
            metaPixel: {
              ...prev.metaPixel,
              useEnvVars: settings.metaPixel.useEnvVars || false,
              ...settings.metaPixel,
              accessToken: settings.metaPixel.accessTokenSet ? '••••••••' : '',
            },
          }));
        }

        // Razorpay settings
        if (settings.razorpay) {
          setFormData(prev => ({
            ...prev,
            razorpay: {
              ...prev.razorpay,
              useEnvVars: settings.razorpay.useEnvVars || false,
              keyId: settings.razorpay.keyIdSet ? '••••••••' : '',
              keySecret: settings.razorpay.keySecretSet ? '••••••••' : '',
              isEnabled: settings.razorpay.isEnabled || false,
            },
          }));
        }

        // Shiprocket settings
        if (settings.shiprocket) {
          setFormData(prev => ({
            ...prev,
            shiprocket: {
              ...prev.shiprocket,
              useEnvVars: settings.shiprocket.useEnvVars || false,
              ...settings.shiprocket,
              password: settings.shiprocket.passwordSet ? '••••••••' : '',
            },
          }));
        }

        // WhatsApp settings
        if (settings.whatsapp) {
          setFormData(prev => ({
            ...prev,
            whatsapp: {
              ...prev.whatsapp,
              useEnvVars: settings.whatsapp.useEnvVars || false,
              ...settings.whatsapp,
              accessToken: settings.whatsapp.accessTokenSet ? '••••••••' : '',
              authToken: settings.whatsapp.authTokenSet ? '••••••••' : '',
            },
          }));
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send password/token fields if they've been changed (not masked values)
      const submitData: any = {
        smtp: {
          ...formData.smtp,
          password: formData.smtp.password && !formData.smtp.password.startsWith('••••') ? formData.smtp.password : undefined,
        },
        metaPixel: {
          ...formData.metaPixel,
          accessToken: formData.metaPixel.accessToken && !formData.metaPixel.accessToken.startsWith('••••') ? formData.metaPixel.accessToken : undefined,
        },
        razorpay: {
          ...formData.razorpay,
          keyId: formData.razorpay.keyId && !formData.razorpay.keyId.startsWith('••••') ? formData.razorpay.keyId : undefined,
          keySecret: formData.razorpay.keySecret && !formData.razorpay.keySecret.startsWith('••••') ? formData.razorpay.keySecret : undefined,
        },
        shiprocket: {
          ...formData.shiprocket,
          password: formData.shiprocket.password && !formData.shiprocket.password.startsWith('••••') ? formData.shiprocket.password : undefined,
        },
        whatsapp: {
          ...formData.whatsapp,
          accessToken: formData.whatsapp.accessToken && !formData.whatsapp.accessToken.startsWith('••••') ? formData.whatsapp.accessToken : undefined,
          authToken: formData.whatsapp.authToken && !formData.whatsapp.authToken.startsWith('••••') ? formData.whatsapp.authToken : undefined,
        },
      };

      await api.put('/settings', submitData);
      alert('Settings saved successfully!');
      await fetchSettings(); // Reload to get updated masked values
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">API & Integration Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Configure third-party API integrations</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SMTP Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FaEnvelope className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">SMTP Email Configuration</h2>
                <p className="text-sm text-gray-600">Configure email sending via SMTP</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.smtp.useEnvVars}
                  onChange={(e) => handleChange('smtp', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.smtp.isEnabled}
                  onChange={(e) => handleChange('smtp', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.smtp.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> SMTP configuration will be read from .env file (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, etc.)
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.smtp.useEnvVars ? 'opacity-50' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label>
              <input
                type="text"
                value={formData.smtp.host}
                onChange={(e) => handleChange('smtp', 'host', e.target.value)}
                placeholder="smtp.gmail.com"
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label>
              <input
                type="number"
                value={formData.smtp.port}
                onChange={(e) => handleChange('smtp', 'port', parseInt(e.target.value))}
                placeholder="587"
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SMTP User</label>
              <input
                type="text"
                value={formData.smtp.user}
                onChange={(e) => handleChange('smtp', 'user', e.target.value)}
                placeholder="your-email@gmail.com"
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Password</label>
              <input
                type="password"
                value={formData.smtp.password}
                onChange={(e) => handleChange('smtp', 'password', e.target.value)}
                placeholder={formData.smtp.password.startsWith('••••') ? 'Leave blank to keep current' : 'Enter password'}
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Email</label>
              <input
                type="email"
                value={formData.smtp.fromEmail}
                onChange={(e) => handleChange('smtp', 'fromEmail', e.target.value)}
                placeholder="noreply@redfit.in"
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Admin Email</label>
              <input
                type="email"
                value={formData.smtp.adminEmail}
                onChange={(e) => handleChange('smtp', 'adminEmail', e.target.value)}
                placeholder="admin@redfit.in"
                disabled={formData.smtp.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className={`mt-4 flex gap-4 ${formData.smtp.useEnvVars ? 'opacity-50' : ''}`}>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.smtp.secure}
                onChange={(e) => handleChange('smtp', 'secure', e.target.checked)}
                disabled={formData.smtp.useEnvVars}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Use SSL/TLS (Port 465)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.smtp.requireTls}
                onChange={(e) => handleChange('smtp', 'requireTls', e.target.checked)}
                disabled={formData.smtp.useEnvVars}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Require TLS (Port 587)</span>
            </label>
          </div>
        </div>

        {/* Meta Pixel Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FaFacebook className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Meta Pixel (Facebook)</h2>
                <p className="text-sm text-gray-600">Configure Meta Conversion API tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.metaPixel.useEnvVars}
                  onChange={(e) => handleChange('metaPixel', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.metaPixel.isEnabled}
                  onChange={(e) => handleChange('metaPixel', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.metaPixel.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> Meta Pixel configuration will be read from .env file (META_PIXEL_ID, META_ACCESS_TOKEN, META_API_VERSION)
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.metaPixel.useEnvVars ? 'opacity-50' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pixel ID</label>
              <input
                type="text"
                value={formData.metaPixel.pixelId}
                onChange={(e) => handleChange('metaPixel', 'pixelId', e.target.value)}
                placeholder="123456789012345"
                disabled={formData.metaPixel.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Access Token</label>
              <input
                type="password"
                value={formData.metaPixel.accessToken}
                onChange={(e) => handleChange('metaPixel', 'accessToken', e.target.value)}
                placeholder={formData.metaPixel.accessToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter access token'}
                disabled={formData.metaPixel.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API Version</label>
              <input
                type="text"
                value={formData.metaPixel.apiVersion}
                onChange={(e) => handleChange('metaPixel', 'apiVersion', e.target.value)}
                placeholder="v18.0"
                disabled={formData.metaPixel.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Razorpay Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <FaCreditCard className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Razorpay Payment Gateway</h2>
                <p className="text-sm text-gray-600">Configure Razorpay payment keys</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.razorpay.useEnvVars}
                  onChange={(e) => handleChange('razorpay', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.razorpay.isEnabled}
                  onChange={(e) => handleChange('razorpay', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.razorpay.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> Razorpay configuration will be read from .env file (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.razorpay.useEnvVars ? 'opacity-50' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Key ID</label>
              <input
                type="text"
                value={formData.razorpay.keyId}
                onChange={(e) => handleChange('razorpay', 'keyId', e.target.value)}
                placeholder={formData.razorpay.keyId.startsWith('••••') ? 'Leave blank to keep current' : 'Enter Razorpay Key ID'}
                disabled={formData.razorpay.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Key Secret</label>
              <input
                type="password"
                value={formData.razorpay.keySecret}
                onChange={(e) => handleChange('razorpay', 'keySecret', e.target.value)}
                placeholder={formData.razorpay.keySecret.startsWith('••••') ? 'Leave blank to keep current' : 'Enter Razorpay Key Secret'}
                disabled={formData.razorpay.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Shiprocket Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FaTruck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Shiprocket Shipping</h2>
                <p className="text-sm text-gray-600">Configure Shiprocket shipping integration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.shiprocket.useEnvVars}
                  onChange={(e) => handleChange('shiprocket', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.shiprocket.isEnabled}
                  onChange={(e) => handleChange('shiprocket', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.shiprocket.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> Shiprocket configuration will be read from .env file (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, SHIPROCKET_API_URL, SHIPROCKET_PICKUP_PINCODE, SHIPROCKET_PICKUP_LOCATION). <strong>Note:</strong> Channel ID is not available in env vars, configure it here if needed.
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.shiprocket.useEnvVars ? 'opacity-50' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.shiprocket.email}
                onChange={(e) => handleChange('shiprocket', 'email', e.target.value)}
                placeholder="your-email@shiprocket.com"
                disabled={formData.shiprocket.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={formData.shiprocket.password}
                onChange={(e) => handleChange('shiprocket', 'password', e.target.value)}
                placeholder={formData.shiprocket.password.startsWith('••••') ? 'Leave blank to keep current' : 'Enter password'}
                disabled={formData.shiprocket.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
              <input
                type="text"
                value={formData.shiprocket.apiUrl}
                onChange={(e) => handleChange('shiprocket', 'apiUrl', e.target.value)}
                placeholder="https://apiv2.shiprocket.in"
                disabled={formData.shiprocket.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Channel ID</label>
              <input
                type="text"
                value={formData.shiprocket.channelId}
                onChange={(e) => handleChange('shiprocket', 'channelId', e.target.value)}
                placeholder="Enter Shiprocket Channel ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Channel ID from Shiprocket settings (configure even when using env vars)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Pincode</label>
              <input
                type="text"
                value={formData.shiprocket.pickupPincode}
                onChange={(e) => handleChange('shiprocket', 'pickupPincode', e.target.value)}
                placeholder="110001"
                disabled={formData.shiprocket.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Location</label>
              <input
                type="text"
                value={formData.shiprocket.pickupLocation}
                onChange={(e) => handleChange('shiprocket', 'pickupLocation', e.target.value)}
                placeholder="Default"
                disabled={formData.shiprocket.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* WhatsApp Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FaWhatsapp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">WhatsApp API</h2>
                <p className="text-sm text-gray-600">Configure WhatsApp messaging integration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.whatsapp.useEnvVars}
                  onChange={(e) => handleChange('whatsapp', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.whatsapp.isEnabled}
                  onChange={(e) => handleChange('whatsapp', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.whatsapp.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> WhatsApp configuration will be read from .env file (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID for Meta API, or WHATSAPP_API_URL, WHATSAPP_ACCOUNT_SID, WHATSAPP_AUTH_TOKEN, WHATSAPP_FROM_NUMBER for Twilio)
              </p>
            </div>
          )}

          <div className={`mb-4 ${formData.whatsapp.useEnvVars ? 'opacity-50' : ''}`}>
            <label className="flex items-center">
              <input
                type="radio"
                checked={formData.whatsapp.useMetaApi}
                onChange={() => handleChange('whatsapp', 'useMetaApi', true)}
                disabled={formData.whatsapp.useEnvVars}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Meta WhatsApp Business API (Recommended)</span>
            </label>
            <label className="flex items-center mt-2">
              <input
                type="radio"
                checked={!formData.whatsapp.useMetaApi}
                onChange={() => handleChange('whatsapp', 'useMetaApi', false)}
                disabled={formData.whatsapp.useEnvVars}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Twilio WhatsApp API</span>
            </label>
          </div>

          {formData.whatsapp.useMetaApi ? (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.whatsapp.useEnvVars ? 'opacity-50' : ''}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Access Token</label>
                <input
                  type="password"
                  value={formData.whatsapp.accessToken}
                  onChange={(e) => handleChange('whatsapp', 'accessToken', e.target.value)}
                  placeholder={formData.whatsapp.accessToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter access token'}
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number ID</label>
                <input
                  type="text"
                  value={formData.whatsapp.phoneNumberId}
                  onChange={(e) => handleChange('whatsapp', 'phoneNumberId', e.target.value)}
                  placeholder="Enter phone number ID"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Account ID</label>
                <input
                  type="text"
                  value={formData.whatsapp.businessAccountId}
                  onChange={(e) => handleChange('whatsapp', 'businessAccountId', e.target.value)}
                  placeholder="Enter business account ID"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Version</label>
                <input
                  type="text"
                  value={formData.whatsapp.apiVersion}
                  onChange={(e) => handleChange('whatsapp', 'apiVersion', e.target.value)}
                  placeholder="v21.0"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.whatsapp.useEnvVars ? 'opacity-50' : ''}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
                <input
                  type="text"
                  value={formData.whatsapp.apiUrl}
                  onChange={(e) => handleChange('whatsapp', 'apiUrl', e.target.value)}
                  placeholder="https://api.twilio.com/2010-04-01/Accounts"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account SID</label>
                <input
                  type="text"
                  value={formData.whatsapp.accountSid}
                  onChange={(e) => handleChange('whatsapp', 'accountSid', e.target.value)}
                  placeholder="Enter Twilio Account SID"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Auth Token</label>
                <input
                  type="password"
                  value={formData.whatsapp.authToken}
                  onChange={(e) => handleChange('whatsapp', 'authToken', e.target.value)}
                  placeholder={formData.whatsapp.authToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter auth token'}
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Number</label>
                <input
                  type="text"
                  value={formData.whatsapp.fromNumber}
                  onChange={(e) => handleChange('whatsapp', 'fromNumber', e.target.value)}
                  placeholder="whatsapp:+14155238886"
                  disabled={formData.whatsapp.useEnvVars}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2"
          >
            <FaSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApiIntegrationSettings;

