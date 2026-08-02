import React from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { SeoFormState, SLUG_MAX_LENGTH, META_TITLE_LIMIT, META_DESCRIPTION_LIMIT } from '../../types/productForm';
import { slugifyValue } from '../../utils/slugify';
import ImageInputWithActions from '../common/ImageInputWithActions';
import { FieldGroup, Field, fieldInputCls, fieldTextareaCls, fieldInputErrorCls } from './FormField';

interface ProductSEOProps {
  sku: string;
  slug: string;
  seoData: SeoFormState;
  showAdvancedSeo: boolean;
  websiteUrl?: string; // Website URL from settings
  productId?: string; // Product ID for image generation
  productName?: string; // Product name for context
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
  websiteUrl,
  productId,
  productName,
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

  // Generate product URL
  const getProductUrl = (): string => {
    if (!slug) return '';
    const baseUrl = websiteUrl?.trim() || window.location.origin;
    const cleanBaseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    return `${cleanBaseUrl}/products/${slug}`;
  };

  const productUrl = getProductUrl();

  return (
    <div className="space-y-5">

      {/* ── Web address ──────────────────────────────────────────────────── */}
      <FieldGroup title="Web address" description="Where this product lives on your website.">
        <div className="space-y-5">
          {showSku && (
            <Field label="Base SKU" htmlFor="seoBaseSku"
              help="Base code for this product — variant SKUs build on it (BASE-COLOR-SIZE). Leave empty to auto-generate.">
              <input
                id="seoBaseSku"
                type="text"
                value={sku || ''}
                onChange={(e) => {
                  const skuValue = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                  onSkuChange(skuValue);
                }}
                className={`${fieldInputCls} font-mono`}
                placeholder="Auto-generated from product name"
              />
            </Field>
          )}

          <Field label="Product slug" htmlFor="seoSlug" required error={errors.slug}
            help="The web address part — lowercase letters, numbers and hyphens only."
            labelRight={<span className="text-xs text-gray-400">{slug.length}/{SLUG_MAX_LENGTH}</span>}>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <input
                id="seoSlug"
                type="text"
                value={slug}
                maxLength={SLUG_MAX_LENGTH}
                onChange={(e) => {
                  const sanitized = slugifyValue(e.target.value);
                  onSlugChange(sanitized);
                }}
                className={`flex-1 !w-auto ${errors.slug ? fieldInputErrorCls : fieldInputCls}`}
                placeholder="e.g., premium-tshirt"
              />
              <button
                type="button"
                onClick={onSlugReset}
                className="h-9 px-3 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Reset from name
              </button>
            </div>
          </Field>

          {/* Live Product Link */}
          {slug && (
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-[13px] font-medium text-gray-700 mb-1">Live product link</p>
              <div className="flex items-center gap-2">
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-blue-600 hover:text-blue-800 hover:underline truncate font-mono"
                  title={productUrl}
                >
                  {productUrl}
                </a>
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                  title="Open in new tab"
                >
                  <FaExternalLinkAlt className="w-4 h-4" />
                </a>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {websiteUrl ? 'Click to view the product on your website.' : 'Website URL not configured. Set it in Settings → General Settings.'}
              </p>
            </div>
          )}
        </div>
      </FieldGroup>

      {/* ── Search listing ───────────────────────────────────────────────── */}
      <FieldGroup title="Google listing"
        description="How this product looks in search results. Leave blank to auto-fill from the product name."
        actions={
          <button
            type="button"
            onClick={onShowAdvancedSeoToggle}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            {showAdvancedSeo ? 'Hide advanced fields' : 'Show advanced fields'}
          </button>
        }>
        <div className="space-y-5">
          <Field label="Meta title" htmlFor="seoMetaTitle" error={errors.metaTitle}
            help={`The clickable headline in Google — keep it under ${META_TITLE_LIMIT} characters.`}
            labelRight={<span className="text-xs text-gray-400">{seoData.title.length}/{META_TITLE_LIMIT}</span>}>
            <input
              id="seoMetaTitle"
              type="text"
              value={seoData.title}
              onChange={(e) => {
                const value = e.target.value.slice(0, META_TITLE_LIMIT);
                updateSeoField('title', value);
              }}
              className={errors.metaTitle ? fieldInputErrorCls : fieldInputCls}
              placeholder="Meta title shown in search results"
            />
          </Field>

          <Field label="Meta description" htmlFor="seoMetaDescription" error={errors.metaDescription}
            help={`The short blurb under the title in Google — up to ${META_DESCRIPTION_LIMIT} characters.`}
            labelRight={<span className="text-xs text-gray-400">{seoData.description.length}/{META_DESCRIPTION_LIMIT}</span>}>
            <textarea
              id="seoMetaDescription"
              rows={3}
              value={seoData.description}
              onChange={(e) => {
                const value = e.target.value.slice(0, META_DESCRIPTION_LIMIT);
                updateSeoField('description', value);
              }}
              className={errors.metaDescription ? `${fieldTextareaCls} !border-red-400` : fieldTextareaCls}
              placeholder="Short summary that appears below the title in search results"
            />
          </Field>

          {showAdvancedSeo && (
            <div className="space-y-5 border-t border-gray-100 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Canonical URL" htmlFor="seoCanonicalUrl" error={errors.canonicalUrl}
                  help="Only needed if this product also lives at another address.">
                  <input
                    id="seoCanonicalUrl"
                    type="url"
                    value={seoData.canonicalUrl}
                    onChange={(e) => updateSeoField('canonicalUrl', e.target.value)}
                    className={errors.canonicalUrl ? fieldInputErrorCls : fieldInputCls}
                    placeholder="https://yourstore.com/products/premium-tshirt"
                  />
                </Field>
                <Field label="Meta robots" htmlFor="seoMetaRobots"
                  help="Optional. Common values: `index, follow`, `noindex, follow`.">
                  <input
                    id="seoMetaRobots"
                    type="text"
                    value={seoData.metaRobots}
                    onChange={(e) => updateSeoField('metaRobots', e.target.value)}
                    className={fieldInputCls}
                    placeholder="index, follow"
                  />
                </Field>
              </div>

              <Field label="Meta keywords" htmlFor="seoMetaKeywords"
                help="Comma-separated keywords (optional — most search engines ignore these).">
                <input
                  id="seoMetaKeywords"
                  type="text"
                  value={seoData.keywords}
                  onChange={(e) => updateSeoField('keywords', e.target.value)}
                  className={fieldInputCls}
                  placeholder="performance t-shirt, gym wear, sportswear"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Social share title" htmlFor="seoOgTitle"
                  help="Title used when the link is shared on WhatsApp, Facebook etc.">
                  <input
                    id="seoOgTitle"
                    type="text"
                    value={seoData.ogTitle}
                    onChange={(e) => updateSeoField('ogTitle', e.target.value)}
                    className={fieldInputCls}
                    placeholder="Title used when sharing on social platforms"
                  />
                </Field>
                <ImageInputWithActions
                  value={seoData.ogImage || ''}
                  onChange={(url) => updateSeoField('ogImage', url)}
                  label="Social share image URL"
                  placeholder="https://example.com/og-image.jpg"
                  productId={productId}
                  sectionId="seo"
                  fieldPath="ogImage"
                  contextData={productName ? { productName } : undefined}
                />
              </div>

              <Field label="Social share description" htmlFor="seoOgDescription"
                help="Description shown under the title when the link is shared.">
                <textarea
                  id="seoOgDescription"
                  rows={2}
                  value={seoData.ogDescription}
                  onChange={(e) => updateSeoField('ogDescription', e.target.value)}
                  className={fieldTextareaCls}
                  placeholder="Description shown when sharing on social platforms"
                />
              </Field>
            </div>
          )}
        </div>
      </FieldGroup>
    </div>
  );
};

export default ProductSEO;
