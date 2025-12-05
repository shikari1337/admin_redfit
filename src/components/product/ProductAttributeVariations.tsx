import React, { useState, useEffect } from 'react';
import { FaTrash, FaTimes, FaUpload, FaCog, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { attributesAPI } from '../../services/api';
import type { AttributeOption, AttributeValueOption, ProductVariation } from '../../types/productForm';

interface ProductAttributeVariationsProps {
  selectedAttributeIds: string[];
  onAttributeIdsChange: (ids: string[]) => void;
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
  baseSku: string;
  basePrice: number;
  baseOriginalPrice: number;
  onRegenerateAllSkus: () => void;
  onVariationImageUpload: (variationId: string, files: FileList) => Promise<void>;
  onRemoveVariationImage: (variationId: string, imageIndex: number) => void;
  uploading: boolean;
}

const ProductAttributeVariations: React.FC<ProductAttributeVariationsProps> = ({
  selectedAttributeIds,
  onAttributeIdsChange,
  variations,
  onVariationsChange,
  baseSku,
  basePrice,
  baseOriginalPrice,
  onRegenerateAllSkus,
  onVariationImageUpload,
  onRemoveVariationImage,
  uploading,
}) => {
  const [availableAttributes, setAvailableAttributes] = useState<AttributeOption[]>([]);
  const [attributeValuesMap, setAttributeValuesMap] = useState<Record<string, AttributeValueOption[]>>({});
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(new Set());

  // Load available attributes
  useEffect(() => {
    const loadAttributes = async () => {
      setLoadingAttributes(true);
      try {
        const attrs = await attributesAPI.list({ isActive: true });
        const attributesList = Array.isArray(attrs) ? attrs : (attrs?.data || []);
        setAvailableAttributes(attributesList);
        
        // Load values for all attributes
        const valuesMap: Record<string, AttributeValueOption[]> = {};
        for (const attr of attributesList) {
          try {
            const valuesResponse = await attributesAPI.getValues(attr.slug, { isActive: true });
            let values: any[] = [];
            if (Array.isArray(valuesResponse)) {
              values = valuesResponse;
            } else if (valuesResponse?.data && Array.isArray(valuesResponse.data)) {
              values = valuesResponse.data;
            } else if (valuesResponse?.data?.data && Array.isArray(valuesResponse.data.data)) {
              values = valuesResponse.data.data;
            }
            valuesMap[attr._id] = values;
          } catch (err) {
            console.error(`Failed to load values for attribute ${attr.slug}:`, err);
            valuesMap[attr._id] = [];
          }
        }
        setAttributeValuesMap(valuesMap);
      } catch (error) {
        console.error('Failed to load attributes:', error);
      } finally {
        setLoadingAttributes(false);
      }
    };
    loadAttributes();
  }, []);

  // Generate all possible variation combinations from selected attributes
  const generateVariations = () => {
    if (selectedAttributeIds.length === 0) {
      onVariationsChange([]);
      return;
    }

    const selectedAttrs = availableAttributes.filter(a => selectedAttributeIds.includes(a._id));
    if (selectedAttrs.length === 0) return;

    // Get all value combinations
    const valueCombinations: Record<string, string>[] = [];
    
    const generateCombinations = (current: Record<string, string>, attrIndex: number) => {
      if (attrIndex >= selectedAttrs.length) {
        valueCombinations.push({ ...current });
        return;
      }

      const attr = selectedAttrs[attrIndex];
      const values = attributeValuesMap[attr._id] || [];
      
      if (values.length === 0) {
        // If no values, skip this attribute
        generateCombinations(current, attrIndex + 1);
        return;
      }

      for (const value of values) {
        generateCombinations(
          { ...current, [attr.slug]: value._id },
          attrIndex + 1
        );
      }
    };

    generateCombinations({}, 0);

    // Create or update variations
    const existingVariationsMap = new Map(
      variations.map(v => [JSON.stringify(v.attributes), v])
    );

    const newVariations: ProductVariation[] = valueCombinations.map((attrs, index) => {
      const key = JSON.stringify(attrs);
      const existing = existingVariationsMap.get(key);
      
      if (existing) {
        return existing;
      }

      // Generate SKU from attribute values
      const attrNames = selectedAttrs.map(attr => {
        const valueId = attrs[attr.slug];
        const value = attributeValuesMap[attr._id]?.find(v => v._id === valueId);
        return value?.slug || value?.name || 'UNK';
      }).join('-').toUpperCase().slice(0, 20);
      
      const sku = `${baseSku}-${attrNames}`.toUpperCase().slice(0, 48);

      return {
        id: `var-${Date.now()}-${index}`,
        attributes: attrs,
        price: basePrice,
        originalPrice: baseOriginalPrice,
        stock: 0,
        sku,
        images: [],
        isActive: true,
      };
    });

    onVariationsChange(newVariations);
  };

  // Auto-generate variations when attributes change
  useEffect(() => {
    if (selectedAttributeIds.length > 0 && availableAttributes.length > 0) {
      generateVariations();
    }
  }, [selectedAttributeIds, attributeValuesMap, baseSku, basePrice, baseOriginalPrice]);

  const handleAttributeToggle = (attributeId: string) => {
    if (selectedAttributeIds.includes(attributeId)) {
      onAttributeIdsChange(selectedAttributeIds.filter(id => id !== attributeId));
    } else {
      onAttributeIdsChange([...selectedAttributeIds, attributeId]);
    }
  };

  const handleVariationChange = (variationId: string, field: keyof ProductVariation, value: any) => {
    onVariationsChange(
      variations.map(v =>
        v.id === variationId ? { ...v, [field]: value } : v
      )
    );
  };

  const handleRemoveVariation = (variationId: string) => {
    onVariationsChange(variations.filter(v => v.id !== variationId));
  };

  const toggleAttributeExpanded = (attributeId: string) => {
    setExpandedAttributes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(attributeId)) {
        newSet.delete(attributeId);
      } else {
        newSet.add(attributeId);
      }
      return newSet;
    });
  };

  const getVariationLabel = (variation: ProductVariation) => {
    const labels: string[] = [];
    for (const [attrSlug, valueId] of Object.entries(variation.attributes)) {
      // Normalize valueId to string (handle ObjectId, buffer, etc.)
      const normalizedValueId = typeof valueId === 'string' 
        ? valueId 
        : (valueId?._id ? String(valueId._id) : String(valueId));
      
      const attr = availableAttributes.find(a => a.slug === attrSlug);
      if (attr) {
        // Try to find value in attributeValuesMap
        const value = attributeValuesMap[attr._id]?.find(v => {
          const normalizedVId = typeof v._id === 'string' ? v._id : String(v._id);
          return normalizedVId === normalizedValueId;
        });
        
        if (value) {
          labels.push(value.name);
        } else {
          // Fallback: try to get from variation's attributeDetails (if backend populated it)
          const attrDetails = (variation as any).attributeDetails;
          if (attrDetails && attrDetails[attrSlug]) {
            labels.push(attrDetails[attrSlug].name || normalizedValueId);
          } else {
            // Last resort: show the ID
            labels.push(normalizedValueId.slice(0, 8));
          }
        }
      } else {
        // Attribute not found, show slug
        labels.push(attrSlug);
      }
    }
    return labels.join(' / ') || 'Variation';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Product Variations</h2>
          <p className="text-sm text-gray-500 mt-1">
            Select attributes to create variations (e.g., Color, Size, Material)
          </p>
        </div>
        {variations.length > 0 && (
          <button
            type="button"
            onClick={onRegenerateAllSkus}
            className="flex items-center px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
          >
            <FaCog className="mr-1" size={12} />
            Regenerate All SKUs
          </button>
        )}
      </div>

      {/* Attribute Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Attributes <span className="text-red-500">*</span>
        </label>
        {loadingAttributes ? (
          <div className="text-sm text-gray-500">Loading attributes...</div>
        ) : availableAttributes.length === 0 ? (
          <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
            No attributes available. <a href="/admin/attributes" className="text-blue-600 hover:underline">Create attributes first</a>
          </div>
        ) : (
          <div className="space-y-2">
            {availableAttributes.map(attr => {
              const isSelected = selectedAttributeIds.includes(attr._id);
              const isExpanded = expandedAttributes.has(attr._id);
              const values = attributeValuesMap[attr._id] || [];
              
              return (
                <div key={attr._id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className={`p-3 flex items-center justify-between ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleAttributeToggle(attr._id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{attr.name}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {attr.type}
                          </span>
                          {values.length > 0 && (
                            <span className="text-xs text-gray-500">
                              ({values.length} values)
                            </span>
                          )}
                        </div>
                        {attr.description && (
                          <p className="text-xs text-gray-500 mt-1">{attr.description}</p>
                        )}
                      </div>
                    </div>
                    {values.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleAttributeExpanded(attr._id)}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                      </button>
                    )}
                  </div>
                  {isExpanded && values.length > 0 && (
                    <div className="p-3 bg-gray-50 border-t border-gray-200">
                      <div className="flex flex-wrap gap-2">
                        {values.map(value => (
                          <div
                            key={value._id}
                            className="flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-200"
                          >
                            {attr.type === 'color' && value.value && (
                              <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: value.value }}
                                title={value.value}
                              />
                            )}
                            {attr.type === 'image' && value.imageUrl && (
                              <img
                                src={value.imageUrl}
                                alt={value.name}
                                className="w-4 h-4 rounded object-cover"
                              />
                            )}
                            <span className="text-xs text-gray-700">{value.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Variations Table */}
      {variations.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Variations ({variations.length})
            </label>
          </div>
          <div className="overflow-x-auto">
            <div className="space-y-4">
              {variations.map((variation, index) => (
                <div key={variation.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        Variation {index + 1}: {getVariationLabel(variation)}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(variation.attributes).map(([attrSlug, valueId]) => {
                          // Normalize valueId to string (handle ObjectId, buffer, etc.)
                          const normalizedValueId = typeof valueId === 'string' 
                            ? valueId 
                            : (valueId?._id ? String(valueId._id) : String(valueId));
                          
                          const attr = availableAttributes.find(a => a.slug === attrSlug);
                          if (!attr) {
                            // Attribute not found - show slug and ID
                            return (
                              <span
                                key={attrSlug}
                                className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded"
                                title={`Attribute ${attrSlug} not found`}
                              >
                                {attrSlug}: {normalizedValueId.slice(0, 8)}
                              </span>
                            );
                          }
                          
                          // Try to find value in attributeValuesMap
                          const value = attributeValuesMap[attr._id]?.find(v => {
                            const normalizedVId = typeof v._id === 'string' ? v._id : String(v._id);
                            return normalizedVId === normalizedValueId;
                          });
                          
                          if (!value) {
                            // Value not found - try attributeDetails from backend
                            const attrDetails = (variation as any).attributeDetails;
                            if (attrDetails && attrDetails[attrSlug]) {
                              return (
                                <span
                                  key={attrSlug}
                                  className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                                >
                                  {attr.name}: {attrDetails[attrSlug].name}
                                </span>
                              );
                            }
                            // Last resort: show ID
                            return (
                              <span
                                key={attrSlug}
                                className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded"
                                title={`Value ${normalizedValueId} not found`}
                              >
                                {attr.name}: {normalizedValueId.slice(0, 8)}...
                              </span>
                            );
                          }
                          
                          return (
                            <span
                              key={attrSlug}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                            >
                              {attr.name}: {value.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVariation(variation.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">SKU *</label>
                      <input
                        type="text"
                        value={variation.sku}
                        onChange={(e) => handleVariationChange(variation.id, 'sku', e.target.value.toUpperCase().slice(0, 48))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Stock *</label>
                      <input
                        type="number"
                        min="0"
                        value={variation.stock}
                        onChange={(e) => handleVariationChange(variation.id, 'stock', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={variation.price || ''}
                        onChange={(e) => handleVariationChange(variation.id, 'price', parseFloat(e.target.value) || undefined)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        placeholder={basePrice.toString()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Original Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={variation.originalPrice || ''}
                        onChange={(e) => handleVariationChange(variation.id, 'originalPrice', parseFloat(e.target.value) || undefined)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        placeholder={baseOriginalPrice.toString()}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Short Description</label>
                    <textarea
                      value={variation.shortDescription || ''}
                      onChange={(e) => handleVariationChange(variation.id, 'shortDescription', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                      rows={2}
                      placeholder="Optional short description for this variation"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 mb-2">Variation Images</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploading}
                      onChange={(e) => {
                        if (e.target.files) {
                          onVariationImageUpload(variation.id, e.target.files);
                        }
                      }}
                      className="hidden"
                      id={`variation-images-${variation.id}`}
                    />
                    <label
                      htmlFor={`variation-images-${variation.id}`}
                      className={`inline-flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer mb-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <FaUpload className="mr-2" size={12} />
                      {uploading ? 'Uploading...' : 'Upload Images'}
                    </label>
                    {variation.images && variation.images.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {variation.images.map((img, imgIndex) => (
                          <div key={imgIndex} className="relative group">
                            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                              <img
                                src={img}
                                alt={`Variation ${index + 1} image ${imgIndex + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveVariationImage(variation.id, imgIndex)}
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <FaTimes size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`variation-active-${variation.id}`}
                      checked={variation.isActive !== false}
                      onChange={(e) => handleVariationChange(variation.id, 'isActive', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`variation-active-${variation.id}`} className="ml-2 text-xs text-gray-700">
                      Active (visible to customers)
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedAttributeIds.length > 0 && variations.length === 0 && (
        <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
          No variations generated. Make sure selected attributes have values.
        </div>
      )}
    </div>
  );
};

export default ProductAttributeVariations;

