import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from 'react-icons/fa';
import { productsAPI, uploadAPI, taxRulesAPI, brandsAPI, categoriesAPI } from '../services/api';
import type { ProductVariation } from '../types/productForm';
import { useAuth } from '../contexts/AuthContext';
import ProductInventoryPanel from '../components/product/ProductInventoryPanel';
import { FieldGroup, Field, SwitchRow, fieldInputCls, fieldTextareaCls } from '../components/product/FormField';
import RichTextEditor from '../components/common/RichTextEditor';
import ProductImageUpload from '../components/product/ProductImageUpload';
import { localeDate } from '../utils/date';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Coerce PG NUMERIC (the API returns it as a string) / mixed input to a finite number, else null. */
const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const formatINR = (n: number): string =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDay = (v: any): string => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : localeDate(d, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-IN');
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

/**
 * The admin GET returns variation rows RAW from PG (snake_case: selling_price,
 * mrp, sale_price, short_desc, important_info, hsn_code, tax_rule_id,
 * primary_brand_id, …) while this page binds camelCase keys. Without this map
 * every saved value rendered EMPTY. Normalize on load into the camel keys the
 * page binds — the same names ProductForm's variation payload uses (price,
 * originalPrice, salePrice, brandId, …), which the backend's
 * normalizeVariationBody maps back to snake_case on save.
 *
 * The camel keys are appended AFTER the raw spread, so in the merged save
 * payload they sit LATER in key order and win over their stale snake twins
 * inside normalizeVariationBody (last write to the same column wins).
 */
const normalizeVariationRow = (v: any, idx: number): any => ({
  ...v,
  id: v.id || `var-loaded-${idx}`,
  // pricing — null/undefined = "no own value" (inherits from the product)
  price: num(v.selling_price ?? v.sellingPrice ?? v.price) ?? undefined,
  originalPrice: num(v.mrp ?? v.originalPrice) ?? undefined,
  salePrice: num(v.sale_price ?? v.salePrice) ?? undefined,
  saleStartsAt: toDatetimeLocal(v.sale_starts_at ?? v.saleStartsAt ?? ''),
  saleEndsAt: toDatetimeLocal(v.sale_ends_at ?? v.saleEndsAt ?? ''),
  // content
  shortDescription: v.short_desc ?? v.shortDescription ?? '',
  importantInfo: v.important_info ?? v.importantInfo ?? '',
  description: v.description ?? '',
  dosage: v.dosage ?? '',
  // organization
  hsnCode: v.hsn_code ?? v.hsnCode ?? '',
  taxRuleId: v.tax_rule_id ?? v.taxRuleId ?? '',
  brandId: v.primary_brand_id ?? v.primaryBrandId ?? v.brandId ?? '',
  // shipping dimensions — undefined = inherit the product's numbers
  weight: num(v.weight) ?? undefined,
  length: num(v.length) ?? undefined,
  breadth: num(v.breadth) ?? undefined,
  height: num(v.height) ?? undefined,
  // identity / rest
  stock: v.stock != null ? Number(v.stock) || 0 : 0,
  faqs: Array.isArray(v.faqs) ? v.faqs : [],
  images: Array.isArray(v.images) ? v.images : [],
  attributes: v.attributes || {},
  isActive: (v.is_active ?? v.isActive) !== false,
});

/** product_b2b_pricing rows arrive snake_case from the admin GET — normalize to
 *  the camelCase keys the backend PUT setter accepts (it takes both; we send
 *  camelCase). PUT /products/:id `b2bPricing` REPLACES the full slab set. */
const normalizeSlab = (s: any) => ({
  id: s.id,
  variationId: s.variation_id ?? s.variationId ?? null,
  tierName: s.tier_name ?? s.tierName ?? '',
  minQty: Number(s.min_qty ?? s.minQty ?? 1),
  maxQty: s.max_qty ?? s.maxQty ?? undefined,
  priceType: s.price_type ?? s.priceType ?? 'fixed',
  priceValue: Number(s.price_value ?? s.priceValue ?? 0),
  isActive: (s.is_active ?? s.isActive) !== false,
  validFrom: (s.valid_from ?? s.validFrom)?.slice?.(0, 10) || undefined,
  validUntil: (s.valid_until ?? s.validUntil)?.slice?.(0, 10) || undefined,
});
type Slab = ReturnType<typeof normalizeSlab>;

/** This variation's FLAT wholesale row: generic (no tier), from qty 1, fixed price —
 *  the single "wholesale price" the input on this page binds to. */
// The generic flat wholesale slab: this variation, qty-1, fixed, and NO real
// tier. Importers write the 'default' sentinel while the editor writes ''; both
// mean "the generic flat price", so match either — otherwise editing spawned a
// second slab and the resolver kept the old one.
const isFlatWholesaleRow = (s: Slab, variationUuid: string) =>
  s.variationId === variationUuid && Number(s.minQty) === 1 && s.priceType === 'fixed'
  && ['', 'default'].includes(String(s.tierName ?? '').toLowerCase());

const VariationEditPage: React.FC = () => {
  const { productSlug, variationKey } = useParams<{ productSlug: string; variationKey: string }>();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const [product, setProduct] = useState<any>(null);
  const [variation, setVariation] = useState<ProductVariation | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [taxRules, setTaxRules] = useState<Array<{ _id: string; id?: string; name: string; rate?: number }>>([]);
  const [brands, setBrands] = useState<Array<{ _id?: string; id?: string; name: string }>>([]);
  // Flat B2B wholesale price for THIS variation (empty string = no flat slab).
  const [b2bFlatPrice, setB2bFlatPrice] = useState<string>('');
  // Per-variation categories (independent of the product's). DIRTY-tracKED:
  // the `categories` key is sent ONLY when the user touched the selection —
  // an absent key leaves the links untouched (inherit semantics preserved).
  const [catSelection, setCatSelection] = useState<Array<{ id: string; name: string }>>([]);
  const [catDirty, setCatDirty] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string }> | null>(null);

  const loadAllCategories = async () => {
    if (allCategories) return;
    try {
      const r: any = await categoriesAPI.list();
      const list = Array.isArray(r) ? r : r?.data ?? r?.categories ?? [];
      setAllCategories((Array.isArray(list) ? list : [])
        .map((c: any) => ({ id: String(c.id ?? c._id ?? ''), name: String(c.name ?? c.slug ?? '') }))
        .filter((c: any) => c.id && c.name));
    } catch { setAllCategories([]); }
  };

  // URL carries the variation's SKU (or id) — a stable, human-readable key —
  // resolved to the array index after the product loads. A bare number is still
  // accepted so old /variations/0/edit links keep working.
  const resolvedIdx = useRef<number>(-1);
  const resolveIdx = (vars: any[]): number => {
    const key = decodeURIComponent(variationKey ?? '');
    let i = vars.findIndex((x: any) =>
      String(x.sku ?? '').toUpperCase() === key.toUpperCase() || String(x.id ?? '') === key);
    if (i < 0 && /^\d+$/.test(key)) i = parseInt(key, 10);
    return i;
  };

  useEffect(() => {
    if (productSlug) loadProduct();
    taxRulesAPI.getAll().then(setTaxRules).catch(() => {});
    brandsAPI.list({ active: true }).then((r: any) => {
      const list = Array.isArray(r) ? r : r?.data ?? r?.brands ?? [];
      setBrands(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, [productSlug]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const prod = await productsAPI.getBySlug(productSlug!);
      setProduct(prod);
      const idx = resolveIdx(prod?.variations ?? []);
      resolvedIdx.current = idx;
      const v = idx >= 0 ? prod?.variations?.[idx] : undefined;
      if (!v) {
        alert('Variation not found');
        navigate(`/products/${productSlug}/edit`);
        return;
      }
      // P1: the raw row is snake_case — normalize into the camel keys the page
      // binds so saved values actually display (price, originalPrice, …).
      setVariation(normalizeVariationRow(v, idx) as ProductVariation);
      // Seed the flat wholesale input from this variation's generic slab
      // (variation-scoped, no tier, min_qty 1, fixed) — first match wins.
      const slabRows: Slab[] = (prod?.b2bPricing ?? prod?.b2b_pricing ?? []).map(normalizeSlab);
      const flat = slabRows.find(s => isFlatWholesaleRow(s, String(v.id || '')));
      setB2bFlatPrice(flat ? String(flat.priceValue) : '');
      // Seed this variant's own category links (objects from the admin GET).
      setCatSelection(((v as any).categories ?? [])
        .map((c: any) => (typeof c === 'object'
          ? { id: String(c.id ?? c._id ?? ''), name: String(c.name ?? c.slug ?? c.id ?? '') }
          : { id: String(c), name: String(c) }))
        .filter((c: any) => c.id));
      setCatDirty(false);
    } catch {
      alert('Failed to load product');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setVariation(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleImageUpload = async (files: FileList) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadMultiple(imageFiles, 'products');
      const urls: string[] = res.data?.files?.map((f: any) => f.url) || res.data?.urls || [];
      setVariation(prev => prev ? { ...prev, images: [...(prev.images || []), ...urls] } : prev);
    } catch {
      alert('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!product || !variation) return;
    setSaving(true);
    try {
      const idx = resolvedIdx.current;
      const varUuid = String(variation.id || '');
      // Body = the existing row merged with the edited fields. Per-variation
      // categories only when the user touched them (server REPLACES on presence).
      const varBody: any = { ...((product.variations || [])[idx] || {}), ...variation };
      if (catDirty) varBody.categories = catSelection.map(c => c.id);
      else delete varBody.categories;

      // Save THIS variation via the single-variation endpoint — it updates one
      // row (and its categories) and never touches the siblings, so it returns in
      // ~1s instead of the whole-product PUT re-processing 80+ variations (which
      // blew the request timeout and surfaced a bogus "save failed"). Fall back to
      // the whole-product PUT only when the row has no UUID yet (unsaved).
      if (UUID_RE.test(varUuid)) {
        await productsAPI.updateVariation(product._id, varUuid, varBody);
      } else {
        const updatedVariations = [...(product.variations || [])];
        updatedVariations[idx] = varBody;
        await productsAPI.update(product._id, { variations: updatedVariations });
      }

      // Per-variant flat wholesale price → product_b2b_pricing. Sent WITHOUT a
      // `variations` key so the product PUT skips the slow variation loop.
      // b2bPricing REPLACES the full slab set (needs b2b.manage), so keep every
      // other row and swap just this variant's flat row.
      const rawSlabs = product?.b2bPricing ?? product?.b2b_pricing;
      if (canAccess('b2b') && Array.isArray(rawSlabs) && UUID_RE.test(varUuid)) {
        const kept: any[] = rawSlabs.map(normalizeSlab).filter((s: Slab) => !isFlatWholesaleRow(s, varUuid));
        const flatVal = parseFloat(b2bFlatPrice);
        if (b2bFlatPrice.trim() !== '' && Number.isFinite(flatVal) && flatVal > 0) {
          kept.push({ variationId: varUuid, tierName: '', minQty: 1, priceType: 'fixed', priceValue: flatVal, isActive: true });
        }
        await productsAPI.update(product._id, { b2bPricing: kept });
      }
      navigate(`/products/${productSlug}/edit`);
    } catch {
      alert('Failed to save variation');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S saves from anywhere on the page — same shortcut as the product
  // form (the browser's save-page dialog is suppressed). Latest handler via ref.
  const saveShortcutRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveShortcutRef.current = () => {
      if (!saving && !loading && variation) handleSave();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveShortcutRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFaqChange = (faqIdx: number, field: 'question' | 'answer', value: string) => {
    const faqs = [...((variation as any)?.faqs || [])];
    faqs[faqIdx] = { ...faqs[faqIdx], [field]: value };
    handleChange('faqs', faqs);
  };

  const addFaq = () => {
    const faqs = [...((variation as any)?.faqs || [])];
    faqs.push({ question: '', answer: '' });
    handleChange('faqs', faqs);
  };

  const removeFaq = (faqIdx: number) => {
    const faqs = ((variation as any)?.faqs || []).filter((_: any, i: number) => i !== faqIdx);
    handleChange('faqs', faqs);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">Loading variation…</div>
      </div>
    );
  }

  if (!variation) return null;

  const v = variation as any;

  // ── Effective values (variation-first, then product) ────────────────────────
  // Per-field inheritance, mirroring the canonical price resolver: a NULL
  // variation field falls back to the product's value at read/checkout time,
  // field by field — never record-by-record.
  const prod = product || {};
  const prodPrice = num(prod.price ?? prod.sellingPrice ?? prod.selling_price);
  const prodMrp = num(prod.originalPrice ?? prod.mrp);
  const prodSalePrice = num(prod.salePrice ?? prod.sale_price);
  const prodSaleStartsAt = prod.saleStartsAt ?? prod.sale_starts_at ?? null;
  const prodSaleEndsAt = prod.saleEndsAt ?? prod.sale_ends_at ?? null;
  const prodHsn = String(prod.hsnCode ?? prod.hsn_code ?? '');
  const prodDims: Record<'weight' | 'length' | 'breadth' | 'height', number | null> = {
    weight: num(prod.weight), length: num(prod.length), breadth: num(prod.breadth), height: num(prod.height),
  };

  const effPrice = num(v.price) ?? prodPrice;
  const effMrp = num(v.originalPrice) ?? prodMrp;
  const effSalePrice = num(v.salePrice) ?? prodSalePrice;
  const effSaleStartsAt = v.saleStartsAt ? v.saleStartsAt : prodSaleStartsAt;
  const effSaleEndsAt = v.saleEndsAt ? v.saleEndsAt : prodSaleEndsAt;

  // Sale applies only when > 0, below the base price, and now inside the window
  // (missing start = already started, missing end = open-ended).
  const now = new Date();
  const basePrice = (effPrice ?? 0) > 0 ? (effPrice as number) : (effMrp ?? 0);
  const inSaleWindow =
    (!effSaleStartsAt || now >= new Date(effSaleStartsAt)) &&
    (!effSaleEndsAt || now <= new Date(effSaleEndsAt));
  const saleActive = effSalePrice != null && effSalePrice > 0 && effSalePrice < basePrice && inSaleWindow;
  const sellsAt = saleActive ? (effSalePrice as number) : basePrice;
  const showStruckMrp = effMrp != null && effMrp > sellsAt;

  // Product-LEVEL generic flat wholesale slab (variation_id NULL, no tier,
  // min_qty 1, fixed) — what a wholesale buyer pays for this variant when it
  // has no flat slab of its own.
  const allSlabs: Slab[] = (product?.b2bPricing ?? product?.b2b_pricing ?? []).map(normalizeSlab);
  const productFlatSlab = allSlabs.find(
    s => s.variationId == null && !s.tierName && Number(s.minQty) === 1 && s.priceType === 'fixed' && s.isActive
  );

  const hasOwnPrice = num(v.price) != null;
  const hasOwnMrp = num(v.originalPrice) != null;
  const hasOwnSalePrice = num(v.salePrice) != null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* ══ Sticky header: back · name · SKU · effective price · Save ═══════ */}
      <div className="sticky top-14 z-20 -mx-6 -mt-6 px-6 py-3 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 border-b border-gray-200">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/products/${productSlug}/edit`)}
              className="text-gray-500 hover:text-gray-800 shrink-0"
              title="Back to product"
            >
              <FaArrowLeft />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {v.name || v.sku || `${product?.name || 'Product'} — Variant ${resolvedIdx.current + 1}`}
                </h1>
                {v.sku && (
                  <span className="shrink-0 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-mono">{v.sku}</span>
                )}
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${v.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {v.isActive !== false ? 'Active' : 'Draft'}
                </span>
              </div>
              {/* Effective price line — what the storefront actually charges,
                  computed variation-first-then-product incl. the sale window. */}
              <p className="text-xs text-gray-600 mt-0.5 truncate">
                {sellsAt > 0 ? (
                  <>
                    Sells at <span className="font-semibold text-gray-900">{formatINR(sellsAt)}</span>
                    {saleActive && (
                      <span className="text-green-700"> · on sale{effSaleEndsAt ? ` until ${formatDay(effSaleEndsAt)}` : ''}</span>
                    )}
                    {showStruckMrp && <> · <s className="text-gray-400">{formatINR(effMrp as number)}</s></>}
                  </>
                ) : (
                  'No price yet — set one below or on the product.'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            title="Save (Ctrl+S)"
            className="shrink-0 px-5 py-1.5 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Saving…' : 'Save Variation'}
            <span className="ml-1.5 hidden md:inline text-[10px] font-normal text-red-200">Ctrl+S</span>
          </button>
        </div>
      </div>

      {/* ══ Identity ════════════════════════════════════════════════════════ */}
      <FieldGroup title="Identity" description="How this variant is named and addressed.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Variation name" htmlFor="vName" help="Shown wherever this variant is listed and on its page.">
              <input
                id="vName" type="text"
                value={v.name || ''}
                onChange={e => handleChange('name', e.target.value)}
                className={fieldInputCls}
                placeholder="e.g. Abies canadensis CH 30C 30ml"
              />
            </Field>
            <Field label="Slug" htmlFor="vSlug" help="The URL piece for this variant — lowercase letters, numbers and dashes.">
              <input
                id="vSlug" type="text"
                value={v.slug || ''}
                onChange={e => handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
                className={`${fieldInputCls} font-mono`}
                placeholder="e.g. abies-canadensis-ch-30c-30ml"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="SKU" htmlFor="vSku" help="Your unique stock code for this variant.">
              <input
                id="vSku" type="text"
                value={v.sku || ''}
                onChange={e => handleChange('sku', e.target.value.toUpperCase().slice(0, 48))}
                className={`${fieldInputCls} font-mono`}
                placeholder="SKU"
              />
            </Field>
          </div>
          <div className="border-t border-gray-100 pt-1">
            <SwitchRow
              id="vActive"
              label="Active"
              help="Draft variants are hidden from the storefront but keep all their data."
              checked={v.isActive !== false}
              onCheckedChange={val => handleChange('isActive', val)}
            />
          </div>
        </div>
      </FieldGroup>

      {/* ══ Pricing — empty fields INHERIT the product's values per field ═══ */}
      <FieldGroup
        title="Pricing"
        description="Each empty field falls back to the product's value on its own — this variant only overrides what you type here."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Field
              label="Price (₹)"
              htmlFor="vPrice"
              help={!hasOwnPrice && prodPrice != null
                ? `Leave empty to use the product price (${formatINR(prodPrice)}). Type to set this variant's own price.`
                : prodPrice != null
                  ? `This variant's own price. Clear it to fall back to the product price (${formatINR(prodPrice)}).`
                  : "This variant's own selling price."}
            >
              <input
                id="vPrice" type="number" step="0.01" min="0"
                value={v.price ?? ''}
                onChange={e => handleChange('price', e.target.value !== '' ? parseFloat(e.target.value) : null)}
                className={fieldInputCls}
                placeholder={!hasOwnPrice && prodPrice != null ? `Inherits ${formatINR(prodPrice)}` : '0.00'}
              />
            </Field>
            <Field
              label="Compare-at / MRP (₹)"
              htmlFor="vMrp"
              help={!hasOwnMrp && prodMrp != null
                ? `Leave empty to use the product MRP (${formatINR(prodMrp)}). Type to set this variant's own.`
                : 'Shown struck through when higher than the selling price.'}
            >
              <input
                id="vMrp" type="number" step="0.01" min="0"
                value={v.originalPrice ?? ''}
                onChange={e => handleChange('originalPrice', e.target.value !== '' ? parseFloat(e.target.value) : null)}
                className={fieldInputCls}
                placeholder={!hasOwnMrp && prodMrp != null ? `Inherits ${formatINR(prodMrp)}` : '0.00'}
              />
            </Field>
            <Field
              label="Stock"
              htmlFor="vStock"
              help="Changes book a ledgered adjustment (see Inventory & ERP below); unchanged values are ignored."
            >
              <input
                id="vStock" type="number" min="0"
                value={v.stock ?? 0}
                onChange={e => handleChange('stock', Math.max(0, parseInt(e.target.value) || 0))}
                className={fieldInputCls}
                placeholder="0"
              />
            </Field>
          </div>

          {/* Sale block — a sale outside its window never applies (canonical
              price resolver: sale > 0, below price, now within window). */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-3">Sale (optional)</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field
                label="Sale price (₹)"
                htmlFor="vSalePrice"
                help={!hasOwnSalePrice && prodSalePrice != null
                  ? `Leave empty to use the product sale price (${formatINR(prodSalePrice)}). Type to set this variant's own.`
                  : 'Counts only while below the price and inside the window.'}
              >
                <input
                  id="vSalePrice" type="number" step="0.01" min="0"
                  value={v.salePrice ?? ''}
                  onChange={e => handleChange('salePrice', e.target.value !== '' ? parseFloat(e.target.value) : null)}
                  className={fieldInputCls}
                  placeholder={!hasOwnSalePrice && prodSalePrice != null ? `Inherits ${formatINR(prodSalePrice)}` : 'No sale'}
                />
              </Field>
              <Field
                label="Sale starts"
                htmlFor="vSaleStarts"
                help={!v.saleStartsAt && prodSaleStartsAt
                  ? `Empty = inherits the product's start (${formatDay(prodSaleStartsAt)}).`
                  : 'Empty = the sale starts immediately.'}
              >
                <input
                  id="vSaleStarts" type="datetime-local"
                  value={v.saleStartsAt || ''}
                  onChange={e => handleChange('saleStartsAt', e.target.value || null)}
                  className={fieldInputCls}
                />
              </Field>
              <Field
                label="Sale ends"
                htmlFor="vSaleEnds"
                help={!v.saleEndsAt && prodSaleEndsAt
                  ? `Empty = inherits the product's end (${formatDay(prodSaleEndsAt)}).`
                  : 'Empty = open-ended. The storefront shows a countdown.'}
              >
                <input
                  id="vSaleEnds" type="datetime-local"
                  value={v.saleEndsAt || ''}
                  onChange={e => handleChange('saleEndsAt', e.target.value || null)}
                  className={fieldInputCls}
                />
              </Field>
            </div>
          </div>
        </div>
      </FieldGroup>

      {/* ══ Organization — brand, shipping size, HSN + tax rule ═════════════ */}
      <FieldGroup
        title="Organization"
        description="Brand, tax and shipping details. Empty fields are inherited from the product."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Brand (this variant)" htmlFor="vBrand" help="Multi-brand products: each variant can carry its own brand.">
              <select
                id="vBrand"
                value={v.brandId || ''}
                onChange={e => handleChange('brandId', e.target.value || null)}
                className={fieldInputCls}
              >
                <option value="">Inherit from product</option>
                {brands.map((b: any) => {
                  const bid = b._id || b.id;
                  return <option key={bid} value={bid}>{b.name}</option>;
                })}
              </select>
            </Field>
            <Field
              label="Shipping size (this variant)"
              help="Empty boxes use the product's numbers — shown as the placeholders."
            >
              <div className="grid grid-cols-4 gap-2">
                {([['weight', 'Wt kg'], ['length', 'L cm'], ['breadth', 'B cm'], ['height', 'H cm']] as const).map(([key, label]) => (
                  <div key={key}>
                    <span className="block text-[10px] text-gray-400 mb-0.5">{label}</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={v[key] ?? ''}
                      onChange={e => handleChange(key, e.target.value !== '' ? parseFloat(e.target.value) : null)}
                      className={`${fieldInputCls} !px-2`}
                      placeholder={prodDims[key] != null ? String(prodDims[key]) : label}
                      title={label}
                    />
                  </div>
                ))}
              </div>
            </Field>
          </div>

          {/* HSN + Tax Rule — gst_tax module only; with the module off the backend
              strips these fields, so showing the inputs would silently lie. */}
          {canAccess('gst_tax') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
              <Field
                label="HSN code"
                htmlFor="vHsn"
                help={!v.hsnCode && prodHsn
                  ? `Leave empty to use the product HSN (${prodHsn}). Type to override for this variant.`
                  : 'For GST compliance. Overrides the product-level HSN.'}
              >
                <input
                  id="vHsn" type="text"
                  value={v.hsnCode || ''}
                  onChange={e => handleChange('hsnCode', e.target.value)}
                  className={`${fieldInputCls} font-mono`}
                  placeholder={prodHsn ? `Inherits ${prodHsn}` : 'e.g. 3004'}
                />
              </Field>
              <Field label="Tax rule" htmlFor="vTaxRule" help="GST vs IGST is auto-determined from the delivery address.">
                <select
                  id="vTaxRule"
                  value={v.taxRuleId || ''}
                  onChange={e => handleChange('taxRuleId', e.target.value || null)}
                  className={fieldInputCls}
                >
                  <option value="">Inherit from product</option>
                  {taxRules.map(rule => {
                    const key = rule._id || rule.id || '';
                    return (
                      <option key={key} value={key}>
                        {rule.name}{rule.rate !== undefined ? ` — ${rule.rate}%` : ''}
                      </option>
                    );
                  })}
                  {taxRules.length === 0 && (
                    <option disabled>No rules yet — add in Settings → Tax Rules</option>
                  )}
                </select>
              </Field>
            </div>
          )}
        </div>
      </FieldGroup>

      {/* B2B / wholesale — ONE flat per-variant price (a generic qty-1 fixed slab
          in product_b2b_pricing). Gated on the b2b module; hidden when the admin
          GET didn't include slabs (saving would then replace rows we never saw)
          or when the variation has no real UUID yet (nothing to bind a slab to). */}
      {canAccess('b2b') && Array.isArray(product?.b2bPricing ?? product?.b2b_pricing) && UUID_RE.test(String(v.id || '')) && (() => {
        const varUuid = String(v.id);
        // Everything else targeting this variant (tiers / qty slabs) is read-only here.
        const otherSlabs = allSlabs.filter(s => s.variationId === varUuid && !isFlatWholesaleRow(s, varUuid));
        // No flat slab typed for THIS variant → the product-level generic flat
        // slab (if any) is what wholesale buyers actually pay. Show it.
        const inheritsProductFlat = b2bFlatPrice.trim() === '' && !!productFlatSlab;
        return (
          <FieldGroup
            title="B2B / wholesale price (this variant)"
            description="One flat wholesale price. Tiers and quantity slabs live on the product's B2B tab."
          >
            <div className="space-y-4">
              <div className="max-w-sm">
                <Field
                  label="Wholesale price (₹)"
                  htmlFor="vB2bFlat"
                  help={inheritsProductFlat
                    ? `Inherits the product wholesale price (${formatINR(productFlatSlab!.priceValue)}). Type to override for this variant.`
                    : 'Buyers with a wholesale account see this instead of the retail price. Requires the B2B permission to save. Leave empty to remove it.'}
                >
                  <input
                    id="vB2bFlat" type="number" step="0.01" min="0"
                    value={b2bFlatPrice}
                    onChange={e => setB2bFlatPrice(e.target.value)}
                    className={fieldInputCls}
                    placeholder={inheritsProductFlat ? `Inherits ${formatINR(productFlatSlab!.priceValue)}` : 'No wholesale price'}
                  />
                </Field>
              </div>
              {otherSlabs.length > 0 && (
                <div className="pt-3 border-t border-gray-100 space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">Other B2B slabs on this variant</p>
                  {otherSlabs.map((s, si) => (
                    <p key={s.id || si} className="text-xs text-gray-600">
                      {s.tierName ? `tier ${s.tierName}` : 'any tier'} · {s.minQty}{s.maxQty ? `–${s.maxQty}` : '+'} →{' '}
                      {s.priceType === 'fixed' ? `₹${s.priceValue}` : `${s.priceValue}% off`}
                      {!s.isActive && <span className="text-gray-400"> · inactive</span>}
                    </p>
                  ))}
                  <p className="text-[11px] text-gray-400">Manage tiers &amp; quantity slabs on the product's B2B tab.</p>
                </div>
              )}
            </div>
          </FieldGroup>
        );
      })()}

      {/* Inventory & ERP — live balances, batches, incoming POs, ledger history */}
      {UUID_RE.test(String(v.id || '')) && (
        <ProductInventoryPanel
          variationId={String(v.id)}
          sku={v.sku}
          onStockChanged={(newStock) => handleChange('stock', newStock)}
        />
      )}

      {/* ══ Content ═════════════════════════════════════════════════════════ */}
      <FieldGroup
        title="Content"
        description="Variant-specific copy — shown instead of the product's when this variant is selected."
      >
        <div className="space-y-4">
          <Field label="Short description" htmlFor="vShortDesc" help="One or two lines shown on listing cards.">
            <textarea
              id="vShortDesc"
              value={v.shortDescription || ''}
              onChange={e => handleChange('shortDescription', e.target.value)}
              rows={2}
              className={fieldTextareaCls}
              placeholder="Brief variation description shown in product listing"
            />
          </Field>
          {/* These three are RICH-TEXT columns (backend decodeEntities set) and
              render as HTML on the PDP — bare textareas were wrong twice over:
              ugly AND unable to author the formatting the storefront shows. */}
          <Field label="Description" help="Full description for this variant. Overrides the product description — use the toolbar for headings, lists, bold.">
            <RichTextEditor
              value={v.description || ''}
              onChange={(html: string) => handleChange('description', html)}
              placeholder="Variant-specific description (shown instead of the product description when this variant is selected)"
              minHeight={180}
            />
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Dosage" help="Dosage instructions for this variant — rendered in the Dosage tab on the product page.">
              <RichTextEditor
                value={v.dosage || ''}
                onChange={(html: string) => handleChange('dosage', html)}
                placeholder="e.g. Ten to fifteen drops in some water, three times daily…"
                minHeight={140}
              />
            </Field>
            <Field label="Important info" help="Manufacturer info, warnings, regulatory details — rendered in its own tab.">
              <RichTextEditor
                value={v.importantInfo || ''}
                onChange={(html: string) => handleChange('importantInfo', html)}
                placeholder="Manufacturer, marketer, warnings, storage…"
                minHeight={140}
              />
            </Field>
          </div>
        </div>
      </FieldGroup>

      {/* ══ FAQs ════════════════════════════════════════════════════════════ */}
      <FieldGroup
        title="FAQs"
        description="Questions and answers shown on this variant's page."
        actions={
          <button
            type="button"
            onClick={addFaq}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FaPlus size={10} /> Add FAQ
          </button>
        }
      >
        {(!v.faqs || v.faqs.length === 0) ? (
          <p className="text-xs text-gray-400">No FAQs added yet. Click "Add FAQ" to create one.</p>
        ) : (
          <div className="space-y-3">
            {v.faqs.map((faq: any, fi: number) => (
              <div key={fi} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">FAQ {fi + 1}</span>
                  <button type="button" onClick={() => removeFaq(fi)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <FaTrash size={11} />
                  </button>
                </div>
                <input
                  type="text"
                  value={faq.question || ''}
                  onChange={e => handleFaqChange(fi, 'question', e.target.value)}
                  className={fieldInputCls}
                  placeholder="Question"
                />
                <textarea
                  value={faq.answer || ''}
                  onChange={e => handleFaqChange(fi, 'answer', e.target.value)}
                  rows={3}
                  className={fieldTextareaCls}
                  placeholder="Answer"
                />
              </div>
            ))}
          </div>
        )}
      </FieldGroup>

      {/* ══ Categories (this variant) — EDITABLE, independent of the product ══ */}
      <FieldGroup
        title="Categories (this variant)"
        description="Overrides which categories this variant appears in. No selection = inherits the product's categories."
      >
        <div className="space-y-3">
          {catSelection.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {catSelection.map((cat) => (
                <span key={cat.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                  {cat.name}
                  <button
                    type="button"
                    aria-label={`Remove ${cat.name}`}
                    onClick={() => { setCatSelection(prev => prev.filter(c => c.id !== cat.id)); setCatDirty(true); }}
                    className="text-blue-400 hover:text-red-500 font-bold leading-none"
                  >×</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No own categories — this variant inherits the product's categories.</p>
          )}
          <div className="relative">
            <input
              type="text"
              value={catSearch}
              onFocus={loadAllCategories}
              onChange={e => { setCatSearch(e.target.value); loadAllCategories(); }}
              placeholder="Search categories to add (e.g. Dilutions)…"
              className={fieldInputCls}
            />
            {catSearch.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
                {allCategories === null ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Loading categories…</p>
                ) : (() => {
                  const q = catSearch.trim().toLowerCase();
                  const selected = new Set(catSelection.map(c => c.id));
                  const matches = allCategories.filter(c => !selected.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 8);
                  return matches.length ? matches.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCatSelection(prev => [...prev, c]); setCatDirty(true); setCatSearch(''); }}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
                    >{c.name}</button>
                  )) : <p className="px-3 py-2 text-xs text-gray-400">No matching categories.</p>;
                })()}
              </div>
            )}
          </div>
          {catDirty && (
            <p className="text-xs text-amber-600">Category changes save with the variation (Save button above).</p>
          )}
        </div>
      </FieldGroup>

      {/* ══ Attributes (read-only chips) ════════════════════════════════════ */}
      {Object.keys(v.attributes || {}).length > 0 && (
        <FieldGroup title="Attributes" description="What makes this variant this variant — edit them on the product's Variations tab.">
          <div className="flex flex-wrap gap-2">
            {Object.entries(v.attributes).map(([k, val]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md font-medium">
                <span className="text-gray-400">{k}:</span> {String(val)}
              </span>
            ))}
          </div>
        </FieldGroup>
      )}

      {/* ══ Images — same upload+library-picker+reorder component as the main
          product gallery, so a variant gets the same "choose from media
          library" option instead of file-upload-only. ══════════════════════ */}
      <FieldGroup title="Images" description="Shown when this variant is selected. The first image leads.">
        <ProductImageUpload
          images={v.images || []}
          onImagesChange={imgs => handleChange('images', imgs)}
          onUpload={handleImageUpload}
          uploading={uploading}
          multiple
          label="Variant images"
          folder="products"
        />
      </FieldGroup>

      {/* Footer save */}
      <div className="flex justify-end pb-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          title="Save (Ctrl+S)"
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : 'Save Variation'}
        </button>
      </div>
    </div>
  );
};

export default VariationEditPage;
