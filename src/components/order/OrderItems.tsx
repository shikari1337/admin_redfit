import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Same env var Settings / PageBuilder / Categories read for storefront links. */
const STOREFRONT_URL = (import.meta as any).env?.VITE_STOREFRONT_URL || 'http://localhost:3000';
import { deriveOrderMoney, type GstInfo } from '../../lib/orderMoney';

interface OrderItem {
  // The `items` array arrives as an opaque JSONB blob (the API interceptor
  // skips camelCase-aliasing it, by design, to protect other JSONB payloads
  // elsewhere) — so real order_items rows only ever carry their snake_case
  // column names. Read those directly rather than relying on aliasing.
  product_id?: string;
  productId?: string;
  product_slug?: string;
  productSlug?: string;
  product_name?: string;
  productName?: string;
  sku?: string;
  /**
   * Full pack name and the store's OWN SKU, resolved against the live catalogue
   * by the order read path (`CATALOG_LABEL_SQL`, backend db/queries/orders.ts).
   * `product_name`/`sku` are the sale-time snapshot and stay as the fallback.
   */
  catalog_name?: string;
  catalogName?: string;
  catalog_sku?: string;
  catalogSku?: string;
  /**
   * HSN, BRAND and GST RATE of the pack sold, from the same read path.
   * All resolve VARIATION-first: a variation carries its own HSN, and HSN is
   * what determines the rate (backend CATALOG_HSN/BRAND/TAX_RATE_EXPR).
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
  catalog_image?: string | null;
  attributes?: Record<string, string>;
  variant?: { colorName: string };
  bundle_applied?: { title: string } | null;
  bundleApplied?: { title: string } | null;
}

interface OrderItemsProps {
  items: OrderItem[];
  b2bTier?: string | null;
  orderDiscount?: number;
  headerAction?: React.ReactNode;

  /* Order money ladder — rendered as aligned rows of THIS table so a charge
     (shipping, COD) lands its amount in Total and its tax in the two tax
     columns, exactly like a product line does. */
  subtotal?: number;
  shipping?: number;
  total?: number;
  gst?: GstInfo | null;
  amountReceived?: number;
  couponCode?: string | null;
  discountReason?: string | null;
  /** Per-component discount amounts as recorded on the order (migration 153). */
  discountItems?: Array<{ amount: number | string; reason: string }> | null;
  /** Free-text order notes — carries the Bulk-Order-Platform marker + PO ref. */
  orderNotes?: string | null;
  /** Extra context for the info pane beside the ladder. */
  paymentMethod?: string | null;
  paymentGateway?: string | null;
  placedAt?: string | Date | null;
  orderType?: string | null;
  customerGstin?: string | null;
  salesperson?: string | null;
  importedFrom?: string | null;
  onRemoveShipping?: () => void;
  onRemoveCod?: () => void;
  removingCharge?: 'shipping' | 'cod' | null;
}

/**
 * EVERY variation attribute this line carries, not a hand-picked three.
 * `product-form` and `brand` are excluded only because each is rendered in
 * its own place.
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
const dateTime = (d?: string | Date | null) => {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

/**
 * How many columns are ACTUALLY on screen right now.
 *
 * The ladder rows span columns with `colSpan`, but half the columns are hidden
 * by responsive classes (`hidden lg:table-cell`, …) — and `colSpan` is a static
 * number that CSS visibility cannot shrink. So at <2xl the ladder claimed 10
 * columns while the header/body rendered 9, and every ladder row ran one column
 * wider than the table (measured: head 9 / body 9 / totals 9 / ladder 10).
 * Tailwind's own breakpoints, read at runtime, keep the two in step.
 */
