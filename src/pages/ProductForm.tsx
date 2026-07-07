import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  productsAPI, uploadAPI, categoriesAPI, sizeChartsAPI, specificationsAPI,
  tagsAPI, taxRulesAPI, brandsAPI, manufacturersAPI, returnPoliciesAPI, productConfigAPI,
} from '../services/api';
import ProductComplianceSections, { ProductConfig, SpecSectionValue } from '../components/product/ProductComplianceSections';
import api from '../services/api';
import { FaArrowLeft, FaDownload } from 'react-icons/fa';
import {
  ProductBasicInfo,
  ProductPricing,
  ProductCategories,
  ProductTags,
  ProductSEO,
  ProductSizeChart,
  ProductWashCare,
  ProductDisplayOptions,
  ProductMediaPanel,
  ProductContentSections,
  ProductB2BPricing,
  ProductOffers,
  ProductRelated,
} from '../components/product';
import ProductAttributeVariations from '../components/product/ProductAttributeVariations';
import ProductAttributes from '../components/product/ProductAttributes';
import type { ContentBlock } from '../components/product/ProductContentSections';
import type { B2BPricingTier } from '../components/product/ProductB2BPricing';
import type { ProductOffer } from '../components/product/ProductOffers';
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
import { useAuth } from '../contexts/AuthContext';

// ─── helpers ──────────────────────────────────────────────────────────────────

// Applied to each of the 3 form columns (lg+ only, where they sit side by side).
// Sticky + its own scroll container so hovering one column and scrolling only
// moves that column — the other two stay put. overscroll-contain keeps the wheel
// from "escaping" to the page once a column hits its own top/bottom.
const SCROLL_COL_CLS = 'lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:overscroll-contain lg:scroll-smooth lg:pr-2 nice-scrollbar';

const isValidId = (s: string): boolean => {
  if (s.length === 24 && /^[0-9a-fA-F]{24}$/.test(s)) return true;
  if (s.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(s)) return true;
  if (s.length === 32 && /^[0-9a-fA-F]{32}$/.test(s)) return true;
  return false;
};

const normalizeCategoryId = (id: any): string | null => {
  if (!id) return null;
  if (typeof id === 'string') { const t = id.trim(); if (isValidId(t)) return t; }
  if (id && typeof id === 'object') {
    if (id._id) return normalizeCategoryId(id._id);
    if (id.id) return normalizeCategoryId(id.id);
    if (id.buffer) {
      try {
        const keys = Object.keys(id.buffer).map(Number).sort((a, b) => a - b);
        const arr = keys.map(k => Number(id.buffer[k]));
        if (arr.length === 12) { const hex = arr.map(b => b.toString(16).padStart(2, '0')).join(''); if (isValidId(hex)) return hex; }
      } catch { return null; }
    }
  }
  const str = String(id).trim();
  return isValidId(str) ? str : null;
};

const extractObjectId = (v: string | undefined): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[0-9a-fA-F]{24}$/.test(s)) return s;
  const m = s.match(/^([0-9a-fA-F]{24})/);
  return m ? m[1] : null;
};

// Convert an ISO timestamp / Date to the `YYYY-MM-DDTHH:mm` format an
// <input type="datetime-local"> requires (local time). Returns '' when empty/invalid.
const toDatetimeLocal = (v: any): string => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return typeof v === 'string' ? v.slice(0, 16) : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const extractList = (res: any): any[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return res.data?.data || res.data || [];
};

// ─── Quick-create modals ──────────────────────────────────────────────────────

