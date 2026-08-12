import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaTrash, FaCog, FaChevronDown, FaChevronRight, FaCheck, FaTimes, FaMagic, FaUpload, FaExternalLinkAlt } from 'react-icons/fa';
import { attributesAPI, attributeValuesAPI, uploadAPI, categoriesAPI } from '../../services/api';
import type { AttributeOption, AttributeValueOption, ProductVariation } from '../../types/productForm';

// UI-only tuning: attributes with more values than this render a searchable checkbox
// picker instead of a chip cloud (homeomead potency/volume carry 40–150+ values).
const VALUE_PICKER_THRESHOLD = 12;
// Client-side page size for the generated-variations table.
const VARIATIONS_PER_PAGE = 50;

// ONE brand control: brand renders as a single "Brand" row inside the attribute
// list (checkbox + collapsible searchable picker) backed by the store BRANDS list,
// and generated variations carry brandId → primary_brand_id. The store attribute
// catalogue can ALSO contain a literal "Brand" attribute (homeomead does — slug
// `brand`, flagged as a storefront card axis); it NEVER renders here (even when a
// legacy product has it selected — two brand pickers for one concept was redundant).
// Its id stays in selectedAttributeIds and its selectedAttributeValues entry is
// never touched, so saving keeps the product's brand attribute links intact; its
// previously selected values are MERGED into the brand selection on load (by
// case-insensitive name match) so nothing silently disappears from the editor.
const isBrandAttributeKey = (key: string) =>
  ['brand', 'brands'].includes((key || '').toLowerCase().trim());
