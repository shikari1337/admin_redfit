import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsAPI, uploadAPI } from '../services/api';
import { FaUpload, FaTimes } from 'react-icons/fa';

const ProductForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    originalPrice: '',
    description: '',
    images: [] as string[],
    sizes: [] as string[],
    isActive: true,
    variants: [] as any[],
    bundles: [] as any[],
  });

  const [newImage, setNewImage] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchProduct();
    }
  }, [id]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const response = await productsAPI.getById(id!);
      const product = response.data;
      setFormData({
        name: product.name || '',
        price: product.price?.toString() || '',
        originalPrice: product.originalPrice?.toString() || '',
        description: product.description || '',
        images: product.images || [],
        sizes: product.sizes || [],
        isActive: product.isActive !== false,
        variants: product.variants || [],
        bundles: product.bundles || [],
      });
    } catch (error) {
      alert('Failed to load product');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async () => {
    if (!newImage) return;

    setUploading(true);
    try {
      const response = await uploadAPI.uploadSingle(newImage, 'products');
      setFormData({
        ...formData,
        images: [...formData.images, response.data.url],
      });
      setNewImage(null);
    } catch (error) {
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
        originalPrice: parseFloat(formData.originalPrice),
        sizes: formData.sizes.filter((s) => s.trim()),
      };

      if (isEdit) {
        await productsAPI.update(id!, data);
      } else {
        await productsAPI.create(data);
      }

      navigate('/products');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        {isEdit ? 'Edit Product' : 'New Product'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Name *
          </label>
          <input
            type="text"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Price (₹) *
            </label>
            <input
              type="number"
              required
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Original Price (₹) *
            </label>
            <input
              type="number"
              required
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
              value={formData.originalPrice}
              onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sizes (comma-separated) *
          </label>
          <input
            type="text"
            required
            placeholder="S, M, L, XL, XXL"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-red-500 focus:border-red-500"
            value={formData.sizes.join(', ')}
            onChange={(e) =>
              setFormData({
                ...formData,
                sizes: e.target.value.split(',').map((s) => s.trim()),
              })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Images
          </label>
          <div className="flex items-center space-x-4 mb-4">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setNewImage(e.target.files?.[0] || null)}
              className="text-sm text-gray-500"
            />
            <button
              type="button"
              onClick={handleImageUpload}
              disabled={!newImage || uploading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              <FaUpload className="mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {formData.images.map((img, index) => (
              <div key={index} className="relative">
                <img src={img} alt={`Product ${index + 1}`} className="w-full h-32 object-cover rounded" />
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      images: formData.images.filter((_, i) => i !== index),
                    })
                  }
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"
                >
                  <FaTimes size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />
          <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
            Product is active
          </label>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;

