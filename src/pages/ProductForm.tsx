import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { productsAPI, uploadAPI, categoriesAPI, sizeChartsAPI } from '../services/api';
import api from '../services/api';
import { FaArrowLeft } from 'react-icons/fa';
import {
  ProductBasicInfo,
  ProductPricing,
  ProductCategories,
  ProductSEO,
  ProductSizeChart,
  ProductVideos,
  ProductWashCare,
  ProductCustomerImages,
  ProductDisplayOptions,
} from '../components/product';
import ProductAttributeVariations from '../components/product/ProductAttributeVariations';
import ProductAttributes from '../components/product/ProductAttributes';
import {
  CategoryOption,
  SizeChartEntry,
  SizeChartOption,
  SeoFormState,
  ProductVariation,
  SLUG_MAX_LENGTH,
  META_TITLE_LIMIT,
  META_DESCRIPTION_LIMIT,
  emptySizeChartEntry,
} from '../types/productForm';
import { slugifyValue } from '../utils/slugify';

const ProductForm: React.FC = () => {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Clean and validate the ID
  const id = rawId ? String(rawId).trim() : undefined;
  const isEdit = !!id;
  
  // Validate ID format if in edit mode
  if (isEdit && id && !/^[0-9a-fA-F]{24}$/.test(id)) {
    console.error('Invalid product ID format from URL:', id);
  }
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
    stock: undefined as number | undefined, // Stock for products without variants (simple number)
    categories: [] as string[],
    sizeChart: [] as SizeChartEntry[],
    washCareInstructions: [] as Array<{ text: string; iconUrl?: string; iconName?: string }>,
    customerOrderImages: [] as string[],
    disableVariants: false,
    showOutOfStockVariants: true,
    showFeatures: true,
    isActive: true,
    // Product type: 'single' for products without variations, 'variation' for products with attribute-based variations
    productType: 'single' as 'single' | 'variation',
    // Attribute-based variations
    attributeIds: [] as string[],
    selectedAttributeValues: {} as Record<string, string[]>, // { attributeId: [valueId1, valueId2] }
    variations: [] as ProductVariation[],
  });
  
  // Root cause fix: Use ref to always get latest formData (avoids stale closure issues)
  const formDataRef = useRef(formData);
  useEffect(() => {
    console.log('🔄 formDataRef updated via useEffect:', {
      categories: formData.categories,
      categoriesCount: formData.categories?.length || 0,
      categoriesType: typeof formData.categories,
      isArray: Array.isArray(formData.categories),
    });
    formDataRef.current = formData;
  }, [formData]);
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
  const [websiteUrl, setWebsiteUrl] = useState<string>('');

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

  /**
   * CRITICAL FIX: Normalize category ID from any format (string, ObjectId, buffer) to string
   * This ensures NO buffer objects are ever used in the frontend
   */
  const normalizeCategoryId = (id: any): string | null => {
    if (!id) return null;
    
    // Already a string ID
    if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
      return id;
    }
    
    // Object with _id property (populated category)
    if (id && typeof id === 'object' && id._id) {
      return normalizeCategoryId(id._id);
    }
    
    // Buffer object (the problematic case)
    if (id && typeof id === 'object' && id.buffer) {
      try {
        let bufferArray: number[];
        if (Array.isArray(id.buffer)) {
          bufferArray = id.buffer;
        } else if (typeof id.buffer === 'object') {
          // Handle object with numeric keys like { "0": 105, "1": 36, ... }
          const keys = Object.keys(id.buffer).map(k => Number(k)).sort((a, b) => a - b);
          bufferArray = keys.map(k => Number(id.buffer[k]));
        } else {
          return null;
        }
        if (bufferArray.length === 12) {
          // Convert buffer to hex string (MongoDB ObjectId format)
          const hex = bufferArray.map(b => b.toString(16).padStart(2, '0')).join('');
          if (hex.length === 24 && /^[0-9a-fA-F]{24}$/.test(hex)) {
            return hex;
          }
        }
      } catch (error) {
        console.error('Failed to convert buffer to ObjectId:', error);
        return null;
      }
    }
    
    // Try to convert to string as last resort
    const str = String(id).trim();
    if (str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
      return str;
    }
    
    return null;
  };

  const loadLookups = async () => {
    setLookupsLoading(true);
    try {
      const [catResponse, chartResponse] = await Promise.all([
        categoriesAPI.list(),
        sizeChartsAPI.list(),
      ]);
      const rawCategoryList: any[] = extractListData(catResponse);
      const rawChartList: any[] = extractListData(chartResponse);
      
      // CRITICAL FIX: Normalize all category IDs to strings (handle buffers)
      const categoryList: CategoryOption[] = rawCategoryList.map((cat: any) => {
        const normalizedId = normalizeCategoryId(cat._id || cat.id);
        if (!normalizedId) {
          console.warn('⚠️ Invalid category ID, skipping:', cat);
          return null;
        }
        return {
          ...cat,
          _id: normalizedId, // Always use normalized string ID
        };
      }).filter((cat): cat is CategoryOption => cat !== null);
      
      // CRITICAL FIX: Normalize all size chart IDs to strings (handle buffers)
      const normalizedChartList: SizeChartOption[] = rawChartList.map((chart: any) => {
        const normalizedId = normalizeCategoryId(chart._id || chart.id);
        if (!normalizedId) {
          console.warn('⚠️ Invalid size chart ID, skipping:', chart);
          return null;
        }
        return {
          ...chart,
          _id: normalizedId, // Always use normalized string ID
        };
      }).filter((chart): chart is SizeChartOption => chart !== null);
      
      // Remove duplicate size charts by _id (keep first occurrence)
      const uniqueCharts = normalizedChartList.filter((chart, index, self) => 
        index === self.findIndex((c) => c._id === chart._id)
      );
      
      console.log('📊 Loaded size charts:', { count: uniqueCharts.length, charts: uniqueCharts.map(c => ({ id: c._id, name: c.name })) });
      
      setAvailableCategories(categoryList);
      setAvailableSizeCharts(uniqueCharts);
    } catch (err) {
      console.error('Failed to load lookups', err);
    } finally {
      setLookupsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    fetchWebsiteUrl();
  }, []);

  const fetchWebsiteUrl = async () => {
    try {
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        const websiteUrlValue = response.data.data.general?.websiteUrl || '';
        setWebsiteUrl(websiteUrlValue);
      }
    } catch (error) {
      console.error('Failed to fetch website URL:', error);
      // Silently fail - website URL is optional
    }
  };

  useEffect(() => {
    if (isEdit && id) {
      fetchProduct();
    } else if (prefilledData) {
      // Load prefilled data when duplicating
      loadPrefilledData(prefilledData);
    }
  }, [id, prefilledData, isEdit]);

  const loadPrefilledData = (data: any) => {
    try {
      // Extract category IDs from various formats - ALWAYS return string IDs
      const productCategories =
        (data.categories || []).map((cat: any) => {
          // Already a string ID
          if (typeof cat === 'string' && cat.length === 24) {
            return cat.trim();
          }
          // Object with _id property
          if (cat?._id) {
            // _id might be a string or ObjectId
            const idStr = typeof cat._id === 'string' ? cat._id : String(cat._id);
            if (idStr && idStr !== '[object Object]' && idStr.length === 24) {
              return idStr.trim();
            }
          }
          // Try to convert to string (for ObjectId instances)
          const str = String(cat);
          if (str && str !== '[object Object]' && str.length === 24) {
            return str.trim();
          }
          return null;
        }).filter((id: any): id is string => id !== null && typeof id === 'string' && id.length === 24) || [];
      
      // CRITICAL FIX: Normalize sizeChart ID to string (handle buffer objects)
      let inferredSizeChartId: string | null = null;
      if (data.sizeChartId) {
        inferredSizeChartId = normalizeCategoryId(data.sizeChartId);
      } else if (data.sizeChart) {
        inferredSizeChartId = normalizeCategoryId(
          typeof data.sizeChart === 'string'
            ? data.sizeChart
            : data.sizeChart?._id
        );
      }
      
      const sizeChartEntries: SizeChartEntry[] =
        data.sizeChartEntries ||
        (Array.isArray(data.sizeChart) ? data.sizeChart : []) ||
        [];
      
      const initialMode = inferredSizeChartId
        ? 'reference'
        : sizeChartEntries.length > 0
        ? 'custom'
        : 'none';

      // Stock is always a number (for products without variants)
      const stockValue: number | undefined = 
        typeof data.stock === 'number' ? data.stock : undefined;

      // Extract SKU - check multiple possible locations
      const dataSku = data.sku || data.baseSku || '';
      
      setFormData({
        name: data.name || '',
        sku: dataSku,
        price: data.price?.toString() || '',
        originalPrice: data.originalPrice?.toString() || '',
        description: data.description || '',
        richDescription: data.richDescription || '',
        descriptionImage: data.descriptionImage || '',
        images: data.images || [],
        videos: data.videos || [],
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
        productType: data.productType || (data.variations && data.variations.length > 0) || (data.attributeIds && data.attributeIds.length > 0) ? 'variation' : 'single',
        attributeIds: data.attributeIds || [],
        selectedAttributeValues: {}, // Will be populated from variations if needed
        variations: (data.variations || []).map((v: any, idx: number) => {
          // SIMPLIFIED: Normalize slugs (not IDs) - WordPress style
          const normalizedAttrs: Record<string, string> = {};
          if (v.attributes && typeof v.attributes === 'object') {
            for (const [attrSlug, valueSlug] of Object.entries(v.attributes)) {
              const normalizedSlug = String(valueSlug).toLowerCase().trim();
              if (normalizedSlug) {
                normalizedAttrs[attrSlug.toLowerCase().trim()] = normalizedSlug;
              }
            }
          }
          return {
            ...v,
            id: v.id || `var-${Date.now()}-${idx}`, // Add temporary ID for frontend
            attributes: normalizedAttrs, // Use normalized slugs
          };
        }),
        stock: stockValue,
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

  const sanitizeProductData = (product: any): any => {
    if (!product || typeof product !== 'object') return product;
    
    const sanitized = { ...product };
    
    // Ensure _id is a string
    if (sanitized._id) {
      sanitized._id = String(sanitized._id);
    }
    
    // Sanitize categories - convert all to string IDs
    if (Array.isArray(sanitized.categories)) {
      sanitized.categories = sanitized.categories.map((cat: any) => {
        // Already a string ID
        if (typeof cat === 'string') {
          return cat.trim();
        }
        // ObjectId instance or object with _id
        if (cat && typeof cat === 'object') {
          // Extract _id if available
          if (cat._id) {
            // _id might be string, ObjectId, or object with buffer
            if (typeof cat._id === 'string') {
              return cat._id.trim();
            }
            // Try to convert _id to string
            const idStr = String(cat._id);
            if (idStr && idStr !== '[object Object]' && idStr.length === 24) {
              return idStr;
            }
          }
          // If no _id, try to convert the whole object
          const idStr = String(cat);
          if (idStr && idStr !== '[object Object]' && idStr.length === 24) {
            return idStr;
          }
        }
        return null;
      }).filter((cat: any): cat is string => cat !== null && typeof cat === 'string' && cat.length === 24);
    }
    
    // Sanitize sizeChart if it's an object
    if (sanitized.sizeChart && typeof sanitized.sizeChart === 'object') {
      if (sanitized.sizeChart.buffer || sanitized.sizeChart.constructor?.name === 'Buffer') {
        sanitized.sizeChart = null;
      } else if (sanitized.sizeChart._id) {
        sanitized.sizeChart = String(sanitized.sizeChart._id);
      }
    }
    
    // Sanitize images - ensure they're strings
    if (Array.isArray(sanitized.images)) {
      sanitized.images = sanitized.images
        .map((img: any) => {
          if (typeof img === 'string') return img;
          if (img && typeof img === 'object' && (img.buffer || img.constructor?.name === 'Buffer')) {
            return null;
          }
          return null;
        })
        .filter((img: any) => img !== null);
    }
    
    // Sanitize attributeIds
    if (Array.isArray(sanitized.attributeIds)) {
      sanitized.attributeIds = sanitized.attributeIds
        .map((id: any) => {
          if (typeof id === 'string') return id.trim();
          if (id && typeof id === 'object' && id._id) {
            const idStr = String(id._id);
            if (idStr && idStr !== '[object Object]' && idStr.length === 24) {
              return idStr;
            }
          }
          return null;
        })
        .filter((id: any): id is string => id !== null && typeof id === 'string' && id.length === 24);
    }
    
    // Sanitize variations
    if (Array.isArray(sanitized.variations)) {
      sanitized.variations = sanitized.variations.map((variation: any, idx: number) => {
        if (!variation || typeof variation !== 'object') return variation;
        const cleanVariation: any = {
          ...variation,
          id: variation.id || `var-${Date.now()}-${idx}`, // Add temporary ID for frontend
        };
        // Sanitize variation images
        if (Array.isArray(cleanVariation.images)) {
          cleanVariation.images = cleanVariation.images
            .map((img: any) => typeof img === 'string' ? img : null)
            .filter((img: any) => img !== null);
        }
        // Ensure attributes is an object and normalize all attribute value IDs to strings
        if (!cleanVariation.attributes || typeof cleanVariation.attributes !== 'object') {
          cleanVariation.attributes = {};
        } else {
          // CRITICAL FIX: Normalize all attribute value IDs to strings (handle buffer objects)
          const normalizedAttrs: Record<string, string> = {};
          for (const [attrSlug, valueId] of Object.entries(cleanVariation.attributes)) {
            const normalizedId = normalizeCategoryId(valueId);
            if (normalizedId) {
              normalizedAttrs[attrSlug] = normalizedId;
            }
          }
          cleanVariation.attributes = normalizedAttrs;
        }
        // Ensure numeric fields
        if (cleanVariation.stock !== undefined) {
          cleanVariation.stock = typeof cleanVariation.stock === 'number' ? cleanVariation.stock : Number(cleanVariation.stock) || 0;
        }
        if (cleanVariation.price !== undefined) {
          cleanVariation.price = typeof cleanVariation.price === 'number' ? cleanVariation.price : Number(cleanVariation.price) || undefined;
        }
        if (cleanVariation.originalPrice !== undefined) {
          cleanVariation.originalPrice = typeof cleanVariation.originalPrice === 'number' ? cleanVariation.originalPrice : Number(cleanVariation.originalPrice) || undefined;
        }
        return cleanVariation;
      });
    }
    
    // Ensure numeric fields are numbers
    if (sanitized.price !== undefined) {
      sanitized.price = typeof sanitized.price === 'number' ? sanitized.price : Number(sanitized.price) || 0;
    }
    if (sanitized.originalPrice !== undefined) {
      sanitized.originalPrice = typeof sanitized.originalPrice === 'number' ? sanitized.originalPrice : Number(sanitized.originalPrice) || 0;
    }
    if (sanitized.stock !== undefined && sanitized.stock !== null) {
      sanitized.stock = typeof sanitized.stock === 'number' ? sanitized.stock : Number(sanitized.stock) || undefined;
    }
    
    // Ensure string fields are strings
    if (sanitized.name !== undefined) sanitized.name = String(sanitized.name || '');
    if (sanitized.sku !== undefined) sanitized.sku = String(sanitized.sku || '');
    if (sanitized.slug !== undefined) sanitized.slug = String(sanitized.slug || '');
    if (sanitized.description !== undefined) sanitized.description = String(sanitized.description || '');
    if (sanitized.richDescription !== undefined) sanitized.richDescription = String(sanitized.richDescription || '');
    if (sanitized.descriptionImage !== undefined) sanitized.descriptionImage = String(sanitized.descriptionImage || '');
    
    return sanitized;
  };

  // Helper function to extract clean MongoDB ObjectId
  // Backend API only accepts MongoDB ObjectId (24 hex characters), not SKU
  const extractObjectId = (idValue: string | undefined): string | null => {
    if (!idValue) return null;
    const idStr = String(idValue).trim();
    
    // MongoDB ObjectId must be exactly 24 hexadecimal characters
    // Backend validates with Types.ObjectId.isValid() which requires exactly 24 hex chars
    if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
      if (import.meta.env.DEV) {
        console.log('✅ Valid MongoDB ObjectId:', idStr);
      }
      return idStr;
    }
    
    // Try to extract 24 hex characters from the string
    const match = idStr.match(/^([0-9a-fA-F]{24})/);
    if (match) {
      const extracted = match[1];
      if (import.meta.env.DEV) {
        console.log('✅ Extracted ObjectId:', extracted);
      }
      return extracted;
    }
    
    if (import.meta.env.DEV) {
      console.warn('⚠️ Invalid ObjectId format:', { idValue, idStr, length: idStr.length });
    }
    return null;
  };

  const fetchProduct = async () => {
    setLoading(true);
    try {
      // Validate and clean the product ID
      if (!id) {
        console.error('❌ No product ID provided');
        throw new Error('Product ID is required');
      }
      
      if (import.meta.env.DEV) {
        console.log('📥 Fetching product with ID:', id);
      }
      
      // Extract clean MongoDB ObjectId
      // Backend API requires exactly 24 hex characters (MongoDB ObjectId format)
      const cleanId = extractObjectId(id);
      
      // Backend validates with Types.ObjectId.isValid() - must be exactly 24 hex chars
      if (!cleanId) {
        console.error('❌ Invalid MongoDB ObjectId format:', {
          originalId: id,
          idType: typeof id,
          idLength: id?.length,
          expectedFormat: '24 hexadecimal characters (0-9a-fA-F)'
        });
        alert(`Invalid product ID format.\n\nExpected: MongoDB ObjectId (24 hex characters)\nReceived: "${id}"\n\nPlease go back to the products list and try again.`);
        navigate('/products');
        return;
      }
      
      if (import.meta.env.DEV) {
        console.log('✅ Using ID:', cleanId);
      }
      const response = await productsAPI.getById(cleanId);
      // Backend returns: { success: true, data: product }
      // productsAPI.getById returns: response.data (axios response body)
      // So response = { success: true, data: product }
      // We need response.data to get the actual product object
      let product = (response && response.success && response.data) 
        ? response.data 
        : (response && response.data) 
        ? response.data 
        : response;
      
      // Sanitize product data to remove buffer objects
      product = sanitizeProductData(product);
      
      if (!product) {
        throw new Error('Product data is null or undefined');
      }
      
      // Extract SKU from product - check multiple possible locations
      let productSku = '';
      if (product) {
        // Try different possible field names
        productSku = (product.sku && typeof product.sku === 'string' && product.sku.trim())
          ? product.sku.trim()
          : (product.baseSku && typeof product.baseSku === 'string' && product.baseSku.trim())
          ? product.baseSku.trim()
          : '';
      }
      
      // Debug: Log SKU extraction (only in development)
      if (import.meta.env.DEV) {
        console.log('🔍 Product SKU Debug:', {
          responseSuccess: response?.success,
          hasResponseData: !!response?.data,
          extractedProduct: product ? 'exists' : 'null',
          productSkuField: product?.sku,
          productBaseSku: product?.baseSku,
          extractedSku: productSku,
          hasSku: !!productSku,
          skuType: typeof product?.sku,
          allProductKeys: product ? Object.keys(product) : []
        });
        
        if (!productSku && product) {
          console.warn('⚠️ SKU not found in product. Available fields:', Object.keys(product));
        }
      }
      
      // Extract category IDs from various formats - ALWAYS return string IDs
      // Root cause fix: Handle all possible category formats from backend (populated objects, string IDs, etc.)
      const rawCategories = product.categories || [];
      
      if (import.meta.env.DEV) {
        console.log('🔍 Categories Debug (fetchProduct):', {
          rawCategories,
          rawCategoriesType: typeof rawCategories,
          isArray: Array.isArray(rawCategories),
          length: Array.isArray(rawCategories) ? rawCategories.length : 0,
          firstCategory: rawCategories[0],
          firstCategoryType: typeof rawCategories[0],
          firstCategoryKeys: rawCategories[0] ? Object.keys(rawCategories[0]) : [],
        });
      }
      
      const productCategories =
        (Array.isArray(rawCategories) ? rawCategories : []).map((cat: any) => {
          // Skip null/undefined
          if (!cat) return null;
          
          // Already a string ID (most common case after serialization)
          if (typeof cat === 'string') {
            const trimmed = cat.trim();
            if (trimmed.length === 24 && /^[0-9a-fA-F]{24}$/.test(trimmed)) {
              return trimmed;
            }
            return null;
          }
          
          // Object with _id property (populated category from backend)
          if (cat && typeof cat === 'object') {
            // Check _id property (most common for populated objects)
            if (cat._id) {
              const idStr = typeof cat._id === 'string' ? cat._id.trim() : String(cat._id).trim();
              if (idStr && idStr !== '[object Object]' && idStr.length === 24 && /^[0-9a-fA-F]{24}$/.test(idStr)) {
                return idStr;
              }
            }
            
            // Check if the object itself is an ObjectId-like structure
            // Sometimes _id might be nested or the object might be the ID itself
            const keys = Object.keys(cat);
            if (keys.length === 1 && keys[0] === '_id') {
              const idStr = typeof cat._id === 'string' ? cat._id.trim() : String(cat._id).trim();
              if (idStr && idStr.length === 24 && /^[0-9a-fA-F]{24}$/.test(idStr)) {
                return idStr;
              }
            }
          }
          
          // Try to convert to string as last resort (for ObjectId instances)
          const str = String(cat).trim();
          if (str && str !== '[object Object]' && str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
            return str;
          }
          
          return null;
        }).filter((id: any): id is string => id !== null && typeof id === 'string' && id.length === 24) || [];
      
      if (import.meta.env.DEV) {
        console.log('✅ Extracted Categories:', {
          extracted: productCategories,
          count: productCategories.length,
          sample: productCategories[0],
        });
      }
      // CRITICAL FIX: Normalize sizeChart ID to string (handle buffer objects)
      let inferredSizeChartId: string | null = null;
      if (product.sizeChartId) {
        inferredSizeChartId = normalizeCategoryId(product.sizeChartId);
      } else if (product.sizeChart) {
        inferredSizeChartId = normalizeCategoryId(
          typeof product.sizeChart === 'string'
            ? product.sizeChart
            : product.sizeChart?._id
        );
      }
      const sizeChartEntries: SizeChartEntry[] =
        product.sizeChartEntries ||
        (Array.isArray(product.sizeChart) ? product.sizeChart : []) ||
        [];
      const initialMode = inferredSizeChartId
        ? 'reference'
        : sizeChartEntries.length > 0
        ? 'custom'
        : 'none';

      // Stock is always a number (for products without variants)
      const stockValue: number | undefined = 
        typeof product.stock === 'number' ? product.stock : undefined;

      setFormData({
        name: product.name || '',
        sku: productSku,
        price: product.price?.toString() || '',
        originalPrice: product.originalPrice?.toString() || '',
        description: product.description || '',
        richDescription: product.richDescription || '',
        descriptionImage: product.descriptionImage || '',
        images: product.images || [],
        videos: product.videos || [],
        stock: stockValue,
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
        productType: (product.productType || ((product.variations && product.variations.length > 0) || (product.attributeIds && product.attributeIds.length > 0) ? 'variation' : 'single')) as 'single' | 'variation',
        attributeIds: product.attributeIds || [],
        selectedAttributeValues: {}, // Will be populated from variations if needed
        variations: (product.variations || []).map((v: any, idx: number) => {
          // CRITICAL FIX: Normalize attribute value IDs to strings (handle buffer objects, Maps, ObjectIds)
          const normalizedAttrs: Record<string, string> = {};
          if (v.attributes && typeof v.attributes === 'object') {
            // Handle Map objects (MongoDB returns Maps for variation attributes)
            if (v.attributes instanceof Map) {
              for (const [attrSlug, valueId] of v.attributes.entries()) {
                const normalizedId = normalizeCategoryId(valueId);
                if (normalizedId) {
                  normalizedAttrs[attrSlug] = normalizedId;
                }
              }
            } else {
              // Handle plain objects
              for (const [attrSlug, valueId] of Object.entries(v.attributes)) {
                const normalizedId = normalizeCategoryId(valueId);
                if (normalizedId) {
                  normalizedAttrs[attrSlug] = normalizedId;
                }
              }
            }
          }
          
          // Preserve attributeDetails if backend populated it (for display purposes)
          const variationData: any = {
            ...v,
            id: v.id || `var-${Date.now()}-${idx}`, // Add temporary ID for frontend
            attributes: normalizedAttrs, // Use normalized attributes
          };
          
          // Preserve attributeDetails from backend if available (helps with display)
          if (v.attributeDetails && typeof v.attributeDetails === 'object') {
            variationData.attributeDetails = v.attributeDetails;
          }
          
          return variationData;
        }),
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
    } catch (error: any) {
      console.error('Failed to load product:', error);
      
      // Check if it's an ID format error from backend
      const backendError = error?.response?.data;
      const errorCode = backendError?.code;
      const errorMessage = backendError?.message || error?.message || 'Failed to load product';
      
      if (errorCode === 'INVALID_PRODUCT_ID' || errorMessage.includes('Invalid product ID format')) {
        alert(`Invalid product ID format.\n\nPlease go back to the products list and try again.\n\nID used: ${id}`);
      } else {
        alert(errorMessage);
      }
      
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

    // No longer require sizes - variants are optional and can be added via variation form
    // Products can exist without variants (simple products with just stock)

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
    // Normalize the chart ID to ensure it matches the normalized IDs in availableSizeCharts
    const normalizedId = normalizeCategoryId(chartId);
    if (!normalizedId) {
      console.warn('⚠️ Invalid size chart ID selected:', chartId);
      return;
    }
    
    console.log('📊 Selecting size chart:', { 
      originalId: chartId, 
      normalizedId, 
      availableCharts: availableSizeCharts.map(c => c._id),
      found: availableSizeCharts.find(c => c._id === normalizedId)
    });
    
    setSelectedSizeChartId(normalizedId);
    setErrors((prev) => ({ ...prev, sizeChart: '' }));
    if (sizeChartMode === 'custom') {
      const chart = availableSizeCharts.find((c) => c._id === normalizedId);
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


  // Legacy variant functions removed - using attribute-based variations now

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



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      // Root cause fix: Always read from ref to get latest formData (avoids stale closure)
      const currentFormData = formDataRef.current;
      
      // CRITICAL DEBUG: Log both ref and state to compare
      console.log('🔍 handleSubmit - CRITICAL DEBUG:', {
        refCategories: currentFormData.categories,
        refCategoriesCount: currentFormData.categories?.length || 0,
        refCategoriesType: typeof currentFormData.categories,
        refIsArray: Array.isArray(currentFormData.categories),
        stateCategories: formData.categories,
        stateCategoriesCount: formData.categories?.length || 0,
        stateIsArray: Array.isArray(formData.categories),
        refEqualsState: JSON.stringify(currentFormData.categories) === JSON.stringify(formData.categories),
      });
      
      const cleanedVideos = currentFormData.videos.filter((v) => v.trim());
      const cleanedInstructions = currentFormData.washCareInstructions.filter((instr) => instr.text.trim() !== '');
      
      // Process attributeIds FIRST (needed for variation processing)
      // CRITICAL FIX: Always preserve attributeIds if productType is 'variation', even if variations are empty
      // This ensures attributes don't disappear when saving
      const cleanedAttributeIds = (currentFormData.attributeIds || [])
        .filter((id): id is string => typeof id === 'string' && id.trim().length === 24 && /^[0-9a-fA-F]{24}$/.test(id.trim()))
        .map(id => id.trim());
      
      // Determine productType if not explicitly set (needed for variation processing)
      let productType: 'single' | 'variation' = currentFormData.productType || 'single';
      
      // Process attribute-based variations
      // CRITICAL: Always process variations if they exist, even if empty array
      let cleanedVariations: any[] | undefined = undefined;
      
      if (import.meta.env.DEV) {
        console.log('🔍 Variations Debug:', {
          hasVariations: !!currentFormData.variations,
          variationsLength: currentFormData.variations?.length || 0,
          variations: currentFormData.variations,
          productType,
        });
      }
      
      if (Array.isArray(currentFormData.variations)) {
        if (currentFormData.variations.length > 0) {
          if (import.meta.env.DEV) {
            console.log('🔍 Processing variations:', {
              count: currentFormData.variations.length,
              variations: currentFormData.variations,
            });
          }
          
          cleanedVariations = currentFormData.variations
            .filter((v) => {
              const hasAttributes = v.attributes && Object.keys(v.attributes).length > 0;
              const hasSku = v.sku && v.sku.trim();
              if (!hasAttributes || !hasSku) {
                if (import.meta.env.DEV) {
                  console.warn('⚠️ Variation filtered out:', { hasAttributes, hasSku, variation: v });
                }
              }
              return hasAttributes && hasSku;
            })
            .map((v) => {
              // Remove temporary id field before sending to backend
              const { id, ...variationData } = v;
              
              // SIMPLIFIED: Normalize slugs (not IDs) - WordPress style
              const normalizedAttributes: Record<string, string> = {};
              for (const [attrSlug, valueSlug] of Object.entries(v.attributes)) {
                const normalizedSlug = String(valueSlug).toLowerCase().trim();
                if (normalizedSlug) {
                  normalizedAttributes[attrSlug.toLowerCase().trim()] = normalizedSlug;
                } else {
                  if (import.meta.env.DEV) {
                    console.warn(`⚠️ Invalid attribute value slug for ${attrSlug}:`, valueSlug);
                  }
                }
              }
              
              // Only include variation if it has valid normalized attributes
              if (Object.keys(normalizedAttributes).length === 0) {
                if (import.meta.env.DEV) {
                  console.warn('⚠️ Variation skipped: no valid attribute slugs', v);
                }
                return null;
              }
              
              return {
                ...variationData,
                attributes: normalizedAttributes, // { attributeSlug: valueSlug }
                sku: v.sku.trim().toUpperCase().slice(0, 48),
                stock: Math.max(0, v.stock || 0),
                price: v.price !== undefined ? Math.max(0, v.price) : undefined,
                originalPrice: v.originalPrice !== undefined ? Math.max(0, v.originalPrice) : undefined,
                images: v.images && v.images.length > 0 ? v.images : undefined,
                shortDescription: v.shortDescription?.trim() || undefined,
                isActive: v.isActive !== false,
              };
            })
            .filter((v): v is any => v !== null); // Remove null entries
          
          if (import.meta.env.DEV) {
            console.log('✅ Cleaned variations:', {
              original: currentFormData.variations.length,
              cleaned: cleanedVariations.length,
              variations: cleanedVariations,
            });
          }
        } else {
          // Empty array - handle based on productType
          if (productType === 'variation') {
            cleanedVariations = [];
          } else {
            cleanedVariations = undefined;
          }
        }
      } else if (productType === 'variation') {
        // Variations is undefined but productType is variation - set to empty array
        cleanedVariations = [];
      }
      
      // Update productType based on processed variations and attributes
      if (cleanedVariations && cleanedVariations.length > 0) {
        productType = 'variation';
      } else if (cleanedAttributeIds.length > 0) {
        productType = 'variation';
      } else if (cleanedVariations === undefined && cleanedAttributeIds.length === 0) {
        productType = 'single';
      }
      
      const normalizedSlug = slugifyValue(slug);
      setSlug(normalizedSlug);

      // CRITICAL FIX: Extract sizeChart entries separately (don't remove from data yet)
      const sizeChartEntries = currentFormData.sizeChart || [];
      const { categories: selectedCategories, ...rest } = currentFormData;

      // Prepare stock data for products without variations (simple number)
      let stockData: number | undefined = undefined;
      if ((!cleanedVariations || cleanedVariations.length === 0) && currentFormData.stock !== undefined && currentFormData.stock !== null) {
        stockData = Math.max(0, Math.floor(currentFormData.stock));
        // Set to undefined if 0 or invalid
        if (stockData === 0 || isNaN(stockData)) {
          stockData = undefined;
        }
      }

      // Root cause fix: Always use currentFormData.categories from ref (ensures latest state)
      // This avoids stale closure issues where handleSubmit might have old formData
      const categoriesFromFormData = currentFormData.categories || [];
      
      // Ensure categories are always string IDs (never objects or buffers)
      // Root cause fix: Log categories before sanitization to debug empty array issue
      if (import.meta.env.DEV) {
        console.log('🔍 Categories Debug (handleSubmit):', {
          currentFormDataCategories: currentFormData.categories,
          categoriesFromFormData,
          categoriesFromFormDataType: typeof categoriesFromFormData,
          isArray: Array.isArray(categoriesFromFormData),
          length: Array.isArray(categoriesFromFormData) ? categoriesFromFormData.length : 0,
          selectedCategories,
          formDataStateCategories: formData.categories, // For comparison
        });
      }
      
      const sanitizedCategories = (categoriesFromFormData || []).map((cat: any) => {
        // Already a string ID
        if (typeof cat === 'string') {
          const trimmed = cat.trim();
          if (trimmed.length === 24 && /^[0-9a-fA-F]{24}$/.test(trimmed)) {
            return trimmed;
          }
          return null;
        }
        // Object with _id property
        if (cat?._id) {
          const idStr = typeof cat._id === 'string' ? cat._id.trim() : String(cat._id).trim();
          if (idStr && idStr !== '[object Object]' && idStr.length === 24 && /^[0-9a-fA-F]{24}$/.test(idStr)) {
            return idStr;
          }
          return null;
        }
        // Try to convert to string
        const str = String(cat).trim();
        if (str && str !== '[object Object]' && str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
          return str;
        }
        return null;
      }).filter((id): id is string => id !== null && typeof id === 'string' && id.length === 24);
      
      if (import.meta.env.DEV) {
        console.log('✅ Sanitized Categories (handleSubmit):', {
          sanitized: sanitizedCategories,
          count: sanitizedCategories.length,
          sample: sanitizedCategories[0],
        });
      }

      // Root cause fix: Always include categories explicitly, even if empty
      // This ensures categories are always sent to backend (empty array means clear categories)
      const data: Record<string, any> = {
        ...rest,
        price: parseFloat(currentFormData.price),
        originalPrice: parseFloat(currentFormData.originalPrice),
        stock: stockData,
        videos: cleanedVideos,
        washCareInstructions: cleanedInstructions,
        customerOrderImages: currentFormData.customerOrderImages,
        disableVariants: currentFormData.disableVariants,
        showOutOfStockVariants: currentFormData.showOutOfStockVariants,
        showFeatures: currentFormData.showFeatures,
        productType: productType,
        // CRITICAL FIX: Always preserve attributeIds if productType is 'variation'
        // This ensures attributes don't disappear when saving
        attributeIds: productType === 'variation' && cleanedAttributeIds.length > 0 ? cleanedAttributeIds : (productType === 'variation' ? [] : undefined),
        // CRITICAL FIX: Always send variations array (even if empty) for variation products
        // This prevents backend from removing variations when productType is 'variation'
        variations: productType === 'variation' 
          ? (cleanedVariations !== undefined ? cleanedVariations : []) 
          : (cleanedVariations !== undefined ? cleanedVariations : undefined),
        categories: sanitizedCategories, // Always include categories (even if empty array)
      };
      
      // CRITICAL FIX: Explicitly ensure variations and attributeIds are in payload
      // Double-check that these fields are included (defensive programming)
      if (productType === 'variation') {
        // Always include variations (even if empty array)
        data.variations = cleanedVariations !== undefined ? cleanedVariations : [];
        // Always include attributeIds (even if empty array)
        data.attributeIds = cleanedAttributeIds.length > 0 ? cleanedAttributeIds : [];
        
        if (import.meta.env.DEV) {
          console.log('✅ Variation Product Payload:', {
            productType: data.productType,
            attributeIds: data.attributeIds,
            attributeIdsCount: data.attributeIds.length,
            variations: data.variations,
            variationsCount: Array.isArray(data.variations) ? data.variations.length : 'not array',
            variationsType: typeof data.variations,
            cleanedVariations,
            cleanedVariationsType: typeof cleanedVariations,
          });
        }
      }
      
      if (import.meta.env.DEV) {
        console.log('📤 Final payload (before sizeChart):', {
          hasVariations: 'variations' in data,
          variationsCount: Array.isArray(data.variations) ? data.variations.length : 'not array',
          hasAttributeIds: 'attributeIds' in data,
          attributeIdsCount: Array.isArray(data.attributeIds) ? data.attributeIds.length : 'not array',
          productType: data.productType,
          hasSizeChart: 'sizeChart' in data,
          sizeChartValue: data.sizeChart,
        });
      }
      
      // Root cause fix: Explicitly ensure categories is in the payload
      // Double-check that categories are included (defensive programming)
      if (!('categories' in data)) {
        data.categories = sanitizedCategories;
      }
      
      if (import.meta.env.DEV) {
        console.log('📤 Final payload categories:', {
          categoriesInData: data.categories,
          categoriesCount: Array.isArray(data.categories) ? data.categories.length : 0,
          fullPayloadKeys: Object.keys(data),
        });
      }

      data.slug = normalizedSlug;
      
      // Include base SKU if provided (backend will generate if empty)
      if (currentFormData.sku && currentFormData.sku.trim()) {
        data.sku = currentFormData.sku.trim().toUpperCase();
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

      // CRITICAL FIX: Always process and set sizeChart explicitly
      // This ensures sizeChart is always included in the payload, even if null
      if (sizeChartMode === 'reference') {
        // Normalize selectedSizeChartId to ensure it's a valid string ObjectId
        const normalizedSizeChartId = selectedSizeChartId 
          ? normalizeCategoryId(selectedSizeChartId) 
          : null;
        data.sizeChart = normalizedSizeChartId || null;
        if (import.meta.env.DEV) {
          console.log('📊 SizeChart (reference):', {
            selectedSizeChartId,
            normalizedSizeChartId,
            final: data.sizeChart,
          });
        }
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
        if (import.meta.env.DEV) {
          console.log('📊 SizeChart (custom):', {
            entriesCount: sizeChartEntries.length,
            customEntriesCount: customEntries.length,
            final: data.sizeChart,
          });
        }
      } else {
        // sizeChartMode === 'none' - explicitly set to null
        data.sizeChart = null;
        if (import.meta.env.DEV) {
          console.log('📊 SizeChart (none):', { final: data.sizeChart });
        }
      }
      
      // CRITICAL FIX: Ensure sizeChart is never "[object Object]" - if it's an object, set to null
      if (data.sizeChart && typeof data.sizeChart === 'object' && !Array.isArray(data.sizeChart)) {
        // If it's an object (not an array), try to extract _id or set to null
        const extractedId = normalizeCategoryId(data.sizeChart);
        data.sizeChart = extractedId || null;
        if (import.meta.env.DEV) {
          console.warn('⚠️ SizeChart was object, extracted ID:', { extractedId, final: data.sizeChart });
        }
      }
      
      // CRITICAL FIX: Always explicitly include sizeChart in payload (even if null)
      // This ensures backend receives the sizeChart field for updates
      if (!('sizeChart' in data)) {
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
              sku={formData.sku}
              description={formData.description}
              richDescription={formData.richDescription}
              descriptionImage={formData.descriptionImage}
              images={formData.images}
              onNameChange={(name) => {
                setFormData({ ...formData, name });
                setErrors({ ...errors, name: '' });
              }}
              onSkuChange={(sku) => {
                const skuValue = sku.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                setFormData({ ...formData, sku: skuValue });
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
                onCategoriesChange={(categories) => {
                  // Root cause fix: Use functional update to ensure we get latest state
                  console.log('🔔 onCategoriesChange CALLED with:', {
                    receivedCategories: categories,
                    receivedCount: categories?.length || 0,
                    receivedType: typeof categories,
                    isArray: Array.isArray(categories),
                    currentFormDataCategories: formData.categories,
                    currentFormDataCount: formData.categories?.length || 0,
                  });
                  
                  setFormData((prev) => {
                    const newFormData = { ...prev, categories };
                    
                    console.log('🔄 Categories changed (setFormData callback):', {
                      oldCategories: prev.categories,
                      newCategories: categories,
                      oldCount: prev.categories?.length || 0,
                      newCount: categories?.length || 0,
                      newFormDataCategories: newFormData.categories,
                      newFormDataCount: newFormData.categories?.length || 0,
                      categoriesArray: Array.isArray(categories),
                      categoriesSample: categories[0],
                    });
                    
                    // Root cause fix: Also update ref immediately (don't wait for useEffect)
                    // This ensures handleSubmit always has the latest categories
                    formDataRef.current = newFormData;
                    console.log('✅ formDataRef.current updated immediately:', {
                      refCategories: formDataRef.current.categories,
                      refCount: formDataRef.current.categories?.length || 0,
                    });
                    
                    return newFormData;
                  });
                }}
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
              websiteUrl={websiteUrl}
              productId={id}
              productName={formData.name}
              showSku={false} // SKU is now shown in Pricing section
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

            {/* Product Type Selector */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Type</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose whether this is a single product or a product with variations (e.g., different sizes, colors).
              </p>
              <div className="flex gap-4">
                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors flex-1" style={{ borderColor: formData.productType === 'single' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="productType"
                    value="single"
                    checked={formData.productType === 'single'}
                    onChange={(e) => {
                      const newType = e.target.value as 'single' | 'variation';
                      setFormData({ 
                        ...formData, 
                        productType: newType,
                        // Clear variations and attributes when switching to single
                        ...(newType === 'single' ? { variations: [], attributeIds: [], selectedAttributeValues: {} } : {})
                      });
                    }}
                    className="mr-3 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Single Product</div>
                    <div className="text-sm text-gray-500">No variations - single price and stock</div>
                  </div>
                </label>
                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors flex-1" style={{ borderColor: formData.productType === 'variation' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="productType"
                    value="variation"
                    checked={formData.productType === 'variation'}
                    onChange={(e) => {
                      const newType = e.target.value as 'single' | 'variation';
                      setFormData({ 
                        ...formData, 
                        productType: newType
                      });
                    }}
                    className="mr-3 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Product with Variations</div>
                    <div className="text-sm text-gray-500">Multiple variations with different attributes (size, color, etc.)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Attributes - WordPress style: can attach to single products too */}
            {formData.productType === 'single' && (
              <ProductAttributes
                selectedAttributeIds={formData.attributeIds}
                selectedAttributeValues={formData.selectedAttributeValues || {}}
                onAttributeIdsChange={(ids) => setFormData({ ...formData, attributeIds: ids })}
                onAttributeValuesChange={(values) => setFormData({ ...formData, selectedAttributeValues: values })}
                allowVariations={false}
              />
            )}

            {/* Attribute-based Variations - Only show if productType is 'variation' */}
            {formData.productType === 'variation' && (
              <ProductAttributeVariations
              selectedAttributeIds={formData.attributeIds}
              selectedAttributeValues={formData.selectedAttributeValues || {}}
              onAttributeIdsChange={(ids) => setFormData({ ...formData, attributeIds: ids })}
              onAttributeValuesChange={(values) => setFormData({ ...formData, selectedAttributeValues: values })}
              variations={formData.variations}
              onVariationsChange={(variations) => setFormData({ ...formData, variations })}
              baseSku={formData.sku || slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD'}
              basePrice={parseFloat(formData.price) || 0}
              baseOriginalPrice={parseFloat(formData.originalPrice) || 0}
              onRegenerateAllSkus={() => {
                // Regenerate SKUs for all variations
                const baseSku = formData.sku || slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD';
                const newVariations = formData.variations.map((v, idx) => {
                  // Generate SKU from attributes
                  const attrSlugs = Object.keys(v.attributes).join('-').toUpperCase().slice(0, 20);
                  const sku = `${baseSku}-${attrSlugs}-${idx + 1}`.toUpperCase().slice(0, 48);
                  return { ...v, sku };
                });
                setFormData({ ...formData, variations: newVariations });
              }}
              onVariationImageUpload={async (variationId, files) => {
                const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
                if (imageFiles.length === 0) return;

                setUploading(true);
                try {
                  const response = await uploadAPI.uploadMultiple(imageFiles, 'products');
                  const uploadedUrls = response.data?.files?.map((f: any) => f.url) || response.data?.urls || [];
                  const newVariations = formData.variations.map(v =>
                    v.id === variationId
                      ? { ...v, images: [...(v.images || []), ...uploadedUrls] }
                      : v
                  );
                  setFormData({ ...formData, variations: newVariations });
                } catch (error) {
                  alert('Failed to upload variation images');
                } finally {
                  setUploading(false);
                }
              }}
              onRemoveVariationImage={(variationId, imageIndex) => {
                const newVariations = formData.variations.map(v =>
                  v.id === variationId
                    ? { ...v, images: (v.images || []).filter((_, i) => i !== imageIndex) }
                    : v
                );
                setFormData({ ...formData, variations: newVariations });
              }}
              uploading={uploading}
            />
            )}

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
              sku={formData.sku}
              stock={formData.stock}
              showStock={formData.productType === 'single'}
              onPriceChange={(price) => {
                setFormData({ ...formData, price });
                setErrors({ ...errors, price: '' });
              }}
              onOriginalPriceChange={(price) => {
                setFormData({ ...formData, originalPrice: price });
                setErrors({ ...errors, originalPrice: '' });
              }}
              onSkuChange={(sku) => {
                const skuValue = sku.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                setFormData({ ...formData, sku: skuValue });
              }}
              onStockChange={(stock) => {
                setFormData({ ...formData, stock });
              }}
              errors={errors}
            />

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
              productId={id}
              productName={formData.name}
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
