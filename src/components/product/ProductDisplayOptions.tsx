import React from 'react';

interface ProductDisplayOptionsProps {
  disableVariants: boolean;
  showOutOfStockVariants: boolean;
  showFeatures: boolean;
  isActive: boolean;
  onDisableVariantsChange: (value: boolean) => void;
  onShowOutOfStockVariantsChange: (value: boolean) => void;
  onShowFeaturesChange: (value: boolean) => void;
  onIsActiveChange: (value: boolean) => void;
}

const ProductDisplayOptions: React.FC<ProductDisplayOptionsProps> = ({
  disableVariants,
  showOutOfStockVariants,
  showFeatures,
  isActive,
  onDisableVariantsChange,
  onShowOutOfStockVariantsChange,
  onShowFeaturesChange,
  onIsActiveChange,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Display Options</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">Show Features Box</label>
            <p className="text-xs text-gray-500 mt-1">Display the features section on the product page</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showFeatures}
              onChange={(e) => onShowFeaturesChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">Disable Variants</label>
            <p className="text-xs text-gray-500 mt-1">Hide variant selection on the product page</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={disableVariants}
              onChange={(e) => onDisableVariantsChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">Show Out of Stock Variants</label>
            <p className="text-xs text-gray-500 mt-1">Display out of stock variants with swatches</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showOutOfStockVariants}
              onChange={(e) => onShowOutOfStockVariantsChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Product Status</label>
            <p className="text-xs text-gray-500 mt-1">Only active products will be visible to customers</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => onIsActiveChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default ProductDisplayOptions;

