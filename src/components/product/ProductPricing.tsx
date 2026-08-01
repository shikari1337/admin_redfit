import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock } from "lucide-react";

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

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
  </label>
);

const ProductPricing: React.FC<ProductPricingProps> = ({
  price, originalPrice, salePrice = '', saleStartsAt = '', saleEndsAt = '',
  sku, hsnCode = '', taxRuleId = '', taxRules = [], showTaxFields = true,
  stock, showStock, weight, length, breadth, height,
  onPriceChange, onOriginalPriceChange, onSalePriceChange, onSaleStartsAtChange, onSaleEndsAtChange,
  onSkuChange, onHsnCodeChange, onTaxRuleIdChange, onStockChange,
  onWeightChange, onLengthChange, onBreadthChange, onHeightChange,
  errors,
}) => {
  const [showSale, setShowSale] = React.useState(!!salePrice);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-base">Pricing & Inventory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">

        {/* MRP + Selling Price */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="originalPrice" className="text-xs">MRP / Original Price (₹) <span className="text-red-500">*</span></Label>
            <Input id="originalPrice" type="number" step="0.01" required value={originalPrice}
              onChange={e => onOriginalPriceChange(e.target.value)}
              className={`h-8 text-sm ${errors.originalPrice ? 'border-destructive' : ''}`} placeholder="0.00" />
            {errors.originalPrice && <p className="text-xs text-destructive">{errors.originalPrice}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price" className="text-xs">Selling Price (₹) <span className="text-red-500">*</span></Label>
            <Input id="price" type="number" step="0.01" required value={price}
              onChange={e => onPriceChange(e.target.value)}
              className={`h-8 text-sm ${errors.price ? 'border-destructive' : ''}`} placeholder="0.00" />
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
            {price && originalPrice && parseFloat(price) < parseFloat(originalPrice) && (
              <p className="text-xs text-green-600 font-medium">
                {Math.round((1 - parseFloat(price) / parseFloat(originalPrice)) * 100)}% off
              </p>
            )}
          </div>
        </div>

        {/* Sale Price */}
        <div className="space-y-2 pt-3 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Sale / Promotional Price</Label>
            <Toggle checked={showSale} onChange={v => { setShowSale(v); if (!v && onSalePriceChange) { onSalePriceChange(''); if (onSaleStartsAtChange) onSaleStartsAtChange(''); if (onSaleEndsAtChange) onSaleEndsAtChange(''); } }} />
          </div>
          {showSale && (
            <div className="space-y-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="space-y-1.5">
                <Label className="text-xs">Sale Price (₹)</Label>
                <Input type="number" step="0.01" value={salePrice}
                  onChange={e => onSalePriceChange && onSalePriceChange(e.target.value)}
                  className="h-8 text-sm" placeholder="Discounted price" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Sale Starts <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <CalendarClock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-orange-400 pointer-events-none" />
                    <Input type="datetime-local" value={saleStartsAt}
                      onChange={e => onSaleStartsAtChange && onSaleStartsAtChange(e.target.value)}
                      className={`h-8 text-xs pl-7 ${errors.saleStartsAt ? 'border-destructive' : ''}`} required />
                  </div>
                  <button type="button"
                    onClick={() => onSaleStartsAtChange && onSaleStartsAtChange(toLocalInputValue(new Date()))}
                    className="text-xs text-orange-700 hover:text-orange-900 underline underline-offset-2">
                    Start now
                  </button>
                  {errors.saleStartsAt && <p className="text-xs text-destructive">{errors.saleStartsAt}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sale Ends</Label>
                  <div className="relative">
                    <CalendarClock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-orange-400 pointer-events-none" />
                    <Input type="datetime-local" value={saleEndsAt}
                      onChange={e => onSaleEndsAtChange && onSaleEndsAtChange(e.target.value)}
                      min={saleStartsAt || undefined}
                      className={`h-8 text-xs pl-7 ${errors.saleEndsAt ? 'border-destructive' : ''}`} />
                  </div>
                  <div className="flex items-center gap-2">
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
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                        Clear
                      </button>
                    )}
                  </div>
                  {errors.saleEndsAt && <p className="text-xs text-destructive">{errors.saleEndsAt}</p>}
                </div>
              </div>
              <p className="text-xs text-orange-700">A start date &amp; time is required for a sale price. Leave the end empty for an open-ended sale.</p>
            </div>
          )}
        </div>

        {/* SKU + HSN (HSN is gst_tax-gated — matches the backend field guard) */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
          <div className="space-y-1.5">
            <Label htmlFor="sku" className="text-xs">SKU</Label>
            <Input id="sku" type="text" value={sku || ''}
              onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48); onSkuChange(v); }}
              className={`h-8 text-sm font-mono ${errors.sku ? 'border-destructive' : ''} ${sku ? 'bg-muted/50' : ''}`}
              placeholder="AUTO-GENERATED" />
            {errors.sku && <p className="text-xs text-destructive">{errors.sku}</p>}
          </div>
          {showTaxFields && (
            <div className="space-y-1.5">
              <Label htmlFor="hsnCode" className="text-xs">HSN Code</Label>
              <Input id="hsnCode" type="text" value={hsnCode}
                onChange={e => onHsnCodeChange && onHsnCodeChange(e.target.value)}
                className={`h-8 text-sm ${errors.hsnCode ? 'border-destructive' : ''}`} placeholder="e.g. 3004" />
            </div>
          )}
        </div>

        {/* Tax Rule — gst_tax-gated like HSN */}
        {showTaxFields && (
          <div className="space-y-1.5 pt-3 border-t">
            <Label className="text-xs">Tax / GST Rule</Label>
            <Select value={taxRuleId || 'none'} onValueChange={val => onTaxRuleIdChange && onTaxRuleIdChange(val === 'none' ? '' : val)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Default / None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default / None</SelectItem>
                {taxRules.map(rule => {
                  const key = rule._id || rule.id || rule.name;
                  return <SelectItem key={key} value={key}>{rule.name}{rule.rate !== undefined ? ` — ${rule.rate}%` : ''}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Stock */}
        {showStock && (
          <div className="space-y-1.5 pt-3 border-t">
            <Label htmlFor="stock" className="text-xs">Stock Quantity</Label>
            <Input id="stock" type="number" min="0" step="1" value={stock ?? ''}
              onChange={e => { const v = e.target.value; onStockChange(v === '' ? undefined : Math.max(0, parseInt(v) || 0)); }}
              className="h-8 text-sm w-32" placeholder="0" />
            <p className="text-xs text-muted-foreground">For variation products, manage stock per variation below. Changing stock here books a ledgered adjustment (visible in movement history) — unchanged values are never re-sent.</p>
          </div>
        )}

        {/* Dimensions */}
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-xs font-medium">Shipping Dimensions (Required)</Label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'weight', label: 'Wt (kg)', val: weight, onChange: onWeightChange, err: errors.weight },
              { id: 'length', label: 'L (cm)', val: length, onChange: onLengthChange, err: errors.length },
              { id: 'breadth', label: 'B (cm)', val: breadth, onChange: onBreadthChange, err: errors.breadth },
              { id: 'height', label: 'H (cm)', val: height, onChange: onHeightChange, err: errors.height },
            ].map(({ id, label, val, onChange, err }) => (
              <div key={id} className="space-y-1">
                <Label htmlFor={id} className="text-xs">{label} <span className="text-red-500">*</span></Label>
                <Input id={id} type="number" step="0.01" min="0.01" required value={val}
                  onChange={e => onChange(e.target.value)}
                  className={`h-8 text-sm ${err ? 'border-destructive' : ''}`} placeholder="—" />
              </div>
            ))}
          </div>
        </div>

      </CardContent>
    </Card>
  );
};

export default ProductPricing;
