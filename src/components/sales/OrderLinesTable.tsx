import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import InfoTip from '../common/InfoTip';
import type { ManualOrderPreviewLine } from '../../services/api';

/**
 * THE LINES OF THE ORDER BEING WRITTEN, AS A TABLE.
 *
 * Same language as `components/order/OrderItems.tsx` — one fact per column,
 * dense, sticky header, tabular money, totals in a footer — so the invoice a
 * person is COMPOSING and the invoice they later OPEN read the same way.
 *
 * ── Where every number comes from ──
 * MRP, HSN, GST %, the FEFO lot and the rate are the SERVER's answer, off
 * `POST /orders/manual/preview`, matched to the basket line by index (the
 * preview returns its items in the order it was sent them). Qty and the two
 * override fields are the only things the browser owns, and neither of them is
 * arithmetic: they are sent back and the server re-answers. Nothing on this
 * screen is added up here (docs/CHECKOUT_LOGIC.md §0).
 */

export interface BasketLine {
  productId: string;
  variationId?: string;
  sku?: string;
  name: string;
  /** Catalogue price at the moment it was added — a hint until the preview lands. */
  price: number;
  mrp?: number;
  stock?: number;
  attributes?: Record<string, any>;
  quantity: number;
  /** A price named outright by the operator. Blank = let the price book decide. */
  unitPrice?: string;
  /** A cut off the resolved rate, in %. Ignored when `unitPrice` is filled in. */
  discountPercent?: string;
  /** Which spreadsheet rows produced this line, when it came from a sheet. */
  sheetLines?: number[];
}

