import React from 'react';
import { useStoreSiteUrl, productPageUrl } from '../../lib/storefront';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Same env var Settings / PageBuilder / Categories read for storefront links. */
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
  /** Units removed by a partial cancellation (migration 168). */
  cancelled_quantity?: number;
  cancelledQuantity?: number;
  cancelled_reason?: string | null;
  cancelledReason?: string | null;
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
  /**
   * Per-line shipment progress (`order.fulfillment.lines`). Present ⇒ the table
   * grows a **Fulfilment** pair, Shipped / To ship, so a part-shipped order can
   * be read down a column instead of by cross-referencing a card several
   * screens away. Absent or empty ⇒ the columns never render and the layout is
   * byte-for-byte what it was.
   */
  fulfilmentLines?: Array<{ sku: string; name: string; ordered: number; shipped: number; remaining: number }> | null;
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

/**
 * A discount percentage, stated EXACTLY.
 *
 * This used to be `toFixed(1)`, which turned an order-level share of 2.083%
 * into "2.1%" and a coupon the store advertises as "2% off" into a number
 * matching neither — the owner reported exactly that confusion. Two decimals
 * with the trailing zeros trimmed says 20%, 2.08% and 6.5% without inventing
 * precision the figure does not have.
 */
const pct = (n: number) => `${Number(n.toFixed(2))}%`;

/**
 * The product name WITHOUT the brand it is already sitting next to.
 *
 * Catalogue names are stored brand-first ("Dr. Willmar Schwabe India Berberis
 * Vulgaris Mother Tincture Q 100 ML") and the brand is ALWAYS on the row anyway
 * — its own column when there is room, a muted line inside this cell when there
 * is not. So an eight-line order printed the same brand sixteen times and wrapped
 * every product name onto three lines for no information at all.
 *
 * Conservative on purpose: it matches only a brand at the very START, needs a
 * word boundary after it (so "Schwabe" never eats "SchwabeVita"), and if what
 * is left would be empty or nearly so, the full name is kept.
 */
