import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriveOrderMoney, SHIPPING_GST_RATE, type GstInfo } from '../../lib/orderMoney';

interface OrderItem {
  // The `items` array arrives as an opaque JSONB blob (the API interceptor
  // skips camelCase-aliasing it, by design, to protect other JSONB payloads
  // elsewhere) — so real order_items rows only ever carry their snake_case
  // column names. Read those directly rather than relying on aliasing.
  product_id?: string;
  productId?: string;
  product_name?: string;
  productName?: string;
  sku?: string;
  /**
   * Full pack name and the store's OWN SKU, resolved against the live catalogue
   * by the order read path (`CATALOG_LABEL_SQL`, backend db/queries/orders.ts).
   * `product_name`/`sku` are the sale-time snapshot and stay as the fallback —
   * for a line placed without a variation they hold the parent product's short
   * name and its generated `P-…` placeholder SKU, which is neither what the
   * store stocks nor what it ships.
   */
  catalog_name?: string;
  catalogName?: string;
  catalog_sku?: string;
  catalogSku?: string;
  /**
   * HSN, BRAND and GST RATE of the pack sold, from the same read path
   * (2026-09-06). All resolve VARIATION-first where the column exists on the
   * variation: brand is a card axis on this catalogue, so a brand-mixed parent
   * can carry no `brand_id` while every variation carries the real one. None of
   * the three is snapshotted on `order_items` — they are live catalogue values.
   */
  catalog_hsn?: string | null;
  catalogHsn?: string | null;
  catalog_brand?: string | null;
  catalogBrand?: string | null;
  catalog_tax_rate?: number | string | null;
  catalogTaxRate?: number | string | null;
  quantity: number;
  price: number | string;
  mrp?: number | string;
  originalPrice?: number;
  /** Retail unit price at time of sale + which rule set the charged price (B2B audit). */
  retail_price?: number | string | null;
  retailPrice?: number | string | null;
  price_source?: string | null;
  priceSource?: string | null;
  image?: string;
  /** Resolved variation photo from the backend — prefer this over `image`. */
  catalog_image?: string | null;
  attributes?: Record<string, string>;
  variant?: { colorName: string };
  bundle_applied?: { title: string } | null;
  bundleApplied?: { title: string } | null;
}

interface OrderItemsProps {
  items: OrderItem[];
  /** Order's B2B tier — shown against every line priced by it. */
  b2bTier?: string | null;
  /** Order-level discount (₹) — pro-rated across lines by value so every
   *  product shows its full effective discount. */
  orderDiscount?: number;
  headerAction?: React.ReactNode;

  /* ── Order money ladder, rendered as numbered footer rows of this same table.
        Subtotal − Discount + Shipping + COD = Total used to live in its own card
        several sections below, so an operator checking an order against an
        invoice had to hold the line figures in their head while scrolling. ── */
  subtotal?: number;
  shipping?: number;
  total?: number;
  gst?: GstInfo | null;
  amountReceived?: number;
  couponCode?: string | null;
  discountReason?: string | null;
  /** Charge waivers — same edit-gate as "Edit items" (caller decides). */
  onRemoveShipping?: () => void;
  onRemoveCod?: () => void;
  removingCharge?: 'shipping' | 'cod' | null;
}

/**
 * EVERY variation attribute this line carries, not a hand-picked three.
 *
 * The homeopathy axes (potency / volume / size) lead because that is how the
 * catalogue is read, but anything else on the blob follows rather than being
 * dropped — the previous version only fell back to "all other attributes" when
 * NONE of the known ones were present, so a line with both a potency and, say,
 * a pack-size attribute silently showed only the potency. `product-form` and
 * `brand` are excluded only because each is rendered in its own place.
 */
const HIDDEN_ATTRS = new Set(['product-form', 'brand']);
const LEAD_ATTRS = ['potency', 'volume', 'size', 'type'];

const attributePairs = (attrs?: Record<string, string>): Array<[string, string]> => {
  if (!attrs) return [];
  const entries = Object.entries(attrs)
    .filter(([k, v]) => !HIDDEN_ATTRS.has(k) && v != null && String(v).trim() !== '');
  const rank = (k: string) => {
    const i = LEAD_ATTRS.indexOf(k);
    return i === -1 ? LEAD_ATTRS.length : i;
  };
  return entries.sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, v]) => [k, String(v)]);
};

