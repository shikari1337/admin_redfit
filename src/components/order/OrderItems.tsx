import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  variant?: {
    colorName: string;
  };
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
  /** Rendered in the card header (e.g. the "Edit items" button). */
  headerAction?: React.ReactNode;
}

// This catalog's variant attributes are potency/volume/type (homeopathy), not a
// generic "size" — build the variation label from whatever the item carries.
const formatVariant = (attrs?: Record<string, string>): string => {
  if (!attrs) return '';
  const known = [attrs.potency, attrs.volume, attrs.type].filter(Boolean);
  if (known.length) return known.join(' · ');
  // Fall back to any other attributes so non-homeopathy items still show theirs.
  return Object.entries(attrs)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
};

const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The order's line items as a full commercial breakdown — one fact per column,
 * in the same dense tabular language as the storefront's Bulk Order Platform
 * (`storefront/src/app/bulk-order/components/CatalogTable.tsx`): dark sticky
 * header, `font-black` labels, right-aligned tabular money, a totals footer.
 *
 * Every figure here was already in the payload; the previous layout stacked
 * MRP, retail, discount rupees, discount %, off-retail % and two badges INSIDE
 * a single "Unit Price"/"Discount" cell, so nothing could be scanned down a
 * column or checked against an invoice. Each now has its own column:
 *
 *   MRP · Disc % (off MRP) · Rate (charged) · Tier (which price book) · Qty ·
 *   Amount · Savings
 *
 * The discount semantics are deliberately unchanged (COMMON_MISTAKES #91): the
 * percentage describes THIS LINE's own cut from MRP to the charged rate and
 * nothing else — a pro-rated share of an ORDER-level discount (coupon, payment
 * discount) is real money off but a different discount, so it stays a separate
 * rupee figure and never inflates the per-line percentage.
 */
const OrderItems: React.FC<OrderItemsProps> = ({ items, b2bTier, orderDiscount = 0, headerAction }) => {
  const lineTotals = (items ?? []).map((i) => (Number(i.price) || 0) * (Number(i.quantity) || 0));
  const itemsValue = lineTotals.reduce((s, v) => s + v, 0);

  const rows = (items ?? []).map((item) => {
    const price = Number(item.price) || 0;
    const mrp = item.originalPrice ?? (item.mrp !== undefined ? Number(item.mrp) : undefined);
    const qty = Number(item.quantity) || 0;
    const lineTotal = price * qty;
    // Effective per-product discount vs MRP: the price cut off the list price
    // PLUS this line's value-share of the order-level discount.
    const mrpDiscount = mrp !== undefined && mrp > price ? (mrp - price) * qty : 0;
    const orderShare = itemsValue > 0 ? (orderDiscount * lineTotal) / itemsValue : 0;
    const discAmt = mrpDiscount + orderShare;
    const baseValue = (mrp !== undefined && mrp > 0 ? mrp : price) * qty;
    /** THIS LINE's own price cut (MRP → charged) only — see the block comment above. */
    const discPct = baseValue > 0 ? (mrpDiscount / baseValue) * 100 : 0;
    // What the B2B agreement is actually written against: the cut off RETAIL.
    // Only meaningful when the line carries a retail snapshot above the charged
    // price (i.e. it really was B2B-priced).
    const retailNum = Number(item.retailPrice ?? item.retail_price ?? NaN);
    const offRetailPct = Number.isFinite(retailNum) && retailNum > price && retailNum > 0
      ? ((retailNum - price) / retailNum) * 100
      : null;
    return {
      item,
      name: item.catalog_name || item.catalogName || item.product_name || item.productName || 'Unnamed product',
      sku: item.catalog_sku || item.catalogSku || item.sku || '—',
      variant: formatVariant(item.attributes),
      price,
      qty,
      lineTotal,
      mrp,
      mrpDiscount,
      orderShare,
      discAmt,
      discPct,
      offRetailPct,
      retail: item.retailPrice ?? item.retail_price,
      source: item.priceSource ?? item.price_source,
      bundle: item.bundle_applied || item.bundleApplied,
    };
  });

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.lineTotal, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.discAmt, 0);
  const totalMrp = rows.reduce((s, r) => s + (r.mrp !== undefined && r.mrp > 0 ? r.mrp : r.price) * r.qty, 0);
  /**
   * The two halves of "Savings", kept separate in the footer for the same reason
   * they are separate per row: only the LINE half is deducted from Amount.
   * `MRP − line discount = Amount` holds exactly; the order-level share comes off
   * at order level (Order Summary), so a footer quoting the combined figure alone
   * makes the column look like it doesn't add up. Split it and both sums check.
   */
  const totalLineDiscount = rows.reduce((s, r) => s + r.mrpDiscount, 0);
  const totalOrderShare = rows.reduce((s, r) => s + r.orderShare, 0);

  const sourceLabel = (source?: string | null): string | null => {
    if (!source || source === 'retail') return null;
    if (source === 'manual') return 'Manual price';
    if (source === 'manual_discount') return 'Manual discount';
    // B2B rule names — the tier itself is its own badge alongside.
    return source.replace(/_/g, ' ');
  };

  /**
   * WHICH price book priced this line — the Bulk Order Platform's "Tier" column.
   * A line carrying a retail snapshot above the charged price really was sold at
   * a wholesale rate; everything else is retail, however it was discounted.
   */
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

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b-2 bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="flex items-baseline gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
          Order Items
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-100">
                  <th className="hidden w-10 px-2 py-2.5 text-center font-black md:table-cell">#</th>
                  <th className="min-w-[240px] px-2.5 py-2.5 font-black">Product</th>
                  <th className="hidden px-2.5 py-2.5 font-black lg:table-cell">SKU</th>
                  <th className="hidden px-2.5 py-2.5 font-black xl:table-cell">Variation</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black md:table-cell">MRP</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black md:table-cell">Disc %</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Rate</th>
                  <th className="hidden px-2.5 py-2.5 text-center font-black lg:table-cell">Tier</th>
                  <th className="px-2.5 py-2.5 text-center font-black">Qty</th>
                  <th className="hidden px-2.5 py-2.5 text-right font-black lg:table-cell">Savings</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Amount</th>
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

                      {/* Product — thumbnail, name, and the facts the narrow
                          viewport columns below are hidden on. */}
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-start gap-2.5">
                          {/* `catalog_image` is the resolved VARIATION photo
                              (db/queries/orders.ts). `item.image` is the
                              cart-time snapshot, which can hold the PARENT
                              product's photo even on a line that has a
                              variation — staff then pick the wrong pack. */}
                          {(r.item.catalog_image || r.item.image) ? (
                            <img
                              src={r.item.catalog_image || r.item.image}
                              alt={r.name}
                              className="h-11 w-11 flex-shrink-0 rounded-md border-2 border-slate-100 bg-slate-50 object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border-2 border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            {productId ? (
                              <Link
                                to={`/products/${productId}/edit`}
                                className="line-clamp-2 font-bold leading-snug text-slate-900 hover:text-blue-700 hover:underline"
                                title="Open product"
                              >
                                {r.name}
                              </Link>
                            ) : (
                              <p className="line-clamp-2 font-bold leading-snug text-slate-900">{r.name}</p>
                            )}
                            {/* Narrow viewports hide SKU/Variation/MRP/Tier as
                                columns — they stay readable here instead. */}
                            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-400 lg:hidden">{r.sku}</p>
                            {r.variant && (
                              <p className="text-[11px] font-bold text-slate-500 xl:hidden">{r.variant}</p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className={`text-[9px] font-black uppercase lg:hidden ${TIER_CLASS[tier.tone]}`}
                              >
                                {tier.label}
                              </Badge>
                              {r.item.variant?.colorName && (
                                <Badge variant="outline" className="text-[9px] font-bold">
                                  {r.item.variant.colorName}
                                </Badge>
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

                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 font-mono text-xs font-bold text-slate-500 lg:table-cell">
                        {r.sku}
                      </td>
                      <td className="hidden px-2.5 py-2.5 text-xs font-bold text-slate-600 xl:table-cell">
                        {r.variant || <span className="text-slate-300">—</span>}
                      </td>

                      {/* MRP — the list price this line was sold against. */}
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums md:table-cell">
                        {r.mrp !== undefined && r.mrp > 0 ? (
                          <span className={r.mrp > r.price ? 'font-semibold text-slate-400 line-through' : 'font-semibold text-slate-600'}>
                            {money(Number(r.mrp))}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Disc % — off MRP only. Off-retail (the B2B agreement's
                          own basis) is a genuinely different number, shown under it. */}
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums md:table-cell">
                        {r.discPct > 0.05 ? (
                          <>
                            <span className="font-black text-emerald-700">{r.discPct.toFixed(1)}%</span>
                            {r.offRetailPct != null && (
                              <div className="text-[10px] font-bold text-purple-600">
                                {r.offRetailPct.toFixed(1)}% off retail
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Rate — what was actually charged per unit. */}
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right">
                        <span className="text-[15px] font-black tabular-nums text-slate-900">{money(r.price)}</span>
                        {r.retail != null && Number(r.retail) > r.price && (
                          <div className="text-[10px] font-bold text-slate-400">
                            retail {money(Number(r.retail))}
                          </div>
                        )}
                      </td>

                      {/* Tier — which price book produced the rate. */}
                      <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-center lg:table-cell">
                        <Badge variant="outline" className={`text-[10px] font-black uppercase ${TIER_CLASS[tier.tone]}`}>
                          {tier.label}
                        </Badge>
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-2.5 text-center text-[15px] font-black tabular-nums text-slate-900">
                        {r.qty}
                      </td>

                      {/* Savings — the line's own MRP cut plus its share of any
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
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-[15px] font-black tabular-nums text-slate-900">
                        {money(r.lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100 text-slate-900">
                  <td className="hidden px-2 py-2.5 md:table-cell" />
                  <td className="px-2.5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500">
                    Totals
                  </td>
                  <td className="hidden lg:table-cell" />
                  <td className="hidden xl:table-cell" />
                  <td className="hidden whitespace-nowrap px-2.5 py-2.5 text-right font-bold tabular-nums text-slate-500 md:table-cell">
                    {money(totalMrp)}
                  </td>
                  <td className="hidden px-2.5 py-2.5 md:table-cell" />
                  <td className="px-2.5 py-2.5" />
                  <td className="hidden lg:table-cell" />
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-center text-[15px] font-black tabular-nums">
                    {totalQty}
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
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-base font-black tabular-nums">
                    {money(totalValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Items value is BEFORE shipping/COD/round-off — say so, so this figure
            is never mistaken for the order total in the summary card below. */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-100 bg-slate-50/60 px-4 py-2 text-xs">
            <span className="font-semibold text-slate-500">
              MRP − line discount = Amount. Order-level discount, shipping, COD handling and
              round-off are applied in Order Summary.
            </span>
            {totalDiscount > 0.009 && (
              <span className="font-black text-emerald-700">
                Customer saved {money(totalDiscount)}
                {totalMrp > 0 && ` (${((totalDiscount / totalMrp) * 100).toFixed(1)}%)`}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderItems;
