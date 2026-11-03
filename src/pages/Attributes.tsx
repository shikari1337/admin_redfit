import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash, FaEdit, FaChevronDown, FaChevronRight, FaArrowUp, FaArrowDown, FaGripVertical, FaEye, FaEyeSlash } from 'react-icons/fa';
import api, { attributesAPI, attributeValuesAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import { slugifyValue } from '../utils/slugify';
import { useAuth } from '../contexts/AuthContext';

interface Attribute {
  _id: string;
  name: string;
  slug: string;
  type: 'text' | 'color' | 'image' | 'select';
  chartType?: 'none' | 'size' | 'color' | 'measurement' | 'table';
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  /** Card axis: variations split into one storefront card per value combo of flagged attributes */
  showAsProduct?: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

interface AttributeValue {
  _id: string;
  attributeId: string;
  name: string;
  slug: string;
  value?: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}


const emptyAttributeForm: {
  name: string;
  slug: string;
  type: 'text' | 'color' | 'image' | 'select';
  chartType: 'none' | 'size' | 'color' | 'measurement' | 'table';
  description: string;
  imageUrl: string;
  isActive: boolean;
  showAsProduct: boolean;
  order: number;
} = {
  name: '',
  slug: '',
  type: 'text',
  chartType: 'none',
  description: '',
  imageUrl: '',
  isActive: true,
  showAsProduct: false,
  order: 0,
};

const emptyValueForm = {
  name: '',
  slug: '',
  value: '',
  description: '',
  imageUrl: '',
  isActive: true,
  order: 0,
};

/**
 * Display order (ATTR-ORDER, owner 2 Nov 2026). The attribute list's order is the
 * store's attribute order (`attributes.display_order`, saved with PUT
 * /attributes/order): the product page's selectors follow it. The filter order
 * card below is `productSettings.filterSections` (Settings Center registry), the
 * storefront's filter sidebar top to bottom: attribute slugs plus the built-in
 * sections; its starting value is the registry's default.
 */
/** The saved position (v2 answers `display_order`, the legacy alias pass adds `displayOrder`). */
const positionOf = (a: any): number => Number(a?.displayOrder ?? a?.display_order ?? a?.order ?? 0) || 0;
const slugOf = (a: any): string => String(a?.slug ?? '').trim().toLowerCase();
/** The storefront's built-in filter sections (homeomedstorefront src/components/ProductFilters.tsx). */
const FILTER_BUILT_INS: Record<string, string> = {
  price: 'Price',
  brand: 'Brand',
  'health-concern': 'Health concern',
  categories: 'Categories (sibling and sub-categories, category filter)',
  availability: 'Availability',
};
/** The slot that places every attribute the list does not name (new attributes land here). */
const OTHER_ATTRIBUTES = 'attributes';

/**
 * The editable filter list: the stored entries this store knows (built-ins, the
 * slot, its attributes), every built-in and the slot present, and each attribute
 * the list does not name placed just before the slot in attribute order — which
 * is where the storefront shows it anyway, so nothing visible moves.
 */
function filterListOf(stored: string[], attrSlugs: string[]): string[] {
  const known = new Set([...Object.keys(FILTER_BUILT_INS), OTHER_ATTRIBUTES, ...attrSlugs]);
  const list = Array.from(new Set(stored.map((k) => String(k).trim()).filter((k) => known.has(k))));
  for (const k of [...Object.keys(FILTER_BUILT_INS), OTHER_ATTRIBUTES]) if (!list.includes(k)) list.push(k);
  const missing = attrSlugs.filter((s) => !list.includes(s));
  list.splice(list.indexOf(OTHER_ATTRIBUTES), 0, ...missing);
  return list;
}

/** `list` with `key` moved to index `to`. */
function moved(list: string[], key: string, to: number): string[] {
  const from = list.indexOf(key);
  if (from < 0 || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

const Attributes: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend requires products.manage for attribute/value create+update, products.delete
  // for removal (routes/attributes.ts, routes/attributeValues.ts) — this page had ZERO
  // client-side gating before.
  const canManageAttributes = hasPerm('products.manage');
  const canDeleteAttributes = hasPerm('products.delete');
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  // Attribute order being arranged (ids, first to last); null = the saved order.
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragAttrId, setDragAttrId] = useState<string | null>(null);
  // Filter order (productSettings.filterSections / hiddenFilterSections).
  const [filterStored, setFilterStored] = useState<string[] | null>(null);
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [filterDirty, setFilterDirty] = useState(false);
  const [filterCanWrite, setFilterCanWrite] = useState(false);
  const [filterNote, setFilterNote] = useState<string | null>(null);
  const [savingFilters, setSavingFilters] = useState(false);
  const [dragFilterKey, setDragFilterKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(new Set());
  const [attributeFormState, setAttributeFormState] = useState({ ...emptyAttributeForm });
  const [valueFormState, setValueFormState] = useState({ ...emptyValueForm });
  const [selectedValueId, setSelectedValueId] = useState<string | null>(null);
  const [attributeValues, setAttributeValues] = useState<Record<string, AttributeValue[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Normalize ID to string — accepts MongoDB ObjectId (24 hex) and PostgreSQL UUID (36 chars)
  const normalizeId = (id: any): string | null => {
    if (!id) return null;
    if (typeof id === 'string') {
      const t = id.trim();
      if (t.length === 24 && /^[0-9a-fA-F]{24}$/.test(t)) return t;
      if (t.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(t)) return t;
      if (t.length === 32 && /^[0-9a-fA-F]{32}$/.test(t)) return t;
      return null;
    }
    if (typeof id === 'object') {
      if (id._id) return normalizeId(id._id);
      if (id.id) return normalizeId(id.id);
      // Buffer (serialized MongoDB ObjectId)
      if (id.buffer) {
        try {
          const keys = Object.keys(id.buffer).map(k => Number(k)).sort((a, b) => a - b);
          const hex = keys.map(k => Number(id.buffer[k]).toString(16).padStart(2, '0')).join('');
          if (hex.length === 24 && /^[0-9a-fA-F]{24}$/.test(hex)) return hex;
        } catch { return null; }
      }
    }
    const s = String(id).trim();
    if (s.length === 24 && /^[0-9a-fA-F]{24}$/.test(s)) return s;
    if (s.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(s)) return s;
    return null;
  };

  // Track if form has unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Track which attribute is selected for editing (separate from value form selection)
  const [editingAttributeId, setEditingAttributeId] = useState<string | null>(null);

  useEffect(() => {
    fetchAttributes();
    fetchFilterOrder();
  }, []);


  // Only populate attribute form when explicitly editing an attribute (not when just adding values)
  useEffect(() => {
    if (editingAttributeId) {
      const currentAttribute = attributes.find(a => normalizeId(a._id) === normalizeId(editingAttributeId));
      if (currentAttribute) {
        setAttributeFormState({
          name: currentAttribute.name || '',
          slug: currentAttribute.slug || '',
          type: currentAttribute.type || 'text',
          chartType: currentAttribute.chartType || 'none',
          description: currentAttribute.description || '',
          imageUrl: currentAttribute.imageUrl || '',
          isActive: currentAttribute.isActive !== false,
          showAsProduct: !!((currentAttribute as any).showAsProduct ?? (currentAttribute as any).show_as_product),
          order: currentAttribute.order || 0,
        });
        setHasUnsavedChanges(false);
      }
    } else if (editingAttributeId === null && selectedAttributeId === null) {
      // Only reset to empty form if both are null (new attribute)
      setAttributeFormState({ ...emptyAttributeForm });
      setHasUnsavedChanges(false);
    }
  }, [editingAttributeId, attributes]);

  const fetchAttributes = async () => {
    setLoading(true);
    try {
      const response = await attributesAPI.list();
      // Backend returns: { success: true, data: attributes[] }
      // API interceptor normalizes to: attributes[] or { data: attributes[] }
      let attributes: any[] = [];
      if (Array.isArray(response)) {
        attributes = response;
      } else if (response?.data && Array.isArray(response.data)) {
        attributes = response.data;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        attributes = response.data.data;
      }
      setAttributes(attributes);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch attributes', err);
      setError(err?.message || 'Failed to fetch attributes');
      setAttributes([]);
    } finally {
      setLoading(false);
    }
  };


  /** The attributes in their saved order (display_order, then name — as the backend orders them), or as being arranged. */
  const sortedAttributes = useMemo(() => {
    const saved = [...attributes].sort((a, b) => positionOf(a) - positionOf(b) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
    if (!orderIds) return saved;
    const byId = new Map(saved.map((a) => [normalizeId(a._id) ?? '', a]));
    const arranged = orderIds.map((id) => byId.get(id)).filter(Boolean) as Attribute[];
    return [...arranged, ...saved.filter((a) => !orderIds.includes(normalizeId(a._id) ?? ''))];
  }, [attributes, orderIds]);

  const moveAttribute = (id: string, to: number) => {
    const ids = sortedAttributes.map((a) => normalizeId(a._id)).filter(Boolean) as string[];
    const next = moved(ids, id, to);
    if (next !== ids) setOrderIds(next);
  };

  const saveAttributeOrder = async () => {
    if (!orderIds) return;
    setSavingOrder(true);
    setError(null);
    try {
      await api.put('/attributes/order', { ids: orderIds });
      setOrderIds(null);
      await fetchAttributes();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save the attribute order');
    } finally {
      setSavingOrder(false);
    }
  };

  const fetchFilterOrder = async () => {
    try {
      const res = await api.get('/settings/registry');
      const d: any = res?.data;
      const reg = d?.definitions ? d : (d?.data ?? d?.center ?? d);
      const def = (reg?.definitions ?? []).find((x: any) => x?.key === 'productSettings');
      const field = (def?.fields ?? []).find((f: any) => f?.path === 'filterSections');
      if (!def) { setFilterNote('You need the settings read permission to see the filter order.'); return; }
      if (!field) { setFilterNote('This server has no filter order setting yet.'); return; }
      const value = def.value && typeof def.value === 'object' ? def.value : {};
      const stored = Array.isArray(value.filterSections) ? value.filterSections : Array.isArray(field.default) ? field.default : [];
      setFilterStored(stored.map(String));
      setHiddenKeys(Array.isArray(value.hiddenFilterSections) ? value.hiddenFilterSections.map(String) : []);
      setFilterCanWrite(!!def.canWrite && hasPerm('settings.manage'));
      setFilterNote(null);
    } catch (err: any) {
      setFilterNote(err?.response?.data?.message || err?.message || 'Could not load the filter order.');
    }
  };

  // The attribute filter sections are the attributes, except one named like a built-in section
  // (a "brand" attribute IS the Brand section on the storefront).
  const filterAttrSlugs = useMemo(
    () => sortedAttributes.map(slugOf).filter((s) => s && !(s in FILTER_BUILT_INS) && s !== OTHER_ATTRIBUTES),
    [sortedAttributes],
  );
  useEffect(() => {
    if (filterStored && !filterDirty) setFilterKeys(filterListOf(filterStored, filterAttrSlugs));
  }, [filterStored, filterAttrSlugs, filterDirty]);

  const moveFilter = (key: string, to: number) => {
    const next = moved(filterKeys, key, to);
    if (next !== filterKeys) { setFilterKeys(next); setFilterDirty(true); }
  };
  const toggleFilterHidden = (key: string) => {
    setHiddenKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setFilterDirty(true);
  };
  const cancelFilterOrder = () => { setFilterDirty(false); fetchFilterOrder(); };
  const saveFilterOrder = async () => {
    setSavingFilters(true);
    setError(null);
    try {
      const hiddenFilterSections = hiddenKeys.filter((k) => filterKeys.includes(k));
      await api.put('/settings/registry/productSettings', { filterSections: filterKeys, hiddenFilterSections });
      setFilterStored(filterKeys);
      setHiddenKeys(hiddenFilterSections);
      setFilterDirty(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save the filter order');
    } finally {
      setSavingFilters(false);
    }
  };

  const filterLabel = (key: string): { label: string; kind: string; inactive?: boolean } => {
    if (key in FILTER_BUILT_INS) return { label: FILTER_BUILT_INS[key], kind: 'Built-in' };
    if (key === OTHER_ATTRIBUTES) return { label: 'Any other attribute (new attributes appear here)', kind: 'Slot' };
    const a = sortedAttributes.find((x) => slugOf(x) === key);
    return { label: a?.name || key, kind: 'Attribute', inactive: a ? a.isActive === false : false };
  };

  const fetchAttributeValues = async (attributeId: string) => {
    try {
      // Normalize attributeId to handle object IDs
      const normalizedId = normalizeId(attributeId);
      if (!normalizedId) {
        console.error('Invalid attribute ID in fetchAttributeValues:', attributeId);
        return;
      }
      
      // Find attribute by normalized ID
      const attribute = attributes.find(a => {
        const attrId = normalizeId(a._id);
        return attrId === normalizedId;
      });
      if (!attribute) {
        console.error('Attribute not found:', normalizedId);
        return;
      }

      // Use attributeValuesAPI.getByAttributeSlug with attribute slug
      const response = await attributeValuesAPI.getByAttributeSlug(attribute.slug);
      // Backend returns: { success: true, data: values[] }
      // API interceptor normalizes to: values[] or { data: values[] }
      let values: any[] = [];
      if (Array.isArray(response)) {
        values = response;
      } else if (response?.data && Array.isArray(response.data)) {
        values = response.data;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        values = response.data.data;
      }
      // Use normalized ID as key
      setAttributeValues(prev => ({ ...prev, [normalizedId]: values }));
    } catch (err: any) {
      console.error('Failed to fetch attribute values', err);
    }
  };

  const toggleAttribute = (attributeId: string) => {
    const normalizedId = normalizeId(attributeId);
    if (!normalizedId) {
      console.error('Invalid attribute ID in toggleAttribute:', attributeId);
      return;
    }
    setExpandedAttributes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(normalizedId)) {
        newSet.delete(normalizedId);
      } else {
        newSet.add(normalizedId);
        if (!attributeValues[normalizedId]) {
          fetchAttributeValues(normalizedId);
        }
      }
      return newSet;
    });
  };

  const resetAttributeForm = () => {
    if (hasUnsavedChanges && editingAttributeId) {
      if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
        return;
      }
    }
    // CRITICAL FIX: Only reset editingAttributeId, keep selectedAttributeId if it's set for value form
    setEditingAttributeId(null);
    setAttributeFormState({ ...emptyAttributeForm });
    setError(null);
    setHasUnsavedChanges(false);
    // Don't reset value form here - it's independent
  };

  const resetValueForm = () => {
    setSelectedValueId(null);
    setValueFormState({ ...emptyValueForm });
    setError(null);
  };

  const handleEditAttribute = (attribute: Attribute) => {
    const normalizedId = normalizeId(attribute._id);
    if (!normalizedId) {
      setError('Invalid attribute ID');
      return;
    }

    // Check if switching from another attribute with unsaved changes
    const currentEditingId = editingAttributeId ? normalizeId(editingAttributeId) : null;
    if (hasUnsavedChanges && currentEditingId && currentEditingId !== normalizedId) {
      if (!confirm('You have unsaved changes. Are you sure you want to switch to another attribute?')) {
        return;
      }
    }

    // Reset value form when switching attributes (clear value selection)
    resetValueForm();
    
    // CRITICAL FIX: Only set editingAttributeId when editing, NOT selectedAttributeId
    // selectedAttributeId should only be set when adding/editing values
    setEditingAttributeId(normalizedId);
    // DO NOT set selectedAttributeId here - that's only for value form
    setError(null);
    setHasUnsavedChanges(false);
  };

  const handleEditValue = (value: AttributeValue, attributeId: string) => {
    // Ensure the attribute is selected so the value form is visible
    const normalizedAttributeId = normalizeId(attributeId);
    const normalizedValueId = normalizeId(value._id);
    if (!normalizedAttributeId) {
      setError('Invalid attribute ID');
      return;
    }
    if (!normalizedValueId) {
      setError('Invalid value ID');
      return;
    }
    // CRITICAL FIX: Only set selectedAttributeId for value form, NOT editingAttributeId
    setSelectedAttributeId(normalizedAttributeId);
    setSelectedValueId(normalizedValueId);
    setValueFormState({
      name: value.name || '',
      slug: value.slug || '',
      value: value.value || '',
      description: value.description || '',
      imageUrl: value.imageUrl || '',
      isActive: value.isActive !== false,
      order: value.order || 0,
    });
    setError(null);
  };

  const handleSubmitAttribute = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!attributeFormState.name.trim()) {
      setError('Attribute name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const normalizedId = editingAttributeId ? normalizeId(editingAttributeId) : null;
      
      // Prepare payload with imageUrl only if it has a value
      const payload: any = {
        name: attributeFormState.name.trim(),
        slug: attributeFormState.slug.trim() || undefined,
        type: attributeFormState.type,
        chartType: attributeFormState.chartType,
        description: attributeFormState.description.trim() || undefined,
        isActive: attributeFormState.isActive,
        showAsProduct: attributeFormState.showAsProduct,
      };
      // The position is set by the order list (PUT /attributes/order). A new attribute goes last
      // once the store has an order; a store without one keeps 0 (its storefront order unchanged).
      if (!normalizedId) {
        const top = Math.max(0, ...attributes.map(positionOf));
        if (top > 0) payload.displayOrder = top + 1;
      }
      
      // Only include imageUrl if it has a value
      if (attributeFormState.imageUrl && attributeFormState.imageUrl.trim()) {
        payload.imageUrl = attributeFormState.imageUrl.trim();
      }
      
      if (normalizedId) {
        await attributesAPI.update(normalizedId, payload);
      } else {
        await attributesAPI.create(payload);
        // If creating, fetch the new attribute and select it
        await fetchAttributes();
      }
      await fetchAttributes();
      setHasUnsavedChanges(false);
      // Don't reset form if editing - keep it open for further edits
      if (!normalizedId) {
        resetAttributeForm();
      }
    } catch (err: any) {
      console.error('Failed to save attribute', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to save attribute');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitValue = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!valueFormState.name.trim()) {
      setError('Value name is required');
      return;
    }

    if (!selectedAttributeId) {
      setError('Please select an attribute first');
      return;
    }

    // Normalize selectedAttributeId to ensure it's a string
    const normalizedAttributeId = normalizeId(selectedAttributeId);
    if (!normalizedAttributeId) {
      setError('Invalid attribute ID. Please select an attribute again.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build payload - only include defined/non-empty values
      const payload: any = {
        name: valueFormState.name.trim(),
        isActive: valueFormState.isActive,
        order: valueFormState.order || 0,
      };

      // Only include slug if it's not empty and matches pattern (backend will auto-generate if not provided)
      if (valueFormState.slug && valueFormState.slug.trim()) {
        const trimmedSlug = valueFormState.slug.trim();
        // Validate slug format matches backend requirement: /^[a-z0-9-]+$/i
        if (/^[a-z0-9-]+$/i.test(trimmedSlug)) {
          payload.slug = trimmedSlug;
        } else {
          // If slug doesn't match pattern, don't send it - backend will auto-generate
          console.warn('Slug format invalid, backend will auto-generate:', trimmedSlug);
        }
      }

      // Only include optional fields if they have values
      if (valueFormState.value && valueFormState.value.trim()) {
        payload.value = valueFormState.value.trim();
      }

      if (valueFormState.description && valueFormState.description.trim()) {
        payload.description = valueFormState.description.trim();
      }

      if (valueFormState.imageUrl && valueFormState.imageUrl.trim()) {
        payload.imageUrl = valueFormState.imageUrl.trim();
      }

      // Normalize selectedValueId if editing
      const normalizedValueId = selectedValueId ? normalizeId(selectedValueId) : null;
      
      if (normalizedValueId) {
        // Update: use attributeValuesAPI.update with attributeId and valueId
        await attributeValuesAPI.update(normalizedAttributeId, normalizedValueId, payload);
      } else {
        // Create: use attributeValuesAPI.create with attributeId as first param
        await attributeValuesAPI.create(normalizedAttributeId, payload);
      }
      
      await fetchAttributeValues(normalizedAttributeId);
      resetValueForm();
    } catch (err: any) {
      console.error('Failed to save attribute value', err);
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to save attribute value';
      setError(errorMessage);
      // Show detailed error if available (defensive: errors may be array or object)
      if (err?.response?.data?.errors) {
        try {
          const errors = err.response.data.errors;
          const arr = Array.isArray(errors) ? errors : (typeof errors === 'object' && errors !== null ? Object.values(errors) : []);
          const flatArr = Array.isArray(arr) ? arr.flat() : [];
          const msgParts = flatArr.map((e: any) =>
            typeof e === 'object' && e !== null && typeof e.msg === 'string' ? e.msg :
            typeof e === 'string' ? e : ''
          ).filter(Boolean);
          if (msgParts.length > 0) {
            setError(`${errorMessage}: ${msgParts.join(', ')}`);
          }
        } catch {
          // If parsing fails, keep the main error message
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttribute = async (id: string) => {
    if (!confirm('Are you sure you want to delete this attribute? This will also delete all its values.')) {
      return;
    }

    try {
      await attributesAPI.delete(id);
      await fetchAttributes();
      const normalizedSelectedId = normalizeId(selectedAttributeId);
      const normalizedDeletedId = normalizeId(id);
      if (normalizedSelectedId === normalizedDeletedId) {
        resetAttributeForm();
      }
    } catch (err: any) {
      console.error('Failed to delete attribute', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to delete attribute');
    }
  };

  const handleDeleteValue = async (attributeId: string, valueId: string) => {
    if (!confirm('Are you sure you want to delete this value?')) {
      return;
    }

    try {
      const normalizedAttributeId = normalizeId(attributeId);
      const normalizedValueId = normalizeId(valueId);
      if (!normalizedAttributeId || !normalizedValueId) {
        setError('Invalid ID');
        return;
      }
      // Use attributeValuesAPI.delete with attributeId and valueId
      await attributeValuesAPI.delete(normalizedAttributeId, normalizedValueId);
      await fetchAttributeValues(normalizedAttributeId);
      const normalizedSelectedValueId = normalizeId(selectedValueId);
      if (normalizedSelectedValueId === normalizedValueId) {
        resetValueForm();
      }
    } catch (err: any) {
      console.error('Failed to delete attribute value', err);
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to delete attribute value';
      setError(errorMessage);
      // Defensive: append validation errors if present (same pattern as handleSubmitValue)
      if (err?.response?.data?.errors) {
        try {
          const errors = err.response.data.errors;
          const arr = Array.isArray(errors) ? errors : (typeof errors === 'object' && errors !== null ? Object.values(errors) : []);
          const flatArr = Array.isArray(arr) ? arr.flat() : [];
          const msgParts = flatArr.map((e: any) =>
            typeof e === 'object' && e !== null && typeof e.msg === 'string' ? e.msg :
            typeof e === 'string' ? e : ''
          ).filter(Boolean);
          if (msgParts.length > 0) {
            setError(`${errorMessage}: ${msgParts.join(', ')}`);
          }
        } catch {
          // Keep main error message if parsing fails
        }
      }
    }
  };

  const handleNameChange = (name: string, isAttribute: boolean = true) => {
    if (isAttribute) {
      setAttributeFormState(prev => ({
        ...prev,
        name,
        slug: prev.slug || slugifyValue(name),
      }));
      setHasUnsavedChanges(true);
    } else {
      setValueFormState(prev => ({
        ...prev,
        name,
        slug: prev.slug || slugifyValue(name),
      }));
    }
  };

  // Track form changes
  const handleAttributeFormChange = (field: string, value: any) => {
    setAttributeFormState(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading attributes...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attributes & Values</h1>
          <p className="text-gray-600 mt-1">Manage product attributes like Color, Size, Material, etc.</p>
        </div>
        {canManageAttributes && (
          <button
            onClick={resetAttributeForm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FaPlus /> New Attribute
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 rounded-lg">
          <div className="flex items-center">
            <span className="font-semibold mr-2">Error:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attributes List - Left Column */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Attributes ({attributes.length})</h2>
            {attributes.length > 0 && !orderIds && (
              <span className="text-sm text-gray-500">Product page order</span>
            )}
          </div>
          {canManageAttributes && attributes.length > 1 && (
            <p className="text-xs text-gray-500 -mt-2 mb-3">
              Drag a row or use the arrows: product page selectors follow this order. The filter order on listings is set below.
            </p>
          )}
          {orderIds && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between gap-2">
              <span className="text-sm text-yellow-800 font-medium">Unsaved order</span>
              <div className="flex gap-2">
                <button
                  onClick={saveAttributeOrder}
                  disabled={savingOrder}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <FaSave /> {savingOrder ? 'Saving...' : 'Save order'}
                </button>
                <button
                  onClick={() => setOrderIds(null)}
                  disabled={savingOrder}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <FaUndo /> Cancel
                </button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {attributes.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <FaPlus className="mx-auto text-gray-400 text-4xl mb-3" />
                <p className="text-gray-500 text-lg mb-2">No attributes yet</p>
                <p className="text-gray-400 text-sm mb-4">Create your first attribute to get started</p>
                {canManageAttributes && (
                  <button
                    onClick={resetAttributeForm}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Attribute
                  </button>
                )}
              </div>
            ) : (
              sortedAttributes
                .map((attribute, index) => {
                  const normalizedAttrId = normalizeId(attribute._id);
                  if (!normalizedAttrId) {
                    console.error('Invalid attribute ID, skipping:', attribute);
                    return null;
                  }
                  const isExpanded = expandedAttributes.has(normalizedAttrId);
                  // CRITICAL FIX: Strict comparison with null checks
                  const currentEditingId = editingAttributeId ? normalizeId(editingAttributeId) : null;
                  const currentSelectedId = selectedAttributeId ? normalizeId(selectedAttributeId) : null;
                  const isSelected = currentEditingId !== null && currentEditingId === normalizedAttrId;
                  const isSelectedForValue = currentSelectedId !== null && currentSelectedId === normalizedAttrId;
                  return (
                  <div
                    key={normalizedAttrId}
                    draggable={canManageAttributes}
                    onDragStart={() => setDragAttrId(normalizedAttrId)}
                    onDragOver={(e) => { if (dragAttrId) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragAttrId) moveAttribute(dragAttrId, index); setDragAttrId(null); }}
                    onDragEnd={() => setDragAttrId(null)}
                    className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${
                    isSelected ? 'border-blue-500 border-2 shadow-lg' : 'border-gray-200'
                  } ${dragAttrId === normalizedAttrId ? 'opacity-50' : ''}`}>
                    <div className={`p-4 ${
                      isSelected 
                        ? 'bg-gradient-to-r from-blue-50 to-blue-100' 
                        : 'bg-gradient-to-r from-gray-50 to-white'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {canManageAttributes && (
                            <span className="text-gray-400 cursor-grab flex-shrink-0" title="Drag to reorder">
                              <FaGripVertical />
                            </span>
                          )}
                          <button
                            onClick={() => toggleAttribute(normalizedAttrId)}
                            className="text-gray-600 hover:text-gray-800 transition-colors flex-shrink-0"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? (
                              <FaChevronDown className="text-lg" />
                            ) : (
                              <FaChevronRight className="text-lg" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900">{attribute.name}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {attribute.slug}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                attribute.type === 'color' ? 'bg-blue-100 text-blue-800' :
                                attribute.type === 'image' ? 'bg-purple-100 text-purple-800' :
                                attribute.type === 'select' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {attribute.type}
                              </span>
                              {!attribute.isActive && (
                                <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800 font-medium">
                                  Inactive
                                </span>
                              )}
                              {!!(attribute.showAsProduct ?? (attribute as any).show_as_product) && (
                                <span className="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-800 font-medium" title="Listings split into one card per value of this attribute">
                                  Card axis
                                </span>
                              )}
                            </div>
                            {attribute.description && (
                              <p className="text-sm text-gray-600 mt-1 truncate">{attribute.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          {canManageAttributes && (
                            <div className="flex flex-col">
                              <button
                                onClick={() => moveAttribute(normalizedAttrId, index - 1)}
                                disabled={index === 0}
                                className="px-1 text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                title="Move up"
                              >
                                <FaArrowUp className="text-xs" />
                              </button>
                              <button
                                onClick={() => moveAttribute(normalizedAttrId, index + 1)}
                                disabled={index === sortedAttributes.length - 1}
                                className="px-1 text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                title="Move down"
                              >
                                <FaArrowDown className="text-xs" />
                              </button>
                            </div>
                          )}
                          {canManageAttributes && (
                            <button
                              onClick={() => handleEditAttribute(attribute)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Attribute"
                            >
                              <FaEdit />
                            </button>
                          )}
                          {canDeleteAttributes && (
                            <button
                              onClick={() => handleDeleteAttribute(normalizedAttrId)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Attribute"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">
                            Values ({attributeValues[normalizedAttrId]?.length || 0})
                          </h3>
                          {!isSelectedForValue && canManageAttributes && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent any parent click handlers
                                e.preventDefault(); // Prevent form submission
                                // CRITICAL FIX: Only set selectedAttributeId for value form
                                // DO NOT touch editingAttributeId - that's only for attribute editing
                                setSelectedAttributeId(normalizedAttrId);
                                setSelectedValueId(null); // Clear any selected value
                                setValueFormState({ ...emptyValueForm }); // Reset value form
                                setError(null);
                              }}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <FaPlus className="text-xs" /> Add Value
                            </button>
                          )}
                        </div>
                        {attributeValues[normalizedAttrId] && attributeValues[normalizedAttrId].length > 0 ? (
                          <div className="space-y-2">
                            {attributeValues[normalizedAttrId]
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((value) => {
                                const normalizedValueId = normalizeId(value._id);
                                if (!normalizedValueId) {
                                  console.error('Invalid value ID, skipping:', value);
                                  return null;
                                }
                                return (
                                <div key={normalizedValueId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {attribute.type === 'color' && value.value && (
                                      <div
                                        className="w-6 h-6 rounded border-2 border-gray-300 flex-shrink-0"
                                        style={{ backgroundColor: value.value }}
                                        title={value.value}
                                      />
                                    )}
                                    {attribute.type === 'image' && value.imageUrl && (
                                      <img
                                        src={value.imageUrl}
                                        alt={value.name}
                                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900">{value.name}</span>
                                        <span className="text-xs text-gray-500">{value.slug}</span>
                                        {value.value && attribute.type !== 'color' && (
                                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                            {value.value}
                                          </span>
                                        )}
                                        {!value.isActive && (
                                          <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">
                                            Inactive
                                          </span>
                                        )}
                                      </div>
                                      {value.description && (
                                        <p className="text-xs text-gray-600 mt-1 truncate">{value.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2 ml-4">
                                    {canManageAttributes && (
                                      <button
                                        onClick={() => handleEditValue(value, normalizedAttrId)}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Edit Value"
                                      >
                                        <FaEdit className="text-sm" />
                                      </button>
                                    )}
                                    {canDeleteAttributes && (
                                      <button
                                        onClick={() => handleDeleteValue(normalizedAttrId, normalizedValueId)}
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Delete Value"
                                      >
                                        <FaTrash className="text-sm" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                              }).filter(Boolean)}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-gray-500 text-sm">
                            No values yet. Click "Add Value" to create one.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })
                .filter(Boolean)
            )}
          </div>
        </div>

        {/* Attribute Form - Middle Column */}
        <div className="bg-white rounded-lg shadow-lg p-6 sticky top-6">
          <div className="pb-4 border-b border-gray-200 mb-4">
            <div className="flex items-center justify-between">
              <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {editingAttributeId ? 'Edit Attribute' : 'New Attribute'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {editingAttributeId 
                ? `Editing: ${attributes.find(a => normalizeId(a._id) === normalizeId(editingAttributeId))?.name || 'Unknown'}`
                : 'Create a new product attribute'}
            </p>
              </div>
              {hasUnsavedChanges && (
                <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-medium">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          <form onSubmit={handleSubmitAttribute} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={attributeFormState.name}
                onChange={(e) => handleNameChange(e.target.value, true)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="e.g., Color, Size, Material"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={attributeFormState.slug}
                onChange={(e) => handleAttributeFormChange('slug', slugifyValue(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                pattern="[a-z0-9\-]+"
                placeholder="auto-generated-from-name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={attributeFormState.type}
                onChange={(e) => handleAttributeFormChange('type', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              >
                <option value="text">Text - Plain text values</option>
                <option value="color">Color - Color swatches with hex codes</option>
                <option value="image">Image - Image-based values</option>
                <option value="select">Select - Dropdown selection</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chart Type
              </label>
              <select
                value={attributeFormState.chartType}
                onChange={(e) => {
                  const chartType = e.target.value as 'none' | 'size' | 'color' | 'measurement' | 'table';
                  handleAttributeFormChange('chartType', chartType);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="none">None - No chart</option>
                <option value="size">Size Chart - Size measurements</option>
                <option value="color">Color Chart - Color guide</option>
                <option value="measurement">Measurement Chart - Measurement guide</option>
                <option value="table">Table Chart - Data table</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select a chart type to display next to this attribute selector on product pages. The exact size chart will be selected at the product level.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={attributeFormState.description}
                onChange={(e) => handleAttributeFormChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                rows={3}
                placeholder="Optional description for this attribute"
              />
            </div>
            {/* Image — same Upload · Library · AI · URL field as everywhere else */}
            <ImageInputWithActions
              label="Image (optional)" spec="attribute.image" folder="attributes" entity="generic"
              local={{ attribute: attributeFormState.name }}
              value={attributeFormState.imageUrl}
              onChange={(url) => handleAttributeFormChange('imageUrl', url)}
            />
            <div className="flex items-center p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="attributeIsActive"
                checked={attributeFormState.isActive}
                onChange={(e) => handleAttributeFormChange('isActive', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="attributeIsActive" className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">
                Active (visible in product forms)
              </label>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="attributeShowAsProduct"
                  checked={attributeFormState.showAsProduct}
                  onChange={(e) => handleAttributeFormChange('showAsProduct', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="attributeShowAsProduct" className="ml-2 text-sm font-medium text-gray-800 cursor-pointer">
                  Show as product (card axis)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1.5 ml-6">
                Category &amp; search listings show one product card per value of this attribute
                (e.g. Brand, Form → an "Adel MT" card). Attributes NOT flagged (potency, size…)
                become dropdown selectors on each card instead.
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              {canManageAttributes && (
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <FaSave /> {editingAttributeId ? 'Update' : 'Create'} Attribute
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={resetAttributeForm}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
              >
                <FaUndo /> Clear
              </button>
            </div>
          </form>
        </div>

        {/* Value Form - Right Column */}
        <div className="bg-white rounded-lg shadow-lg p-6 sticky top-6">
          {selectedAttributeId ? (
            <>
              <div className="pb-4 border-b border-gray-200 mb-4">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-1 h-6 bg-green-500 rounded"></span>
                  {selectedValueId ? 'Edit Value' : 'Add Value'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedValueId 
                    ? 'Update value details' 
                    : `Add a value for "${attributes.find(a => normalizeId(a._id) === normalizeId(selectedAttributeId))?.name || 'this attribute'}"`}
                </p>
              </div>
              <form onSubmit={handleSubmitValue} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={valueFormState.name}
                    onChange={(e) => handleNameChange(e.target.value, false)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="e.g., Red, Small, Cotton"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={valueFormState.slug}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, slug: slugifyValue(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    pattern="[a-z0-9\-]+"
                    placeholder="auto-generated-from-name"
                  />
                </div>
                {attributes.find(a => normalizeId(a._id) === normalizeId(selectedAttributeId))?.type === 'color' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color Code (Hex)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={valueFormState.value}
                        onChange={(e) => setValueFormState(prev => ({ ...prev, value: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                        placeholder="#FF0000"
                      />
                      {valueFormState.value && /^#[0-9A-Fa-f]{6}$/.test(valueFormState.value) && (
                        <div
                          className="w-10 h-10 rounded border-2 border-gray-300 flex-shrink-0"
                          style={{ backgroundColor: valueFormState.value }}
                          title={valueFormState.value}
                        />
                      )}
                    </div>
                  </div>
                )}
                {/* Value image — swatch / size-chart picture, with the shared picker */}
                <ImageInputWithActions
                  label={attributes.find(a => normalizeId(a._id) === normalizeId(selectedAttributeId))?.type === 'image' ? 'Image (required)' : 'Image (optional — e.g. swatch or size chart)'}
                  spec="attribute.value_image" folder="attributes" entity="generic"
                  local={{ value: valueFormState.name }}
                  value={valueFormState.imageUrl}
                  onChange={(url) => setValueFormState(prev => ({ ...prev, imageUrl: url }))}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={valueFormState.description}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    rows={2}
                    placeholder="Optional description for this value"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Order
                  </label>
                  <input
                    type="number"
                    value={valueFormState.order}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    min="0"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="valueIsActive"
                    checked={valueFormState.isActive}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <label htmlFor="valueIsActive" className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">
                    Active (visible in product forms)
                  </label>
                </div>
                <div className="flex gap-2 pt-4">
                  {canManageAttributes && (
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <FaSave /> {selectedValueId ? 'Update' : 'Create'} Value
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetValueForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <FaUndo /> Clear
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FaPlus className="mx-auto text-gray-400 text-4xl mb-3" />
              <p className="text-lg mb-2">Select an attribute</p>
              <p className="text-sm">Choose an attribute from the list to add values</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter order on listings (productSettings.filterSections) */}
      <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Filter order on listings</h2>
            <p className="text-sm text-gray-600 mt-1">
              The filter sidebar of category, brand and search pages, top to bottom. Drag a row or use the arrows; the eye hides a section.
            </p>
          </div>
          {filterDirty && (
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={saveFilterOrder}
                disabled={savingFilters || !filterCanWrite}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <FaSave /> {savingFilters ? 'Saving...' : 'Save filter order'}
              </button>
              <button
                onClick={cancelFilterOrder}
                disabled={savingFilters}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <FaUndo /> Cancel
              </button>
            </div>
          )}
        </div>
        {filterNote ? (
          <p className="text-sm text-gray-500">{filterNote}</p>
        ) : (
          <ol className="space-y-2 max-w-2xl">
            {filterKeys.map((key, index) => {
              const { label, kind, inactive } = filterLabel(key);
              const off = hiddenKeys.includes(key);
              return (
                <li
                  key={key}
                  draggable={filterCanWrite}
                  onDragStart={() => setDragFilterKey(key)}
                  onDragOver={(e) => { if (dragFilterKey) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (dragFilterKey) moveFilter(dragFilterKey, index); setDragFilterKey(null); }}
                  onDragEnd={() => setDragFilterKey(null)}
                  className={`flex items-center gap-3 p-3 border rounded-lg ${off ? 'bg-gray-50 border-dashed border-gray-300' : 'bg-white border-gray-200'} ${dragFilterKey === key ? 'opacity-50' : ''}`}
                >
                  {filterCanWrite && (
                    <span className="text-gray-400 cursor-grab flex-shrink-0" title="Drag to reorder"><FaGripVertical /></span>
                  )}
                  <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{index + 1}</span>
                  <span className={`flex-1 min-w-0 truncate text-sm font-medium ${off ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{label}</span>
                  {kind === 'Attribute' && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{key}</span>}
                  {inactive && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">Inactive</span>}
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    kind === 'Attribute' ? 'bg-green-100 text-green-800' : kind === 'Slot' ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'
                  }`}>{kind}</span>
                  {filterCanWrite && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveFilter(key, index - 1)} disabled={index === 0} className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Move up">
                        <FaArrowUp className="text-xs" />
                      </button>
                      <button onClick={() => moveFilter(key, index + 1)} disabled={index === filterKeys.length - 1} className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Move down">
                        <FaArrowDown className="text-xs" />
                      </button>
                      <button onClick={() => toggleFilterHidden(key)} className={`p-1 ${off ? 'text-gray-400 hover:text-gray-600' : 'text-blue-600 hover:text-blue-800'}`} title={off ? 'Show this section' : 'Hide this section'}>
                        {off ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {!filterNote && !filterCanWrite && (
          <p className="text-xs text-gray-500 mt-3">You need the settings.manage permission to change the filter order.</p>
        )}
      </div>
    </div>
  );
};

export default Attributes;

