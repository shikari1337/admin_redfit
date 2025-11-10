# ProductForm Component Integration Guide

## Integration Tasks

All integration tasks have been completed! The following sections in `admin/src/pages/ProductForm.tsx` have been replaced with the new components:

### 1. Videos Section (lines ~1642-1735)
**Replace with:** `<ProductVideos />`
- Props needed:
  - `videos={formData.videos}`
  - `newVideos={newVideos}`
  - `uploading={uploadingVideo}`
  - `onVideosChange={(videos) => setFormData({ ...formData, videos })}`
  - `onNewVideosChange={setNewVideos}`
  - `onVideoUpload={handleVideoUpload}`
  - `onAddVideoUrl={addVideoUrl}`
  - `onRemoveVideo={removeVideo}`

### 2. Size Chart Section (lines ~2381-2670)
**Replace with:** `<ProductSizeChart />`
- Props needed:
  - `mode={sizeChartMode}`
  - `selectedSizeChartId={selectedSizeChartId}`
  - `sizeChart={formData.sizeChart}`
  - `availableSizeCharts={availableSizeCharts}`
  - `selectedSizeChart={selectedSizeChart}`
  - `onModeChange={handleSizeChartModeChange}`
  - `onSelectedSizeChartIdChange={handleSelectSizeChartId}`
  - `onSizeChartChange={(entries) => setFormData({ ...formData, sizeChart: entries })}`
  - `onRefresh={loadLookups}`
  - `loading={lookupsLoading}`
  - `error={errors.sizeChart}`

### 3. Wash Care Section (lines ~2672-2751)
**Replace with:** `<ProductWashCare />`
- Props needed:
  - `instructions={formData.washCareInstructions}`
  - `onInstructionsChange={(instructions) => setFormData({ ...formData, washCareInstructions: instructions })}`

### 4. Customer Order Images Section (lines ~2753-2828)
**Replace with:** `<ProductCustomerImages />`
- Props needed:
  - `images={formData.customerOrderImages}`
  - `onImagesChange={(images) => setFormData({ ...formData, customerOrderImages: images })}`
  - `onUpload={handleCustomerOrderImagesUpload}` (needs to be created)
  - `uploading={uploading}`
  - `error={errors.customerOrderImages}`

**Required handler:**
```typescript
const handleCustomerOrderImagesUpload = async (files: FileList) => {
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    alert('Please select image files');
    return;
  }

  setUploading(true);
  try {
    const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
    const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
    setFormData({
      ...formData,
      customerOrderImages: [...formData.customerOrderImages, ...uploadedUrls],
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    alert(error.response?.data?.message || 'Failed to upload images');
  } finally {
    setUploading(false);
  }
};
```

### 5. Display Options Section (lines ~2850-2891)
**Replace with:** `<ProductDisplayOptions />`
- Props needed:
  - `disableVariants={formData.disableVariants}`
  - `showOutOfStockVariants={formData.showOutOfStockVariants}`
  - `showFeatures={formData.showFeatures}`
  - `isActive={formData.isActive}` (optional, if Status should be merged)
  - `onDisableVariantsChange={(value) => setFormData({ ...formData, disableVariants: value })}`
  - `onShowOutOfStockVariantsChange={(value) => setFormData({ ...formData, showOutOfStockVariants: value })}`
  - `onShowFeaturesChange={(value) => setFormData({ ...formData, showFeatures: value })}`

### 6. Variants Section (lines ~1737-2336)
**Replace with:** `<ProductVariants />`
- Props needed (all variant-related state and handlers):
  - Legacy variants: `variants`, `onAddVariant`, `onUpdateVariant`, `onRemoveVariant`, etc.
  - Shopify variants: `useShopifyVariants`, `variantTypes`, `variantOptions`, etc.
  - All variant management functions

## Implementation Steps

1. **Add customer order images upload handler** after `handleDescriptionImageUpload`
2. **Replace Videos section** with `<ProductVideos />`
3. **Replace Size Chart section** with `<ProductSizeChart />`
4. **Replace Wash Care section** with `<ProductWashCare />`
5. **Replace Customer Images section** with `<ProductCustomerImages />`
6. **Replace Display Options section** with `<ProductDisplayOptions />`
7. **Replace Variants section** with `<ProductVariants />` (most complex)

## Notes

- All components are already created and exported from `admin/src/components/product/index.ts`
- The `ProductVariants` component has been updated to be a presentational component that receives all props
- The `useProductVariants` hook is available but not required for the initial integration
- All validation logic should remain in ProductForm for now
- After integration, test each section thoroughly

## Status

- ✅ ProductSEO - Integrated
- ✅ ProductBasicInfo - Integrated  
- ✅ ProductPricing - Integrated
- ✅ ProductSizesStock - Integrated
- ✅ ProductCategories - Integrated
- ✅ ProductVideos - Integrated (lines 1495-1504)
- ✅ ProductSizeChart - Integrated (lines 1593-1605)
- ✅ ProductWashCare - Integrated (lines 1608-1611)
- ✅ ProductCustomerImages - Integrated (lines 1614-1619)
- ✅ ProductDisplayOptions - Integrated (lines 1622-1631)
- ✅ ProductVariants - Integrated (lines 1507-1548)

## Completion Summary

All components have been successfully integrated into `ProductForm.tsx`:

1. ✅ **Customer order images upload handler** - Created at lines 535-556
2. ✅ **Videos section** - Replaced with `<ProductVideos />` at lines 1495-1504
3. ✅ **Size Chart section** - Replaced with `<ProductSizeChart />` at lines 1593-1605
4. ✅ **Wash Care section** - Replaced with `<ProductWashCare />` at lines 1608-1611
5. ✅ **Customer Images section** - Replaced with `<ProductCustomerImages />` at lines 1614-1619
6. ✅ **Display Options section** - Replaced with `<ProductDisplayOptions />` at lines 1622-1631
7. ✅ **Variants section** - Replaced with `<ProductVariants />` at lines 1507-1548

All components are properly integrated with their required props and handlers. The integration is complete and ready for testing.

