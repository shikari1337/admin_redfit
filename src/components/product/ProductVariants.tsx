import React from 'react';
import { FaPlus, FaTrash, FaTimes, FaUpload, FaCog } from 'react-icons/fa';
import { ProductVariant, VariantType, VariantCombination } from '../../types/productForm';

interface ProductVariantsProps {
  // Standard variants (color-based with sizes)
  variants: ProductVariant[];
  onAddVariant: () => void;
  onUpdateVariant: (index: number, field: keyof ProductVariant, value: any) => void;
  onRemoveVariant: (index: number) => void;
  onAddVariantSize: (variantIndex: number) => void;
  onUpdateVariantSize: (variantIndex: number, sizeIndex: number, field: string, value: any) => void;
  onRemoveVariantSize: (variantIndex: number, sizeIndex: number) => void;
  onRegenerateAllSkus: () => void;
  onRegenerateVariantSkus: (variantIndex: number) => void;
  onVariantImageUpload: (variantIndex: number, files: FileList) => Promise<void>;
  onRemoveVariantImage: (variantIndex: number, imageIndex: number) => void;
  
  // Advanced variant management (Shopify-style)
  useShopifyVariants: boolean;
  onUseShopifyVariantsChange: (value: boolean) => void;
  variantTypes: VariantType[];
  variantOptions: Record<string, string[]>;
  variantColorCodes: Record<string, Record<string, string>>;
  variantCombinations: VariantCombination[];
  newVariantTypeName: string;
  newOptionInputs: Record<string, string>;
  onAddVariantType: (name: string, isColor?: boolean) => void;
  onRemoveVariantType: (id: string) => void;
  onAddVariantOption: (typeId: string, value: string, colorCode?: string) => void;
  onRemoveVariantOption: (typeId: string, value: string) => void;
  onUpdateVariantCombination: (id: string, field: keyof VariantCombination, value: any) => void;
  onRegenerateAllSkusShopify: () => void;
  onNewVariantTypeNameChange: (value: string) => void;
  onNewOptionInputsChange: (value: Record<string, string>) => void;
  onVariantColorCodesChange: (codes: Record<string, Record<string, string>>) => void;
  onConvertVariantsToShopifyFormat: (variants: ProductVariant[]) => void;
  
  // Utilities
  getBaseSku: () => string;
  generateSkuForSize: (baseSku: string, colorName: string, size: string) => string;
  basePrice: number;
  uploading: boolean;
}

