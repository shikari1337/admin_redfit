import React, { useEffect, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash, FaEdit, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { attributesAPI } from '../services/api';
import { slugifyValue } from '../utils/slugify';

interface Attribute {
  _id: string;
  name: string;
  slug: string;
  type: 'text' | 'color' | 'image' | 'select';
  description?: string;
  isActive: boolean;
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
  description: string;
  isActive: boolean;
  order: number;
} = {
  name: '',
  slug: '',
  type: 'text',
  description: '',
  isActive: true,
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

const Attributes: React.FC = () => {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(new Set());
  const [attributeFormState, setAttributeFormState] = useState({ ...emptyAttributeForm });
  const [valueFormState, setValueFormState] = useState({ ...emptyValueForm });
  const [selectedValueId, setSelectedValueId] = useState<string | null>(null);
  const [attributeValues, setAttributeValues] = useState<Record<string, AttributeValue[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Normalize ID to string (handles MongoDB ObjectId objects)
  // Must be defined before any functions that use it
  const normalizeId = (id: any): string | null => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return normalizeId(id._id);
    if (typeof id === 'object' && id.toString && typeof id.toString === 'function') {
      const str = id.toString();
      if (str && str !== '[object Object]' && /^[0-9a-fA-F]{24}$/.test(str)) {
        return str;
      }
    }
    return String(id);
  };

  useEffect(() => {
    fetchAttributes();
  }, []);

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

      const response = await attributesAPI.getValues(attribute.slug);
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
    setSelectedAttributeId(null);
    setAttributeFormState({ ...emptyAttributeForm });
    setError(null);
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
    setSelectedAttributeId(normalizedId);
    setAttributeFormState({
      name: attribute.name || '',
      slug: attribute.slug || '',
      type: attribute.type || 'text',
      description: attribute.description || '',
      isActive: attribute.isActive !== false,
      order: attribute.order || 0,
    });
    setError(null);
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
      if (selectedAttributeId) {
        const normalizedId = normalizeId(selectedAttributeId);
        if (!normalizedId) {
          setError('Invalid attribute ID');
          return;
        }
        await attributesAPI.update(normalizedId, attributeFormState);
      } else {
        await attributesAPI.create(attributeFormState);
      }
      await fetchAttributes();
      resetAttributeForm();
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
        await attributesAPI.updateValue(normalizedAttributeId, normalizedValueId, payload);
      } else {
        await attributesAPI.createValue(normalizedAttributeId, payload);
      }
      
      await fetchAttributeValues(normalizedAttributeId);
      resetValueForm();
    } catch (err: any) {
      console.error('Failed to save attribute value', err);
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to save attribute value';
      setError(errorMessage);
      // Show detailed error if available
      if (err?.response?.data?.errors) {
        const validationErrors = Object.values(err.response.data.errors).flat().join(', ');
        setError(`${errorMessage}: ${validationErrors}`);
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
      await attributesAPI.deleteValue(normalizedAttributeId, normalizedValueId);
      await fetchAttributeValues(normalizedAttributeId);
      const normalizedSelectedValueId = normalizeId(selectedValueId);
      if (normalizedSelectedValueId === normalizedValueId) {
        resetValueForm();
      }
    } catch (err: any) {
      console.error('Failed to delete attribute value', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to delete attribute value');
    }
  };

  const handleNameChange = (name: string, isAttribute: boolean = true) => {
    if (isAttribute) {
      setAttributeFormState(prev => ({
        ...prev,
        name,
        slug: prev.slug || slugifyValue(name),
      }));
    } else {
      setValueFormState(prev => ({
        ...prev,
        name,
        slug: prev.slug || slugifyValue(name),
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading attributes...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attributes & Values</h1>
          <p className="text-gray-600 mt-1">Manage product attributes like Color, Size, Material, etc.</p>
        </div>
        <button
          onClick={resetAttributeForm}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FaPlus /> New Attribute
        </button>
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
            {attributes.length > 0 && (
              <span className="text-sm text-gray-500">Sorted by order</span>
            )}
          </div>
          <div className="space-y-3">
            {attributes.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <FaPlus className="mx-auto text-gray-400 text-4xl mb-3" />
                <p className="text-gray-500 text-lg mb-2">No attributes yet</p>
                <p className="text-gray-400 text-sm mb-4">Create your first attribute to get started</p>
                <button
                  onClick={resetAttributeForm}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Attribute
                </button>
              </div>
            ) : (
              attributes
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((attribute) => {
                  const normalizedAttrId = normalizeId(attribute._id);
                  if (!normalizedAttrId) {
                    console.error('Invalid attribute ID, skipping:', attribute);
                    return null;
                  }
                  const isExpanded = expandedAttributes.has(normalizedAttrId);
                  const isSelected = normalizeId(selectedAttributeId) === normalizedAttrId;
                  return (
                  <div key={normalizedAttrId} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <div className="bg-gradient-to-r from-gray-50 to-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
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
                            </div>
                            {attribute.description && (
                              <p className="text-sm text-gray-600 mt-1 truncate">{attribute.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEditAttribute(attribute)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Attribute"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDeleteAttribute(normalizedAttrId)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Attribute"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">
                            Values ({attributeValues[normalizedAttrId]?.length || 0})
                          </h3>
                          {!isSelected && (
                            <button
                              onClick={() => {
                                setSelectedAttributeId(normalizedAttrId);
                                resetValueForm();
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
                                    <button
                                      onClick={() => handleEditValue(value, normalizedAttrId)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Edit Value"
                                    >
                                      <FaEdit className="text-sm" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteValue(normalizedAttrId, normalizedValueId)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Delete Value"
                                    >
                                      <FaTrash className="text-sm" />
                                    </button>
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
            <h2 className="text-xl font-semibold text-gray-900">
              {selectedAttributeId ? 'Edit Attribute' : 'New Attribute'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {selectedAttributeId ? 'Update attribute details' : 'Create a new product attribute'}
            </p>
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
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, slug: slugifyValue(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                pattern="[a-z0-9-]+"
                placeholder="auto-generated-from-name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={attributeFormState.type}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, type: e.target.value as any }))}
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
                Description
              </label>
              <textarea
                value={attributeFormState.description}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                rows={3}
                placeholder="Optional description for this attribute"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order
              </label>
              <input
                type="number"
                value={attributeFormState.order}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                min="0"
                placeholder="0"
              />
            </div>
            <div className="flex items-center p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="attributeIsActive"
                checked={attributeFormState.isActive}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="attributeIsActive" className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">
                Active (visible in product forms)
              </label>
            </div>
            <div className="flex gap-2 pt-4">
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
                    <FaSave /> {selectedAttributeId ? 'Update' : 'Create'} Attribute
                  </>
                )}
              </button>
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
                    pattern="[a-z0-9-]+"
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
                {attributes.find(a => normalizeId(a._id) === normalizeId(selectedAttributeId))?.type === 'image' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Image URL
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={valueFormState.imageUrl}
                        onChange={(e) => setValueFormState(prev => ({ ...prev, imageUrl: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                        placeholder="https://example.com/image.jpg"
                      />
                      {valueFormState.imageUrl && (
                        <img
                          src={valueFormState.imageUrl}
                          alt="Preview"
                          className="w-20 h-20 rounded border border-gray-300 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
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
    </div>
  );
};

export default Attributes;

