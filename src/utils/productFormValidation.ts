import {
  ProductFormData,
  SeoFormState,
  SLUG_MAX_LENGTH,
  META_TITLE_LIMIT,
  META_DESCRIPTION_LIMIT,
} from '../types/productForm';
import { slugifyValue } from './slugify';

export interface ValidationErrors {
  name?: string;
  price?: string;
  originalPrice?: string;
  images?: string;
  sizes?: string;
  categories?: string;
  sizeChart?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  [key: string]: string | undefined;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrors;
}

export const validateProductForm = (
  formData: ProductFormData,
  slug: string,
  seoData: SeoFormState,
  sizeChartMode: 'none' | 'reference' | 'custom',
  selectedSizeChartId: string
): ValidationResult => {
  const errors: ValidationErrors = {};

  // Name validation
  if (!formData.name.trim()) {
    errors.name = 'Product name is required';
  }

  // Price validation
  if (!formData.price || parseFloat(formData.price) <= 0) {
    errors.price = 'Valid price is required';
  }

  // Original price validation
  if (!formData.originalPrice || parseFloat(formData.originalPrice) <= 0) {
    errors.originalPrice = 'Valid original price is required';
  }

  // Price comparison
  if (
    formData.price &&
    formData.originalPrice &&
    parseFloat(formData.originalPrice) < parseFloat(formData.price)
  ) {
    errors.originalPrice = 'Original price must be greater than or equal to price';
  }

  // Images validation
  if (formData.images.length === 0) {
    errors.images = 'At least one image is required';
  }

  // Sizes or variants validation
  if (formData.sizes.length === 0 && formData.variants.length === 0) {
    errors.sizes = 'Add at least one size or variant';
  }

  // Categories validation
  if (formData.categories.length === 0) {
    errors.categories = 'Select at least one category';
  }

  // Size chart validation
  if (sizeChartMode === 'reference' && !selectedSizeChartId) {
    errors.sizeChart = 'Select a size chart';
  }

  if (sizeChartMode === 'custom') {
    const invalidEntry = formData.sizeChart.find((entry) => !entry.size.trim());
    if (invalidEntry) {
      errors.sizeChart = 'Each size chart entry must include a size value';
    }
  }

  // Slug validation
  const normalizedSlug = slugifyValue(slug);
  if (!normalizedSlug) {
    errors.slug = 'Product slug is required';
  } else if (normalizedSlug.length > SLUG_MAX_LENGTH) {
    errors.slug = `Slug must be ${SLUG_MAX_LENGTH} characters or fewer`;
  } else if (slug !== normalizedSlug) {
    errors.slug = 'Slug contains invalid characters';
  }

  // SEO validation
  const trimmedMetaTitle = seoData.title.trim();
  if (trimmedMetaTitle.length > META_TITLE_LIMIT) {
    errors.metaTitle = `Meta title must be ${META_TITLE_LIMIT} characters or fewer`;
  }

  const trimmedMetaDescription = seoData.description.trim();
  if (trimmedMetaDescription.length > META_DESCRIPTION_LIMIT) {
    errors.metaDescription = `Meta description must be ${META_DESCRIPTION_LIMIT} characters or fewer`;
  }

  if (
    seoData.canonicalUrl.trim() &&
    !/^https?:\/\//i.test(seoData.canonicalUrl.trim())
  ) {
    errors.canonicalUrl = 'Canonical URL must start with http:// or https://';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateVariantSizes = (variants: any[]): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  variants.forEach((variant, vIndex) => {
    variant.sizes.forEach((size: any, sIndex: number) => {
      if (!size.size || !size.size.trim()) {
        errors.push(`Variant ${vIndex + 1}, Size ${sIndex + 1}: Size value is required`);
      }
      if (!size.sku || !size.sku.trim()) {
        errors.push(`Variant ${vIndex + 1}, Size ${sIndex + 1}: SKU is required`);
      }
      if (size.stock < 0) {
        errors.push(`Variant ${vIndex + 1}, Size ${sIndex + 1}: Stock cannot be negative`);
      }
      if (size.price < 0) {
        errors.push(`Variant ${vIndex + 1}, Size ${sIndex + 1}: Price cannot be negative`);
      }
      if (size.originalPrice < 0) {
        errors.push(`Variant ${vIndex + 1}, Size ${sIndex + 1}: Original price cannot be negative`);
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

