import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaTrash, FaCog, FaChevronDown, FaChevronRight, FaCheck, FaTimes, FaMagic, FaUpload, FaExternalLinkAlt } from 'react-icons/fa';
import { attributesAPI, attributeValuesAPI, uploadAPI } from '../../services/api';
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
  /** Product slug — enables "Full Edit" link to dedicated variation edit page */
  productSlug?: string;
  /** Store brands — enables brand as a variation dimension (brand × attributes). */
  availableBrands?: Array<{ _id: string; name: string }>;
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
  productSlug,
  availableBrands = [],
}) => {
  // Brand as a variation dimension. Initialised from any brands already on the variations.
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>(
    () => Array.from(new Set((variations || []).map(v => v.brandId).filter(Boolean))) as string[]
  );
  const toggleBrand = (id: string) =>
    setSelectedBrandIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
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
  const [uploadingImages, setUploadingImages] = useState<Record<string, boolean>>({});
  const editRowRef = useRef<HTMLTableRowElement>(null);
  // Inline attribute-value / attribute creation
  const [newValueInput, setNewValueInput] = useState<Record<string, string>>({});
  const [valueGlobal, setValueGlobal] = useState<Record<string, boolean>>({});
  const [savingValueFor, setSavingValueFor] = useState<string | null>(null);
  const [newAttrName, setNewAttrName] = useState('');
  const [creatingAttr, setCreatingAttr] = useState(false);

  // Load available attributes
  useEffect(() => {
    const loadAttributes = async () => {
      setLoadingAttributes(true);
      try {
        const attrs = await attributesAPI.list({ isActive: true });
        const attributesList = Array.isArray(attrs) ? attrs : (attrs?.data || []);
        setAvailableAttributes(attributesList);
        
        // Load values for all attributes - use Promise.all to prevent race conditions
        const valuesMap: Record<string, AttributeValueOption[]> = {};
        
        // Use Promise.all to load all values in parallel but maintain correct mapping
        await Promise.all(
          attributesList.map(async (attr: AttributeOption) => {
            const currentAttributeId = attr._id; // Capture attribute ID for this iteration
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
              // Use captured attribute ID to ensure correct mapping
              valuesMap[currentAttributeId] = values;
            } catch (err) {
              console.error(`Failed to load values for attribute ${currentAttributeId} (${attr.slug}):`, err);
              valuesMap[currentAttributeId] = [];
            }
          })
        );
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
    if (selectedAttrs.length === 0 && selectedBrandIds.length === 0) {
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

    // Brand axis: if brands are selected, each attribute combo is repeated per brand.
    // Potency/size values are defined ONCE (shared), so they never duplicate across brands.
    const brandAxis = selectedBrandIds.length > 0
      ? selectedBrandIds.map(id => ({ id, name: availableBrands.find(b => b._id === id)?.name || '' }))
      : [{ id: undefined as string | undefined, name: '' }];

    // Dedup key includes brand so the same attributes under two brands are distinct.
    const existingVariationsMap = new Map(
      variations.map(v => [JSON.stringify({ ...v.attributes, __brand: v.brandId || '' }), v])
    );

    const newVariations: ProductVariation[] = [];
    let index = 0;
    for (const brand of brandAxis) {
      for (const attrs of valueCombinations) {
        const key = JSON.stringify({ ...attrs, __brand: brand.id || '' });
        const existing = existingVariationsMap.get(key);
        if (existing) { newVariations.push(existing); index++; continue; }

        const attrNames = selectedAttrs.map(attr => {
          const valueSlug = attrs[attr.slug];
          const allValues = attributeValuesMap[attr._id] || [];
          const value = allValues.find(v => v.slug?.toLowerCase() === String(valueSlug).toLowerCase());
          return value?.slug?.toUpperCase() || value?.name?.toUpperCase() || 'UNK';
        }).join('-').slice(0, 20);

        const brandCode = brand.name ? brand.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-' : '';
        const sku = `${baseSku}-${brandCode}${attrNames}`.toUpperCase().slice(0, 48);

        newVariations.push({
          id: `var-${Date.now()}-${index++}`,
          attributes: attrs,
          brandId: brand.id,
          brandName: brand.name || undefined,
          price: basePrice,
          originalPrice: baseOriginalPrice,
          stock: 0,
          sku,
          images: [],
          isActive: true,
        });
      }
    }

    onVariationsChange(newVariations);
  };

  // Clear variations when no attributes are selected
  useEffect(() => {
    if (selectedAttributeIds.length === 0) {
      onVariationsChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAttributeIds]);

  // Pre-expand already-selected attributes (edit mode) so their values are visible.
  useEffect(() => {
    if (selectedAttributeIds.length && availableAttributes.length) {
      setExpandedAttributes(prev => new Set([...prev, ...selectedAttributeIds]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableAttributes.length]);

  const handleAttributeToggle = (attributeId: string) => {
    const selecting = !selectedAttributeIds.includes(attributeId);
    const newIds = selecting
      ? [...selectedAttributeIds, attributeId]
      : selectedAttributeIds.filter(id => id !== attributeId);
    onAttributeIdsChange(newIds);

    // Auto-expand on select so existing values are visible immediately.
    if (selecting) {
      setExpandedAttributes(prev => new Set([...prev, attributeId]));
    } else {
      // Clear values when attribute is deselected
      const newValues = { ...selectedAttributeValues };
      delete newValues[attributeId];
      onAttributeValuesChange(newValues);
    }
  };

  const slugifyVal = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Add a value to an attribute. Default = LOCAL (this product only); tick "global"
  // to also persist it to the shared attribute-value catalog.
  const handleAddValue = async (attr: AttributeOption) => {
    const raw = (newValueInput[attr._id] || '').trim();
    if (!raw) return;
    const isGlobal = !!valueGlobal[attr._id];
    const slug = slugifyVal(raw);
    setSavingValueFor(attr._id);
    try {
      let nv: AttributeValueOption;
      if (isGlobal) {
        const created: any = await attributeValuesAPI.create(attr._id, { name: raw, slug, value: raw });
        nv = { _id: created?._id || created?.id, name: created?.name || raw, slug: created?.slug || slug, attributeId: attr._id, value: created?.value } as AttributeValueOption;
      } else {
        nv = { _id: `local:${attr._id}:${slug}`, name: raw, slug, attributeId: attr._id } as AttributeValueOption;
      }
      if (!nv._id) return;
      setAttributeValuesMap(prev => ({ ...prev, [attr._id]: [...(prev[attr._id] || []), nv] }));
      setNewValueInput(prev => ({ ...prev, [attr._id]: '' }));
      onAttributeValuesChange({
        ...selectedAttributeValues,
        [attr._id]: [...(selectedAttributeValues[attr._id] || []), nv._id],
      });
    } catch (e) {
      console.error('Failed to add attribute value', e);
    } finally {
      setSavingValueFor(null);
    }
  };

  const handleAddAttribute = async () => {
    const raw = newAttrName.trim();
    if (!raw) return;
    setCreatingAttr(true);
    try {
      const created: any = await attributesAPI.create({ name: raw, slug: slugifyVal(raw), type: 'select' });
      const c = created?.data || created;
      if (c && (c._id || c.id)) {
        const na = { _id: c._id || c.id, name: c.name || raw, slug: c.slug || slugifyVal(raw), type: c.type || 'select' } as AttributeOption;
        setAvailableAttributes(prev => [...prev, na]);
        setAttributeValuesMap(prev => ({ ...prev, [na._id]: [] }));
        setExpandedAttributes(prev => new Set([...prev, na._id]));
        setNewAttrName('');
        onAttributeIdsChange([...selectedAttributeIds, na._id]);
      }
    } catch (e) {
      console.error('Failed to create attribute', e);
    } finally {
      setCreatingAttr(false);
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

  // Handle image upload for variation
  const handleImageUpload = async (variationId: string, files: FileList) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploadingImages(prev => ({ ...prev, [variationId]: true }));
    try {
      const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
      const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
      const variation = variations.find(v => v.id === variationId);
      if (variation) {
        handleVariationChange(variationId, 'images', [...(variation.images || []), ...uploadedUrls]);
      }
    } catch (error) {
      console.error('Failed to upload images:', error);
    } finally {
      setUploadingImages(prev => ({ ...prev, [variationId]: false }));
    }
  };

  // Handle image removal
  const handleRemoveImage = (variationId: string, imageIndex: number) => {
    const variation = variations.find(v => v.id === variationId);
    if (variation && variation.images) {
      const newImages = variation.images.filter((_, idx) => idx !== imageIndex);
      handleVariationChange(variationId, 'images', newImages);
    }
  };

  // Close edit mode when clicking outside - but NOT when clicking inside the edit form
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!editingVariationId) return;
      
      const target = event.target as HTMLElement;
      
      // Don't close if clicking inside the edit form row
      if (editRowRef.current && editRowRef.current.contains(target)) {
        return;
      }
      
      // Don't close if clicking on the edit/done button that opened this edit mode
      // Find the button that corresponds to the current editing variation
      const editButton = target.closest('button[title="Done"]') || target.closest('button[title="Edit"]');
      if (editButton) {
        // Check if this button is for the currently editing variation
        const row = editButton.closest('tr');
        if (row) {
          // Get the variation ID from the row's data or context
          // Since we can't easily get it, we'll just check if it's in the same table
          const table = row.closest('table');
          if (table && editRowRef.current && table.contains(editRowRef.current)) {
            // This is likely the button for this variation, don't close
            return;
          }
        }
      }
      
      // Close if clicking outside
      setEditingVariationId(null);
    };

    if (editingVariationId) {
      // Use a small delay to avoid immediate closure when opening edit mode
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 200);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingVariationId]);

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
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Variants</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Select attributes, choose values, then generate variant combinations
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Brand dimension — a product (medicine) sold under multiple brands.
            Potency/size below are shared across brands (defined once). */}
        {availableBrands.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
              Brands <span className="normal-case text-gray-400 font-normal">— generate variations per brand (optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableBrands.map(b => {
                const on = selectedBrandIds.includes(b._id);
                return (
                  <button key={b._id} type="button" onClick={() => toggleBrand(b._id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'}`}>
                    {b.name}
                  </button>
                );
              })}
            </div>
            {selectedBrandIds.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                Each selected brand × potency × size becomes its own variation with independent price, stock, images &amp; content.
              </p>
            )}
          </div>
        )}

        {/* Attribute Selection Section */}
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
            Attributes <span className="normal-case text-gray-400 font-normal">— potency, size (shared across brands)</span>
          </label>
          {loadingAttributes ? (
            <div className="text-sm text-gray-500">Loading attributes...</div>
          ) : availableAttributes.length === 0 ? (
            <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              No attributes available. <a href="/admin/attributes" className="text-blue-600 hover:underline">Create attributes first</a>
            </div>
          ) : (
            <div className="space-y-2">
              {availableAttributes.map(attr => {
                const isSelected = selectedAttributeIds.includes(attr._id);
                const isExpanded = expandedAttributes.has(attr._id);
                const values = attributeValuesMap[attr._id] || [];
                const selectedValues = selectedAttributeValues[attr._id] || [];

                return (
                  <div key={attr._id} className={`rounded-lg border transition-colors ${isSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleAttributeToggle(attr._id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-900">{attr.name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{attr.type}</span>
                        {isSelected && selectedValues.length > 0 && (
                          <span className="text-xs text-blue-600 font-medium">{selectedValues.length} selected</span>
                        )}
                      </label>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(attr._id)}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                        </button>
                      )}
                    </div>

                    {isSelected && isExpanded && (
                      <div className="px-3 pb-3 border-t border-blue-100">
                        <div className="text-xs text-gray-500 mb-2 mt-2">
                          {values.length > 0 ? `${selectedValues.length} of ${values.length} selected` : 'No values yet — add one below'}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {values.map(value => {
                            const isValueSelected = selectedValues.includes(value._id);
                            return (
                              <button
                                key={value._id}
                                type="button"
                                onClick={() => handleValueToggle(attr._id, value._id)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                                  isValueSelected
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                }`}
                              >
                                {attr.type === 'color' && value.value && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-white/40"
                                    style={{ backgroundColor: value.value }}
                                  />
                                )}
                                {attr.type === 'image' && value.imageUrl && (
                                  <img src={value.imageUrl} alt={value.name} className="w-3 h-3 rounded object-cover" />
                                )}
                                {value.name}
                              </button>
                            );
                          })}
                        </div>
                        {/* Inline add value (local by default; tick Global to save to catalog) */}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={newValueInput[attr._id] || ''}
                            onChange={e => setNewValueInput(prev => ({ ...prev, [attr._id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddValue(attr); } }}
                            placeholder={`New ${attr.name} value…`}
                            className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap" title="Save to the shared attribute catalog (reusable across products). Unchecked = local to this product only.">
                            <input type="checkbox" checked={!!valueGlobal[attr._id]}
                              onChange={e => setValueGlobal(prev => ({ ...prev, [attr._id]: e.target.checked }))} />
                            Global
                          </label>
                          <button type="button" onClick={() => handleAddValue(attr)}
                            disabled={savingValueFor === attr._id || !(newValueInput[attr._id] || '').trim()}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
                            {savingValueFor === attr._id ? 'Adding…' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Inline create new attribute */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={newAttrName}
                  onChange={e => setNewAttrName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttribute(); } }}
                  placeholder="New attribute (e.g. Brand, Potency, Size)…"
                  className="flex-1 px-2.5 py-1.5 border border-dashed border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button type="button" onClick={handleAddAttribute}
                  disabled={creatingAttr || !newAttrName.trim()}
                  className="px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-40">
                  {creatingAttr ? 'Creating…' : '+ New Attribute'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        {(selectedAttributeIds.length > 0 || selectedBrandIds.length > 0) && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={generateVariations}
              disabled={(() => {
                const selectedAttrs = availableAttributes.filter(a => selectedAttributeIds.includes(a._id));
                return !selectedAttrs.every(attr => (selectedAttributeValues[attr._id] || []).length > 0) || loadingAttributes;
              })()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <FaMagic size={13} />
              Generate Variants
            </button>
          </div>
        )}

        {/* Variants Table */}
        {variations.length > 0 && (
          <div>
            {/* Table header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {variations.length} variant{variations.length !== 1 ? 's' : ''}
                </span>
                {selectedVariationIds.size > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {selectedVariationIds.size} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedVariationIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setBulkEditMode(v => !v)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        bulkEditMode
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Bulk edit
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkRemove}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                    >
                      Delete ({selectedVariationIds.size})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onRegenerateAllSkus}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                >
                  <FaCog size={11} />
                  Regen SKUs
                </button>
              </div>
            </div>

            {/* Bulk Edit Bar */}
            {bulkEditMode && selectedVariationIds.size > 0 && (
              <div className="mb-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-blue-800">
                    Apply to {selectedVariationIds.size} selected variant{selectedVariationIds.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setBulkEditMode(false); setBulkEditValues({ price: '', originalPrice: '', stock: '', isActive: true }); }}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <FaTimes size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Price (₹)</label>
                    <input type="number" step="0.01" min="0" value={bulkEditValues.price}
                      onChange={e => setBulkEditValues({ ...bulkEditValues, price: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md" placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Orig. Price (₹)</label>
                    <input type="number" step="0.01" min="0" value={bulkEditValues.originalPrice}
                      onChange={e => setBulkEditValues({ ...bulkEditValues, originalPrice: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md" placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Stock</label>
                    <input type="number" min="0" value={bulkEditValues.stock}
                      onChange={e => setBulkEditValues({ ...bulkEditValues, stock: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md" placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Status</label>
                    <select value={bulkEditValues.isActive ? 'active' : 'inactive'}
                      onChange={e => setBulkEditValues({ ...bulkEditValues, isActive: e.target.value === 'active' })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <button type="button" onClick={handleBulkEdit}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1">
                    <FaCheck size={11} /> Apply
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-3 py-2.5 text-left">
                      <input
                        type="checkbox"
                        checked={selectedVariationIds.size === variations.length && variations.length > 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variant</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orig. Price</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="w-16 px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {variations.map((variation) => {
                    const isSelected = selectedVariationIds.has(variation.id);
                    const isEditing = editingVariationId === variation.id;

                    return (
                      <React.Fragment key={variation.id}>
                        {/* Compact row */}
                        <tr className={`transition-colors ${isSelected ? 'bg-blue-50' : isEditing ? 'bg-gray-50' : 'hover:bg-gray-50/60'}`}>
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectVariation(variation.id)}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(variation.brandName || variation.brandId) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-md font-semibold">
                                  {variation.brandName || availableBrands.find(b => b._id === variation.brandId)?.name || 'Brand'}
                                </span>
                              )}
                              {Object.entries(variation.attributes).map(([attrSlug, valueSlug]) => {
                                const attr = availableAttributes.find(a => a.slug === attrSlug);
                                if (!attr) return null;
                                const value = attributeValuesMap[attr._id]?.find(v =>
                                  v.slug?.toLowerCase() === String(valueSlug).toLowerCase()
                                );
                                return (
                                  <span key={attrSlug} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-md font-medium">
                                    {attr.type === 'color' && value?.value && (
                                      <span className="w-2.5 h-2.5 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: value.value }} />
                                    )}
                                    {value?.name || valueSlug}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-mono text-gray-600">{variation.sku}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-gray-800 font-medium">
                              ₹{(variation.price ?? basePrice).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-gray-500">
                              {(variation.originalPrice ?? baseOriginalPrice) > 0
                                ? `₹${(variation.originalPrice ?? baseOriginalPrice).toLocaleString('en-IN')}`
                                : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-gray-800">{variation.stock}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              variation.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {variation.isActive !== false ? 'Active' : 'Draft'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingVariationId(isEditing ? null : variation.id)}
                                className={`p-1.5 rounded transition-colors ${
                                  isEditing
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                                title={isEditing ? 'Close' : 'Quick edit'}
                              >
                                {isEditing ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
                              </button>
                              {productSlug && (
                                <Link
                                  to={`/products/${productSlug}/variations/${variations.indexOf(variation)}/edit`}
                                  title="Full edit in new page"
                                  className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <FaExternalLinkAlt size={10} />
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveVariation(variation.id)}
                                className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <FaTrash size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded edit panel */}
                        {isEditing && (
                          <tr ref={editRowRef}>
                            <td colSpan={8} className="px-0 py-0 bg-gray-50 border-b border-gray-200">
                              <div className="px-6 py-5 border-l-4 border-blue-400">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-sm font-semibold text-gray-900">Edit variant</h4>
                                  <button
                                    type="button"
                                    onClick={() => setEditingVariationId(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    <FaTimes size={14} />
                                  </button>
                                </div>

                                {/* Fields grid — identity fields */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Variation name</label>
                                    <input
                                      type="text"
                                      value={variation.name || ''}
                                      onChange={e => handleVariationChange(variation.id, 'name', e.target.value)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="e.g. Abies canadensis CH"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
                                    <input
                                      type="text"
                                      value={variation.slug || ''}
                                      onChange={e => handleVariationChange(variation.id, 'slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="e.g. abies-canadensis-ch-6c-30ml"
                                    />
                                  </div>
                                </div>

                                {/* Pricing / stock grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
                                    <input
                                      type="text"
                                      value={variation.sku}
                                      onChange={e => handleVariationChange(variation.id, 'sku', e.target.value.toUpperCase().slice(0, 48))}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="SKU"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={variation.price ?? ''}
                                      onChange={e => handleVariationChange(variation.id, 'price', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="0.00"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Compare at (₹)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={variation.originalPrice ?? ''}
                                      onChange={e => handleVariationChange(variation.id, 'originalPrice', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="0.00"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Stock</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={variation.stock ?? ''}
                                      onChange={e => { const v = e.target.value; handleVariationChange(variation.id, 'stock', v === '' ? undefined : Math.max(0, parseInt(v) || 0)); }}
                                      onBlur={e => { if (!e.target.value) handleVariationChange(variation.id, 'stock', 0); }}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>

                                {/* Status toggle */}
                                <div className="flex items-center gap-3 mb-4">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <button
                                      type="button"
                                      onClick={() => handleVariationChange(variation.id, 'isActive', !(variation.isActive !== false))}
                                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                        variation.isActive !== false ? 'bg-blue-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                        variation.isActive !== false ? 'translate-x-4' : 'translate-x-0.5'
                                      }`} />
                                    </button>
                                    <span className="text-xs font-medium text-gray-700">
                                      {variation.isActive !== false ? 'Active' : 'Draft'}
                                    </span>
                                  </label>
                                </div>

                                {/* Short description */}
                                <div className="mb-4">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Short description</label>
                                  <textarea
                                    value={variation.shortDescription || ''}
                                    onChange={e => handleVariationChange(variation.id, 'shortDescription', e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    rows={2}
                                    placeholder="Optional — unique description for this variant"
                                  />
                                </div>

                                {/* Content tabs (description / dosage / importantInfo) */}
                                <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                      value={(variation as any).description || ''}
                                      onChange={e => handleVariationChange(variation.id, 'description' as any, e.target.value)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      rows={4}
                                      placeholder="Variation-specific description"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Dosage</label>
                                    <textarea
                                      value={(variation as any).dosage || ''}
                                      onChange={e => handleVariationChange(variation.id, 'dosage' as any, e.target.value)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      rows={4}
                                      placeholder="Dosage instructions"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Important info</label>
                                    <textarea
                                      value={(variation as any).importantInfo || ''}
                                      onChange={e => handleVariationChange(variation.id, 'importantInfo' as any, e.target.value)}
                                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      rows={4}
                                      placeholder="Manufacturer info, warnings, etc."
                                    />
                                  </div>
                                </div>

                                {/* Variation categories (read-only display) */}
                                {Array.isArray((variation as any).categories) && (variation as any).categories.length > 0 && (
                                  <div className="mb-4">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Categories (variation-specific)</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {((variation as any).categories as any[]).map((cat: any, ci: number) => {
                                        const label = typeof cat === 'object' ? (cat.name || cat.slug || String(cat._id)) : String(cat);
                                        return (
                                          <span key={ci} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                            {label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Images */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-2">Variant images</label>
                                  <div className="flex items-start gap-3 flex-wrap">
                                    <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-dashed border-gray-300 rounded-md text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer bg-white transition-colors">
                                      <FaUpload size={12} />
                                      {uploadingImages[variation.id] ? 'Uploading…' : 'Add images'}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        disabled={uploadingImages[variation.id]}
                                        onChange={e => {
                                          if (e.target.files) {
                                            handleImageUpload(variation.id, e.target.files);
                                            e.target.value = '';
                                          }
                                        }}
                                      />
                                    </label>
                                    {variation.images?.map((url, idx) => (
                                      <div key={idx} className="relative group w-16 h-16 flex-shrink-0">
                                        <img src={url} alt={`v${idx + 1}`} className="w-full h-full object-cover rounded-md border border-gray-200" />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveImage(variation.id, idx)}
                                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <FaTimes size={8} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {variations.length === 0 && selectedAttributeIds.length > 0 && !loadingAttributes && (
          <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-lg">
            <FaMagic size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select attribute values and click Generate Variants</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductAttributeVariations;
