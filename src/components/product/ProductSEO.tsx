import React from 'react';
import { SeoFormState, SLUG_MAX_LENGTH, META_TITLE_LIMIT, META_DESCRIPTION_LIMIT } from '../../types/productForm';
import { slugifyValue } from '../../utils/slugify';

interface ProductSEOProps {
  sku: string;
  slug: string;
  seoData: SeoFormState;
  showAdvancedSeo: boolean;
  onSkuChange: (sku: string) => void;
  onSlugChange: (slug: string) => void;
  onSlugReset: () => void;
  onSeoDataChange: (data: SeoFormState) => void;
  onShowAdvancedSeoToggle: () => void;
  showSku?: boolean; // Optionally hide SKU field (e.g., when shown elsewhere)
  errors: {
    slug?: string;
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
  };
}

const ProductSEO: React.FC<ProductSEOProps> = ({
  sku,
  slug,
  seoData,
  showAdvancedSeo,
  onSkuChange,
  onSlugChange,
  onSlugReset,
  onSeoDataChange,
  onShowAdvancedSeoToggle,
  showSku = true,
  errors,
}) => {
  const updateSeoField = (field: keyof SeoFormState, value: string) => {
    onSeoDataChange({ ...seoData, [field]: value });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SEO Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Control the product URL slug and metadata used for search engines and social sharing.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowAdvancedSeoToggle}
          className="self-start md:self-center text-sm text-red-600 hover:text-red-700"
        >
          {showAdvancedSeo ? 'Hide advanced SEO fields' : 'Show advanced SEO fields'}
        </button>
      </div>

      <div className="space-y-5">
        {showSku && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base SKU</label>
            <input
              type="text"
              value={sku || ''}
              onChange={(e) => {
                const skuValue = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                onSkuChange(skuValue);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
              placeholder="Auto-generated from product name"
            />
            <p className="mt-1 text-xs text-gray-500">
              Base SKU for the product. Variant SKUs will be generated as: BASE-COLOR-SIZE. Leave empty for auto-generation.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Slug <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <input
              type="text"
              value={slug}
              maxLength={SLUG_MAX_LENGTH}
              onChange={(e) => {
                const sanitized = slugifyValue(e.target.value);
                onSlugChange(sanitized);
              }}
              className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                errors.slug ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., redfit-premium-tshirt"
            />
            <button
              type="button"
              onClick={onSlugReset}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Reset from name
            </button>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Lowercase letters, numbers, and hyphens only.</span>
            <span>
              {slug.length}/{SLUG_MAX_LENGTH}
            </span>
          </div>
          {errors.slug && <p className="mt-1 text-sm text-red-500">{errors.slug}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Meta Title</label>
          <input
            type="text"
            value={seoData.title}
            onChange={(e) => {
              const value = e.target.value.slice(0, META_TITLE_LIMIT);
              updateSeoField('title', value);
            }}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
              errors.metaTitle ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Meta title shown in search results"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Recommended up to {META_TITLE_LIMIT} characters.</span>
            <span>
              {seoData.title.length}/{META_TITLE_LIMIT}
            </span>
          </div>
          {errors.metaTitle && <p className="mt-1 text-sm text-red-500">{errors.metaTitle}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Meta Description</label>
          <textarea
            rows={3}
            value={seoData.description}
            onChange={(e) => {
              const value = e.target.value.slice(0, META_DESCRIPTION_LIMIT);
              updateSeoField('description', value);
            }}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
              errors.metaDescription ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Short summary that appears below the title in search results"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Recommended up to {META_DESCRIPTION_LIMIT} characters.</span>
            <span>
              {seoData.description.length}/{META_DESCRIPTION_LIMIT}
            </span>
          </div>
          {errors.metaDescription && <p className="mt-1 text-sm text-red-500">{errors.metaDescription}</p>}
        </div>

        {showAdvancedSeo && (
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Canonical URL</label>
                <input
                  type="url"
                  value={seoData.canonicalUrl}
                  onChange={(e) => updateSeoField('canonicalUrl', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    errors.canonicalUrl ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="https://redfit.in/products/redfit-premium-tshirt"
                />
                {errors.canonicalUrl && <p className="mt-1 text-sm text-red-500">{errors.canonicalUrl}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Meta Robots</label>
                <input
                  type="text"
                  value={seoData.metaRobots}
                  onChange={(e) => updateSeoField('metaRobots', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="index, follow"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional. Common values: `index, follow`, `noindex, follow`.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meta Keywords</label>
              <input
                type="text"
                value={seoData.keywords}
                onChange={(e) => updateSeoField('keywords', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="performance t-shirt, gym wear, redfit"
              />
              <p className="mt-1 text-xs text-gray-500">Comma-separated keywords (optional).</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Open Graph Title</label>
                <input
                  type="text"
                  value={seoData.ogTitle}
                  onChange={(e) => updateSeoField('ogTitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Title used when sharing on social platforms"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Open Graph Image URL</label>
                <input
                  type="text"
                  value={seoData.ogImage}
                  onChange={(e) => updateSeoField('ogImage', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="https://example.com/og-image.jpg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Open Graph Description</label>
              <textarea
                rows={2}
                value={seoData.ogDescription}
                onChange={(e) => updateSeoField('ogDescription', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Description shown when sharing on social platforms"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSEO;

