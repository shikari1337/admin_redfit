import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  productsAPI, uploadAPI, categoriesAPI, sizeChartsAPI, specificationsAPI,
  tagsAPI, taxRulesAPI, brandsAPI, manufacturersAPI, returnPoliciesAPI, faqGroupsAPI, productConfigAPI,
} from '../services/api';
import ProductComplianceSections, { ProductConfig, SpecSectionValue } from '../components/product/ProductComplianceSections';
import api from '../services/api';
import { FaArrowLeft, FaCopy, FaDownload } from 'react-icons/fa';
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
import ProductMedicalPanel from '../components/product/ProductMedicalPanel';
import ProductVariantGroupPanel from '../components/product/ProductVariantGroupPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { ContentBlock } from '../components/product/ProductContentSections';
import type { B2BPricingTier } from '../components/product/ProductB2BPricing';
import type { ProductOffer } from '../components/product/ProductOffers';
import { normalizeSpecifications, normalizeContentBlocks, serializeContentBlocks } from '../lib/productNormalize';
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

/** The form's tab shell. Module-gated tabs (Content, Variants, B2B, Medical)
 *  are dropped from the bar entirely when hidden. */
type TabId = 'general' | 'pricing' | 'media' | 'content' | 'variants' | 'related' | 'b2b' | 'medical' | 'seo' | 'settings';

/** validateForm error key → the tab that hosts the failing field, so a failed
 *  save NAVIGATES to the right tab before scrolling. */