const isBrandAttribute = (a: AttributeOption) =>
  isBrandAttributeKey(a.slug || a.name || '');

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
  const hasSelectedBrands = selectedBrandIds.length > 0;
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
  // Categories for the per-variation category picker (each variation can be linked
  // to its OWN category, overriding the product's for storefront listing).
  const [availableCategories, setAvailableCategories] = useState<Array<{ _id: string; id?: string; name: string; parent?: string | null }>>([]);
  const editRowRef = useRef<HTMLTableRowElement>(null);
  // Inline attribute-value / attribute creation
  const [newValueInput, setNewValueInput] = useState<Record<string, string>>({});
  const [valueGlobal, setValueGlobal] = useState<Record<string, boolean>>({});
  const [savingValueFor, setSavingValueFor] = useState<string | null>(null);
  const [newAttrName, setNewAttrName] = useState('');
  const [creatingAttr, setCreatingAttr] = useState(false);
  // ── Presentation-only UX state (no contract change) ────────────────────────
  // Brand renders as ONE attribute-style row: checkbox to enable, collapsible
  // searchable picker. "Enabled" is implied by having selected brands; the extra
  // flag lets a freshly ticked row stay open before any brand is picked.
  const [brandRowChecked, setBrandRowChecked] = useState(false);
  const [brandExpanded, setBrandExpanded] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  // Per-attribute value search text (used only above VALUE_PICKER_THRESHOLD).
  const [valueSearch, setValueSearch] = useState<Record<string, string>>({});
  // Variation table: text filter + client-side pagination.
  const [variationFilter, setVariationFilter] = useState('');
  const [variationPage, setVariationPage] = useState(1);

  // Categories for the per-variation picker.
  useEffect(() => {
    categoriesAPI.list()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.data?.data ?? []);
        setAvailableCategories(Array.isArray(list) ? list : []);
      })
      .catch(() => setAvailableCategories([]));
  }, []);

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
    // Brand is crossed EXACTLY ONCE — via the brand axis below. A selected
    // brand-named catalogue attribute (legacy products) must NOT also enter the
    // attribute cross: it used to multiply brand twice (brand-values × brands),
    // and with 0 values selected it would even cross ALL catalogue brand values.
    const selectedAttrs = availableAttributes.filter(a =>
      selectedAttributeIds.includes(a._id) && !(availableBrands.length > 0 && isBrandAttribute(a)));
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
    // Key is ORDER-INSENSITIVE and ignores legacy `brand`/`brands` attribute-map
    // entries (generation no longer emits them; existing rows that carry one plus
    // a brandId must still match their brand-free regenerated combo and survive).
    const variationKey = (attrs: Record<string, string>, brandId?: string) => {
      const parts = Object.keys(attrs || {})
        .filter(k => !isBrandAttributeKey(k))
        .sort()
        .map(k => `${k.toLowerCase().trim()}=${String(attrs[k]).toLowerCase().trim()}`);
      parts.push(`__brand=${brandId || ''}`);
      return parts.join('|');
    };
    const existingVariationsMap = new Map(
      variations.map(v => [variationKey(v.attributes, v.brandId), v])
    );

    const newVariations: ProductVariation[] = [];
    let index = 0;
    for (const brand of brandAxis) {
      for (const attrs of valueCombinations) {
        const key = variationKey(attrs, brand.id);
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

  // Clear variations when neither attributes nor brands are selected (brand is
  // an axis like any attribute — a brand-only variant set must not be wiped).
  useEffect(() => {
    if (selectedAttributeIds.length === 0 && selectedBrandIds.length === 0) {
      onVariationsChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAttributeIds, selectedBrandIds]);

  // Pre-expand selected attributes that already HAVE chosen values (edit mode) so
  // they are visible; attributes with no selected values stay collapsed by default.
  useEffect(() => {
    if (selectedAttributeIds.length && availableAttributes.length) {
      const withValues = selectedAttributeIds.filter(id => (selectedAttributeValues[id] || []).length > 0);
      if (withValues.length) setExpandedAttributes(prev => new Set([...prev, ...withValues]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableAttributes.length]);

  // MIGRATION SAFETY: legacy products carry a SELECTED brand-named attribute whose
  // values used to render as their own row. That row no longer exists, so its
  // selected values are merged into the brand selection here (case-insensitive
  // name match against the store brand list; unmatched names are ignored) — nothing
  // silently disappears from the editor. Each value id is processed AT MOST ONCE
  // per mount, so deliberately removing a brand afterwards is never undone, and
  // late-arriving product/catalogue data is still picked up. The attribute's id in
  // selectedAttributeIds and its selectedAttributeValues entry are left untouched,
  // so saving keeps the product's brand attribute links exactly as before.
  const mergedLegacyBrandValueIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (availableBrands.length === 0 || availableAttributes.length === 0) return;
    const brandAttrs = availableAttributes.filter(a =>
      isBrandAttribute(a) && selectedAttributeIds.includes(a._id));
    if (brandAttrs.length === 0) return;
    const idsToAdd: string[] = [];
    for (const attr of brandAttrs) {
      const values = attributeValuesMap[attr._id];
      if (!values) continue; // values not loaded yet — re-run when the map fills
      for (const valueId of selectedAttributeValues[attr._id] || []) {
        if (mergedLegacyBrandValueIds.current.has(valueId)) continue;
        mergedLegacyBrandValueIds.current.add(valueId);
        const val = values.find(v => v._id === valueId);
        const nm = (val?.name || val?.slug || '').trim().toLowerCase();
        if (!nm) continue;
        const brand = availableBrands.find(b => (b.name || '').trim().toLowerCase() === nm);
        if (brand) idsToAdd.push(brand._id);
      }
    }
    if (idsToAdd.length) {
      setSelectedBrandIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableBrands, availableAttributes, attributeValuesMap, selectedAttributeIds, selectedAttributeValues]);

  // Pre-expand the Brand row when brands are already selected (edit mode) —
  // mirrors the pre-expansion of attribute rows that already have values.
  useEffect(() => {
    if (hasSelectedBrands) setBrandExpanded(true);
  }, [hasSelectedBrands]);

  // Checkbox on the Brand row — behaves like deselecting an attribute row:
  // unticking clears the selected brands (the row's "values").
  const handleBrandRowToggle = () => {
    if (brandRowChecked || hasSelectedBrands) {
      setBrandRowChecked(false);
      setSelectedBrandIds([]);
      setBrandExpanded(false);
      setBrandSearch('');
    } else {
      setBrandRowChecked(true);
      setBrandExpanded(true);
    }
  };

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

  // ── Variation table: filter + pagination (presentation only) ───────────────
  const filterQ = variationFilter.trim().toLowerCase();
  const variationMatchesFilter = (v: ProductVariation): boolean => {
    if (!filterQ) return true;
    const haystack: string[] = [v.sku || '', v.name || '', v.brandName || ''];
    if (v.brandId) {
      const b = availableBrands.find(x => x._id === v.brandId);
      if (b) haystack.push(b.name);
    }
    for (const [attrSlug, valueSlug] of Object.entries(v.attributes || {})) {
      haystack.push(String(valueSlug));
      const attr = availableAttributes.find(a => a.slug === attrSlug);
      const val = attr
        ? (attributeValuesMap[attr._id] || []).find(av => av.slug?.toLowerCase() === String(valueSlug).toLowerCase())
        : undefined;
      if (val?.name) haystack.push(val.name);
    }
    return haystack.some(s => s.toLowerCase().includes(filterQ));
  };
  const filteredVariations = filterQ ? variations.filter(variationMatchesFilter) : variations;
  const totalPages = Math.max(1, Math.ceil(filteredVariations.length / VARIATIONS_PER_PAGE));
  const currentPage = Math.min(variationPage, totalPages);
  const pagedVariations = filteredVariations.slice(
    (currentPage - 1) * VARIATIONS_PER_PAGE,
    currentPage * VARIATIONS_PER_PAGE
  );
  const allFilteredSelected =
    filteredVariations.length > 0 && filteredVariations.every(v => selectedVariationIds.has(v.id));

  // Select/deselect operates on the FILTERED set so "select all" respects the filter.
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedVariationIds);
      filteredVariations.forEach(v => next.delete(v.id));
      setSelectedVariationIds(next);
    } else {
      setSelectedVariationIds(new Set([...selectedVariationIds, ...filteredVariations.map(v => v.id)]));
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
          <span className="font-medium text-gray-700">1</span> Tick what varies&ensp;·&ensp;
          <span className="font-medium text-gray-700">2</span> Tick the values of each&ensp;·&ensp;
          <span className="font-medium text-gray-700">3</span> Generate, then set prices &amp; stock per pack
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Attribute Selection Section — Brand renders as the FIRST row (it is
            one of the attributes; its picker is backed by the store brand list
            and generated variations carry brandId → primary_brand_id). */}
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
            What varies? <span className="normal-case text-gray-400 font-normal">— tick an attribute, then tick its values (e.g. Brand, Potency, Volume)</span>
          </label>
          {loadingAttributes ? (
            <div className="text-sm text-gray-500">Loading attributes...</div>
          ) : availableAttributes.length === 0 && availableBrands.length === 0 ? (
            <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              No attributes available. <a href="/admin/attributes" className="text-blue-600 hover:underline">Create attributes first</a>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Brand — THE single brand control, styled as an attribute row.
                  Checkbox enables it, the collapsible body is a searchable picker
                  over the store BRAND list (not attribute values). Selected brands
                  cross the other attributes once at generation; each variation
                  carries brandId → primary_brand_id. */}
              {availableBrands.length > 0 && (() => {
                const brandRowSelected = brandRowChecked || hasSelectedBrands;
                const q = brandSearch.trim().toLowerCase();
                const shownBrands = q
                  ? availableBrands.filter(b => (b.name || '').toLowerCase().includes(q))
                  : availableBrands;
                const selectShownBrands = () =>
                  setSelectedBrandIds(prev => Array.from(new Set([...prev, ...shownBrands.map(b => b._id)])));
                const clearBrands = () => setSelectedBrandIds([]);
                return (
                  <div className={`rounded-lg border transition-colors ${brandRowSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={brandRowSelected}
                          onChange={handleBrandRowToggle}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-900">Brand</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">brand</span>
                        {brandRowSelected && selectedBrandIds.length > 0 && (
                          <span className="text-xs text-blue-600 font-medium">{selectedBrandIds.length} selected</span>
                        )}
                      </label>
                      {brandRowSelected && (
                        <button
                          type="button"
                          onClick={() => setBrandExpanded(e => !e)}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {brandExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                        </button>
                      )}
                    </div>

                    {brandRowSelected && brandExpanded && (
                      <div className="px-3 pb-3 border-t border-blue-100">
                        {availableBrands.length > VALUE_PICKER_THRESHOLD ? (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                value={brandSearch}
                                onChange={e => setBrandSearch(e.target.value)}
                                placeholder={`Search ${availableBrands.length} brands…`}
                                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                              />
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                                {selectedBrandIds.length} selected
                              </span>
                              <button
                                type="button"
                                onClick={selectShownBrands}
                                disabled={shownBrands.length === 0}
                                className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
                              >
                                Select shown
                              </button>
                              <button
                                type="button"
                                onClick={clearBrands}
                                disabled={selectedBrandIds.length === 0}
                                className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
                              >
                                Clear
                              </button>
                            </div>
                            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md bg-white divide-y divide-gray-50">
                              {shownBrands.length === 0 ? (
                                <div className="px-2.5 py-3 text-xs text-gray-400">No brands match your search.</div>
                              ) : (
                                shownBrands.map(b => {
                                  const on = selectedBrandIds.includes(b._id);
                                  return (
                                    <label
                                      key={b._id}
                                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-gray-50"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={on}
                                        onChange={() => toggleBrand(b._id)}
                                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                      />
                                      <span className={on ? 'font-medium text-gray-900' : 'text-gray-600'}>{b.name}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            {q !== '' && (
                              <div className="text-xs text-gray-400 mt-1">Showing {shownBrands.length} of {availableBrands.length} brands</div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="text-xs text-gray-500 mb-2 mt-2">
                              {availableBrands.length > 0 ? `${selectedBrandIds.length} of ${availableBrands.length} selected` : 'No brands yet'}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {availableBrands.map(b => {
                                const on = selectedBrandIds.includes(b._id);
                                return (
                                  <button
                                    key={b._id}
                                    type="button"
                                    onClick={() => toggleBrand(b._id)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                                      on
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                                  >
                                    {b.name}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Pick more than one brand only when this product is sold under multiple brands — each brand gets its own set of variations (the other attribute values are shared).
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
              {availableAttributes.length === 0 && (
                <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  No attributes available. <a href="/admin/attributes" className="text-blue-600 hover:underline">Create attributes first</a>
                </div>
              )}
              {availableAttributes
                // ONE brand control (#brand): the Brand row above owns brand. A
                // literal "Brand"/"Brands" catalogue attribute NEVER renders here —
                // even when a legacy product has it selected (its id + values stay
                // in the form state untouched and keep round-tripping on save; its
                // values were merged into the Brand row's selection on load).
                .filter(attr => !(availableBrands.length > 0 && isBrandAttribute(attr)))
                .map(attr => {
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
                        {values.length > VALUE_PICKER_THRESHOLD ? (
                          /* Searchable value picker — chip clouds are unusable for large
                             sets (homeomead potency=40, volume=147 values). */
                          (() => {
                            const q = (valueSearch[attr._id] || '').trim().toLowerCase();
                            const shownValues = q
                              ? values.filter(v =>
                                  (v.name || '').toLowerCase().includes(q) || (v.slug || '').toLowerCase().includes(q))
                              : values;
                            const selectShown = () => {
                              const merged = Array.from(new Set([...selectedValues, ...shownValues.map(v => v._id)]));
                              onAttributeValuesChange({ ...selectedAttributeValues, [attr._id]: merged });
                            };
                            const clearAll = () => {
                              onAttributeValuesChange({ ...selectedAttributeValues, [attr._id]: [] });
                            };
                            return (
                              <div className="mt-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    value={valueSearch[attr._id] || ''}
                                    onChange={e => setValueSearch(prev => ({ ...prev, [attr._id]: e.target.value }))}
                                    placeholder={`Search ${values.length} values…`}
                                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                                  />
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                                    {selectedValues.length} selected
                                  </span>
                                  <button
                                    type="button"
                                    onClick={selectShown}
                                    disabled={shownValues.length === 0}
                                    className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
                                  >
                                    Select shown
                                  </button>
                                  <button
                                    type="button"
                                    onClick={clearAll}
                                    disabled={selectedValues.length === 0}
                                    className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
                                  >
                                    Clear
                                  </button>
                                </div>
                                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md bg-white divide-y divide-gray-50">
                                  {shownValues.length === 0 ? (
                                    <div className="px-2.5 py-3 text-xs text-gray-400">No values match your search.</div>
                                  ) : (
                                    shownValues.map(value => {
                                      const isValueSelected = selectedValues.includes(value._id);
                                      return (
                                        <label
                                          key={value._id}
                                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-gray-50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isValueSelected}
                                            onChange={() => handleValueToggle(attr._id, value._id)}
                                            className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                          />
                                          {attr.type === 'color' && value.value && (
                                            <span
                                              className="w-2.5 h-2.5 rounded-full border border-gray-300 flex-shrink-0"
                                              style={{ backgroundColor: value.value }}
                                            />
                                          )}
                                          {attr.type === 'image' && value.imageUrl && (
                                            <img src={value.imageUrl} alt={value.name} className="w-3 h-3 rounded object-cover" />
                                          )}
                                          <span className={isValueSelected ? 'font-medium text-gray-900' : 'text-gray-600'}>{value.name}</span>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                                {q !== '' && (
                                  <div className="text-xs text-gray-400 mt-1">Showing {shownValues.length} of {values.length} values</div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <>
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
                          </>
                        )}
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

        {/* Generate — with a live preview of what will be created, so the
            merchant sees "12 variants (2 brands × 3 potencies × 2 sizes)"
            BEFORE committing instead of discovering the count afterwards. */}
        {(selectedAttributeIds.length > 0 || selectedBrandIds.length > 0) && (() => {
          // Brand-named attributes are excluded from generation (brand crosses
          // via the Brand row) — they must not gate the button or the count.
          const crossAttrs = availableAttributes.filter(a =>
            selectedAttributeIds.includes(a._id) && !(availableBrands.length > 0 && isBrandAttribute(a)));
          const missingValues = crossAttrs.filter(attr => (selectedAttributeValues[attr._id] || []).length === 0);
          const parts: string[] = [];
          let count = 1;
          if (selectedBrandIds.length > 0) {
            count *= selectedBrandIds.length;
            parts.push(`${selectedBrandIds.length} brand${selectedBrandIds.length === 1 ? '' : 's'}`);
          }
          for (const attr of crossAttrs) {
            const n = (selectedAttributeValues[attr._id] || []).length;
            if (n > 0) { count *= n; parts.push(`${n} ${attr.name.toLowerCase()}${n === 1 ? '' : 's'}`); }
          }
          const ready = missingValues.length === 0 && !loadingAttributes;
          return (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-t border-dashed border-gray-200 pt-4">
              <p className="text-xs text-gray-500 min-w-0">
                {!ready ? (
                  <>Tick at least one value for{' '}
                    <span className="font-medium text-amber-700">
                      {missingValues.map(a => a.name).join(', ')}
                    </span>{' '}to enable generation.</>
                ) : (
                  <>Will create <span className="font-semibold text-gray-900">{count} variant{count === 1 ? '' : 's'}</span>
                    {parts.length > 1 && <span className="text-gray-400"> ({parts.join(' × ')})</span>}.
                    Existing rows with the same combination are kept, not duplicated.</>
                )}
              </p>
              <button
                type="button"
                onClick={generateVariations}
                disabled={!ready}
                className="shrink-0 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <FaMagic size={13} />
                {ready ? `Generate ${count} variant${count === 1 ? '' : 's'}` : 'Generate variants'}
              </button>
            </div>
          );
        })()}

        {/* First-run guidance — a new variable product starts here. */}
        {variations.length === 0 && selectedAttributeIds.length === 0 && selectedBrandIds.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-700">No variants yet</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Tick what varies above — for example <span className="font-medium">Brand</span>,{' '}
              <span className="font-medium">Potency</span> and <span className="font-medium">Volume</span> —
              tick the values of each, then press Generate. Every combination becomes one sellable pack
              with its own SKU, price and stock.
            </p>
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

            {/* Filter — matches SKU + attribute values (case-insensitive) */}
            <div className="flex items-center gap-2 mb-3">
              <input
                value={variationFilter}
                onChange={e => { setVariationFilter(e.target.value); setVariationPage(1); }}
                placeholder="Filter by SKU or attribute value…"
                className="w-72 max-w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <span className="text-xs text-gray-500">
                showing {filteredVariations.length} of {variations.length}
              </span>
              {variationFilter !== '' && (
                <button
                  type="button"
                  onClick={() => { setVariationFilter(''); setVariationPage(1); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  clear
                </button>
              )}
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
                        checked={allFilteredSelected}
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
                  {pagedVariations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-400">
                        No variants match your filter.
                      </td>
                    </tr>
                  )}
                  {pagedVariations.map((variation) => {
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
                                // Legacy rows can carry brand in the attributes map too —
                                // the purple brand chip above already shows it once.
                                if (isBrandAttributeKey(attrSlug) && (variation.brandName || variation.brandId)) return null;
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
                                title={isEditing ? 'Close quick edit' : 'Quick edit price/stock inline'}
                              >
                                {isEditing ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
                              </button>
                              {/* The FULL editor was a 10px icon nobody could find —
                                  "where do I edit this variant?" was the #1 complaint.
                                  A labeled button is the primary action now. */}
                              {productSlug && (
                                <Link
                                  to={`/products/${productSlug}/variations/${encodeURIComponent((variation as any).sku || (variation as any).id || variations.indexOf(variation))}/edit`}
                                  title="Open the full variant editor (price, sale, images, content, inventory)"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors whitespace-nowrap"
                                >
                                  <FaExternalLinkAlt size={10} /> Edit variant
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

                                {/* Per-variation categories (optional override) */}
                                <div className="mb-4">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Categories <span className="font-normal text-gray-400">— optional; overrides the product&rsquo;s categories for THIS variation on the storefront</span>
                                  </label>
                                  <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-md bg-white max-h-28 overflow-y-auto">
                                    {availableCategories.length === 0 && (
                                      <span className="text-[11px] text-gray-400">No categories available.</span>
                                    )}
                                    {availableCategories.map((c) => {
                                      const cid = c._id ?? (c.id as string);
                                      const cur: string[] = Array.isArray(variation.categories) ? variation.categories : [];
                                      const selected = cur.includes(cid);
                                      return (
                                        <button
                                          key={cid}
                                          type="button"
                                          onClick={() => {
                                            const next = selected ? cur.filter(x => x !== cid) : [...cur, cid];
                                            handleVariationChange(variation.id, 'categories', next);
                                          }}
                                          className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${selected ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'}`}
                                        >
                                          {c.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {Array.isArray(variation.categories) && variation.categories.length > 0 && (
                                    <p className="mt-1 text-[10.5px] text-blue-600">
                                      Shows only in the {variation.categories.length} selected {variation.categories.length === 1 ? 'category' : 'categories'} (not the product&rsquo;s).
                                    </p>
                                  )}
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

            {/* Client-side pagination — keeps hundreds of variant rows out of the DOM */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-500">
                  Page {currentPage} of {totalPages} · {VARIATIONS_PER_PAGE} per page
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setVariationPage(Math.max(1, currentPage - 1))}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setVariationPage(Math.min(totalPages, currentPage + 1))}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {variations.length === 0 && (selectedAttributeIds.length > 0 || hasSelectedBrands) && !loadingAttributes && (
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
