# ProductForm Refactoring Guide

## Overview
The ProductForm component has been refactored into smaller, reusable components to improve maintainability and code organization.

## New Component Structure

### 1. Types & Utilities
- `admin/src/types/productForm.ts` - All shared interfaces and types
- `admin/src/utils/slugify.ts` - Utility functions

### 2. Product Components
- `admin/src/components/product/ProductBasicInfo.tsx` - Name, description, images
- `admin/src/components/product/ProductPricing.tsx` - Price fields
- `admin/src/components/product/ProductSizesStock.tsx` - Size & stock management (non-variant products)
- `admin/src/components/product/ProductCategories.tsx` - Category selection
- `admin/src/components/product/ProductImageUpload.tsx` - Reusable image upload component
- `admin/src/components/product/index.ts` - Component exports

## Integration Steps

### Step 1: Update Imports
Replace the inline component code with imports from the new components.

### Step 2: Update ProductForm
Use the new components in the main form:

```tsx
import { ProductBasicInfo, ProductPricing, ProductSizesStock, ProductCategories } from '../components/product';
import { ProductFormData, SeoFormState } from '../types/productForm';
import { slugifyValue } from '../utils/slugify';
```

### Step 3: Replace Sections
Replace the corresponding JSX sections with the new components, passing the required props.

## Remaining Components to Create

1. **ProductSEO** - SEO settings (slug, meta tags, OG tags)
2. **ProductSizeChart** - Size chart management
3. **ProductVariants** - Variant management (Shopify + Legacy) - Most complex
4. **ProductVideos** - Video uploads
5. **ProductWashCare** - Wash care instructions
6. **ProductCustomerImages** - Customer order images

## Benefits

1. **Maintainability** - Each component has a single responsibility
2. **Reusability** - Components can be used in other forms
3. **Testability** - Smaller components are easier to test
4. **Readability** - Main form is cleaner and easier to understand
5. **Performance** - Smaller components can be optimized independently

## Next Steps

1. Create remaining components following the same pattern
2. Extract variant management logic into a custom hook (`useProductVariants`)
3. Create form validation utilities
4. Add unit tests for each component

