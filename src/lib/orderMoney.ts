/**
 * Presentation-side derivation of an order's money ladder.
 *
 * This does **no** money math of its own — `computeOrderTotals` (backend
 * `utils/orderTotals.ts`) is the only totals brain, and every figure below is
 * either read straight off the stored order or is a *display* decomposition of
 * values the order already carries. It exists so the ladder has exactly ONE
 * implementation now that it is rendered inside the order-items table rather
 * than in its own card (it was previously inlined in `OrderSummary.tsx`).
 *
 * The rules it encodes, all pre-existing:
 *  - The **COD handling fee has no column of its own** on `orders`. Its gross
 *    amount only ever lived inside the order's own `gst.charges[]` entry, so it
 *    has to be read back out of there or the components don't sum to Total.
 *  - Under GST-**inclusive** pricing the tax is already inside subtotal, so it
 *    is never added into the addition column — only broken out underneath.
 *  - Orders written before `taxableTotal` existed stored the GROSS subtotal as
 *    a group's taxable amount; net it out rather than over-reporting it.
 *  - Anything left between the stated Total and the visible components is shown
 *    as an explicit "round off / other" line instead of silently not adding up.
 */

export interface GstRateGroup {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/** A non-product charge (shipping, COD handling) taxed at its own platform rate. */
export interface GstCharge {
  label: string;
  amount: number;
  taxableAmount: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface GstInfo {
  /** Breakdown was back-filled from GST-inclusive prices after placement. */
  reconstructed?: boolean;
  /** @deprecated blended rate from the old order-level calc; new orders use `breakdown`. */
  gstRate?: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxType: 'CGST+SGST' | 'IGST';
  storeName?: string;
  storeGstin?: string;
  storeState?: string;
  orderState?: string;
  /** Prices already contain GST → the tax was extracted, not added. */
  productsIncludeGst?: boolean;
  /** Assessable value of every component, products + charges. */
  taxableTotal?: number;
  charges?: GstCharge[];
  /** Per-product-rate groups — an order can owe GST at several rates at once. */
  breakdown?: GstRateGroup[];
}

export interface OrderMoneyInput {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  gst?: GstInfo | null;
  amountReceived?: number;
}

/** Courier invoices are GST-inclusive at 18% — that embedded tax is claimable ITC. */
export const SHIPPING_GST_RATE = 18;

export function deriveOrderMoney(input: OrderMoneyInput) {
  const { subtotal, shipping, discount, total, gst, amountReceived } = input;

  const groups: GstRateGroup[] = gst?.breakdown?.length
    ? gst.breakdown
    : (gst?.taxType
        ? [{ rate: gst.gstRate ?? 0, taxableAmount: subtotal, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst }]
        : []);

  const taxOf = (g: { cgst: number; sgst: number; igst: number }) =>
    (g.cgst ?? 0) + (g.sgst ?? 0) + (g.igst ?? 0);

  const groupTaxable = (g: GstRateGroup) =>
    gst?.taxableTotal == null && gst?.productsIncludeGst
      ? (g.taxableAmount ?? 0) - taxOf(g)
      : (g.taxableAmount ?? 0);

  const charges = gst?.charges ?? [];
  const codCharge = charges.find((c) => /cod/i.test(c.label ?? ''));
  const codFee = Number(codCharge?.amount ?? 0);

  const productsTaxable = groups.reduce((s, g) => s + groupTaxable(g), 0);
  const totalTaxable =
    gst?.taxableTotal ?? (productsTaxable + charges.reduce((s, c) => s + (c.taxableAmount ?? 0), 0));

  const inclusive = gst?.productsIncludeGst !== false;
  const gstTotal = (gst?.cgst ?? 0) + (gst?.sgst ?? 0) + (gst?.igst ?? 0);
  const composed = subtotal - discount + shipping + codFee + (gst?.taxType && !inclusive ? gstTotal : 0);
  const residual = Math.round((total - composed) * 100) / 100;

  const received = Number(amountReceived ?? 0);
  const shippingItc = shipping > 0 ? shipping - shipping / (1 + SHIPPING_GST_RATE / 100) : 0;

  return {
    groups, groupTaxable, charges, codFee,
    productsTaxable, totalTaxable,
    inclusive, gstTotal, residual,
    received, balanceDue: received > 0 ? Math.max(0, total - received) : 0,
    shippingItc,
  };
}
