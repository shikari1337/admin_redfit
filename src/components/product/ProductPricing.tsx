import React from 'react';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, ChevronRight, Layers } from "lucide-react";
import { FieldGroup, Field } from './FormField';

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
  errors,
}) => {
  const [showSale, setShowSale] = React.useState(!!salePrice);
  // Variable products: product-level prices are only a fallback — collapsed by default.
  const [showFallbackPrices, setShowFallbackPrices] = React.useState(false);

  // The MRP / selling / sale inputs — identical markup whether rendered directly
  // (simple product) or inside the collapsed fallback section (variable product).
  const priceFields = (
    <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="MRP (₹)" htmlFor="originalPrice" required error={errors.originalPrice}
            help="Printed pack price — shown struck-through next to your price.">
            <Input id="originalPrice" type="number" step="0.01" required value={originalPrice}
              onChange={e => onOriginalPriceChange(e.target.value)}
              className={`h-9 text-sm ${errors.originalPrice ? 'border-red-400' : ''}`} placeholder="0.00" />
          </Field>
          <Field label="Selling price (₹)" htmlFor="price" required error={errors.price}
            help="What the customer actually pays.">
            <Input id="price" type="number" step="0.01" required value={price}
              onChange={e => onPriceChange(e.target.value)}
              className={`h-9 text-sm ${errors.price ? 'border-red-400' : ''}`} placeholder="0.00" />
            {price && originalPrice && parseFloat(price) < parseFloat(originalPrice) && (
              <p className="text-xs text-green-600 font-medium mt-1">
                {Math.round((1 - parseFloat(price) / parseFloat(originalPrice)) * 100)}% off
              </p>
            )}
          </Field>
        </div>

        {/* Sale Price */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="pfSaleToggle" className="min-w-0 cursor-pointer select-none">
              <span className="block text-[13px] font-medium text-gray-700">Run a sale</span>
              <span className="block text-xs text-gray-400 mt-0.5">Temporary offer price; needs a start time.</span>
            </label>
            <Switch id="pfSaleToggle" aria-label="Run a sale" checked={showSale}
              className="shrink-0 data-[state=checked]:bg-red-600"
              onCheckedChange={v => { setShowSale(v); if (!v && onSalePriceChange) { onSalePriceChange(''); if (onSaleStartsAtChange) onSaleStartsAtChange(''); if (onSaleEndsAtChange) onSaleEndsAtChange(''); } }} />
          </div>
          {showSale && (
            <div className="mt-3 space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <Field label="Sale price (₹)" htmlFor="pfSalePrice" error={errors.salePrice}
                help="Must be lower than the selling price.">
                <Input id="pfSalePrice" type="number" step="0.01" value={salePrice}
                  onChange={e => onSalePriceChange && onSalePriceChange(e.target.value)}
                  className="h-9 text-sm bg-white" placeholder="Discounted price" />
              </Field>
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

      {/* ── Codes & tax ────────────────────────────────────────────────────── */}
      <FieldGroup title="Product codes & tax" description="Internal and tax identifiers for this product.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SKU" htmlFor="sku" error={errors.sku}
            help="Your internal code for this product.">
            <Input id="sku" type="text" value={sku || ''}
              onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48); onSkuChange(v); }}
              className={`h-9 text-sm font-mono ${errors.sku ? 'border-red-400' : ''}`}
              placeholder="AUTO-GENERATED" />
            {/* P-… is the auto-generated placeholder series — merchants kept
                reading the muted styling as "not editable" and shipping with it. */}
            {sku?.startsWith('P-') && (
              <p className="text-xs text-amber-600 mt-1">Auto-generated placeholder — type your real SKU (this is the sellable SKU for simple products).</p>
            )}
          </Field>
          {showTaxFields && (
            <Field label="HSN Code" htmlFor="hsnCode" error={errors.hsnCode}
              help="4–8 digit GST classification code.">
              <Input id="hsnCode" type="text" value={hsnCode}
                onChange={e => onHsnCodeChange && onHsnCodeChange(e.target.value)}
                className={`h-9 text-sm ${errors.hsnCode ? 'border-red-400' : ''}`} placeholder="e.g. 3004" />
            </Field>
          )}
        </div>

        {/* Tax Rule — gst_tax-gated like HSN */}
        {showTaxFields && (
          <div className="mt-4">
            <Field label="Tax / GST rule" help="Which GST rate applies to this product at checkout.">
              <Select value={taxRuleId || 'none'} onValueChange={val => onTaxRuleIdChange && onTaxRuleIdChange(val === 'none' ? '' : val)}>
                <SelectTrigger className="h-9 text-sm" aria-label="Tax / GST rule"><SelectValue placeholder="Default / None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default / None</SelectItem>
                  {taxRules.map(rule => {
                    const key = rule._id || rule.id || rule.name;
                    return <SelectItem key={key} value={key}>{rule.name}{rule.rate !== undefined ? ` — ${rule.rate}%` : ''}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </FieldGroup>

      {/* ── Stock ──────────────────────────────────────────────────────────── */}
      {showStock && (
        <FieldGroup title="Stock" description="How many units you have ready to sell.">
          <Field label="Stock quantity" htmlFor="stock"
            help="For variation products, manage stock per variation instead. Changing stock here books a ledgered adjustment (visible in movement history) — unchanged values are never re-sent.">
            <Input id="stock" type="number" min="0" step="1" value={stock ?? ''}
              onChange={e => { const v = e.target.value; onStockChange(v === '' ? undefined : Math.max(0, parseInt(v) || 0)); }}
              className="h-9 text-sm w-36" placeholder="0" />
          </Field>
        </FieldGroup>
      )}

      {/* ── Dimensions ─────────────────────────────────────────────────────── */}
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

    </div>
  );
};

export default ProductPricing;
