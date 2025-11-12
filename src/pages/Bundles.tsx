import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPlus, FaSearch, FaToggleOn, FaToggleOff, FaBoxOpen, FaEdit, FaTrash, FaTimes, FaSave } from 'react-icons/fa';
import { bundlesAPI, productsAPI, productQuantityBundlesAPI } from '../services/api';

interface BundleListItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  items: Array<{
    product: {
      _id: string;
      name: string;
      slug: string;
      images?: string[];
    } | string;
  }>;
  options: Array<{
    title: string;
    quantity: number;
    price: number;
    discountLabel?: string;
  }>;
  updatedAt: string;
}

interface QuantityBasedBundle {
  title: string;
  description: string;
  quantity: number;
  price: number;
}

interface QuantityBasedBundleProduct {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images?: string[];
  isActive?: boolean;
  bundles: QuantityBasedBundle[];
}

type BundleViewType = 'combo' | 'quantity';

const Bundles: React.FC = () => {
  const navigate = useNavigate();
  const [viewType, setViewType] = useState<BundleViewType>('combo');
  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [quantityBundleProducts, setQuantityBundleProducts] = useState<QuantityBasedBundleProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  
  // Modal state for editing quantity-based bundles
  const [editingProduct, setEditingProduct] = useState<QuantityBasedBundleProduct | null>(null);
  const [editingBundles, setEditingBundles] = useState<QuantityBasedBundle[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchBundles = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {};
      if (search.trim()) {
        params.search = search.trim();
      }
      if (showActiveOnly) {
        params.active = true;
      }
      const response = await bundlesAPI.list(params);
      setBundles(response || []);
    } catch (error: any) {
      console.error('Failed to load bundles', error);
      alert(error.message || 'Failed to load bundles');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuantityBasedBundles = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {};
      if (showActiveOnly) {
        params.active = true;
      }
      const response = await productsAPI.getAll(params);
      const products = (response?.data || response || []) as any[];
      
      // Filter products that have quantity-based bundles
      const productsWithBundles = products
        .filter((product) => product.bundles && Array.isArray(product.bundles) && product.bundles.length > 0)
        .map((product) => ({
          _id: product._id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          images: product.images || [],
          isActive: product.isActive !== false,
          bundles: product.bundles || [],
        }))
        .filter((product) => {
          // Apply search filter if provided
          if (search.trim()) {
            const searchLower = search.toLowerCase();
            return (
              product.name.toLowerCase().includes(searchLower) ||
              product.slug.toLowerCase().includes(searchLower) ||
              product.bundles.some((b: any) => 
                b.title?.toLowerCase().includes(searchLower) ||
                b.description?.toLowerCase().includes(searchLower)
              )
            );
          }
          return true;
        });
      
      setQuantityBundleProducts(productsWithBundles);
    } catch (error: any) {
      console.error('Failed to load quantity-based bundles', error);
      alert(error.message || 'Failed to load quantity-based bundles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewType === 'combo') {
      fetchBundles();
    } else {
      fetchQuantityBasedBundles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (viewType === 'combo') {
      fetchBundles();
    } else {
      fetchQuantityBasedBundles();
    }
  };

  const handleToggleActive = async () => {
    setShowActiveOnly((prev) => !prev);
    setTimeout(() => {
      if (viewType === 'combo') {
        fetchBundles();
      } else {
        fetchQuantityBasedBundles();
      }
    }, 0);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this bundle? This action cannot be undone.')) {
      return;
    }
    try {
      await bundlesAPI.delete(id);
      fetchBundles();
    } catch (error: any) {
      console.error('Failed to delete bundle', error);
      alert(error.message || 'Failed to delete bundle');
    }
  };

  // Quantity-based bundle management functions
  const handleEditQuantityBundles = (product: QuantityBasedBundleProduct) => {
    setEditingProduct(product);
    setEditingBundles(JSON.parse(JSON.stringify(product.bundles))); // Deep copy
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setEditingBundles([]);
  };

  const handleUpdateBundle = (index: number, field: keyof QuantityBasedBundle, value: string | number) => {
    setEditingBundles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddBundle = () => {
    setEditingBundles((prev) => [
      ...prev,
      {
        title: '',
        description: '',
        quantity: 1,
        price: 0,
      },
    ]);
  };

  const handleDeleteBundle = (index: number) => {
    if (!window.confirm('Delete this bundle option? This action cannot be undone.')) {
      return;
    }
    setEditingBundles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDeleteAllBundles = () => {
    if (!window.confirm('Delete all bundles for this product? This action cannot be undone.')) {
      return;
    }
    setEditingBundles([]);
  };

  const handleDeleteAllBundlesFromTable = async (product: QuantityBasedBundleProduct) => {
    if (!window.confirm(`Delete all bundles for "${product.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Use dedicated endpoint for deleting bundles
      await productQuantityBundlesAPI.delete(product._id);

      // Refresh the list
      await fetchQuantityBasedBundles();
    } catch (error: any) {
      console.error('Failed to delete bundles', error);
      alert(error.message || 'Failed to delete bundles');
    }
  };

  const handleSaveQuantityBundles = async () => {
    if (!editingProduct) return;

    // Validate bundles
    for (let i = 0; i < editingBundles.length; i++) {
      const bundle = editingBundles[i];
      if (!bundle.title.trim()) {
        alert(`Bundle ${i + 1}: Title is required`);
        return;
      }
      if (bundle.quantity < 1) {
        alert(`Bundle ${i + 1}: Quantity must be at least 1`);
        return;
      }
      if (bundle.price < 0) {
        alert(`Bundle ${i + 1}: Price must be 0 or higher`);
        return;
      }
    }

    setSaving(true);
    try {
      // Use dedicated endpoint for updating bundles only
      await productQuantityBundlesAPI.update(
        editingProduct._id,
        editingBundles.map((b) => ({
          title: b.title.trim(),
          description: b.description.trim() || '',
          quantity: Number(b.quantity),
          price: Number(b.price),
        }))
      );

      // Refresh the list
      await fetchQuantityBasedBundles();
      handleCloseModal();
    } catch (error: any) {
      console.error('Failed to update bundles', error);
      alert(error.message || 'Failed to update bundles');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Bundles</h1>
          <p className="text-sm text-gray-600 mt-1">
            {viewType === 'combo' 
              ? 'Curate bundles of two or more products. Bundles surface in the storefront as swatch-style shortcuts so shoppers can jump directly to each product page.'
              : 'Manage quantity-based bundles for individual products. These bundles offer discounts when customers buy multiple quantities of the same product.'}
          </p>
        </div>
        {viewType === 'combo' && (
          <button
            onClick={() => navigate('/products/bundles/new')}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            <FaPlus className="mr-2" />
            New Bundle
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setViewType('combo');
              setSearch('');
            }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewType === 'combo'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Combo Packs
          </button>
          <button
            onClick={() => {
              setViewType('quantity');
              setSearch('');
            }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewType === 'quantity'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Quantity-Based Bundles
          </button>
        </nav>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={viewType === 'combo' 
                  ? "Search bundles by name or description"
                  : "Search products or bundle titles"}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Search
            </button>
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            {showActiveOnly ? (
              <>
                <FaToggleOn className="mr-2 text-green-500" />
                Showing active bundles
              </>
            ) : (
              <>
                <FaToggleOff className="mr-2 text-gray-400" />
                Showing all bundles
              </>
            )}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {viewType === 'combo' ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bundle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Products
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Options
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bundles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={viewType === 'combo' ? 5 : 4} className="px-6 py-10 text-center text-gray-500">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></span>
                      Loading {viewType === 'combo' ? 'bundles' : 'products'}...
                    </div>
                  </td>
                </tr>
              ) : viewType === 'combo' ? (
                bundles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-500">
                        <FaBoxOpen size={42} />
                        <p className="text-sm font-medium">
                          No bundles found. Create your first bundle to highlight cross-sell combos.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  bundles.map((bundle) => (
                    <tr key={bundle._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{bundle.name}</div>
                        <div className="text-xs text-gray-500 mt-1">/{bundle.slug}</div>
                        {bundle.description && (
                          <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {bundle.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex flex-wrap gap-2">
                          {bundle.items.map((item, idx) => {
                            const product =
                              typeof item.product === 'string' ? null : item.product;
                            return (
                              <Link
                                key={`${bundle._id}-item-${idx}`}
                                to={`/products/${product?._id ?? ''}/edit`}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition"
                                onClick={(e) => {
                                  if (!product) {
                                    e.preventDefault();
                                  }
                                }}
                              >
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-200 overflow-hidden">
                                  {product?.images?.[0] ? (
                                    <img
                                      src={product.images[0]}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs text-gray-500">#{idx + 1}</span>
                                  )}
                                </span>
                                <span className="text-sm font-medium">
                                  {product?.name ?? 'Product'}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {bundle.options.map((option, idx) => (
                            <div key={`${bundle._id}-option-${idx}`} className="text-sm text-gray-700">
                              <span className="font-medium">{option.title}</span>{' '}
                              <span className="text-gray-500">
                                · choose {option.quantity}{' '}
                                {option.quantity === 2 ? 'products' : 'products'}
                              </span>{' '}
                              <span className="text-gray-900 font-semibold">₹{option.price}</span>
                              {option.discountLabel && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                                  {option.discountLabel}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {bundle.isActive ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/products/bundles/${bundle._id}/edit`)}
                            className="p-2 text-gray-500 hover:text-gray-700"
                            title="Edit bundle"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDelete(bundle._id)}
                            className="p-2 text-red-500 hover:text-red-700"
                            title="Delete bundle"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : quantityBundleProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <FaBoxOpen size={42} />
                      <p className="text-sm font-medium">
                        No products with quantity-based bundles found.
                      </p>
                      <p className="text-xs text-gray-400">
                        Quantity-based bundles are configured when editing individual products.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                quantityBundleProducts.map((product) => (
                  <tr key={product._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.images?.[0] && (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-12 h-12 rounded-md object-cover border border-gray-200"
                          />
                        )}
                        <div>
                          <div className="font-semibold text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500 mt-1">/{product.slug}</div>
                          <div className="text-sm text-gray-600 mt-1">Base Price: ₹{product.price}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {product.bundles.map((bundle, idx) => (
                          <div
                            key={`${product._id}-bundle-${idx}`}
                            className="text-sm text-gray-700 bg-gray-50 rounded-md p-2"
                          >
                            <div className="font-medium text-gray-900">{bundle.title}</div>
                            {bundle.description && (
                              <div className="text-xs text-gray-500 mt-0.5">{bundle.description}</div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-600">
                                Qty: {bundle.quantity}
                              </span>
                              <span className="text-gray-900 font-semibold">₹{bundle.price}</span>
                              {bundle.quantity > 1 && (
                                <span className="text-xs text-gray-500">
                                  (₹{Math.round(bundle.price / bundle.quantity)} per item)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {product.isActive ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleEditQuantityBundles(product)}
                          className="p-2 text-gray-500 hover:text-gray-700"
                          title="Edit product bundles"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteAllBundlesFromTable(product)}
                          className="p-2 text-red-500 hover:text-red-700"
                          title="Delete all bundles for this product"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Quantity-Based Bundles Modal */}
      {editingProduct && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Quantity-Based Bundles</h2>
                <p className="text-sm text-gray-600 mt-1">{editingProduct.name}</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Configure quantity-based bundles for this product. Customers can buy multiple quantities at discounted prices.
                </p>
                <div className="flex items-center gap-2">
                  {editingBundles.length > 0 && (
                    <button
                      onClick={handleDeleteAllBundles}
                      className="inline-flex items-center px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                      title="Delete all bundles"
                    >
                      <FaTrash className="mr-1" />
                      Delete All
                    </button>
                  )}
                  <button
                    onClick={handleAddBundle}
                    className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    <FaPlus className="mr-1" />
                    Add Bundle
                  </button>
                </div>
              </div>

              {editingBundles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FaBoxOpen size={32} className="mx-auto mb-2" />
                  <p className="text-sm">No bundles configured. Click "Add Bundle" to create one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {editingBundles.map((bundle, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">
                          Bundle {index + 1}
                        </h3>
                        <button
                          onClick={() => handleDeleteBundle(index)}
                          className="p-1.5 text-red-500 hover:text-red-700"
                          title="Delete bundle"
                        >
                          <FaTrash />
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={bundle.title}
                            onChange={(e) => handleUpdateBundle(index, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            placeholder="e.g., Buy 2 Save ₹500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={bundle.description}
                            onChange={(e) => handleUpdateBundle(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            placeholder="e.g., Two Jackets Bundle"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={bundle.quantity}
                            onChange={(e) => handleUpdateBundle(index, 'quantity', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Bundle Price <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={bundle.price}
                            onChange={(e) => handleUpdateBundle(index, 'price', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            placeholder="0"
                          />
                          {bundle.quantity > 0 && bundle.price > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              ₹{Math.round(bundle.price / bundle.quantity)} per item
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuantityBundles}
                disabled={saving || editingBundles.length === 0}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed inline-flex items-center"
              >
                {saving ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <FaSave className="mr-2" />
                    Save Bundles
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bundles;


