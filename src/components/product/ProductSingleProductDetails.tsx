import React from 'react';

interface ProductSingleProductDetailsProps {
  sku: string;
  sizes: string[];
  stock: Record<string, number>;
  onSkuChange: (sku: string) => void;
  onStockChange: (stock: Record<string, number>) => void;
  errors: {
    sku?: string;
  };
}

const ProductSingleProductDetails: React.FC<ProductSingleProductDetailsProps> = ({
  sku,
  sizes,
  stock,
  onSkuChange,
  onStockChange,
  errors,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Details</h2>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SKU <span className="text-red-500">*</span>
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
            }`}
            placeholder="Enter product SKU"
          />
          <p className="mt-1 text-xs text-gray-500">
            Unique SKU identifier for this product. Leave empty for auto-generation.
          </p>
          {errors.sku && <p className="mt-1 text-sm text-red-500">{errors.sku}</p>}
        </div>

        {sizes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Stock Management
            </label>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 text-xs font-medium text-gray-600 mb-2 px-1">
                <div className="col-span-3">Size</div>
                <div className="col-span-9">Stock Quantity</div>
              </div>
              {sizes.map((size, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-3 text-sm font-medium text-gray-700 py-2">{size}</div>
                  <div className="col-span-9">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Enter stock quantity"
                      value={stock?.[size] ?? ''}
                      onChange={(e) => {
                        const stockValue = Math.max(0, parseInt(e.target.value) || 0);
                        onStockChange({
                          ...stock,
                          [size]: stockValue,
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Manage stock quantities for each size. To add or remove sizes, use the <strong>Variation Form</strong> below to create or modify product variants.
            </p>
          </div>
        )}

        {sizes.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> No sizes available. To add sizes, use the <strong>Variation Form</strong> below to create product variants with sizes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSingleProductDetails;

