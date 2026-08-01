/**
 * Edit an order's lines while payment is still pending — add/remove products,
 * change quantities, adjust the order discount. Everything is repriced
 * server-side on save (B2B tiers and GST recompute automatically); a history
 * entry records the edit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FaSearch, FaTrash } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, productsAPI } from '../../services/api';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLines((items ?? []).map((i: any) => ({
      productId: i.product_id ?? i.productId,
      variationId: i.variation_id ?? i.variationId ?? undefined,
      // Show the store's own SKU and the full pack name (see CATALOG_LABEL_SQL);
      // the sale-time snapshot is the fallback.
      sku: i.catalog_sku ?? i.catalogSku ?? i.sku ?? undefined,
      name: i.catalog_name ?? i.catalogName ?? i.product_name ?? i.productName ?? 'Item',
      variantLabel: Object.values(i.attributes ?? {}).filter(Boolean).join(' · ') || undefined,
      quantity: Number(i.quantity) || 1,
      price: Number(i.price) || 0,
    })));
    setDiscount(currentDiscount > 0 ? String(currentDiscount) : '');
    setError(null);
  }, [isOpen, items, currentDiscount]);

  // SKU-level search, same as the manual-order screen: a line must name the PACK
  // (the variation), otherwise it binds to the parent product and the order,
  // invoice and packing slip all show the short family name and the generated
  // `P-…` placeholder SKU. See productsAPI.searchVariations.
  useEffect(() => {
    if (search.trim().length < 3) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setResults(await productsAPI.searchVariations(search.trim(), 12));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [search]);

  const addLine = (v: any) => {
    const price = Number(v.salePrice ?? v.sale_price ?? v.sellingPrice ?? v.selling_price ?? v.mrp ?? 0);
    const productId = v.productId ?? v.product_id;
    if (!productId) { setError('That row has no product reference'); return; }
    setLines(ls => [...ls, {
      productId,
      variationId: v.isVariation === false || v.is_variation === false
        ? undefined : (v.variationId ?? v.variation_id ?? v.id),
      sku: v.sku ?? undefined,
      name: v.name ?? v.title ?? 'Product',
      variantLabel: Object.entries(v.attributes ?? {})
        .filter(([, val]) => val != null && String(val).trim() !== '')
        .map(([, val]) => String(val)).join(' · ') || undefined,
      quantity: 1,
      price,
    }]);
    setResults([]);
    setSearch('');
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
              placeholder="Search by SKU or full pack name (min 3 chars)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full border rounded-md bg-white shadow-lg max-h-56 overflow-y-auto">
              {results.map((r: any) => (
                <button key={r.id} type="button" onClick={() => addLine(r)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0">
                  <span className="font-medium">{r.name ?? r.title}</span>
                  <span className="text-gray-400 text-xs ml-2 font-mono">SKU {r.sku ?? '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

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
