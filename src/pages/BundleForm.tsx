import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { bundlesAPI, productsAPI } from '../services/api';
import { FaArrowLeft, FaTrash, FaSearch } from 'react-icons/fa';
import ImageInputWithActions from '../components/common/ImageInputWithActions';

// ─────────────────────────────────────────────────────────────────────────────
// Bundle editor — matches the PostgreSQL contract the backend actually stores:
//   product_bundles(name, slug, description, price, compare_at_price, images[], is_active)
//   product_bundle_items(bundle_id, product_id, quantity, discount_percent)
// (The previous version was written for the old Mongo schema — it sent
// items:[{product,swatchImage}] + an `options` array the backend ignores, and a
// plain <select> of every product. That silently failed to save and wasn't
// searchable.)
// ─────────────────────────────────────────────────────────────────────────────

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const productPrice = (p: any): number => Number(p.final_price ?? p.selling_price ?? p.price ?? 0);

interface BundleItem {
  product_id: string;
  name: string;
  sku?: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  discount_percent: number;
}

// ─── Searchable product picker (debounced, adds a product as a bundle item) ────
const ProductSearchPicker: React.FC<{
  excludeIds: string[];
  onPick: (p: { id: string; name: string; sku?: string; image?: string; price: number }) => void;
}> = ({ excludeIds, onPick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await productsAPI.getAll({ search: query, limit: 12 });
        const list: any[] = Array.isArray(res) ? res : (res?.data || []);
        setResults(list);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [query]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const shown = results.filter(r => !excludeIds.includes(r.id || r._id));

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search products by name or SKU to add…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      {open && (query || loading) && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
          {!loading && shown.length === 0 && query && (
            <p className="px-3 py-2 text-xs text-gray-400">No products found for “{query}”.</p>
          )}
          {shown.map(p => {
            const id = p.id || p._id;
            return (
              <button
                key={id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onPick({ id, name: p.name, sku: p.sku, image: p.images?.[0], price: productPrice(p) });
                  setQuery(''); setOpen(false); setResults([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
              >
                {p.images?.[0]
                  ? <img src={p.images[0]} alt="" className="w-9 h-9 object-cover rounded shrink-0" />
                  : <div className="w-9 h-9 bg-gray-100 rounded shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 truncate">{p.sku || '—'}</p>
                </div>
                <span className="text-sm font-medium text-gray-700 shrink-0">{inr(productPrice(p))}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main form ─────────────────────────────────────────────────────────────────
const BundleForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  const [compareAtPrice, setCompareAtPrice] = useState<string>('');
  const [image, setImage] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<BundleItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (!slugEdited) setSlug(slugify(name)); }, [name, slugEdited]);

  // ── Load (edit) — backend GET /:slug returns items with name/sku/price ──
  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await bundlesAPI.getById(id);
        const b = res?.data || res;
        setName(b.name || '');
        setSlug(b.slug || ''); setSlugEdited(true);
        setDescription(b.description || '');
        setPrice(b.price != null ? String(b.price) : '');
        setCompareAtPrice(b.compare_at_price != null ? String(b.compare_at_price) : '');
        const imgs = Array.isArray(b.images) ? b.images : [];
        setImage(imgs[0] || '');
        setIsActive(b.is_active !== false);
        setItems((b.items || []).map((it: any) => ({
          product_id: it.product_id,
          name: it.name || 'Product',
          sku: it.sku,
          image: Array.isArray(it.images) ? it.images[0] : undefined,
          unitPrice: Number(it.price ?? 0),
          quantity: Number(it.quantity ?? 1),
          discount_percent: Number(it.discount_percent ?? 0),
        })));
      } catch (e: any) {
        alert(e?.response?.data?.message || e.message || 'Failed to load bundle');
        navigate('/products/bundles');
      } finally { setLoading(false); }
    })();
  }, [id, isEdit, navigate]);

  const addItem = (p: { id: string; name: string; sku?: string; image?: string; price: number }) => {
    setItems(prev => prev.some(i => i.product_id === p.id) ? prev
      : [...prev, { product_id: p.id, name: p.name, sku: p.sku, image: p.image, unitPrice: p.price, quantity: 1, discount_percent: 0 }]);
    setErrors(e => ({ ...e, items: '' }));
  };
  const patchItem = (idx: number, patch: Partial<BundleItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Live totals: what the components cost separately vs the bundle price ──
  const componentsTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.unitPrice * it.quantity * (1 - (it.discount_percent || 0) / 100), 0),
    [items]
  );
  const bundlePrice = parseFloat(price) || 0;
  const savings = componentsTotal - bundlePrice;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Bundle name is required';
    if (!slugify(slug)) e.slug = 'Slug is required';
    if (items.length < 2) e.items = 'A bundle needs at least 2 products';
    if (!price || bundlePrice <= 0) e.price = 'Enter a bundle price greater than 0';
    if (compareAtPrice && parseFloat(compareAtPrice) < bundlePrice) e.compareAtPrice = 'Compare-at price should be ≥ bundle price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slugify(slug),
        description: description.trim() || undefined,
        price: bundlePrice,
        compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
        images: image.trim() ? [image.trim()] : [],
        is_active: isActive,
        items: items.map(it => ({
          product_id: it.product_id,
          quantity: Math.max(1, Number(it.quantity) || 1),
          discount_percent: Math.max(0, Math.min(100, Number(it.discount_percent) || 0)),
        })),
      };
      if (isEdit && id) await bundlesAPI.update(id, payload);
      else await bundlesAPI.create(payload);
      navigate('/products/bundles');
    } catch (e: any) {
      alert(e?.response?.data?.message || e.message || 'Failed to save bundle');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
      </div>
    );
  }

  const selectedIds = items.map(i => i.product_id);

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="mb-6">
        <button onClick={() => navigate('/products/bundles')} className="flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <FaArrowLeft className="mr-2" /> Back to Bundles
        </button>
        <h1 className="text-3xl font-bold text-gray-900">{isEdit ? 'Edit Bundle' : 'Create Bundle'}</h1>
        <p className="text-sm text-gray-600 mt-2">
          Group two or more products and sell them together at a bundle price. Search the catalog to add
          products, set each quantity, then set the combined price customers pay.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Details ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bundle Name <span className="text-red-500">*</span></label>
              <input value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name: '' })); }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., Cold & Cough Combo" />
              {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug <span className="text-red-500">*</span></label>
              <input value={slug}
                onChange={e => { setSlugEdited(true); setSlug(e.target.value); setErrors(x => ({ ...x, slug: '' })); }}
                onBlur={e => setSlug(slugify(e.target.value))}
                className={`w-full px-3 py-2 border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.slug ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="cold-cough-combo" />
              {errors.slug && <p className="mt-1 text-sm text-red-500">{errors.slug}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Why these products work well together." />
          </div>
          <div>
            <ImageInputWithActions value={image} onChange={setImage} label="Bundle image (optional)" placeholder="https://…"
              contextData={name ? { productName: name } : undefined} />
          </div>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded mr-2" />
            Active (visible in store)
          </label>
        </div>

        {/* ── Products (searchable) ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Products in this bundle</h2>
            <p className="text-sm text-gray-600 mt-1">Add at least 2 products. Set a quantity and, optionally, a per-item discount.</p>
          </div>

          <ProductSearchPicker excludeIds={selectedIds} onPick={addItem} />
          {errors.items && <p className="text-sm text-red-500">{errors.items}</p>}

          {items.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
              No products yet — search above to add them.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {items.map((it, idx) => (
                <div key={it.product_id} className="flex items-center gap-3 p-3">
                  {it.image ? <img src={it.image} alt="" className="w-11 h-11 object-cover rounded shrink-0" />
                    : <div className="w-11 h-11 bg-gray-100 rounded shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{it.name}</p>
                    <p className="text-xs text-gray-400 truncate">{it.sku || '—'} · {inr(it.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="text-xs text-gray-500">Qty</label>
                    <input type="number" min={1} value={it.quantity}
                      onChange={e => patchItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm" />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="text-xs text-gray-500">Disc %</label>
                    <input type="number" min={0} max={100} value={it.discount_percent}
                      onChange={e => patchItem(idx, { discount_percent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm" />
                  </div>
                  <span className="w-20 text-right text-sm font-medium text-gray-700 shrink-0">
                    {inr(it.unitPrice * it.quantity * (1 - (it.discount_percent || 0) / 100))}
                  </span>
                  <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 shrink-0">
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pricing ── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Bundle pricing</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bundle Price <span className="text-red-500">*</span></label>
              <input type="number" min={0} step="0.01" value={price}
                onChange={e => { setPrice(e.target.value); setErrors(x => ({ ...x, price: '' })); }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., 499" />
              {errors.price && <p className="mt-1 text-sm text-red-500">{errors.price}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Compare-at Price (optional)</label>
              <input type="number" min={0} step="0.01" value={compareAtPrice}
                onChange={e => { setCompareAtPrice(e.target.value); setErrors(x => ({ ...x, compareAtPrice: '' })); }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.compareAtPrice ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Strikethrough 'was' price" />
              {errors.compareAtPrice && <p className="mt-1 text-sm text-red-500">{errors.compareAtPrice}</p>}
            </div>
          </div>

          {/* Live savings readout */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-gray-600">
              <span>Buying the {items.length} product{items.length === 1 ? '' : 's'} separately</span>
              <span className="font-medium">{inr(componentsTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Bundle price</span>
              <span className="font-medium">{inr(bundlePrice)}</span>
            </div>
            <div className={`flex justify-between font-semibold pt-1.5 border-t border-gray-200 ${savings > 0 ? 'text-green-600' : savings < 0 ? 'text-red-600' : 'text-gray-700'}`}>
              <span>{savings >= 0 ? 'Customer saves' : 'Bundle costs MORE than separate'}</span>
              <span>{inr(Math.abs(savings))}{componentsTotal > 0 && savings > 0 ? ` (${Math.round((savings / componentsTotal) * 100)}%)` : ''}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/products/bundles')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400">
            {saving ? 'Saving…' : isEdit ? 'Update Bundle' : 'Create Bundle'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BundleForm;
