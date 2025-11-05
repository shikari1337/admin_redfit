import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCreditCard } from 'react-icons/fa';
import api from '../services/api';

const PaymentDiscountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razorpayDiscountPercent: 2,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        setFormData({ razorpayDiscountPercent: response.data.data.razorpayDiscountPercent || 2 });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      // Use default value if fetch fails
      setFormData({ razorpayDiscountPercent: 2 });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', formData);
      alert('Payment gateway discount settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Payment Gateway Discount</h1>
        <p className="text-sm text-gray-600 mt-2">Configure discount percentage for prepaid orders</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <FaCreditCard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Razorpay Discount</h2>
              <p className="text-sm text-gray-600">Percentage discount applied to prepaid orders</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discount Percentage <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                required
                min="0"
                max="100"
                step="0.1"
                value={formData.razorpayDiscountPercent}
                onChange={(e) => handleChange('razorpayDiscountPercent', e.target.value)}
                placeholder="2"
                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-gray-600 font-medium">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              This discount will be applied to prepaid orders (Razorpay payments). 
              The discount is calculated on the subtotal after quantity discounts.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This setting controls the discount percentage shown in the checkout page. 
              Make sure the backend also uses the same percentage for consistency.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
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

export default PaymentDiscountSettings;

