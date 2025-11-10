import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';

interface ProductSizesStockProps {
  sizes: string[];
  stock: Record<string, number>;
  newSizeInput: string;
  onStockChange: (stock: Record<string, number>) => void;
  onNewSizeInputChange: (value: string) => void;
  onAddSize: () => void;
  onRemoveSize: (size: string) => void;
  errors: {
    sizes?: string;
  };
}

const ProductSizesStock: React.FC<ProductSizesStockProps> = ({
  sizes,
  stock,
  newSizeInput,
  onStockChange,
  onNewSizeInputChange,
  onAddSize,
  onRemoveSize,
  errors,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Sizes & Stock Management</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add Size <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSizeInput}
              onChange={(e) => {
                onNewSizeInputChange(e.target.value);
                if (errors.sizes) {
                  // Clear error when user types
                }
              }}
              className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                errors.sizes ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter size (e.g., S, M, L, XL)"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddSize();
                }
              }}
            />
            <button
              type="button"
              onClick={onAddSize}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
            >
              <FaPlus /> Add
            </button>
          </div>
          {errors.sizes && <p className="mt-1 text-sm text-red-500">{errors.sizes}</p>}
          <p className="mt-1 text-xs text-gray-500">Click the Add button or press Enter to add a new size</p>
        </div>

        {sizes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sizes & Stock</label>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600 mb-1 px-1">
                <div className="col-span-2">Size</div>
                <div className="col-span-7">Stock</div>
                <div className="col-span-3">Action</div>
              </div>
              {sizes.map((size, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-2 text-sm font-medium text-gray-700">{size}</div>
                  <div className="col-span-7">
                    <input
                      type="number"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Stock quantity"
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
                  <div className="col-span-3">
                    <button
                      type="button"
                      onClick={() => onRemoveSize(size)}
                      className="text-red-600 hover:text-red-800 flex items-center justify-center w-full py-2 border border-red-300 rounded-md hover:bg-red-50"
                      title="Remove size"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Set stock quantity for each size. Leave empty or 0 for out of stock.
            </p>
          </div>
        )}
        {sizes.length === 0 && (
          <p className="text-sm text-gray-500 italic">No sizes added yet. Add your first size above.</p>
        )}
      </div>
    </div>
  );
};

export default ProductSizesStock;

