/**
 * EDIT AN ORDER'S LINES — add or remove products, change quantities, adjust the
 * order discount.
 *
 * ── IT NO LONGER ASKS YOU TO COMMIT BLIND ───────────────────────────────────
 * Item prices come from the B2B/batch waterfall, GST from each line's own rate
 * and place of supply, shipping and the COD fee from the store's own config —
 * none of which a browser can compute. So this form used to be filled in with
 * no idea of the resulting total: you pressed "Save & Reprice" and found out
 * afterwards. Every figure in the summary below now comes from
 * `POST /orders/:id/items/preview`, which runs the SAME `priceOrderItems` →
 * `repriceOrderMoney` pair the save runs, so what is on screen is what will be
 * written (CLAUDE.md rule 7a — there is one totals brain and this is not a
 * second one).
 *
 * ── AND IT SAYS WHY IT CANNOT SAVE ──────────────────────────────────────────
 * The gate lives on the server (`assertOrderMoneyEditable`: unpaid, unshipped,
 * no issued tax invoice, status still open). The preview returns that verdict,
 * so the dialog can show the figures AND state the refusal in the server's own
 * words instead of failing on submit.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { FaSearch, FaTrash, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, productsAPI, type OrderItemsPreview } from '../../services/api';

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
  const [preview, setPreview] = useState<OrderItemsPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const priceTimer = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLines((items ?? [])
      // A line already cancelled to zero is not part of the order any more; it
      // stays in `order_items` as the record of what came off (migration 168)
      // and must not be re-added by an edit.
      .filter((i: any) => Number(i.quantity) > 0)
      .map((i: any) => ({
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
    setPreview(null);
    setPreviewError(null);
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

  /** What the server would charge for this basket. Debounced; cleared first so a
   *  stale figure is never shown next to a changed quantity. */
  const payload = useMemo(() => lines.map((l) => ({
    productId: l.productId, variationId: l.variationId, sku: l.sku, quantity: l.quantity,
  })), [lines]);

  useEffect(() => {
    if (!isOpen || !lines.length) { setPreview(null); return; }
    clearTimeout(priceTimer.current);
    setPreview(null);
    setPreviewing(true);
    priceTimer.current = setTimeout(async () => {
      try {
        setPreview(await ordersAPI.previewItems(orderId, {
          items: payload,
          discount: discount !== '' ? Math.max(0, parseFloat(discount) || 0) : undefined,
        }));
        setPreviewError(null);
      } catch (e: any) {
        setPreviewError(e?.response?.data?.message || 'Could not price this basket');
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(priceTimer.current);
  }, [JSON.stringify(payload), discount, isOpen, orderId]);

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

  /** The server's own verdict, surfaced BEFORE the submit rather than on it. */
  const blocked = preview?.editable ?? null;

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="px-5 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-semibold text-sm">
        Cancel
      </button>
      <button type="button" onClick={handleSave} disabled={saving || !!blocked || previewing}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm">
        {saving ? 'Saving…'
          : blocked ? 'Cannot be saved'
          : preview ? `Save — new total ${money(preview.total)}`
          : 'Save & Reprice'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Order Items" footer={footer} maxWidth="3xl">
      <div className="space-y-4">
        {blocked ? (
          <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <FaExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{blocked}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            Prices, discounts, GST and the total are recomputed on the server — the figures below
            are the ones that will be saved.
          </p>
        )}
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
          {lines.map((l, idx) => {
            // The server's price for THIS line, matched on the identity it was
            // sent with — never the catalogue price this dialog guessed at when
            // the row was added.
            const priced = preview?.lines?.find(
              (pl) => (l.variationId && pl.variation_id === l.variationId) || (!!l.sku && pl.sku === l.sku),
            );
            return (
              <div key={idx} className="flex items-center gap-3 border rounded-md px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{l.name}</p>
                  <p className="text-xs text-gray-500">
                    {[l.variantLabel, l.sku ? `SKU ${l.sku}` : null,
                      `${money(priced?.price ?? l.price)}/unit`].filter(Boolean).join(' · ')}
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
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                  {priced ? money(priced.line_total) : <span className="text-slate-300">—</span>}
                </span>
                <button type="button" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-700 p-1.5">
                  <FaTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No items — add products above.</p>}
        </div>

        <div className="flex items-center gap-3 border-t pt-3">
          <label className="text-sm text-gray-700">Order discount (₹)</label>
          <input type="number" min={0} placeholder="0" value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-28 px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
          <span className="text-xs text-gray-400">Applied before GST, recorded as a manual discount.</span>
        </div>

        {/* ── WHAT THE SAVE WILL WRITE ──────────────────────────────────────── */}
        {previewing && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <FaSpinner className="h-3.5 w-3.5 animate-spin" /> Pricing this basket…
          </p>
        )}
        {previewError && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{previewError}</p>}
        {preview && !previewing && (
          <div className="rounded-lg border bg-slate-50 p-3">
            <dl className="space-y-1 text-sm">
              <Row label="Items" value={money(preview.subtotal)} />
              {preview.discount > 0 && <Row label="Discount" value={`− ${money(preview.discount)}`} tone="credit" />}
              {preview.shipping_cost > 0 && <Row label="Shipping" value={money(preview.shipping_cost)} />}
              {preview.cod_fee > 0 && <Row label="COD handling" value={money(preview.cod_fee)} />}
              {preview.tax > 0 && <Row label="GST" value={money(preview.tax)} />}
              <div className="mt-1 flex items-baseline justify-between border-t pt-1.5">
                <dt className="text-sm font-bold uppercase tracking-wider text-slate-700">New total</dt>
                <dd className="text-lg font-bold tabular-nums text-slate-900">{money(preview.total)}</dd>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <dt className="text-slate-500">Was {money(preview.current_total)}</dt>
                <dd className={`font-semibold tabular-nums ${
                  preview.difference > 0 ? 'text-rose-700' : preview.difference < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {preview.difference === 0 ? 'no change'
                    : `${preview.difference > 0 ? '+' : '−'} ${money(Math.abs(preview.difference))}`}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; tone?: 'credit' }> = ({ label, value, tone }) => (
  <div className="flex items-baseline justify-between">
    <dt className="text-slate-600">{label}</dt>
    <dd className={`tabular-nums font-medium ${tone === 'credit' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</dd>
  </div>
);

export default OrderItemsEditModal;
