import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface OrderItem {
  // The `items` array arrives as an opaque JSONB blob (the API interceptor
  // skips camelCase-aliasing it, by design, to protect other JSONB payloads
  // elsewhere) — so real order_items rows only ever carry their snake_case
  // column names. Read those directly rather than relying on aliasing.
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

const OrderItems: React.FC<OrderItemsProps> = ({ items, b2bTier, orderDiscount = 0 }) => {
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
    const discPct = baseValue > 0 ? (discAmt / baseValue) * 100 : 0;
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
      retail: item.retailPrice ?? item.retail_price,
      source: item.priceSource ?? item.price_source,
      bundle: item.bundle_applied || item.bundleApplied,
    };
  });

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.lineTotal, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.discAmt, 0);

  const sourceLabel = (source?: string | null): string | null => {
    if (!source || source === 'retail') return null;
    if (source === 'manual') return 'Manual price';
    if (source === 'manual_discount') return 'Manual discount';
    // B2B rule names — the tier itself is its own badge alongside.
    return `via ${source.replace(/_/g, ' ')}`;
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-xl">Order Items</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">No items in this order.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[240px]">Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Variation</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const b2bPriced = r.retail != null && Number(r.retail) > r.price;
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {r.item.image ? (
                            <img
                              src={r.item.image}
                              alt={r.name}
                              className="w-12 h-12 rounded-md object-cover border bg-muted flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                              No img
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground leading-snug line-clamp-2">{r.name}</p>
                            {r.item.variant?.colorName && (
                              <p className="text-xs text-muted-foreground">Color: {r.item.variant.colorName}</p>
                            )}
                            {r.bundle && (
                              <Badge variant="secondary" className="mt-1 text-blue-700 bg-blue-100/50 border-blue-200 text-[10px]">
                                Bundle: {r.bundle.title}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{r.sku}</TableCell>
                      <TableCell className="text-sm">{r.variant || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <span className="font-medium">{money(r.price)}</span>
                        {r.mrp !== undefined && r.mrp > r.price && (
                          <div className="text-xs text-muted-foreground line-through">{money(Number(r.mrp))}</div>
                        )}
                        {b2bPriced && (
                          <div className="text-[11px] text-blue-700 font-medium">
                            retail {money(Number(r.retail))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {r.discAmt > 0.009 ? (
                          <>
                            <span className="font-medium text-green-700">{money(r.discAmt)}</span>
                            <div className="text-xs text-green-700">({r.discPct.toFixed(1)}% off{r.mrp !== undefined && r.mrp > r.price ? ' MRP' : ''})</div>
                            {r.orderShare > 0.009 && r.mrpDiscount > 0.009 && (
                              <div className="text-[10px] text-muted-foreground">
                                {money(r.mrpDiscount)} price + {money(r.orderShare)} order disc.
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <div className="flex flex-col items-end gap-0.5 mt-1">
                          {b2bTier && (
                            <Badge variant="outline" className="text-[10px] border-purple-200 bg-purple-50 text-purple-700">
                              B2B · {b2bTier} tier
                            </Badge>
                          )}
                          {sourceLabel(r.source) && (
                            <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700">
                              {sourceLabel(r.source)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium">{r.qty}</TableCell>
                      <TableCell className="text-right font-bold whitespace-nowrap">{money(r.lineTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {rows.length} line(s)
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold text-green-700">
                    {totalDiscount > 0.009 ? money(totalDiscount) : '—'}
                  </TableCell>
                  <TableCell className="text-center font-bold">{totalQty}</TableCell>
                  <TableCell className="text-right font-bold">{money(totalValue)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderItems;
