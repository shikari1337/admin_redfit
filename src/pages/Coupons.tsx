import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
  discountOn: 'all_products' | 'specific_products' | 'specific_categories';
  buyX?: number;
  getY?: number;
}

const Coupons: React.FC = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await couponsAPI.getAll();
      setCoupons(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch coupons');
      console.error('Error fetching coupons:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this coupon?')) {
      return;
    }

    try {
      await couponsAPI.delete(id);
      fetchCoupons();
    } catch (err: any) {
      alert(err.message || 'Failed to delete coupon');
      console.error('Error deleting coupon:', err);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      await couponsAPI.update(coupon._id, {
        ...coupon,
        isActive: !coupon.isActive,
      });
      fetchCoupons();
    } catch (err: any) {
      alert(err.message || 'Failed to update coupon');
      console.error('Error updating coupon:', err);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'percentage':
        return 'Percentage';
      case 'fixed_amount':
        return 'Fixed Amount';
      case 'buy_x_get_y':
        return 'Buy X Get Y';
      default:
        return type;
    }
  };

  const getTypeValue = (coupon: Coupon) => {
    if (coupon.type === 'b2g1') {
      return 'Buy 2 Get 1 Free';
    } else if (coupon.type === 'percentage') {
      return `${coupon.value || 0}%`;
    } else {
      return `₹${coupon.value || 0}`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading coupons...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Coupons</h1>
        <button
          onClick={() => navigate('/coupons/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <FaPlus /> Create Coupon
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Validity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No coupons found. Create your first coupon!
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => (
                <tr key={coupon._id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{coupon.code}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{getTypeLabel(coupon.type)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{getTypeValue(coupon)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {coupon.usedCount} / {coupon.usageLimit || '∞'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(coupon.validFrom).toLocaleDateString()}
                      {coupon.validUntil && (
                        <> - {new Date(coupon.validUntil).toLocaleDateString()}</>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleActive(coupon)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                        coupon.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {coupon.isActive ? (
                        <>
                          <FaCheckCircle /> Active
                        </>
                      ) : (
                        <>
                          <FaTimesCircle /> Inactive
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => navigate(`/coupons/${coupon._id}/edit`)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon._id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <FaTrash />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Coupons;

