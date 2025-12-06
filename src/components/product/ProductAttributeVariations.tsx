import React, { useState, useEffect } from 'react';
import { FaTrash, FaCog, FaChevronDown, FaChevronRight, FaEdit, FaCheck, FaTimes } from 'react-icons/fa';
import { attributesAPI, attributeValuesAPI } from '../../services/api';
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
  onVariationImageUpload: _onVariationImageUpload,
  onRemoveVariationImage: _onRemoveVariationImage,
  uploading: _uploading,
}) => {
  const [availableAttributes, setAvailableAttributes] = useState<AttributeOption[]>([]);
  const [attributeValuesMap, setAttributeValuesMap] = useState<Record<string, AttributeValueOption[]>>({});
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(new Set());
  const [selectedVariationIds, setSelectedVariationIds] = useState<Set<string>>(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditValues, setBulkEditValues] = useState({
    price: '',
    originalPrice: '',
    stock: '',
    isActive: true,
  });
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null);

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
            // Use attributeValuesAPI.getByAttributeSlug with attribute slug
            const valuesResponse = await attributeValuesAPI.getByAttributeSlug(attr.slug, { isActive: true });
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
            console.error(`Failed to load values for attribute ${attr._id}:`, err);
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

  const handleBulkRemove = () => {
    onVariationsChange(variations.filter(v => !selectedVariationIds.has(v.id)));
    setSelectedVariationIds(new Set());
    setBulkEditMode(false);
  };

  const handleBulkEdit = () => {
    const updatedVariations = variations.map(v => {
      if (selectedVariationIds.has(v.id)) {
        const updated = { ...v };
        if (bulkEditValues.price !== '') {
          updated.price = parseFloat(bulkEditValues.price) || undefined;
        }
        if (bulkEditValues.originalPrice !== '') {
          updated.originalPrice = parseFloat(bulkEditValues.originalPrice) || undefined;
        }
        if (bulkEditValues.stock !== '') {
          updated.stock = Math.max(0, parseInt(bulkEditValues.stock) || 0);
        }
        updated.isActive = bulkEditValues.isActive;
        return updated;
      }
      return v;
    });
    onVariationsChange(updatedVariations);
    setSelectedVariationIds(new Set());
    setBulkEditMode(false);
    setBulkEditValues({ price: '', originalPrice: '', stock: '', isActive: true });
  };

  const toggleSelectAll = () => {
    if (selectedVariationIds.size === variations.length) {
      setSelectedVariationIds(new Set());
    } else {
      setSelectedVariationIds(new Set(variations.map(v => v.id)));
    }
  };

  const toggleSelectVariation = (variationId: string) => {
    const newSet = new Set(selectedVariationIds);
    if (newSet.has(variationId)) {
      newSet.delete(variationId);
    } else {
      newSet.add(variationId);
    }
    setSelectedVariationIds(newSet);
  };

  // Helper function removed - variations are displayed inline in table using direct attribute/value mapping

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Product Variations</h2>
        <p className="text-sm text-gray-500">
          Select attributes and their values to automatically generate all variation combinations (WordPress style)
        </p>
      </div>

      {/* Attribute Selection Section */}
      <div className="mb-6 border-b border-gray-200 pb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Attributes & Values
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

      {/* Variations Table - WordPress Style */}
      {variations.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h3 className="text-base font-semibold text-gray-900">
                Variations ({variations.length})
              </h3>
              {selectedVariationIds.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedVariationIds.size} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedVariationIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setBulkEditMode(true)}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <FaEdit className="inline mr-1" size={12} />
                    Bulk Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkRemove}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    <FaTrash className="inline mr-1" size={12} />
                    Delete ({selectedVariationIds.size})
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onRegenerateAllSkus}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <FaCog className="inline mr-1" size={12} />
                Regenerate SKUs
              </button>
            </div>
          </div>

          {/* Bulk Edit Form */}
          {bulkEditMode && selectedVariationIds.size > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900">
                  Bulk Edit {selectedVariationIds.size} Variations
                </h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleBulkEdit}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <FaCheck className="inline mr-1" size={12} />
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkEditMode(false);
                      setBulkEditValues({ price: '', originalPrice: '', stock: '', isActive: true });
                    }}
                    className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    <FaTimes className="inline mr-1" size={12} />
                    Cancel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bulkEditValues.price}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, price: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    placeholder="Leave empty to keep"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Original Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bulkEditValues.originalPrice}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, originalPrice: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    placeholder="Leave empty to keep"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={bulkEditValues.stock}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, stock: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    placeholder="Leave empty to keep"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={bulkEditValues.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, isActive: e.target.value === 'active' })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Variations Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedVariationIds.size === variations.length && variations.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Original Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variations.map((variation) => {
                  const isSelected = selectedVariationIds.has(variation.id);
                  const isEditing = editingVariationId === variation.id;
                  
                  return (
                    <tr key={variation.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectVariation(variation.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {Object.entries(variation.attributes).map(([attrSlug, valueSlug]) => {
                            const attr = availableAttributes.find(a => a.slug === attrSlug);
                            if (!attr) return null;
                            const value = attributeValuesMap[attr._id]?.find(v => 
                              v.slug?.toLowerCase() === String(valueSlug).toLowerCase()
                            );
                            return (
                              <span
                                key={attrSlug}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                              >
                                {attr.type === 'color' && value?.value && (
                                  <span
                                    className="w-3 h-3 rounded-full border border-gray-300"
                                    style={{ backgroundColor: value.value }}
                                  />
                                )}
                                <span className="font-medium">{attr.name}:</span>
                                <span>{value?.name || valueSlug}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={variation.sku}
                            onChange={(e) => handleVariationChange(variation.id, 'sku', e.target.value.toUpperCase().slice(0, 48))}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md font-mono"
                            onBlur={() => setEditingVariationId(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="text-xs font-mono text-gray-700 cursor-pointer hover:text-blue-600"
                            onClick={() => setEditingVariationId(variation.id)}
                          >
                            {variation.sku}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={variation.price || ''}
                            onChange={(e) => handleVariationChange(variation.id, 'price', parseFloat(e.target.value) || undefined)}
                            className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md"
                            onBlur={() => setEditingVariationId(null)}
                          />
                        ) : (
                          <span
                            className="text-xs text-gray-700 cursor-pointer hover:text-blue-600"
                            onClick={() => setEditingVariationId(variation.id)}
                          >
                            {variation.price ? `₹${variation.price.toFixed(2)}` : `₹${basePrice.toFixed(2)}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={variation.originalPrice || ''}
                            onChange={(e) => handleVariationChange(variation.id, 'originalPrice', parseFloat(e.target.value) || undefined)}
                            className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md"
                            onBlur={() => setEditingVariationId(null)}
                          />
                        ) : (
                          <span
                            className="text-xs text-gray-700 cursor-pointer hover:text-blue-600"
                            onClick={() => setEditingVariationId(variation.id)}
                          >
                            {variation.originalPrice ? `₹${variation.originalPrice.toFixed(2)}` : `₹${baseOriginalPrice.toFixed(2)}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={variation.stock}
                            onChange={(e) => handleVariationChange(variation.id, 'stock', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md"
                            onBlur={() => setEditingVariationId(null)}
                          />
                        ) : (
                          <span
                            className="text-xs text-gray-700 cursor-pointer hover:text-blue-600"
                            onClick={() => setEditingVariationId(variation.id)}
                          >
                            {variation.stock}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          variation.isActive !== false
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {variation.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingVariationId(isEditing ? null : variation.id)}
                            className="text-blue-600 hover:text-blue-800"
                            title={isEditing ? 'Done' : 'Edit'}
                          >
                            <FaEdit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariation(variation.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <FaTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {variations.length === 0 && selectedAttributeIds.length > 0 && !loadingAttributes && (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No variations generated yet.</p>
          <p className="text-sm">Select attribute values above to automatically generate variations.</p>
        </div>
      )}
    </div>
  );
};

export default ProductAttributeVariations;