const QuickCreateCategoryModal: React.FC<{
  onClose: () => void;
  onCreated: (cat: { _id: string; name: string; slug: string }) => void;
  availableParents: CategoryOption[];
}> = ({ onClose, onCreated, availableParents }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const slug = slugifyValue(name);
      const res = await categoriesAPI.create({ name: name.trim(), slug });
      const cat = res?.data || res;
      onCreated({ _id: cat._id || cat.id, name: cat.name, slug: cat.slug });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create category');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Create New Category</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Name <span className="text-red-500">*</span></label>
            <input className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Homeopathy" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Parent (optional)</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              <option value="">None (top-level)</option>
              {availableParents.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={handleCreate} disabled={saving}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Category'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const QuickCreateTagModal: React.FC<{
  onClose: () => void;
  onCreated: (tag: { _id: string; name: string; slug: string }) => void;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const slug = slugifyValue(name);
      const res = await tagsAPI.create({ name: name.trim(), slug });
      const tag = res?.data || res;
      onCreated({ _id: tag._id || tag.id, name: tag.name, slug: tag.slug });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create tag');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-xs">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Create New Tag</h3>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Tag Name <span className="text-red-500">*</span></label>
          <input className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bestseller" autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={handleCreate} disabled={saving}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Tag'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

const ProductForm: React.FC = () => {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { canAccess } = useAuth();
  const id = rawId ? String(rawId).trim() : undefined;
  const isEdit = !!id;
  const isSlugParam = !!id && !/^[0-9a-fA-F]{24}$/.test(id) && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(id);
  const prefilledData = location.state?.prefilledData;

  // ── form state ──────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    name: '', title: '', sku: '', hsnCode: '', taxRuleId: '',
    price: '', originalPrice: '', salePrice: '', saleStartsAt: '', saleEndsAt: '',
    description: '', richDescription: '', descriptionImage: '',
    images: [] as string[], videos: [] as string[],
    stock: undefined as number | undefined,
    brandId: '', manufacturerId: '', returnPolicyId: '',
    categories: [] as string[], featuredCategory: '',
    tags: [] as Array<string | { _id: string; name: string }>,
    weight: '0.5', length: '10', breadth: '10', height: '5',
    countryOfOrigin: '', modelNumber: '', licenseNumber: '',
    expiryMonths: undefined as number | undefined,
    isActive: true, isFeatured: false, isDigital: false, requiresPrescription: false,
    disableVariants: false, showOutOfStockVariants: true, showFeatures: true,
    productType: 'single' as 'single' | 'variation',
    attributeIds: [] as string[],
    selectedAttributeValues: {} as Record<string, string[]>,
    variations: [] as ProductVariation[],
    specificationId: undefined as string | undefined,
    specifications: undefined as Array<{ heading: string; items: Array<{ key: string; value: string }> }> | undefined,
    sizeChart: [] as SizeChartEntry[],
    washCareInstructions: [] as Array<{ text: string; iconUrl?: string; iconName?: string }>,
    customerOrderImages: [] as string[],
    aplusContent: [] as ContentBlock[],
    offers: [] as ProductOffer[],
    crossSellIds: [] as string[], upsellIds: [] as string[], fbtIds: [] as string[],
    b2bPricing: [] as B2BPricingTier[],
  });

  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [seoData, setSeoData] = useState<SeoFormState>({
    title: '', description: '', keywords: '', canonicalUrl: '', metaRobots: '', ogTitle: '', ogDescription: '', ogImage: '',
  });
  const [showAdvancedSeo, setShowAdvancedSeo] = useState(false);

  // Lookups
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>([]);
  const [availableSizeCharts, setAvailableSizeCharts] = useState<SizeChartOption[]>([]);
  const [availableSpecifications, setAvailableSpecifications] = useState<Array<{ _id: string; name: string; slug?: string }>>([]);
  const [availableTags, setAvailableTags] = useState<Array<{ _id: string; name: string; slug?: string; isActive?: boolean }>>([]);
  const [availableTaxRules, setAvailableTaxRules] = useState<Array<{ _id: string; name: string; rate?: number }>>([]);
  const [availableBrands, setAvailableBrands] = useState<Array<{ _id: string; name: string }>>([]);
  const [availableManufacturers, setAvailableManufacturers] = useState<Array<{ _id: string; name: string }>>([]);
  const [availableReturnPolicies, setAvailableReturnPolicies] = useState<Array<{ _id: string; name: string }>>([]);
  const [productConfig, setProductConfig] = useState<ProductConfig | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(false);

  const [sizeChartMode, setSizeChartMode] = useState<'none' | 'reference' | 'custom'>('none');
  const [selectedSizeChartId, setSelectedSizeChartId] = useState<string>('');
  const [websiteUrl, setWebsiteUrl] = useState<string>('');

  const [uploading, setUploading] = useState(false);          // product gallery
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingCustomer, setUploadingCustomer] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateTag, setShowCreateTag] = useState(false);

  // ── lookups ────────────────────────────────────────────────────────────────

  const loadLookups = async () => {
    setLookupsLoading(true);
    try {
      // allSettled — one failing endpoint must NOT blank every dropdown.
      const settled = await Promise.allSettled([
        categoriesAPI.list(),
        sizeChartsAPI.list(),
        specificationsAPI.getAll({ active: true }),
        tagsAPI.getAll({ active: true }),
        taxRulesAPI.getAll(),
        brandsAPI.list({ active: true }),
        manufacturersAPI.getAll({ active: true }),
        returnPoliciesAPI.getAll({ active: true }),
      ]);
      const val = (i: number) => (settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<any>).value : undefined);
      settled.forEach((s, i) => { if (s.status === 'rejected') console.error(`Lookup ${i} failed`, s.reason); });
      const [catRes, chartRes, specRes, tagsRes, taxRes, brandsRes, mfgRes, rpRes] =
        [val(0), val(1), val(2), val(3), val(4), val(5), val(6), val(7)];

      const normList = (raw: any[], extra?: (item: any) => any): any[] =>
        extractList(raw).map((c: any) => {
          const nid = normalizeCategoryId(c._id || c.id);
          if (!nid) return null;
          return extra ? extra({ ...c, _id: nid }) : { ...c, _id: nid };
        }).filter(Boolean);

      setAvailableCategories(normList(catRes) as CategoryOption[]);

      const charts = normList(chartRes) as SizeChartOption[];
      setAvailableSizeCharts(charts.filter((c, i, a) => a.findIndex(x => x._id === c._id) === i));

      setAvailableSpecifications(normList(specRes) as { _id: string; name: string; slug?: string }[]);

      setAvailableTags(normList(tagsRes) as { _id: string; name: string; slug?: string; isActive?: boolean }[]);

      const taxList = (Array.isArray(taxRes) ? taxRes : []).map((t: any) => {
        const rawId = t._id || t.id || String(t.rate ?? '');
        const nid = normalizeCategoryId(rawId) || String(rawId).trim();
        return nid ? { _id: nid, name: t.name || `GST ${t.rate}%`, rate: t.rate } : null;
      }).filter(Boolean) as { _id: string; name: string; rate?: number }[];
      setAvailableTaxRules(taxList);

      setAvailableBrands(normList(brandsRes, b => ({ _id: b._id, name: b.name })));
      setAvailableManufacturers(normList(mfgRes, m => ({ _id: m._id, name: m.name })));
      setAvailableReturnPolicies(normList(rpRes, r => ({ _id: r._id, name: r.name })));
    } catch (e) {
      console.error('Lookups failed', e);
    } finally {
      setLookupsLoading(false);
    }
  };

  useEffect(() => { loadLookups(); fetchWebsiteUrl(); }, []);
  useEffect(() => { productConfigAPI.get().then(cfg => { if (cfg) setProductConfig(cfg); }); }, []);

  const fetchWebsiteUrl = async () => {
    try {
      const res = await api.get('/settings/admin');
      if (res.data?.success) setWebsiteUrl(res.data.data?.general?.websiteUrl || '');
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (isEdit && id) fetchProduct();
    else if (prefilledData) loadPrefilledData(prefilledData);
  }, [id, isEdit]); // eslint-disable-line

  useEffect(() => {
    if (!slugManuallyEdited) setSlug(slugifyValue(formData.name));
  }, [formData.name, slugManuallyEdited]);

  // ── data mapping ──────────────────────────────────────────────────────────

  const normalizeVariations = (raw: any[]) => raw.map((v: any, idx: number) => {
    const normalizedAttrs: Record<string, string> = {};
    const entries: [string, any][] = v.attributes instanceof Map
      ? Array.from((v.attributes as Map<string, any>).entries())
      : Object.entries(v.attributes || {});
    for (const [attrSlug, valueData] of entries) {
      const nAttr = String(attrSlug).toLowerCase().trim();
      let nVal = '';
      if (typeof valueData === 'string') nVal = valueData.toLowerCase().trim();
      else if (valueData && typeof valueData === 'object') {
        const obj = valueData as any;
        nVal = String(obj.slug || obj.name || obj.value || '').toLowerCase().trim();
      }
      if (nAttr && nVal && nVal !== '[object object]') normalizedAttrs[nAttr] = nVal;
    }
    const brandId = v.brandId || v.primary_brand_id || v.primaryBrandId || undefined;
    return {
      ...v,
      id: v.id || `var-${Date.now()}-${idx}`,
      attributes: normalizedAttrs,
      brandId,
      brandName: v.brandName || v.brand_name || undefined,
    };
  });

  const mapProductToForm = (p: any) => {
    const cats = (Array.isArray(p.categories) ? p.categories : [])
      .map((c: any) => normalizeCategoryId(c)).filter((x: any): x is string => x !== null);

    const scId = p.sizeChartId ? normalizeCategoryId(p.sizeChartId) :
      (p.sizeChart && typeof p.sizeChart === 'string') ? normalizeCategoryId(p.sizeChart) :
      (p.sizeChart && typeof p.sizeChart === 'object' && !Array.isArray(p.sizeChart) && p.sizeChart._id) ? normalizeCategoryId(p.sizeChart._id) : null;
    const scEntries: SizeChartEntry[] = p.sizeChartEntries || (Array.isArray(p.sizeChart) ? p.sizeChart : []);
    const scMode: 'none' | 'reference' | 'custom' = scId ? 'reference' : scEntries.length > 0 ? 'custom' : 'none';

    const normTags = (raw: any[]): string[] => raw.map((t: any) => {
      if (typeof t === 'string') return t;
      return normalizeCategoryId(t._id || t) || null;
    }).filter((x): x is string => x !== null);

    return {
      data: {
        name: p.name || '',
        title: p.title || '',
        sku: p.sku || p.baseSku || '',
        hsnCode: p.hsnCode || p.hsn_code || '',
        taxRuleId: p.taxRuleId != null ? String(p.taxRuleId).trim() : '',
        price: p.price != null ? String(p.price) : p.sellingPrice != null ? String(p.sellingPrice) : p.selling_price != null ? String(p.selling_price) : '',
        originalPrice: p.originalPrice != null ? String(p.originalPrice) : p.mrp != null ? String(p.mrp) : '',
        salePrice: p.salePrice != null ? String(p.salePrice) : p.sale_price != null ? String(p.sale_price) : '',
        saleStartsAt: toDatetimeLocal(p.saleStartsAt || p.sale_starts_at || ''),
        saleEndsAt: toDatetimeLocal(p.saleEndsAt || p.sale_ends_at || ''),
        description: p.description || p.short_desc || '',
        richDescription: p.richDescription || p.long_desc || p.rich_desc || '',
        descriptionImage: p.descriptionImage || p.description_image || '',
        images: p.images || [],
        videos: p.videos || [],
        stock: typeof p.stock === 'number' ? p.stock : undefined,
        brandId: p.brandId || p.brand_id || p.brand?._id || p.brand?.id || '',
        manufacturerId: p.manufacturerId || p.manufacturer_id || p.manufacturer?._id || p.manufacturer?.id || '',
        returnPolicyId: p.returnPolicyId || p.return_policy_id || p.returnPolicy?._id || '',
        categories: cats,
        featuredCategory: p.featuredCategory ? String(p.featuredCategory) : p.featured_category_id || '',
        tags: normTags(p.tags || []),
        weight: p.weight != null ? String(p.weight) : '0.5',
        length: p.length != null ? String(p.length) : '10',
        breadth: p.breadth != null ? String(p.breadth) : '10',
        height: p.height != null ? String(p.height) : '5',
        countryOfOrigin: p.countryOfOrigin || p.country_of_origin || '',
        modelNumber: p.modelNumber || p.model_number || '',
        licenseNumber: p.licenseNumber || p.license_number || '',
        expiryMonths: p.expiryMonths || p.expiry_months || undefined,
        isActive: p.isActive !== false && p.is_active !== false,
        isFeatured: !!(p.isFeatured || p.is_featured),
        isDigital: !!(p.isDigital || p.is_digital),
        requiresPrescription: !!(p.requiresPrescription || p.requires_prescription),
        disableVariants: !!(p.disableVariants || p.disable_variants),
        showOutOfStockVariants: p.showOutOfStockVariants !== false && p.show_oos_variants !== false,
        showFeatures: p.showFeatures !== false,
        productType: (p.productType || p.product_type || ((p.variations?.length || p.attributeIds?.length) ? 'variation' : 'single')) as 'single' | 'variation',
        attributeIds: p.attributeIds?.length ? p.attributeIds : (p.attributes || []).map((a: any) => a._id).filter(Boolean),
        selectedAttributeValues: {},
        variations: normalizeVariations(p.variations || []),
        specificationId: p.specificationId ? normalizeCategoryId(p.specificationId) || undefined : undefined,
        specifications: p.specifications || undefined,
        sizeChart: scEntries,
        washCareInstructions: p.washCareInstructions || p.wash_care_instructions || [],
        customerOrderImages: p.customerOrderImages || p.customer_order_images || [],
        aplusContent: p.aplusContent || p.aplus_content || p.pageSections || p.page_sections || [],
        offers: p.offers || [],
        crossSellIds: (p.crossSellIds || p.cross_sell_ids || []).filter(Boolean),
        upsellIds: (p.upsellIds || p.upsell_ids || []).filter(Boolean),
        fbtIds: (p.fbtIds || p.fbt_ids || []).filter(Boolean),
        b2bPricing: p.b2bPricing || p.b2b_pricing || [],
      },
      scMode, scId,
      seo: {
        title: p.seo?.title || '',
        description: p.seo?.description || '',
        keywords: Array.isArray(p.seo?.keywords) ? p.seo.keywords.join(', ') : (p.seo?.keywords || ''),
        canonicalUrl: p.seo?.canonicalUrl || '',
        metaRobots: p.seo?.metaRobots || '',
        ogTitle: p.seo?.ogTitle || '',
        ogDescription: p.seo?.ogDescription || '',
        ogImage: p.seo?.ogImage || '',
      },
    };
  };

  const loadPrefilledData = (p: any) => {
    const { data, scMode, scId, seo } = mapProductToForm(p);
    setFormData(data);
    if (p.slug) { setSlug(p.slug); setSlugManuallyEdited(true); }
    setSeoData(seo);
    setSizeChartMode(scMode);
    setSelectedSizeChartId(scId || '');
  };

  const fetchProduct = async () => {
    setLoading(true);
    try {
      if (!id) throw new Error('No product ID');
      let response: any;
      if (isSlugParam) {
        const raw = await productsAPI.getBySlug(id);
        response = { success: true, data: raw };
      } else {
        const cleanId = extractObjectId(id) || id!;
        response = await productsAPI.getById(cleanId);
      }
      let product = response?.success && response?.data ? response.data : response?.data || response;
      if (!product) throw new Error('Product not found');

      const { data, scMode, scId, seo } = mapProductToForm(product);
      setFormData(data);
      setSlug(product.slug ? String(product.slug) : slugifyValue(product.name || ''));
      setSlugManuallyEdited(true);
      setSeoData(seo);
      setSizeChartMode(scMode);
      setSelectedSizeChartId(scId || '');
      if (seo.canonicalUrl || seo.metaRobots || seo.ogTitle || seo.ogDescription || seo.ogImage) setShowAdvancedSeo(true);
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || 'Failed to load product');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  // ── uploads ────────────────────────────────────────────────────────────────

  // The API response interceptor unwraps { success, data } → data, so uploadMultiple
  // returns { files: [...] } (not { data: { files } }). Handle every shape defensively.
  const extractUploadedUrls = (res: any): string[] => {
    const files = res?.files || res?.data?.files || res?.urls || res?.data?.urls || [];
    return (Array.isArray(files) ? files : []).map((f: any) => (typeof f === 'string' ? f : f?.url)).filter(Boolean);
  };

  // Update state AND the ref synchronously — handleSubmit reads formDataRef.current,
  // so uploaded media must land in the ref immediately (don't wait for the sync effect).
  const applyFormData = (updater: (prev: any) => any) => {
    setFormData(prev => { const next = updater(prev); formDataRef.current = next; return next; });
  };

  const handleMultipleImageUpload = async (files: FileList) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadMultiple(imgs, 'products/gallery');
      const urls = extractUploadedUrls(res);
      if (urls.length) applyFormData(prev => ({ ...prev, images: [...prev.images, ...urls] }));
    } catch (e: any) { alert(e.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDescriptionImageUpload = async (files: FileList) => {
    const file = files[0];
    if (!file?.type.startsWith('image/')) return;
    setUploadingBanner(true);
    try {
      const res = await uploadAPI.uploadSingle(file, 'products/banners');
      const url = res?.url || res?.data?.url || res?.data?.data?.url;
      if (url) applyFormData(prev => ({ ...prev, descriptionImage: url }));
    } catch (e: any) { alert(e.response?.data?.message || 'Upload failed'); }
    finally { setUploadingBanner(false); }
  };

  const handleCustomerOrderImagesUpload = async (files: FileList) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploadingCustomer(true);
    try {
      const res = await uploadAPI.uploadMultiple(imgs, 'products/customer-photos');
      const urls = extractUploadedUrls(res);
      if (urls.length) applyFormData(prev => ({ ...prev, customerOrderImages: [...prev.customerOrderImages, ...urls] }));
    } catch (e: any) { alert(e.response?.data?.message || 'Upload failed'); }
    finally { setUploadingCustomer(false); }
  };

  const handleVideoFileUpload = async (files: FileList) => {
    // Accept video files (mp4/mov/webm…) — the backend skips image optimization for these.
    const vids = Array.from(files || []).filter(f => f.type.startsWith('video/'));
    if (!vids.length) return;
    setUploadingVideo(true);
    try {
      const res = await uploadAPI.uploadMultiple(vids, 'products/videos');
      const urls = extractUploadedUrls(res);
      if (urls.length) applyFormData(prev => ({ ...prev, videos: [...prev.videos, ...urls] }));
    } catch (e: any) { alert(e.response?.data?.message || 'Video upload failed'); }
    finally { setUploadingVideo(false); }
  };

  const addVideoUrl = () => {
    const url = prompt('Enter video URL (YouTube, Vimeo, or direct):');
    if (url?.trim()) setFormData(prev => ({ ...prev, videos: [...prev.videos, url.trim()] }));
  };

  // ── size chart ─────────────────────────────────────────────────────────────

  const selectedSizeChart = useMemo(() =>
    availableSizeCharts.find(c => c._id === selectedSizeChartId),
    [availableSizeCharts, selectedSizeChartId]);

  const handleSizeChartModeChange = (mode: 'none' | 'reference' | 'custom') => {
    setSizeChartMode(mode);
    setErrors(prev => ({ ...prev, sizeChart: '' }));
    if (mode === 'none') setSelectedSizeChartId('');
    else if (mode === 'reference' && !selectedSizeChartId && availableSizeCharts.length) setSelectedSizeChartId(availableSizeCharts[0]._id);
    else if (mode === 'custom' && !formData.sizeChart.length) setFormData(p => ({ ...p, sizeChart: [{ ...emptySizeChartEntry }] }));
  };

  const handleSelectSizeChartId = (chartId: string) => {
    const nid = normalizeCategoryId(chartId);
    if (nid) { setSelectedSizeChartId(nid); setErrors(prev => ({ ...prev, sizeChart: '' })); }
  };

  // ── export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const data = { ...formDataRef.current, slug, seo: seoData, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `product-${slug || 'draft'}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── validation ─────────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = 'Product name is required';
    if (!formData.price || parseFloat(formData.price) <= 0) e.price = 'Valid price is required';
    if (!formData.originalPrice || parseFloat(formData.originalPrice) <= 0) e.originalPrice = 'Valid MRP is required';
    if (parseFloat(formData.originalPrice) < parseFloat(formData.price)) e.originalPrice = 'MRP must be ≥ selling price';
    // Sale price rules: needs a start date/time, must be below selling price, end after start.
    if (formData.salePrice && parseFloat(formData.salePrice) > 0) {
      if (parseFloat(formData.salePrice) >= parseFloat(formData.price)) e.salePrice = 'Sale price must be below the selling price';
      if (!formData.saleStartsAt) e.saleStartsAt = 'Start date & time is required for a sale';
      if (formData.saleEndsAt && formData.saleStartsAt && new Date(formData.saleEndsAt) <= new Date(formData.saleStartsAt)) {
        e.saleEndsAt = 'Sale end must be after the start';
      }
    }
    if (!formData.categories.length) e.categories = 'Select at least one category';
    if (!formData.weight || isNaN(parseFloat(formData.weight)) || parseFloat(formData.weight) <= 0) e.weight = 'Weight is required';
    if (!formData.length || isNaN(parseFloat(formData.length)) || parseFloat(formData.length) <= 0) e.length = 'Length is required';
    if (!formData.breadth || isNaN(parseFloat(formData.breadth)) || parseFloat(formData.breadth) <= 0) e.breadth = 'Breadth is required';
    if (!formData.height || isNaN(parseFloat(formData.height)) || parseFloat(formData.height) <= 0) e.height = 'Height is required';
    if (sizeChartMode === 'reference' && !selectedSizeChartId) e.sizeChart = 'Select a size chart';
    if (sizeChartMode === 'custom' && formData.sizeChart.some(en => !en.size?.trim())) e.sizeChart = 'Each size entry needs a value';
    const ns = slugifyValue(slug);
    if (!ns) e.slug = 'Slug is required';
    else if (ns.length > SLUG_MAX_LENGTH) e.slug = `Slug too long (max ${SLUG_MAX_LENGTH} chars)`;
    else if (slug !== ns) e.slug = 'Slug has invalid characters';
    if (seoData.title.trim().length > META_TITLE_LIMIT) e.metaTitle = `Meta title max ${META_TITLE_LIMIT} chars`;
    if (seoData.description.trim().length > META_DESCRIPTION_LIMIT) e.metaDescription = `Meta description max ${META_DESCRIPTION_LIMIT} chars`;
    setErrors(e);
    if (Object.keys(e).length) window.scrollTo({ top: 0, behavior: 'smooth' });
    return Object.keys(e).length === 0;
  };

  // ── submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const fd = formDataRef.current;

      const cleanedAttributeIds = (fd.attributeIds || []).map(normalizeCategoryId).filter((x): x is string => x !== null);
      let productType: 'single' | 'variation' = fd.productType || 'single';

      let cleanedVariations: any[] | undefined;
      if (Array.isArray(fd.variations) && fd.variations.length > 0) {
        cleanedVariations = fd.variations
          .filter(v => ((v.attributes && Object.keys(v.attributes).length > 0) || v.brandId) && v.sku?.trim())
          .map(v => {
            const attrs: Record<string, string> = {};
            for (const [k, val] of Object.entries(v.attributes || {})) {
              const nk = k.toLowerCase().trim(); const nv = String(val).toLowerCase().trim();
              if (nk && nv) attrs[nk] = nv;
            }
            if (!Object.keys(attrs).length && !v.brandId) return null;
            const pld: Record<string, any> = {
              attributes: attrs,
              sku: v.sku.trim().toUpperCase().slice(0, 48),
              stock: Math.max(0, v.stock || 0),
              isActive: v.isActive !== false,
            };
            // Send the real UUID for existing variations so the backend UPDATES them
            // instead of re-INSERTing (which violates the unique SKU constraint).
            if (v.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v.id))) pld.id = v.id;
            if (v.brandId) pld.brandId = v.brandId;   // → primary_brand_id via backend mapper
            if (v.price != null) pld.price = Math.max(0, v.price);
            if (v.originalPrice != null) pld.originalPrice = Math.max(0, v.originalPrice);
            if (v.images?.length) pld.images = v.images;
            if (v.shortDescription?.trim()) pld.shortDescription = v.shortDescription.trim();
            return pld;
          })
          .filter((v): v is any => v !== null);
      } else if (productType === 'variation') {
        cleanedVariations = [];
      }

      if (cleanedVariations?.length) productType = 'variation';
      else if (cleanedAttributeIds.length) productType = 'variation';
      else if (!cleanedVariations?.length && !cleanedAttributeIds.length) productType = 'single';

      const ns = slugifyValue(slug); setSlug(ns);

      const sanitizedCategories = (fd.categories || []).map(normalizeCategoryId).filter((x): x is string => x !== null);

      let stockData: number | undefined;
      if ((!cleanedVariations?.length) && fd.stock != null) {
        const s = Math.max(0, Math.floor(fd.stock));
        if (s > 0) stockData = s;
      }

      const sizeChartPayload = sizeChartMode === 'reference'
        ? (normalizeCategoryId(selectedSizeChartId) || null)
        : sizeChartMode === 'custom'
          ? fd.sizeChart.filter(en => en.size?.trim()).map(en => { const t: Record<string, string> = {}; Object.entries(en).forEach(([k, v]) => { if (v?.trim()) t[k] = v.trim(); }); return t; })
          : null;

      const kws = seoData.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 20);
      const seoPld: Record<string, any> = {};
      if (seoData.title.trim()) seoPld.title = seoData.title.trim().slice(0, META_TITLE_LIMIT);
      if (seoData.description.trim()) seoPld.description = seoData.description.trim().slice(0, META_DESCRIPTION_LIMIT);
      if (kws.length) seoPld.keywords = kws;
      if (seoData.canonicalUrl.trim()) seoPld.canonicalUrl = seoData.canonicalUrl.trim();
      if (seoData.metaRobots.trim()) seoPld.metaRobots = seoData.metaRobots.trim();
      if (seoData.ogTitle.trim()) seoPld.ogTitle = seoData.ogTitle.trim();
      if (seoData.ogDescription.trim()) seoPld.ogDescription = seoData.ogDescription.trim();
      if (seoData.ogImage.trim()) seoPld.ogImage = seoData.ogImage.trim();

      // Sync country_of_origin from the compliance section → product column (for filtering/back-compat)
      const complianceCountry = (fd.specifications || [])
        .find((s: any) => s.key === 'compliance')?.items
        ?.find((i: any) => i.key === 'country_of_origin')?.value;

      const payload: Record<string, any> = {
        name: fd.name, title: fd.title || undefined, slug: ns,
        sku: fd.sku?.trim().toUpperCase() || undefined,
        price: parseFloat(fd.price), originalPrice: parseFloat(fd.originalPrice),
        salePrice: fd.salePrice ? parseFloat(fd.salePrice) : null,
        saleStartsAt: fd.saleStartsAt || null, saleEndsAt: fd.saleEndsAt || null,
        description: fd.description, richDescription: fd.richDescription,
        descriptionImage: fd.descriptionImage || undefined,
        images: fd.images, videos: fd.videos.filter(v => v.trim()),
        brandId: fd.brandId || null, manufacturerId: fd.manufacturerId || null,
        returnPolicyId: fd.returnPolicyId || null,
        taxRuleId: fd.taxRuleId?.trim() || null, hsnCode: fd.hsnCode || undefined,
        stock: stockData,
        weight: parseFloat(fd.weight) || 0.5, length: parseFloat(fd.length) || 10,
        breadth: parseFloat(fd.breadth) || 10, height: parseFloat(fd.height) || 5,
        countryOfOrigin: complianceCountry || fd.countryOfOrigin || undefined,
        modelNumber: fd.modelNumber || undefined,
        licenseNumber: fd.licenseNumber || undefined,
        expiryMonths: fd.expiryMonths || undefined,
        isActive: fd.isActive, isFeatured: fd.isFeatured, isDigital: fd.isDigital,
        requiresPrescription: fd.requiresPrescription,
        disableVariants: fd.disableVariants, showOutOfStockVariants: fd.showOutOfStockVariants,
        showFeatures: fd.showFeatures,
        productType,
        attributeIds: productType === 'variation' ? cleanedAttributeIds : undefined,
        variations: productType === 'variation' ? (cleanedVariations ?? []) : undefined,
        categories: sanitizedCategories, featuredCategory: fd.featuredCategory || null,
        tags: fd.tags.map(t => (typeof t === 'object' && t._id ? t._id : t)).filter(Boolean),
        ...(fd.specificationId ? { specificationId: fd.specificationId } : {}),
        ...(fd.specifications ? { specifications: fd.specifications } : {}),
        sizeChart: sizeChartPayload,
        washCareInstructions: fd.washCareInstructions.filter(i => i.text.trim()),
        customerOrderImages: fd.customerOrderImages,
        aplusContent: fd.aplusContent, pageSections: fd.aplusContent,
        offers: fd.offers,
        crossSellIds: fd.crossSellIds, upsellIds: fd.upsellIds, fbtIds: fd.fbtIds,
        b2bPricing: fd.b2bPricing,
        seo: Object.keys(seoPld).length ? seoPld : null,
      };

      if (isEdit) await productsAPI.update(id!, payload);
      else await productsAPI.create(payload);

      navigate('/products');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // ── loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full">

      {/* Modals */}
      {showCreateCategory && (
        <QuickCreateCategoryModal
          availableParents={availableCategories}
          onClose={() => setShowCreateCategory(false)}
          onCreated={cat => {
            const nid = normalizeCategoryId(cat._id);
            if (nid) {
              setAvailableCategories(prev => [...prev, { ...cat, _id: nid }]);
              setFormData(prev => { const next = { ...prev, categories: [...prev.categories, nid] }; formDataRef.current = next; return next; });
            }
          }}
        />
      )}
      {showCreateTag && (
        <QuickCreateTagModal
          onClose={() => setShowCreateTag(false)}
          onCreated={tag => {
            const nid = normalizeCategoryId(tag._id);
            if (nid) {
              setAvailableTags(prev => [...prev, { ...tag, _id: nid }]);
              setFormData(prev => ({ ...prev, tags: [...prev.tags, nid] }));
            }
          }}
        />
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => navigate('/products')} className="text-gray-500 hover:text-gray-800 shrink-0">
            <FaArrowLeft />
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {isEdit ? 'Edit Product' : 'New Product'}
          </h1>
          {isEdit && slug && (
            <span className="hidden sm:block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-mono truncate max-w-48">{slug}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEdit && (
            <button type="button" onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
              <FaDownload className="text-xs" /> Export
            </button>
          )}
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Product'}
          </button>
          <button type="button" onClick={() => navigate('/products')}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            Cancel
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4 items-start">

          {/* ══ LEFT: All Media ══════════════════════════════════════════════ */}
          {/* Each column scrolls independently on its own hover: sticky + overflow-y-auto
              keeps the other two columns visually still, overscroll-contain stops the
              wheel from bleeding into the page scroll once a column hits its end. */}
          <div className={`col-span-12 lg:col-span-4 xl:col-span-4 space-y-4 ${SCROLL_COL_CLS}`}>
            <ProductMediaPanel
              images={formData.images}
              descriptionImage={formData.descriptionImage}
              videos={formData.videos}
              customerOrderImages={formData.customerOrderImages}
              uploading={uploading}
              uploadingBanner={uploadingBanner}
              uploadingCustomer={uploadingCustomer}
              uploadingVideo={uploadingVideo}
              onImagesChange={imgs => setFormData(p => ({ ...p, images: imgs }))}
              onDescriptionImageChange={img => setFormData(p => ({ ...p, descriptionImage: img }))}
              onVideosChange={vids => setFormData(p => ({ ...p, videos: vids }))}
              onCustomerOrderImagesChange={imgs => setFormData(p => ({ ...p, customerOrderImages: imgs }))}
              onImageUpload={handleMultipleImageUpload}
              onDescriptionImageUpload={handleDescriptionImageUpload}
              onCustomerOrderImagesUpload={handleCustomerOrderImagesUpload}
              onVideoFileUpload={handleVideoFileUpload}
              onAddVideoUrl={addVideoUrl}
              errors={{ images: errors.images }}
            />
          </div>

          {/* ══ CENTER: Main Content ═════════════════════════════════════════ */}
          <div className={`col-span-12 lg:col-span-5 xl:col-span-5 space-y-4 ${SCROLL_COL_CLS}`}>

            {/* Basic Info */}
            <ProductBasicInfo
              name={formData.name} title={formData.title}
              description={formData.description} richDescription={formData.richDescription}
              onNameChange={v => { setFormData(p => ({ ...p, name: v })); setErrors(prev => ({ ...prev, name: '' })); }}
              onTitleChange={v => setFormData(p => ({ ...p, title: v }))}
              onDescriptionChange={v => setFormData(p => ({ ...p, description: v }))}
              onRichDescriptionChange={v => setFormData(p => ({ ...p, richDescription: v }))}
              errors={{ name: errors.name }}
            />

            {/* Compliance & Specifications (config-driven by store vertical) */}
            <ProductComplianceSections
              config={productConfig}
              value={(formData.specifications as unknown as SpecSectionValue[]) || []}
              onChange={secs => setFormData(p => ({ ...p, specifications: secs as any }))}
              manufacturers={availableManufacturers}
            />

            {/* Additional Specifications (free-form) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Additional Specifications</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Linked Template</label>
                  <select value={formData.specificationId || ''} onChange={e => setFormData(p => ({ ...p, specificationId: e.target.value || undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                    <option value="">None</option>
                    {availableSpecifications.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700">Inline Specs</label>
                    <button type="button" onClick={() => setFormData(p => ({ ...p, specifications: [...(p.specifications || []), { heading: '', items: [{ key: '', value: '' }] }] }))}
                      className="text-xs text-blue-600 hover:text-blue-800">+ Add Section</button>
                  </div>
                  {(formData.specifications || []).map((sec, si) => (
                    <div key={si} className="mb-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex gap-2 mb-2">
                        <input value={sec.heading} onChange={e => { const s = [...(formData.specifications || [])]; s[si] = { ...sec, heading: e.target.value }; setFormData(p => ({ ...p, specifications: s })); }}
                          placeholder="Section heading" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                        <button type="button" onClick={() => { const s = [...(formData.specifications || [])]; s.splice(si, 1); setFormData(p => ({ ...p, specifications: s.length ? s : undefined })); }}
                          className="text-xs text-red-500">Remove</button>
                      </div>
                      {sec.items.map((item, ii) => (
                        <div key={ii} className="flex gap-2 mb-1.5">
                          <input value={item.key} onChange={e => { const s = [...(formData.specifications || [])]; const items = [...sec.items]; items[ii] = { ...item, key: e.target.value }; s[si] = { ...sec, items }; setFormData(p => ({ ...p, specifications: s })); }}
                            placeholder="Key" className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                          <input value={item.value} onChange={e => { const s = [...(formData.specifications || [])]; const items = [...sec.items]; items[ii] = { ...item, value: e.target.value }; s[si] = { ...sec, items }; setFormData(p => ({ ...p, specifications: s })); }}
                            placeholder="Value" className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                          <button type="button" onClick={() => { const s = [...(formData.specifications || [])]; const items = sec.items.filter((_, j) => j !== ii); s[si] = { ...sec, items: items.length ? items : [{ key: '', value: '' }] }; setFormData(p => ({ ...p, specifications: s })); }}
                            disabled={sec.items.length === 1} className="text-xs text-red-400 disabled:opacity-30">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => { const s = [...(formData.specifications || [])]; s[si] = { ...sec, items: [...sec.items, { key: '', value: '' }] }; setFormData(p => ({ ...p, specifications: s })); }}
                        className="text-xs text-blue-600">+ Add Row</button>
                    </div>
                  ))}
                  {!formData.specifications?.length && (
                    <button type="button" onClick={() => setFormData(p => ({ ...p, specifications: [{ heading: '', items: [{ key: '', value: '' }] }] }))}
                      className="w-full py-2 border-2 border-dashed border-gray-200 rounded text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500">
                      + Create Inline Specifications
                    </button>
                  )}
                  {(formData.specificationId || formData.specifications) && (
                    <button type="button" onClick={() => setFormData(p => ({ ...p, specificationId: undefined, specifications: undefined }))}
                      className="mt-1 text-xs text-red-500 hover:text-red-700">Clear specifications</button>
                  )}
                </div>
              </div>
            </div>

            {/* Product Type */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Product Type</h2>
              <div className="flex gap-3">
                {(['single', 'variation'] as const).map(type => (
                  <label key={type} className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 flex-1 gap-3"
                    style={{ borderColor: formData.productType === type ? '#EF4444' : '#E5E7EB' }}>
                    <input type="radio" name="productType" value={type} checked={formData.productType === type}
                      onChange={() => setFormData(p => ({ ...p, productType: type, ...(type === 'single' ? { variations: [], attributeIds: [], selectedAttributeValues: {} } : {}) }))}
                      className="w-4 h-4 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{type === 'single' ? 'Simple Product' : 'Variable Product'}</p>
                      <p className="text-xs text-gray-400">{type === 'single' ? 'Single price & stock' : 'Multiple variations (size, color…)'}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {formData.productType === 'single' && (
              <ProductAttributes
                selectedAttributeIds={formData.attributeIds}
                selectedAttributeValues={formData.selectedAttributeValues || {}}
                onAttributeIdsChange={ids => setFormData(p => ({ ...p, attributeIds: ids }))}
                onAttributeValuesChange={values => setFormData(p => ({ ...p, selectedAttributeValues: values }))}
                allowVariations={false}
              />
            )}

            {formData.productType === 'variation' && (
              <ProductAttributeVariations
                selectedAttributeIds={formData.attributeIds}
                selectedAttributeValues={formData.selectedAttributeValues || {}}
                onAttributeIdsChange={ids => setFormData(p => ({ ...p, attributeIds: ids }))}
                onAttributeValuesChange={values => setFormData(p => ({ ...p, selectedAttributeValues: values }))}
                variations={formData.variations}
                onVariationsChange={v => setFormData(p => ({ ...p, variations: v }))}
                productSlug={isEdit ? (isSlugParam ? id : slug) : undefined}
                baseSku={formData.sku || slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD'}
                basePrice={parseFloat(formData.price) || 0}
                baseOriginalPrice={parseFloat(formData.originalPrice) || 0}
                availableBrands={availableBrands}
                onRegenerateAllSkus={() => {
                  const base = formData.sku || slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD';
                  setFormData(p => ({ ...p, variations: p.variations.map((v, i) => ({ ...v, sku: `${base}-${Object.keys(v.attributes).join('-').toUpperCase().slice(0, 20)}-${i + 1}`.slice(0, 48) })) }));
                }}
                onVariationImageUpload={async (varId, files) => {
                  const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
                  if (!imgs.length) return;
                  setUploading(true);
                  try {
                    const res = await uploadAPI.uploadMultiple(imgs, 'products/variations');
                    const urls = extractUploadedUrls(res);
                    if (urls.length) applyFormData(p => ({ ...p, variations: p.variations.map((v: any) => v.id === varId ? { ...v, images: [...(v.images || []), ...urls] } : v) }));
                  } catch { alert('Image upload failed'); } finally { setUploading(false); }
                }}
                onRemoveVariationImage={(varId, imgIdx) => {
                  setFormData(p => ({ ...p, variations: p.variations.map(v => v.id === varId ? { ...v, images: (v.images || []).filter((_, i) => i !== imgIdx) } : v) }));
                }}
                uploading={uploading}
              />
            )}

            {/* A+ Content */}
            <ProductContentSections
              blocks={formData.aplusContent}
              onChange={blocks => applyFormData(p => ({ ...p, aplusContent: blocks }))}
              productId={id}
            />

            {/* Offers */}
            <ProductOffers
              offers={formData.offers}
              onChange={offers => setFormData(p => ({ ...p, offers }))}
            />

            {/* Related */}
            <ProductRelated
              crossSellIds={formData.crossSellIds}
              upsellIds={formData.upsellIds}
              fbtIds={formData.fbtIds}
              onCrossSellChange={ids => setFormData(p => ({ ...p, crossSellIds: ids }))}
              onUpsellChange={ids => setFormData(p => ({ ...p, upsellIds: ids }))}
              onFbtChange={ids => setFormData(p => ({ ...p, fbtIds: ids }))}
              currentProductId={id}
            />

            {/* SEO */}
            <ProductSEO
              sku={formData.sku} slug={slug} seoData={seoData}
              showAdvancedSeo={showAdvancedSeo} websiteUrl={websiteUrl}
              productId={id} productName={formData.name} showSku={false}
              onSkuChange={v => setFormData(p => ({ ...p, sku: v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48) }))}
              onSlugChange={v => { setSlugManuallyEdited(true); setSlug(slugifyValue(v)); setErrors(prev => ({ ...prev, slug: '' })); }}
              onSlugReset={() => { setSlug(slugifyValue(formData.name || '')); setSlugManuallyEdited(false); setErrors(prev => ({ ...prev, slug: '' })); }}
              onSeoDataChange={setSeoData}
              onShowAdvancedSeoToggle={() => setShowAdvancedSeo(v => !v)}
              errors={errors}
            />

            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">Bundles</span> are managed under <span className="font-medium">Products → Bundles</span>.
                Bundles linked to this product continue to work automatically.
              </p>
            </div>
          </div>

          {/* ══ RIGHT: Settings ══════════════════════════════════════════════ */}
          <div className={`col-span-12 lg:col-span-3 space-y-4 ${SCROLL_COL_CLS}`}>

            {/* Publish */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Status</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(p => ({ ...p, isActive: e.target.checked }))} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                </label>
              </div>
              <p className="text-xs text-gray-400 mb-3">{formData.isActive ? 'Active — visible on storefront' : 'Draft — hidden from customers'}</p>
              <button type="submit" disabled={saving}
                className="w-full py-2 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Saving…' : isEdit ? 'Update Product' : 'Create Product'}
              </button>
            </div>

            {/* Pricing */}
            <ProductPricing
              price={formData.price} originalPrice={formData.originalPrice}
              salePrice={formData.salePrice} saleStartsAt={formData.saleStartsAt} saleEndsAt={formData.saleEndsAt}
              sku={formData.sku} hsnCode={formData.hsnCode} taxRuleId={formData.taxRuleId} taxRules={availableTaxRules}
              stock={formData.stock} showStock={formData.productType === 'single'}
              weight={formData.weight} length={formData.length} breadth={formData.breadth} height={formData.height}
              onPriceChange={v => { setFormData(p => ({ ...p, price: v })); setErrors(prev => ({ ...prev, price: '' })); }}
              onOriginalPriceChange={v => { setFormData(p => ({ ...p, originalPrice: v })); setErrors(prev => ({ ...prev, originalPrice: '' })); }}
              onSalePriceChange={v => setFormData(p => ({ ...p, salePrice: v }))}
              onSaleStartsAtChange={v => setFormData(p => ({ ...p, saleStartsAt: v }))}
              onSaleEndsAtChange={v => setFormData(p => ({ ...p, saleEndsAt: v }))}
              onSkuChange={v => setFormData(p => ({ ...p, sku: v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48) }))}
              onHsnCodeChange={v => setFormData(p => ({ ...p, hsnCode: v }))}
              onTaxRuleIdChange={v => setFormData(p => ({ ...p, taxRuleId: v }))}
              onStockChange={v => setFormData(p => ({ ...p, stock: v }))}
              onWeightChange={v => setFormData(p => ({ ...p, weight: v }))}
              onLengthChange={v => setFormData(p => ({ ...p, length: v }))}
              onBreadthChange={v => setFormData(p => ({ ...p, breadth: v }))}
              onHeightChange={v => setFormData(p => ({ ...p, height: v }))}
              errors={errors}
            />

            {/* Brand & Manufacturer */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Brand & Manufacturer</h3>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Brand</label>
                <select value={formData.brandId} onChange={e => setFormData(p => ({ ...p, brandId: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                  <option value="">None</option>
                  {availableBrands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Manufacturer</label>
                <select value={formData.manufacturerId} onChange={e => setFormData(p => ({ ...p, manufacturerId: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                  <option value="">None</option>
                  {availableManufacturers.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
                {!availableManufacturers.length && <p className="text-xs text-gray-400 mt-0.5">Add in Settings → Manufacturers</p>}
              </div>
            </div>

            {/* Categories */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
                <button type="button" onClick={() => setShowCreateCategory(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ New</button>
              </div>
              <ProductCategories
                categories={formData.categories}
                featuredCategory={formData.featuredCategory}
                availableCategories={availableCategories}
                onCategoriesChange={categories => {
                  setFormData(prev => { const next = { ...prev, categories }; formDataRef.current = next; return next; });
                }}
                onFeaturedCategoryChange={catId => setFormData(p => ({ ...p, featuredCategory: catId || '' }))}
                onRefresh={loadLookups}
                loading={lookupsLoading}
                error={errors.categories}
              />
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Tags</h3>
                <button type="button" onClick={() => setShowCreateTag(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ New Tag</button>
              </div>
              <ProductTags
                tags={formData.tags}
                availableTags={availableTags}
                onTagsChange={tags => setFormData(p => ({ ...p, tags }))}
                onRefresh={loadLookups}
                loading={lookupsLoading}
                error={errors.tags}
              />
            </div>

            {/* Return Policy */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Return Policy</h3>
              <select value={formData.returnPolicyId} onChange={e => setFormData(p => ({ ...p, returnPolicyId: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                <option value="">Default (store policy)</option>
                {availableReturnPolicies.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
              {!availableReturnPolicies.length && <p className="text-xs text-gray-400 mt-1">Add in Settings → Return Policies</p>}
            </div>

            {/* Shelf Life (kept here; full compliance fields are in the config-driven section) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <label className="text-xs font-medium text-gray-600 block mb-0.5">Shelf Life (months)</label>
              <input type="number" min="1" value={formData.expiryMonths || ''}
                onChange={e => setFormData(p => ({ ...p, expiryMonths: e.target.value ? parseInt(e.target.value) : undefined }))}
                placeholder="24"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
              <p className="text-xs text-gray-400 mt-1">Country of origin, manufacturer, packed/imported by etc. are in the Compliance section.</p>
            </div>

            {/* Display Options */}
            <ProductDisplayOptions
              disableVariants={formData.disableVariants}
              showOutOfStockVariants={formData.showOutOfStockVariants}
              showFeatures={formData.showFeatures}
              isActive={formData.isActive}
              isFeatured={formData.isFeatured}
              isDigital={formData.isDigital}
              requiresPrescription={formData.requiresPrescription}
              onDisableVariantsChange={v => setFormData(p => ({ ...p, disableVariants: v }))}
              onShowOutOfStockVariantsChange={v => setFormData(p => ({ ...p, showOutOfStockVariants: v }))}
              onShowFeaturesChange={v => setFormData(p => ({ ...p, showFeatures: v }))}
              onIsActiveChange={v => setFormData(p => ({ ...p, isActive: v }))}
              onIsFeaturedChange={v => setFormData(p => ({ ...p, isFeatured: v }))}
              onIsDigitalChange={v => setFormData(p => ({ ...p, isDigital: v }))}
              onRequiresPrescriptionChange={v => setFormData(p => ({ ...p, requiresPrescription: v }))}
            />

            {/* B2B Pricing — hidden when the B2B module is disabled for this store */}
            {canAccess('b2b') && (
              <ProductB2BPricing
                tiers={formData.b2bPricing}
                onChange={tiers => setFormData(p => ({ ...p, b2bPricing: tiers }))}
              />
            )}

            {/* Size Chart — hidden when the Size Charts module is disabled for this store */}
            {canAccess('size_charts') && (
              <ProductSizeChart
                mode={sizeChartMode}
                selectedSizeChartId={selectedSizeChartId}
                sizeChart={formData.sizeChart}
                availableSizeCharts={availableSizeCharts}
                selectedSizeChart={selectedSizeChart}
                onModeChange={handleSizeChartModeChange}
                onSelectedSizeChartIdChange={handleSelectSizeChartId}
                onSizeChartChange={entries => setFormData(p => ({ ...p, sizeChart: entries }))}
                onRefresh={loadLookups}
                loading={lookupsLoading}
                error={errors.sizeChart}
              />
            )}

            {/* Wash Care */}
            <ProductWashCare
              instructions={formData.washCareInstructions}
              onInstructionsChange={instructions => setFormData(p => ({ ...p, washCareInstructions: instructions }))}
              productId={id}
              productName={formData.name}
            />

          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
