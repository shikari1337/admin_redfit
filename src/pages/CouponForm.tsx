import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { FaArrowLeft, FaSave } from 'react-icons/fa';

interface CouponFormData {
  code: string;
  type: 'percentage' | 'fixed' | 'b2g1';
  value?: number;
  description: string;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableProducts?: string[];
}

const CouponForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CouponFormData>({
    code: '',
    type: 'percentage',
    value: 0,
    description: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isActive: true,
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchCoupon();
    }
  }, [id, isEdit]);

  const fetchCoupon = async () => {
    try {
      setLoading(true);
      const coupon = await couponsAPI.getById(id!);
      
      // Convert dates to YYYY-MM-DD format
      const validFrom = coupon.validFrom ? new Date(coupon.validFrom).toISOString().split('T')[0] : '';
      const validUntil = coupon.validUntil ? new Date(coupon.validUntil).toISOString().split('T')[0] : '';

      setFormData({
        ...coupon,
        validFrom,
        validUntil: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applicableProducts: coupon.applicableProducts?.map((id: any) => id.toString()) || [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch coupon');
      console.error('Error fetching coupon:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);

      // Convert date strings to Date objects
      const submitData = {
        ...formData,
        validFrom: new Date(formData.validFrom).toISOString(),
        validUntil: new Date(formData.validUntil).toISOString(),
      };

      if (isEdit) {
        await couponsAPI.update(id!, submitData);
      } else {
        await couponsAPI.create(submitData);
      }

      navigate('/coupons');
    } catch (err: any) {
      setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} coupon`);
      console.error('Error saving coupon:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'value' || name === 'minPurchase' || name === 'maxDiscount' || name === 'usageLimit'
        ? (value ? parseFloat(value) : undefined)
        : name === 'isActive'
        ? (e.target as HTMLInputElement).checked
        : value,
    }));
  };

  if (loading && isEdit) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading coupon...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/coupons')}
          className="text-gray-600 hover:text-gray-800"
        >
          <FaArrowLeft />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {isEdit ? 'Edit Coupon' : 'Create Coupon'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Coupon Code *
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="B2G1"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Coupon Type *
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="percentage">Percentage Discount</option>
              <option value="fixed">Fixed Amount Discount</option>
              <option value="b2g1">Buy 2 Get 1 Free</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buy 2 Get 1 Free"
            />
          </div>

          {/* Value (for percentage/fixed) */}
          {formData.type !== 'b2g1' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {formData.type === 'percentage' ? 'Percentage (%)' : 'Discount Amount (₹)'}
                *
              </label>
              <input
                type="number"
                name="value"
                value={formData.value || ''}
                onChange={handleChange}
                required={formData.type !== 'b2g1' as const}
                min="0"
                step={formData.type === 'percentage' ? '1' : '0.01'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Min Purchase */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Purchase Amount (₹)
            </label>
            <input
              type="number"
              name="minPurchase"
              value={formData.minPurchase || ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Max Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Discount Amount (₹)
            </label>
            <input
              type="number"
              name="maxDiscount"
              value={formData.maxDiscount || ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Usage Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usage Limit
            </label>
            <input
              type="number"
              name="usageLimit"
              value={formData.usageLimit || ''}
              onChange={handleChange}
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Leave empty for unlimited"
            />
          </div>

          {/* Valid From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid From *
            </label>
            <input
              type="date"
              name="validFrom"
              value={formData.validFrom}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Valid Until */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid Until *
            </label>
            <input
              type="date"
              name="validUntil"
              value={formData.validUntil}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Is Active */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-700">
              Active
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/coupons')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <FaSave /> {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'} Coupon
          </button>
        </div>
      </form>
    </div>
  );
};

export default CouponForm;

