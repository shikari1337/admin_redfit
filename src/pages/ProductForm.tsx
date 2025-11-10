import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsAPI, uploadAPI, categoriesAPI, sizeChartsAPI } from '../services/api';
import { FaUpload, FaTimes, FaPlus, FaTrash, FaArrowLeft } from 'react-icons/fa';
import IconPicker from '../components/IconPicker';

const SLUG_MAX_LENGTH = 40;
const META_TITLE_LIMIT = 70;
const META_DESCRIPTION_LIMIT = 200;

const slugifyValue = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);

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

interface CategoryOption {
  _id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

interface SizeChartEntry {
  size: string;
  chest?: string;
  waist?: string;
  length?: string;
  shoulder?: string;
  sleeve?: string;
  imageUrl?: string;
  [key: string]: string | undefined;
}

interface SizeChartOption {
  _id: string;
  name: string;
  entries?: SizeChartEntry[];
}

interface SeoFormState {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  metaRobots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

const emptySizeChartEntry: SizeChartEntry = {
  size: '',
  chest: '',
  waist: '',
  length: '',
  shoulder: '',
  sleeve: '',
  imageUrl: '',
};

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
    descriptionImage: '',
    images: [] as string[],
    videos: [] as string[],
    sizes: [] as string[],
    categories: [] as string[],
    sizeChart: [] as SizeChartEntry[],
    washCareInstructions: [] as Array<{ text: string; iconUrl?: string; iconName?: string }>,
    customerOrderImages: [] as string[],
    disableVariants: false,
    showOutOfStockVariants: true,
    showFeatures: true,
    isActive: true,
    variants: [] as ProductVariant[],
  });
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [seoData, setSeoData] = useState<SeoFormState>({
    title: '',
    description: '',
    keywords: '',
    canonicalUrl: '',
    metaRobots: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: '',
  });
  const [showAdvancedSeo, setShowAdvancedSeo] = useState(false);

  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>([]);
  const [availableSizeCharts, setAvailableSizeCharts] = useState<SizeChartOption[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [sizeChartMode, setSizeChartMode] = useState<'none' | 'reference' | 'custom'>('none');
  const [selectedSizeChartId, setSelectedSizeChartId] = useState<string>('');

  // Unused - using handleMultipleImageUpload instead
  // const [newImage, setNewImage] = useState<File | null>(null);
  const [newVideos, setNewVideos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const extractListData = (response: any) => {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response?.data?.data)) return response.data.data;
    if (Array.isArray(response?.data?.data?.data)) return response.data.data.data;
    if (Array.isArray(response?.data?.results)) return response.data.results;
    if (Array.isArray(response?.data?.items)) return response.data.items;
    return response.data?.data || response.data || [];
  };

  const loadLookups = async () => {
    setLookupsLoading(true);
    try {
      const [catResponse, chartResponse] = await Promise.all([
        categoriesAPI.list(),
        sizeChartsAPI.list(),
      ]);
      const categoryList: CategoryOption[] = extractListData(catResponse);
      const chartList: SizeChartOption[] = extractListData(chartResponse);
      setAvailableCategories(categoryList);
      setAvailableSizeCharts(chartList);
    } catch (err) {
      console.error('Failed to load lookups', err);
    } finally {
      setLookupsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    if (isEdit) {
      fetchProduct();
    }
  }, [id]);

  useEffect(() => {
    if (!slugManuallyEdited) {
      const autoSlug = slugifyValue(formData.name);
      setSlug((prev) => (prev === autoSlug ? prev : autoSlug));
    }
  }, [formData.name, slugManuallyEdited]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const response = await productsAPI.getById(id!);
      const product = response.data;
      const productCategories =
        (product.categories || []).map((cat: any) =>
          typeof cat === 'string' ? cat : cat?._id || ''
        ).filter(Boolean) || [];
      const inferredSizeChartId =
        product.sizeChartId ||
        (typeof product.sizeChart === 'string'
          ? product.sizeChart
          : product.sizeChart?._id);
      const sizeChartEntries: SizeChartEntry[] =
        product.sizeChartEntries ||
        (Array.isArray(product.sizeChart) ? product.sizeChart : []) ||
        [];
      const initialMode = inferredSizeChartId
        ? 'reference'
        : sizeChartEntries.length > 0
        ? 'custom'
        : 'none';

      setFormData({
        name: product.name || '',
        price: product.price?.toString() || '',
        originalPrice: product.originalPrice?.toString() || '',
        description: product.description || '',
        richDescription: product.richDescription || '',
        descriptionImage: product.descriptionImage || '',
        images: product.images || [],
        videos: product.videos || [],
        sizes: product.sizes || [],
        categories: productCategories,
        sizeChart:
          initialMode === 'custom'
            ? sizeChartEntries
            : sizeChartEntries.length > 0
            ? sizeChartEntries
            : [],
        washCareInstructions: product.washCareInstructions || [],
        customerOrderImages: product.customerOrderImages || [],
        disableVariants: product.disableVariants || false,
        showOutOfStockVariants: product.showOutOfStockVariants !== false,
        showFeatures: product.showFeatures !== false,
        isActive: product.isActive !== false,
        variants: product.variants || [],
      });
      setSizeChartMode(initialMode);
      setSelectedSizeChartId(inferredSizeChartId || '');
      if (
        inferredSizeChartId &&
        !availableSizeCharts.find(chart => chart._id === inferredSizeChartId)
      ) {
        if (product.sizeChartDetails) {
          setAvailableSizeCharts(prev => [
            ...prev,
            {
              _id: inferredSizeChartId,
              name: product.sizeChartDetails.name || 'Linked Size Chart',
              entries: product.sizeChartDetails.entries || sizeChartEntries,
            },
          ]);
        }
      }

      const normalizedSlug = product.slug ? String(product.slug) : slugifyValue(product.name || '');
      setSlug(normalizedSlug);
      setSlugManuallyEdited(true);

      const productSeo = product.seo || {};
      const keywordString = Array.isArray(productSeo.keywords)
        ? productSeo.keywords.join(', ')
        : typeof productSeo.keywords === 'string'
        ? productSeo.keywords
        : '';

      setSeoData({
        title: productSeo.title || '',
        description: productSeo.description || '',
        keywords: keywordString,
        canonicalUrl: productSeo.canonicalUrl || '',
        metaRobots: productSeo.metaRobots || '',
        ogTitle: productSeo.ogTitle || '',
        ogDescription: productSeo.ogDescription || '',
        ogImage: productSeo.ogImage || '',
      });

      if (
        productSeo.canonicalUrl ||
        productSeo.metaRobots ||
        productSeo.ogTitle ||
        productSeo.ogDescription ||
        productSeo.ogImage ||
        (Array.isArray(productSeo.keywords) && productSeo.keywords.length > 0)
      ) {
        setShowAdvancedSeo(true);
      }
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

    if (formData.categories.length === 0) {
      newErrors.categories = 'Select at least one category';
    }

    if (sizeChartMode === 'reference' && !selectedSizeChartId) {
      newErrors.sizeChart = 'Select a size chart';
    }

    if (sizeChartMode === 'custom') {
      const invalidEntry = formData.sizeChart.find((entry) => !entry.size.trim());
      if (invalidEntry) {
        newErrors.sizeChart = 'Each size chart entry must include a size value';
      }
    }

    const normalizedSlug = slugifyValue(slug);
    if (!normalizedSlug) {
      newErrors.slug = 'Product slug is required';
    } else if (normalizedSlug.length > SLUG_MAX_LENGTH) {
      newErrors.slug = `Slug must be ${SLUG_MAX_LENGTH} characters or fewer`;
    } else if (slug !== normalizedSlug) {
      newErrors.slug = 'Slug contains invalid characters';
    }

    const trimmedMetaTitle = seoData.title.trim();
    if (trimmedMetaTitle.length > META_TITLE_LIMIT) {
      newErrors.metaTitle = `Meta title must be ${META_TITLE_LIMIT} characters or fewer`;
    }

    const trimmedMetaDescription = seoData.description.trim();
    if (trimmedMetaDescription.length > META_DESCRIPTION_LIMIT) {
      newErrors.metaDescription = `Meta description must be ${META_DESCRIPTION_LIMIT} characters or fewer`;
    }

    if (
      seoData.canonicalUrl.trim() &&
      !/^https?:\/\//i.test(seoData.canonicalUrl.trim())
    ) {
      newErrors.canonicalUrl = 'Canonical URL must start with http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const toggleCategory = (categoryId: string) => {
    setFormData((prev) => {
      const exists = prev.categories.includes(categoryId);
      const categories = exists
        ? prev.categories.filter((id) => id !== categoryId)
        : [...prev.categories, categoryId];
      return { ...prev, categories };
    });
    setErrors((prev) => ({ ...prev, categories: '' }));
  };

  const selectedSizeChart = useMemo(
    () => availableSizeCharts.find((chart) => chart._id === selectedSizeChartId),
    [availableSizeCharts, selectedSizeChartId]
  );

  const ensureCustomEntriesInitialized = (sourceEntries?: SizeChartEntry[]) => {
    setFormData((prev) => {
      if (prev.sizeChart.length > 0) {
        return prev;
      }
      const entries =
        sourceEntries && sourceEntries.length > 0
          ? sourceEntries.map((entry) => ({ ...entry }))
          : [{ ...emptySizeChartEntry }];
      return { ...prev, sizeChart: entries };
    });
  };

  const handleSizeChartModeChange = (mode: 'none' | 'reference' | 'custom') => {
    setSizeChartMode(mode);
    setErrors((prev) => ({ ...prev, sizeChart: '' }));

    if (mode === 'none') {
      setSelectedSizeChartId('');
    } else if (mode === 'reference') {
      if (!selectedSizeChartId && availableSizeCharts.length > 0) {
        setSelectedSizeChartId(availableSizeCharts[0]._id);
      }
    } else if (mode === 'custom') {
      if (formData.sizeChart.length === 0) {
        const seedEntries = selectedSizeChart?.entries;
        ensureCustomEntriesInitialized(seedEntries);
      }
    }
  };

  const handleSelectSizeChartId = (chartId: string) => {
    setSelectedSizeChartId(chartId);
    setErrors((prev) => ({ ...prev, sizeChart: '' }));
    if (sizeChartMode === 'custom') {
      const chart = availableSizeCharts.find((c) => c._id === chartId);
      if (chart?.entries?.length) {
        setFormData((prev) => ({
          ...prev,
          sizeChart: chart.entries ? chart.entries.map((entry) => ({ ...entry })) : prev.sizeChart,
        }));
      }
    }
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
      // Check response structure - it might be response.data or response
      let uploadedUrls: string[] = [];
      
      if (response.data?.files && Array.isArray(response.data.files)) {
        uploadedUrls = response.data.files.map((f: any) => f.url || f);
      } else if (response.files && Array.isArray(response.files)) {
        uploadedUrls = response.files.map((f: any) => f.url || f);
      } else if (response.data?.urls && Array.isArray(response.data.urls)) {
        uploadedUrls = response.data.urls;
      } else if (Array.isArray(response.data)) {
        uploadedUrls = response.data.map((f: any) => f.url || f);
      }
      
      if (uploadedUrls.length === 0) {
        console.error('No URLs found in response:', response);
        throw new Error('Failed to get uploaded video URLs from response');
      }
      
      setFormData({
        ...formData,
        videos: [...formData.videos, ...uploadedUrls],
      });
      setNewVideos([]);
      setErrors({ ...errors, videos: '' });
    } catch (error: any) {
      console.error('Video upload error:', error);
      alert(error.response?.data?.message || error.message || 'Failed to upload videos');
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
    setFormData((prev) => ({
      ...prev,
      sizeChart: [...prev.sizeChart, { ...emptySizeChartEntry }],
    }));
  };

  const updateSizeChart = (index: number, field: string, value: string) => {
    setFormData((prev) => {
      const newSizeChart = [...prev.sizeChart];
      newSizeChart[index] = { ...newSizeChart[index], [field]: value };
      return { ...prev, sizeChart: newSizeChart };
    });
  };

  const removeSizeChartEntry = (index: number) => {
    setFormData((prev) => {
      const updated = prev.sizeChart.filter((_, i) => i !== index);
      return {
        ...prev,
        sizeChart: updated.length > 0 ? updated : [{ ...emptySizeChartEntry }],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const cleanedSizes = formData.sizes.filter((s) => s.trim());
      const cleanedVideos = formData.videos.filter((v) => v.trim());
      const cleanedInstructions = formData.washCareInstructions.filter((instr) => instr.text.trim() !== '');
      const cleanedVariants = formData.variants.map((v) => ({
        ...v,
        sizes: v.sizes.filter((s) => s.size.trim() && s.sku.trim()),
      }));
      const normalizedSlug = slugifyValue(slug);
      setSlug(normalizedSlug);

      const { sizeChart: sizeChartEntries, categories: selectedCategories, ...rest } = formData;

      const data: Record<string, any> = {
        ...rest,
        price: parseFloat(formData.price),
        originalPrice: parseFloat(formData.originalPrice),
        sizes: cleanedSizes,
        videos: cleanedVideos,
        washCareInstructions: cleanedInstructions,
        customerOrderImages: formData.customerOrderImages,
        disableVariants: formData.disableVariants,
        showOutOfStockVariants: formData.showOutOfStockVariants,
        showFeatures: formData.showFeatures,
        variants: cleanedVariants,
        categories: selectedCategories,
      };

      data.slug = normalizedSlug;

      const keywordsArray = seoData.keywords
        .split(',')
        .map((kw) => kw.trim())
        .filter(Boolean)
        .slice(0, 20);

      const seoPayload: Record<string, any> = {};
      if (seoData.title.trim()) {
        seoPayload.title = seoData.title.trim().slice(0, META_TITLE_LIMIT);
      }
      if (seoData.description.trim()) {
        seoPayload.description = seoData.description.trim().slice(0, META_DESCRIPTION_LIMIT);
      }
      if (keywordsArray.length > 0) {
        seoPayload.keywords = keywordsArray;
      }
      if (seoData.canonicalUrl.trim()) {
        seoPayload.canonicalUrl = seoData.canonicalUrl.trim();
      }
      if (seoData.metaRobots.trim()) {
        seoPayload.metaRobots = seoData.metaRobots.trim();
      }
      if (seoData.ogTitle.trim()) {
        seoPayload.ogTitle = seoData.ogTitle.trim();
      }
      if (seoData.ogDescription.trim()) {
        seoPayload.ogDescription = seoData.ogDescription.trim();
      }
      if (seoData.ogImage.trim()) {
        seoPayload.ogImage = seoData.ogImage.trim();
      }

      data.seo = Object.keys(seoPayload).length > 0 ? seoPayload : null;

      if (sizeChartMode === 'reference') {
        data.sizeChart = selectedSizeChartId || null;
      } else if (sizeChartMode === 'custom') {
        const customEntries = sizeChartEntries
          .filter((entry) => entry.size && entry.size.trim())
          .map((entry) => {
            const trimmed: Record<string, string> = {};
            Object.entries(entry).forEach(([key, value]) => {
              if (value && typeof value === 'string' && value.trim() !== '') {
                trimmed[key] = value.trim();
              }
            });
            if (!trimmed.size) {
              trimmed.size = entry.size.trim();
            }
            return trimmed;
          });
        data.sizeChart = customEntries.length > 0 ? customEntries : null;
      } else {
        data.sizeChart = null;
      }

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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Categories <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={loadLookups}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      {lookupsLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                  {availableCategories.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No categories available. Add categories from the Categories section.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableCategories.map((category) => (
                        <label
                          key={category._id}
                          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white hover:border-red-300 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="text-red-600 focus:ring-red-500 rounded"
                            checked={formData.categories.includes(category._id)}
                            onChange={() => toggleCategory(category._id)}
                          />
                          <span className="text-sm text-gray-700">
                            {category.name}
                            {!category.isActive && (
                              <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {errors.categories && (
                    <p className="mt-1 text-sm text-red-500">{errors.categories}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Assign the product to at least one category for storefront navigation and filtering.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description Banner Image (100% width)
                  </label>
                  <div className="space-y-3">
                    {formData.descriptionImage ? (
                      <div className="relative group">
                        <img
                          src={formData.descriptionImage}
                          alt="Description banner"
                          className="w-full h-48 object-cover rounded-lg border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, descriptionImage: '' })}
                          className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaTimes size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="description-image-upload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setUploading(true);
                              try {
                                const response = await uploadAPI.uploadSingle(file, 'products');
                                // Handle different response structures
                                const imageUrl = response.data?.url || response.data?.data?.url || response.url;
                                if (imageUrl) {
                                  setFormData({ ...formData, descriptionImage: imageUrl });
                                } else {
                                  throw new Error('No URL in upload response');
                                }
                              } catch (error: any) {
                                console.error('Description image upload error:', error);
                                alert(error.response?.data?.message || error.message || 'Failed to upload image');
                              } finally {
                                setUploading(false);
                                if (e.target) {
                                  e.target.value = '';
                                }
                              }
                            }
                          }}
                        />
                        <label
                          htmlFor="description-image-upload"
                          className={`cursor-pointer ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          {uploading ? (
                            <>
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-2"></div>
                              <p className="text-sm text-gray-600">Uploading...</p>
                            </>
                          ) : (
                            <>
                              <FaUpload className="mx-auto text-4xl text-gray-400 mb-2" />
                              <p className="text-sm text-gray-600">
                                Click to upload banner image or drag and drop
                              </p>
                              <p className="text-xs text-gray-500 mt-1">Supports JPG, PNG, GIF up to 10MB</p>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Banner image displayed above/below product description (100% width)</p>
                </div>
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">SEO Settings</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Control the product URL slug and metadata used for search engines and social sharing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedSeo((prev) => !prev)}
                  className="self-start md:self-center text-sm text-red-600 hover:text-red-700"
                >
                  {showAdvancedSeo ? 'Hide advanced SEO fields' : 'Show advanced SEO fields'}
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <input
                      type="text"
                      value={slug}
                      maxLength={SLUG_MAX_LENGTH}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        const sanitized = slugifyValue(e.target.value);
                        setSlug(sanitized);
                        setErrors((prev) => ({ ...prev, slug: '' }));
                      }}
                      className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors.slug ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="e.g., redfit-premium-tshirt"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const auto = slugifyValue(formData.name || '');
                        setSlug(auto);
                        setSlugManuallyEdited(false);
                        setErrors((prev) => ({ ...prev, slug: '' }));
                      }}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Reset from name
                    </button>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Lowercase letters, numbers, and hyphens only.</span>
                    <span>
                      {slug.length}/{SLUG_MAX_LENGTH}
                    </span>
                  </div>
                  {errors.slug && <p className="mt-1 text-sm text-red-500">{errors.slug}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Title
                  </label>
                  <input
                    type="text"
                    value={seoData.title}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, META_TITLE_LIMIT);
                      setSeoData((prev) => ({ ...prev, title: value }));
                      setErrors((prev) => ({ ...prev, metaTitle: '' }));
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.metaTitle ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Meta title shown in search results"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Recommended up to {META_TITLE_LIMIT} characters.</span>
                    <span>
                      {seoData.title.length}/{META_TITLE_LIMIT}
                    </span>
                  </div>
                  {errors.metaTitle && (
                    <p className="mt-1 text-sm text-red-500">{errors.metaTitle}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Description
                  </label>
                  <textarea
                    rows={3}
                    value={seoData.description}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, META_DESCRIPTION_LIMIT);
                      setSeoData((prev) => ({ ...prev, description: value }));
                      setErrors((prev) => ({ ...prev, metaDescription: '' }));
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      errors.metaDescription ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Short summary that appears below the title in search results"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Recommended up to {META_DESCRIPTION_LIMIT} characters.</span>
                    <span>
                      {seoData.description.length}/{META_DESCRIPTION_LIMIT}
                    </span>
                  </div>
                  {errors.metaDescription && (
                    <p className="mt-1 text-sm text-red-500">{errors.metaDescription}</p>
                  )}
                </div>

                {showAdvancedSeo && (
                  <div className="space-y-4 border-t border-gray-200 pt-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Canonical URL
                        </label>
                        <input
                          type="url"
                          value={seoData.canonicalUrl}
                          onChange={(e) => {
                            setSeoData((prev) => ({ ...prev, canonicalUrl: e.target.value }));
                            setErrors((prev) => ({ ...prev, canonicalUrl: '' }));
                          }}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
                            errors.canonicalUrl ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="https://redfit.in/products/redfit-premium-tshirt"
                        />
                        {errors.canonicalUrl && (
                          <p className="mt-1 text-sm text-red-500">{errors.canonicalUrl}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Meta Robots
                        </label>
                        <input
                          type="text"
                          value={seoData.metaRobots}
                          onChange={(e) =>
                            setSeoData((prev) => ({ ...prev, metaRobots: e.target.value }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder="index, follow"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Optional. Common values: `index, follow`, `noindex, follow`.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Meta Keywords
                      </label>
                      <input
                        type="text"
                        value={seoData.keywords}
                        onChange={(e) =>
                          setSeoData((prev) => ({ ...prev, keywords: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="performance t-shirt, gym wear, redfit"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Comma-separated keywords (optional).
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Open Graph Title
                        </label>
                        <input
                          type="text"
                          value={seoData.ogTitle}
                          onChange={(e) =>
                            setSeoData((prev) => ({ ...prev, ogTitle: e.target.value }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder="Title used when sharing on social platforms"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Open Graph Image URL
                        </label>
                        <input
                          type="text"
                          value={seoData.ogImage}
                          onChange={(e) =>
                            setSeoData((prev) => ({ ...prev, ogImage: e.target.value }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder="https://..."
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Recommended 1200x630 image for social sharing.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Open Graph Description
                      </label>
                      <textarea
                        rows={3}
                        value={seoData.ogDescription}
                        onChange={(e) =>
                          setSeoData((prev) => ({ ...prev, ogDescription: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Description used for shared links on social media"
                      />
                    </div>
                  </div>
                )}
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

            {/* Bundles moved notice */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Bundles</h2>
              <p className="text-sm text-gray-600">
                Product bundles now live under <span className="font-medium">Products → Bundles</span>.
                Manage combos there to curate two or three product offers with dedicated pricing and swatch
                imagery. Existing bundles assigned to this product will continue to work automatically.
              </p>
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
                  onClick={loadLookups}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  {lookupsLoading ? 'Refreshing…' : 'Refresh lists'}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-2">Link strategy</span>
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center text-sm text-gray-700">
                      <input
                        type="radio"
                        name="sizeChartMode"
                        className="mr-2 text-red-600 focus:ring-red-500"
                        checked={sizeChartMode === 'none'}
                        onChange={() => handleSizeChartModeChange('none')}
                      />
                      No size chart
                    </label>
                    <label
                      className={`inline-flex items-center text-sm ${
                        availableSizeCharts.length === 0 ? 'text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sizeChartMode"
                        className="mr-2 text-red-600 focus:ring-red-500"
                        checked={sizeChartMode === 'reference'}
                        onChange={() => handleSizeChartModeChange('reference')}
                        disabled={availableSizeCharts.length === 0}
                      />
                      Link existing chart
                    </label>
                    <label className="inline-flex items-center text-sm text-gray-700">
                      <input
                        type="radio"
                        name="sizeChartMode"
                        className="mr-2 text-red-600 focus:ring-red-500"
                        checked={sizeChartMode === 'custom'}
                        onChange={() => handleSizeChartModeChange('custom')}
                      />
                      Custom measurements
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Reuse a shared size chart or define measurements specific to this product.
                  </p>
                </div>

                {sizeChartMode === 'reference' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Select size chart <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedSizeChartId}
                        onChange={(e) => handleSelectSizeChartId(e.target.value)}
                        className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      >
                        <option value="">Choose size chart…</option>
                        {availableSizeCharts.map((chart) => (
                          <option key={chart._id} value={chart._id}>
                            {chart.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={loadLookups}
                        className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                      >
                        Refresh
                      </button>
                    </div>
                    {selectedSizeChart ? (
                      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <p className="text-xs text-gray-500 mb-2">
                          Previewing {selectedSizeChart.entries?.length || 0} entries
                        </p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs text-gray-600">
                            <thead className="text-gray-500">
                              <tr>
                                <th className="text-left font-medium pr-3 py-1">Size</th>
                                <th className="text-left font-medium pr-3 py-1">Chest</th>
                                <th className="text-left font-medium pr-3 py-1">Waist</th>
                                <th className="text-left font-medium pr-3 py-1">Length</th>
                                <th className="text-left font-medium pr-3 py-1 hidden md:table-cell">
                                  Shoulder
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selectedSizeChart.entries || []).slice(0, 6).map((entry, idx) => (
                                <tr key={`${selectedSizeChart._id}-${idx}`}>
                                  <td className="pr-3 py-1">{entry.size || '-'}</td>
                                  <td className="pr-3 py-1">{entry.chest || '-'}</td>
                                  <td className="pr-3 py-1">{entry.waist || '-'}</td>
                                  <td className="pr-3 py-1">{entry.length || '-'}</td>
                                  <td className="pr-3 py-1 hidden md:table-cell">
                                    {entry.shoulder || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {selectedSizeChart.entries && selectedSizeChart.entries.length > 6 && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            +{selectedSizeChart.entries.length - 6} more entries
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        {availableSizeCharts.length === 0
                          ? 'No reusable size charts created yet.'
                          : 'Select a size chart to preview its measurements.'}
                      </p>
                    )}
                  </div>
                )}

                {sizeChartMode === 'custom' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-gray-600">
                        Define custom measurements or import entries from an existing chart.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {availableSizeCharts.length > 0 && (
                          <select
                            value={selectedSizeChartId}
                            onChange={(e) => handleSelectSizeChartId(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          >
                            <option value="">Import from existing chart…</option>
                            {availableSizeCharts.map((chart) => (
                              <option key={chart._id} value={chart._id}>
                                {chart.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={addSizeChartEntry}
                          className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                        >
                          <FaPlus className="mr-1" size={12} />
                          Add Entry
                        </button>
                      </div>
                    </div>

                    {formData.sizeChart.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No size chart entries yet. Use “Add Entry” or import from an existing chart.
                      </p>
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
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Chest
                                </label>
                                <input
                                  type="text"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="e.g., 38 inches"
                                  value={entry.chest || ''}
                                  onChange={(e) => updateSizeChart(index, 'chest', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Waist
                                </label>
                                <input
                                  type="text"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="e.g., 32 inches"
                                  value={entry.waist || ''}
                                  onChange={(e) => updateSizeChart(index, 'waist', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Length
                                </label>
                                <input
                                  type="text"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="e.g., 28 inches"
                                  value={entry.length || ''}
                                  onChange={(e) => updateSizeChart(index, 'length', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Shoulder
                                </label>
                                <input
                                  type="text"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                  placeholder="e.g., 16 inches"
                                  value={entry.shoulder || ''}
                                  onChange={(e) => updateSizeChart(index, 'shoulder', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Sleeve
                                </label>
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
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Size Chart Image URL (Optional)
                              </label>
                              <input
                                type="text"
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                                placeholder="https://example.com/size-chart.png"
                                value={entry.imageUrl || ''}
                                onChange={(e) => updateSizeChart(index, 'imageUrl', e.target.value)}
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Optional image for this size row.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {sizeChartMode === 'none' && (
                  <p className="text-sm text-gray-500">
                    This product will not display any size chart.
                  </p>
                )}

                {errors.sizeChart && (
                  <p className="text-sm text-red-500">{errors.sizeChart}</p>
                )}
              </div>
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
