import React from 'react';
import { CategoryOption } from '../../types/productForm';

interface ProductCategoriesProps {
  categories: string[];
  availableCategories: CategoryOption[];
  onCategoriesChange: (categories: string[]) => void;
  onRefresh: () => void;
  loading: boolean;
  error?: string;
}

const ProductCategories: React.FC<ProductCategoriesProps> = ({
  categories,
  availableCategories,
  onCategoriesChange,
  onRefresh,
  loading,
  error,
}) => {
  const toggleCategory = (categoryId: string) => {
    const exists = categories.includes(categoryId);
    const newCategories = exists
      ? categories.filter((id) => id !== categoryId)
      : [...categories, categoryId];
    onCategoriesChange(newCategories);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Categories <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {availableCategories.length === 0 ? (
        <p className="text-sm text-gray-500">
          No categories available. Add categories from the Categories section.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {availableCategories.map((category) => (
            <label
              key={category._id}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white hover:border-red-300 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                className="text-red-600 focus:ring-red-500 rounded"
                checked={categories.includes(category._id)}
                onChange={() => toggleCategory(category._id)}
              />
              <span className="text-sm text-gray-700">
                {category.name}
                {!category.isActive && (
                  <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">
        Assign the product to at least one category for storefront navigation and filtering.
      </p>
    </div>
  );
};

export default ProductCategories;

