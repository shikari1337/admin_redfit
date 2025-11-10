import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPlus, FaSearch, FaToggleOn, FaToggleOff, FaBoxOpen, FaEdit, FaTrash } from 'react-icons/fa';
import { bundlesAPI } from '../services/api';

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

const Bundles: React.FC = () => {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);

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

  useEffect(() => {
    fetchBundles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetchBundles();
  };

  const handleToggleActive = async () => {
    setShowActiveOnly((prev) => !prev);
    setTimeout(fetchBundles, 0);
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

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Bundles</h1>
          <p className="text-sm text-gray-600 mt-1">
            Curate bundles of two or more products. Bundles surface in the storefront as swatch-style
            shortcuts so shoppers can jump directly to each product page.
          </p>
        </div>
        <button
          onClick={() => navigate('/products/bundles/new')}
          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          <FaPlus className="mr-2" />
          New Bundle
        </button>
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
                placeholder="Search bundles by name or description"
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></span>
                      Loading bundles...
                    </div>
                  </td>
                </tr>
              ) : bundles.length === 0 ? (
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
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Bundles;


