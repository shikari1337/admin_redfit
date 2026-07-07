import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { attributesAPI, attributeValuesAPI } from '../../services/api';

interface Attribute {
  _id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
}

interface AttributeValue {
  _id: string;
  name: string;
  slug: string;
  attributeId: string;
  value?: string; // For colors
  imageUrl?: string; // For images
}

interface ProductAttributesProps {
  selectedAttributeIds: string[];
  selectedAttributeValues?: Record<string, string[]>; // { attributeId: [valueId1, valueId2] }
  onAttributeIdsChange: (ids: string[]) => void;
  onAttributeValuesChange?: (values: Record<string, string[]>) => void;
  allowVariations?: boolean;
}

const ProductAttributes: React.FC<ProductAttributesProps> = ({
  selectedAttributeIds,
  selectedAttributeValues = {},
  onAttributeIdsChange,
  onAttributeValuesChange,
  allowVariations = true,
}) => {
  const [availableAttributes, setAvailableAttributes] = useState<Attribute[]>([]);
  const [attributeValuesMap, setAttributeValuesMap] = useState<Record<string, AttributeValue[]>>({});
  const [expandedAttributes, setExpandedAttributes] = useState<Set<string>>(new Set());
  const [loadingAttributes, setLoadingAttributes] = useState(true);
  const [newValueInput, setNewValueInput] = useState<Record<string, string>>({});
  const [savingValueFor, setSavingValueFor] = useState<string | null>(null);

  useEffect(() => {
    loadAttributes();
  }, []);

  const loadAttributes = async () => {
    try {
      setLoadingAttributes(true);
      const response = await attributesAPI.list({ isActive: true });
      const attributes = Array.isArray(response) ? response : (response?.data || []);
      setAvailableAttributes(attributes.filter((a: any) => a.isActive !== false));

      // Load values for each attribute - use Promise.all to prevent race conditions
      const valuesMap: Record<string, AttributeValue[]> = {};
      await Promise.all(
        attributes.map(async (attr: Attribute) => {
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
            valuesMap[currentAttributeId] = values.filter((v: any) => v.isActive !== false);
          } catch (error) {
            console.error(`Failed to load values for attribute ${currentAttributeId} (${attr.slug}):`, error);
            valuesMap[currentAttributeId] = [];
          }
        })
      );
      setAttributeValuesMap(valuesMap);
    } catch (error) {
      console.error('Failed to load attributes:', error);
      setAvailableAttributes([]);
    } finally {
      setLoadingAttributes(false);
    }
  };

  const handleAttributeToggle = (attributeId: string) => {
    const newIds = selectedAttributeIds.includes(attributeId)
      ? selectedAttributeIds.filter(id => id !== attributeId)
      : [...selectedAttributeIds, attributeId];
    onAttributeIdsChange(newIds);
    
    // Clear values when attribute is deselected
    if (!newIds.includes(attributeId) && onAttributeValuesChange) {
      const newValues = { ...selectedAttributeValues };
      delete newValues[attributeId];
      onAttributeValuesChange(newValues);
    }
  };

  const handleValueToggle = (attributeId: string, valueId: string) => {
    if (!onAttributeValuesChange) return;
    
    const currentValues = selectedAttributeValues[attributeId] || [];
    const newValues = currentValues.includes(valueId)
      ? currentValues.filter(id => id !== valueId)
      : [...currentValues, valueId];
    
    onAttributeValuesChange({
      ...selectedAttributeValues,
      [attributeId]: newValues,
    });
  };

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleAddValue = async (attr: Attribute) => {
    const raw = (newValueInput[attr._id] || '').trim();
    if (!raw) return;
    setSavingValueFor(attr._id);
    try {
      const created: any = await attributeValuesAPI.create(attr._id, { name: raw, slug: slugify(raw), value: raw });
      if (created) {
        const nv: AttributeValue = {
          _id: created._id || created.id,
          name: created.name || raw,
          slug: created.slug || slugify(raw),
          attributeId: attr._id,
          value: created.value,
          imageUrl: created.imageUrl || created.image_url,
        };
        setAttributeValuesMap(prev => ({ ...prev, [attr._id]: [...(prev[attr._id] || []), nv] }));
        setNewValueInput(prev => ({ ...prev, [attr._id]: '' }));
        // auto-select the new value
        if (onAttributeValuesChange && nv._id) {
          onAttributeValuesChange({
            ...selectedAttributeValues,
            [attr._id]: [...(selectedAttributeValues[attr._id] || []), nv._id],
          });
        }
      }
    } catch (e) {
      console.error('Failed to create attribute value', e);
    } finally {
      setSavingValueFor(null);
    }
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

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Product Attributes</h2>
        <p className="text-sm text-gray-500 mt-1">
          {allowVariations 
            ? 'Select attributes and their values to create variations'
            : 'Attach attributes and select values for filtering and display (WordPress style)'}
        </p>
      </div>

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
                  {isSelected && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(attr._id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />}
                    </button>
                  )}
                </div>
                
                {/* Value Selection - Only show when attribute is selected */}
                {isSelected && isExpanded && (
                  <div className="px-3 pb-3 pt-2 bg-gray-50 border-t border-gray-200">
                    <div className="text-xs font-medium text-gray-700 mb-2">
                      {values.length > 0
                        ? `Select Values (${selectedValues.length} of ${values.length} selected):`
                        : 'No values yet — add one below:'}
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
                    {/* Inline add-value */}
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        value={newValueInput[attr._id] || ''}
                        onChange={e => setNewValueInput(prev => ({ ...prev, [attr._id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddValue(attr); } }}
                        placeholder={`New ${attr.name} value…`}
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddValue(attr)}
                        disabled={savingValueFor === attr._id || !(newValueInput[attr._id] || '').trim()}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                      >
                        {savingValueFor === attr._id ? 'Adding…' : '+ Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductAttributes;