const BP = { md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

function useVisibleColumnCount(showTax: boolean, gstCols: number): number {
  const compute = React.useCallback(() => {
    if (typeof window === 'undefined') return showTax ? 11 : 10;
    const w = window.innerWidth;
    // Always on: SKU, Product, Rate, Qty, Discount (line + order), Total.
    let n = 7;
    if (showTax) {
      n += gstCols + 1;                  // GST sub-columns + Taxable value
      if (w >= BP.lg) n += 1;            // Disc %
      if (w >= BP.xl) n += 1;            // MRP
      if (w >= BP['2xl']) n += 2;        // Brand, Variation
    } else {
      if (w >= BP.md) n += 2;            // MRP, Disc %
      if (w >= BP.lg) n += 1;            // Brand
      if (w >= BP['2xl']) n += 1;        // Variation
    }
    return n;
  }, [showTax, gstCols]);

  const [count, setCount] = React.useState(compute);
  React.useEffect(() => {
    const onResize = () => setCount(compute());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);
  return count;
}

/**
 * The order's line items AND its money ladder, as one aligned table.
 *
 * Columns (owner spec, 2026-09-06):
 *   SKU · Product name (+HSN +GST%) · Brand · Variation · MRP · Rate · Qty ·
 *   Disc % · Disc amount · **Total** · Taxable value · CGST+SGST | IGST
 *
 * The two tax columns sit to the RIGHT of Total on purpose: Total then carries
 * an amount for EVERY row — product lines and charge lines alike — so shipping
 * and COD show their own taxable value and GST in the same columns the products
 * use, instead of the tax story stopping at the product lines.
 *
 * ── What is authoritative, and what is a display split ──
 * `computeOrderTotals` (backend) is the only totals brain. Every order-level
 * figure is read straight off the stored order. Per-line Taxable/GST is a
 * *decomposition* of that line's own money at its own rate, rendered only when
 * a rate is genuinely resolvable, and the card says so if the sum disagrees
 * with what the order recorded.
 *
 * Per-line discount semantics unchanged (COMMON_MISTAKES #91): Disc % is THIS
 * LINE's own MRP → rate cut only.
 */
const OrderItems: React.FC<OrderItemsProps> = ({
  items, b2bTier, orderDiscount = 0, headerAction,
  subtotal, shipping = 0, total, gst, amountReceived, couponCode, discountReason, discountItems,
  orderNotes, paymentMethod, paymentGateway, placedAt, orderType, customerGstin,
  salesperson, importedFrom,
  onRemoveShipping, onRemoveCod, removingCharge,
}) => {
  const lineTotals = (items ?? []).map((i) => (Number(i.price) || 0) * (Number(i.quantity) || 0));
  const itemsValue = lineTotals.reduce((s, v) => s + v, 0);

  const hasGst = !!gst?.taxType;
  const inclusive = gst?.productsIncludeGst !== false;
  /** Tax columns only when the order actually HAS a GST snapshot — otherwise two
   *  permanently-empty columns push everything else off the edge. */
  const showTax = hasGst;
  const isIgst = gst?.taxType === 'IGST';
  /** GST sub-columns: one for IGST, two for the CGST/SGST split. */
  const gstCols = isIgst ? 1 : 2;
  const visibleCols = useVisibleColumnCount(showTax, gstCols);
  /** Responsive visibility per soft column — mirrored by useVisibleColumnCount. */
  const CLS = showTax
    ? { brand: 'hidden 2xl:table-cell', variation: 'hidden 2xl:table-cell',
        mrp: 'hidden xl:table-cell', discPct: 'hidden lg:table-cell', brandInline: '2xl:hidden', attrInline: '2xl:hidden' }
    : { brand: 'hidden lg:table-cell', variation: 'hidden 2xl:table-cell',
        mrp: 'hidden md:table-cell', discPct: 'hidden md:table-cell', brandInline: 'lg:hidden', attrInline: '2xl:hidden' };
  /** Info pane (left) · label (middle) · amount (+ tax cells) — always summing
   *  to exactly the number of columns the table is really rendering. */
  const infoSpan = Math.max(1, Math.min(3, visibleCols - (showTax ? 2 : 0) - 2));
  const labelSpan = Math.max(1, visibleCols - infoSpan - 1 - (showTax ? 2 : 0));
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
      ? ((retailNum - price) / retailNum) * 100 : null;

    // Rate: the product's OWN active tax rule first; else the order's single
    // rate if it has exactly one. With several rates and no rule on the line,
    // the payload genuinely cannot say which applies — show nothing.
    const ownRate = Number(item.catalog_tax_rate ?? item.catalogTaxRate ?? NaN);
    const rate = Number.isFinite(ownRate) && ownRate > 0 ? ownRate : soleOrderRate;
    // Taxable value is assessed AFTER the order-level discount, and under this
    // platform's GST-inclusive pricing the tax sits INSIDE the net amount.
    const net = lineTotal - orderShare;
    const taxable = hasGst && rate != null && rate >= 0
      ? (inclusive ? net / (1 + rate / 100) : net) : null;
    const lineGst = taxable != null ? net - taxable : null;

    return {
      item,
      name: item.catalog_name || item.catalogName || item.product_name || item.productName || 'Unnamed product',
      slug: item.product_slug ?? item.productSlug ?? null,
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
  const totalDiscPct = totalMrp > 0 ? (totalLineDiscount / totalMrp) * 100 : 0;

  const hasLadder = total != null;
  const sub = subtotal ?? totalValue;
  const m = deriveOrderMoney({
    subtotal: sub, shipping, discount: orderDiscount, total: total ?? totalValue, gst, amountReceived,
  });

  /**
   * Each discount that made up the order-level total, as its own named line.
   *
   * ⚠️ Only the COMBINED rupee figure is stored (`orders.discount`) alongside a
   * comma-joined `discount_reason`. `computeOrderTotals` does compute a
   * per-component `discountItems[]`, but nothing persists it — so each component
   * is listed with the basis the store actually recorded ("5.00% off") and the
   * authoritative rupee total is shown once, on its own row. Re-deriving the
   * split here would be money math outside `computeOrderTotals` (CLAUDE.md rule
   * 7a), and the parts provably do not re-sum to the stored total.
   */
  const discountParts = String(discountReason ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  /**
   * The rupee amount of ONE named discount, when the order stored it.
   *
   * `orders.discount_items` (migration 153) records `{amount, reason}` per
   * component at order creation — before it existed only the combined
   * `orders.discount` was kept, so an older order still shows its components by
   * name with the total on its own row. Never re-derived here: the parts
   * provably do not re-sum to the stored total (money math lives in
   * `computeOrderTotals`, CLAUDE.md rule 7a).
   */
  const discountAmountFor = (reason: string): number | undefined => {
    const hit = (discountItems ?? []).find((d) => String(d?.reason ?? '').trim() === reason);
    return hit && Number.isFinite(Number(hit.amount)) ? Number(hit.amount) : undefined;
  };

  /** Where this order came from — derived, since orders carry no channel column. */
  const viaBulkPortal = /Source:\s*Bulk Order Platform/i.test(String(orderNotes ?? ''));
  const poRef = String(orderNotes ?? '').match(/PO Ref:\s*([^\n]+)/i)?.[1]?.trim();
  const channel = importedFrom ? `Imported · ${importedFrom}`
    : viaBulkPortal ? 'Bulk Order Platform'
    : salesperson ? 'Admin / phone order'
    : 'Online Store';

  const sourceLabel = (source?: string | null): string | null => {
    if (!source || source === 'retail') return null;
    if (source === 'manual') return 'Manual price';
    if (source === 'manual_discount') return 'Manual discount';
    return source.replace(/_/g, ' ');
  };

  /** WHICH price book priced this line. */
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
   * One row of the order ladder, aligned to the table's columns.
   * `info` fills the otherwise-dead area to the LEFT of the amounts with the
   * order's own context (coupons, channel, payment, GSTIN) instead of leaving
   * a full-width blank band.
   */
  const Step: React.FC<{
    n?: number | string; label: React.ReactNode; note?: React.ReactNode;
    value?: number; amount?: number; tone?: 'plain' | 'credit' | 'subtotal' | 'total';
    taxable?: number | null; taxAmt?: number | null;
    info?: React.ReactNode;
  }> = ({ n, label, note, value, amount, tone = 'plain', taxable, taxAmt, info }) => {
    const tint = tone === 'total' ? 'text-white' : 'text-slate-700';
    const half = taxAmt != null ? taxAmt / 2 : null;
    return (
    <tr className={
      tone === 'total' ? 'border-t-2 border-slate-300 bg-slate-800 text-white'
        : tone === 'subtotal' ? 'border-t border-slate-300 bg-slate-100'
        : 'bg-slate-50/70'
    }>
      <td colSpan={infoSpan} className="px-3 py-2 align-middle">{info}</td>
      <td colSpan={labelSpan} className="whitespace-nowrap px-3 py-2 text-right align-middle">
        <span className={`mr-2 text-xs font-black tabular-nums ${tone === 'total' ? 'text-slate-300' : 'text-slate-400'}`}>
          {n ?? ''}
        </span>
        <span className={
          tone === 'total' ? 'text-base font-black uppercase tracking-wider'
            : tone === 'subtotal' ? 'text-sm font-black uppercase tracking-wide text-slate-700'
            : 'text-sm font-bold text-slate-700'
        }>
          {label}
        </span>
        {note && <span className="ml-2 text-xs font-medium text-slate-400">{note}</span>}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums ${
        tone === 'total' ? 'text-lg font-black'
          : tone === 'credit' ? 'text-base font-black text-emerald-700'
          : tone === 'subtotal' ? 'text-base font-black text-slate-900'
          : 'text-base font-bold text-slate-800'
      }`}>
        {value != null
          ? (tone === 'credit' ? `−${money(Math.abs(value))}` : money(value))
          : amount != null
            ? <span className="text-sm font-bold text-emerald-700">−{money(Math.abs(amount))}</span>
            : ''}
      </td>
      {showTax && (
        <>
          {isIgst ? (
            <td className={`whitespace-nowrap px-3 py-2 text-right align-middle text-sm font-bold tabular-nums ${tint}`}>
              {taxAmt != null ? money(taxAmt) : ''}
            </td>
          ) : (
            <>
              <td className={`whitespace-nowrap px-3 py-2 text-right align-middle text-sm font-bold tabular-nums ${tint}`}>
                {half != null ? money(half) : ''}
              </td>
              <td className={`whitespace-nowrap px-3 py-2 text-right align-middle text-sm font-bold tabular-nums ${tint}`}>
                {half != null ? money(half) : ''}
              </td>
            </>
          )}
          <td className={`whitespace-nowrap px-3 py-2 text-right align-middle text-sm font-bold tabular-nums ${tint}`}>
            {taxable != null ? money(taxable) : ''}
          </td>
        </>
      )}
    </tr>
    );
  };

  /** A labelled fact for the info pane beside the ladder. */
  const Fact: React.FC<{ k: string; v: React.ReactNode; accent?: boolean }> = ({ k, v, accent }) => (
    <div className="flex items-baseline gap-2 leading-tight">
      <span className="w-[84px] shrink-0 text-[11px] font-black uppercase tracking-wider text-slate-400">{k}</span>
      <span className={`text-sm font-bold ${accent ? 'text-emerald-700' : 'text-slate-700'}`}>{v}</span>
    </div>
  );

  let step = 0;

  /**
   * Order context, one item per ladder row. Consumed positionally by `nextFact()`
   * so a fact always sits LEVEL with a money line instead of stacking into a tall
   * first row that left a blank band above the coupon.
   */
  const facts: React.ReactNode[] = [
    // Coupon FIRST so it lands on the coupon's own discount row, not three rows below it.
    ...(couponCode ? [<Fact key="cp" k="Coupon" v={<span className="font-mono font-black text-emerald-700">{couponCode}</span>} />] : []),
    <Fact key="ch" k="Channel" v={channel} />,
    <Fact key="pay" k="Payment" v={`${paymentMethod === 'cod' ? 'Cash on delivery' : 'Prepaid'}${paymentGateway ? ` · ${paymentGateway}` : ''}`} />,
    ...(placedAt ? [<Fact key="pl" k="Placed" v={dateTime(placedAt)} />] : []),
    ...(poRef ? [<Fact key="po" k="PO ref" v={<span className="font-mono">{poRef}</span>} />] : []),
    ...(orderType === 'b2b' && customerGstin
      ? [<Fact key="gst" k="Buyer GSTIN" v={<span className="font-mono">{customerGstin}</span>} />] : []),
    ...(salesperson ? [<Fact key="sp" k="Sold by" v={salesperson} />] : []),
  ];
  let factIdx = 0;
  const nextFact = () => facts[factIdx++] ?? undefined;

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b-2 bg-slate-50/80 px-4 py-3">
        <CardTitle className="flex items-baseline gap-2 text-base font-black uppercase tracking-wide text-slate-700">
          Order Items &amp; Calculation
          <span className="text-sm font-bold normal-case tracking-normal text-slate-400">
            {rows.length} line{rows.length === 1 ? '' : 's'} · {totalQty} unit{totalQty === 1 ? '' : 's'}
          </span>
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm font-semibold text-slate-400">No items in this order.</div>
        ) : (
          /* `w-0 min-w-full`: a min-width propagates up as an INTRINSIC width
             contribution and Layout's page container is a flex item
             (`min-width:auto`), so it grew and the whole PAGE scrolled sideways.
             See COMMON_MISTAKES #215. */
          <div className="w-0 min-w-full overflow-x-auto">
            <table className={`w-full border-collapse text-sm ${showTax ? 'min-w-[1040px]' : 'min-w-[900px]'}`}>
              <thead>
                <tr className="bg-slate-800 text-left text-xs uppercase tracking-wider text-slate-100">
                  <th rowSpan={2} className="whitespace-nowrap px-3 py-2 align-bottom font-black">SKU</th>
                  <th rowSpan={2} className="min-w-[240px] px-3 py-2 align-bottom font-black">Product name</th>
                  <th rowSpan={2} className={`w-[120px] px-3 py-2 align-bottom font-black ${CLS.brand}`}>Brand</th>
                  <th rowSpan={2} className={`px-3 py-2 align-bottom font-black ${CLS.variation}`}>Variation</th>
                  <th rowSpan={2} className={`whitespace-nowrap px-3 py-2 text-right align-bottom font-black ${CLS.mrp}`}>MRP</th>
                  <th rowSpan={2} className="whitespace-nowrap px-3 py-2 text-right align-bottom font-black">Rate</th>
                  <th rowSpan={2} className="px-3 py-2 text-center align-bottom font-black">Qty</th>
                  <th rowSpan={2} className={`whitespace-nowrap px-3 py-2 text-right align-bottom font-black ${CLS.discPct}`}>Disc %</th>
                  <th colSpan={2} className="whitespace-nowrap border-l border-slate-700 px-3 pb-0.5 pt-2 text-center font-black">Discount</th>
                  <th rowSpan={2} className="whitespace-nowrap border-l border-slate-700 px-3 py-2 text-right align-bottom font-black">Total</th>
                  {showTax && (
                    <>
                      <th colSpan={gstCols} className="whitespace-nowrap border-l border-slate-700 px-3 pb-0.5 pt-2 text-center font-black">GST</th>
                      <th rowSpan={2} className="whitespace-nowrap border-l border-slate-700 px-3 py-2 text-right align-bottom font-black">Taxable value</th>
                    </>
                  )}
                </tr>
                <tr className="bg-slate-800 text-left text-[10px] uppercase tracking-wider text-slate-300">
                  <th className="whitespace-nowrap border-l border-slate-700 px-3 pb-2 text-right font-bold">Line</th>
                  <th className="whitespace-nowrap px-3 pb-2 text-right font-bold">Order</th>
                  {showTax && (isIgst
                    ? <th className="whitespace-nowrap border-l border-slate-700 px-3 pb-2 text-right font-bold">IGST</th>
                    : <>
                        <th className="whitespace-nowrap border-l border-slate-700 px-3 pb-2 text-right font-bold">CGST</th>
                        <th className="whitespace-nowrap px-3 pb-2 text-right font-bold">SGST</th>
                      </>)}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100">
                {rows.map((r, index) => {
                  const tier = tierOf(r);
                  return (
                    <tr key={index} className="align-top hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs font-black text-slate-700">
                        {r.sku}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          {/* `catalog_image` is the resolved VARIATION photo; `item.image`
                              is the cart-time snapshot which can hold the PARENT photo. */}
                          {(r.item.catalog_image || r.item.image) ? (
                            <img src={r.item.catalog_image || r.item.image} alt={r.name}
                              className="h-11 w-11 flex-shrink-0 rounded-md border-2 border-slate-100 bg-slate-50 object-cover" />
                          ) : (
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border-2 border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            {r.slug ? (
                              <a href={`${STOREFRONT_URL}/product/${r.slug}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-sm font-bold leading-snug text-slate-900 hover:text-blue-700 hover:underline"
                                title="Open on the website">
                                {r.name}
                              </a>
                            ) : (
                              <p className="text-sm font-bold leading-snug text-slate-900">{r.name}</p>
                            )}
                            <p className="mt-0.5 text-xs font-bold text-slate-500">
                              {r.hsn
                                ? <>HSN <span className="font-mono font-black text-slate-700">{r.hsn}</span></>
                                : <span className="text-amber-600">No HSN set</span>}
                              {r.rate != null && <span className="ml-2 text-slate-400">· GST {r.rate}%</span>}
                              {r.form && <span className="ml-2 text-slate-400">· {prettyAttr(r.form)}</span>}
                            </p>
                            {/* Narrow viewports hide Brand/Variation as columns. */}
                            <p className={`mt-0.5 text-xs font-bold text-slate-400 ${CLS.brandInline}`}>
                              {r.brand ?? ''}
                            </p>
                            {r.attrs.length > 0 && (
                              <p className={`text-xs font-bold text-slate-500 ${CLS.attrInline}`}>
                                {r.attrs.map(([k, v]) => `${prettyAttr(k)} ${v}`).join(' · ')}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <Badge variant="outline" className={`text-[10px] font-black uppercase ${TIER_CLASS[tier.tone]}`}>
                                {tier.label}
                              </Badge>
                              {r.offRetailPct != null && (
                                <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-bold text-purple-700">
                                  {r.offRetailPct.toFixed(1)}% off retail
                                </Badge>
                              )}
                              {r.bundle && (
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700">
                                  Bundle: {r.bundle.title}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Brand — full text, the column sizes to it. */}
                      <td className={`w-[120px] px-3 py-3 align-top ${CLS.brand}`}>
                        {r.brand
                          ? <span className="text-sm font-black leading-tight text-slate-700">{r.brand}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      <td className={`px-3 py-3 align-top ${CLS.variation}`}>
                        {r.attrs.length ? (
                          <div className="space-y-0.5">
                            {r.attrs.map(([k, v]) => (
                              <div key={k} className="whitespace-nowrap text-sm leading-tight">
                                <span className="text-[11px] font-bold uppercase text-slate-400">{prettyAttr(k)} </span>
                                <span className="font-black text-slate-700">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* MRP — no strike-through: the Disc % column already says it
                          was cut, and struck digits are the hardest to read here. */}
                      <td className={`whitespace-nowrap px-3 py-3 text-right align-top text-sm font-semibold tabular-nums text-slate-500 ${CLS.mrp}`}>
                        {r.mrp !== undefined && r.mrp > 0 ? money(Number(r.mrp)) : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                        <span className="text-base font-black tabular-nums text-slate-900">{money(r.price)}</span>
                        {r.retail != null && Number(r.retail) > r.price && (
                          <div className="text-xs font-bold text-slate-400">retail {money(Number(r.retail))}</div>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-center align-top text-base font-black tabular-nums text-slate-900">
                        {r.qty}
                      </td>

                      <td className={`whitespace-nowrap px-3 py-3 text-right align-top tabular-nums ${CLS.discPct}`}>
                        {r.discPct > 0.05
                          ? <span className="text-base font-black text-emerald-700">{r.discPct.toFixed(1)}%</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap border-l border-slate-100 px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-emerald-700">
                        {r.mrpDiscount > 0.009 ? money(r.mrpDiscount) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-emerald-700">
                        {r.orderShare > 0.009 ? money(r.orderShare) : <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap border-l border-slate-100 px-3 py-3 text-right align-top text-base font-black tabular-nums text-slate-900">
                        {money(r.lineTotal)}
                      </td>

                      {showTax && (
                        <>
                          {isIgst ? (
                            <td className="whitespace-nowrap border-l border-slate-100 px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-slate-700">
                              {r.lineGst != null ? money(r.lineGst) : <span className="text-slate-300">—</span>}
                            </td>
                          ) : (
                            <>
                              <td className="whitespace-nowrap border-l border-slate-100 px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-slate-700">
                                {r.lineGst != null ? money(r.lineGst / 2) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-slate-700">
                                {r.lineGst != null ? money(r.lineGst / 2) : <span className="text-slate-300">—</span>}
                              </td>
                            </>
                          )}
                          <td className="whitespace-nowrap border-l border-slate-100 px-3 py-3 text-right align-top text-sm font-bold tabular-nums text-slate-700">
                            {r.taxable != null ? money(r.taxable) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* ── Totals of every column ── */}
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-slate-900">
                  <td className="px-3 py-3 text-sm font-black uppercase tracking-wider text-slate-500">Totals</td>
                  <td className="px-3 py-3 text-sm font-bold text-slate-500">
                    {rows.length} line{rows.length === 1 ? '' : 's'}
                  </td>
                  <td className={CLS.brand} />
                  <td className={CLS.variation} />
                  <td className={`whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-500 ${CLS.mrp}`}>
                    {money(totalMrp)}
                  </td>
                  <td className="px-3 py-3" />
                  <td className="whitespace-nowrap px-3 py-3 text-center text-base font-black tabular-nums">{totalQty}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right text-base font-black tabular-nums text-emerald-700 ${CLS.discPct}`}>
                    {totalDiscPct > 0.05 ? `${totalDiscPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="whitespace-nowrap border-l border-slate-300 px-3 py-3 text-right text-sm font-black tabular-nums text-emerald-700">
                    {totalLineDiscount > 0.009 ? money(totalLineDiscount) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-black tabular-nums text-emerald-700">
                    {totalOrderShare > 0.009 ? money(totalOrderShare) : '—'}
                  </td>
                  <td className="whitespace-nowrap border-l border-slate-300 px-3 py-3 text-right text-lg font-black tabular-nums">
                    {money(totalValue)}
                  </td>
                  {showTax && (
                    <>
                      {isIgst ? (
                        <td className="whitespace-nowrap border-l border-slate-300 px-3 py-3 text-right text-base font-black tabular-nums text-slate-700">
                          {anyTax ? money(totalLineGst) : '—'}
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap border-l border-slate-300 px-3 py-3 text-right text-base font-black tabular-nums text-slate-700">
                            {anyTax ? money(totalLineGst / 2) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-base font-black tabular-nums text-slate-700">
                            {anyTax ? money(totalLineGst / 2) : '—'}
                          </td>
                        </>
                      )}
                      <td className="whitespace-nowrap border-l border-slate-300 px-3 py-3 text-right text-base font-black tabular-nums text-slate-700">
                        {anyTax ? money(totalTaxable) : '—'}
                      </td>
                    </>
                  )}
                </tr>

                {/* ── The order calculation, in the sequence it happens. The wide
                       left area carries the order's own context instead of being
                       a blank band. ── */}
                {hasLadder && (
                  <>
                    <tr className="bg-slate-50">
                      <td colSpan={infoSpan} className="px-3 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Order details
                      </td>
                      <td colSpan={visibleCols - infoSpan} className="px-3 pb-1 pt-3 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">
                        How this order was calculated
                      </td>
                    </tr>

                    {/* No "Items value" step — the TOTALS row directly above
                        already carries that figure; repeating it as step 1 just
                        said the same number twice. The order context moves onto
                        the first row that remains. */}

                    {/* Each discount that made up the total, named individually. */}
                    {orderDiscount > 0 && discountParts.map((part, i) => (
                      <Step
                        key={`d${i}`} n={i === 0 ? ++step : ''}
                        label={<span className="text-emerald-800">{part}</span>}
                        amount={discountAmountFor(part)}
                        info={nextFact()}
                      />
                    ))}
                    {orderDiscount > 0 && (
                      <Step tone="credit" label="Order discount" value={orderDiscount} info={nextFact()} />
                    )}
                    {orderDiscount > 0 && (
                      <Step n={++step} tone="subtotal" label="Net items value" value={sub - orderDiscount} info={nextFact()} />
                    )}

                    {/* Charges carry their OWN taxable value + GST in the tax columns. */}
                    {m.charges.filter((c) => Number(c.amount) > 0).map((c, i) => {
                      const isCod = /cod/i.test(c.label ?? '');
                      const isShip = /ship/i.test(c.label ?? '');
                      const remove = isCod ? onRemoveCod : isShip ? onRemoveShipping : undefined;
                      const busy = isCod ? removingCharge === 'cod' : removingCharge === 'shipping';
                      const cTax = (c.cgst ?? 0) + (c.sgst ?? 0) + (c.igst ?? 0);
                      return (
                        <Step
                          key={`c${i}`} n={++step} value={Number(c.amount)}
                          taxable={showTax && c.taxableAmount ? Number(c.taxableAmount) : null}
                          taxAmt={showTax && cTax ? cTax : null}
                          note={c.rate ? `GST ${c.rate}%` : undefined}
                          info={nextFact()}
                          label={
                            <>{c.label}
                              {remove && (
                                <button type="button" onClick={remove} disabled={busy}
                                  className="ml-2 text-xs font-bold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
                                  {busy ? 'Removing…' : 'Remove'}
                                </button>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                    {/* Shipping with no charge entry of its own (GST not configured). */}
                    {shipping > 0 && !m.charges.some((c) => /ship/i.test(c.label ?? '')) && (
                      <Step n={++step} value={shipping}
                        label={
                          <>Shipping
                            {onRemoveShipping && (
                              <button type="button" onClick={onRemoveShipping} disabled={removingCharge === 'shipping'}
                                className="ml-2 text-xs font-bold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
                                {removingCharge === 'shipping' ? 'Removing…' : 'Remove'}
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

                    <Step
                      n={++step} tone="total" label="Order total" value={total ?? totalValue}
                      taxable={showTax ? m.totalTaxable : null}
                      taxAmt={showTax ? m.gstTotal : null}
                    />

                    {m.received > 0 && (
                      <>
                        <Step tone="credit" label="Amount received (before delivery)" value={m.received} />
                        <Step tone="subtotal" label="Balance due on delivery" value={m.balanceDue} />
                      </>
                    )}
                  </>
                )}
              </tfoot>
            </table>
          </div>
        )}

        {hasLadder && !hasGst && (
          <div className="border-t-2 border-amber-100 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
            No GST breakdown was recorded for this order — GST was not enabled/configured when it
            was placed, so the Taxable value and GST columns are not shown.
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-100 bg-white px-4 py-2.5 text-sm">
            <span />
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
