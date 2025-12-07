import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaPlus, FaTrash, FaSave } from 'react-icons/fa';
import { specificationsAPI, productsAPI } from '../services/api';
import { slugifyValue } from '../utils/slugify';

interface Section {
  heading: string;
  items: Array<{ key: string; value: string }>;
}

const SpecificationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    productId: '',
    sections: [] as Section[],
    isActive: true,
  });
  const [products, setProducts] = useState<Array<{ _id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      fetchSpecification();
    }
    fetchProducts();
  }, [id, isEdit]);

  const fetchSpecification = async () => {
    setLoading(true);
    try {
      const response = await specificationsAPI.getById(id!);
      const spec = response.data || response;
      setFormData({
        name: spec.name || '',
        slug: spec.slug || '',
        productId: spec.productId ? String(spec.productId) : '',
        sections: spec.sections || [],
        isActive: spec.isActive !== false,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch specification');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll({ active: true });
      const productsData = response.data || response;
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: formData.slug || slugifyValue(name),
    });
  };

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { heading: '', items: [{ key: '', value: '' }] }],
    });
  };

  const removeSection = (index: number) => {
    setFormData({
      ...formData,
      sections: formData.sections.filter((_, i) => i !== index),
    });
  };

  const updateSection = (index: number, field: 'heading' | 'items', value: any) => {
    const newSections = [...formData.sections];
    if (field === 'heading') {
      newSections[index].heading = value;
    } else {
      newSections[index].items = value;
    }
    setFormData({ ...formData, sections: newSections });
  };

  const addItem = (sectionIndex: number) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].items.push({ key: '', value: '' });
    setFormData({ ...formData, sections: newSections });
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].items = newSections[sectionIndex].items.filter((_, i) => i !== itemIndex);
    setFormData({ ...formData, sections: newSections });
  };

  const updateItem = (sectionIndex: number, itemIndex: number, field: 'key' | 'value', value: string) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].items[itemIndex][field] = value;
    setFormData({ ...formData, sections: newSections });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (formData.sections.length === 0) {
      setError('At least one section is required');
      return;
    }

    for (const section of formData.sections) {
      if (!section.heading.trim()) {
        setError('All sections must have a heading');
        return;
      }
      if (section.items.length === 0) {
        setError('All sections must have at least one item');
        return;
      }
      for (const item of section.items) {
        if (!item.key.trim() || !item.value.trim()) {
          setError('All items must have both key and value');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        sections: formData.sections.map(section => ({
          heading: section.heading.trim(),
          items: section.items.map(item => ({
            key: item.key.trim(),
            value: item.value.trim(),
          })),
        })),
        isActive: formData.isActive,
      };

      if (formData.slug.trim()) {
        payload.slug = formData.slug.trim();
      }

      if (formData.productId.trim()) {
        payload.productId = formData.productId.trim();
      }

      if (isEdit && id) {
        await specificationsAPI.update(id, payload);
      } else {
        await specificationsAPI.create(payload);
      }

      navigate('/products/specifications');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save specification');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/products/specifications')}
          className="text-gray-600 hover:text-gray-900"
        >
          <FaArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Specification' : 'Create Specification'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Specification name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            type="text"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Auto-generated from name if empty (for shared templates)"
          />
          <p className="text-xs text-gray-500 mt-1">Only used for shared templates</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product (Optional)</label>
          <select
            value={formData.productId}
            onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
          >
            <option value="">None (Shared Template)</option>
            {products.map((product) => (
              <option key={product._id} value={product._id}>
                {product.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Leave empty for shared template, or select a product for product-specific specification
          </p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Sections <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addSection}
              className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              <FaPlus className="mr-1" size={12} />
              Add Section
            </button>
          </div>

          {formData.sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded">
              No sections added. Click "Add Section" to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {formData.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <input
                      type="text"
                      value={section.heading}
                      onChange={(e) => updateSection(sectionIndex, 'heading', e.target.value)}
                      placeholder="Section heading"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => removeSection(sectionIndex)}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      <FaTrash />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex gap-2">
                        <input
                          type="text"
                          value={item.key}
                          onChange={(e) => updateItem(sectionIndex, itemIndex, 'key', e.target.value)}
                          placeholder="Key (e.g., Material)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          required
                        />
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) => updateItem(sectionIndex, itemIndex, 'value', e.target.value)}
                          placeholder="Value (e.g., 100% Cotton)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(sectionIndex, itemIndex)}
                          className="px-3 text-red-600 hover:text-red-800"
                          disabled={section.items.length === 1}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(sectionIndex)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <FaPlus className="mr-1" size={10} />
                      Add Item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center">
          <input
            id="spec-active"
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
          />
          <label htmlFor="spec-active" className="ml-2 text-sm text-gray-700">
            Specification is active
          </label>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
          >
            <FaSave className="mr-2" />
            {saving ? 'Saving...' : isEdit ? 'Update Specification' : 'Create Specification'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/products/specifications')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default SpecificationForm;

