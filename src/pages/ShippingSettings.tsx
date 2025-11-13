import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaTruck, FaWarehouse } from 'react-icons/fa';
import api from '../services/api';

const ShippingSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
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
    delhivery: {
      useEnvVars: false,
      apiToken: '',
      apiUrl: 'https://staging-express.delhivery.com/api',
      isEnabled: false,
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

        // DELHIVERY settings
        if (settings.delhivery) {
          setFormData(prev => ({
            ...prev,
            delhivery: {
              ...prev.delhivery,
              useEnvVars: settings.delhivery.useEnvVars || false,
              ...settings.delhivery,
              apiToken: settings.delhivery.apiTokenSet ? '••••••••' : '',
            },
          }));
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load shipping settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const submitData: any = {
        shiprocket: {
          ...formData.shiprocket,
          password: formData.shiprocket.password && !formData.shiprocket.password.startsWith('••••') ? formData.shiprocket.password : undefined,
        },
        delhivery: {
          ...formData.delhivery,
          apiToken: formData.delhivery.apiToken && !formData.delhivery.apiToken.startsWith('••••') ? formData.delhivery.apiToken : undefined,
        },
      };

      await api.put('/settings', submitData);
      alert('Shipping settings saved successfully!');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save shipping settings');
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Shipping Settings</h1>
            <p className="text-sm text-gray-600 mt-2">Configure shipping providers and manage warehouses</p>
          </div>
          <button
            onClick={() => navigate('/warehouses')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <FaWarehouse className="w-4 h-4" />
            Manage Warehouses
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
              <p className="text-xs text-gray-500 mt-1">Default pickup pincode (can be overridden by warehouse configuration)</p>
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
              <p className="text-xs text-gray-500 mt-1">Default pickup location name (can be overridden by warehouse configuration)</p>
            </div>
          </div>
        </div>

        {/* DELHIVERY Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <FaTruck className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">DELHIVERY Shipping</h2>
                <p className="text-sm text-gray-600">Configure DELHIVERY shipping integration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.delhivery.useEnvVars}
                  onChange={(e) => handleChange('delhivery', 'useEnvVars', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Use Env Vars</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.delhivery.isEnabled}
                  onChange={(e) => handleChange('delhivery', 'isEnabled', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          </div>

          {formData.delhivery.useEnvVars && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Using Environment Variables:</strong> DELHIVERY configuration will be read from .env file (DELHIVERY_API_TOKEN, DELHIVERY_API_URL)
              </p>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.delhivery.useEnvVars ? 'opacity-50' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API Token</label>
              <input
                type="password"
                value={formData.delhivery.apiToken}
                onChange={(e) => handleChange('delhivery', 'apiToken', e.target.value)}
                placeholder={formData.delhivery.apiToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter DELHIVERY API Token'}
                disabled={formData.delhivery.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your API token from <a href="https://delhivery.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">DELHIVERY Dashboard</a> → Settings → API Setup
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
              <input
                type="text"
                value={formData.delhivery.apiUrl}
                onChange={(e) => handleChange('delhivery', 'apiUrl', e.target.value)}
                placeholder="https://staging-express.delhivery.com/api"
                disabled={formData.delhivery.useEnvVars}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Production: https://track.delhivery.com/api, Staging: https://staging-express.delhivery.com/api</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Warehouse configuration is managed separately in the <strong>Warehouses</strong> section. Each warehouse must have a DELHIVERY warehouse code (warehouse name as registered with DELHIVERY) configured.
            </p>
          </div>
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

export default ShippingSettings;

