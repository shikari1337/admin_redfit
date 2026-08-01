import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from 'react-icons/fa';
import { productsAPI, uploadAPI, taxRulesAPI } from '../services/api';
import type { ProductVariation } from '../types/productForm';
import { useAuth } from '../contexts/AuthContext';
import ProductInventoryPanel from '../components/product/ProductInventoryPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VariationEditPage: React.FC = () => {
  const { productSlug, variationIndex } = useParams<{ productSlug: string; variationIndex: string }>();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const [product, setProduct] = useState<any>(null);
  const [variation, setVariation] = useState<ProductVariation | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [taxRules, setTaxRules] = useState<Array<{ _id: string; id?: string; name: string; rate?: number }>>([]);

  const idx = variationIndex !== undefined ? parseInt(variationIndex, 10) : -1;

  useEffect(() => {
    if (productSlug) loadProduct();
    taxRulesAPI.getAll().then(setTaxRules).catch(() => {});
  }, [productSlug]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const prod = await productsAPI.getBySlug(productSlug!);
      setProduct(prod);
      const v = prod?.variations?.[idx];
      if (!v) {
        alert('Variation not found');
        navigate(`/products/${productSlug}/edit`);
        return;
      }
      setVariation({
        ...v,
        id: v.id || `var-loaded-${idx}`,
      });
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
      const updatedVariations = [...(product.variations || [])];
      updatedVariations[idx] = {
        ...updatedVariations[idx],
        ...variation,
      };
      await productsAPI.update(product._id, { variations: updatedVariations });
      navigate(`/products/${productSlug}/edit`);
    } catch {
      alert('Failed to save variation');
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/products/${productSlug}/edit`)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FaArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Edit Variation</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {product?.name} — Variant {idx + 1}
              {v.sku && <span className="ml-2 font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{v.sku}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : 'Save Variation'}
        </button>
      </div>

      {/* Identity */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Identity</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Variation name</label>
            <input
              type="text"
              value={v.name || ''}
              onChange={e => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Abies canadensis CH 30C 30ml"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
            <input
              type="text"
              value={v.slug || ''}
              onChange={e => handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. abies-canadensis-ch-30c-30ml"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
          <input
            type="text"
            value={v.sku || ''}
            onChange={e => handleChange('sku', e.target.value.toUpperCase().slice(0, 48))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="SKU"
          />
        </div>
      </div>

      {/* Pricing & Stock */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Pricing &amp; Stock</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
            <input
              type="number" step="0.01" min="0"
              value={v.price ?? ''}
              onChange={e => handleChange('price', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Compare at (₹)</label>
            <input
              type="number" step="0.01" min="0"
              value={v.originalPrice ?? ''}
              onChange={e => handleChange('originalPrice', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stock</label>
            <input
              type="number" min="0"
              value={v.stock ?? 0}
              onChange={e => handleChange('stock', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
            <p className="text-[11px] text-gray-400 mt-1">Changes book a ledgered adjustment (see Inventory &amp; ERP below); unchanged values are ignored.</p>
          </div>
          <div className="flex flex-col justify-center">
            <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => handleChange('isActive', !(v.isActive !== false))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  v.isActive !== false ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  v.isActive !== false ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-sm text-gray-700">{v.isActive !== false ? 'Active' : 'Draft'}</span>
            </label>
          </div>
        </div>

        {/* HSN + Tax Rule — gst_tax module only; with the module off the backend
            strips these fields, so showing the inputs would silently lie. */}
        {canAccess('gst_tax') && (
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">HSN Code</label>
            <input
              type="text"
              value={v.hsnCode || v.hsn_code || ''}
              onChange={e => handleChange('hsnCode', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 3004"
            />
            <p className="text-xs text-gray-400 mt-1">For GST compliance. Overrides product-level HSN.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tax Rule</label>
            <select
              value={v.taxRuleId || v.tax_rule_id || ''}
              onChange={e => handleChange('taxRuleId', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
            <p className="text-xs text-gray-400 mt-1">GST vs IGST auto-determined from delivery address.</p>
          </div>
        </div>
        )}
      </div>

      {/* Inventory & ERP — live balances, batches, incoming POs, ledger history */}
      {UUID_RE.test(String(v.id || '')) && (
        <ProductInventoryPanel
          variationId={String(v.id)}
          sku={v.sku}
          onStockChanged={(newStock) => handleChange('stock', newStock)}
        />
      )}

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Content</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Short description</label>
          <textarea
            value={v.shortDescription || ''}
            onChange={e => handleChange('shortDescription', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief variation description shown in product listing"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={v.description || ''}
            onChange={e => handleChange('description', e.target.value)}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Variation-specific description (overrides product description when this variant is selected)"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dosage</label>
            <textarea
              value={v.dosage || ''}
              onChange={e => handleChange('dosage', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Dosage instructions for this variation"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Important info</label>
            <textarea
              value={v.importantInfo || ''}
              onChange={e => handleChange('importantInfo', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Manufacturer info, warnings, regulatory details"
            />
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">FAQs</h2>
          <button
            type="button"
            onClick={addFaq}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FaPlus size={10} /> Add FAQ
          </button>
        </div>
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
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Question"
                />
                <textarea
                  value={faq.answer || ''}
                  onChange={e => handleFaqChange(fi, 'answer', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Answer"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Categories (read-only) */}
      {Array.isArray(v.categories) && v.categories.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Categories <span className="text-xs font-normal text-gray-400">(set via CSV import)</span></h2>
          <div className="flex flex-wrap gap-1.5">
            {v.categories.map((cat: any, ci: number) => {
              const label = typeof cat === 'object' ? (cat.name || cat.slug || String(cat._id)) : String(cat);
              return (
                <span key={ci} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Attributes (read-only) */}
      {Object.keys(v.attributes || {}).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Attributes</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(v.attributes).map(([k, val]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md font-medium">
                <span className="text-gray-400">{k}:</span> {String(val)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Images */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Images</h2>
        <div className="flex items-start gap-3 flex-wrap">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-dashed border-gray-300 rounded-md text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
            {uploading ? 'Uploading…' : '+ Add images'}
            <input
              type="file" accept="image/*" multiple className="hidden"
              disabled={uploading}
              onChange={e => { if (e.target.files) { handleImageUpload(e.target.files); e.target.value = ''; } }}
            />
          </label>
          {(v.images || []).map((url: string, imgIdx: number) => (
            <div key={imgIdx} className="relative group w-20 h-20 flex-shrink-0">
              <img src={url} alt={`img-${imgIdx}`} className="w-full h-full object-cover rounded-md border border-gray-200" />
              <button
                type="button"
                onClick={() => handleChange('images', (v.images || []).filter((_: any, i: number) => i !== imgIdx))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer save */}
      <div className="flex justify-end pb-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : 'Save Variation'}
        </button>
      </div>
    </div>
  );
};

export default VariationEditPage;
