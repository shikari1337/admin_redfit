import React from 'react';

interface ProductPricingProps {
  price: string;
  originalPrice: string;
  onPriceChange: (price: string) => void;
  onOriginalPriceChange: (price: string) => void;
  errors: {
    price?: string;
    originalPrice?: string;
  };
}

const ProductPricing: React.FC<ProductPricingProps> = ({
  price,
  originalPrice,
  onPriceChange,
  onOriginalPriceChange,
  errors,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Price (₹) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            required
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
              errors.price ? 'border-red-500' : 'border-gray-300'
            }`}
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
          {errors.price && <p className="mt-1 text-sm text-red-500">{errors.price}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Original Price (₹) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            required
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
              errors.originalPrice ? 'border-red-500' : 'border-gray-300'
            }`}
            value={originalPrice}
            onChange={(e) => onOriginalPriceChange(e.target.value)}
          />
          {errors.originalPrice && <p className="mt-1 text-sm text-red-500">{errors.originalPrice}</p>}
        </div>
      </div>
    </div>
  );
};

export default ProductPricing;

