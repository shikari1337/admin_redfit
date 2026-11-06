import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaSearch, FaToggleOn, FaToggleOff, FaBoxOpen, FaEdit, FaTrash, FaTimes, FaSave } from 'react-icons/fa';
import { bundlesAPI, productsAPI, productQuantityBundlesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface BundleListItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  price?: number;
  compareAtPrice?: number;
  itemCount?: number;
  updatedAt?: string;
}

/**
 * One quantity offer (a pack) as the screen edits it. Stored on the product
 * (`products.bundles`, growcord-rs domain/orders/quantity_offers.rs): EITHER a
 * pack price (`price` = the total for `quantity` units) OR a percent off each
 * unit's own price; `atLeast` = the pack size or more units get it (else
 * exactly that many); `variationId` '' = every variation of the product.
 * The checkout prices it server-side; this screen only edits the data.
 */
interface QuantityBasedBundle {
  title: string;
  description: string;
  quantity: number;
  priceType: 'pack' | 'percent';
  price: number;
  discountPercent: number;
  atLeast: boolean;
  variationId: string;
}

/** A stored offer (snake_case keys, or their camelCase aliases) → the editable shape. */
const toEditableOffer = (raw: any): QuantityBasedBundle => {
  const pct = raw?.discount_percent ?? raw?.discountPercent;
  const isPct = pct !== undefined && pct !== null && pct !== '';
  return {
    title: String(raw?.title ?? ''),
    description: String(raw?.description ?? ''),
    quantity: Number(raw?.quantity) || 1,
    priceType: isPct ? 'percent' : 'pack',
    price: isPct ? 0 : Number(raw?.price) || 0,
    discountPercent: isPct ? Number(pct) || 0 : 0,
    atLeast: Boolean(raw?.at_least ?? raw?.atLeast),
    variationId: String(raw?.variation_id ?? raw?.variationId ?? ''),
  };
};

/** The product's price shown beside its offers (the staff row's price block, or a number). */
const basePriceOf = (product: any): number => {
  const p = product?.price;
  if (typeof p === 'number') return p;
  return Number(p?.final_price ?? p?.selling_price ?? product?.selling_price ?? 0) || 0;
};

interface VariationChoice {
  id: string;
  label: string;
}

interface QuantityBasedBundleProduct {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images?: string[];
  isActive?: boolean;
  bundles: QuantityBasedBundle[];
}

type BundleViewType = 'combo' | 'quantity';

