import React from 'react';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, ChevronRight, Layers } from "lucide-react";
import { FieldGroup, Field } from './FormField';
import { resolveTaxRate, describeTaxRate } from './taxRate';

/** Which parts of the component to render. The product form shows each in its
 *  own tab (Pricing · Tax · Stock) from this ONE component. */
export type PricingSection = 'price' | 'codes' | 'tax' | 'stock' | 'size';
const ALL_SECTIONS: PricingSection[] = ['price', 'codes', 'tax', 'stock', 'size'];

/** % below MRP, one decimal when it matters — display only; resolvePrice stays the brain. */
const pctOff = (value: number | null | undefined, mrp: number): string | null => {
  if (value == null || !Number.isFinite(value) || !(mrp > 0) || !(value > 0) || value >= mrp) return null;
  const p = (1 - value / mrp) * 100;
  return `${Number.isInteger(Math.round(p * 10) / 10) ? Math.round(p) : (Math.round(p * 10) / 10)}% off MRP`;
};

const toLocalInputValue = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86400000);

interface ProductPricingProps {
  price: string;
  originalPrice: string;
  salePrice?: string;
  saleStartsAt?: string;
  saleEndsAt?: string;
  sku: string;
  hsnCode?: string;
  taxRuleId?: string;
  taxRules?: Array<{ _id: string; id?: string; name: string; rate?: number }>;
  /** gst_tax module gate — when false the HSN + Tax Rule controls are hidden
   *  (the backend silently strips those fields when the module is off, so
   *  showing them would be a form that lies about saving). Default true. */
  showTaxFields?: boolean;
  stock: number | undefined;
  showStock: boolean;
  weight: string;
  length: string;
  breadth: string;
  height: string;
  onPriceChange: (price: string) => void;
  onOriginalPriceChange: (price: string) => void;
  onSalePriceChange?: (price: string) => void;
  onSaleStartsAtChange?: (date: string) => void;
  onSaleEndsAtChange?: (date: string) => void;
  onSkuChange: (sku: string) => void;
  onHsnCodeChange?: (hsnCode: string) => void;
  onTaxRuleIdChange?: (taxRuleId: string) => void;
  onStockChange: (stock: number | undefined) => void;
  onWeightChange: (weight: string) => void;
  onLengthChange: (length: string) => void;
  onBreadthChange: (breadth: string) => void;
  onHeightChange: (height: string) => void;
  /** Variable products price per-VARIANT — when true the MRP/selling/sale
   *  inputs collapse into a "default / fallback" section and an info panel
   *  points at the Variants tab instead. Presentation only. */
  isVariableProduct?: boolean;
  /** min/max across variations that have a price set + total variant count. */
  variationPriceSummary?: { min: number; max: number; count: number } | null;
  /** Jump to the Variants tab (where per-variant prices live). */
  onGoToVariants?: () => void;
  /** Parts to render (default all). */
  sections?: PricingSection[];
  /** The simple product's flat wholesale price (from the B2B tab), shown beside the retail prices. */
  b2bPrice?: number | null;
  /** Show the B2B cell at all (the b2b module). */
  showB2B?: boolean;
  onGoToB2B?: () => void;
  errors: {
    price?: string;
    originalPrice?: string;
    salePrice?: string;
    saleStartsAt?: string;
    saleEndsAt?: string;
    sku?: string;
    hsnCode?: string;
    weight?: string;
    length?: string;
    breadth?: string;
    height?: string;
  };
}

