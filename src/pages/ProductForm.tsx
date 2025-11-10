import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { productsAPI, uploadAPI, categoriesAPI, sizeChartsAPI } from '../services/api';
import { FaArrowLeft } from 'react-icons/fa';
import {
  ProductBasicInfo,
  ProductPricing,
  ProductSizesStock,
  ProductCategories,
  ProductSEO,
  ProductSizeChart,
  ProductVideos,
  ProductWashCare,
  ProductCustomerImages,
  ProductDisplayOptions,
  ProductVariants,
} from '../components/product';
import {
  ProductVariant,
  ProductSize,
  CategoryOption,
  SizeChartEntry,
  SizeChartOption,
  SeoFormState,
  VariantType,
  VariantOption,
  VariantCombination,
  SLUG_MAX_LENGTH,
  META_TITLE_LIMIT,
  META_DESCRIPTION_LIMIT,
  emptySizeChartEntry,
} from '../types/productForm';
import { slugifyValue } from '../utils/slugify';

const ProductForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit = !!id;
  // Get prefilled data from navigation state (for duplication)
  const prefilledData = location.state?.prefilledData;

  const [formData, setFormData] = useState({
    name: '',
    sku: '', // Base SKU for the product
    price: '',
    originalPrice: '',
    description: '',
    richDescription: '',
    descriptionImage: '',
    images: [] as string[],
    videos: [] as string[],
    sizes: [] as string[],
    stock: {} as Record<string, number>, // Stock for products without variants
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
  const [newSizeInput, setNewSizeInput] = useState('');

  // Shopify-style variant management state
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [variantOptions, setVariantOptions] = useState<Record<string, string[]>>({}); // typeId -> option values
  const [variantColorCodes, setVariantColorCodes] = useState<Record<string, Record<string, string>>>({}); // typeId -> optionValue -> colorCode
  const [variantCombinations, setVariantCombinations] = useState<VariantCombination[]>([]);
  const [useShopifyVariants, setUseShopifyVariants] = useState(false);
  const [newVariantTypeName, setNewVariantTypeName] = useState('');
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({}); // typeId -> input value

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
    } else if (prefilledData) {
      // Load prefilled data when duplicating
      loadPrefilledData(prefilledData);
    }
  }, [id, prefilledData]);

  const loadPrefilledData = (data: any) => {
    try {
      const productCategories =
        (data.categories || []).map((cat: any) =>
          typeof cat === 'string' ? cat : cat?._id || ''
        ).filter(Boolean) || [];
      
      const inferredSizeChartId =
        data.sizeChartId ||
        (typeof data.sizeChart === 'string'
          ? data.sizeChart
          : data.sizeChart?._id);
      
      const sizeChartEntries: SizeChartEntry[] =
        data.sizeChartEntries ||
        (Array.isArray(data.sizeChart) ? data.sizeChart : []) ||
        [];
      
      const initialMode = inferredSizeChartId
        ? 'reference'
        : sizeChartEntries.length > 0
        ? 'custom'
        : 'none';

      setFormData({
        name: data.name || '',
        sku: data.sku || '',
        price: data.price?.toString() || '',
        originalPrice: data.originalPrice?.toString() || '',
        description: data.description || '',
        richDescription: data.richDescription || '',
        descriptionImage: data.descriptionImage || '',
        images: data.images || [],
        videos: data.videos || [],
        sizes: data.sizes || [],
        categories: productCategories,
        sizeChart:
          initialMode === 'custom'
            ? sizeChartEntries
            : sizeChartEntries.length > 0
            ? sizeChartEntries
            : [],
        washCareInstructions: data.washCareInstructions || [],
        customerOrderImages: data.customerOrderImages || [],
        disableVariants: data.disableVariants || false,
        showOutOfStockVariants: data.showOutOfStockVariants !== false,
        showFeatures: data.showFeatures !== false,
        isActive: data.isActive !== false,
        variants: data.variants || [],
        stock: data.stock || {},
      });

      if (data.slug) {
        setSlug(data.slug);
        setSlugManuallyEdited(true);
      }

      if (data.seo) {
        setSeoData({
          title: data.seo.title || '',
          description: data.seo.description || '',
          keywords: Array.isArray(data.seo.keywords) ? data.seo.keywords.join(', ') : (data.seo.keywords || ''),
          canonicalUrl: data.seo.canonicalUrl || '',
          metaRobots: data.seo.metaRobots || '',
          ogTitle: data.seo.ogTitle || '',
          ogDescription: data.seo.ogDescription || '',
          ogImage: data.seo.ogImage || '',
        });
      }

      if (initialMode === 'reference' && inferredSizeChartId) {
        setSizeChartMode('reference');
        setSelectedSizeChartId(inferredSizeChartId);
      } else if (initialMode === 'custom') {
        setSizeChartMode('custom');
      }
    } catch (error) {
      console.error('Failed to load prefilled data:', error);
    }
  };

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
        sku: product.sku || '',
        price: product.price?.toString() || '',
        originalPrice: product.originalPrice?.toString() || '',
        description: product.description || '',
        richDescription: product.richDescription || '',
        descriptionImage: product.descriptionImage || '',
        images: product.images || [],
        videos: product.videos || [],
        sizes: product.sizes || [],
        stock: product.stock || {},
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

  const handleDescriptionImageUpload = async (files: FileList) => {
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) return;

    setUploading(true);
    try {
      const response = await uploadAPI.uploadSingle(file, 'products');
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
    }
  };

  const handleCustomerOrderImagesUpload = async (files: FileList) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
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
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.response?.data?.message || 'Failed to upload images');
    } finally {
      setUploading(false);
    }
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
    
    // Generate a temporary SKU for the new size
    const baseSku = getBaseSku();
    const colorCode = (variant.colorName || 'DEF').toUpperCase().slice(0, 3).replace(/[^A-Z0-9]/g, '') || 'DEF';
    const tempSku = `${baseSku}-${colorCode}-NEW`;
    
    newVariants[variantIndex] = {
      ...variant,
      sizes: [
        ...variant.sizes,
        {
          size: '',
          stock: 0,
          sku: tempSku,
          price: variant.price,
          originalPrice: variant.originalPrice,
        },
      ],
    };
    setFormData({ ...formData, variants: newVariants });
  };

  // Get base SKU from form or generate from slug
  const getBaseSku = (): string => {
    if (formData.sku && formData.sku.trim()) {
      return formData.sku.trim().toUpperCase();
    }
    // Fallback to slug-based SKU
    return slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD';
  };

  // Generate SKU for a variant size
  const generateSkuForSize = (baseSku: string, colorName: string, size: string): string => {
    const colorCode = (colorName || 'DEF').toUpperCase().slice(0, 4).replace(/[^A-Z0-9]/g, '') || 'DEF';
    const sizeCode = (size || 'UNK').toUpperCase().slice(0, 4).replace(/[^A-Z0-9]/g, '') || 'UNK';
    const base = (baseSku || getBaseSku()).toUpperCase();
    return `${base}-${colorCode}-${sizeCode}`.slice(0, 48);
  };

  // Regenerate all SKUs for variant sizes
  const regenerateAllSkus = () => {
    if (!confirm('This will regenerate all SKUs for variant sizes based on the base SKU. Continue?')) {
      return;
    }

    const baseSku = getBaseSku();
    const usedSkus = new Set<string>();
    const newVariants = formData.variants.map((variant) => {
      const newSizes = variant.sizes.map((size) => {
        if (!size.size || !size.size.trim()) {
          return size; // Skip sizes without size value
        }
        
        let newSku = generateSkuForSize(baseSku, variant.colorName, size.size);
        let counter = 1;
        
        // Ensure uniqueness within this regeneration
        while (usedSkus.has(newSku)) {
          newSku = `${generateSkuForSize(baseSku, variant.colorName, size.size)}-${counter++}`.slice(0, 48);
        }
        
        usedSkus.add(newSku);
        return {
          ...size,
          sku: newSku,
        };
      });
      
      return {
        ...variant,
        sizes: newSizes,
      };
    });
    
    setFormData({ ...formData, variants: newVariants });
    alert('SKUs regenerated successfully!');
  };

  // Regenerate SKUs for a specific variant
  const regenerateVariantSkus = (variantIndex: number) => {
    const variant = formData.variants[variantIndex];
    const baseSku = getBaseSku();
    const usedSkus = new Set<string>();
    
    const newSizes = variant.sizes.map((size) => {
      if (!size.size || !size.size.trim()) {
        return size; // Skip sizes without size value
      }
      
      let newSku = generateSkuForSize(baseSku, variant.colorName, size.size);
      let counter = 1;
      
      while (usedSkus.has(newSku)) {
        newSku = `${generateSkuForSize(baseSku, variant.colorName, size.size)}-${counter++}`.slice(0, 48);
      }
      
      usedSkus.add(newSku);
      return {
        ...size,
        sku: newSku,
      };
    });
    
    const newVariants = [...formData.variants];
    newVariants[variantIndex] = {
      ...variant,
      sizes: newSizes,
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

  // Wrapper for ProductVariants component (accepts string field)
  const updateVariantSizeWrapper = (variantIndex: number, sizeIndex: number, field: string, value: any) => {
    updateVariantSize(variantIndex, sizeIndex, field as keyof ProductSize, value);
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

  // Shopify-style variant management functions
  const addVariantType = (typeName: string, isColor: boolean = false) => {
    const newType: VariantType = {
      id: `type-${Date.now()}-${Math.random()}`,
      name: typeName.trim(),
      isColor,
    };
    const updatedTypes = [...variantTypes, newType];
    const updatedOptions = { ...variantOptions, [newType.id]: [] };
    const updatedColorCodes = { ...variantColorCodes, [newType.id]: {} };
    setVariantTypes(updatedTypes);
    setVariantOptions(updatedOptions);
    setVariantColorCodes(updatedColorCodes);
    setNewVariantTypeName('');
    // Generate combinations after state updates
    setTimeout(() => {
      generateVariantCombinations();
    }, 0);
  };

  const removeVariantType = (typeId: string) => {
    const newTypes = variantTypes.filter(t => t.id !== typeId);
    const newOptions = { ...variantOptions };
    const newColorCodes = { ...variantColorCodes };
    delete newOptions[typeId];
    delete newColorCodes[typeId];
    setVariantTypes(newTypes);
    setVariantOptions(newOptions);
    setVariantColorCodes(newColorCodes);
    // Generate combinations after state updates
    setTimeout(() => {
      generateVariantCombinations();
    }, 0);
  };

  const addVariantOption = (typeId: string, value: string, colorCode?: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    const currentOptions = variantOptions[typeId] || [];
    if (currentOptions.includes(trimmedValue)) return; // Avoid duplicates

    setVariantOptions({
      ...variantOptions,
      [typeId]: [...currentOptions, trimmedValue],
    });

    if (colorCode) {
      const typeColorCodes = variantColorCodes[typeId] || {};
      setVariantColorCodes({
        ...variantColorCodes,
        [typeId]: {
          ...typeColorCodes,
          [trimmedValue]: colorCode,
        },
      });
    }

    // Clear input
    const updatedInputs = { ...newOptionInputs, [typeId]: '' };
    setNewOptionInputs(updatedInputs);

    // Generate combinations after state updates
    setTimeout(() => {
      generateVariantCombinations();
    }, 0);
  };

  const removeVariantOption = (typeId: string, value: string) => {
    const currentOptions = variantOptions[typeId] || [];
    setVariantOptions({
      ...variantOptions,
      [typeId]: currentOptions.filter(opt => opt !== value),
    });

    const typeColorCodes = variantColorCodes[typeId] || {};
    if (typeColorCodes[value]) {
      const newColorCodes = { ...typeColorCodes };
      delete newColorCodes[value];
      setVariantColorCodes({
        ...variantColorCodes,
        [typeId]: newColorCodes,
      });
    }

    // Generate combinations after state updates
    setTimeout(() => {
      generateVariantCombinations();
    }, 0);
  };

  const generateVariantCombinations = () => {
    if (variantTypes.length === 0) {
      setVariantCombinations([]);
      return;
    }

    // Get all option arrays
    const optionArrays = variantTypes.map(type => {
      const options = variantOptions[type.id] || [];
      return options.map(value => ({
        typeId: type.id,
        typeName: type.name,
        value,
        colorCode: variantColorCodes[type.id]?.[value],
      }));
    }).filter(arr => arr.length > 0);

    if (optionArrays.length === 0) {
      setVariantCombinations([]);
      return;
    }

    // Generate cartesian product
    const combinations: VariantCombination[] = [];
    const existingCombinationsMap = new Map<string, VariantCombination>();
    
    // Create a map of existing combinations by their option signature
    variantCombinations.forEach(comb => {
      const signature = comb.options.map(o => `${o.typeId}:${o.value}`).join('|');
      existingCombinationsMap.set(signature, comb);
    });

    const generate = (current: VariantOption[], index: number) => {
      if (index === optionArrays.length) {
        const signature = current.map(o => `${o.typeId}:${o.value}`).join('|');
        const existing = existingCombinationsMap.get(signature);
        
        if (existing) {
          // Preserve existing combination data
          combinations.push(existing);
        } else {
          // Create new combination
          const baseSku = getBaseSku();
          const skuParts = current.map(opt => {
            const value = opt.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
            return value || 'DEF';
          });
          const sku = `${baseSku}-${skuParts.join('-')}`.slice(0, 48);

          combinations.push({
            id: `comb-${Date.now()}-${Math.random()}`,
            options: [...current],
            sku,
            price: parseFloat(formData.price) || 0,
            originalPrice: parseFloat(formData.originalPrice) || 0,
            stock: 0,
            images: [],
          });
        }
        return;
      }

      optionArrays[index].forEach(option => {
        generate([...current, option], index + 1);
      });
    };

    generate([], 0);
    setVariantCombinations(combinations);
  };

  const updateVariantCombination = (combinationId: string, field: keyof VariantCombination, value: any) => {
    setVariantCombinations(prev =>
      prev.map(comb =>
        comb.id === combinationId ? { ...comb, [field]: value } : comb
      )
    );
  };

  const regenerateAllShopifySkus = () => {
    const baseSku = getBaseSku();
    setVariantCombinations((prev) =>
      prev.map((comb) => {
        const skuParts = comb.options.map((opt) =>
          opt.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
        );
        const newSku = `${baseSku}-${skuParts.join('-')}`.slice(0, 48);
        return { ...comb, sku: newSku };
      })
    );
  };


  // Convert Shopify-style combinations to existing format
  const convertCombinationsToVariants = (combinations: VariantCombination[]): ProductVariant[] => {
    // Group by color (if color type exists)
    const colorType = variantTypes.find(t => t.isColor || t.name.toLowerCase() === 'color');
    const sizeType = variantTypes.find(t => t.name.toLowerCase() === 'size');

    if (!colorType && !sizeType) {
      // No color or size, create one variant per combination
      return combinations.map(comb => ({
        colorName: comb.options.map(o => o.value).join(' / ') || 'Default',
        colorCode: '#000000',
        price: comb.price,
        originalPrice: comb.originalPrice,
        images: comb.images || [],
        sizes: [
          {
            size: 'One Size',
            stock: comb.stock,
            sku: comb.sku,
            price: comb.price,
            originalPrice: comb.originalPrice,
          },
        ],
      }));
    }

    // Group by color
    const variantsMap = new Map<string, ProductVariant>();

    combinations.forEach(comb => {
      const colorOption = comb.options.find(o => o.typeId === colorType?.id);
      const sizeOptions = comb.options.filter(o => o.typeId === sizeType?.id);

      const colorName = colorOption?.value || 'Default';
      const colorCode = colorOption?.colorCode || '#000000';
      const variantKey = colorName;

      if (!variantsMap.has(variantKey)) {
        variantsMap.set(variantKey, {
          colorName,
          colorCode,
          price: comb.price,
          originalPrice: comb.originalPrice,
          images: comb.images || [],
          sizes: [],
        });
      }

      const variant = variantsMap.get(variantKey)!;
      if (sizeOptions.length > 0) {
        sizeOptions.forEach(sizeOpt => {
          variant.sizes.push({
            size: sizeOpt.value,
            stock: comb.stock,
            sku: comb.sku,
            price: comb.price,
            originalPrice: comb.originalPrice,
          });
        });
      } else {
        variant.sizes.push({
          size: 'One Size',
          stock: comb.stock,
          sku: comb.sku,
          price: comb.price,
          originalPrice: comb.originalPrice,
        });
      }
    });

    return Array.from(variantsMap.values());
  };

  // Convert existing variants to Shopify-style format
  const convertVariantsToShopifyFormat = (variants: ProductVariant[]) => {
    if (variants.length === 0) return;

    // Detect color and size from existing variants
    const hasColors = variants.some(v => v.colorName);
    const hasSizes = variants.some(v => v.sizes.length > 0);

    const newTypes: VariantType[] = [];
    const newOptions: Record<string, string[]> = {};
    const newColorCodes: Record<string, Record<string, string>> = {};

    if (hasColors) {
      const colorType: VariantType = {
        id: 'type-color',
        name: 'Color',
        isColor: true,
      };
      newTypes.push(colorType);
      const colors = [...new Set(variants.map(v => v.colorName))];
      newOptions[colorType.id] = colors;
      newColorCodes[colorType.id] = {};
      variants.forEach(v => {
        if (v.colorCode) {
          newColorCodes[colorType.id][v.colorName] = v.colorCode;
        }
      });
    }

    if (hasSizes) {
      const sizeType: VariantType = {
        id: 'type-size',
        name: 'Size',
        isColor: false,
      };
      newTypes.push(sizeType);
      const sizes = new Set<string>();
      variants.forEach(v => {
        v.sizes.forEach(s => sizes.add(s.size));
      });
      newOptions[sizeType.id] = Array.from(sizes);
    }

    setVariantTypes(newTypes);
    setVariantOptions(newOptions);
    setVariantColorCodes(newColorCodes);

    // Generate combinations from existing variants
    const combinations: VariantCombination[] = [];
    variants.forEach(variant => {
      variant.sizes.forEach(size => {
        const options: VariantOption[] = [];
        if (hasColors) {
          options.push({
            typeId: 'type-color',
            typeName: 'Color',
            value: variant.colorName,
            colorCode: variant.colorCode,
          });
        }
        if (hasSizes) {
          options.push({
            typeId: 'type-size',
            typeName: 'Size',
            value: size.size,
          });
        }
        combinations.push({
          id: `comb-${Date.now()}-${Math.random()}`,
          options,
          sku: size.sku,
          price: size.price || variant.price,
          originalPrice: size.originalPrice || variant.originalPrice,
          stock: size.stock,
          images: variant.images,
        });
      });
    });

    setVariantCombinations(combinations);
    setUseShopifyVariants(true);
  };

  // Effect to regenerate combinations when variant types or options change
  // Note: This effect is intentionally minimal to avoid infinite loops
  // Combinations are also generated manually when options are added/removed

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


  const addSize = () => {
    const newSize = newSizeInput.trim().toUpperCase();
    if (newSize && !formData.sizes.includes(newSize)) {
      setFormData((prev) => ({
        ...prev,
        sizes: [...prev.sizes, newSize],
        stock: {
          ...prev.stock,
          [newSize]: prev.stock[newSize] || 0,
        },
      }));
      setNewSizeInput('');
      setErrors({ ...errors, sizes: '' });
    } else if (newSize && formData.sizes.includes(newSize)) {
      setErrors({ ...errors, sizes: 'This size already exists' });
    } else if (!newSize) {
      setErrors({ ...errors, sizes: 'Please enter a size' });
    }
  };

  const removeSize = (size: string) => {
    setFormData((prev) => {
      const newSizes = prev.sizes.filter((s) => s !== size);
      const newStock = { ...prev.stock };
      delete newStock[size];
      return {
        ...prev,
        sizes: newSizes,
        stock: newStock,
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
      
      // Use Shopify-style variants if enabled, otherwise use legacy format
      let cleanedVariants: ProductVariant[] = [];
      if (useShopifyVariants && variantCombinations.length > 0) {
        // Convert Shopify combinations to legacy format
        const convertedVariants = convertCombinationsToVariants(variantCombinations);
        cleanedVariants = convertedVariants.map((v) => {
          const cleanedSizes = v.sizes
            .filter((s) => s.size && s.size.trim()) // Keep only sizes with size value
            .map((s) => {
              // Ensure SKU is present and valid
              if (!s.sku || !s.sku.trim()) {
                // Generate SKU if missing
                const baseSku = getBaseSku();
                s.sku = generateSkuForSize(baseSku, v.colorName, s.size);
              }
              return {
                ...s,
                sku: s.sku.trim().toUpperCase(),
                stock: Math.max(0, s.stock || 0),
                price: Math.max(0, s.price || 0),
                originalPrice: Math.max(0, s.originalPrice || 0),
              };
            });
          return {
            ...v,
            sizes: cleanedSizes,
          };
        });
      } else {
        // Legacy variant format
        cleanedVariants = formData.variants.map((v) => {
          const cleanedSizes = v.sizes
            .filter((s) => s.size && s.size.trim()) // Keep only sizes with size value
            .map((s) => {
              // Ensure SKU is present and valid
              if (!s.sku || !s.sku.trim() || s.sku.includes('NEW')) {
                // Generate SKU if missing or temporary
                const baseSku = getBaseSku();
                s.sku = generateSkuForSize(baseSku, v.colorName, s.size);
              }
              return {
                ...s,
                sku: s.sku.trim().toUpperCase(),
                stock: Math.max(0, s.stock || 0),
                price: Math.max(0, s.price || 0),
                originalPrice: Math.max(0, s.originalPrice || 0),
              };
            });
          return {
            ...v,
            sizes: cleanedSizes,
          };
        });
      }
      const normalizedSlug = slugifyValue(slug);
      setSlug(normalizedSlug);

      const { sizeChart: sizeChartEntries, categories: selectedCategories, ...rest } = formData;

      // Prepare stock data for products without variants
      let stockData: Record<string, number> | undefined = undefined;
      if (formData.variants.length === 0 && formData.stock && Object.keys(formData.stock).length > 0) {
        // Only include sizes that exist in the sizes array
        stockData = {};
        formData.sizes.forEach(size => {
          if (formData.stock[size] !== undefined && formData.stock[size] > 0) {
            stockData![size] = Math.max(0, Math.floor(formData.stock[size]));
          }
        });
        // If no stock data, set to undefined
        if (Object.keys(stockData).length === 0) {
          stockData = undefined;
        }
      }

      const data: Record<string, any> = {
        ...rest,
        price: parseFloat(formData.price),
        originalPrice: parseFloat(formData.originalPrice),
        sizes: cleanedSizes,
        stock: stockData,
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
      
      // Include base SKU if provided (backend will generate if empty)
      if (formData.sku && formData.sku.trim()) {
        data.sku = formData.sku.trim().toUpperCase();
      }

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
            <ProductBasicInfo
              name={formData.name}
              description={formData.description}
              richDescription={formData.richDescription}
              descriptionImage={formData.descriptionImage}
              images={formData.images}
              onNameChange={(name) => {
                setFormData({ ...formData, name });
                setErrors({ ...errors, name: '' });
              }}
              onDescriptionChange={(description) => setFormData({ ...formData, description })}
              onRichDescriptionChange={(richDescription) => setFormData({ ...formData, richDescription })}
              onDescriptionImageChange={(descriptionImage) => setFormData({ ...formData, descriptionImage })}
              onImagesChange={(images) => setFormData({ ...formData, images })}
              onImageUpload={handleMultipleImageUpload}
              onDescriptionImageUpload={handleDescriptionImageUpload}
              uploading={uploading}
              errors={errors}
            />

            {/* Categories - moved to Basic Info section but can be separate */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <ProductCategories
                categories={formData.categories}
                availableCategories={availableCategories}
                onCategoriesChange={(categories) => setFormData({ ...formData, categories })}
                onRefresh={loadLookups}
                loading={lookupsLoading}
                error={errors.categories}
              />
            </div>

            {/* SEO Settings */}
            <ProductSEO
              sku={formData.sku}
              slug={slug}
              seoData={seoData}
              showAdvancedSeo={showAdvancedSeo}
              onSkuChange={(sku) => {
                const skuValue = sku.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                setFormData({ ...formData, sku: skuValue });
              }}
              onSlugChange={(slug) => {
                setSlugManuallyEdited(true);
                const sanitized = slugifyValue(slug);
                setSlug(sanitized);
                setErrors((prev) => ({ ...prev, slug: '' }));
              }}
              onSlugReset={() => {
                const auto = slugifyValue(formData.name || '');
                setSlug(auto);
                setSlugManuallyEdited(false);
                setErrors((prev) => ({ ...prev, slug: '' }));
              }}
              onSeoDataChange={setSeoData}
              onShowAdvancedSeoToggle={() => setShowAdvancedSeo((prev) => !prev)}
              errors={errors}
            />


            {/* Videos */}
            <ProductVideos
              videos={formData.videos}
              newVideos={newVideos}
              uploading={uploadingVideo}
              onVideosChange={(videos) => setFormData({ ...formData, videos })}
              onNewVideosChange={setNewVideos}
              onVideoUpload={handleVideoUpload}
              onAddVideoUrl={addVideoUrl}
              onRemoveVideo={removeVideo}
            />

            {/* Variants */}
            <ProductVariants
              variants={formData.variants}
              onAddVariant={addVariant}
              onUpdateVariant={updateVariant}
              onRemoveVariant={removeVariant}
              onAddVariantSize={addVariantSize}
              onUpdateVariantSize={updateVariantSizeWrapper}
              onRemoveVariantSize={removeVariantSize}
              onRegenerateAllSkusLegacy={regenerateAllSkus}
              onRegenerateVariantSkus={regenerateVariantSkus}
              onVariantImageUpload={handleVariantImageUpload}
              onRemoveVariantImage={removeVariantImage}
              useShopifyVariants={useShopifyVariants}
              onUseShopifyVariantsChange={(checked) => {
                setUseShopifyVariants(checked);
                if (!checked) {
                  setVariantTypes([]);
                  setVariantOptions({});
                  setVariantCombinations([]);
                }
              }}
              variantTypes={variantTypes}
              variantOptions={variantOptions}
              variantColorCodes={variantColorCodes}
              variantCombinations={variantCombinations}
              newVariantTypeName={newVariantTypeName}
              newOptionInputs={newOptionInputs}
              onAddVariantType={addVariantType}
              onRemoveVariantType={removeVariantType}
              onAddVariantOption={addVariantOption}
              onRemoveVariantOption={removeVariantOption}
              onUpdateVariantCombination={updateVariantCombination}
              onRegenerateAllSkus={regenerateAllShopifySkus}
              onNewVariantTypeNameChange={setNewVariantTypeName}
              onNewOptionInputsChange={setNewOptionInputs}
              onVariantColorCodesChange={setVariantColorCodes}
              onConvertVariantsToShopifyFormat={convertVariantsToShopifyFormat}
              getBaseSku={getBaseSku}
              generateSkuForSize={generateSkuForSize}
              basePrice={parseFloat(formData.price) || 0}
              uploading={uploading}
            />

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
            <ProductPricing
              price={formData.price}
              originalPrice={formData.originalPrice}
              onPriceChange={(price) => {
                setFormData({ ...formData, price });
                setErrors({ ...errors, price: '' });
              }}
              onOriginalPriceChange={(price) => {
                setFormData({ ...formData, originalPrice: price });
                setErrors({ ...errors, originalPrice: '' });
              }}
              errors={errors}
            />

            {/* Sizes & Stock (if no variants) */}
            {formData.variants.length === 0 && (
              <ProductSizesStock
                sizes={formData.sizes}
                stock={formData.stock}
                newSizeInput={newSizeInput}
                onStockChange={(stock) => setFormData({ ...formData, stock })}
                onNewSizeInputChange={setNewSizeInput}
                onAddSize={addSize}
                onRemoveSize={removeSize}
                errors={errors}
              />
            )}

            {/* Size Chart */}
            <ProductSizeChart
              mode={sizeChartMode}
              selectedSizeChartId={selectedSizeChartId}
              sizeChart={formData.sizeChart}
              availableSizeCharts={availableSizeCharts}
              selectedSizeChart={selectedSizeChart}
              onModeChange={handleSizeChartModeChange}
              onSelectedSizeChartIdChange={handleSelectSizeChartId}
              onSizeChartChange={(entries) => setFormData({ ...formData, sizeChart: entries })}
              onRefresh={loadLookups}
              loading={lookupsLoading}
              error={errors.sizeChart}
            />

            {/* Wash Care Instructions */}
            <ProductWashCare
              instructions={formData.washCareInstructions}
              onInstructionsChange={(instructions) => setFormData({ ...formData, washCareInstructions: instructions })}
            />

            {/* Customer Order Images Gallery */}
            <ProductCustomerImages
              images={formData.customerOrderImages}
              onImagesChange={(images) => setFormData({ ...formData, customerOrderImages: images })}
              onUpload={handleCustomerOrderImagesUpload}
              uploading={uploading}
            />

            {/* Display Options (includes Status) */}
            <ProductDisplayOptions
              disableVariants={formData.disableVariants}
              showOutOfStockVariants={formData.showOutOfStockVariants}
              showFeatures={formData.showFeatures}
              isActive={formData.isActive}
              onDisableVariantsChange={(value) => setFormData({ ...formData, disableVariants: value })}
              onShowOutOfStockVariantsChange={(value) => setFormData({ ...formData, showOutOfStockVariants: value })}
              onShowFeaturesChange={(value) => setFormData({ ...formData, showFeatures: value })}
              onIsActiveChange={(value) => setFormData({ ...formData, isActive: value })}
            />

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
