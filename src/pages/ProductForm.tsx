import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsAPI, uploadAPI } from '../services/api';
import { FaUpload, FaTimes, FaPlus, FaTrash, FaArrowLeft } from 'react-icons/fa';
import IconPicker from '../components/IconPicker';

interface ProductSize {
  size: string;
  stock: number;
  sku: string;
  price: number;
  originalPrice: number;
}

interface ProductVariant {
  colorName: string;
  colorCode: string;
  price: number;
  originalPrice: number;
  images: string[];
  sizes: ProductSize[];
}

interface ProductBundle {
  title: string;
  description: string;
  quantity: number;
  price: number;
}

const ProductForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customerOrderImagesInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    originalPrice: '',
    description: '',
    richDescription: '',
    images: [] as string[],
    videos: [] as string[],
    sizes: [] as string[],
    sizeChart: [] as Array<{
      size: string;
      chest?: string;
      waist?: string;
      length?: string;
      shoulder?: string;
      sleeve?: string;
      imageUrl?: string; // Size chart image URL
      [key: string]: string | undefined;
    }>,
    washCareInstructions: [] as Array<{ text: string; iconUrl?: string; iconName?: string }>,
    customerOrderImages: [] as string[],
    disableVariants: false,
    showOutOfStockVariants: true,
    showFeatures: true,
    isActive: true,
    variants: [] as ProductVariant[],
    bundles: [] as ProductBundle[],
  });

  // Unused - using handleMultipleImageUpload instead
  // const [newImage, setNewImage] = useState<File | null>(null);
  const [newVideos, setNewVideos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        richDescription: product.richDescription || '',
        images: product.images || [],
        videos: product.videos || [],
        sizes: product.sizes || [],
        sizeChart: product.sizeChart || [],
        washCareInstructions: product.washCareInstructions || [],
        customerOrderImages: product.customerOrderImages || [],
        disableVariants: product.disableVariants || false,
        showOutOfStockVariants: product.showOutOfStockVariants !== false,
        showFeatures: product.showFeatures !== false,
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Valid price is required';
    }

    if (!formData.originalPrice || parseFloat(formData.originalPrice) <= 0) {
      newErrors.originalPrice = 'Valid original price is required';
    }

    if (parseFloat(formData.originalPrice) < parseFloat(formData.price)) {
      newErrors.originalPrice = 'Original price must be greater than or equal to price';
    }

    if (formData.images.length === 0) {
      newErrors.images = 'At least one image is required';
    }

    if (formData.sizes.length === 0 && formData.variants.length === 0) {
      newErrors.sizes = 'Add at least one size or variant';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleImageUpload(e.dataTransfer.files);
    }
  };

  // Unused - replaced by handleMultipleImageUpload
  // const handleImageUpload = async () => {
  //   if (!newImage) return;

  //   setUploading(true);
  //   try {
  //     const response = await uploadAPI.uploadSingle(newImage, 'products');
  //     setFormData({
  //       ...formData,
  //       images: [...formData.images, response.data.url],
  //     });
  //     setNewImage(null);
  //     if (fileInputRef.current) {
  //       fileInputRef.current.value = '';
  //     }
  //     setErrors({ ...errors, images: '' });
  //   } catch (error) {
  //     alert('Failed to upload image');
  //   } finally {
  //     setUploading(false);
  //   }
  // };

  const handleMultipleImageUpload = async (files: FileList) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploading(true);
    try {
      const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
      // Backend returns { success: true, data: { files: [{ url, key }] } }
      const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
      setFormData({
        ...formData,
        images: [...formData.images, ...uploadedUrls],
      });
      setErrors({ ...errors, images: '' });
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.response?.data?.message || 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
  };

  const reorderImages = (fromIndex: number, toIndex: number) => {
    const newImages = [...formData.images];
    const [removed] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, removed);
    setFormData({ ...formData, images: newImages });
  };

  const addVariant = () => {
    setFormData({
      ...formData,
      variants: [
        ...formData.variants,
        {
          colorName: '',
          colorCode: '#000000',
          price: parseFloat(formData.price) || 0,
          originalPrice: parseFloat(formData.originalPrice) || 0,
          images: [],
          sizes: [],
        },
      ],
    });
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData({ ...formData, variants: newVariants });
  };

  const removeVariant = (index: number) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((_, i) => i !== index),
    });
  };

  const addVariantSize = (variantIndex: number) => {
    const variant = formData.variants[variantIndex];
    const newVariants = [...formData.variants];
    newVariants[variantIndex] = {
      ...variant,
      sizes: [
        ...variant.sizes,
        {
          size: '',
          stock: 0,
          sku: '',
          price: variant.price,
          originalPrice: variant.originalPrice,
        },
      ],
    };
    setFormData({ ...formData, variants: newVariants });
  };

  const updateVariantSize = (variantIndex: number, sizeIndex: number, field: keyof ProductSize, value: any) => {
    const newVariants = [...formData.variants];
    const variant = newVariants[variantIndex];
    const newSizes = [...variant.sizes];
    newSizes[sizeIndex] = { ...newSizes[sizeIndex], [field]: value };
    newVariants[variantIndex] = { ...variant, sizes: newSizes };
    setFormData({ ...formData, variants: newVariants });
  };

  const removeVariantSize = (variantIndex: number, sizeIndex: number) => {
    const newVariants = [...formData.variants];
    const variant = newVariants[variantIndex];
    variant.sizes = variant.sizes.filter((_, i) => i !== sizeIndex);
    setFormData({ ...formData, variants: newVariants });
  };

  const addBundle = () => {
    setFormData({
      ...formData,
      bundles: [
        ...formData.bundles,
        {
          title: '',
          description: '',
          quantity: 1,
          price: 0,
        },
      ],
    });
  };

  const updateBundle = (index: number, field: keyof ProductBundle, value: any) => {
    const newBundles = [...formData.bundles];
    newBundles[index] = { ...newBundles[index], [field]: value };
    setFormData({ ...formData, bundles: newBundles });
  };

  const removeBundle = (index: number) => {
    setFormData({
      ...formData,
      bundles: formData.bundles.filter((_, i) => i !== index),
    });
  };

  const handleVariantImageUpload = async (variantIndex: number, files: FileList) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploading(true);
    try {
      const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
      const newVariants = [...formData.variants];
      newVariants[variantIndex] = {
        ...newVariants[variantIndex],
        images: [...newVariants[variantIndex].images, ...response.data.files.map((f: any) => f.url || f)],
      };
      setFormData({ ...formData, variants: newVariants });
    } catch (error) {
      alert('Failed to upload variant images');
    } finally {
      setUploading(false);
    }
  };

  const removeVariantImage = (variantIndex: number, imageIndex: number) => {
    const newVariants = [...formData.variants];
    newVariants[variantIndex] = {
      ...newVariants[variantIndex],
      images: newVariants[variantIndex].images.filter((_, i) => i !== imageIndex),
    };
    setFormData({ ...formData, variants: newVariants });
  };

  const handleVideoFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const videoFiles: File[] = [];
    const invalidFiles: string[] = [];
    const oversizedFiles: string[] = [];
    
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('video/')) {
        invalidFiles.push(file.name);
        return;
      }
      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        oversizedFiles.push(file.name);
        return;
      }
      videoFiles.push(file);
    });
    
    if (invalidFiles.length > 0) {
      alert(`Invalid files (not video): ${invalidFiles.join(', ')}`);
    }
    if (oversizedFiles.length > 0) {
      alert(`Files too large (max 100MB): ${oversizedFiles.join(', ')}`);
    }
    
    if (videoFiles.length > 0) {
      setNewVideos(prev => [...prev, ...videoFiles]);
    }
  };

  const handleVideoUpload = async () => {
    if (newVideos.length === 0) return;

    setUploadingVideo(true);
    try {
      // Upload all videos at once
      const response = await uploadAPI.uploadMultiple(newVideos, 'videos');
      // Backend returns { success: true, data: { files: [{ url, key }] } }
      const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
      
      setFormData({
        ...formData,
        videos: [...formData.videos, ...uploadedUrls],
      });
      setNewVideos([]);
      setErrors({ ...errors, videos: '' });
    } catch (error: any) {
      console.error('Video upload error:', error);
      alert(error.response?.data?.message || 'Failed to upload videos');
    } finally {
      setUploadingVideo(false);
    }
  };

  const addVideoUrl = () => {
    const url = prompt('Enter video URL (YouTube, Vimeo, or direct URL):');
    if (url && url.trim()) {
      setFormData({
        ...formData,
        videos: [...formData.videos, url.trim()],
      });
    }
  };

  const removeVideo = (index: number) => {
    setFormData({
      ...formData,
      videos: formData.videos.filter((_, i) => i !== index),
    });
  };

  const addSizeChartEntry = () => {
    setFormData({
      ...formData,
      sizeChart: [
        ...formData.sizeChart,
        {
          size: '',
          chest: '',
          waist: '',
          length: '',
          shoulder: '',
          sleeve: '',
        },
      ],
    });
  };

  const updateSizeChart = (index: number, field: string, value: string) => {
    const newSizeChart = [...formData.sizeChart];
    newSizeChart[index] = { ...newSizeChart[index], [field]: value };
    setFormData({ ...formData, sizeChart: newSizeChart });
  };

  const removeSizeChartEntry = (index: number) => {
    setFormData({
      ...formData,
      sizeChart: formData.sizeChart.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
        originalPrice: parseFloat(formData.originalPrice),
        sizes: formData.sizes.filter((s) => s.trim()),
        videos: formData.videos.filter((v) => v.trim()),
        sizeChart: formData.sizeChart.filter((sc) => sc.size.trim()),
        washCareInstructions: formData.washCareInstructions.filter((instr) => instr.text.trim() !== ''),
        customerOrderImages: formData.customerOrderImages,
        disableVariants: formData.disableVariants,
        showOutOfStockVariants: formData.showOutOfStockVariants,
        showFeatures: formData.showFeatures,
        variants: formData.variants.map((v) => ({
          ...v,
          sizes: v.sizes.filter((s) => s.size.trim() && s.sku.trim()),
        })),
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
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/products')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Products
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEdit ? 'Edit Product' : 'New Product'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setErrors({ ...errors, name: '' });
                    }}
                    placeholder="e.g., Redfit Premium T-Shirt"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Short Description
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short description for product cards..."
                  />
                  <p className="mt-1 text-xs text-gray-500">Short description for product cards</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rich Description (HTML)
                  </label>
                  <textarea
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                    value={formData.richDescription}
                    onChange={(e) => setFormData({ ...formData, richDescription: e.target.value })}
                    placeholder="<p>HTML content here</p>"
                  />
                  <p className="mt-1 text-xs text-gray-500">HTML content for detailed product description</p>
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Product Images <span className="text-red-500">*</span>
              </h2>

              {/* Image Upload Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-red-500 bg-red-50'
                    : errors.images
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300 bg-gray-50'
                } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleMultipleImageUpload(e.target.files);
                    }
                  }}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className={`cursor-pointer ${uploading ? 'cursor-not-allowed' : ''}`}>
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600 font-medium">Uploading images...</p>
                      <p className="text-xs text-gray-500 mt-1">Please wait</p>
                    </>
                  ) : (
                    <>
                      <FaUpload className="mx-auto text-4xl text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">
                        Drag and drop images here, or{' '}
                        <span className="text-red-600 font-medium">browse</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Supports JPG, PNG, GIF up to 10MB</p>
                    </>
                  )}
                </label>
              </div>

              {errors.images && <p className="mt-2 text-sm text-red-500">{errors.images}</p>}

              {/* Image Gallery */}
              {formData.images.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-4">
                  {formData.images.map((img, index) => (
                    <div key={`img-${index}-${img}`} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img
                          src={img}
                          alt={`Product ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {index === 0 && (
                        <span className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded">
                          Primary
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <FaTimes size={12} />
                      </button>
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => index > 0 && reorderImages(index, index - 1)}
                          disabled={index === 0}
                          className="flex-1 bg-black bg-opacity-70 text-white text-xs py-1 rounded disabled:opacity-30 hover:bg-opacity-90"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => index < formData.images.length - 1 && reorderImages(index, index + 1)}
                          disabled={index === formData.images.length - 1}
                          className="flex-1 bg-black bg-opacity-70 text-white text-xs py-1 rounded disabled:opacity-30 hover:bg-opacity-90"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Videos */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Videos</h2>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={addVideoUrl}
                    className="flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  >
                    <FaPlus className="mr-1" size={12} />
                    Add Video URL
                  </button>
                  <label className="flex items-center px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">
                    <FaUpload className="mr-1" size={12} />
                    Upload Video Files
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleVideoFileSelect(e.target.files)}
                    />
                  </label>
                  <span className="text-xs text-gray-500">Upload multiple video files (max 100MB each) or add URLs</span>
                </div>
                
                {/* Video Upload Area */}
                {newVideos.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md space-y-2">
                    {newVideos.map((file, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewVideos(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTimes size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={handleVideoUpload}
                        disabled={uploadingVideo}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadingVideo ? `Uploading ${newVideos.length} videos...` : `Upload ${newVideos.length} Video${newVideos.length > 1 ? 's' : ''}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewVideos([])}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Video List */}
                {formData.videos.length > 0 && (
                  <div className="space-y-2">
                    {formData.videos.map((video, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                        <input
                          type="text"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md"
                          value={video}
                          onChange={(e) => {
                            const newVideos = [...formData.videos];
                            newVideos[index] = e.target.value;
                            setFormData({ ...formData, videos: newVideos });
                          }}
                          placeholder="Video URL"
                        />
                        <button
                          type="button"
                          onClick={() => removeVideo(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTimes size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Variants */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Variants (Colors & Sizes)</h2>
                <button
                  type="button"
                  onClick={addVariant}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <FaPlus className="mr-1" size={12} />
                  Add Variant
                </button>
              </div>

              {formData.variants.length === 0 ? (
                <p className="text-sm text-gray-500">No variants added. Add variants for different colors.</p>
              ) : (
                <div className="space-y-4">
                  {formData.variants.map((variant, vIndex) => (
                    <div key={vIndex} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-sm font-medium text-gray-700">Variant {vIndex + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeVariant(vIndex)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>

                      {/* Color Swatch */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Color Swatch
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-2">
                            <input
                              type="color"
                              className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                              value={variant.colorCode}
                              onChange={(e) => updateVariant(vIndex, 'colorCode', e.target.value)}
                            />
                            <input
                              type="text"
                              className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                              value={variant.colorCode}
                              onChange={(e) => updateVariant(vIndex, 'colorCode', e.target.value)}
                              placeholder="#000000"
                            />
                          </div>
                          <input
                            type="text"
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={variant.colorName}
                            onChange={(e) => updateVariant(vIndex, 'colorName', e.target.value)}
                            placeholder="Color Name (e.g., Red)"
                          />
                        </div>
                      </div>

                      {/* Variant Images Gallery */}
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Variant Images (for this color)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              handleVariantImageUpload(vIndex, e.target.files);
                            }
                          }}
                          className="hidden"
                          id={`variant-images-${vIndex}`}
                        />
                        <label
                          htmlFor={`variant-images-${vIndex}`}
                          className="inline-flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer mb-2"
                        >
                          <FaUpload className="mr-2" size={12} />
                          Upload Images
                        </label>
                        {variant.images.length > 0 && (
                          <div className="grid grid-cols-4 gap-2 mt-2">
                            {variant.images.map((img, imgIndex) => (
                              <div key={imgIndex} className="relative group">
                                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                                  <img src={img} alt={`Variant ${vIndex} image ${imgIndex + 1}`} className="w-full h-full object-cover" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeVariantImage(vIndex, imgIndex)}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <FaTimes size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Price (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={variant.price}
                            onChange={(e) => updateVariant(vIndex, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Original Price (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={variant.originalPrice}
                            onChange={(e) =>
                              updateVariant(vIndex, 'originalPrice', parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-medium text-gray-700">Sizes</label>
                          <button
                            type="button"
                            onClick={() => addVariantSize(vIndex)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            <FaPlus className="inline mr-1" size={10} />
                            Add Size
                          </button>
                        </div>
                        {variant.sizes.length === 0 ? (
                          <p className="text-xs text-gray-500">No sizes added for this variant.</p>
                        ) : (
                          <div className="space-y-2">
                            {variant.sizes.map((size, sIndex) => (
                              <div key={sIndex} className="grid grid-cols-5 gap-2">
                                <input
                                  type="text"
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="Size"
                                  value={size.size}
                                  onChange={(e) =>
                                    updateVariantSize(vIndex, sIndex, 'size', e.target.value)
                                  }
                                />
                                <input
                                  type="text"
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="SKU"
                                  value={size.sku}
                                  onChange={(e) =>
                                    updateVariantSize(vIndex, sIndex, 'sku', e.target.value)
                                  }
                                />
                                <input
                                  type="number"
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="Stock"
                                  value={size.stock}
                                  onChange={(e) =>
                                    updateVariantSize(vIndex, sIndex, 'stock', parseInt(e.target.value) || 0)
                                  }
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="Price"
                                  value={size.price}
                                  onChange={(e) =>
                                    updateVariantSize(vIndex, sIndex, 'price', parseFloat(e.target.value) || 0)
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => removeVariantSize(vIndex, sIndex)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <FaTrash size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bundles */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Bundles</h2>
                <button
                  type="button"
                  onClick={addBundle}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <FaPlus className="mr-1" size={12} />
                  Add Bundle
                </button>
              </div>

              {formData.bundles.length === 0 ? (
                <p className="text-sm text-gray-500">No bundles added.</p>
              ) : (
                <div className="space-y-4">
                  {formData.bundles.map((bundle, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-sm font-medium text-gray-700">Bundle {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeBundle(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={bundle.title}
                            onChange={(e) => updateBundle(index, 'title', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={bundle.quantity}
                            onChange={(e) => updateBundle(index, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            rows={2}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={bundle.description}
                            onChange={(e) => updateBundle(index, 'description', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            value={bundle.price}
                            onChange={(e) => updateBundle(index, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Pricing */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.price ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={formData.price}
                    onChange={(e) => {
                      setFormData({ ...formData, price: e.target.value });
                      setErrors({ ...errors, price: '' });
                    }}
                  />
                  {errors.price && <p className="mt-1 text-sm text-red-500">{errors.price}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Original Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.originalPrice ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={formData.originalPrice}
                    onChange={(e) => {
                      setFormData({ ...formData, originalPrice: e.target.value });
                      setErrors({ ...errors, originalPrice: '' });
                    }}
                  />
                  {errors.originalPrice && <p className="mt-1 text-sm text-red-500">{errors.originalPrice}</p>}
                </div>
              </div>
            </div>

            {/* Sizes (if no variants) */}
            {formData.variants.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Sizes</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Sizes <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.sizes ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="S, M, L, XL, XXL"
                    value={formData.sizes.join(', ')}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        sizes: e.target.value.split(',').map((s) => s.trim()),
                      });
                      setErrors({ ...errors, sizes: '' });
                    }}
                  />
                  {errors.sizes && <p className="mt-1 text-sm text-red-500">{errors.sizes}</p>}
                  <p className="mt-1 text-xs text-gray-500">Separate sizes with commas</p>
                </div>
              </div>
            )}

            {/* Size Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Size Chart</h2>
                <button
                  type="button"
                  onClick={addSizeChartEntry}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <FaPlus className="mr-1" size={12} />
                  Add Size Entry
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">Add size measurements for each size (chest, waist, length, etc.)</p>
              
              {formData.sizeChart.length === 0 ? (
                <p className="text-sm text-gray-500">No size chart entries added. Click "Add Size Entry" to add measurements.</p>
              ) : (
                <div className="space-y-4">
                  {formData.sizeChart.map((entry, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-sm font-medium text-gray-700">Entry {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeSizeChartEntry(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Size <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="S, M, L, XL"
                            value={entry.size}
                            onChange={(e) => updateSizeChart(index, 'size', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Chest</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="e.g., 38 inches"
                            value={entry.chest || ''}
                            onChange={(e) => updateSizeChart(index, 'chest', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Waist</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="e.g., 32 inches"
                            value={entry.waist || ''}
                            onChange={(e) => updateSizeChart(index, 'waist', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Length</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="e.g., 28 inches"
                            value={entry.length || ''}
                            onChange={(e) => updateSizeChart(index, 'length', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Shoulder</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="e.g., 16 inches"
                            value={entry.shoulder || ''}
                            onChange={(e) => updateSizeChart(index, 'shoulder', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Sleeve</label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder="e.g., 24 inches"
                            value={entry.sleeve || ''}
                            onChange={(e) => updateSizeChart(index, 'sleeve', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Size Chart Image URL (Optional)</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="https://example.com/size-chart.png"
                          value={entry.imageUrl || ''}
                          onChange={(e) => updateSizeChart(index, 'imageUrl', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">Optional: URL to a size chart image for this size</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Display Options */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Display Options</h2>
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showFeatures"
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    checked={formData.showFeatures}
                    onChange={(e) => setFormData({ ...formData, showFeatures: e.target.checked })}
                  />
                  <label htmlFor="showFeatures" className="ml-2 text-sm text-gray-700">
                    Show Features Box
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="disableVariants"
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    checked={formData.disableVariants}
                    onChange={(e) => setFormData({ ...formData, disableVariants: e.target.checked })}
                  />
                  <label htmlFor="disableVariants" className="ml-2 text-sm text-gray-700">
                    Disable Variants (Hide completely)
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showOutOfStockVariants"
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    checked={formData.showOutOfStockVariants}
                    onChange={(e) => setFormData({ ...formData, showOutOfStockVariants: e.target.checked })}
                  />
                  <label htmlFor="showOutOfStockVariants" className="ml-2 text-sm text-gray-700">
                    Show Out of Stock Variants (with swatches)
                  </label>
                </div>
              </div>
            </div>

            {/* Wash Care Instructions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Wash Care Instructions</h2>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      washCareInstructions: [...formData.washCareInstructions, { text: '', iconUrl: '', iconName: '' }]
                    });
                  }}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <FaPlus className="mr-1" size={12} />
                  Add Instruction
                </button>
              </div>
              <div className="space-y-3">
                {formData.washCareInstructions.map((instruction, index) => (
                  <div key={index} className="flex gap-3 p-3 border border-gray-200 rounded-md">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Text</label>
                      <input
                        type="text"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                        value={instruction.text}
                        onChange={(e) => {
                          const newInstructions = [...formData.washCareInstructions];
                          newInstructions[index].text = e.target.value;
                          setFormData({ ...formData, washCareInstructions: newInstructions });
                        }}
                        placeholder="Machine wash cold (30°C)"
                      />
                    </div>
                    <div className="flex-1">
                      <IconPicker
                        label="Icon (React Icon)"
                        value={instruction.iconName || ''}
                        onChange={(iconName) => {
                          const newInstructions = [...formData.washCareInstructions];
                          newInstructions[index].iconName = iconName;
                          newInstructions[index].iconUrl = iconName ? undefined : newInstructions[index].iconUrl; // Clear iconUrl if iconName is set
                          setFormData({ ...formData, washCareInstructions: newInstructions });
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Icon URL (Alternative)</label>
                      <input
                        type="text"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                        value={instruction.iconUrl || ''}
                        onChange={(e) => {
                          const newInstructions = [...formData.washCareInstructions];
                          newInstructions[index].iconUrl = e.target.value;
                          newInstructions[index].iconName = e.target.value ? undefined : newInstructions[index].iconName; // Clear iconName if iconUrl is set
                          setFormData({ ...formData, washCareInstructions: newInstructions });
                        }}
                        placeholder="Or use custom icon image URL"
                      />
                      <p className="text-xs text-gray-500 mt-1">Use either React Icon or custom image URL</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newInstructions = formData.washCareInstructions.filter((_, i) => i !== index);
                        setFormData({ ...formData, washCareInstructions: newInstructions });
                      }}
                      className="text-red-600 hover:text-red-800 mt-6"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                ))}
                {formData.washCareInstructions.length === 0 && (
                  <p className="text-sm text-gray-500">No wash care instructions added</p>
                )}
              </div>
            </div>

            {/* Customer Order Images Gallery */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Order Images Gallery</h2>
              <p className="text-sm text-gray-600 mb-4">Upload screenshots of customer orders to display on product page</p>
              
              <div className="mb-4">
                <input
                  ref={customerOrderImagesInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      const imageFiles = files.filter(file => file.type.startsWith('image/'));
                      if (imageFiles.length === 0) {
                        alert('Please select image files');
                        return;
                      }

                      setUploading(true);
                      try {
                        const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
                        const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
                        setFormData({
                          ...formData,
                          customerOrderImages: [...formData.customerOrderImages, ...uploadedUrls],
                        });
                        if (customerOrderImagesInputRef.current) {
                          customerOrderImagesInputRef.current.value = '';
                        }
                      } catch (error: any) {
                        console.error('Upload error:', error);
                        alert(error.response?.data?.message || 'Failed to upload images');
                      } finally {
                        setUploading(false);
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => customerOrderImagesInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  <FaUpload className="mr-2" size={14} />
                  {uploading ? 'Uploading...' : 'Upload Customer Order Images'}
                </button>
              </div>

              {formData.customerOrderImages.length > 0 && (
                <div className="grid grid-cols-4 gap-4">
                  {formData.customerOrderImages.map((imageUrl, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={imageUrl}
                        alt={`Customer order ${index + 1}`}
                        className="w-full h-32 object-cover rounded-md border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newImages = formData.customerOrderImages.filter((_, i) => i !== index);
                          setFormData({ ...formData, customerOrderImages: newImages });
                        }}
                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>
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
              <p className="mt-2 text-xs text-gray-500">
                Only active products will be visible to customers
              </p>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium"
                >
                  {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
