import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCreditCard, FaPlus, FaTrash, FaPercent } from 'react-icons/fa';
import api from '../services/api';

interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

const PaymentDiscountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razorpayDiscountPercent: 2,
    quantityDiscounts: [] as QuantityDiscount[],
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        setFormData({
          razorpayDiscountPercent: response.data.data.razorpayDiscountPercent || 2,
          quantityDiscounts: response.data.data.quantityDiscounts || [
            { minQuantity: 5, discountPercent: 5 },
            { minQuantity: 10, discountPercent: 10 },
            { minQuantity: 20, discountPercent: 15 },
          ],
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      // Use default value if fetch fails
      setFormData({
        razorpayDiscountPercent: 2,
        quantityDiscounts: [
          { minQuantity: 5, discountPercent: 5 },
          { minQuantity: 10, discountPercent: 10 },
          { minQuantity: 20, discountPercent: 15 },
        ],
      });
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

        {/* Quantity Discounts Section */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FaPercent className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Quantity Discounts</h2>
              <p className="text-sm text-gray-600">Configure automatic discounts based on total quantity</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData({
                  ...formData,
                  quantityDiscounts: [
                    ...formData.quantityDiscounts,
                    { minQuantity: 1, discountPercent: 0 },
                  ],
                });
              }}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <FaPlus size={12} />
              Add Tier
            </button>
          </div>

          {formData.quantityDiscounts.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">No quantity discounts configured. Click "Add Tier" to add one.</p>
          ) : (
            <div className="space-y-4">
              {formData.quantityDiscounts.map((discount, index) => (
                <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Minimum Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={discount.minQuantity}
                        onChange={(e) => {
                          const newDiscounts = [...formData.quantityDiscounts];
                          newDiscounts[index].minQuantity = parseInt(e.target.value) || 1;
                          setFormData({ ...formData, quantityDiscounts: newDiscounts });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Discount Percentage
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={discount.discountPercent}
                          onChange={(e) => {
                            const newDiscounts = [...formData.quantityDiscounts];
                            newDiscounts[index].discountPercent = parseFloat(e.target.value) || 0;
                            setFormData({ ...formData, quantityDiscounts: newDiscounts });
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <span className="text-gray-600 font-medium">%</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newDiscounts = formData.quantityDiscounts.filter((_, i) => i !== index);
                      setFormData({ ...formData, quantityDiscounts: newDiscounts });
                    }}
                    className="text-red-600 hover:text-red-800 p-2"
                  >
                    <FaTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Discounts are applied based on total quantity in cart. 
              Higher quantity thresholds should have higher discount percentages. 
              The system will apply the highest applicable discount.
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

