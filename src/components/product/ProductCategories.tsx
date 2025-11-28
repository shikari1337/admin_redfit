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
  /**
   * CRITICAL FIX: Normalize category ID to string (defensive programming)
   * Handles buffer objects, ObjectId instances, and string IDs
   */
  const normalizeCategoryId = (id: any): string | null => {
    if (!id) return null;
    
    // Already a string ID
    if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
      return id;
    }
    
    // Buffer object (the problematic case)
    if (id && typeof id === 'object' && id.buffer) {
      try {
        let bufferArray: number[];
        if (Array.isArray(id.buffer)) {
          bufferArray = id.buffer;
        } else if (typeof id.buffer === 'object') {
          // Handle object with numeric keys like { "0": 105, "1": 36, ... }
          const keys = Object.keys(id.buffer).map(k => Number(k)).sort((a, b) => a - b);
          bufferArray = keys.map(k => Number(id.buffer[k]));
        } else {
          return null;
        }
        if (bufferArray.length === 12) {
          // Convert buffer to hex string (MongoDB ObjectId format)
          const hex = bufferArray.map(b => b.toString(16).padStart(2, '0')).join('');
          if (hex.length === 24 && /^[0-9a-fA-F]{24}$/.test(hex)) {
            return hex;
          }
        }
      } catch (error) {
        console.error('Failed to convert buffer to ObjectId:', error);
        return null;
      }
    }
    
    // Try to convert to string as last resort
    const str = String(id).trim();
    if (str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
      return str;
    }
    
    return null;
  };

  const toggleCategory = (categoryId: any) => {
    // CRITICAL FIX: Normalize category ID before using it
    const normalizedId = normalizeCategoryId(categoryId);
    if (!normalizedId) {
      console.error('Invalid category ID:', categoryId);
      return;
    }
    
    const exists = categories.includes(normalizedId);
    const newCategories = exists
      ? categories.filter((id) => id !== normalizedId)
      : [...categories, normalizedId];
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
          {availableCategories.map((category) => {
            // CRITICAL FIX: Normalize category ID to ensure it's always a string
            const categoryId = normalizeCategoryId(category._id);
            if (!categoryId) {
              console.warn('⚠️ Invalid category ID, skipping:', category);
              return null;
            }
            
            return (
              <label
                key={categoryId}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white hover:border-red-300 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="text-red-600 focus:ring-red-500 rounded"
                  checked={categories.includes(categoryId)}
                  onChange={() => toggleCategory(categoryId)}
                />
              <span className="text-sm text-gray-700">
                {category.name}
                {!category.isActive && (
                  <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                )}
              </span>
            </label>
            );
          })}
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

