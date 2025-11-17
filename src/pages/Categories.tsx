import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash } from 'react-icons/fa';
import { categoriesAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';

interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  parent?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  displayOrder: '',
  parent: '',
  isActive: true,
};

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    ...emptyForm,
  });
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await categoriesAPI.list();
      const data = response.data || response;
      setCategories(Array.isArray(data) ? data : data?.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch categories', err);
      setError(err?.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setFormState({ ...emptyForm });
    setError(null);
    setImageError(null);
    setImageUploading(false);
  };

  const handleEdit = (category: Category) => {
    setSelectedId(category._id);
    setFormState({
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      imageUrl: category.imageUrl || '',
      displayOrder:
        category.displayOrder !== undefined && category.displayOrder !== null
          ? String(category.displayOrder)
          : '',
      parent: category.parent ? String(category.parent) : '',
      isActive: category.isActive !== false,
    });
    setError(null);
    setImageError(null);
    setImageUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Category name is required');
      return;
    }

    if (imageUploading) {
      setError('Please wait for the image upload to finish before saving.');
      return;
    }

    if (imageError) {
      setError(imageError);
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, any> = {
      name: formState.name.trim(),
      description: formState.description?.trim() || undefined,
      imageUrl: formState.imageUrl?.trim() || undefined,
      displayOrder: formState.displayOrder ? Number(formState.displayOrder) : undefined,
      isActive: formState.isActive,
      parent: formState.parent ? formState.parent : null,
    };

    if (formState.slug?.trim()) {
      payload.slug = formState.slug.trim();
    }

    try {
      if (selectedId) {
        await categoriesAPI.update(selectedId, payload);
      } else {
        await categoriesAPI.create(payload);
      }
      await fetchCategories();
      resetForm();
    } catch (err: any) {
      console.error('Failed to save category', err);
      setError(err?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setError(null);
    try {
      await categoriesAPI.delete(category._id);
      await fetchCategories();
      if (selectedId === category._id) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to delete category', err);
      setError(err?.message || 'Failed to delete category');
    }
  };

  const parentOptions = useMemo(() => {
    return categories.filter(cat => cat._id !== selectedId);
  }, [categories, selectedId]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500">Manage category hierarchy for the storefront.</p>
        </div>
        <button
          onClick={resetForm}
          className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <FaPlus className="mr-2" />
          New Category
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-sm text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Category List</h2>
            <span className="text-sm text-gray-500">{categories.length} total</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
              </div>
            ) : categories.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No categories added yet.</div>
            ) : (
              categories.map(category => (
                <div
                  key={category._id}
                  className={`px-6 py-4 flex items-start justify-between ${
                    selectedId === category._id ? 'bg-red-50' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                      {!category.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">Slug: {category.slug}</p>
                    {category.description && (
                      <p className="text-xs text-gray-600 mt-1">{category.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Display Order: {category.displayOrder ?? 0}</span>
                      {category.parent && (
                        <span>
                          Parent:{' '}
                          {categories.find(cat => cat._id === category.parent)?.name || category.parent}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(category)}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      <FaTrash className="inline mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedId ? 'Edit Category' : 'Create Category'}
            </h2>
            {selectedId && (
              <button
                onClick={resetForm}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
              >
                <FaUndo className="mr-1" /> Reset
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={e => setFormState({ ...formState, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Category name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={formState.slug}
                onChange={e => setFormState({ ...formState, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Optional custom slug (auto-generated if empty)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={formState.description}
                onChange={e => setFormState({ ...formState, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                placeholder="Optional description"
              />
            </div>

            <ImageInputWithActions
              value={formState.imageUrl || ''}
              onChange={(url: string) => setFormState({ ...formState, imageUrl: url })}
              label="Category Image"
              placeholder="Enter category image URL manually (https://...)"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={formState.displayOrder}
                  onChange={e => setFormState({ ...formState, displayOrder: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                <select
                  value={formState.parent}
                  onChange={e => setFormState({ ...formState, parent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="">No parent (top-level)</option>
                  {parentOptions.map(parent => (
                    <option key={parent._id} value={parent._id}>
                      {parent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="category-active"
                type="checkbox"
                checked={formState.isActive}
                onChange={e => setFormState({ ...formState, isActive: e.target.checked })}
                className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
              />
              <label htmlFor="category-active" className="ml-2 text-sm text-gray-700">
                Category is active
              </label>
            </div>

            <div className="pt-3 border-t border-gray-200 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
              >
                <FaSave className="mr-2" />
                {saving ? 'Saving...' : selectedId ? 'Update Category' : 'Create Category'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <FaUndo className="mr-2" />
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Categories;