const ProductPricing: React.FC<ProductPricingProps> = ({
  price, originalPrice, salePrice = '', saleStartsAt = '', saleEndsAt = '',
  sku, hsnCode = '', taxRuleId = '', taxRules = [], showTaxFields = true,
  stock, showStock, weight, length, breadth, height,
  onPriceChange, onOriginalPriceChange, onSalePriceChange, onSaleStartsAtChange, onSaleEndsAtChange,
  onSkuChange, onHsnCodeChange, onTaxRuleIdChange, onStockChange,
  onWeightChange, onLengthChange, onBreadthChange, onHeightChange,
  isVariableProduct = false, variationPriceSummary = null, onGoToVariants,
  sections = ALL_SECTIONS, b2bPrice = null, showB2B = false, onGoToB2B,
  errors,
}) => {
  const has = (x: PricingSection) => sections.includes(x);
  const mrpNum = parseFloat(originalPrice) || 0;
  const tax = resolveTaxRate(taxRules, taxRuleId || null, null);
  const [showSale, setShowSale] = React.useState(!!salePrice);
  // Variable products: product-level prices are only a fallback — collapsed by default.
  const [showFallbackPrices, setShowFallbackPrices] = React.useState(false);

  // The MRP / selling / sale inputs — identical markup whether rendered directly
  // (simple product) or inside the collapsed fallback section (variable product).
  const priceFields = (
    <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field label="MRP (₹)" htmlFor="originalPrice" required error={errors.originalPrice}
            help="The price printed on the pack; shown struck through.">
            <Input id="originalPrice" type="number" step="0.01" required value={originalPrice}
              onChange={e => onOriginalPriceChange(e.target.value)}
              className={`h-9 text-sm tabular-nums ${errors.originalPrice ? 'border-red-400' : ''}`} placeholder="0.00" />
          </Field>
          <Field label="Selling (₹)" htmlFor="price" required error={errors.price}
            help="What a retail customer pays."
            note={pctOff(parseFloat(price), mrpNum)}>
            <Input id="price" type="number" step="0.01" required value={price}
              onChange={e => onPriceChange(e.target.value)}
              className={`h-9 text-sm tabular-nums ${errors.price ? 'border-red-400' : ''}`} placeholder="0.00" />
          </Field>
          <Field label="Sale (₹)" htmlFor="pfSalePrice" error={errors.salePrice}
            help="A temporary lower price. Turn on “Run a sale” below to set its dates."
            note={showSale ? pctOff(parseFloat(salePrice), mrpNum) : null}>
            <Input id="pfSalePrice" type="number" step="0.01" value={salePrice} disabled={!showSale}
              onChange={e => onSalePriceChange && onSalePriceChange(e.target.value)}
              className="h-9 text-sm tabular-nums" placeholder={showSale ? '0.00' : 'No sale'} />
          </Field>
          {showB2B && (
            <Field label="B2B (₹)" help="The flat wholesale price. Set on the B2B tab; tiers and contracts can override it."
              note={pctOff(b2bPrice, mrpNum)}>
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm tabular-nums">
                <span className={b2bPrice == null ? 'text-gray-400' : 'text-gray-900'}>{b2bPrice == null ? 'Not set' : b2bPrice.toFixed(2)}</span>
                {onGoToB2B && (
                  <button type="button" onClick={onGoToB2B} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>
                )}
              </div>
            </Field>
          )}
        </div>

        {/* Sale Price */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="pfSaleToggle" className="min-w-0 cursor-pointer select-none">
              <span className="block text-[13px] font-medium text-gray-700">Run a sale</span>
              <span className="block text-xs text-gray-400 mt-0.5">Opens the Sale price and its dates.</span>
            </label>
            <Switch id="pfSaleToggle" aria-label="Run a sale" checked={showSale}
              className="shrink-0 data-[state=checked]:bg-brand-600"
              onCheckedChange={v => { setShowSale(v); if (!v && onSalePriceChange) { onSalePriceChange(''); if (onSaleStartsAtChange) onSaleStartsAtChange(''); if (onSaleEndsAtChange) onSaleEndsAtChange(''); } }} />
          </div>
          {showSale && (
            <div className="mt-3 space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Sale starts" htmlFor="pfSaleStartsAt" required error={errors.saleStartsAt}>
                  <div className="relative">
                    <CalendarClock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-orange-400 pointer-events-none" />
                    <Input id="pfSaleStartsAt" type="datetime-local" value={saleStartsAt}
                      onChange={e => onSaleStartsAtChange && onSaleStartsAtChange(e.target.value)}
                      className={`h-9 text-xs pl-7 bg-white ${errors.saleStartsAt ? 'border-red-400' : ''}`} required />
                  </div>
                  <button type="button"
                    onClick={() => onSaleStartsAtChange && onSaleStartsAtChange(toLocalInputValue(new Date()))}
                    className="mt-1 text-xs text-orange-700 hover:text-orange-900 underline underline-offset-2">
                    Start now
                  </button>
                </Field>
                <Field label="Sale ends" htmlFor="pfSaleEndsAt" error={errors.saleEndsAt}>
                  <div className="relative">
                    <CalendarClock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-orange-400 pointer-events-none" />
                    <Input id="pfSaleEndsAt" type="datetime-local" value={saleEndsAt}
                      onChange={e => onSaleEndsAtChange && onSaleEndsAtChange(e.target.value)}
                      min={saleStartsAt || undefined}
                      className={`h-9 text-xs pl-7 bg-white ${errors.saleEndsAt ? 'border-red-400' : ''}`} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {[1, 7, 30].map(days => (
                      <button key={days} type="button"
                        onClick={() => onSaleEndsAtChange && onSaleEndsAtChange(
                          toLocalInputValue(addDays(saleStartsAt ? new Date(saleStartsAt) : new Date(), days))
                        )}
                        className="text-xs text-orange-700 hover:text-orange-900 underline underline-offset-2">
                        +{days}d
                      </button>
                    ))}
                    {saleEndsAt && (
                      <button type="button" onClick={() => onSaleEndsAtChange && onSaleEndsAtChange('')}
                        className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2">
                        Clear
                      </button>
                    )}
                  </div>
                </Field>
              </div>
              <p className="text-xs text-orange-700">A start date &amp; time is required for a sale price. Leave the end empty for an open-ended sale.</p>
            </div>
          )}
        </div>
    </>
  );

  return (
    <div className="space-y-5">

      {/* ── Prices ─────────────────────────────────────────────────────────── */}
      {has('price') && (
      <FieldGroup title="Prices" description="What is printed on the pack and what the customer pays.">
        {isVariableProduct ? (
          <>
            {/* Each variant prices itself — the inputs below are only a fallback. */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2.5">
                <Layers className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    {variationPriceSummary && variationPriceSummary.count > 0
                      ? `This product has ${variationPriceSummary.count} variant${variationPriceSummary.count === 1 ? '' : 's'} — each variant sets its own price.`
                      : 'This is a variable product — each variant sets its own price.'}
                  </p>
                  {variationPriceSummary && variationPriceSummary.max > 0 && (
                    <p className="text-xs text-blue-700 mt-1">
                      Current price range:{' '}
                      <span className="font-semibold">
                        {variationPriceSummary.min === variationPriceSummary.max
                          ? `₹${variationPriceSummary.min}`
                          : `₹${variationPriceSummary.min} – ₹${variationPriceSummary.max}`}
                      </span>
                    </p>
                  )}
                  {onGoToVariants && (
                    <button type="button" onClick={onGoToVariants}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded-md hover:bg-blue-100 transition-colors">
                      Edit prices per variant
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Collapsed fallback — same inputs, unchanged, hidden by default. */}
            <div className="mt-4">
              <button type="button" onClick={() => setShowFallbackPrices(open => !open)}
                aria-expanded={showFallbackPrices}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showFallbackPrices ? 'rotate-90' : ''}`} aria-hidden="true" />
                Default / fallback price (used only when a variant doesn't set its own)
              </button>
              {showFallbackPrices && <div className="mt-3">{priceFields}</div>}
            </div>
          </>
        ) : priceFields}
      </FieldGroup>
      )}

      {/* ── Codes ─────────────────────────────────────────────────────────── */}
      {has('codes') && (
      <FieldGroup title="Codes" description="Your own identifier for this product.">
        <Field label="SKU" htmlFor="sku" error={errors.sku}
          help="Your internal code. For a simple product this is the code that is sold.">
          <Input id="sku" type="text" value={sku || ''}
            onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48); onSkuChange(v); }}
            className={`h-9 text-sm font-mono md:w-80 ${errors.sku ? 'border-red-400' : ''}`}
            placeholder="AUTO-GENERATED" />
          {sku?.startsWith('P-') && (
            <p className="text-xs text-amber-600 mt-1">Placeholder code — type your real SKU.</p>
          )}
        </Field>
      </FieldGroup>
      )}

      {/* ── Tax (gst_tax module) ─────────────────────────────────────────── */}
      {has('tax') && showTaxFields && (
      <FieldGroup title="GST" description="The code and rule that decide the tax on every invoice.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="HSN code" htmlFor="hsnCode" error={errors.hsnCode}
            help={isVariableProduct ? '4–8 digits. A variation with its own HSN overrides this.' : '4–8 digit GST classification code.'}>
            <Input id="hsnCode" type="text" value={hsnCode}
              onChange={e => onHsnCodeChange && onHsnCodeChange(e.target.value)}
              className={`h-9 text-sm font-mono ${errors.hsnCode ? 'border-red-400' : ''}`} placeholder="e.g. 3004" />
          </Field>
          <Field label="Tax rule" help={isVariableProduct ? 'Applies to every variation that does not set its own.' : 'Which GST rate applies at checkout.'}
            note={describeTaxRate(tax)}>
            <Select value={taxRuleId || 'none'} onValueChange={val => onTaxRuleIdChange && onTaxRuleIdChange(val === 'none' ? '' : val)}>
              <SelectTrigger className="h-9 text-sm" aria-label="Tax rule"><SelectValue placeholder="Store default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Store default</SelectItem>
                {taxRules.map(rule => {
                  const key = rule._id || rule.id || rule.name;
                  return <SelectItem key={key} value={key}>{rule.name}{rule.rate !== undefined ? ` — ${rule.rate}%` : ''}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      )}

      {/* ── Stock ──────────────────────────────────────────────────────────── */}
      {has('stock') && showStock && (
        <FieldGroup title="Stock" description="How many units you have ready to sell.">
          <Field label="Stock quantity" htmlFor="stock"
            help="A change here is recorded in the stock ledger as an adjustment. For batch-tracked stock use Inventory ▸ Batches.">
            <Input id="stock" type="number" min="0" step="1" value={stock ?? ''}
              onChange={e => { const v = e.target.value; onStockChange(v === '' ? undefined : Math.max(0, parseInt(v) || 0)); }}
              className="h-9 text-sm w-36" placeholder="0" />
          </Field>
        </FieldGroup>
      )}

      {/* ── Dimensions ─────────────────────────────────────────────────────── */}
      {has('size') && (
      <FieldGroup title="Shipping size & weight" description="Packed size and weight — used to calculate shipping charges.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { id: 'weight', label: 'Weight (kg)', val: weight, onChange: onWeightChange, err: errors.weight },
            { id: 'length', label: 'Length (cm)', val: length, onChange: onLengthChange, err: errors.length },
            { id: 'breadth', label: 'Breadth (cm)', val: breadth, onChange: onBreadthChange, err: errors.breadth },
            { id: 'height', label: 'Height (cm)', val: height, onChange: onHeightChange, err: errors.height },
          ].map(({ id, label, val, onChange, err }) => (
            <Field key={id} label={label} htmlFor={id} required error={err}>
              <Input id={id} type="number" step="0.01" min="0.01" required value={val}
                onChange={e => onChange(e.target.value)}
                className={`h-9 text-sm ${err ? 'border-red-400' : ''}`} placeholder="—" />
            </Field>
          ))}
        </div>
      </FieldGroup>
      )}

    </div>
  );
};

export default ProductPricing;
