import React, { useState } from 'react';
import { CategoryOption } from '../../types/productForm';
import { filterBySearch, MIN_SEARCH_LENGTH } from '../../utils/search';

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
  // Accepts PostgreSQL UUIDs (36-char), legacy Mongo ObjectIds (24-hex), 32-hex,
  // objects with _id/id, and Mongo buffer objects. Returns null only for empties.
  const normalizeCategoryId = (id: any): string | null => {
    if (!id) return null;

    if (typeof id === 'string') {
      const t = id.trim();
      return t.length ? t : null;
    }

    if (typeof id === 'object') {
      if (id._id) return normalizeCategoryId(id._id);
      if (id.id) return normalizeCategoryId(id.id);
      // Mongo buffer object { "0": 105, ... }
      if (id.buffer) {
        try {
          const keys = Object.keys(id.buffer).map(Number).sort((a, b) => a - b);
          const arr = keys.map(k => Number(id.buffer[k]));
          if (arr.length === 12) {
            const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
            if (/^[0-9a-fA-F]{24}$/.test(hex)) return hex;
          }
        } catch { return null; }
      }
    }

    const str = String(id).trim();
    return str && str !== '[object Object]' ? str : null;
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

  const [search, setSearch] = useState('');

  // Selected categories are always shown; results are capped at 10 with 3-letter search.
  const selectedSet = new Set(categories.map((c) => normalizeCategoryId(c)).filter(Boolean) as string[]);
  const selectedCats = availableCategories.filter((c) => selectedSet.has(normalizeCategoryId(c._id) || ''));
  const results = filterBySearch(
    availableCategories.filter((c) => !selectedSet.has(normalizeCategoryId(c._id) || '')),
    search, ['name', 'slug'] as any, { limit: 10 }
  );

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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${availableCategories.length} categories (min ${MIN_SEARCH_LENGTH} letters)…`}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          {selectedCats.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Selected</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedCats.map(renderCategory)}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">
              {search.trim().length >= MIN_SEARCH_LENGTH ? `Results (max 10)` : `Suggestions (top 10 — search for more)`}
            </p>
            {results.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.map(renderCategory)}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No matches.</p>
            )}
          </div>
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