const ERROR_TAB_MAP: Record<string, TabId> = {
  name: 'general', categories: 'general', tags: 'general',
  price: 'pricing', originalPrice: 'pricing', salePrice: 'pricing',
  saleStartsAt: 'pricing', saleEndsAt: 'pricing',
  weight: 'pricing', length: 'pricing', breadth: 'pricing', height: 'pricing',
  images: 'media',
  sizeChart: 'related',
  slug: 'seo', metaTitle: 'seo', metaDescription: 'seo',
};

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

  const { canAccess, storeModules } = useAuth();
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
    brandId: '', manufacturerId: '', returnPolicyId: '', faqGroupId: '',
    categories: [] as string[], featuredCategory: '',
    tags: [] as Array<string | { _id: string; name: string }>,
    weight: '0.5', length: '10', breadth: '10', height: '5',
    countryOfOrigin: '', modelNumber: '', licenseNumber: '',
    expiryMonths: undefined as number | undefined,
    packSize: 1, soldAsPack: false,
    isActive: true, isFeatured: false, isDigital: false, requiresPrescription: false,
    disableVariants: false, showOutOfStockVariants: true,
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
  // Stock AS LOADED, keyed by variation id (plus the product-level value).
  // Stock is LEDGERED on the backend: the form must only send it when the
  // operator actually changed it — re-sending the loaded value on every save
  // used to clobber sales/receipts that happened while the form was open.
  const initialStockRef = useRef<{ product?: number; variations: Record<string, number> }>({ variations: {} });
  // The REAL product UUID (the URL param can be a slug — feeding a slug into
  // uuid-keyed endpoints like /b2b/contracts/product/:id 500s on the PG cast).
  const [resolvedProductId, setResolvedProductId] = useState<string>('');

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
  const [availableFaqGroups, setAvailableFaqGroups] = useState<Array<{ _id: string; name: string }>>([]);
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

  // ── tab shell state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('general');
  // Unsaved-changes hint: ANY formData change after hydration marks the form
  // dirty (amber dot on Save; Cancel asks for confirmation).
  const [dirty, setDirty] = useState(false);
  // `variant_group` from the admin product detail (additive backend field) —
  // feeds the Variants tab's linked-products manager.
  const [variantGroup, setVariantGroup] = useState<any>(null);
  const [duplicating, setDuplicating] = useState(false);
  // Programmatic hydrations (fetch/prefill) must NOT mark the form dirty —
  // each hydration bumps this counter and the dirty effect skips that change.
  const hydrateSkipRef = useRef(0);
  const firstFormChangeRef = useRef(true);

  useEffect(() => {
    if (firstFormChangeRef.current) { firstFormChangeRef.current = false; return; }
    if (hydrateSkipRef.current > 0) { hydrateSkipRef.current -= 1; return; }
    setDirty(true);
  }, [formData]);

  // If the active tab disappears (module toggled off, product type switched
  // away from Variable…) snap back to General instead of a blank page.
  useEffect(() => {
    const visible: Record<TabId, boolean> = {
      general: true, pricing: true, media: true,
      content: canAccess('product_specifications') || canAccess('aplus_content') || canAccess('wash_care'),
      variants: formData.productType === 'variation' || !!variantGroup,
      related: true,
      b2b: canAccess('b2b'),
      medical: canAccess('pharmacy_fields'),
      seo: true, settings: true,
    };
    if (!visible[activeTab]) setActiveTab('general');
  }, [activeTab, formData.productType, variantGroup, storeModules]); // eslint-disable-line

  // ── lookups ────────────────────────────────────────────────────────────────

  const loadLookups = async () => {
    setLookupsLoading(true);
    try {
      // allSettled — one failing endpoint must NOT blank every dropdown.
      // Module-gated lookups are skipped when their module is off: the request
      // would 403 and surface a "Feature not enabled" toast on PAGE LOAD for a
      // feature the merchant never touched.
      const settled = await Promise.allSettled([
        categoriesAPI.list(),
        canAccess('size_charts') ? sizeChartsAPI.list() : Promise.resolve([]),
        canAccess('product_specifications') ? specificationsAPI.getAll({ active: true }) : Promise.resolve([]),
        tagsAPI.getAll({ active: true }),
        canAccess('gst_tax') ? taxRulesAPI.getAll() : Promise.resolve([]),
        brandsAPI.list({ active: true }),
        manufacturersAPI.getAll({ active: true }),
        returnPoliciesAPI.getAll({ active: true }),
        canAccess('faqs') ? faqGroupsAPI.getAll({ active: true }) : Promise.resolve([]),
      ]);
      const val = (i: number) => (settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<any>).value : undefined);
      settled.forEach((s, i) => { if (s.status === 'rejected') console.error(`Lookup ${i} failed`, s.reason); });
      const [catRes, chartRes, specRes, tagsRes, taxRes, brandsRes, mfgRes, rpRes, faqGrpRes] =
        [val(0), val(1), val(2), val(3), val(4), val(5), val(6), val(7), val(8)];

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
      setAvailableFaqGroups(normList(faqGrpRes, g => ({ _id: g._id, name: g.name || g.title || 'FAQ group' })));
    } catch (e) {
      console.error('Lookups failed', e);
    } finally {
      setLookupsLoading(false);
    }
  };

  // Wait for the modules map before firing the module-gated lookups: on direct
  // navigation canAccess fails OPEN while /modules is in flight, so gated calls
  // (size-charts etc.) fired anyway, 403'd, and toasted "Feature not enabled"
  // on page load. Fallback: if modules never arrive (endpoint down), load after
  // 4s so the form still works.
  const lookupsFiredRef = useRef(false);
  useEffect(() => {
    if (lookupsFiredRef.current) return;
    if (Object.keys(storeModules).length > 0) {
      lookupsFiredRef.current = true;
      loadLookups();
      return;
    }
    const t = setTimeout(() => {
      if (!lookupsFiredRef.current) { lookupsFiredRef.current = true; loadLookups(); }
    }, 4000);
    return () => clearTimeout(t);
  }, [storeModules]);
  useEffect(() => { fetchWebsiteUrl(); }, []);
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
        // Short Description ↔ short_desc, Full Description ↔ rich_desc/long_desc.
        // (Historically the short field was mis-saved into long_desc; prefer the
        // correct columns first so fixed products round-trip cleanly.)
        description: p.short_desc || p.description || '',
        richDescription: p.rich_desc || p.long_desc || p.richDescription || '',
        descriptionImage: p.descriptionImage || p.description_image || '',
        images: p.images || [],
        videos: p.videos || [],
        stock: typeof p.stock === 'number' ? p.stock : undefined,
        brandId: p.brandId || p.brand_id || p.brand?._id || p.brand?.id || '',
        manufacturerId: p.manufacturerId || p.manufacturer_id || p.manufacturer?._id || p.manufacturer?.id || '',
        returnPolicyId: p.returnPolicyId || p.return_policy_id || p.returnPolicy?._id || '',
        faqGroupId: p.faqGroupId || p.faq_group_id || '',
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
        packSize: Number(p.packSize ?? p.pack_size ?? 1) || 1,
        soldAsPack: !!(p.soldAsPack ?? p.sold_as_pack),
        isActive: p.isActive !== false && p.is_active !== false,
        isFeatured: !!(p.isFeatured || p.is_featured),
        isDigital: !!(p.isDigital || p.is_digital),
        requiresPrescription: !!(p.requiresPrescription || p.requires_prescription),
        disableVariants: !!(p.disableVariants || p.disable_variants),
        showOutOfStockVariants: p.showOutOfStockVariants !== false && p.show_oos_variants !== false,
        // Trust the stored product_type; only REAL variation rows imply
        // 'variation' as a fallback. attributeIds must NOT — simple products
        // legitimately carry filter attributes (Woo model), and inferring
        // 'variation' from them re-typed every attributed single product.
        productType: (p.productType || p.product_type || (p.variations?.length ? 'variation' : 'single')) as 'single' | 'variation',
        attributeIds: p.attributeIds?.length ? p.attributeIds : (p.attributes || []).map((a: any) => a._id).filter(Boolean),
        // The detail API now returns which catalogue values each attribute uses
        // (from product_attributes + the variation JSONB) so the editor loads
        // populated instead of empty — an empty load here would wipe the
        // assignments on the next save.
        selectedAttributeValues: p.selectedAttributeValues || p.selected_attribute_values || {},
        variations: normalizeVariations(p.variations || []),
        specificationId: p.specificationId ? normalizeCategoryId(p.specificationId) || undefined : undefined,
        specifications: normalizeSpecifications(p.specifications),
        sizeChart: scEntries,
        washCareInstructions: p.washCareInstructions || p.wash_care_instructions || [],
        customerOrderImages: p.customerOrderImages || p.customer_order_images || [],
        // NEVER seed from pageSections/page_sections — that is the SEPARATE
        // storefront-layout column (gear icon → Sections Manager). Falling back
        // to it here adopted layout rows into the A+ editor and persisted them
        // into aplus_content on the next save (cross-column bleed).
        aplusContent: normalizeContentBlocks(p.aplusContent || p.aplus_content),
        offers: p.offers || [],
        crossSellIds: (p.crossSellIds || p.cross_sell_ids || []).filter(Boolean),
        upsellIds: (p.upsellIds || p.upsell_ids || []).filter(Boolean),
        fbtIds: (p.fbtIds || p.fbt_ids || []).filter(Boolean),
        // product_b2b_pricing rows come back snake_case — map to the component's shape.
        b2bPricing: (p.b2bPricing || p.b2b_pricing || []).map((s: any) => ({
          id: s.id,
          tierName: s.tier_name ?? s.tierName ?? '',
          variationId: s.variation_id ?? s.variationId ?? null,
          minQty: Number(s.min_qty ?? s.minQty ?? 1),
          maxQty: s.max_qty ?? s.maxQty ?? undefined,
          priceType: s.price_type ?? s.priceType ?? 'fixed',
          priceValue: Number(s.price_value ?? s.priceValue ?? 0),
          isActive: (s.is_active ?? s.isActive) !== false,
          validFrom: (s.valid_from ?? s.validFrom)?.slice?.(0, 10) || undefined,
          validUntil: (s.valid_until ?? s.validUntil)?.slice?.(0, 10) || undefined,
        })),
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

  // Remember stock AS LOADED (see initialStockRef) — keyed by variation UUID.
  const captureInitialStock = (p: any) => {
    const map: Record<string, number> = {};
    for (const v of p?.variations || []) {
      const vid = String(v.id || v._id || '');
      if (vid) map[vid] = Number(v.stock) || 0;
    }
    initialStockRef.current = {
      product: typeof p?.stock === 'number' ? p.stock : undefined,
      variations: map,
    };
  };

  const loadPrefilledData = (p: any) => {
    const { data, scMode, scId, seo } = mapProductToForm(p);
    hydrateSkipRef.current += 1; // programmatic hydration ≠ user edit
    setFormData(data);
    captureInitialStock(p);
    if (p.slug) { setSlug(p.slug); setSlugManuallyEdited(true); }
    setSeoData(seo);
    setSizeChartMode(scMode);
    setSelectedSizeChartId(scId || '');
    setDirty(false);
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
      hydrateSkipRef.current += 1; // programmatic hydration ≠ user edit
      setFormData(data);
      captureInitialStock(product);
      setResolvedProductId(String(product.id || product._id || ''));
      // Additive backend field: present when this product is in a variant group.
      setVariantGroup(product.variant_group || null);
      setSlug(product.slug ? String(product.slug) : slugifyValue(product.name || ''));
      setSlugManuallyEdited(true);
      setSeoData(seo);
      setSizeChartMode(scMode);
      setSelectedSizeChartId(scId || '');
      if (seo.canonicalUrl || seo.metaRobots || seo.ogTitle || seo.ogDescription || seo.ogImage) setShowAdvancedSeo(true);
      setDirty(false);
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

  // ── duplicate / cancel ─────────────────────────────────────────────────────

  // POST /products/:id/duplicate — the backend CREATES an inactive standalone
  // copy and returns it; jump straight into editing the copy.
  const handleDuplicateProduct = async () => {
    const pid = resolvedProductId || (id ?? '');
    if (!pid) return;
    setDuplicating(true);
    try {
      const created: any = await productsAPI.duplicateAsVariant(pid, {});
      const p = created?.id || created?.slug ? created : (created?.data ?? created);
      if (p?.slug || p?.id) {
        alert('Duplicate created as an inactive draft — you are now editing the copy.');
        navigate(`/products/${p.slug || p.id}/edit`);
      } else {
        alert('Duplicate failed — the server returned no product.');
      }
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to duplicate product');
    } finally {
      setDuplicating(false);
    }
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate('/products');
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
    const errKeys = Object.keys(e);
    if (errKeys.length) {
      // Jump to the tab that hosts the first failing field, then scroll up.
      setActiveTab(ERROR_TAB_MAP[errKeys[0]] || 'general');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return errKeys.length === 0;
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
              isActive: v.isActive !== false,
            };
            // Send the real UUID for existing variations so the backend UPDATES them
            // instead of re-INSERTing (which violates the unique SKU constraint).
            if (v.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v.id))) pld.id = v.id;
            // Stock is LEDGERED — only send it when the operator changed it here.
            // Re-sending the loaded value on every save would book a movement
            // over whatever sold/arrived while the form was open. New variations
            // (no UUID yet) always send it — that is their opening balance.
            const stockNow = Math.max(0, v.stock || 0);
            const stockLoaded = pld.id ? initialStockRef.current.variations[String(pld.id)] : undefined;
            if (!pld.id || stockLoaded === undefined || stockNow !== stockLoaded) pld.stock = stockNow;
            if (v.brandId) pld.brandId = v.brandId;   // → primary_brand_id via backend mapper
            if (v.price != null) pld.price = Math.max(0, v.price);
            if (v.originalPrice != null) pld.originalPrice = Math.max(0, v.originalPrice);
            if (v.images?.length) pld.images = v.images;
            if (v.shortDescription?.trim()) pld.shortDescription = v.shortDescription.trim();
            // Per-variation content typed in the inline editor — these columns
            // exist and VariationEditPage saves them; the inline editor's values
            // used to be silently discarded here.
            if (typeof v.name === 'string' && v.name.trim()) pld.name = v.name.trim();
            if (typeof v.slug === 'string' && v.slug.trim()) pld.slug = v.slug.trim();
            if (typeof v.description === 'string' && v.description.trim()) pld.description = v.description;
            if (typeof v.dosage === 'string' && v.dosage.trim()) pld.dosage = v.dosage;
            if (typeof v.importantInfo === 'string' && v.importantInfo.trim()) pld.importantInfo = v.importantInfo;
            // Per-variation categories — always send the array (even empty) so clearing
            // a variation's categories actually removes the links on the backend.
            if (Array.isArray(v.categories)) pld.categories = v.categories;
            return pld;
          })
          .filter((v): v is any => v !== null);
      } else if (productType === 'variation') {
        cleanedVariations = [];
      }

      // Only REAL variation rows force 'variation'. Filter attributes do NOT —
      // a simple product with attributeIds stays simple (the old
      // `attributeIds → variation` line silently converted every attributed
      // single product on save). With no variation rows, the user's explicit
      // radio choice stands (a mid-setup Variable product isn't flipped back).
      if (cleanedVariations?.length) productType = 'variation';

      const ns = slugifyValue(slug); setSlug(ns);

      const sanitizedCategories = (fd.categories || []).map(normalizeCategoryId).filter((x): x is string => x !== null);

      // Stock 0 is a legitimate value (out of stock) — it must reach the backend.
      // Only variation products skip product-level stock (variations own it).
      // Changed-only: an untouched value is omitted so an unrelated edit can
      // never overwrite stock that moved while the form was open.
      let stockData: number | undefined;
      if ((!cleanedVariations?.length) && fd.stock != null && Number.isFinite(fd.stock)) {
        const target = Math.max(0, Math.floor(fd.stock));
        if (initialStockRef.current.product === undefined || target !== initialStockRef.current.product) {
          stockData = target;
        }
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
        // Short Description → short_desc; Full Description → long_desc AND rich_desc
        // (the storefront reads whichever is present). The old `description` key
        // aliased to long_desc on the backend, so the short text was silently
        // written to the wrong column and short_desc stayed empty.
        shortDescription: fd.description,
        longDescription: fd.richDescription,
        richDescription: fd.richDescription,
        descriptionImage: fd.descriptionImage || undefined,
        images: fd.images, videos: fd.videos.filter(v => v.trim()),
        brandId: fd.brandId || null, manufacturerId: fd.manufacturerId || null,
        returnPolicyId: fd.returnPolicyId || null,
        faqGroupId: fd.faqGroupId || null,
        taxRuleId: fd.taxRuleId?.trim() || null, hsnCode: fd.hsnCode || undefined,
        stock: stockData,
        weight: parseFloat(fd.weight) || 0.5, length: parseFloat(fd.length) || 10,
        breadth: parseFloat(fd.breadth) || 10, height: parseFloat(fd.height) || 5,
        countryOfOrigin: complianceCountry || fd.countryOfOrigin || undefined,
        modelNumber: fd.modelNumber || undefined,
        licenseNumber: fd.licenseNumber || undefined,
        expiryMonths: fd.expiryMonths || undefined,
        packSize: Math.max(1, Number(fd.packSize) || 1),
        soldAsPack: !!fd.soldAsPack,
        isActive: fd.isActive, isFeatured: fd.isFeatured, isDigital: fd.isDigital,
        requiresPrescription: fd.requiresPrescription,
        disableVariants: fd.disableVariants, showOutOfStockVariants: fd.showOutOfStockVariants,
        productType,
        // Filter attributes apply to SIMPLE products too (Woo model) — always send
        // the array so single-product assignments persist; the backend sets
        // product_attributes from any array it receives (put.ts).
        attributeIds: cleanedAttributeIds,
        variations: productType === 'variation' ? (cleanedVariations ?? []) : undefined,
        categories: sanitizedCategories, featuredCategory: fd.featuredCategory || null,
        tags: fd.tags.map(t => (typeof t === 'object' && t._id ? t._id : t)).filter(Boolean),
        ...(fd.specificationId ? { specificationId: fd.specificationId } : {}),
        ...(fd.specifications ? { specifications: fd.specifications } : {}),
        sizeChart: sizeChartPayload,
        washCareInstructions: (fd.washCareInstructions || []).filter(i => i?.text?.trim()),
        customerOrderImages: fd.customerOrderImages,
        // Serialized to the flat {type,title,html} shape the storefront PDP
        // renders. page_sections is PDP layout config (a different concept) —
        // it must NOT be overwritten with content blocks.
        aplusContent: serializeContentBlocks(fd.aplusContent),
        offers: fd.offers,
        crossSellIds: fd.crossSellIds, upsellIds: fd.upsellIds, fbtIds: fd.fbtIds,
        b2bPricing: fd.b2bPricing,
        seo: Object.keys(seoPld).length ? seoPld : null,
      };

      if (isEdit) await productsAPI.update(id!, payload);
      else await productsAPI.create(payload);

      setDirty(false);
      navigate('/products');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S saves from anywhere in the form (the browser's save-page dialog
  // is suppressed). Reads the latest handlers through a ref.
  const submitShortcutRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitShortcutRef.current = () => {
      if (!saving && !loading) handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        submitShortcutRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const showContentTab = canAccess('product_specifications') || canAccess('aplus_content') || canAccess('wash_care');
  const showVariantsTab = formData.productType === 'variation' || !!variantGroup;
  const visibleTabs: Array<{ id: TabId; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'pricing', label: 'Pricing & Tax' },
    { id: 'media', label: 'Media' },
    ...(showContentTab ? [{ id: 'content' as TabId, label: 'Content' }] : []),
    ...(showVariantsTab ? [{ id: 'variants' as TabId, label: 'Variants' }] : []),
    { id: 'related', label: 'Related' },
    ...(canAccess('b2b') ? [{ id: 'b2b' as TabId, label: 'B2B' }] : []),
    ...(canAccess('pharmacy_fields') ? [{ id: 'medical' as TabId, label: 'Medical' }] : []),
    { id: 'seo', label: 'SEO' },
    { id: 'settings', label: 'Settings' },
  ];

  // Product type selector — the FIRST control of General for new products.
  const productTypeCard = (
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
              <p className="text-xs text-gray-400">
                {type === 'single'
                  ? 'One sellable SKU — single price & stock'
                  : formData.variations.length > 0
                    ? 'Variants in the legacy per-row matrix (Variants tab)'
                    : 'Variants managed as linked full products (Variants tab)'}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  // The classic per-row matrix editor — mounted by the Variants panel ONLY for
  // products that already carry variation rows. Props unchanged.
  const legacyVariationsEditor = (
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
  );

  const tabContentCls = 'data-[state=inactive]:hidden mt-0 focus-visible:outline-none';

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

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)}>

          {/* ══ Sticky top bar + tab bar ══════════════════════════════════════ */}
          <div className="sticky top-14 z-20 -mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 px-4 md:px-6 lg:px-8 pt-3 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 border-b border-gray-200 mb-5">
            <div className="flex items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-3 min-w-0">
                <button type="button" onClick={handleCancel} className="text-gray-500 hover:text-gray-800 shrink-0" title="Back to products">
                  <FaArrowLeft />
                </button>
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {formData.name || (isEdit ? 'Edit Product' : 'New Product')}
                </h1>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${formData.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {formData.isActive ? 'Active' : 'Draft'}
                </span>
                {isEdit && slug && (
                  <span className="hidden xl:block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-mono truncate max-w-48">{slug}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isEdit && (
                  <button type="button" onClick={handleExport}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                    <FaDownload className="text-xs" /> Export
                  </button>
                )}
                {isEdit && (
                  <button type="button" onClick={handleDuplicateProduct} disabled={duplicating}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                    <FaCopy className="text-xs" /> {duplicating ? 'Duplicating…' : 'Duplicate'}
                  </button>
                )}
                <button type="button" onClick={handleCancel}
                  className="px-4 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                  Cancel
                </button>
                <button type="submit" disabled={saving} title="Save (Ctrl+S)"
                  className="relative px-5 py-1.5 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                  {saving ? 'Saving…' : isEdit ? 'Save' : 'Create Product'}
                  <span className="ml-1.5 hidden md:inline text-[10px] font-normal text-red-200">Ctrl+S</span>
                  {dirty && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white" title="Unsaved changes" />
                  )}
                </button>
              </div>
            </div>

            <TabsList className="h-auto w-full justify-start flex-wrap gap-1 bg-transparent p-0 pb-2 rounded-none">
              {visibleTabs.map(t => (
                <TabsTrigger key={t.id} value={t.id} type="button"
                  className="rounded-md border border-transparent px-3 py-1.5 text-sm text-gray-600 data-[state=active]:border-gray-200 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ══ GENERAL ══════════════════════════════════════════════════════ */}
          <TabsContent value="general" forceMount className={tabContentCls}>
            <div className="grid grid-cols-12 gap-4 items-start">
              <div className="col-span-12 lg:col-span-8 space-y-4">

                {/* Product Type — FIRST for new products */}
                {!isEdit && productTypeCard}

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

                {isEdit && productTypeCard}

                {formData.productType === 'single' && (
                  <ProductAttributes
                    selectedAttributeIds={formData.attributeIds}
                    selectedAttributeValues={formData.selectedAttributeValues || {}}
                    onAttributeIdsChange={ids => setFormData(p => ({ ...p, attributeIds: ids }))}
                    onAttributeValuesChange={values => setFormData(p => ({ ...p, selectedAttributeValues: values }))}
                    allowVariations={false}
                  />
                )}

                {/* Product identifiers — License Number moved to the Medical tab
                    (pharmacy_fields); model number + country of origin stay. */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Product Identifiers</h3>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Model Number</label>
                    <input type="text" value={formData.modelNumber || ''}
                      onChange={e => setFormData(p => ({ ...p, modelNumber: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Country of Origin</label>
                    <input type="text" value={formData.countryOfOrigin || ''}
                      onChange={e => setFormData(p => ({ ...p, countryOfOrigin: e.target.value }))}
                      placeholder="India"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
                    <p className="text-xs text-gray-400 mt-0.5">A Compliance-section country (if filled there) overrides this on save.</p>
                  </div>
                  {canAccess('pharmacy_fields') && (
                    <p className="text-xs text-gray-400">License number lives on the <span className="font-medium text-gray-600">Medical</span> tab.</p>
                  )}
                </div>

                {/* Pack sizing — units per sales pack. When "sold only in packs" is on,
                    the storefront steps quantity by the pack size and orders are
                    enforced to pack multiples (B2B MOQ increments can require more). */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-2">
                  <label className="text-xs font-medium text-gray-600 block">Pack / Case size</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" value={formData.packSize || 1}
                      onChange={e => setFormData(p => ({ ...p, packSize: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-24 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
                    <span className="text-xs text-gray-500">units per pack</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input type="checkbox" checked={formData.soldAsPack}
                      onChange={e => setFormData(p => ({ ...p, soldAsPack: e.target.checked }))}
                      className="rounded border-gray-300 text-red-500 focus:ring-red-400" />
                    Sold only in packs (buy in multiples of {formData.packSize || 1})
                  </label>
                  <p className="text-xs text-gray-400">Leave pack size 1 for products sold as singles.</p>
                </div>
              </div>

              <div className="col-span-12 lg:col-span-4 space-y-4">
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

                {/* Brand & Manufacturer */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Brand & Manufacturer</h3>
                  {/* Brand is a per-product field only for simple products. For variable
                      products each variation carries its own brand (set in the Variations
                      editor), so a single product-level brand would be misleading. */}
                  {formData.productType === 'single' ? (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Brand</label>
                      <select value={formData.brandId} onChange={e => setFormData(p => ({ ...p, brandId: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                        <option value="">None</option>
                        {availableBrands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2.5 py-2">
                      Brand is set <span className="font-medium text-gray-700">per variation</span> for variable products — choose it in the Variations editor.
                    </div>
                  )}
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

                {/* FAQ Group — products.faq_group_id had NO form input anywhere
                    (only the CSV import wrote it). Reusable FAQ sets attach here. */}
                {canAccess('faqs') && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">FAQ Group</h3>
                  <select value={formData.faqGroupId} onChange={e => setFormData(p => ({ ...p, faqGroupId: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400">
                    <option value="">None</option>
                    {availableFaqGroups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                  </select>
                  {!availableFaqGroups.length && <p className="text-xs text-gray-400 mt-1">Create groups in Content → FAQs</p>}
                </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══ PRICING & TAX ════════════════════════════════════════════════ */}
          <TabsContent value="pricing" forceMount className={tabContentCls}>
            <div className="max-w-3xl space-y-4">
              <ProductPricing
                price={formData.price} originalPrice={formData.originalPrice}
                salePrice={formData.salePrice} saleStartsAt={formData.saleStartsAt} saleEndsAt={formData.saleEndsAt}
                sku={formData.sku} hsnCode={formData.hsnCode} taxRuleId={formData.taxRuleId} taxRules={availableTaxRules}
                showTaxFields={canAccess('gst_tax')}
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
            </div>
          </TabsContent>

          {/* ══ MEDIA ════════════════════════════════════════════════════════ */}
          <TabsContent value="media" forceMount className={tabContentCls}>
            <div className="max-w-4xl">
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
          </TabsContent>

          {/* ══ CONTENT ══════════════════════════════════════════════════════ */}
          {showContentTab && (
          <TabsContent value="content" forceMount className={tabContentCls}>
            <div className="max-w-4xl space-y-4">
              {canAccess('product_specifications') && (<>
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
                        {(sec.items || []).map((item, ii) => (
                          <div key={ii} className="flex gap-2 mb-1.5">
                            <input value={item.key} onChange={e => { const s = [...(formData.specifications || [])]; const items = [...(sec.items || [])]; items[ii] = { ...item, key: e.target.value }; s[si] = { ...sec, items }; setFormData(p => ({ ...p, specifications: s })); }}
                              placeholder="Key" className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                            <input value={item.value} onChange={e => { const s = [...(formData.specifications || [])]; const items = [...(sec.items || [])]; items[ii] = { ...item, value: e.target.value }; s[si] = { ...sec, items }; setFormData(p => ({ ...p, specifications: s })); }}
                              placeholder="Value" className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" />
                            <button type="button" onClick={() => { const s = [...(formData.specifications || [])]; const items = (sec.items || []).filter((_, j) => j !== ii); s[si] = { ...sec, items: items.length ? items : [{ key: '', value: '' }] }; setFormData(p => ({ ...p, specifications: s })); }}
                              disabled={(sec.items || []).length === 1} className="text-xs text-red-400 disabled:opacity-30">✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => { const s = [...(formData.specifications || [])]; s[si] = { ...sec, items: [...(sec.items || []), { key: '', value: '' }] }; setFormData(p => ({ ...p, specifications: s })); }}
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
              </>)}

              {/* A+ Content */}
              {canAccess('aplus_content') && (
              <>
              <ProductContentSections
                blocks={formData.aplusContent}
                onChange={blocks => applyFormData(p => ({ ...p, aplusContent: blocks }))}
                productId={id}
              />
              {/* These are two DIFFERENT things sharing one module: A+ blocks above
                  are rich CONTENT (aplus_content column, "Product Highlights" on the
                  PDP); the Sections Manager is PDP LAYOUT + per-section text
                  (page_sections column, gear icon on the Products list). */}
              {isEdit && (
                <p className="text-xs text-gray-500 -mt-2">
                  Looking to reorder / toggle the product page's sections (description, dosage, FAQs…)?{' '}
                  <button type="button" onClick={() => navigate(`/products/${id}/sections`)}
                    className="text-blue-600 hover:text-blue-800 font-medium underline-offset-2 hover:underline">
                    Open the Page Sections manager →
                  </button>
                </p>
              )}
              </>
              )}

              {/* Wash Care */}
              {canAccess('wash_care') && (
              <ProductWashCare
                instructions={formData.washCareInstructions}
                onInstructionsChange={instructions => setFormData(p => ({ ...p, washCareInstructions: instructions }))}
                productId={id}
                productName={formData.name}
              />
              )}
            </div>
          </TabsContent>
          )}

          {/* ══ VARIANTS ═════════════════════════════════════════════════════ */}
          {showVariantsTab && (
          <TabsContent value="variants" forceMount className={tabContentCls}>
            <div className="max-w-5xl">
              <ProductVariantGroupPanel
                productId={resolvedProductId}
                productName={formData.name}
                hasLegacyVariations={formData.variations.length > 0}
                initialGroup={variantGroup}
                legacyEditor={legacyVariationsEditor}
              />
            </div>
          </TabsContent>
          )}

          {/* ══ RELATED ══════════════════════════════════════════════════════ */}
          <TabsContent value="related" forceMount className={tabContentCls}>
            <div className="max-w-4xl space-y-4">
              {/* Related */}
              {canAccess('related_products') && (
              <ProductRelated
                crossSellIds={formData.crossSellIds}
                upsellIds={formData.upsellIds}
                fbtIds={formData.fbtIds}
                onCrossSellChange={ids => setFormData(p => ({ ...p, crossSellIds: ids }))}
                onUpsellChange={ids => setFormData(p => ({ ...p, upsellIds: ids }))}
                onFbtChange={ids => setFormData(p => ({ ...p, fbtIds: ids }))}
                currentProductId={id}
              />
              )}

              {/* Offers */}
              {canAccess('product_offers') && (
              <ProductOffers
                offers={formData.offers}
                onChange={offers => setFormData(p => ({ ...p, offers }))}
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

              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Bundles</span> are managed under <span className="font-medium">Products → Bundles</span>.
                  Bundles linked to this product continue to work automatically.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ══ B2B ══════════════════════════════════════════════════════════ */}
          {canAccess('b2b') && (
          <TabsContent value="b2b" forceMount className={tabContentCls}>
            <div className="max-w-4xl">
              {/* B2B Pricing — hidden when the B2B module is disabled for this store.
                  productId enables per-account contract prices (P1); variations let a
                  tier/account price target one variation. */}
              <ProductB2BPricing
                tiers={formData.b2bPricing}
                onChange={tiers => setFormData(p => ({ ...p, b2bPricing: tiers }))}
                productId={resolvedProductId || id}
                variations={formData.variations}
              />
            </div>
          </TabsContent>
          )}

          {/* ══ MEDICAL ══════════════════════════════════════════════════════ */}
          {canAccess('pharmacy_fields') && (
          <TabsContent value="medical" forceMount className={tabContentCls}>
            <div className="max-w-3xl">
              <ProductMedicalPanel
                requiresPrescription={formData.requiresPrescription}
                expiryMonths={formData.expiryMonths}
                licenseNumber={formData.licenseNumber}
                onRequiresPrescriptionChange={v => setFormData(p => ({ ...p, requiresPrescription: v }))}
                onExpiryMonthsChange={v => setFormData(p => ({ ...p, expiryMonths: v }))}
                onLicenseNumberChange={v => setFormData(p => ({ ...p, licenseNumber: v }))}
              />
            </div>
          </TabsContent>
          )}

          {/* ══ SEO ══════════════════════════════════════════════════════════ */}
          <TabsContent value="seo" forceMount className={tabContentCls}>
            <div className="max-w-3xl">
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
            </div>
          </TabsContent>

          {/* ══ SETTINGS ═════════════════════════════════════════════════════ */}
          <TabsContent value="settings" forceMount className={tabContentCls}>
            <div className="max-w-3xl space-y-4">
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

              {/* Display Options — Requires Prescription moved to the Medical tab */}
              <ProductDisplayOptions
                disableVariants={formData.disableVariants}
                showOutOfStockVariants={formData.showOutOfStockVariants}
                isActive={formData.isActive}
                isFeatured={formData.isFeatured}
                isDigital={formData.isDigital}
                requiresPrescription={formData.requiresPrescription}
                showRequiresPrescription={false}
                onDisableVariantsChange={v => setFormData(p => ({ ...p, disableVariants: v }))}
                onShowOutOfStockVariantsChange={v => setFormData(p => ({ ...p, showOutOfStockVariants: v }))}
                onIsActiveChange={v => setFormData(p => ({ ...p, isActive: v }))}
                onIsFeaturedChange={v => setFormData(p => ({ ...p, isFeatured: v }))}
                onIsDigitalChange={v => setFormData(p => ({ ...p, isDigital: v }))}
                onRequiresPrescriptionChange={v => setFormData(p => ({ ...p, requiresPrescription: v }))}
              />
            </div>
          </TabsContent>

        </Tabs>
      </form>
    </div>
  );
};

export default ProductForm;
