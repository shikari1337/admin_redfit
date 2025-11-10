import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { bundlesAPI, productsAPI } from '../services/api';
import { FaArrowLeft, FaPlus, FaTrash, FaInfoCircle } from 'react-icons/fa';

interface ProductOption {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images?: string[];
}

interface BundleItemForm {
  product: string;
  swatchImage?: string;
}

interface BundleOptionForm {
  title: string;
  quantity: number;
  price: number;
  discountLabel?: string;
}

interface BundleFormState {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  items: BundleItemForm[];
  options: BundleOptionForm[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const BundleForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [formData, setFormData] = useState<BundleFormState>({
    name: '',
    slug: '',
    description: '',
    isActive: true,
    items: [
      { product: '' },
      { product: '' },
    ],
    options: [
      {
        title: 'Choose any 2',
        quantity: 2,
        price: 0,
      },
    ],
  });

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await productsAPI.getAll({ active: true });
        const list = (response?.data || response || []).map((product: any) => ({
          _id: product._id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          images: product.images || [],
        }));
        setProducts(list);
      } catch (error: any) {
        console.error('Failed to load products', error);
        alert(error.message || 'Failed to load products');
      }
    };

    loadProducts();
  }, []);

  useEffect(() => {
    if (isEdit && id) {
      const loadBundle = async () => {
        setLoading(true);
        try {
          const response = await bundlesAPI.getById(id);
          const bundle = response?.data || response;
          setFormData({
            name: bundle.name || '',
            slug: bundle.slug || '',
            description: bundle.description || '',
            isActive: bundle.isActive !== false,
            items: (bundle.items || []).map((item: any) => ({
              product:
                typeof item.product === 'string'
                  ? item.product
                  : item.product?._id || '',
              swatchImage: item.swatchImage || '',
            })),
            options: (bundle.options || []).map((option: any) => ({
              title: option.title || '',
              quantity: option.quantity || 2,
              price: option.price || 0,
              discountLabel: option.discountLabel || '',
            })),
          });
          if (bundle.slug) {
            setSlugManuallyEdited(true);
          }
        } catch (error: any) {
          console.error('Failed to load bundle', error);
          alert(error.message || 'Failed to load bundle');
          navigate('/products/bundles');
        } finally {
          setLoading(false);
        }
      };

      loadBundle();
    }
  }, [id, isEdit, navigate]);

  useEffect(() => {
    if (!slugManuallyEdited) {
      setFormData((prev) => ({
        ...prev,
        slug: slugify(prev.name),
      }));
    }
  }, [formData.name, slugManuallyEdited]);

  const handleInputChange = (field: keyof BundleFormState, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleItemChange = (index: number, field: keyof BundleItemForm, value: string) => {
    setFormData((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const handleOptionChange = (
    index: number,
    field: keyof BundleOptionForm,
    value: string | number
  ) => {
    setFormData((prev) => {
      const options = [...prev.options];
      options[index] = { ...options[index], [field]: value };
      return { ...prev, options };
    });
  };

  const addBundleItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { product: '', swatchImage: '' }],
    }));
  };

  const removeBundleItem = (index: number) => {
    setFormData((prev) => {
      const items = prev.items.filter((_, idx) => idx !== index);
      return { ...prev, items: items.length >= 2 ? items : prev.items };
    });
  };

  const addBundleOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        {
          title: prev.options.length === 1 ? 'Choose any 3' : `Option ${prev.options.length + 1}`,
          quantity: 3,
          price: 0,
          discountLabel: '',
        },
      ],
    }));
  };

  const removeBundleOption = (index: number) => {
    setFormData((prev) => {
      const options = prev.options.filter((_, idx) => idx !== index);
      return { ...prev, options: options.length >= 1 ? options : prev.options };
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Bundle name is required';
    }

    const normalizedSlug = slugify(formData.slug);
    if (!normalizedSlug) {
      newErrors.slug = 'Slug is required';
    }

    if (formData.items.length < 2) {
      newErrors.items = 'Bundle must include at least two products';
    } else {
      formData.items.forEach((item, index) => {
        if (!item.product) {
          newErrors[`item-${index}`] = 'Select a product for this slot';
        }
      });
    }

    if (formData.options.length === 0) {
      newErrors.options = 'Add at least one bundle option';
    } else {
      formData.options.forEach((option, index) => {
        if (!option.title.trim()) {
          newErrors[`option-title-${index}`] = 'Option title is required';
        }
        if (option.quantity < 2 || option.quantity > formData.items.length) {
          newErrors[`option-quantity-${index}`] = `Quantity must be between 2 and ${formData.items.length}`;
        }
        if (option.price < 0) {
          newErrors[`option-price-${index}`] = 'Price must be zero or higher';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        slug: slugify(formData.slug),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
        items: formData.items.map((item) => ({
          product: item.product,
          swatchImage: item.swatchImage?.trim() || undefined,
        })),
        options: formData.options.map((option) => ({
          title: option.title.trim(),
          quantity: option.quantity,
          price: Number(option.price),
          discountLabel: option.discountLabel?.trim() || undefined,
        })),
      };

      if (isEdit && id) {
        await bundlesAPI.update(id, payload);
      } else {
        await bundlesAPI.create(payload);
      }

      navigate('/products/bundles');
    } catch (error: any) {
      console.error('Failed to save bundle', error);
      alert(error.message || 'Failed to save bundle');
    } finally {
      setSaving(false);
    }
  };

  const productLookup = useMemo(() => {
    return new Map(products.map((product) => [product._id, product]));
  }, [products]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-gray-600">
          <span className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></span>
          Loading bundle...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/products/bundles')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Bundles
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEdit ? 'Edit Bundle' : 'Create Bundle'}
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          Bundle two or more products into a curated combo. Customers will see each bundle as a row
          of swatches that link directly to the underlying product pages. Add at least one option so
  they know whether to pick two or three products.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bundle Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  handleInputChange('name', e.target.value);
                  setErrors((prev) => ({ ...prev, name: '' }));
                }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Performance Power Pack"
              />
              {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bundle Slug <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  handleInputChange('slug', e.target.value);
                  setErrors((prev) => ({ ...prev, slug: '' }));
                }}
                onBlur={(e) => handleInputChange('slug', slugify(e.target.value))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  errors.slug ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., performance-power-pack"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lowercase letters, numbers, and hyphens only.
              </p>
              {errors.slug && <p className="mt-1 text-sm text-red-500">{errors.slug}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Short blurb explaining why these products work well together."
            />
          </div>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => handleInputChange('isActive', e.target.checked)}
              className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded mr-2"
            />
            Bundle is active and visible in store highlights
          </label>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bundle Products</h2>
              <p className="text-sm text-gray-600 mt-1">
                Add at least two products. Each one can optionally include a swatch image that shows
                up in the bundle row. If you skip the swatch, the product’s primary image is used.
              </p>
            </div>
            <button
              type="button"
              onClick={addBundleItem}
              className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              <FaPlus className="mr-1" />
              Add Product
            </button>
          </div>

          {errors.items && <p className="text-sm text-red-500">{errors.items}</p>}

          <div className="space-y-4">
            {formData.items.map((item, index) => {
              const product = productLookup.get(item.product);
              return (
                <div
                  key={`bundle-item-${index}`}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Product {index + 1}
                    </h3>
                    <button
                      type="button"
                      onClick={() => removeBundleItem(index)}
                      className="text-red-500 hover:text-red-700"
                      disabled={formData.items.length <= 2}
                    >
                      <FaTrash />
                    </button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Choose product <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={item.product}
                        onChange={(e) => {
                          handleItemChange(index, 'product', e.target.value);
                          setErrors((prev) => ({
                            ...prev,
                            [`item-${index}`]: '',
                          }));
                        }}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          errors[`item-${index}`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select product…</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} · ₹{p.price}
                          </option>
                        ))}
                      </select>
                      {errors[`item-${index}`] && (
                        <p className="mt-1 text-sm text-red-500">
                          {errors[`item-${index}`]}
                        </p>
                      )}
                      {product && (
                        <p className="mt-2 text-xs text-gray-500">
                          Current price: ₹{product.price} · slug: {product.slug}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Swatch image URL (optional)
                      </label>
                      <input
                        type="text"
                        value={item.swatchImage || ''}
                        onChange={(e) => handleItemChange(index, 'swatchImage', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="https://..."
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Used as the color swatch thumbnail. Use a square image (at least 200×200).
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bundle Options</h2>
              <p className="text-sm text-gray-600 mt-1">
                Options tell shoppers how many products to choose and the combined price. For bundles
                with three or more linked products, include both “choose any 2” and “choose all 3”
                options so they understand the savings.
              </p>
              <div className="mt-3 inline-flex items-start gap-2 text-xs text-gray-500 bg-gray-100 rounded-md px-3 py-2">
                <FaInfoCircle className="mt-0.5 text-gray-400" />
                <span>
                  Tip: keep option titles action oriented (e.g., “Choose any 2 (save ₹300)”).
                  The storefront automatically surfaces these titles above the swatches.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={addBundleOption}
              className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              <FaPlus className="mr-1" />
              Add Option
            </button>
          </div>

          {errors.options && <p className="text-sm text-red-500">{errors.options}</p>}

          <div className="space-y-4">
            {formData.options.map((option, index) => (
              <div
                key={`bundle-option-${index}`}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Option {index + 1}
                  </h3>
                  <button
                    type="button"
                    onClick={() => removeBundleOption(index)}
                    className="text-red-500 hover:text-red-700"
                    disabled={formData.options.length <= 1}
                  >
                    <FaTrash />
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Option title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={option.title}
                      onChange={(e) => {
                        handleOptionChange(index, 'title', e.target.value);
                        setErrors((prev) => ({
                          ...prev,
                          [`option-title-${index}`]: '',
                        }));
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors[`option-title-${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Choose any 2 (save ₹200)"
                    />
                    {errors[`option-title-${index}`] && (
                      <p className="mt-1 text-sm text-red-500">
                        {errors[`option-title-${index}`]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={formData.items.length}
                      value={option.quantity}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        handleOptionChange(index, 'quantity', value);
                        setErrors((prev) => ({
                          ...prev,
                          [`option-quantity-${index}`]: '',
                        }));
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors[`option-quantity-${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors[`option-quantity-${index}`] && (
                      <p className="mt-1 text-sm text-red-500">
                        {errors[`option-quantity-${index}`]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bundle price <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={option.price}
                      onChange={(e) => {
                        handleOptionChange(index, 'price', Number(e.target.value));
                        setErrors((prev) => ({
                          ...prev,
                          [`option-price-${index}`]: '',
                        }));
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors[`option-price-${index}`] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g., 2499"
                    />
                    {errors[`option-price-${index}`] && (
                      <p className="mt-1 text-sm text-red-500">
                        {errors[`option-price-${index}`]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Discount label (optional)
                    </label>
                    <input
                      type="text"
                      value={option.discountLabel || ''}
                      onChange={(e) =>
                        handleOptionChange(index, 'discountLabel', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Save ₹300"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/products/bundles')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Bundle' : 'Create Bundle'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BundleForm;


