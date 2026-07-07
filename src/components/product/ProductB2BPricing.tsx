import React from 'react';

export interface B2BPricingTier {
  tierName: string;
  minQty: number;
  maxQty?: number;
  priceType: 'fixed' | 'percentage_off' | 'markup_on_cost';
  priceValue: number;
  isActive: boolean;
  validFrom?: string;
  validUntil?: string;
}

interface ProductB2BPricingProps {
  tiers: B2BPricingTier[];
  onChange: (tiers: B2BPricingTier[]) => void;
}

const defaultTier = (): B2BPricingTier => ({
  tierName: 'Wholesale',
  minQty: 10,
  maxQty: undefined,
  priceType: 'fixed',
  priceValue: 0,
  isActive: true,
});

const inputCls = 'px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400 w-full';

const ProductB2BPricing: React.FC<ProductB2BPricingProps> = ({ tiers, onChange }) => {
  const add = () => onChange([...tiers, defaultTier()]);

  const remove = (idx: number) => onChange(tiers.filter((_, i) => i !== idx));

  const update = (idx: number, patch: Partial<B2BPricingTier>) => {
    const next = [...tiers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">B2B / Wholesale Pricing</h3>
          <p className="text-xs text-gray-500 mt-0.5">Quantity-based tiers for bulk buyers</p>
        </div>
        <button type="button" onClick={add}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          + Add Tier
        </button>
      </div>

      {tiers.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-xs text-gray-400">No B2B tiers. Add a tier for wholesale / bulk pricing.</p>
        </div>
      )}

      <div className="space-y-3">
        {tiers.map((tier, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
            <button type="button" onClick={() => remove(idx)}
              className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-sm">✕</button>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Tier Name</label>
                <input className={inputCls} value={tier.tierName}
                  onChange={e => update(idx, { tierName: e.target.value })}
                  placeholder="e.g. Wholesale" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Price Type</label>
                <select className={inputCls} value={tier.priceType}
                  onChange={e => update(idx, { priceType: e.target.value as B2BPricingTier['priceType'] })}>
                  <option value="fixed">Fixed Price (₹)</option>
                  <option value="percentage_off">% Off MRP</option>
                  <option value="markup_on_cost">Markup on Cost</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Min Qty</label>
                <input type="number" min="1" className={inputCls} value={tier.minQty ?? ''}
                  onChange={e => { const v = e.target.value; update(idx, { minQty: (v === '' ? undefined : parseInt(v)) as any }); }}
                  onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) update(idx, { minQty: 1 }); }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Max Qty</label>
                <input type="number" min="1" className={inputCls} value={tier.maxQty || ''}
                  onChange={e => update(idx, { maxQty: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="∞ unlimited" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">
                  {tier.priceType === 'fixed' ? 'Price (₹)' : tier.priceType === 'percentage_off' ? 'Discount (%)' : 'Markup (%)'}
                </label>
                <input type="number" step="0.01" min="0" className={inputCls} value={tier.priceValue ?? ''}
                  onChange={e => { const v = e.target.value; update(idx, { priceValue: (v === '' ? undefined : parseFloat(v)) as any }); }}
                  onBlur={e => { if (!e.target.value) update(idx, { priceValue: 0 }); }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Valid From (optional)</label>
                <input type="date" className={inputCls} value={tier.validFrom || ''}
                  onChange={e => update(idx, { validFrom: e.target.value || undefined })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Valid Until (optional)</label>
                <input type="date" className={inputCls} value={tier.validUntil || ''}
                  onChange={e => update(idx, { validUntil: e.target.value || undefined })} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={tier.isActive} onChange={e => update(idx, { isActive: e.target.checked })} className="sr-only peer" />
                <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-0 after:left-0 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
              </label>
              <span className="text-xs text-gray-500">{tier.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductB2BPricing;
