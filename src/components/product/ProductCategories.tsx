import React from 'react';
import { CategoryOption } from '../../types/productForm';

interface ProductCategoriesProps {
  categories: string[];
  featuredCategory?: string;
  availableCategories: CategoryOption[];
  onCategoriesChange: (categories: string[]) => void;
  onFeaturedCategoryChange?: (categoryId: string | null) => void;
  onRefresh: () => void;
  loading: boolean;
  error?: string;
}

const ProductCategories: React.FC<ProductCategoriesProps> = ({
  categories,
  featuredCategory,
  availableCategories,
  onCategoriesChange,
  onFeaturedCategoryChange,
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

    // If removing the featured category, clear it
    if (exists && featuredCategory === normalizedId && onFeaturedCategoryChange) {
      onFeaturedCategoryChange(null);
    }

    onCategoriesChange(newCategories);
  };

  const toggleFeatured = (e: React.MouseEvent, categoryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onFeaturedCategoryChange) return;
    onFeaturedCategoryChange(featuredCategory === categoryId ? null : categoryId);
  };

  // Show only parent categories (no parent) at top, then sub-categories
  const parentCats = availableCategories.filter((c) => !c.parent);
  const childCats = availableCategories.filter((c) => c.parent);

  const renderCategory = (category: CategoryOption) => {
    const categoryId = normalizeCategoryId(category._id);
    if (!categoryId) {
      console.warn('⚠️ Invalid category ID, skipping:', category);
      return null;
    }
    const isChecked = categories.includes(categoryId);
    const isFeatured = featuredCategory === categoryId;

    return (
      <label
        key={categoryId}
        className={`flex items-center gap-2 px-3 py-2 border rounded-md bg-white hover:border-red-300 transition-colors cursor-pointer ${isFeatured ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}
      >
        <input
          type="checkbox"
          className="text-red-600 focus:ring-red-500 rounded"
          checked={isChecked}
          onChange={() => toggleCategory(categoryId)}
        />
        <span className="text-sm text-gray-700 flex-1">
          {category.name}
          {!category.isActive && (
            <span className="ml-2 text-xs text-gray-400">(inactive)</span>
          )}
        </span>
        {isChecked && onFeaturedCategoryChange && (
          <button
            type="button"
            title={isFeatured ? 'Remove featured' : 'Mark as featured category'}
            onClick={(e) => toggleFeatured(e, categoryId)}
            className={`text-base leading-none transition-colors ${isFeatured ? 'text-yellow-500 hover:text-gray-400' : 'text-gray-300 hover:text-yellow-400'}`}
          >
            ★
          </button>
        )}
      </label>
    );
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
        <div className="space-y-3">
          {parentCats.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Parent Categories</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parentCats.map(renderCategory)}
              </div>
            </div>
          )}
          {childCats.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Sub-Categories</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {childCats.map(renderCategory)}
              </div>
            </div>
          )}
        </div>
      )}
      {featuredCategory && (
        <p className="mt-2 text-xs text-yellow-700">
          ★ Featured category will be highlighted on the product listing page.
        </p>
      )}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">
        Assign the product to at least one category. Star a category to feature it.
      </p>
    </div>
  );
};

export default ProductCategories;