const stripLeadingBrand = (name: string, brand?: string | null): string => {
  const n = String(name ?? '').trim();
  const b = String(brand ?? '').trim();
  if (!b || b.length < 3 || n.length <= b.length) return n;
  if (n.slice(0, b.length).toLowerCase() !== b.toLowerCase()) return n;
  const rest = n.slice(b.length).replace(/^[\s\-–—:,.]+/, '').trim();
  return rest.length >= 3 ? rest : n;
};
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
 * Which columns are on screen right now — ONE source of truth.
 *
 * The ladder rows span columns with `colSpan`, a static number CSS visibility
 * cannot shrink, so the previous split (Tailwind classes hiding cells + a hook
 * counting them) had to keep two lists in step by hand and drifted (#215).
 * Columns are now rendered conditionally in JS from this one object, so a
 * hidden column simply does not exist and every span is derived, never typed.
 *
 * These are the width the TABLE actually has (`useElementWidth` on the scroll
 * container) — NOT the viewport. They used to be viewport numbers, which made
 * every one of them ~580px optimistic, because the table sits in the page's 80%
 * column behind a 256px app sidebar: a 1600px window gives it 1024px. The
 * columns it decided it could afford then did not fit, and the overflow fell on
 * the Total column at the right edge.
 *
 * Budget at the floor (SKU 64 · Product 200 · discount ₹ 78 · Rate 86 · order
 * discount ₹ 78 · Qty 46 · Taxable 86 · GST 78 · Total 92) is ~810px with one
 * GST column and ~890 with the CGST/SGST split; each threshold below adds the
 * column it names to that.
 */
const BP = {
  /** Shipped / To ship. Low, because on a part-shipped order it is the
   *  question being asked — it earns its width before Brand or Net rate do. */
  fulfilment: 900, lineDiscPct: 880, mrp: 950, orderDiscPct: 1080, netRate: 1160, brand: 1280 } as const;

/** Width the product column is allowed — see the header comment on it. */
const PRODUCT_COL = 230;

/**
 * How wide THIS TABLE is — not how wide the window is.
 *
 * The column budget used to be measured against `window.innerWidth`, which was
 * true when the table spanned the page. It does not: the order page is an 80/20
 * grid, so at a 1600px window the table gets ~1024px. Every breakpoint was
 * therefore ~580px optimistic, and the columns it kept could not fit — the Total
 * column, the one number anybody is looking for, was clipped off the right edge.
 *
 * A ResizeObserver on the scroll container answers the question the layout
 * actually asks, and keeps answering it when the rail collapses at `xl` or the
 * browser's sidebar opens.
 */
function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>): number {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * The order's line items AND its money ladder, as one aligned table.
 *
 * Columns (owner spec, 2026-09-07) read left to right as the actual calculation:
 *   SKU · Product name (+HSN +GST%) · Brand · Variation ·
 *   MRP · Line discount {% | ₹} · **Rate** · Qty ·
 *   Order discount {% | ₹} · Net rate · Taxable value · GST · Total
 *
 * Two discounts, kept apart because they are different things: the LINE
 * discount is this pack's own MRP → rate cut (COMMON_MISTAKES #91), the ORDER
 * discount is the order-level total (coupon + payment discount + …) apportioned
 * across the lines. The order-discount % is measured against the **rate**, not
 * the MRP — it is a cut off what the customer was actually being charged.
 *
 * `Total` is the line's NET: rate × qty − order-discount share, which is
 * exactly Taxable + GST, so every row adds up across its own columns.
 *
 * ── What is authoritative, and what is a display split ──
 * `computeOrderTotals` (backend) is the only totals brain. Every order-level
 * figure is read straight off the stored order. Per-line Taxable/GST is a
 * *decomposition* of that line's own money at its own rate, rendered only when
 * a rate is genuinely resolvable.
 */
const OrderItems: React.FC<OrderItemsProps> = ({
  items, b2bTier, orderDiscount = 0, headerAction,
  subtotal, shipping = 0, total, gst, amountReceived, couponCode, discountReason, discountItems,
  orderNotes, paymentMethod, paymentGateway, placedAt, orderType, customerGstin,
  salesperson, importedFrom,
  onRemoveShipping, onRemoveCod, removingCharge, fulfilmentLines,
}) => {
  /** This store's own website — from the server, per store (lib/storefront.ts). */
  const siteUrl = useStoreSiteUrl();
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

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const measured = useElementWidth(scrollerRef);
  // Before the first measure there is no element to ask. Assume the common desk
  // width rather than the narrowest layout, so the table does not visibly shed
  // and regrow its columns on every load.
  const tw = measured || 1024;
  /**
   * Shipment progress per line, keyed the way the backend keys it (SKU, else
   * product name — `services/orderFulfillment.ts lineKey`). Built once so the
   * row loop is a map lookup, not a find per line.
   */
  const fulfilByKey = React.useMemo(() => {
    const m = new Map<string, { ordered: number; shipped: number; remaining: number }>();
    for (const l of fulfilmentLines ?? []) {
      const k = String(l.sku || l.name || '').trim();
      if (k) m.set(k, { ordered: Number(l.ordered) || 0, shipped: Number(l.shipped) || 0, remaining: Number(l.remaining) || 0 });
    }
    return m;
  }, [fulfilmentLines]);
  /** Only worth two columns once something has actually shipped. */
  const anyShipped = React.useMemo(
    () => (fulfilmentLines ?? []).some((l) => Number(l.shipped) > 0),
    [fulfilmentLines],
  );

  const show = {
    fulfilment: anyShipped && tw >= BP.fulfilment,
    brand: tw >= BP.brand,
    variation: tw >= BP.brand,
    mrp: tw >= BP.mrp,
    lineDiscPct: tw >= BP.lineDiscPct,
    orderDiscPct: tw >= BP.orderDiscPct,
    netRate: tw >= BP.netRate,
  };
  const lineDiscCols = show.lineDiscPct ? 2 : 1;
  const orderDiscCols = show.orderDiscPct ? 2 : 1;
  /** Every rendered column, counted from the same object that renders them. */
  const visibleCols =
    2                                                   // SKU, Product
    + (show.brand ? 1 : 0) + (show.variation ? 1 : 0)
    + (show.mrp ? 1 : 0)
    + lineDiscCols
    + 2                                                 // Rate, Qty
    + orderDiscCols
    + (show.netRate ? 1 : 0)
    + (show.fulfilment ? 2 : 0)                         // Shipped, To ship
    + (showTax ? 1 + gstCols : 0)                       // Taxable value, GST
    + 1;                                                // Total
  /** Cells the ladder fills on the right: Taxable + GST + Total. */
  const tailCols = (showTax ? 1 + gstCols : 0) + 1;
  /** Info pane (left) · label (middle) · the tail — always summing to exactly
   *  the number of columns the table is really rendering. */
  const infoSpan = tw < 560 ? 1 : Math.max(1, Math.min(3, visibleCols - tailCols - 2));
  const labelSpan = Math.max(1, visibleCols - infoSpan - tailCols);
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
    /**
     * PER-UNIT twins of the two discounts.
     *
     * The row reads left to right as one calculation — MRP → line discount →
     * Rate → order discount → Net rate — and every one of those is a per-UNIT
     * figure, so the discounts between them must be per unit too. They were not:
     * both cells rendered the whole LINE's discount next to a per-unit MRP and a
     * per-unit rate. On this catalogue almost every line is qty 1, which hid it
     * completely; at qty 2 the row said MRP ₹295, discount ₹118, rate ₹236 and
     * subtracted to nothing. That is the "discount is just there as a show piece"
     * the owner reported — the numbers were right, they were simply not the ones
     * the arithmetic beside them needed.
     *
     * Qty now sits AFTER these columns, so everything left of it is per unit and
     * everything right of it is line money. The totals row stays line money,
     * because a column of summed per-unit prices would be a number nobody owes.
     */
    const mrpDiscountUnit = qty > 0 ? mrpDiscount / qty : 0;
    const orderShareUnit = qty > 0 ? orderShare / qty : 0;
    const discAmt = mrpDiscount + orderShare;
    const baseValue = (mrp !== undefined && mrp > 0 ? mrp : price) * qty;
    const discPct = baseValue > 0 ? (mrpDiscount / baseValue) * 100 : 0;
    // The order-level cut, measured against the RATE — what the customer was
    // actually being charged — not against the MRP the line was already cut from.
    const orderDiscPct = lineTotal > 0 ? (orderShare / lineTotal) * 100 : 0;
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
    const netRate = qty > 0 ? net / qty : 0;
    const taxable = hasGst && rate != null && rate >= 0
      ? (inclusive ? net / (1 + rate / 100) : net) : null;
    const lineGst = taxable != null ? net - taxable : null;

    return {
      item,
      name: item.catalog_name || item.catalogName || item.product_name || item.productName || 'Unnamed product',
      // Name as SHOWN — see stripLeadingBrand. `name` itself stays whole for the
      // image alt text and anything that needs the catalogue's own wording.
      displayName: stripLeadingBrand(
        item.catalog_name || item.catalogName || item.product_name || item.productName || 'Unnamed product',
        item.catalog_brand || item.catalogBrand || item.attributes?.brand || null,
      ),
      slug: item.product_slug ?? item.productSlug ?? null,
      sku: item.catalog_sku || item.catalogSku || item.sku || '—',
      hsn: item.catalog_hsn ?? item.catalogHsn ?? null,
      brand: item.catalog_brand || item.catalogBrand || item.attributes?.brand || null,
      form: item.attributes?.['product-form'] || null,
      attrs: attributePairs(item.attributes),
      price, qty, lineTotal, mrp, mrpDiscount, orderShare, discAmt, discPct, orderDiscPct,
      mrpDiscountUnit, orderShareUnit,
      offRetailPct, rate, net, netRate, taxable, lineGst,
      // Migration 168: a partially-cancelled line is no longer DELETED, so the
      // desk can finally see what came off and why. `qty` still means "live",
      // which is why every money figure above is unaffected.
      cancelledQty: Number(item.cancelled_quantity ?? item.cancelledQuantity ?? 0) || 0,
      cancelledReason: item.cancelled_reason ?? item.cancelledReason ?? null,
      retail: item.retailPrice ?? item.retail_price,
      source: item.priceSource ?? item.price_source,
      bundle: item.bundle_applied || item.bundleApplied,
    };
  });

  const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalQty = sum((r) => r.qty);
  /** Units out and units still owed — summed from the SAME per-line record the
   *  cells read, so the footer can never disagree with the column above it. */
  const totalShipped = (fulfilmentLines ?? []).reduce((s, l) => s + (Number(l.shipped) || 0), 0);
  const totalToShip = (fulfilmentLines ?? []).reduce((s, l) => s + (Number(l.remaining) || 0), 0);
  const totalGross = sum((r) => r.lineTotal);
  const totalDiscount = sum((r) => r.discAmt);
  const totalLineDiscount = sum((r) => r.mrpDiscount);
  const totalOrderShare = sum((r) => r.orderShare);
  const totalNet = totalGross - totalOrderShare;
  const totalMrp = sum((r) => (r.mrp !== undefined && r.mrp > 0 ? r.mrp : r.price) * r.qty);
  const anyTax = rows.some((r) => r.taxable != null);
  const totalTaxable = sum((r) => r.taxable ?? 0);
  const totalLineGst = sum((r) => r.lineGst ?? 0);
  const totalDiscPct = totalMrp > 0 ? (totalLineDiscount / totalMrp) * 100 : 0;
  /** The aggregate order-level saving — two coupons at 5% and 2% land here as
   *  the one number the operator is actually asked for. */
  const totalOrderDiscPct = totalGross > 0 ? (totalOrderShare / totalGross) * 100 : 0;

  const hasLadder = total != null;
  const sub = subtotal ?? totalGross;
  const m = deriveOrderMoney({
    subtotal: sub, shipping, discount: orderDiscount, total: total ?? totalGross, gst, amountReceived,
  });

  /** Each discount that made up the order-level total, by name. */
  const discountParts = String(discountReason ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  /**
   * "2% off" / "Coupon LAUNCH5: 5.00% off" → 2 / 5 — the rate the discount was
   * STATED at, which is not always the rate it worked out to.
   */
  const nominalPctOf = (reason: string): number | null => {
    const m = String(reason).match(/(\d+(?:\.\d+)?)\s*%/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  /**
   * What a stated percentage actually became, once it was rounded to the rupee.
   * Returns null when nothing moved — the note only earns its place when the two
   * figures genuinely differ.
   */
  const roundingNote = (reason: string, amount: number | undefined): string | null => {
    const pct = nominalPctOf(reason);
    if (pct == null || amount == null || totalGross <= 0) return null;
    const exact = (totalGross * pct) / 100;
    if (Math.abs(exact - amount) < 0.005) return null;
    return `${pct}% of ${money(totalGross)} = ${money(exact)}, rounded to ${money(amount)}`;
  };

  /**
   * The rupee amount of ONE named discount, when the order stored it.
   *
   * `orders.discount_items` (migration 155) records `{amount, reason}` per
   * component. Never re-derived here: the parts provably do not re-sum to the
   * stored total (money math lives in `computeOrderTotals`, CLAUDE.md rule 7a),
   * so an order placed before the column was written shows its components under
   * one combined amount rather than an invented split.
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

  const NUM = 'whitespace-nowrap px-1.5 py-3 text-right align-top tabular-nums';
  const TH = 'whitespace-nowrap px-1.5 py-2 text-right align-bottom font-semibold';

  /**
   * One row of the order ladder, aligned to the table's columns.
   * `info` fills the otherwise-dead area to the LEFT of the amounts with the
   * order's own context (coupons, channel, payment, GSTIN) instead of leaving
   * a full-width blank band.
   */
  const Step: React.FC<{
    n?: number | string; label: React.ReactNode; note?: React.ReactNode | null;
    value?: number; tone?: 'plain' | 'credit' | 'subtotal' | 'total';
    taxable?: number | null; taxAmt?: number | null;
    info?: React.ReactNode;
  }> = ({ n, label, note, value, tone = 'plain', taxable, taxAmt, info }) => {
    const tint = tone === 'total' ? 'text-blue-900' : 'text-slate-700';
    const half = taxAmt != null ? taxAmt / 2 : null;
    return (
    <tr className={
      tone === 'total' ? 'border-t-2 border-blue-200 bg-blue-50 text-blue-900'
        : tone === 'subtotal' ? 'border-t border-slate-200 bg-slate-50'
        : 'bg-white'
    }>
      <td colSpan={infoSpan} className="px-3 py-2 align-middle">{info}</td>
      {/* NOT `whitespace-nowrap`. This cell spans most of the table and carries
          the longest strings on the page ("Online payment discount (2% off) — 2%
          of ₹1,644.00 = ₹32.88, rounded to ₹33.00"). Refusing to wrap made its
          min-content the width of that whole sentence, which the browser then
          shared out across the columns it spans — so a footnote was setting the
          width of the Line discount and Order discount columns and pushing Qty,
          Taxable and GST off the right edge. It wraps; the numbers beside it
          still do not. */}
      <td colSpan={labelSpan} className="px-2 py-2 text-right align-middle">
        <span className={`mr-2 text-xs font-semibold tabular-nums ${tone === 'total' ? 'text-blue-400' : 'text-slate-400'}`}>
          {n ?? ''}
        </span>
        <span className={
          tone === 'total' ? 'text-base font-bold uppercase tracking-wider'
            : tone === 'credit' ? 'text-sm font-medium text-emerald-800'
            : 'text-sm font-medium text-slate-700'
        }>
          {label}
        </span>
        {note && <span className="ml-2 text-xs font-medium text-slate-400">{note}</span>}
      </td>
      {showTax && (
        <>
          <td className={`whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-medium tabular-nums ${tint}`}>
            {taxable != null ? money(taxable) : ''}
          </td>
          {isIgst ? (
            <td className={`whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-medium tabular-nums ${tint}`}>
              {taxAmt != null ? money(taxAmt) : ''}
            </td>
          ) : (
            <>
              <td className={`whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-medium tabular-nums ${tint}`}>
                {half != null ? money(half) : ''}
              </td>
              <td className={`whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-medium tabular-nums ${tint}`}>
                {half != null ? money(half) : ''}
              </td>
            </>
          )}
        </>
      )}
      <td className={`whitespace-nowrap px-2 py-2 text-right align-middle tabular-nums ${
        tone === 'total' ? 'text-lg font-bold'
          : tone === 'credit' ? 'text-base font-semibold text-emerald-700'
          : tone === 'subtotal' ? 'text-base font-semibold text-slate-900'
          : 'text-base font-medium text-slate-800'
      }`}>
        {value != null ? money(value) : ''}
      </td>
    </tr>
    );
  };

  /** A labelled fact for the info pane beside the ladder. */
  const Fact: React.FC<{ k: string; v: React.ReactNode; accent?: boolean }> = ({ k, v, accent }) => (
    <div className="flex items-baseline gap-2 leading-tight">
      <span className="w-[84px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</span>
      <span className={`text-sm font-medium ${accent ? 'text-emerald-700' : 'text-slate-700'}`}>{v}</span>
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
    ...(couponCode ? [<Fact key="cp" k="Coupon" v={<span className="font-mono font-semibold text-emerald-700">{couponCode}</span>} />] : []),
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
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b bg-slate-50/80 px-4 py-3">
        <CardTitle className="flex items-baseline gap-2 text-base font-semibold uppercase tracking-wide text-slate-700">
          Order Items &amp; Calculation
          <span className="text-sm font-medium normal-case tracking-normal text-slate-400">
            {rows.length} line{rows.length === 1 ? '' : 's'} · {totalQty} unit{totalQty === 1 ? '' : 's'}
          </span>
          {/* Said ONCE, here, instead of a "/unit" on four separate headers —
              those labels were setting the width of columns holding "₹3.85" and
              pushing Qty, Taxable and GST off the right edge. */}
          <span className="hidden text-xs font-medium normal-case tracking-normal text-slate-400 sm:inline">
            everything up to Qty is per unit · after it, per line
          </span>
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm font-medium text-slate-400">No items in this order.</div>
        ) : (
          /* `w-0 min-w-full`: a min-width propagates up as an INTRINSIC width
             contribution and Layout's page container is a flex item
             (`min-width:auto`), so it grew and the whole PAGE scrolled sideways.
             See COMMON_MISTAKES #215. */
          <div ref={scrollerRef} className="w-0 min-w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-left text-[11px] uppercase tracking-wider text-blue-900">
                  <th rowSpan={2} className="whitespace-nowrap px-1.5 py-2 align-bottom font-semibold">SKU</th>
                  {/* CAPPED. Product name is the only content-sized column, so it
                      took whatever it wanted (329px on a real order) and pushed
                      the right-hand columns past the container — Qty, Taxable and
                      GST off the edge. Bounded here and truncated in the cell, the
                      whole calculation fits at a normal desk width; the full name
                      stays in the tooltip and one click away on the storefront. */}
                  <th rowSpan={2} style={{ width: PRODUCT_COL, maxWidth: PRODUCT_COL }}
                    className="px-2 py-2 align-bottom font-semibold">Product name</th>
                  {show.brand && <th rowSpan={2} className="w-[120px] px-2 py-2 align-bottom font-semibold">Brand</th>}
                  {show.variation && <th rowSpan={2} className="px-2 py-2 align-bottom font-semibold">Variation</th>}
                  {show.mrp && <th rowSpan={2} className={TH} title="Printed price of ONE pack">MRP</th>}
                  <th colSpan={lineDiscCols} className="whitespace-nowrap border-l border-slate-300 px-2 pb-0.5 pt-2 text-center font-semibold">
                    Line disc.
                  </th>
                  <th rowSpan={2} className={`border-l border-slate-300 ${TH}`} title="What one pack was charged at, after its own line discount">Rate</th>
                  <th colSpan={orderDiscCols} className="whitespace-nowrap border-l border-slate-300 px-2 pb-0.5 pt-2 text-center font-semibold">
                    Order disc.
                  </th>
                  {show.netRate && <th rowSpan={2} className={`border-l border-slate-300 ${TH}`} title="One pack after the order-level discount share — this × Qty is the line total">Net&nbsp;rate</th>}
                  {/* Qty is the MULTIPLIER, so it sits between the per-unit block
                      (MRP → discounts → Rate → Net rate) and the line money
                      (Taxable → GST → Total). Owner's column order. */}
                  <th rowSpan={2} className="whitespace-nowrap border-l border-slate-300 px-2 py-2 text-center align-bottom font-semibold">Qty</th>
                  {/* WHICH UNITS HAVE ACTUALLY GONE OUT. A part-shipped order's
                      first question, answerable down a column instead of by
                      reading a card in the page footer. */}
                  {show.fulfilment && (
                    <th colSpan={2} className="whitespace-nowrap border-l border-slate-300 px-2 pb-0.5 pt-2 text-center font-semibold">
                      Fulfilment
                    </th>
                  )}
                  {showTax && (
                    <>
                      <th rowSpan={2} className={`border-l border-slate-300 ${TH}`}>
                        {show.netRate ? 'Taxable value' : 'Taxable'}
                      </th>
                      <th colSpan={gstCols} className="whitespace-nowrap border-l border-slate-300 px-2 pb-0.5 pt-2 text-center font-semibold">GST</th>
                    </>
                  )}
                  <th rowSpan={2} className={`border-l border-slate-300 ${TH}`}>Total</th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-100 text-left text-[10px] uppercase tracking-wider text-blue-700">
                  {show.lineDiscPct && <th className="whitespace-nowrap border-l border-slate-300 px-2 pb-2 text-right font-medium">%</th>}
                  <th className={`whitespace-nowrap px-2 pb-2 text-right font-medium ${show.lineDiscPct ? '' : 'border-l border-slate-300'}`} title="Cut off ONE pack">₹</th>
                  {show.orderDiscPct && <th className="whitespace-nowrap border-l border-slate-300 px-2 pb-2 text-right font-medium">%</th>}
                  <th className={`whitespace-nowrap px-2 pb-2 text-right font-medium ${show.orderDiscPct ? '' : 'border-l border-slate-300'}`} title="This line's share of the order-level discount, per pack">₹</th>
                  {/* ⚠️ ORDER IS LOAD-BEARING. This row fills the colSpan groups
                      of the row above, left to right: line discount, order
                      discount, THEN fulfilment, then GST. Net rate and Qty are
                      rowSpan={2} and take no cell here. */}
                  {show.fulfilment && (
                    <>
                      <th className="whitespace-nowrap border-l border-slate-300 px-2 pb-2 text-center font-medium">Shipped</th>
                      <th className="whitespace-nowrap px-2 pb-2 text-center font-medium">To ship</th>
                    </>
                  )}
                  {showTax && (isIgst
                    ? <th className="whitespace-nowrap border-l border-slate-300 px-2 pb-2 text-right font-medium">IGST</th>
                    : <>
                        <th className="whitespace-nowrap border-l border-slate-300 px-2 pb-2 text-right font-medium">CGST</th>
                        <th className="whitespace-nowrap px-2 pb-2 text-right font-medium">SGST</th>
                      </>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, index) => {
                  const tier = tierOf(r);
                  return (
                    <tr key={index} className="align-top hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-1.5 py-3 font-mono text-xs font-semibold text-slate-700">
                        {r.sku}
                      </td>

                      <td style={{ width: PRODUCT_COL, maxWidth: PRODUCT_COL }} className="px-2 py-3">
                        <div className="flex items-start gap-3">
                          {/* `catalog_image` is the resolved VARIATION photo; `item.image`
                              is the cart-time snapshot which can hold the PARENT photo.
                              Hidden until Brand/Variation get their own columns — below
                              that the product column is the table's only slack, and the
                              thumbnail was spending 56px of it. */}
                          {show.brand && ((r.item.catalog_image || r.item.image) ? (
                            <img src={r.item.catalog_image || r.item.image} alt={r.name}
                              className="h-11 w-11 flex-shrink-0 rounded-md border border-slate-100 bg-slate-50 object-cover" />
                          ) : (
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-[9px] font-medium text-slate-400">
                              No img
                            </div>
                          ))}
                          <div className="min-w-0">
                            {productPageUrl(siteUrl, r.slug) ? (
                              <a href={productPageUrl(siteUrl, r.slug)!}
                                target="_blank" rel="noopener noreferrer"
                                className="block truncate text-sm font-semibold leading-snug text-slate-900 hover:text-blue-700 hover:underline"
                                title={r.name}>
                                {r.displayName}
                              </a>
                            ) : (
                              <p className="truncate text-sm font-semibold leading-snug text-slate-900" title={r.name}>{r.displayName}</p>
                            )}
                            <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                              {r.hsn
                                ? <>HSN <span className="font-mono text-slate-700">{r.hsn}</span></>
                                : <span className="text-amber-600">No HSN set</span>}
                              {r.rate != null && <span className="ml-2 text-slate-400">· GST {r.rate}%</span>}
                              {r.form && <span className="ml-2 text-slate-400">· {prettyAttr(r.form)}</span>}
                            </p>
                            {/* When Brand and Variation have no columns of their own
                                they fall back to here — on ONE line, not two. Five
                                stacked metadata lines made every row ~165px tall, so
                                an eight-line order was 1,300px of table for 8 facts. */}
                            {(!show.brand && r.brand) || (!show.variation && r.attrs.length > 0) ? (
                              <p className="mt-0.5 truncate text-xs font-medium text-slate-500"
                                title={[!show.variation ? r.attrs.map(([k, v]) => `${prettyAttr(k)} ${v}`).join(' · ') : null,
                                        !show.brand ? r.brand : null]
                                        .filter(Boolean).join(' · ')}>
                                {/* VARIATION FIRST. This line truncates, and potency is
                                    what separates a 30C from a 200C on an eight-line
                                    order — the brand is identical on every row of most
                                    of them, so it is the part that can afford to be
                                    cut. */}
                                {!show.variation && r.attrs.length > 0 && (
                                  <span className="text-slate-600">{r.attrs.map(([k, v]) => `${prettyAttr(k)} ${v}`).join(' · ')}</span>
                                )}
                                {!show.variation && r.attrs.length > 0 && !show.brand && r.brand && <span className="text-slate-300"> · </span>}
                                {!show.brand && r.brand && <span className="text-slate-400">{r.brand}</span>}
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${TIER_CLASS[tier.tone]}`}>
                                {tier.label}
                              </Badge>
                              {r.offRetailPct != null && (
                                <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-medium text-purple-700">
                                  {r.offRetailPct.toFixed(1)}% off retail
                                </Badge>
                              )}
                              {r.bundle && (
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] font-medium text-blue-700">
                                  Bundle: {r.bundle.title}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {show.brand && (
                        <td className="w-[120px] px-2 py-3 align-top">
                          {r.brand
                            ? <span className="text-sm font-semibold leading-tight text-slate-700">{r.brand}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      )}

                      {show.variation && (
                        <td className="px-2 py-3 align-top">
                          {r.attrs.length ? (
                            <div className="space-y-0.5">
                              {r.attrs.map(([k, v]) => (
                                <div key={k} className="whitespace-nowrap text-sm leading-tight">
                                  <span className="text-[11px] font-medium uppercase text-slate-400">{prettyAttr(k)} </span>
                                  <span className="font-semibold text-slate-700">{v}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      )}

                      {/* MRP — no strike-through: the Line discount % column already
                          says it was cut, and struck digits are the hardest to read. */}
                      {show.mrp && (
                        <td className={`${NUM} text-sm font-medium text-slate-500`}>
                          {r.mrp !== undefined && r.mrp > 0 ? money(Number(r.mrp)) : <span className="text-slate-300">—</span>}
                        </td>
                      )}

                      {/* ── Line discount: this pack's own MRP → rate cut ── */}
                      {show.lineDiscPct && (
                        <td className={`${NUM} border-l border-slate-100`}>
                          {r.discPct > 0.005
                            ? <span className="text-sm font-semibold text-emerald-700">{pct(r.discPct)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className={`${NUM} text-sm font-medium text-emerald-700 ${show.lineDiscPct ? '' : 'border-l border-slate-100'}`}>
                        {r.mrpDiscountUnit > 0.009
                          ? <span title={r.qty > 1 ? `${money(r.mrpDiscount)} across ${r.qty} units` : undefined}>{money(r.mrpDiscountUnit)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      <td className={`${NUM} border-l border-slate-100`}>
                        <span className="text-base font-semibold text-slate-900">{money(r.price)}</span>
                        {r.retail != null && Number(r.retail) > r.price && (
                          <div className="text-xs font-medium text-slate-400">retail {money(Number(r.retail))}</div>
                        )}
                      </td>

                      {/* ── Order discount: the order-level total apportioned to this
                             line, as a % of its RATE value ── */}
                      {show.orderDiscPct && (
                        <td className={`${NUM} border-l border-slate-100`}>
                          {r.orderDiscPct > 0.005
                            ? <span className="text-sm font-semibold text-emerald-700">{pct(r.orderDiscPct)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className={`${NUM} text-sm font-medium text-emerald-700 ${show.orderDiscPct ? '' : 'border-l border-slate-100'}`}>
                        {r.orderShareUnit > 0.009
                          ? <span title={r.qty > 1 ? `${money(r.orderShare)} across ${r.qty} units` : undefined}>{money(r.orderShareUnit)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {show.netRate && (
                        <td className={`${NUM} border-l border-slate-100 text-sm font-semibold text-slate-800`}>
                          {money(r.netRate)}
                        </td>
                      )}

                      <td className="whitespace-nowrap border-l border-slate-100 px-2 py-3 text-center align-top text-base font-semibold tabular-nums text-slate-900">
                        {r.qty}
                        {/* A partially-cancelled line survives now (migration 168)
                            — before this it was deleted, so the desk could not
                            see what came off without reading the order notes. */}
                        {r.cancelledQty > 0 && (
                          <div
                            className="mt-0.5 text-xs font-semibold text-rose-600"
                            title={r.cancelledReason ? `Reason: ${r.cancelledReason}` : 'Cancelled'}
                          >
                            {r.cancelledQty} cancelled
                          </div>
                        )}
                      </td>

                      {/* SHIPPED / TO SHIP — per line, from the order's own
                          fulfilment record. "To ship" is coloured only when it
                          is non-zero: on a fully-shipped line a green tick reads
                          faster than a zero. */}
                      {show.fulfilment && (() => {
                        const f = fulfilByKey.get(r.sku !== '—' ? r.sku : r.name)
                          ?? fulfilByKey.get(r.item.sku || '')
                          ?? fulfilByKey.get(r.name);
                        const shipped = f?.shipped ?? 0;
                        const remaining = f ? f.remaining : r.qty;
                        return (
                          <>
                            <td className="whitespace-nowrap border-l border-slate-100 px-2 py-3 text-center align-top text-sm font-semibold tabular-nums text-slate-700">
                              {shipped > 0 ? shipped : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-center align-top text-sm font-semibold tabular-nums">
                              {remaining > 0
                                ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{remaining}</span>
                                /* A line cancelled to zero owes nothing — but it
                                   did not SHIP either, and a green tick beside a
                                   cancelled line reads as "delivered". */
                                : r.qty === 0
                                  ? <span className="text-slate-300" title="Cancelled — nothing to ship">—</span>
                                  : <span className="text-emerald-600" title="Fully shipped">✓</span>}
                            </td>
                          </>
                        );
                      })()}


                      {showTax && (
                        <>
                          <td className={`${NUM} border-l border-slate-100 text-sm font-medium text-slate-700`}>
                            {r.taxable != null ? money(r.taxable) : <span className="text-slate-300">—</span>}
                          </td>
                          {isIgst ? (
                            <td className={`${NUM} border-l border-slate-100 text-sm font-medium text-slate-700`}>
                              {r.lineGst != null ? money(r.lineGst) : <span className="text-slate-300">—</span>}
                            </td>
                          ) : (
                            <>
                              <td className={`${NUM} border-l border-slate-100 text-sm font-medium text-slate-700`}>
                                {r.lineGst != null ? money(r.lineGst / 2) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className={`${NUM} text-sm font-medium text-slate-700`}>
                                {r.lineGst != null ? money(r.lineGst / 2) : <span className="text-slate-300">—</span>}
                              </td>
                            </>
                          )}
                        </>
                      )}

                      {/* Total = the line's NET: rate × qty less its order-discount
                          share, which is exactly Taxable + GST beside it. */}
                      <td className={`${NUM} border-l border-slate-100 text-base font-semibold text-slate-900`}>
                        {money(r.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* ── Totals of every column ── */}
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-blue-900">
                  <td className="px-1.5 py-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Totals</td>
                  <td className="px-2 py-3 text-sm font-medium text-slate-500">
                    {rows.length} line{rows.length === 1 ? '' : 's'}
                  </td>
                  {show.brand && <td />}
                  {show.variation && <td />}
                  {show.mrp && (
                    <td className="whitespace-nowrap px-2 py-3 text-right text-sm font-medium tabular-nums text-slate-500">
                      {money(totalMrp)}
                    </td>
                  )}
                  {show.lineDiscPct && (
                    <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700">
                      {totalDiscPct > 0.005 ? pct(totalDiscPct) : '—'}
                    </td>
                  )}
                  <td className={`whitespace-nowrap px-2 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700 ${show.lineDiscPct ? '' : 'border-l border-slate-300'}`}>
                    {totalLineDiscount > 0.009 ? money(totalLineDiscount) : '—'}
                  </td>
                  <td className="border-l border-slate-300 px-2 py-3" />
                  {show.orderDiscPct && (
                    <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700"
                      title="The share this order's total discount worked out to, after it was rounded to the rupee.">
                      {totalOrderDiscPct > 0.005 ? pct(totalOrderDiscPct) : '—'}
                    </td>
                  )}
                  <td className={`whitespace-nowrap px-2 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700 ${show.orderDiscPct ? '' : 'border-l border-slate-300'}`}>
                    {totalOrderShare > 0.009 ? money(totalOrderShare) : '—'}
                  </td>
                  {show.netRate && <td className="border-l border-slate-300 px-2 py-3" />}
                  <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-center text-base font-semibold tabular-nums">{totalQty}</td>
                  {show.fulfilment && (
                    <>
                      <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-center text-sm font-semibold tabular-nums text-slate-700">
                        {totalShipped > 0 ? totalShipped : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-center text-sm font-semibold tabular-nums">
                        {totalToShip > 0
                          ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{totalToShip}</span>
                          : <span className="text-emerald-600">✓</span>}
                      </td>
                    </>
                  )}
                  {showTax && (
                    <>
                      <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-right text-base font-semibold tabular-nums text-slate-700">
                        {anyTax ? money(totalTaxable) : '—'}
                      </td>
                      {isIgst ? (
                        <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-right text-base font-semibold tabular-nums text-slate-700">
                          {anyTax ? money(totalLineGst) : '—'}
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap border-l border-slate-300 px-2 py-3 text-right text-base font-semibold tabular-nums text-slate-700">
                            {anyTax ? money(totalLineGst / 2) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right text-base font-semibold tabular-nums text-slate-700">
                            {anyTax ? money(totalLineGst / 2) : '—'}
                          </td>
                        </>
                      )}
                    </>
                  )}
                  <td className={`whitespace-nowrap border-l border-slate-300 px-1.5 py-3 text-right text-lg font-bold tabular-nums`}>
                    {money(totalNet)}
                  </td>
                </tr>

                {/* ── The order calculation. The wide left area carries the order's
                       own context instead of being a blank band. ── */}
                {hasLadder && (
                  <>
                    <tr className="bg-slate-50">
                      <td colSpan={infoSpan} className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        Order details
                      </td>
                      <td colSpan={visibleCols - infoSpan} className="px-2 pb-1 pt-3" />
                    </tr>

                    {/* Each discount on ONE row: its name and its rupees. These
                        itemise the Order-discount column TOTAL above — they are not
                        a second subtraction, because the Total column already nets
                        them off. When the components were never priced apart
                        (orders placed before `orders.discount_items`, migration
                        155) they share one row rather than an invented split. */}
                    {orderDiscount > 0 && (() => {
                      const parts = discountParts.length ? discountParts : ['Order discount'];
                      const priced = parts.map((part) => discountAmountFor(part));
                      return priced.every((a) => a != null)
                        ? parts.map((part, i) => (
                            <Step key={`d${i}`} tone="credit" label={part} value={priced[i]}
                              note={roundingNote(part, priced[i])} info={nextFact()} />
                          ))
                        : <Step tone="credit" label={parts.join(' · ')} value={orderDiscount}
                            note={parts.length === 1 ? roundingNote(parts[0], orderDiscount) : null}
                            info={nextFact()} />;
                    })()}

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
                                  className="ml-2 text-xs font-semibold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
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
                      <Step n={++step} value={shipping} info={nextFact()}
                        label={
                          <>Shipping
                            {onRemoveShipping && (
                              <button type="button" onClick={onRemoveShipping} disabled={removingCharge === 'shipping'}
                                className="ml-2 text-xs font-semibold text-red-600 hover:underline disabled:no-underline disabled:opacity-50">
                                {removingCharge === 'shipping' ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </>
                        } />
                    )}

                    {hasGst && !inclusive && m.gstTotal > 0 && (
                      <Step n={++step} label="GST added on top" value={m.gstTotal} info={nextFact()} />
                    )}
                    {Math.abs(m.residual) >= 0.01 && (
                      <Step n={++step} label="Round off / other" value={m.residual} info={nextFact()} />
                    )}

                    <Step
                      n={++step} tone="total" label="Order total" value={total ?? totalNet}
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
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            No GST breakdown was recorded for this order — GST was not enabled/configured when it
            was placed, so the Taxable value and GST columns are not shown.
          </div>
        )}

        {rows.length > 0 && totalDiscount > 0.009 && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-2.5 text-sm">
            <span className="font-semibold text-emerald-700">
              Customer saved {money(totalDiscount)}
              {totalMrp > 0 && ` (${pct((totalDiscount / totalMrp) * 100)})`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderItems;
