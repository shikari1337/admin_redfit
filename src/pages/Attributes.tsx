import React, { useEffect, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash, FaEdit, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { attributesAPI, sizeChartsAPI } from '../services/api';
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
  sizeChart?: {
    _id: string;
    name: string;
  };
  isActive: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

interface SizeChartOption {
  _id: string;
  name: string;
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
  sizeChart: '',
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
  const [sizeCharts, setSizeCharts] = useState<SizeChartOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAttributes();
    fetchSizeCharts();
  }, []);

  const fetchAttributes = async () => {
    setLoading(true);
    try {
      const response = await attributesAPI.list();
      console.log('Attributes API response:', response);
      // Response should already be normalized by API interceptor
      const data = Array.isArray(response) ? response : (response?.data || []);
      console.log('Parsed attributes:', data);
      setAttributes(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch attributes', err);
      setError(err?.message || 'Failed to fetch attributes');
      setAttributes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSizeCharts = async () => {
    try {
      const response = await sizeChartsAPI.list();
      const data = Array.isArray(response) ? response : response?.data || [];
      setSizeCharts(data);
    } catch (err: any) {
      console.error('Failed to fetch size charts', err);
    }
  };

  const fetchAttributeValues = async (attributeId: string) => {
    try {
      const attribute = attributes.find(a => a._id === attributeId);
      if (!attribute) return;

      const response = await attributesAPI.getValues(attribute.slug);
      const data = Array.isArray(response) ? response : response?.data || [];
      setAttributeValues(prev => ({ ...prev, [attributeId]: data }));
    } catch (err: any) {
      console.error('Failed to fetch attribute values', err);
    }
  };

  const toggleAttribute = (attributeId: string) => {
    setExpandedAttributes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(attributeId)) {
        newSet.delete(attributeId);
      } else {
        newSet.add(attributeId);
        if (!attributeValues[attributeId]) {
          fetchAttributeValues(attributeId);
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
    setSelectedAttributeId(attribute._id);
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

  const handleEditValue = (value: AttributeValue) => {
    setSelectedValueId(value._id);
    setValueFormState({
      name: value.name || '',
      slug: value.slug || '',
      value: value.value || '',
      description: value.description || '',
      imageUrl: value.imageUrl || '',
      sizeChart: value.sizeChart?._id || '',
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
        await attributesAPI.update(selectedAttributeId, attributeFormState);
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

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...valueFormState,
        sizeChart: valueFormState.sizeChart || undefined,
      };

      if (selectedValueId) {
        await attributesAPI.updateValue(selectedAttributeId, selectedValueId, payload);
      } else {
        await attributesAPI.createValue(selectedAttributeId, payload);
      }
      
      await fetchAttributeValues(selectedAttributeId);
      resetValueForm();
    } catch (err: any) {
      console.error('Failed to save attribute value', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to save attribute value');
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
      if (selectedAttributeId === id) {
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
      await attributesAPI.deleteValue(attributeId, valueId);
      await fetchAttributeValues(attributeId);
      if (selectedValueId === valueId) {
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
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Attributes</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attributes List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Attributes</h2>
          <div className="space-y-2">
            {attributes.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No attributes found</div>
            ) : (
              attributes
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((attribute) => (
                  <div key={attribute._id} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3 bg-gray-50">
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onClick={() => toggleAttribute(attribute._id)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          {expandedAttributes.has(attribute._id) ? (
                            <FaChevronDown />
                          ) : (
                            <FaChevronRight />
                          )}
                        </button>
                        <span className="font-medium">{attribute.name}</span>
                        <span className="text-sm text-gray-500">({attribute.slug})</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          attribute.type === 'color' ? 'bg-blue-100 text-blue-800' :
                          attribute.type === 'image' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {attribute.type}
                        </span>
                        {!attribute.isActive && (
                          <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditAttribute(attribute)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteAttribute(attribute._id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                    {expandedAttributes.has(attribute._id) && (
                      <div className="p-3 border-t">
                        {selectedAttributeId === attribute._id ? (
                          <div className="text-sm text-gray-600 mb-2">
                            Editing attribute values below
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedAttributeId(attribute._id);
                              resetValueForm();
                            }}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            <FaPlus className="inline mr-1" /> Add Value
                          </button>
                        )}
                        {attributeValues[attribute._id] && (
                          <div className="mt-2 space-y-1">
                            {attributeValues[attribute._id]
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((value) => (
                                <div key={value._id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <div>
                                    <span className="font-medium">{value.name}</span>
                                    <span className="text-sm text-gray-500 ml-2">({value.slug})</span>
                                    {value.value && (
                                      <span className="ml-2 text-xs px-2 py-1 rounded bg-gray-200">
                                        {value.value}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleEditValue(value)}
                                      className="text-blue-600 hover:text-blue-800 text-sm"
                                    >
                                      <FaEdit />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteValue(attribute._id, value._id)}
                                      className="text-red-600 hover:text-red-800 text-sm"
                                    >
                                      <FaTrash />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Attribute Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            {selectedAttributeId ? 'Edit Attribute' : 'New Attribute'}
          </h2>
          <form onSubmit={handleSubmitAttribute} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={attributeFormState.name}
                onChange={(e) => handleNameChange(e.target.value, true)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                pattern="[a-z0-9-]+"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={attributeFormState.type}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="text">Text</option>
                <option value="color">Color</option>
                <option value="image">Image</option>
                <option value="select">Select</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={attributeFormState.description}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="attributeIsActive"
                checked={attributeFormState.isActive}
                onChange={(e) => setAttributeFormState(prev => ({ ...prev, isActive: e.target.checked }))}
                className="mr-2"
              />
              <label htmlFor="attributeIsActive" className="text-sm font-medium text-gray-700">
                Active
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Saving...' : <><FaSave /> Save</>}
              </button>
              <button
                type="button"
                onClick={resetAttributeForm}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
              >
                <FaUndo /> Reset
              </button>
            </div>
          </form>

          {/* Value Form */}
          {selectedAttributeId && (
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-lg font-semibold mb-4">
                {selectedValueId ? 'Edit Value' : 'New Value'}
              </h3>
              <form onSubmit={handleSubmitValue} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={valueFormState.name}
                    onChange={(e) => handleNameChange(e.target.value, false)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    pattern="[a-z0-9-]+"
                  />
                </div>
                {attributes.find(a => a._id === selectedAttributeId)?.type === 'color' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color Code (Hex)
                    </label>
                    <input
                      type="text"
                      value={valueFormState.value}
                      onChange={(e) => setValueFormState(prev => ({ ...prev, value: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="#FF0000"
                    />
                  </div>
                )}
                {attributes.find(a => a._id === selectedAttributeId)?.type === 'image' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Image URL
                    </label>
                    <input
                      type="text"
                      value={valueFormState.imageUrl}
                      onChange={(e) => setValueFormState(prev => ({ ...prev, imageUrl: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://..."
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={valueFormState.description}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Size Chart (optional)
                  </label>
                  <select
                    value={valueFormState.sizeChart}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, sizeChart: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {sizeCharts.map((chart) => (
                      <option key={chart._id} value={chart._id}>
                        {chart.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Order
                  </label>
                  <input
                    type="number"
                    value={valueFormState.order}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="valueIsActive"
                    checked={valueFormState.isActive}
                    onChange={(e) => setValueFormState(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="mr-2"
                  />
                  <label htmlFor="valueIsActive" className="text-sm font-medium text-gray-700">
                    Active
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? 'Saving...' : <><FaSave /> Save Value</>}
                  </button>
                  <button
                    type="button"
                    onClick={resetValueForm}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
                  >
                    <FaUndo /> Reset
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Attributes;