const money = (n: number | string | null | undefined) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Exactly, never invented precision (#320): 2.08%, not 2.1%. */
const pct = (n: number) => `${Number((Number(n) || 0).toFixed(2))}%`;

const VARIATION_HIDDEN = new Set(['brand', 'product-form']);
const prettyAttr = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** EVERY attribute, labelled — the mistake #215 fixed on the order page. */
const variationText = (attrs?: Record<string, any> | null): string =>
  Object.entries(attrs ?? {})
    .filter(([k, v]) => !VARIATION_HIDDEN.has(k) && v != null && String(v).trim() !== '')
    .map(([k, v]) => `${prettyAttr(k)} ${v}`)
    .join(' · ');

interface Props {
  lines: BasketLine[];
  /** The server's answer for these lines, in the same order. Null until it lands. */
  priced: ManualOrderPreviewLine[] | null;
  /** True while a fresh preview is in flight — the figures shown are the previous answer. */
  stale?: boolean;
  onChange: (index: number, patch: Partial<BasketLine>) => void;
  onRemove: (index: number) => void;
  /** Rendered only when the order's own GST snapshot has tax on it. */
  showTax?: boolean;
}

const OrderLinesTable: React.FC<Props> = ({ lines, priced, stale, onChange, onRemove, showTax = true }) => {
  if (!lines.length) return null;

  const at = (i: number): ManualOrderPreviewLine | undefined => priced?.[i];
  const anyBatch = (priced ?? []).some((p) => p?.fefo_batch_number);
  const anyHsn = (priced ?? []).some((p) => p?.catalog_hsn);
  const anyRate = (priced ?? []).some((p) => p?.catalog_tax_rate != null);
  const tax = showTax && anyRate;

  const th = 'px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-inverse whitespace-nowrap';
  const td = 'px-2 py-2 align-top text-sm';
  const num = `${td} text-right tabular-nums whitespace-nowrap`;

  return (
    <div className="w-0 min-w-full overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[56rem] border-collapse">
        <thead className="sticky top-0 z-10 bg-ink">
          <tr>
            <th className={`${th} text-left`}>#</th>
            <th className={`${th} text-left`}>SKU</th>
            <th className={`${th} text-left`}>Product</th>
            <th className={`${th} text-left`}>Variation</th>
            {anyHsn && <th className={`${th} text-left`}>HSN</th>}
            {tax && <th className={`${th} text-right`}>GST</th>}
            {anyBatch && <th className={`${th} text-left`}>Batch</th>}
            <th className={`${th} text-right`}>MRP</th>
            <th className={`${th} text-right`}>Rate</th>
            <th className={`${th} text-right`}>Disc %</th>
            <th className={`${th} text-right`}>Set rate</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Amount</th>
            <th className={`${th} w-8`} aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const p = at(i);
            const rate = p ? Number(p.price) : l.price;
            const listed = p?.listed_price ?? l.price;
            const mrp = p?.mrp != null ? Number(p.mrp) : l.mrp;
            const amount = rate * l.quantity;
            const overSold = l.stock != null && l.quantity > l.stock;
            const batchShort = p?.fefo_qty_on_hand != null && p.fefo_qty_on_hand < l.quantity;
            return (
              <tr key={`${l.productId}-${l.variationId ?? 'p'}-${i}`}
                  className="border-t border-line even:bg-surface-2">
                <td className={`${td} text-ink-soft tabular-nums`}>{i + 1}</td>
                <td className={`${td} font-mono text-xs text-ink-soft`}>{l.sku || '—'}</td>
                <td className={`${td} min-w-[14rem] font-medium text-ink`}>
                  {p?.product_name || l.name}
                  {l.sheetLines && l.sheetLines.length > 0 && (
                    <span className="ml-1.5 text-[11px] font-normal text-ink-mute">
                      (sheet row{l.sheetLines.length > 1 ? 's' : ''} {l.sheetLines.join(', ')})
                    </span>
                  )}
                  {overSold && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-warn-ink">
                      <AlertTriangle className="h-3 w-3" /> Only {l.stock} in stock
                    </span>
                  )}
                </td>
                <td className={`${td} text-xs text-ink-soft`}>
                  {variationText(p?.attributes ?? l.attributes) || '—'}
                </td>
                {anyHsn && <td className={`${td} font-mono text-xs text-ink-soft`}>{p?.catalog_hsn || '—'}</td>}
                {tax && (
                  <td className={num}>
                    <span className="text-ink-soft">{p?.catalog_tax_rate != null ? `${p.catalog_tax_rate}%` : '—'}</span>
                  </td>
                )}
                {anyBatch && (
                  <td className={`${td} text-xs`}>
                    {p?.fefo_batch_number ? (
                      <>
                        <span className="font-mono text-ink">{p.fefo_batch_number}</span>
                        {p.fefo_expiry_date && (
                          <span className="block text-[11px] text-ink-soft">exp {p.fefo_expiry_date}</span>
                        )}
                        {batchShort && (
                          <span className="block text-[11px] text-warn-ink">
                            {p.fefo_qty_on_hand} in this lot — the rest ships from the next
                          </span>
                        )}
                      </>
                    ) : <span className="text-ink-mute">—</span>}
                  </td>
                )}
                <td className={num}>
                  {mrp ? <span className="text-ink-soft">{money(mrp)}</span> : <span className="text-ink-mute">—</span>}
                </td>
                <td className={num}>
                  <span className="font-medium text-ink">{money(rate)}</span>
                  {listed > rate && (
                    <span className="block text-[11px] text-ink-mute line-through">{money(listed)}</span>
                  )}
                  {p?.price_source && p.price_source !== 'retail' && (
                    <span className="block text-[11px] text-info-ink">{p.price_source.replace(/_/g, ' ')}</span>
                  )}
                </td>
                <td className={`${td} w-24 text-right`}>
                  <Input type="number" min={0} max={100} step="0.01" placeholder="0"
                    aria-label={`Discount % on line ${i + 1}`}
                    className="h-8 text-right tabular-nums"
                    value={l.discountPercent ?? ''}
                    disabled={!!l.unitPrice}
                    onChange={(e) => onChange(i, { discountPercent: e.target.value, unitPrice: '' })} />
                  {p && (p.effective_discount_pct ?? 0) > 0 && (
                    <span className="mt-0.5 block text-[11px] text-good-ink">{pct(p.effective_discount_pct ?? 0)} off</span>
                  )}
                </td>
                <td className={`${td} w-24 text-right`}>
                  <Input type="number" min={0} step="0.01" placeholder="auto"
                    aria-label={`Set the rate on line ${i + 1}`}
                    className="h-8 text-right tabular-nums"
                    value={l.unitPrice ?? ''}
                    onChange={(e) => onChange(i, { unitPrice: e.target.value, discountPercent: '' })} />
                </td>
                <td className={`${td} w-20 text-right`}>
                  <Input type="number" min={1} step={1}
                    aria-label={`Quantity on line ${i + 1}`}
                    className="h-8 text-right tabular-nums"
                    value={l.quantity}
                    onChange={(e) => onChange(i, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                </td>
                <td className={`${num} font-semibold text-ink`}>{money(amount)}</td>
                <td className={`${td} w-8`}>
                  <Button size="icon" variant="ghost" aria-label={`Remove line ${i + 1}`}
                    className="h-7 w-7 text-bad" onClick={() => onRemove(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong bg-surface-2">
            <td className={`${td} text-xs font-medium text-ink-soft`} colSpan={3}>
              {lines.length} line{lines.length === 1 ? '' : 's'} ·{' '}
              {lines.reduce((s, l) => s + l.quantity, 0)} unit
              {lines.reduce((s, l) => s + l.quantity, 0) === 1 ? '' : 's'}
              {stale && <span className="ml-2 text-warn-ink">re-pricing…</span>}
            </td>
            <td colSpan={(anyHsn ? 1 : 0) + (tax ? 1 : 0) + (anyBatch ? 1 : 0) + 4} />
            <td className={`${td} text-right text-xs font-medium text-ink-soft`}>
              Items value
              <InfoTip className="ml-1" text="Rate × quantity, added up by the server. Order-level discount, delivery, COD and GST are applied after this, in the summary." />
            </td>
            <td className={`${num} text-base font-bold text-ink`}>
              {money((priced ?? []).reduce((s, p, i) => s + Number(p.price) * (lines[i]?.quantity ?? 0), 0)
                || lines.reduce((s, l) => s + l.price * l.quantity, 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default OrderLinesTable;
