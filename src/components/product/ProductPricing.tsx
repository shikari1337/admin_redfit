import React from 'react';

interface ProductPricingProps {
  price: string;
  originalPrice: string;
  sku: string;
  stock: number | undefined;
  showStock: boolean; // Only show stock for products without variants
  onPriceChange: (price: string) => void;
  onOriginalPriceChange: (price: string) => void;
  onSkuChange: (sku: string) => void;
  onStockChange: (stock: number | undefined) => void;
  errors: {
    price?: string;
    originalPrice?: string;
    sku?: string;
  };
}

const ProductPricing: React.FC<ProductPricingProps> = ({
  price,
  originalPrice,
  sku,
  stock,
  showStock,
  onPriceChange,
  onOriginalPriceChange,
  onSkuChange,
  onStockChange,
  errors,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Inventory</h2>
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
        
        <div className="border-t border-gray-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SKU {sku && <span className="text-xs font-normal text-gray-500">(from database)</span>}
            </label>
            <input
              type="text"
              value={sku || ''}
              onChange={(e) => {
                const skuValue = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                onSkuChange(skuValue);
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm ${
                errors.sku ? 'border-red-500' : 'border-gray-300'
              } ${sku ? 'bg-gray-50' : ''}`}
              placeholder="Auto-generated from product name"
            />
            <p className="mt-1 text-xs text-gray-500">
              {sku 
                ? 'Existing SKU from database. You can modify it if needed.'
                : 'Unique SKU identifier for this product. Leave empty for auto-generation.'}
            </p>
            {errors.sku && <p className="mt-1 text-sm text-red-500">{errors.sku}</p>}
          </div>
        </div>

        {showStock && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stock Quantity
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter stock quantity"
              value={stock ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || value === undefined) {
                  onStockChange(undefined);
                } else {
                  const stockValue = Math.max(0, parseInt(value) || 0);
                  onStockChange(stockValue);
                }
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Stock quantity for this product. For products with variants, stock is managed in the Variation Form below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductPricing;

