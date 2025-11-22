import React, { useEffect, useState } from 'react';
import { reviewsAPI, uploadAPI } from '../services/api';
import { FaUpload, FaTimes, FaPlus, FaTrash, FaEdit, FaFileCsv, FaDownload } from 'react-icons/fa';
import ImageInputWithActions from '../components/common/ImageInputWithActions';

interface Review {
  _id: string;
  productId: string | { _id: string; name: string; sku?: string }; // Can be populated
  orderId?: string;
  customerName: string;
  customerEmail?: string;
  customerImage?: string;
  rating: number;
  review: string;
  images?: string[];
  link?: string;
  description?: string;
  isVerified: boolean;
  isApproved: boolean;
  helpfulCount: number;
  createdAt: string;
}

interface Product {
  _id: string;
  name: string;
  sku?: string;
}

const Reviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newReview, setNewReview] = useState<Partial<Review>>({
    productId: '',
    customerName: '',
    customerEmail: '',
    rating: 5,
    review: '',
    link: '',
    description: '',
    images: [],
    isApproved: true,
    isVerified: false,
  });
  const [newImage, setNewImage] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bulkUploadMode, setBulkUploadMode] = useState(false);
  const [_csvFile, setCsvFile] = useState<File | null>(null); // File state for CSV upload (setter used for clearing)
  const [csvData, setCsvData] = useState<any[]>([]);

  useEffect(() => {
    fetchReviews();
  }, [pagination.page]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await reviewsAPI.getAll({
        page: pagination.page,
        limit: pagination.limit,
      });
      // Backend returns: { data: reviews[], pagination: {...} }
      const reviewsData = response?.data || response?.data?.data || Array.isArray(response) ? response : [];
      // Ensure all _id fields are strings
      const sanitizedReviews = Array.isArray(reviewsData) ? reviewsData.map((review: any) => ({
        ...review,
        _id: typeof review._id === 'string' ? review._id : String(review._id || ''),
        productId: typeof review.productId === 'string' 
          ? review.productId 
          : (typeof review.productId === 'object' && review.productId?._id 
            ? (typeof review.productId._id === 'string' ? review.productId._id : String(review.productId._id || ''))
            : ''),
      })) : [];
      setReviews(sanitizedReviews);
      if (response?.pagination) {
        setPagination(prev => ({ ...prev, ...response.pagination }));
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await reviewsAPI.getProducts?.() || await fetch('/api/v1/products').then(r => r.json());
      const productsData = response?.data || response?.data?.data || Array.isArray(response) ? response : [];
      // Ensure we have SKU field and _id is string
      setProducts(Array.isArray(productsData) ? productsData.map((p: any) => ({
        _id: typeof p._id === 'string' ? p._id : String(p._id || ''),
        name: p.name || '',
        sku: p.sku || '',
      })) : []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    }
  };

  // Helper function to normalize productId to string
  const normalizeProductId = (productId: string | { _id: string; name: string; sku?: string } | undefined): string => {
    if (!productId) return '';
    if (typeof productId === 'string') return productId;
    if (typeof productId === 'object' && productId !== null) {
      const id = productId._id;
      return typeof id === 'string' ? id : String(id || '');
    }
    return '';
  };

  const handleImageUpload = async (reviewId?: string) => {
    if (!newImage) return;

    setUploading(true);
    try {
      const response = await uploadAPI.uploadSingle(newImage, 'reviews');
      const imageUrl = response.data.url;

      if (reviewId && editingId) {
        // Update existing review
        const review = reviews.find(r => {
          const rId = typeof r._id === 'string' ? r._id : String(r._id || '');
          return rId === reviewId;
        });
        if (review) {
          const updatedImages = [...(review.images || []), imageUrl];
          const rId = typeof review._id === 'string' ? review._id : String(review._id || '');
          await reviewsAPI.update(rId, { images: updatedImages });
          fetchReviews();
        }
      } else {
        // Add to new review
        setNewReview({
          ...newReview,
          images: [...(newReview.images || []), imageUrl],
        });
      }
      setNewImage(null);
    } catch (error) {
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };


  const handleSaveReview = async () => {
    try {
      if (editingId) {
        await reviewsAPI.update(editingId, newReview);
      } else {
        await reviewsAPI.create(newReview);
      }
      setNewReview({
        productId: '',
        customerName: '',
        customerEmail: '',
        rating: 5,
        review: '',
        link: '',
        description: '',
        images: [],
        customerImage: undefined,
        isApproved: true,
        isVerified: false,
      });
      setEditingId(null);
      fetchReviews();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save review');
    }
  };

  const handleDeleteReview = async (id: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      await reviewsAPI.delete(id);
      fetchReviews();
    } catch (error) {
      alert('Failed to delete review');
    }
  };

  const handleToggleApproval = async (id: string, approved: boolean) => {
    try {
      await reviewsAPI.approve(id, approved);
      fetchReviews();
    } catch (error) {
      alert('Failed to update approval status');
    }
  };

  const handleCsvUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        alert('CSV file must have at least a header row and one data row');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
      
      const parsedData = lines.slice(1).map((line, lineIndex) => {
        // Handle quoted values in CSV
        const values: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim());
        
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        row._lineIndex = lineIndex + 2; // Line number for error reporting
        return row;
      });

      setCsvData(parsedData);
      
      let successCount = 0;
      let errorCount = 0;
      
      // Process CSV data and create reviews
      for (const row of parsedData) {
        try {
          // Handle Product SKU - need to find product by SKU
          const productSku = row.productsku || row.product_sku || row.sku || '';
          if (!productSku) {
            console.warn(`Skipping row ${row._lineIndex}: Missing Product SKU`);
            errorCount++;
            continue;
          }

          // Find product by SKU
          const product = products.find(p => p.sku === productSku);
          if (!product) {
            console.warn(`Skipping row ${row._lineIndex}: Product with SKU "${productSku}" not found`);
            errorCount++;
            continue;
          }

          const reviewData: any = {
            productId: product._id,
            customerName: row.name || row.customername || row.customer_name || '',
            customerEmail: row.email || row.customeremail || row.customer_email || '',
            rating: parseInt(row.rating || '5'),
            review: row.review || row.reviewtext || '',
            link: row.link || row.url || '',
            description: row.description || row.desc || '',
            isApproved: row.approved === 'TRUE' || row.approved === 'true' || row.approved === '1' || row.approved === true,
            isVerified: row.verified === 'TRUE' || row.verified === 'true' || row.verified === '1' || row.verified === true,
            images: [],
          };

          // Handle customer image URL
          if (row.customerimage || row.customer_image || row.imageurl || row.image_url) {
            reviewData.customerImage = row.customerimage || row.customer_image || row.imageurl || row.image_url;
          }

          // Handle review images (comma-separated URLs)
          if (row.reviewimages || row.review_images || row.images) {
            const imageUrls = (row.reviewimages || row.review_images || row.images).split(',').map((url: string) => url.trim()).filter((url: string) => url);
            reviewData.images = imageUrls;
          }

          await reviewsAPI.create(reviewData);
          successCount++;
        } catch (error: any) {
          console.error(`Failed to create review from CSV row ${row._lineIndex}:`, error);
          errorCount++;
        }
      }

      alert(`Import complete: ${successCount} successful, ${errorCount} failed`);
      setCsvFile(null);
      setCsvData([]);
      fetchReviews();
    };
    reader.readAsText(file);
  };

  const exportToCsv = () => {
    const headers = ['Name', 'Email', 'Rating', 'Review', 'Link', 'Description', 'Product SKU', 'Customer Image', 'Review Images', 'Approved', 'Verified'];
    const rows = reviews.map(review => {
      // Get product SKU - handle both populated and non-populated cases
      let productSku = '';
      if (typeof review.productId === 'object' && review.productId !== null) {
        productSku = (review.productId as any).sku || '';
      } else {
        // If not populated, try to find in products array
        const product = products.find(p => p._id === review.productId);
        productSku = product?.sku || '';
      }
      
      // Format review images as comma-separated string
      const reviewImages = (review.images || []).join(',');
      
      return [
        review.customerName,
        review.customerEmail || '',
        review.rating.toString(),
        review.review,
        review.link || '',
        review.description || '',
        productSku,
        review.customerImage || '',
        reviewImages,
        review.isApproved ? 'TRUE' : 'FALSE',
        review.isVerified ? 'TRUE' : 'FALSE',
      ];
    });

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reviews.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-center py-12">Loading reviews...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Reviews & Testimonials</h1>
        <div className="flex gap-2">
          <button
            onClick={exportToCsv}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <FaDownload size={14} />
            Export CSV
          </button>
          <button
            onClick={() => setBulkUploadMode(!bulkUploadMode)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <FaFileCsv size={14} />
            {bulkUploadMode ? 'Cancel Bulk Upload' : 'Bulk Upload CSV'}
          </button>
          <button
            onClick={() => setEditingId(null)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <FaPlus size={14} />
            Add Review
          </button>
        </div>
      </div>

      {/* Bulk CSV Upload */}
      {bulkUploadMode && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bulk Upload Reviews (CSV)</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV File (headers: Name, Email, Rating, Review, Link, Description, Product SKU, Customer Image, Review Images, Approved, Verified)
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setCsvFile(e.target.files[0]);
                    handleCsvUpload(e.target.files[0]);
                  }
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            {csvData.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="text-sm text-gray-600">Preview: {csvData.length} rows found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Review Form */}
      {!bulkUploadMode && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Review' : 'Add New Review'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select
                value={normalizeProductId(newReview.productId)}
                onChange={(e) => setNewReview({ ...newReview, productId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select Product</option>
                {products.map(product => (
                  <option key={product._id} value={product._id}>{product.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newReview.customerName || ''}
                onChange={(e) => setNewReview({ ...newReview, customerName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Customer Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newReview.customerEmail || ''}
                onChange={(e) => setNewReview({ ...newReview, customerEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rating (1-5)</label>
              <select
                value={newReview.rating || 5}
                onChange={(e) => setNewReview({ ...newReview, rating: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {[5, 4, 3, 2, 1].map(r => (
                  <option key={r} value={r}>{r} Star{r > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Review</label>
              <textarea
                value={newReview.review || ''}
                onChange={(e) => setNewReview({ ...newReview, review: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
                placeholder="Customer review text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
              <input
                type="url"
                value={newReview.link || ''}
                onChange={(e) => setNewReview({ ...newReview, link: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={newReview.description || ''}
                onChange={(e) => setNewReview({ ...newReview, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Additional description"
              />
            </div>
            <div className="md:col-span-2">
              <ImageInputWithActions
                value={newReview.customerImage || ''}
                onChange={(url) => setNewReview({ ...newReview, customerImage: url })}
                label="Customer Image (Profile Photo)"
                placeholder="Enter customer image URL manually (https://...)"
                contextData={newReview.customerName ? { productName: newReview.customerName, itemDescription: newReview.description } : undefined}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Images</label>
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
                  <FaUpload size={14} />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setNewImage(e.target.files[0]);
                      }
                    }}
                  />
                </label>
                {newImage && (
                  <button
                    onClick={() => handleImageUpload()}
                    disabled={uploading}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                )}
              </div>
              {newReview.images && newReview.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {newReview.images.map((img, index) => (
                    <div key={index} className="relative">
                      <img src={img} alt={`Review ${index + 1}`} className="w-20 h-20 object-cover rounded" />
                      <button
                        onClick={() => {
                          setNewReview({
                            ...newReview,
                            images: newReview.images?.filter((_, i) => i !== index),
                          });
                        }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        <FaTimes size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newReview.isApproved || false}
                  onChange={(e) => setNewReview({ ...newReview, isApproved: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Approved</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newReview.isVerified || false}
                  onChange={(e) => setNewReview({ ...newReview, isVerified: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Verified</span>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSaveReview}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {editingId ? 'Update Review' : 'Add Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Link</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No reviews found. Add your first review above.
                  </td>
                </tr>
              ) : (
                reviews.map((review) => {
                  const reviewId = typeof review._id === 'string' ? review._id : String(review._id || '');
                  return (
                <tr key={reviewId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {review.customerImage && (
                        <img
                          src={review.customerImage}
                          alt={review.customerName}
                          className="w-10 h-10 rounded-full mr-3"
                          onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{review.customerName}</div>
                        {review.customerEmail && (
                          <div className="text-sm text-gray-500">{review.customerEmail}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className={i < review.rating ? 'text-yellow-400' : 'text-gray-300'}>★</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 line-clamp-2">{review.review}</div>
                    {review.description && (
                      <div className="text-xs text-gray-500 mt-1">{review.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {review.images && review.images.length > 0 ? (
                      <div className="flex gap-1">
                        {review.images.slice(0, 2).map((img, index) => (
                          <img
                            key={index}
                            src={img}
                            alt={`Review ${index + 1}`}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ))}
                        {review.images.length > 2 && (
                          <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-xs">
                            +{review.images.length - 2}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No image</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {review.link ? (
                      <a
                        href={review.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleToggleApproval(reviewId, !review.isApproved)}
                        className={`text-xs px-2 py-1 rounded ${
                          review.isApproved
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {review.isApproved ? 'Approved' : 'Pending'}
                      </button>
                      {review.isVerified && (
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">Verified</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(reviewId);
                          setNewReview({
                            ...review,
                            productId: normalizeProductId(review.productId) as string,
                          });
                        }}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <FaEdit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteReview(reviewId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="bg-white rounded-lg shadow mt-6">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reviews;

