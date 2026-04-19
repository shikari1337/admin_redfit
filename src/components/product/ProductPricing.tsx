import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductPricingProps {
  price: string;
  originalPrice: string;
  sku: string;
  hsnCode?: string;
  taxRuleId?: string;
  taxRules?: Array<{ _id: string; name: string; rate?: number }>;
  stock: number | undefined;
  showStock: boolean;
  weight: string;
  length: string;
  breadth: string;
  height: string;
  onPriceChange: (price: string) => void;
  onOriginalPriceChange: (price: string) => void;
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
    sku?: string;
    hsnCode?: string;
    weight?: string;
    length?: string;
    breadth?: string;
    height?: string;
  };
}

const ProductPricing: React.FC<ProductPricingProps> = ({
  price,
  originalPrice,
  sku,
  hsnCode = '',
  taxRuleId = '',
  taxRules = [],
  stock,
  showStock,
  weight,
  length,
  breadth,
  height,
  onPriceChange,
  onOriginalPriceChange,
  onSkuChange,
  onHsnCodeChange,
  onTaxRuleIdChange,
  onStockChange,
  onWeightChange,
  onLengthChange,
  onBreadthChange,
  onHeightChange,
  errors,
}) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4 border-b mb-4">
        <CardTitle className="text-lg">Pricing, Tax & Inventory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">
              Price (₹) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              required
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className={errors.price ? 'border-destructive' : ''}
            />
            {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="originalPrice">
              Original Price (₹) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="originalPrice"
              type="number"
              step="0.01"
              required
              value={originalPrice}
              onChange={(e) => onOriginalPriceChange(e.target.value)}
              className={errors.originalPrice ? 'border-destructive' : ''}
            />
            {errors.originalPrice && <p className="text-sm text-destructive">{errors.originalPrice}</p>}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="sku">
              SKU {sku && <span className="text-xs font-normal text-muted-foreground">(from database)</span>}
            </Label>
            <Input
              id="sku"
              type="text"
              value={sku || ''}
              onChange={(e) => {
                const skuValue = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
                onSkuChange(skuValue);
              }}
              className={`font-mono ${errors.sku ? 'border-destructive' : ''} ${sku ? 'bg-muted/50' : ''}`}
              placeholder="Auto-generated"
            />
            <p className="text-xs text-muted-foreground">
              {sku 
                ? 'Existing SKU from database. Modify if needed.'
                : 'Unique identifier. Leave empty for auto-generation.'}
            </p>
            {errors.sku && <p className="text-sm text-destructive">{errors.sku}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="hsnCode">HSN Code</Label>
            <Input
              id="hsnCode"
              type="text"
              value={hsnCode}
              onChange={(e) => onHsnCodeChange && onHsnCodeChange(e.target.value)}
              className={errors.hsnCode ? 'border-destructive' : ''}
              placeholder="e.g. 610910"
            />
            <p className="text-xs text-muted-foreground">For GST compliance and tax rates.</p>
            {errors.hsnCode && <p className="text-sm text-destructive">{errors.hsnCode}</p>}
          </div>
        </div>

        <div className="pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="taxRule">Tax / GST Rule</Label>
            <Select
              value={taxRuleId || 'none'}
              onValueChange={(val) => onTaxRuleIdChange && onTaxRuleIdChange(val === 'none' ? '' : val)}
            >
              <SelectTrigger id="taxRule">
                <SelectValue placeholder="Default / None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default / None</SelectItem>
                {taxRules.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No tax rules configured. Add rules in Settings → GST.
                  </div>
                )}
                {taxRules.map((rule) => (
                  <SelectItem key={rule._id} value={rule._id}>
                    {rule.name}{rule.rate !== undefined ? ` — ${rule.rate}%` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applied when calculating GST at checkout.
              {taxRules.length === 0 && ' Configure rules in Settings → GST Settings.'}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold mb-4">Shipping & Package (Required)</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg) <span className="text-red-500">*</span></Label>
              <Input
                id="weight"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={weight}
                onChange={(e) => onWeightChange(e.target.value)}
                className={errors.weight ? 'border-destructive' : ''}
                placeholder="0.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="length">Length (cm) <span className="text-red-500">*</span></Label>
              <Input
                id="length"
                type="number"
                step="1"
                min="1"
                required
                value={length}
                onChange={(e) => onLengthChange(e.target.value)}
                className={errors.length ? 'border-destructive' : ''}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="breadth">Breadth (cm) <span className="text-red-500">*</span></Label>
              <Input
                id="breadth"
                type="number"
                step="1"
                min="1"
                required
                value={breadth}
                onChange={(e) => onBreadthChange(e.target.value)}
                className={errors.breadth ? 'border-destructive' : ''}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height (cm) <span className="text-red-500">*</span></Label>
              <Input
                id="height"
                type="number"
                step="1"
                min="1"
                required
                value={height}
                onChange={(e) => onHeightChange(e.target.value)}
                className={errors.height ? 'border-destructive' : ''}
                placeholder="5"
              />
            </div>
          </div>
        </div>

        {showStock && (
          <div className="pt-4 border-t space-y-2">
            <Label htmlFor="stock">Stock Quantity</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              step="1"
              value={stock ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || value === undefined) {
                  onStockChange(undefined);
                } else {
                  onStockChange(Math.max(0, parseInt(value) || 0));
                }
              }}
              className="lg:w-1/3"
            />
            <p className="text-xs text-muted-foreground">
              Stock quantity for this product. For variants, stock is managed in the Variations section.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductPricing;