const Bundles: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  // Backend (routes/productBundles.ts): combo bundle POST/PUT -> products.manage,
  // DELETE /:id -> products.delete; quantity-based bundle PUT+DELETE
  // /product/:productId/quantity -> BOTH products.manage (there is no separate delete
  // permission for the quantity-bundle sub-resource). This page had ZERO client-side
  // gating before.
  const canManageBundles = hasPerm('products.manage');
  const canDeleteBundles = hasPerm('products.delete');
  const [viewType, setViewType] = useState<BundleViewType>('combo');
  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [quantityBundleProducts, setQuantityBundleProducts] = useState<QuantityBasedBundleProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  
  // Modal state for editing quantity-based bundles
  const [editingProduct, setEditingProduct] = useState<QuantityBasedBundleProduct | null>(null);
  const [editingBundles, setEditingBundles] = useState<QuantityBasedBundle[]>([]);
  const [editingVariations, setEditingVariations] = useState<VariationChoice[]>([]);
  const [saving, setSaving] = useState(false);
  // "Add offers to a product": find a product that has none yet.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<QuantityBasedBundleProduct[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  /**
   * CRITICAL FIX: Normalize bundle ID from any format (string, ObjectId, buffer) to string
   * This ensures NO buffer objects are ever used in the frontend
   */
  const normalizeBundleId = (id: any): string | null => {
    if (!id) return null;
    if (typeof id === 'string') {
      const t = id.trim();
      if (t.length === 24 && /^[0-9a-fA-F]{24}$/.test(t)) return t;
      if (t.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(t)) return t;
      if (t.length === 32 && /^[0-9a-fA-F]{32}$/.test(t)) return t;
    }
    if (id && typeof id === 'object') {
      if (id._id) return normalizeBundleId(id._id);
      if (id.id) return normalizeBundleId(id.id);
      if (id.buffer) {
        try {
          const keys = Object.keys(id.buffer).map(k => Number(k)).sort((a, b) => a - b);
          const hex = keys.map(k => Number(id.buffer[k]).toString(16).padStart(2, '0')).join('');
          if (hex.length === 24 && /^[0-9a-fA-F]{24}$/.test(hex)) return hex;
        } catch { return null; }
      }
    }
    const str = String(id).trim();
    if (str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) return str;
    if (str.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(str)) return str;
    return null;
  };

  /**
   * Map a PG bundle row (GET /product-bundles returns pb.* + item_count) to the
   * list shape. The list endpoint is lightweight — it returns a COUNT, not the
   * items array, and there is no `options` concept in PostgreSQL.
   */
  const sanitizeBundle = (bundle: any): BundleListItem | null => {
    if (!bundle) return null;
    const normalizedId = normalizeBundleId(bundle._id ?? bundle.id);
    if (!normalizedId) {
      console.warn('⚠️ Invalid bundle ID, skipping:', bundle);
      return null;
    }
    return {
      _id: normalizedId,
      name: bundle.name || '',
      slug: bundle.slug || '',
      description: bundle.description || '',
      isActive: (bundle.isActive ?? bundle.is_active) !== false,
      price: Number(bundle.price ?? 0),
      compareAtPrice: bundle.compareAtPrice ?? bundle.compare_at_price ?? undefined,
      itemCount: Number(bundle.itemCount ?? bundle.item_count ?? 0),
      updatedAt: bundle.updatedAt ?? bundle.updated_at,
    };
  };

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
      const rawBundles = response?.data || response || [];
      
      // CRITICAL FIX: Sanitize all bundle IDs to strings (handle buffers)
      const sanitizedBundles = rawBundles
        .map(sanitizeBundle)
        .filter((bundle: BundleListItem | null): bundle is BundleListItem => bundle !== null);
      
      setBundles(sanitizedBundles);
    } catch (error: any) {
      console.error('Failed to load bundles', error);
      alert(error.message || 'Failed to load bundles');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuantityBasedBundles = async () => {
    try {
      setLoading(true);
      // Ask the DB for products that HAVE an offer instead of downloading the
      // catalogue and filtering here: the old code fetched one default-sized
      // page (20 of 7,500+ products) and filtered that, so a product with a
      // bundle simply never appeared unless it happened to be on page one.
      // limit is capped at 100 by the route validator — anything higher is a 400.
      const params: Record<string, any> = { hasBundles: true, limit: 100 };
      if (showActiveOnly) {
        params.active = true;
      }
      if (search.trim()) params.search = search.trim();
      const response = await productsAPI.getAll(params);
      const products = (response?.data?.products || response?.data || response || []) as any[];
      const rows = Array.isArray(products) ? products : [];

      // The staff product row filters with has_bundles but does not carry the
      // offers (ProductRowStaffView). Read them from the quantity-offers route
      // the editor already saves through, unless the row already has them.
      const withOffers = await Promise.all(rows.map(async (product): Promise<QuantityBasedBundleProduct | null> => {
        const id = String(product._id ?? product.id ?? '');
        let raw = product.bundles;
        if ((!Array.isArray(raw) || raw.length === 0) && id) {
          const got = await productQuantityBundlesAPI.get(id);
          raw = Array.isArray(got) ? got : (Array.isArray(got?.items) ? got.items : (Array.isArray(got?.data) ? got.data : []));
        }
        const bundles = (Array.isArray(raw) ? raw : []).map(toEditableOffer);
        if (!id || bundles.length === 0) return null;
        return {
          _id: id,
          name: String(product.name ?? ''),
          slug: String(product.slug ?? ''),
          price: basePriceOf(product),
          images: Array.isArray(product.images) ? product.images : [],
          isActive: product.isActive !== false,
          bundles,
        };
      }));

      const searchLower = search.trim().toLowerCase();
      const productsWithBundles = withOffers.filter((product): product is QuantityBasedBundleProduct => {
        if (!product) return false;
        if (!searchLower) return true;
        return (
          product.name.toLowerCase().includes(searchLower) ||
          product.slug.toLowerCase().includes(searchLower) ||
          product.bundles.some((b) =>
            b.title.toLowerCase().includes(searchLower) ||
            b.description.toLowerCase().includes(searchLower)
          )
        );
      });
      
      setQuantityBundleProducts(productsWithBundles);
    } catch (error: any) {
      console.error('Failed to load quantity-based bundles', error);
      alert(error.message || 'Failed to load quantity-based bundles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewType === 'combo') {
      fetchBundles();
    } else {
      fetchQuantityBasedBundles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (viewType === 'combo') {
      fetchBundles();
    } else {
      fetchQuantityBasedBundles();
    }
  };

  const handleToggleActive = async () => {
    setShowActiveOnly((prev) => !prev);
    setTimeout(() => {
      if (viewType === 'combo') {
        fetchBundles();
      } else {
        fetchQuantityBasedBundles();
      }
    }, 0);
  };

  const handleDelete = async (id: any) => {
    if (!window.confirm('Delete this bundle? This action cannot be undone.')) {
      return;
    }
    try {
      // CRITICAL FIX: Normalize bundle ID before using it
      const normalizedId = normalizeBundleId(id);
      if (!normalizedId) {
        console.error('Invalid bundle ID:', id);
        alert('Invalid bundle ID');
        return;
      }
      await bundlesAPI.delete(normalizedId);
      fetchBundles();
    } catch (error: any) {
      console.error('Failed to delete bundle', error);
      alert(error.message || 'Failed to delete bundle');
    }
  };

  // Quantity-based bundle management functions
  const handleEditQuantityBundles = (product: QuantityBasedBundleProduct) => {
    setEditingProduct(product);
    setEditingBundles(JSON.parse(JSON.stringify(product.bundles))); // Deep copy
    setEditingVariations([]);
    // The product's variations, for an offer meant for one variation only.
    const productId = normalizeBundleId(product._id);
    if (productId) {
      productsAPI.getById(productId)
        .then((detail: any) => {
          const vars: any[] = Array.isArray(detail?.variations) ? detail.variations : [];
          setEditingVariations(vars
            .filter((v) => v && (v.id || v._id))
            .map((v) => ({
              id: String(v.id ?? v._id),
              label: [v.name || v.title, v.sku ? `SKU ${v.sku}` : ''].filter(Boolean).join(' · ') || String(v.id ?? v._id),
            })));
        })
        .catch(() => setEditingVariations([]));
    }
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setEditingBundles([]);
    setEditingVariations([]);
  };

  const handlePickerSearch = async () => {
    const q = pickerQuery.trim();
    if (q.length < 2) return;
    setPickerLoading(true);
    try {
      const response = await productsAPI.getAll({ search: q, limit: 10 });
      const products = (response?.data?.products || response?.data || response || []) as any[];
      setPickerResults((Array.isArray(products) ? products : []).map((product) => ({
        _id: product._id ?? product.id,
        name: product.name,
        slug: product.slug,
        price: basePriceOf(product),
        images: product.images || [],
        isActive: product.isActive !== false,
        bundles: (Array.isArray(product.bundles) ? product.bundles : []).map(toEditableOffer),
      })));
    } catch (error: any) {
      alert(error.message || 'Failed to search products');
    } finally {
      setPickerLoading(false);
    }
  };

  const handleUpdateBundle = (index: number, field: keyof QuantityBasedBundle, value: string | number | boolean) => {
    setEditingBundles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddBundle = () => {
    setEditingBundles((prev) => [
      ...prev,
      {
        title: '',
        description: '',
        quantity: 2,
        priceType: 'percent',
        price: 0,
        discountPercent: 0,
        atLeast: true,
        variationId: '',
      },
    ]);
  };

  const handleDeleteBundle = (index: number) => {
    if (!window.confirm('Delete this bundle option? This action cannot be undone.')) {
      return;
    }
    setEditingBundles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDeleteAllBundles = () => {
    if (!window.confirm('Delete all bundles for this product? This action cannot be undone.')) {
      return;
    }
    setEditingBundles([]);
  };

  const handleDeleteAllBundlesFromTable = async (product: QuantityBasedBundleProduct) => {
    if (!window.confirm(`Delete all bundles for "${product.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // CRITICAL FIX: Normalize product ID before using it
      const productId = normalizeBundleId(product._id);
      if (!productId) {
        console.error('Invalid product ID:', product._id);
        alert('Invalid product ID');
        return;
      }
      // Use dedicated endpoint for deleting bundles
      await productQuantityBundlesAPI.delete(productId);

      // Refresh the list
      await fetchQuantityBasedBundles();
    } catch (error: any) {
      console.error('Failed to delete bundles', error);
      alert(error.message || 'Failed to delete bundles');
    }
  };

  const handleSaveQuantityBundles = async () => {
    if (!editingProduct) return;

    // Validate bundles
    for (let i = 0; i < editingBundles.length; i++) {
      const bundle = editingBundles[i];
      if (!bundle.title.trim()) {
        alert(`Bundle ${i + 1}: Title is required`);
        return;
      }
      if (!Number.isInteger(Number(bundle.quantity)) || bundle.quantity < 1) {
        alert(`Bundle ${i + 1}: Quantity must be a whole number of at least 1`);
        return;
      }
      if (bundle.priceType === 'pack' && !(bundle.price >= 0)) {
        alert(`Bundle ${i + 1}: Price must be 0 or higher`);
        return;
      }
      if (bundle.priceType === 'percent' && !(bundle.discountPercent > 0 && bundle.discountPercent < 100)) {
        alert(`Bundle ${i + 1}: Discount must be above 0% and below 100%`);
        return;
      }
      const clash = editingBundles.findIndex((o, j) => j < i
        && Number(o.quantity) === Number(bundle.quantity) && (o.variationId || '') === (bundle.variationId || ''));
      if (clash >= 0) {
        alert(`Bundle ${i + 1}: Bundle ${clash + 1} already has quantity ${bundle.quantity} for the same variation`);
        return;
      }
    }

    setSaving(true);
    try {
      // CRITICAL FIX: Normalize product ID before using it
      const productId = normalizeBundleId(editingProduct._id);
      if (!productId) {
        console.error('Invalid product ID:', editingProduct._id);
        alert('Invalid product ID');
        setSaving(false);
        return;
      }
      // Use dedicated endpoint for updating bundles only
      await productQuantityBundlesAPI.update(
        productId,
        editingBundles.map((b) => ({
          title: b.title.trim(),
          description: b.description.trim() || '',
          quantity: Number(b.quantity),
          // one of the two: the server refuses an offer with both or neither
          ...(b.priceType === 'percent'
            ? { discount_percent: Number(b.discountPercent) }
            : { price: Number(b.price) }),
          at_least: Boolean(b.atLeast),
          ...(b.variationId ? { variation_id: b.variationId } : {}),
        }))
      );

      // Refresh the list
      await fetchQuantityBasedBundles();
      handleCloseModal();
    } catch (error: any) {
      console.error('Failed to update bundles', error);
      alert(error.message || 'Failed to update bundles');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Bundles</h1>
          <p className="text-sm text-gray-600 mt-1">
            {viewType === 'combo' 
              ? 'Curate bundles of two or more products. Bundles surface in the storefront as swatch-style shortcuts so shoppers can jump directly to each product page.'
              : 'Manage quantity-based bundles for individual products. These bundles offer discounts when customers buy multiple quantities of the same product.'}
          </p>
        </div>
        {viewType === 'combo' && canManageBundles && (
          <button
            onClick={() => navigate('/products/bundles/new')}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            <FaPlus className="mr-2" />
            New Bundle
          </button>
        )}
        {viewType === 'quantity' && canManageBundles && (
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            <FaPlus className="mr-2" />
            Add offers to a product
          </button>
        )}
      </div>

      {viewType === 'quantity' && pickerOpen && canManageBundles && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <p className="text-sm text-gray-600 mb-3">
            Find the product, then add its packs (for example Pack of 2 · Pack of 6 · Pack of 10, each with its own discount).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePickerSearch(); } }}
              placeholder="Product name or SKU"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
            <button
              type="button"
              onClick={handlePickerSearch}
              disabled={pickerLoading || pickerQuery.trim().length < 2}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              {pickerLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {pickerResults.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-md">
              {pickerResults.map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{product.name}</div>
                    <div className="text-xs text-gray-500">
                      /{product.slug} · ₹{product.price}
                      {product.bundles.length > 0 ? ` · ${product.bundles.length} offer(s) already` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPickerOpen(false); handleEditQuantityBundles(product); }}
                    className="shrink-0 inline-flex items-center px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    <FaEdit className="mr-1" />
                    Set up packs
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setViewType('combo');
              setSearch('');
            }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewType === 'combo'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Combo Packs
          </button>
          <button
            onClick={() => {
              setViewType('quantity');
              setSearch('');
            }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              viewType === 'quantity'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Quantity-Based Bundles
          </button>
        </nav>
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
                placeholder={viewType === 'combo' 
                  ? "Search bundles by name or description"
                  : "Search products or bundle titles"}
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
                {viewType === 'combo' ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bundle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Products
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bundles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={viewType === 'combo' ? 5 : 4} className="px-6 py-10 text-center text-gray-500">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></span>
                      Loading {viewType === 'combo' ? 'bundles' : 'products'}...
                    </div>
                  </td>
                </tr>
              ) : viewType === 'combo' ? (
                bundles.length === 0 ? (
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
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                          <FaBoxOpen className="text-gray-400" />
                          {bundle.itemCount ?? 0} {bundle.itemCount === 1 ? 'product' : 'products'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <span className="font-semibold text-gray-900">₹{Number(bundle.price ?? 0).toLocaleString('en-IN')}</span>
                          {bundle.compareAtPrice != null && Number(bundle.compareAtPrice) > Number(bundle.price ?? 0) && (
                            <span className="ml-2 text-xs text-gray-400 line-through">₹{Number(bundle.compareAtPrice).toLocaleString('en-IN')}</span>
                          )}
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
                          {canManageBundles && (
                            <button
                              onClick={() => {
                                // CRITICAL FIX: Ensure bundle ID is a string before navigation
                                const bundleId = normalizeBundleId(bundle._id);
                                if (bundleId) {
                                  navigate(`/products/bundles/${bundleId}/edit`);
                                } else {
                                  console.error('Invalid bundle ID:', bundle._id);
                                  alert('Invalid bundle ID');
                                }
                              }}
                              className="p-2 text-gray-500 hover:text-gray-700"
                              title="Edit bundle"
                            >
                              <FaEdit />
                            </button>
                          )}
                          {canDeleteBundles && (
                            <button
                              onClick={() => handleDelete(bundle._id)}
                              className="p-2 text-red-500 hover:text-red-700"
                              title="Delete bundle"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : quantityBundleProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <FaBoxOpen size={42} />
                      <p className="text-sm font-medium">
                        No products with quantity-based bundles found.
                      </p>
                      <p className="text-xs text-gray-400">
                        Use “Add offers to a product” above to give a product its packs.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                quantityBundleProducts.map((product) => (
                  <tr key={product._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.images?.[0] && (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-12 h-12 rounded-md object-cover border border-gray-200"
                          />
                        )}
                        <div>
                          <div className="font-semibold text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500 mt-1">/{product.slug}</div>
                          <div className="text-sm text-gray-600 mt-1">Base Price: ₹{product.price}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {product.bundles.map((bundle, idx) => (
                          <div
                            key={`${product._id}-bundle-${idx}`}
                            className="text-sm text-gray-700 bg-gray-50 rounded-md p-2"
                          >
                            <div className="font-medium text-gray-900">{bundle.title}</div>
                            {bundle.description && (
                              <div className="text-xs text-gray-500 mt-0.5">{bundle.description}</div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-600">
                                Qty: {bundle.quantity}{bundle.atLeast ? ' or more' : ''}
                              </span>
                              {bundle.priceType === 'percent' ? (
                                <span className="text-gray-900 font-semibold">{bundle.discountPercent}% off each</span>
                              ) : (
                                <>
                                  <span className="text-gray-900 font-semibold">₹{bundle.price}</span>
                                  {bundle.quantity > 1 && (
                                    <span className="text-xs text-gray-500">
                                      (₹{Math.round(bundle.price / bundle.quantity)} per item)
                                    </span>
                                  )}
                                </>
                              )}
                              {bundle.variationId && (
                                <span className="text-xs text-gray-500">· one variation only</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {product.isActive ? (
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
                        {canManageBundles && (
                          <>
                            <button
                              onClick={() => handleEditQuantityBundles(product)}
                              className="p-2 text-gray-500 hover:text-gray-700"
                              title="Edit product bundles"
                            >
                              <FaEdit />
                            </button>
                            {/* Quantity-bundle delete route requires products.manage, not
                                products.delete — there is no separate delete permission for
                                this sub-resource (routes/productBundles.ts). */}
                            <button
                              onClick={() => handleDeleteAllBundlesFromTable(product)}
                              className="p-2 text-red-500 hover:text-red-700"
                              title="Delete all bundles for this product"
                            >
                              <FaTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Quantity-Based Bundles Modal */}
      {editingProduct && (
        <div 
          className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Quantity-Based Bundles</h2>
                <p className="text-sm text-gray-600 mt-1">{editingProduct.name}</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Configure quantity-based bundles for this product. Customers can buy multiple quantities at discounted prices.
                  The storefront shows them as pack choices; the checkout prices them on the server.
                </p>
                <div className="flex items-center gap-2">
                  {canManageBundles && editingBundles.length > 0 && (
                    <button
                      onClick={handleDeleteAllBundles}
                      className="inline-flex items-center px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                      title="Delete all bundles"
                    >
                      <FaTrash className="mr-1" />
                      Delete All
                    </button>
                  )}
                  {canManageBundles && (
                    <button
                      onClick={handleAddBundle}
                      className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      <FaPlus className="mr-1" />
                      Add Bundle
                    </button>
                  )}
                </div>
              </div>

              {editingBundles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FaBoxOpen size={32} className="mx-auto mb-2" />
                  <p className="text-sm">No bundles configured. Click "Add Bundle" to create one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {editingBundles.map((bundle, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">
                          Bundle {index + 1}
                        </h3>
                        {canManageBundles && (
                          <button
                            onClick={() => handleDeleteBundle(index)}
                            className="p-1.5 text-red-500 hover:text-red-700"
                            title="Delete bundle"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={bundle.title}
                            onChange={(e) => handleUpdateBundle(index, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            placeholder="e.g., Pack of 6"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={bundle.description}
                            onChange={(e) => handleUpdateBundle(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            placeholder="e.g., Two Jackets Bundle"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={bundle.quantity}
                            onChange={(e) => handleUpdateBundle(index, 'quantity', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Applies to
                          </label>
                          <select
                            value={bundle.atLeast ? 'at_least' : 'exact'}
                            onChange={(e) => handleUpdateBundle(index, 'atLeast', e.target.value === 'at_least')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm bg-white"
                          >
                            <option value="at_least">{bundle.quantity || 'N'} or more units</option>
                            <option value="exact">Exactly {bundle.quantity || 'N'} units</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Price type
                          </label>
                          <select
                            value={bundle.priceType}
                            onChange={(e) => handleUpdateBundle(index, 'priceType', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm bg-white"
                          >
                            <option value="percent">% off each unit</option>
                            <option value="pack">Pack price (total for the pack)</option>
                          </select>
                        </div>
                        {bundle.priceType === 'percent' ? (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Discount % <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={99.99}
                              step="0.01"
                              value={bundle.discountPercent}
                              onChange={(e) => handleUpdateBundle(index, 'discountPercent', Number(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                              placeholder="0"
                            />
                            {editingProduct && editingProduct.price > 0 && bundle.discountPercent > 0 && bundle.discountPercent < 100 && (
                              <p className="text-xs text-gray-500 mt-1">
                                ₹{(Math.round(editingProduct.price * (100 - bundle.discountPercent)) / 100).toLocaleString('en-IN')} per item at today's ₹{editingProduct.price} (the checkout applies it to each variation's own price)
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Bundle Price <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={bundle.price}
                              onChange={(e) => handleUpdateBundle(index, 'price', Number(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                              placeholder="0"
                            />
                            {bundle.quantity > 0 && bundle.price > 0 && (
                              <p className="text-xs text-gray-500 mt-1">
                                ₹{Math.round(bundle.price / bundle.quantity)} per item
                              </p>
                            )}
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Variation
                          </label>
                          <select
                            value={bundle.variationId}
                            onChange={(e) => handleUpdateBundle(index, 'variationId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm bg-white"
                          >
                            <option value="">All variations</option>
                            {editingVariations.map((v) => (
                              <option key={v.id} value={v.id}>{v.label}</option>
                            ))}
                            {bundle.variationId && !editingVariations.some((v) => v.id === bundle.variationId) && (
                              <option value={bundle.variationId}>{bundle.variationId}</option>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={saving}
              >
                Cancel
              </button>
              {canManageBundles && (
                <button
                  onClick={handleSaveQuantityBundles}
                  disabled={saving || editingBundles.length === 0}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed inline-flex items-center"
                >
                  {saving ? (
                    <>
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <FaSave className="mr-2" />
                      Save Bundles
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bundles;


