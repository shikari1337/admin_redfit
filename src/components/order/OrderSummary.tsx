import React from 'react';

interface GstRateGroup {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/** A non-product charge (shipping, COD handling) taxed at its own platform rate. */
interface GstCharge {
  label: string;
  amount: number;
  taxableAmount: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface GstInfo {
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

interface OrderSummaryProps {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  gst?: GstInfo;
  /** Shown as a "Remove" action next to the row, only while the order is still
   *  editable (same gate as "Edit items" — caller decides whether to pass these). */
  onRemoveShipping?: () => void;
  onRemoveCod?: () => void;
  removingCharge?: 'shipping' | 'cod' | null;
}

const money = (n: number | undefined) =>
  (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Courier invoices are GST-inclusive at 18% — the amount embedded in the
// shipping charge is Input Tax Credit the store can claim against its own
// output GST liability. Purely informational.
const SHIPPING_GST_RATE = 18;
const shippingItcClaimable = (shipping: number) => shipping - shipping / (1 + SHIPPING_GST_RATE / 100);

/**
 * Order money summary, laid out as an arithmetic proof:
 *
 *   Subtotal − Discount + Shipping + COD fee = Total
 *
 * followed by a clearly separated "GST included in the above" breakdown —
 * with inclusive pricing the tax is INSIDE those amounts, so mixing taxable
 * values into the addition column only creates confusion (and previously the
 * COD fee row was missing entirely, so the column visibly didn't sum).
 */
const OrderSummary: React.FC<OrderSummaryProps> = ({
  subtotal,
  shipping,
  discount,
  total,
  gst,
  onRemoveShipping,
  onRemoveCod,
  removingCharge,
}) => {
  const groups = gst?.breakdown?.length
    ? gst.breakdown
    : (gst?.taxType ? [{ rate: gst.gstRate ?? 0, taxableAmount: subtotal, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst }] : []);

  const taxOf = (g: { cgst: number; sgst: number; igst: number }) => (g.cgst ?? 0) + (g.sgst ?? 0) + (g.igst ?? 0);

  /**
   * Assessable value of a product group. Orders written before `taxableTotal`
   * existed stored the GROSS subtotal here under inclusive pricing → net it out.
   */
  const groupTaxable = (g: GstRateGroup) =>
    gst?.taxableTotal == null && gst?.productsIncludeGst
      ? (g.taxableAmount ?? 0) - taxOf(g)
      : (g.taxableAmount ?? 0);

  const charges = gst?.charges ?? [];
  // The COD handling fee has no column of its own on orders — its GROSS amount
  // rides in gst.charges. Without this row the components don't sum to Total.
  const codCharge = charges.find((c) => /cod/i.test(c.label ?? ''));
  const codFee = Number(codCharge?.amount ?? 0);

  const productsTaxable = groups.reduce((s, g) => s + groupTaxable(g), 0);
  const totalTaxable = gst?.taxableTotal
    ?? (productsTaxable + charges.reduce((s, c) => s + (c.taxableAmount ?? 0), 0));

  // Residual between the stated Total and the visible components — shows as
  // "Round off / other" only when it is actually non-zero (old orders, or an
  // exclusive-pricing order where tax was added on top).
  const inclusive = gst?.productsIncludeGst !== false;
  const gstTotal = (gst?.cgst ?? 0) + (gst?.sgst ?? 0) + (gst?.igst ?? 0);
  const composed = subtotal - discount + shipping + codFee + (gst?.taxType && !inclusive ? gstTotal : 0);
  const residual = Math.round((total - composed) * 100) / 100;

  return (
    <div className="space-y-4">
      {/* ── The addition column: what the customer paid ── */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Subtotal{gst?.taxType && inclusive ? ' (incl. GST)' : ''}</span>
          <span>₹{money(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-₹{money(discount)}</span>
          </div>
        )}
        {shipping > 0 && (
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              Shipping
              {onRemoveShipping && (
                <button type="button" onClick={onRemoveShipping} disabled={removingCharge === 'shipping'}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:no-underline">
                  {removingCharge === 'shipping' ? 'Removing…' : 'Remove'}
                </button>
              )}
            </span>
            <span>₹{money(shipping)}</span>
          </div>
        )}
        {codFee > 0 && (
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              COD handling fee
              {onRemoveCod && (
                <button type="button" onClick={onRemoveCod} disabled={removingCharge === 'cod'}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:no-underline">
                  {removingCharge === 'cod' ? 'Removing…' : 'Remove'}
                </button>
              )}
            </span>
            <span>₹{money(codFee)}</span>
          </div>
        )}
        {gst?.taxType && !inclusive && gstTotal > 0 && (
          <div className="flex justify-between">
            <span>GST (added)</span>
            <span>₹{money(gstTotal)}</span>
          </div>
        )}
        {Math.abs(residual) >= 0.01 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Round off / other</span>
            <span>₹{money(residual)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 border-t">
          <span>Total</span>
          <span>₹{money(total)}</span>
        </div>
      </div>

      {/* ── GST breakdown — the tax already inside the amounts above ── */}
      {gst?.taxType && groups.length > 0 && (
        <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            GST breakdown{inclusive ? ' (included in the prices above)' : ''}
          </p>
          <div className="flex justify-between text-gray-600">
            <span>Taxable value — products{discount > 0 ? ' (after discount)' : ''}</span>
            <span>₹{money(productsTaxable)}</span>
          </div>
          {charges.map((c, i) => (
            <div key={i} className="flex justify-between text-gray-600">
              <span>Taxable value — {c.label.toLowerCase()} ({c.rate}%)</span>
              <span>₹{money(c.taxableAmount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-medium text-gray-800 pt-1 border-t border-gray-200">
            <span>Total taxable value</span>
            <span>₹{money(totalTaxable)}</span>
          </div>
          {groups.length > 1 && groups.map((g, i) => (
            <div key={`g${i}`} className="flex justify-between text-xs text-gray-500">
              <span>Products @ {g.rate}%</span>
              <span>₹{money(groupTaxable(g))}</span>
            </div>
          ))}
          {gst.taxType === 'CGST+SGST' ? (
            <>
              <div className="flex justify-between text-gray-700">
                <span>CGST</span>
                <span>₹{money(gst.cgst)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>SGST</span>
                <span>₹{money(gst.sgst)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-gray-700">
              <span>IGST</span>
              <span>₹{money(gst.igst)}</span>
            </div>
          )}
          <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-200 space-y-0.5">
            <div>{gst.taxType} · {gst.storeState ?? '?'} → {gst.orderState ?? '?'}{gst.storeGstin ? ` · GSTIN ${gst.storeGstin}` : ''}</div>
            {gst.reconstructed && <div>Breakdown reconstructed from GST-inclusive prices — totals unchanged.</div>}
          </div>
        </div>
      )}

      {/* Orders written while GST was disabled carry no tax data at all. */}
      {!gst?.taxType && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
          No GST breakdown was recorded for this order — GST was not enabled/configured
          when it was placed.
        </div>
      )}

      {shipping > 0 && (
        <div className="flex justify-between text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">
          <span>Shipping GST ({SHIPPING_GST_RATE}%) — claimable as Input Tax Credit</span>
          <span className="font-medium">₹{money(shippingItcClaimable(shipping))}</span>
        </div>
      )}
    </div>
  );
};

export default OrderSummary;