const prettyAttr = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The order's line items AND its money ladder, as one continuous table.
 *
 * Columns (owner spec, 2026-09-06):
 *   # · SKU · Product (+HSN) · Brand · Variation · MRP · Rate · Qty ·
 *   Disc % · Disc amount · Taxable value · GST · Total
 *
 * Each is one fact. The previous layout stacked MRP, retail, discount rupees,
 * discount %, off-retail % and two badges INSIDE single "Unit Price"/"Discount"
 * cells, so nothing could be scanned down a column or checked against an
 * invoice. The footer then continues into the ORDER-level ladder as NUMBERED
 * steps, so the sequence in which the discount is applied and the GST is
 * computed is visible rather than implied.
 *
 * ── What is authoritative, and what is a display split ──
 * `computeOrderTotals` (backend) is the only totals brain. Every order-level
 * figure below is read straight off the stored order. The per-line **Taxable
 * value / GST** columns are a *decomposition* of that line's own money at its
 * own rate — never a re-derivation of the order total — and they render only
 * when a rate is genuinely resolvable. When the sum of those splits disagrees
 * with the order's own recorded product GST, the table says so instead of
 * quietly showing a number that won't tie out to the invoice.
 *
 * Per-line discount semantics are unchanged (COMMON_MISTAKES #91): Disc %
 * describes THIS LINE's own MRP → rate cut only. A pro-rated share of an
 * ORDER-level discount is real money off but a different discount, so it is
 * shown as its own rupee figure and never inflates the percentage.
 */
const OrderItems: React.FC<OrderItemsProps> = ({
  items, b2bTier, orderDiscount = 0, headerAction,
  subtotal, shipping = 0, total, gst, amountReceived, couponCode, discountReason,
  onRemoveShipping, onRemoveCod, removingCharge,
}) => {
  const lineTotals = (items ?? []).map((i) => (Number(i.price) || 0) * (Number(i.quantity) || 0));
  const itemsValue = lineTotals.reduce((s, v) => s + v, 0);

  const hasGst = !!gst?.taxType;
  const inclusive = gst?.productsIncludeGst !== false;
  /**
   * Taxable value + GST get columns only when this order actually HAS a GST
   * snapshot. On a store with GST switched off they were two permanently-empty
   * columns whose width pushed Total — and every figure in the calculation
   * ladder — off the right edge behind a scrollbar. The amber banner below
   * already explains their absence.
   */
  const showTax = !!gst?.taxType;
  /** The single product rate, when the order has exactly one — the only case in
   *  which a line WITHOUT its own tax rule can still be split honestly. */
  const soleOrderRate = gst?.breakdown?.length === 1 ? Number(gst.breakdown[0].rate) : null;

  const rows = (items ?? []).map((item) => {
    const price = Number(item.price) || 0;
    const mrp = item.originalPrice ?? (item.mrp !== undefined ? Number(item.mrp) : undefined);
    const qty = Number(item.quantity) || 0;
    const lineTotal = price * qty;
    const mrpDiscount = mrp !== undefined && mrp > price ? (mrp - price) * qty : 0;
    const orderShare = itemsValue > 0 ? (orderDiscount * lineTotal) / itemsValue : 0;
    const discAmt = mrpDiscount + orderShare;
    const baseValue = (mrp !== undefined && mrp > 0 ? mrp : price) * qty;
    const discPct = baseValue > 0 ? (mrpDiscount / baseValue) * 100 : 0;
    const retailNum = Number(item.retailPrice ?? item.retail_price ?? NaN);
    const offRetailPct = Number.isFinite(retailNum) && retailNum > price && retailNum > 0
      ? ((retailNum - price) / retailNum) * 100
      : null;

    // ── Per-line tax split ──
    // Rate: the product's OWN active tax rule first; else the order's single
    // rate if it has exactly one. With several rates and no rule on the line,
    // the payload genuinely cannot say which applies — show nothing.
    const ownRate = Number(item.catalog_tax_rate ?? item.catalogTaxRate ?? NaN);
    const rate = Number.isFinite(ownRate) && ownRate > 0 ? ownRate : soleOrderRate;
    // Taxable value is assessed AFTER the order-level discount (that is how the
    // order's own recorded taxableTotal is computed), and under this platform's
    // GST-inclusive pricing the tax sits INSIDE the net amount.
    const net = lineTotal - orderShare;
    const taxable = hasGst && rate != null && rate >= 0
      ? (inclusive ? net / (1 + rate / 100) : net)
      : null;
    const lineGst = taxable != null ? net - taxable : null;

    return {
      item,
      name: item.catalog_name || item.catalogName || item.product_name || item.productName || 'Unnamed product',
      sku: item.catalog_sku || item.catalogSku || item.sku || '—',
      hsn: item.catalog_hsn ?? item.catalogHsn ?? null,
      brand: item.attributes?.brand || item.catalog_brand || item.catalogBrand || null,
      form: item.attributes?.['product-form'] || null,
      attrs: attributePairs(item.attributes),
      price, qty, lineTotal, mrp, mrpDiscount, orderShare, discAmt, discPct, offRetailPct,
      rate, taxable, lineGst,
      retail: item.retailPrice ?? item.retail_price,
      source: item.priceSource ?? item.price_source,
      bundle: item.bundle_applied || item.bundleApplied,
    };
  });

  const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalQty = sum((r) => r.qty);
  const totalValue = sum((r) => r.lineTotal);
  const totalDiscount = sum((r) => r.discAmt);
  const totalLineDiscount = sum((r) => r.mrpDiscount);
  const totalOrderShare = sum((r) => r.orderShare);
  const totalMrp = sum((r) => (r.mrp !== undefined && r.mrp > 0 ? r.mrp : r.price) * r.qty);
  const anyTax = rows.some((r) => r.taxable != null);
  const totalTaxable = sum((r) => r.taxable ?? 0);
  const totalLineGst = sum((r) => r.lineGst ?? 0);
  /** Weighted MRP→rate cut across the whole order, for the totals row. */
  const totalDiscPct = totalMrp > 0 ? (totalLineDiscount / totalMrp) * 100 : 0;

  // ── Order-level ladder (only when the caller passes the order's own totals) ──
  const hasLadder = total != null;
  const sub = subtotal ?? totalValue;
  const m = deriveOrderMoney({
    subtotal: sub, shipping, discount: orderDiscount, total: total ?? totalValue, gst, amountReceived,
  });

  /**
   * Does the per-line split tie out to what the ORDER actually recorded? If not,
   * the columns are still useful but must not be presented as the invoice
   * figure — the order's own breakdown wins and the difference is stated.
   */
  const productGstRecorded = m.groups.reduce(
    (s, g) => s + (g.cgst ?? 0) + (g.sgst ?? 0) + (g.igst ?? 0), 0);
  const gstDrift = anyTax && hasGst ? Math.round((totalLineGst - productGstRecorded) * 100) / 100 : 0;

  const sourceLabel = (source?: string | null): string | null => {
    if (!source || source === 'retail') return null;
    if (source === 'manual') return 'Manual price';
    if (source === 'manual_discount') return 'Manual discount';
    return source.replace(/_/g, ' ');
  };

  /** WHICH price book priced this line — the Bulk Order Platform's "Tier" idea. */
  const tierOf = (r: typeof rows[number]) => {
    const b2bPriced = r.retail != null && Number(r.retail) > r.price;
    if (b2bPriced) return { label: b2bTier ? String(b2bTier).toUpperCase() : 'B2B', tone: 'b2b' as const };
    const manual = sourceLabel(r.source);
    if (manual) return { label: manual.toUpperCase(), tone: 'manual' as const };
    return { label: 'RETAIL', tone: 'retail' as const };
  };
  const TIER_CLASS = {
    b2b: 'border-purple-300 bg-purple-100 text-purple-800',
    manual: 'border-blue-300 bg-blue-100 text-blue-800',
    retail: 'border-slate-200 bg-slate-100 text-slate-600',
  };

  /**
   * One numbered step of the order-level ladder.
   *
   * A flex ROW, not a `<tr>`: the ladder is ORDER-level and needs no column
   * alignment, and living inside the table meant living inside the table's
   * horizontal scroller — with 13 columns its own amounts sat in the
   * scrolled-off region, i.e. the exact figures it exists to show were hidden
   * by default. It now renders directly under the table, inside the same card,
   * so the line grid can stay comfortably wide and scroll while every figure
   * here is always visible.
   */
  const Step: React.FC<{
    n?: number | string; label: React.ReactNode; note?: React.ReactNode;
    value: number; tone?: 'plain' | 'credit' | 'subtotal' | 'total';
  }> = ({ n, label, note, value, tone = 'plain' }) => (
    <div className={`flex items-baseline justify-end gap-2 px-4 py-1.5 ${
      tone === 'total' ? 'border-t-2 border-slate-300 bg-slate-800 text-white'
        : tone === 'subtotal' ? 'border-t border-slate-200 bg-slate-100'
        : 'bg-slate-50/70'
    }`}>
      <span className={`text-[10px] font-black tabular-nums ${tone === 'total' ? 'text-slate-400' : 'text-slate-300'}`}>
        {n ?? ''}
      </span>
      <span className={
        tone === 'total' ? 'text-sm font-black uppercase tracking-wider'
          : tone === 'subtotal' ? 'text-xs font-black uppercase tracking-wide text-slate-700'
          : 'text-xs font-bold text-slate-600'
      }>
        {label}
      </span>
      {note && <span className="text-[10px] font-medium text-slate-400">{note}</span>}
      <span className={`min-w-[130px] whitespace-nowrap text-right tabular-nums ${
        tone === 'total' ? 'text-base font-black'
          : tone === 'credit' ? 'text-sm font-black text-emerald-700'
          : tone === 'subtotal' ? 'text-sm font-black text-slate-900'
          : 'text-sm font-bold text-slate-700'
      }`}>
        {tone === 'credit' ? `−${money(Math.abs(value))}` : money(value)}
      </span>
    </div>
  );

  // Numbered so the SEQUENCE is explicit: line value → order discount → net →
  // charges → total, with GST stated as living inside (or added to) that total.
  let step = 0;

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b-2 bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="flex items-baseline gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
          Order Items &amp; Calculation
          <span className="text-xs font-bold normal-case tracking-normal text-slate-400">
            {rows.length} line{rows.length === 1 ? '' : 's'} · {totalQty} unit{totalQty === 1 ? '' : 's'}
          </span>
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm font-semibold text-slate-400">No items in this order.</div>
        ) : (
          /* `w-0 min-w-full`, not just `overflow-x-auto`: the table's own
             min-width propagates upward as an INTRINSIC width contribution, and
             Layout.tsx's page container is a flex item (default
             `min-width:auto`), so it GREW to fit the table and the whole PAGE
             scrolled sideways (measured: body.scrollWidth 1562 vs 1440) — that
             container's `overflow-x-hidden` only clips, it does not constrain.
             `w-0` makes this element contribute nothing to that intrinsic
             calculation, while `min-w-full` still stretches it to whatever width
             the parent really has, so the table scrolls INSIDE the card. */
          <div className="w-0 min-w-full overflow-x-auto">
            <table className={`w-full border-collapse text-sm ${showTax ? 'min-w-[1240px]' : 'min-w-[1040px]'}`}>
              <thead>
                <tr className="bg-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-100">
                  <th className="hidden w-8 px-2 py-2.5 text-center font-black md:table-cell">#</th>
                  <th className="px-2.5 py-2.5 font-black">SKU</th>
                  <th className="min-w-[260px] px-2.5 py-2.5 font-black">Product name</th>
                  <th className="hidden w-[92px] px-2.5 py-2.5 font-black lg:table-cell">Brand</th>
                  <th className="hidden px-2.5 py-2.5 font-black xl:table-cell">Variation</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black md:table-cell">MRP</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Rate</th>
                  <th className="px-2.5 py-2.5 text-center font-black">Qty</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black md:table-cell">Disc %</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black lg:table-cell">Disc amount</th>
                  {showTax && (
                    <>
                      <th className="hidden px-2.5 py-2.5 text-right font-black lg:table-cell">Taxable value</th>
                      <th className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-black lg:table-cell">
                        {gst?.taxType === 'IGST' ? 'IGST' : 'CGST+SGST'}
                      </th>
                    </>
                  )}
                  <th className="px-2.5 py-2.5 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {rows.map((r, index) => {
                  const tier = tierOf(r);
                  const productId = r.item.product_id || r.item.productId;
                  return (
                    <tr key={index} className="align-top hover:bg-slate-50/80">
                      <td className="hidden px-2 py-2.5 text-center text-xs font-black tabular-nums text-slate-400 md:table-cell">
                        {index + 1}
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-2.5 align-top font-mono text-xs font-black text-slate-700">
                        {r.sku}
                      </td>

                      {/* Product — thumbnail, name, HSN, and the facts the narrow
                          viewport columns below are hidden on. */}
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-start gap-2.5">
                          {/* `catalog_image` is the resolved VARIATION photo. `item.image`
                              is the cart-time snapshot, which can hold the PARENT product's
                              photo even on a line that has a variation — staff then pick
                              the wrong pack. */}
                          {(r.item.catalog_image || r.item.image) ? (
                            <img src={r.item.catalog_image || r.item.image} alt={r.name}
                              className="h-11 w-11 flex-shrink-0 rounded-md border-2 border-slate-100 bg-slate-50 object-cover" />
                          ) : (
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border-2 border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            {productId ? (
                              <Link to={`/products/${productId}/edit`}
                                className="font-bold leading-snug text-slate-900 hover:text-blue-700 hover:underline"
                                title="Open product">
                                {r.name}
                              </Link>
                            ) : (
                              <p className="font-bold leading-snug text-slate-900">{r.name}</p>
                            )}
                            {/* HSN — the tax classification this line is invoiced under. */}
                            <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                              {r.hsn
                                ? <>HSN <span className="font-mono font-black text-slate-700">{r.hsn}</span></>
                                : <span className="text-amber-600">No HSN set</span>}
                              {r.rate != null && <span className="ml-2 text-slate-400">· GST {r.rate}%</span>}
                              {r.form && <span className="ml-2 text-slate-400">· {prettyAttr(r.form)}</span>}
                            </p>
                            {/* Narrow viewports hide Brand/Variation/Disc as columns —
                                they stay readable here instead. */}
                            <p className="mt-0.5 text-[11px] font-bold text-slate-400 lg:hidden">
                              {r.brand ?? ''}
                              {r.attrs.length ? `${r.brand ? ' · ' : ''}${r.attrs.map(([, v]) => v).join(' · ')}` : ''}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <Badge variant="outline"
                                className={`text-[9px] font-black uppercase ${TIER_CLASS[tier.tone]}`}>
                                {tier.label}
                              </Badge>
                              {r.offRetailPct != null && (
                                <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[9px] font-bold text-purple-700">
                                  {r.offRetailPct.toFixed(1)}% off retail
                                </Badge>
                              )}
                              {r.item.variant?.colorName && (
                                <Badge variant="outline" className="text-[9px] font-bold">{r.item.variant.colorName}</Badge>
                              )}
                              {r.bundle && (
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[9px] font-bold text-blue-700">
                                  Bundle: {r.bundle.title}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="hidden w-[92px] max-w-[92px] px-2.5 py-2.5 lg:table-cell">
                        {r.brand
                          ? <span className="block truncate text-xs font-black text-slate-700" title={r.brand}>{r.brand}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* EVERY attribute the line carries, labelled. */}
                      <td className="hidden px-2.5 py-2.5 xl:table-cell">
                        {r.attrs.length ? (
                          <div className="space-y-0.5">
                            {r.attrs.map(([k, v]) => (
                              <div key={k} className="whitespace-nowrap text-xs leading-tight">
                                <span className="text-[10px] font-bold uppercase text-slate-400">{prettyAttr(k)} </span>
                                <span className="font-black text-slate-700">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums md:table-cell">
                        {r.mrp !== undefined && r.mrp > 0 ? (
                          <span className={r.mrp > r.price ? 'font-semibold text-slate-400 line-through' : 'font-semibold text-slate-600'}>
                            {money(Number(r.mrp))}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right">
                        <span className="text-[15px] font-black tabular-nums text-slate-900">{money(r.price)}</span>
                        {r.retail != null && Number(r.retail) > r.price && (
                          <div className="text-[10px] font-bold text-slate-400">retail {money(Number(r.retail))}</div>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-2.5 text-center text-[15px] font-black tabular-nums text-slate-900">
                        {r.qty}
                      </td>

                      {/* Disc % — off MRP only (COMMON_MISTAKES #91). */}
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums md:table-cell">
                        {r.discPct > 0.05
                          ? <span className="font-black text-emerald-700">{r.discPct.toFixed(1)}%</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Disc amount — the line's own MRP cut plus its share of any
                          order-level discount, itemised so the two never merge. */}
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right lg:table-cell">
                        {r.discAmt > 0.009 ? (
                          <>
                            <span className="font-black tabular-nums text-emerald-700">{money(r.discAmt)}</span>
                            {r.orderShare > 0.009 && (
                              <div className="text-[10px] font-medium text-slate-400">
                                {r.mrpDiscount > 0.009 ? `${money(r.mrpDiscount)} line + ` : ''}
                                {money(r.orderShare)} order
                              </div>
                            )}
                          </>
                        ) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Taxable value + GST — only when a rate is genuinely known. */}
                      {showTax && (
                        <>
                          <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums lg:table-cell">
                            {r.taxable != null
                              ? <span className="font-bold text-slate-700">{money(r.taxable)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums lg:table-cell">
                            {r.lineGst != null ? (
                              <>
                                <span className="font-bold text-slate-700">{money(r.lineGst)}</span>
                                {gst?.taxType === 'CGST+SGST' && (
                                  <div className="text-[10px] font-medium text-slate-400">
                                    {money(r.lineGst / 2)} + {money(r.lineGst / 2)}
                                  </div>
                                )}
                              </>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      )}

                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-[15px] font-black tabular-nums text-slate-900">
                        {money(r.lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* ── Totals of EVERY column ── */}
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-slate-900">
                  <td className="hidden px-2 py-2.5 md:table-cell" />
                  <td className="px-2.5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500">Totals</td>
                  <td className="px-2.5 py-2.5 text-xs font-bold text-slate-500">
                    {rows.length} line{rows.length === 1 ? '' : 's'}
                  </td>
                  <td className="hidden lg:table-cell" />
                  <td className="hidden xl:table-cell" />
                  <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-bold tabular-nums text-slate-500 md:table-cell">
                    {money(totalMrp)}
                  </td>
                  <td className="px-2.5 py-2.5" />
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-center text-[15px] font-black tabular-nums">{totalQty}</td>
                  <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-black tabular-nums text-emerald-700 md:table-cell">
                    {totalDiscPct > 0.05 ? `${totalDiscPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right lg:table-cell">
                    <span className="text-[15px] font-black tabular-nums text-emerald-700">
                      {totalDiscount > 0.009 ? money(totalDiscount) : '—'}
                    </span>
                    {totalOrderShare > 0.009 && (
                      <div className="text-[10px] font-medium text-slate-500">
                        {money(totalLineDiscount)} line + {money(totalOrderShare)} order
                      </div>
                    )}
                  </td>
                  {showTax && (
                    <>
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-black tabular-nums text-slate-700 lg:table-cell">
                        {anyTax ? money(totalTaxable) : '—'}
                      </td>
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-black tabular-nums text-slate-700 lg:table-cell">
                        {anyTax ? money(totalLineGst) : '—'}
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-base font-black tabular-nums">
                    {money(totalValue)}
                  </td>
                </tr>

              </tfoot>
            </table>
          </div>
        )}

              {/* ── The order calculation, in the sequence it actually happens ── */}
              {hasLadder && (
                <>
                  <div className="border-t-2 border-slate-200 bg-slate-50 px-4 pb-0.5 pt-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">
                    How this order was calculated
                  </div>
                  <Step n={++step} label="Items value (rate × qty, all lines)" value={sub}
                    note={gst?.taxType && inclusive ? 'GST-inclusive' : undefined} />
                  {orderDiscount > 0 && (
                    <Step n={++step} tone="credit" value={orderDiscount}
                      label={<>Order discount{couponCode ? <> · coupon <span className="font-mono font-black">{couponCode}</span></> : null}</>}
                      note={discountReason || 'applied on the items value, spread across lines by value'} />
                  )}
                  {orderDiscount > 0 && (
                    <Step n={++step} tone="subtotal" label="Net items value" value={sub - orderDiscount}
                      note="the value GST is assessed on" />
                  )}
                  {shipping > 0 && (
                    <Step n={++step} value={shipping}
                      label={
                        <>Shipping
                          {onRemoveShipping && (
                            <button type="button" onClick={onRemoveShipping} disabled={removingCharge === 'shipping'}
                              className="ml-2 text-[10px] font-bold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
                              {removingCharge === 'shipping' ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </>
                      } />
                  )}
                  {m.codFee > 0 && (
                    <Step n={++step} value={m.codFee}
                      label={
                        <>COD handling fee
                          {onRemoveCod && (
                            <button type="button" onClick={onRemoveCod} disabled={removingCharge === 'cod'}
                              className="ml-2 text-[10px] font-bold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
                              {removingCharge === 'cod' ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </>
                      } />
                  )}
                  {hasGst && !inclusive && m.gstTotal > 0 && (
                    <Step n={++step} label="GST added on top" value={m.gstTotal} />
                  )}
                  {Math.abs(m.residual) >= 0.01 && (
                    <Step n={++step} label="Round off / other" value={m.residual} />
                  )}
                  <Step n={++step} tone="total" label="Order total" value={total ?? totalValue}
                    note={hasGst && inclusive ? 'GST included' : undefined} />
                  {m.received > 0 && (
                    <>
                      <Step tone="credit" label="Amount received (before delivery)" value={m.received} />
                      <Step tone="subtotal" label="Balance due on delivery" value={m.balanceDue} />
                    </>
                  )}
                </>
              )}

        {/* ── GST as the ORDER recorded it — the authoritative figures ── */}
        {hasLadder && hasGst && m.groups.length > 0 && (
          <div className="border-t-2 border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
              GST as recorded on the order{inclusive ? ' — already inside the prices above' : ''}
            </p>
            <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
              <div className="flex justify-between text-slate-600">
                <span className="font-semibold">Taxable value — products{orderDiscount > 0 ? ' (after discount)' : ''}</span>
                <span className="font-bold tabular-nums">{money(m.productsTaxable)}</span>
              </div>
              {m.charges.map((c, i) => (
                <div key={i} className="flex justify-between text-slate-600">
                  <span className="font-semibold">Taxable value — {c.label.toLowerCase()} ({c.rate}%)</span>
                  <span className="font-bold tabular-nums">{money(c.taxableAmount)}</span>
                </div>
              ))}
              {m.groups.length > 1 && m.groups.map((g, i) => (
                <div key={`g${i}`} className="flex justify-between text-slate-500">
                  <span className="font-semibold">Products @ {g.rate}%</span>
                  <span className="font-bold tabular-nums">{money(m.groupTaxable(g))}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-1 font-black text-slate-800">
                <span>Total taxable value</span>
                <span className="tabular-nums">{money(m.totalTaxable)}</span>
              </div>
              {gst!.taxType === 'CGST+SGST' ? (
                <>
                  <div className="flex justify-between text-slate-700">
                    <span className="font-semibold">CGST</span>
                    <span className="font-bold tabular-nums">{money(gst!.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="font-semibold">SGST</span>
                    <span className="font-bold tabular-nums">{money(gst!.sgst)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-700">
                  <span className="font-semibold">IGST</span>
                  <span className="font-bold tabular-nums">{money(gst!.igst)}</span>
                </div>
              )}
            </div>
            <p className="mt-1.5 border-t border-slate-200 pt-1 text-[10px] font-medium text-slate-400">
              {gst!.taxType} · {gst!.storeState ?? '?'} → {gst!.orderState ?? '?'}
              {gst!.storeGstin ? ` · GSTIN ${gst!.storeGstin}` : ''}
              {gst!.reconstructed && ' · breakdown reconstructed from GST-inclusive prices, totals unchanged'}
            </p>
            {Math.abs(gstDrift) >= 0.5 && (
              <p className="mt-1.5 rounded border-2 border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                The per-line GST column sums to {money(totalLineGst)}, {money(Math.abs(gstDrift))}
                {gstDrift > 0 ? ' more' : ' less'} than the {money(productGstRecorded)} recorded on the order.
                The recorded figure is what the invoice uses — the per-line split is indicative
                (a line whose product carries no tax rule falls back to the order's rate).
              </p>
            )}
          </div>
        )}

        {/* Orders written while GST was disabled carry no tax data at all. */}
        {hasLadder && !hasGst && (
          <div className="border-t-2 border-amber-100 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
            No GST breakdown was recorded for this order — GST was not enabled/configured when it
            was placed, so Taxable value and {gst?.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'} are
            blank for every line.
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-100 bg-white px-4 py-2 text-xs">
            <span className="font-semibold text-slate-500">
              MRP − line discount = Total. The order discount is applied once, on the items value
              (step {orderDiscount > 0 ? 2 : '—'}), not inside the line totals.
            </span>
            <span className="flex flex-wrap items-center gap-x-4">
              {shipping > 0 && (
                <span className="font-semibold text-blue-700">
                  Shipping GST ({SHIPPING_GST_RATE}%) claimable as ITC: {money(m.shippingItc)}
                </span>
              )}
              {totalDiscount > 0.009 && (
                <span className="font-black text-emerald-700">
                  Customer saved {money(totalDiscount)}
                  {totalMrp > 0 && ` (${((totalDiscount / totalMrp) * 100).toFixed(1)}%)`}
                </span>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderItems;
