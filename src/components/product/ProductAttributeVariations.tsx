import React, { useState, useEffect } from 'react';
import { FaTrash, FaTimes, FaUpload, FaCog, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { attributesAPI } from '../../services/api';
import type { AttributeOption, AttributeValueOption, ProductVariation } from '../../types/productForm';

interface ProductAttributeVariationsProps {
  selectedAttributeIds: string[];
  selectedAttributeValues: Record<string, string[]>; // { attributeId: [valueId1, valueId2] }
  onAttributeIdsChange: (ids: string[]) => void;
  onAttributeValuesChange: (values: Record<string, string[]>) => void;
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
  selectedAttributeValues,
  onAttributeIdsChange,
  onAttributeValuesChange,
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

  // Generate variations from selected attribute values
  const generateVariations = () => {
    const selectedAttrs = availableAttributes.filter(a => selectedAttributeIds.includes(a._id));
    if (selectedAttrs.length === 0) {
      onVariationsChange([]);
      return;
    }

    // Get selected values for each attribute
    const selectedValuesByAttr: Record<string, AttributeValueOption[]> = {};
    for (const attr of selectedAttrs) {
      const selectedValueIds = selectedAttributeValues[attr._id] || [];
      const allValues = attributeValuesMap[attr._id] || [];
      selectedValuesByAttr[attr._id] = allValues.filter(v => selectedValueIds.includes(v._id));
      
      // If no values selected for this attribute, use all values
      if (selectedValuesByAttr[attr._id].length === 0) {
        selectedValuesByAttr[attr._id] = allValues;
      }
    }

    // Generate all combinations
    const valueCombinations: Record<string, string>[] = [];
    
    const generateCombinations = (current: Record<string, string>, attrIndex: number) => {
      if (attrIndex >= selectedAttrs.length) {
        valueCombinations.push({ ...current });
        return;
      }

      const attr = selectedAttrs[attrIndex];
      const values = selectedValuesByAttr[attr._id] || [];
      
      if (values.length === 0) {
        generateCombinations(current, attrIndex + 1);
        return;
      }

      for (const value of values) {
        const normalizedSlug = value.slug?.toLowerCase().trim() || value.name?.toLowerCase().trim().replace(/\s+/g, '-');
        if (normalizedSlug) {
          generateCombinations(
            { ...current, [attr.slug.toLowerCase()]: normalizedSlug },
            attrIndex + 1
          );
        }
      }
    };

    generateCombinations({}, 0);

    // Create variations
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
        const valueSlug = attrs[attr.slug];
        const allValues = attributeValuesMap[attr._id] || [];
        const value = allValues.find(v => 
          v.slug?.toLowerCase() === String(valueSlug).toLowerCase()
        );
        return value?.slug?.toUpperCase() || value?.name?.toUpperCase() || 'UNK';
      }).join('-').slice(0, 20);
      
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

  // Auto-generate when selected values change
  useEffect(() => {
    if (selectedAttributeIds.length > 0 && !loadingAttributes) {
      const selectedAttrs = availableAttributes.filter(a => selectedAttributeIds.includes(a._id));
      const allHaveValues = selectedAttrs.every(attr => {
        const allValues = attributeValuesMap[attr._id] || [];
        // Either has selected values, or all values will be used
        return allValues.length > 0;
      });
      
      if (allHaveValues) {
        const timer = setTimeout(() => {
          generateVariations();
        }, 300);
        return () => clearTimeout(timer);
      }
    } else if (selectedAttributeIds.length === 0) {
      onVariationsChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAttributeIds, selectedAttributeValues, attributeValuesMap, loadingAttributes, baseSku, basePrice, baseOriginalPrice]);

  const handleAttributeToggle = (attributeId: string) => {
    const newIds = selectedAttributeIds.includes(attributeId)
      ? selectedAttributeIds.filter(id => id !== attributeId)
      : [...selectedAttributeIds, attributeId];
    onAttributeIdsChange(newIds);
    
    // Clear values when attribute is deselected
    if (!newIds.includes(attributeId)) {
      const newValues = { ...selectedAttributeValues };
      delete newValues[attributeId];
      onAttributeValuesChange(newValues);
    }
  };

  const handleValueToggle = (attributeId: string, valueId: string) => {
    const currentValues = selectedAttributeValues[attributeId] || [];
    const newValues = currentValues.includes(valueId)
      ? currentValues.filter(id => id !== valueId)
      : [...currentValues, valueId];
    
    onAttributeValuesChange({
      ...selectedAttributeValues,
      [attributeId]: newValues,
    });
  };

  const toggleExpand = (attributeId: string) => {
    const newSet = new Set(expandedAttributes);
    if (newSet.has(attributeId)) {
      newSet.delete(attributeId);
    } else {
      newSet.add(attributeId);
    }
    setExpandedAttributes(newSet);
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

  const getVariationLabel = (variation: ProductVariation) => {
    const labels: string[] = [];
    for (const [attrSlug, valueSlug] of Object.entries(variation.attributes)) {
      const normalizedValueSlug = String(valueSlug).toLowerCase().trim();
      const attr = availableAttributes.find(a => a.slug === attrSlug);
      if (attr) {
        const value = attributeValuesMap[attr._id]?.find(v => 
          v.slug?.toLowerCase() === normalizedValueSlug
        );
        labels.push(value?.name || normalizedValueSlug);
      } else {
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
            Select attributes and their values to automatically generate all variation combinations
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

      {/* Attribute and Value Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Attributes & Values <span className="text-red-500">*</span>
        </label>
        {loadingAttributes ? (
          <div className="text-sm text-gray-500">Loading attributes...</div>
        ) : availableAttributes.length === 0 ? (
          <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
            No attributes available. <a href="/admin/attributes" className="text-blue-600 hover:underline">Create attributes first</a>
          </div>
        ) : (
          <div className="space-y-3">
            {availableAttributes.map(attr => {
              const isSelected = selectedAttributeIds.includes(attr._id);
              const isExpanded = expandedAttributes.has(attr._id);
              const values = attributeValuesMap[attr._id] || [];
              const selectedValues = selectedAttributeValues[attr._id] || [];
              
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
                          {isSelected && selectedValues.length > 0 && (
                            <span className="text-xs text-blue-600 font-medium">
                              ({selectedValues.length} selected)
                            </span>
                          )}
                        </div>
                        {attr.description && (
                          <p className="text-xs text-gray-500 mt-1">{attr.description}</p>
                        )}
                      </div>
                    </div>
                    {isSelected && values.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(attr._id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? <FaChevronDown size={14} /> : <FaChevronRight size={14} />}
                      </button>
                    )}
                  </div>
                  
                  {/* Value Selection */}
                  {isSelected && isExpanded && values.length > 0 && (
                    <div className="px-3 pb-3 pt-2 bg-gray-50 border-t border-gray-200">
                      <div className="text-xs font-medium text-gray-700 mb-2">
                        Select Values ({selectedValues.length} of {values.length} selected):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {values.map(value => {
                          const isValueSelected = selectedValues.includes(value._id);
                          return (
                            <button
                              key={value._id}
                              type="button"
                              onClick={() => handleValueToggle(attr._id, value._id)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md border-2 transition-all ${
                                isValueSelected
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
                              }`}
                            >
                              {attr.type === 'color' && value.value && (
                                <span
                                  className="inline-block w-3 h-3 rounded-full mr-1 border border-gray-300"
                                  style={{ backgroundColor: value.value }}
                                />
                              )}
                              {attr.type === 'image' && value.imageUrl && (
                                <img
                                  src={value.imageUrl}
                                  alt={value.name}
                                  className="inline-block w-3 h-3 rounded mr-1 object-cover"
                                />
                              )}
                              {value.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Messages */}
      {selectedAttributeIds.length > 0 && !loadingAttributes && (() => {
        const selectedAttrs = availableAttributes.filter(a => selectedAttributeIds.includes(a._id));
        const attrsWithoutValues = selectedAttrs.filter(attr => {
          const values = attributeValuesMap[attr._id] || [];
          return values.length === 0;
        });
        
        if (attrsWithoutValues.length > 0) {
          return (
            <div className="mb-6 text-sm text-red-600 p-4 bg-red-50 border border-red-200 rounded-lg">
              <strong>Warning:</strong> The following attributes have no values: {attrsWithoutValues.map(a => a.name).join(', ')}. 
              Add values to these attributes first.
            </div>
          );
        }
        
        const attrsWithNoSelectedValues = selectedAttrs.filter(attr => {
          return (selectedAttributeValues[attr._id] || []).length === 0;
        });
        
        if (attrsWithNoSelectedValues.length > 0 && variations.length === 0) {
          return (
            <div className="mb-6 text-sm text-blue-600 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="mb-2">
                <strong>Select values for attributes:</strong> {attrsWithNoSelectedValues.map(a => a.name).join(', ')}
              </p>
              <button
                type="button"
                onClick={generateVariations}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Generate Variations (using all values)
              </button>
            </div>
          );
        }
        
        return null;
      })()}

      {/* Variations List */}
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
                      <h3 className="text-sm font-semibold text-gray-900">
                        Variation {index + 1}: {getVariationLabel(variation)}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(variation.attributes).map(([attrSlug, valueSlug]) => {
                          const attr = availableAttributes.find(a => a.slug === attrSlug);
                          if (!attr) return null;
                          const value = attributeValuesMap[attr._id]?.find(v => 
                            v.slug?.toLowerCase() === String(valueSlug).toLowerCase()
                          );
                          return (
                            <span
                              key={attrSlug}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                            >
                              {attr.name}: {value?.name || valueSlug}
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
                      id={`variation-image-${variation.id}`}
                    />
                    <label
                      htmlFor={`variation-image-${variation.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 cursor-pointer"
                    >
                      <FaUpload className="mr-1" size={12} />
                      Upload Images
                    </label>
                    {variation.images && variation.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {variation.images.map((image, imgIndex) => (
                          <div key={imgIndex} className="relative">
                            <img
                              src={image}
                              alt={`Variation ${index + 1} - Image ${imgIndex + 1}`}
                              className="w-16 h-16 object-cover rounded border border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => onRemoveVariationImage(variation.id, imgIndex)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-700"
                            >
                              <FaTimes size={8} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={variation.isActive !== false}
                      onChange={(e) => handleVariationChange(variation.id, 'isActive', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      id={`variation-active-${variation.id}`}
                    />
                    <label htmlFor={`variation-active-${variation.id}`} className="ml-2 text-xs text-gray-700">
                      Active (visible on frontend)
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductAttributeVariations;