const ProductVariants: React.FC<ProductVariantsProps> = ({
  variants,
  onAddVariant,
  onUpdateVariant,
  onRemoveVariant,
  onAddVariantSize,
  onUpdateVariantSize,
  onRemoveVariantSize,
  onRegenerateAllSkus,
  onRegenerateVariantSkus,
  onVariantImageUpload,
  onRemoveVariantImage,
  useShopifyVariants,
  onUseShopifyVariantsChange,
  variantTypes,
  variantOptions,
  variantColorCodes,
  variantCombinations,
  newVariantTypeName,
  newOptionInputs,
  onAddVariantType,
  onRemoveVariantType,
  onAddVariantOption,
  onRemoveVariantOption,
  onUpdateVariantCombination,
  onRegenerateAllSkusShopify,
  onNewVariantTypeNameChange,
  onNewOptionInputsChange,
  onVariantColorCodesChange,
  onConvertVariantsToShopifyFormat,
  getBaseSku,
  generateSkuForSize,
  uploading,
}) => {
  const handleShopifyToggle = (checked: boolean) => {
    onUseShopifyVariantsChange(checked);
    if (!checked) {
      // Clear Shopify data handled by parent
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Variants</h2>
        <div className="flex items-center gap-3">
          {!useShopifyVariants && variants.length > 0 && (
            <button
              type="button"
              onClick={() => onConvertVariantsToShopifyFormat(variants)}
              className="flex items-center px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
            >
              Convert to Shopify Format
            </button>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useShopifyVariants}
              onChange={(e) => handleShopifyToggle(e.target.checked)}
              className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">Use Shopify-style variants</span>
          </label>
        </div>
      </div>

      {useShopifyVariants ? (
        <ShopifyVariantsView
          variantTypes={variantTypes}
          variantOptions={variantOptions}
          variantColorCodes={variantColorCodes}
          variantCombinations={variantCombinations}
          newVariantTypeName={newVariantTypeName}
          newOptionInputs={newOptionInputs}
          onAddVariantType={onAddVariantType}
          onRemoveVariantType={onRemoveVariantType}
          onAddVariantOption={onAddVariantOption}
          onRemoveVariantOption={onRemoveVariantOption}
          onUpdateCombination={onUpdateVariantCombination}
          onRegenerateAllSkus={onRegenerateAllSkusShopify}
          onNewVariantTypeNameChange={onNewVariantTypeNameChange}
          onNewOptionInputsChange={onNewOptionInputsChange}
          onVariantColorCodesChange={onVariantColorCodesChange}
        />
      ) : (
        <StandardVariantsView
          variants={variants}
          onAddVariant={onAddVariant}
          onUpdateVariant={onUpdateVariant}
          onRemoveVariant={onRemoveVariant}
          onAddVariantSize={onAddVariantSize}
          onUpdateVariantSize={onUpdateVariantSize}
          onRemoveVariantSize={onRemoveVariantSize}
          onRegenerateAllSkus={onRegenerateAllSkus}
          onRegenerateVariantSkus={onRegenerateVariantSkus}
          onVariantImageUpload={onVariantImageUpload}
          onRemoveVariantImage={onRemoveVariantImage}
          uploading={uploading}
          getBaseSku={getBaseSku}
          generateSkuForSize={generateSkuForSize}
        />
      )}
    </div>
  );
};

// Shopify-style variants view component
interface ShopifyVariantsViewProps {
  variantTypes: VariantType[];
  variantOptions: Record<string, string[]>;
  variantColorCodes: Record<string, Record<string, string>>;
  variantCombinations: VariantCombination[];
  newVariantTypeName: string;
  newOptionInputs: Record<string, string>;
  onAddVariantType: (name: string, isColor?: boolean) => void;
  onRemoveVariantType: (id: string) => void;
  onAddVariantOption: (typeId: string, value: string, colorCode?: string) => void;
  onRemoveVariantOption: (typeId: string, value: string) => void;
  onUpdateCombination: (id: string, field: keyof VariantCombination, value: any) => void;
  onRegenerateAllSkus: () => void;
  onNewVariantTypeNameChange: (value: string) => void;
  onNewOptionInputsChange: (value: Record<string, string>) => void;
  onVariantColorCodesChange: (codes: Record<string, Record<string, string>>) => void;
}

const ShopifyVariantsView: React.FC<ShopifyVariantsViewProps> = ({
  variantTypes,
  variantOptions,
  variantColorCodes,
  variantCombinations,
  newVariantTypeName,
  newOptionInputs,
  onAddVariantType,
  onRemoveVariantType,
  onAddVariantOption,
  onRemoveVariantOption,
  onUpdateCombination,
  onRegenerateAllSkus,
  onNewVariantTypeNameChange,
  onNewOptionInputsChange,
  onVariantColorCodesChange,
}) => {
  const handleColorCodeChange = (typeId: string, value: string, colorCode: string) => {
    const typeColorCodes = variantColorCodes[typeId] || {};
    onNewOptionInputsChange({
      ...newOptionInputs,
      [typeId]: value,
    });
    onVariantColorCodesChange({
      ...variantColorCodes,
      [typeId]: {
        ...typeColorCodes,
        [value]: colorCode,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Variant Types <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => onAddVariantType('Color', true)}
            disabled={variantTypes.some((t) => t.name === 'Color')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Color
          </button>
          <button
            type="button"
            onClick={() => onAddVariantType('Size', false)}
            disabled={variantTypes.some((t) => t.name === 'Size')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Size
          </button>
          <button
            type="button"
            onClick={() => onAddVariantType('Material', false)}
            disabled={variantTypes.some((t) => t.name === 'Material')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Material
          </button>
          <button
            type="button"
            onClick={() => onAddVariantType('Style', false)}
            disabled={variantTypes.some((t) => t.name === 'Style')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Style
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              value={newVariantTypeName}
              onChange={(e) => onNewVariantTypeNameChange(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newVariantTypeName.trim()) {
                  e.preventDefault();
                  onAddVariantType(newVariantTypeName, false);
                }
              }}
              placeholder="Custom type..."
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={() => {
                if (newVariantTypeName.trim()) {
                  onAddVariantType(newVariantTypeName, false);
                }
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Add
            </button>
          </div>
        </div>

        {variantTypes.map((type) => (
          <div key={type.id} className="mb-4 p-4 border border-gray-200 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">{type.name}</h3>
              <button
                type="button"
                onClick={() => onRemoveVariantType(type.id)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {variantOptions[type.id]?.map((option) => (
                <div
                  key={option}
                  className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md"
                >
                  {type.isColor && variantColorCodes[type.id]?.[option] && (
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: variantColorCodes[type.id][option] }}
                    />
                  )}
                  <span className="text-sm text-gray-700">{option}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveVariantOption(type.id, option)}
                    className="text-red-600 hover:text-red-800 ml-1"
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {type.isColor && (
                <input
                  type="color"
                  className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                  value={variantColorCodes[type.id]?.[newOptionInputs[type.id] || ''] || '#000000'}
                  onChange={(e) => {
                    const inputValue = newOptionInputs[type.id] || '';
                    if (inputValue.trim()) {
                      handleColorCodeChange(type.id, inputValue, e.target.value);
                    }
                  }}
                />
              )}
              <input
                type="text"
                value={newOptionInputs[type.id] || ''}
                onChange={(e) =>
                  onNewOptionInputsChange({
                    ...newOptionInputs,
                    [type.id]: e.target.value,
                  })
                }
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = newOptionInputs[type.id] || '';
                    if (value.trim()) {
                      const colorCode = type.isColor
                        ? variantColorCodes[type.id]?.[value] || '#000000'
                        : undefined;
                      onAddVariantOption(type.id, value, colorCode);
                    }
                  }
                }}
                placeholder={`Add ${type.name} option...`}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="button"
                onClick={() => {
                  const value = newOptionInputs[type.id] || '';
                  if (value.trim()) {
                    const colorCode = type.isColor
                      ? variantColorCodes[type.id]?.[value] || '#000000'
                      : undefined;
                    onAddVariantOption(type.id, value, colorCode);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                <FaPlus />
              </button>
            </div>
          </div>
        ))}
      </div>

      {variantCombinations.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Variant Combinations ({variantCombinations.length})
            </label>
            <button
              type="button"
              onClick={onRegenerateAllSkus}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Regenerate All SKUs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  {variantTypes.map((type) => (
                    <th
                      key={type.id}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase"
                    >
                      {type.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Price (₹)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                    Original (₹)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Stock</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variantCombinations.map((comb) => (
                  <tr key={comb.id}>
                    {variantTypes.map((type) => {
                      const option = comb.options.find((o: any) => o.typeId === type.id);
                      return (
                        <td key={type.id} className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {type.isColor && option?.colorCode && (
                              <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: option.colorCode }}
                              />
                            )}
                            <span className="text-sm text-gray-900">{option?.value || '-'}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="text"
                        value={comb.sku}
                        onChange={(e) => onUpdateCombination(comb.id, 'sku', e.target.value.toUpperCase())}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={comb.price}
                        onChange={(e) => onUpdateCombination(comb.id, 'price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={comb.originalPrice}
                        onChange={(e) =>
                          onUpdateCombination(comb.id, 'originalPrice', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        type="number"
                        min="0"
                        value={comb.stock}
                        onChange={(e) =>
                          onUpdateCombination(comb.id, 'stock', Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {variantTypes.length === 0 && (
        <p className="text-sm text-gray-500">Add variant types (Color, Size, etc.) to create combinations.</p>
      )}
    </div>
  );
};

// Standard variants view component (color-based with sizes)
interface StandardVariantsViewProps {
  variants: ProductVariant[];
  onAddVariant: () => void;
  onUpdateVariant: (index: number, field: keyof ProductVariant, value: any) => void;
  onRemoveVariant: (index: number) => void;
  onAddVariantSize: (variantIndex: number) => void;
  onUpdateVariantSize: (variantIndex: number, sizeIndex: number, field: string, value: any) => void;
  onRemoveVariantSize: (variantIndex: number, sizeIndex: number) => void;
  onRegenerateAllSkus: () => void;
  onRegenerateVariantSkus: (variantIndex: number) => void;
  onVariantImageUpload: (variantIndex: number, files: FileList) => Promise<void>;
  onRemoveVariantImage: (variantIndex: number, imageIndex: number) => void;
  uploading: boolean;
  getBaseSku: () => string;
  generateSkuForSize: (baseSku: string, colorName: string, size: string) => string;
}

const StandardVariantsView: React.FC<StandardVariantsViewProps> = ({
  variants,
  onAddVariant,
  onUpdateVariant,
  onRemoveVariant,
  onAddVariantSize,
  onUpdateVariantSize,
  onRemoveVariantSize,
  onRegenerateAllSkus,
  onRegenerateVariantSkus,
  onVariantImageUpload,
  onRemoveVariantImage,
  uploading,
  getBaseSku,
  generateSkuForSize,
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-gray-700">Variants</h3>
        <div className="flex gap-2">
          {variants.length > 0 && variants.some((v) => v.sizes.length > 0) && (
            <button
              type="button"
              onClick={onRegenerateAllSkus}
              className="flex items-center px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
              title="Regenerate all SKUs based on product slug and variant colors"
            >
              <FaCog className="mr-1" size={12} />
              Regenerate All SKUs
            </button>
          )}
          <button
            type="button"
            onClick={onAddVariant}
            className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <FaPlus className="mr-1" size={12} />
            Add Variant
          </button>
        </div>
      </div>

      {variants.length === 0 ? (
        <p className="text-sm text-gray-500">No variants added. Add variants for different colors.</p>
      ) : (
        <div className="space-y-4">
          {variants.map((variant, vIndex) => (
            <div key={vIndex} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-medium text-gray-700">Variant {vIndex + 1}</h3>
                <div className="flex gap-2">
                  {variant.sizes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onRegenerateVariantSkus(vIndex)}
                      className="text-blue-600 hover:text-blue-800 text-xs"
                      title="Regenerate SKUs for this variant"
                    >
                      Regenerate SKUs
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveVariant(vIndex)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <FaTrash size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">Color Swatch</label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                      value={variant.colorCode}
                      onChange={(e) => onUpdateVariant(vIndex, 'colorCode', e.target.value)}
                    />
                    <input
                      type="text"
                      className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                      value={variant.colorCode}
                      onChange={(e) => onUpdateVariant(vIndex, 'colorCode', e.target.value)}
                      placeholder="#000000"
                    />
                  </div>
                  <input
                    type="text"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    value={variant.colorName}
                    onChange={(e) => onUpdateVariant(vIndex, 'colorName', e.target.value)}
                    placeholder="Color Name (e.g., Red)"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Variant Images (for this color)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files) {
                      onVariantImageUpload(vIndex, e.target.files);
                    }
                  }}
                  className="hidden"
                  id={`variant-images-${vIndex}`}
                />
                <label
                  htmlFor={`variant-images-${vIndex}`}
                  className={`inline-flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer mb-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FaUpload className="mr-2" size={12} />
                  {uploading ? 'Uploading...' : 'Upload Images'}
                </label>
                {variant.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {variant.images.map((img, imgIndex) => (
                      <div key={imgIndex} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={img}
                            alt={`Variant ${vIndex} image ${imgIndex + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveVariantImage(vIndex, imgIndex)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaTimes size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    value={variant.price}
                    onChange={(e) => onUpdateVariant(vIndex, 'price', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Original Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    value={variant.originalPrice}
                    onChange={(e) => onUpdateVariant(vIndex, 'originalPrice', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-medium text-gray-700">Sizes & Stock</label>
                  <button
                    type="button"
                    onClick={() => onAddVariantSize(vIndex)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    <FaPlus className="inline mr-1" size={10} />
                    Add Size
                  </button>
                </div>
                {variant.sizes.length === 0 ? (
                  <p className="text-xs text-gray-500">No sizes added for this variant.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-6 gap-2 text-xs font-medium text-gray-600 mb-1 px-1">
                      <div>Size</div>
                      <div>SKU</div>
                      <div>Stock</div>
                      <div>Price (₹)</div>
                      <div>Original (₹)</div>
                      <div></div>
                    </div>
                    {variant.sizes.map((size, sIndex) => (
                      <div key={sIndex} className="grid grid-cols-6 gap-2">
                        <input
                          type="text"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="Size (e.g., S, M, L)"
                          value={size.size}
                          onChange={(e) => {
                            onUpdateVariantSize(vIndex, sIndex, 'size', e.target.value);
                            if (e.target.value && (!size.sku || size.sku.includes('NEW'))) {
                              const baseSku = getBaseSku();
                              const newSku = generateSkuForSize(baseSku, variant.colorName, e.target.value);
                              onUpdateVariantSize(vIndex, sIndex, 'sku', newSku);
                            }
                          }}
                        />
                        <input
                          type="text"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md font-mono text-xs"
                          placeholder="SKU (auto-generated)"
                          value={size.sku || ''}
                          onChange={(e) => onUpdateVariantSize(vIndex, sIndex, 'sku', e.target.value.toUpperCase())}
                          title="SKU will be auto-generated if empty. Format: BASE-COLOR-SIZE"
                        />
                        <input
                          type="number"
                          min="0"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="0"
                          value={size.stock}
                          onChange={(e) =>
                            onUpdateVariantSize(vIndex, sIndex, 'stock', Math.max(0, parseInt(e.target.value) || 0))
                          }
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="Price"
                          value={size.price}
                          onChange={(e) =>
                            onUpdateVariantSize(vIndex, sIndex, 'price', Math.max(0, parseFloat(e.target.value) || 0))
                          }
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="Original"
                          value={size.originalPrice}
                          onChange={(e) =>
                            onUpdateVariantSize(vIndex, sIndex, 'originalPrice', Math.max(0, parseFloat(e.target.value) || 0))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveVariantSize(vIndex, sIndex)}
                          className="text-red-600 hover:text-red-800 flex items-center justify-center"
                          title="Remove size"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductVariants;
