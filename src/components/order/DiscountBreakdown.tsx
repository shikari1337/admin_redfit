import React from 'react';
import { FaCheckCircle } from 'react-icons/fa';

interface DiscountBreakdownProps {
  discounts: string[];
  couponCode?: string;
}

const DiscountBreakdown: React.FC<DiscountBreakdownProps> = ({ discounts, couponCode }) => {
  if (discounts.length === 0 && !couponCode) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Discounts Applied</h2>
      <div className="space-y-2">
        {discounts.map((discount, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded">
            <FaCheckCircle className="text-green-500" size={16} />
            <span className="text-sm text-gray-700">{discount}</span>
          </div>
        ))}
        {couponCode && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded mt-2">
            <span className="text-sm font-semibold text-blue-700">Coupon Code: {couponCode}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscountBreakdown;

