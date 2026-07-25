/**
 * Edit an order's lines while payment is still pending — add/remove products,
 * change quantities, adjust the order discount. Everything is repriced
 * server-side on save (B2B tiers and GST recompute automatically); a history
 * entry records the edit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FaSearch, FaTrash } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, productsAPI, searchAPI } from '../../services/api';

interface EditLine {
  productId: string;
  variationId?: string;
  sku?: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  price: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  items: any[];
  currentDiscount: number;
  onSaved: () => void;
}

const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OrderItemsEditModal: React.FC<Props> = ({ isOpen, onClose, orderId, items, currentDiscount, onSaved }) => {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picking, setPicking] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLines((items ?? []).map((i: any) => ({
      productId: i.product_id ?? i.productId,
      variationId: i.variation_id ?? i.variationId ?? undefined,
      sku: i.sku ?? undefined,
      name: i.product_name ?? i.productName ?? 'Item',
      variantLabel: Object.values(i.attributes ?? {}).filter(Boolean).join(' · ') || undefined,
      quantity: Number(i.quantity) || 1,
      price: Number(i.price) || 0,
    })));
    setDiscount(currentDiscount > 0 ? String(currentDiscount) : '');
    setError(null);
  }, [isOpen, items, currentDiscount]);

  useEffect(() => {
    if (search.trim().length < 3) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setResults(await searchAPI.query('product', search.trim(), 8));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [search]);

  const pickProduct = async (r: any) => {
    setResults([]);
    setSearch('');
    try {
      const p = await productsAPI.getById(r.id);
      const prod = p?.data ?? p;
      const variations: any[] = prod?.variations ?? [];
      if (variations.length > 0) setPicking(prod);
      else addLine(prod, null);
    } catch { setError('Could not load the product'); }
  };

  const addLine = (prod: any, variation: any | null) => {
    const price = Number(variation?.salePrice ?? variation?.sale_price ?? variation?.sellingPrice ?? variation?.selling_price
      ?? prod?.salePrice ?? prod?.sale_price ?? prod?.sellingPrice ?? prod?.selling_price ?? prod?.mrp ?? 0);
    setLines(ls => [...ls, {
      productId: prod.id ?? prod._id,
      variationId: variation?.id ?? variation?._id ?? undefined,
      sku: variation?.sku ?? prod?.sku ?? undefined,
      name: prod.title ?? prod.name ?? 'Product',
      variantLabel: Object.values(variation?.attributes ?? {}).filter(Boolean).join(' · ') || undefined,
      quantity: 1,
      price,
    }]);
    setPicking(null);
  };

  const handleSave = async () => {
    if (!lines.length) { setError('An order needs at least one item — cancel the order instead of emptying it.'); return; }
    setSaving(true);
    setError(null);
    try {
      await ordersAPI.updateItems(orderId, {
        items: lines.map(l => ({
          productId: l.productId, variationId: l.variationId, sku: l.sku, quantity: l.quantity,
        })),
        discount: discount !== '' ? Math.max(0, parseFloat(discount) || 0) : undefined,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update the order');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="px-5 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold text-sm">
        Cancel
      </button>
      <button type="button" onClick={handleSave} disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm">
        {saving ? 'Saving…' : 'Save & Reprice'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Order Items" footer={footer} maxWidth="2xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Allowed while payment is pending and before a shipment exists. Prices, discounts,
          GST and the total are recomputed server-side on save.
        </p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

        <div className="relative">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
            <input
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search products to add (min 3 chars)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full border rounded-md bg-white shadow-lg max-h-56 overflow-y-auto">
              {results.map((r: any) => (
                <button key={r.id} type="button" onClick={() => pickProduct(r)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="font-medium">{r.label}</span>
                  {r.sublabel && <span className="text-gray-400 text-xs ml-2">{r.sublabel}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {picking && (
          <div className="border rounded-md p-3 bg-blue-50/60">
            <p className="text-sm font-semibold mb-2">Pick a variation of {picking.title ?? picking.name}:</p>
            <div className="flex flex-wrap gap-2">
              {(picking.variations ?? []).map((v: any) => (
                <button key={v.id ?? v._id} type="button" onClick={() => addLine(picking, v)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-white">
                  {Object.values(v.attributes ?? {}).filter(Boolean).join(' · ') || v.sku || 'Variant'}
                </button>
              ))}
              <button type="button" onClick={() => setPicking(null)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-center gap-3 border rounded-md px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{l.name}</p>
                <p className="text-xs text-gray-500">
                  {[l.variantLabel, l.sku ? `SKU ${l.sku}` : null, `~${money(l.price)}/unit`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <input
                type="number" min={1} value={l.quantity}
                onChange={(e) => {
                  const q = Math.max(1, parseInt(e.target.value) || 1);
                  setLines(ls => ls.map((x, i) => i === idx ? { ...x, quantity: q } : x));
                }}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center"
              />
              <button type="button" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}
                className="text-red-500 hover:text-red-700 p-1.5">
                <FaTrash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No items — add products above.</p>}
        </div>

        <div className="flex items-center gap-3 border-t pt-3">
          <label className="text-sm text-gray-700">Order discount (₹)</label>
          <input type="number" min={0} placeholder="0" value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-28 px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
          <span className="text-xs text-gray-400">Applied before GST, recorded as a manual discount.</span>
        </div>
      </div>
    </Modal>
  );
};

export default OrderItemsEditModal;
