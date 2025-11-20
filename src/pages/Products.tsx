import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productsAPI } from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaCog, FaCopy } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const Products: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  const sanitizeProduct = (product: any): any => {
    // Backend now sends all ObjectIds as strings via serializeObjectIds()
    // This is just a safety check for edge cases
    const sanitized = { ...product };
    
    // Ensure _id is a string (backend handles this, but safety check)
    if (sanitized._id && typeof sanitized._id !== 'string') {
      sanitized._id = String(sanitized._id);
    }
    
    // Ensure categories are properly formatted (backend handles this)
    if (Array.isArray(sanitized.categories)) {
      sanitized.categories = sanitized.categories.map((cat: any) => {
        if (typeof cat === 'string') return cat;
        if (cat && typeof cat === 'object' && cat._id) {
          return {
            ...cat,
            _id: typeof cat._id === 'string' ? cat._id : String(cat._id)
          };
        }
        return cat;
      });
    }
    
    // Sanitize images - ensure they're strings
    if (Array.isArray(sanitized.images)) {
      sanitized.images = sanitized.images
        .map((img: any) => {
          if (typeof img === 'string') {
            return img;
          }
          // Skip buffer objects or non-string images
          return null;
        })
        .filter((img: any) => img !== null);
    }
    
    // Ensure all numeric fields are numbers
    if (sanitized.price !== undefined) {
      sanitized.price = typeof sanitized.price === 'number' ? sanitized.price : Number(sanitized.price) || 0;
    }
    if (sanitized.originalPrice !== undefined) {
      sanitized.originalPrice = typeof sanitized.originalPrice === 'number' ? sanitized.originalPrice : Number(sanitized.originalPrice) || 0;
    }
    
    // Ensure name is a string
    if (sanitized.name !== undefined) {
      sanitized.name = String(sanitized.name || '');
    }
    
    return sanitized;
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      const products = response.data || [];
      // Sanitize all products to remove any buffer objects or non-serializable data
      setProducts(products.map(sanitizeProduct));
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const response = await productsAPI.duplicate(id);
      const prefilledData = response?.data;
      
      if (prefilledData) {
        // Navigate to add page with prefilled data
        navigate('/products/new', {
          state: { prefilledData, duplicatedFrom: id },
        });
      } else {
        alert('Failed to load product data for duplication.');
      }
    } catch (error) {
      console.error('Failed to duplicate product:', error);
      alert('Failed to duplicate product. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await productsAPI.delete(id);
      fetchProducts();
    } catch (error) {
      alert('Failed to delete product');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading products..." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <Link
          to="/products/new"
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FaPlus className="mr-2" />
          Add Product
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categories
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
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No products found
                </td>
              </tr>
            ) : (
              products.map((product, index) => (
                <tr key={String(product._id || index)} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {product.images && Array.isArray(product.images) && product.images.length > 0 && typeof product.images[0] === 'string' && (
                        <img
                          src={product.images[0]}
                          alt={String(product.name || 'Product')}
                          className="h-12 w-12 rounded object-cover mr-4"
                          onError={(e) => {
                            // Hide image if it fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{product.name || 'Unnamed Product'}</div>
                        <div className="text-sm text-gray-500">ID: {String(product._id || '')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      ₹{typeof product.price === 'number' ? product.price.toLocaleString('en-IN') : '0'}
                    </div>
                    {product.originalPrice && typeof product.originalPrice === 'number' && (
                      <div className="text-sm text-gray-500 line-through">
                        ₹{product.originalPrice.toLocaleString('en-IN')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.categories && Array.isArray(product.categories) && product.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {product.categories.map((cat: any, index: number) => {
                          // Safely extract category data, handling various formats
                          let id: string;
                          let name: string;
                          
                          if (typeof cat === 'string') {
                            id = cat;
                            name = cat;
                          } else if (cat && typeof cat === 'object') {
                            // Handle ObjectId or populated category
                            id = cat._id ? String(cat._id) : cat.slug || cat.name || `cat-${index}`;
                            name = cat.name || cat.slug || 'Category';
                            // Ensure name is a string, not an object
                            name = String(name);
                          } else {
                            id = `cat-${index}`;
                            name = 'Category';
                          }
                          
                          return (
                            <span
                              key={`${String(product._id || '')}-${id}-${index}`}
                              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                            >
                              {name}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        product.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <Link
                        to={`/products/${product._id || ''}/edit`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Product"
                      >
                        <FaEdit />
                      </Link>
                      <Link
                        to={`/products/${product._id || ''}/sections`}
                        className="text-purple-600 hover:text-purple-900"
                        title="Manage Sections"
                      >
                        <FaCog />
                      </Link>
                      <button
                        onClick={() => handleDuplicate(product._id || '')}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                        title="Duplicate Product"
                        disabled={duplicatingId === product._id}
                      >
                        {duplicatingId === product._id ? (
                          <svg
                            className="animate-spin h-4 w-4"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            ></path>
                          </svg>
                        ) : (
                          <FaCopy />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(product._id || '')}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Product"
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
  );
};

export default Products;

