import React from 'react';

export interface ProductOffer {
  id?: string;
  type: 'free_shipping' | 'bank_offer' | 'combo' | 'cashback' | 'custom';
  label: string;
  /** How the offer discounts the order. */
  discountType?: 'percentage' | 'fixed' | 'none';
  value?: number;
  discountPct?: number; // legacy
  /** Minimum order subtotal for the offer to apply. */
  minSubtotal?: number;
  /** Can be combined (clubbed) with other stackable offers / coupons. */
  stackable?: boolean;
  coupon?: string;
  details?: string;
}

interface ProductOffersProps {
  offers: ProductOffer[];
  onChange: (offers: ProductOffer[]) => void;
}

const newId = () => `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const defaultOffer = (): ProductOffer => ({ id: newId(), type: 'custom', label: '', discountType: 'none', stackable: false, details: '' });

const inputCls = 'px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400 w-full';

const offerTypeLabels: Record<ProductOffer['type'], string> = {
  free_shipping: 'Free Shipping',
  bank_offer: 'Bank / Card Offer',
  combo: 'Combo Deal',
  cashback: 'Cashback',
  custom: 'Custom Offer',
};

const ProductOffers: React.FC<ProductOffersProps> = ({ offers, onChange }) => {
  const add = () => onChange([...offers, defaultOffer()]);
  const remove = (idx: number) => onChange(offers.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<ProductOffer>) => {
    const next = [...offers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Product Offers</h3>
          <p className="text-xs text-gray-500 mt-0.5">Badge offers shown on product page (e.g. free shipping, bank deal)</p>
        </div>
        <button type="button" onClick={add}
          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
          + Add Offer
        </button>
      </div>

      {offers.length === 0 && (
        <p className="text-xs text-gray-400 py-3 text-center">No offers configured.</p>
      )}

      <div className="space-y-2">
        {offers.map((offer, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
            <button type="button" onClick={() => remove(idx)}
              className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-sm">✕</button>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Offer Type</label>
                <select className={inputCls} value={offer.type}
                  onChange={e => update(idx, { type: e.target.value as ProductOffer['type'] })}>
                  {Object.entries(offerTypeLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Label (shown to customers)</label>
                <input className={inputCls} value={offer.label} placeholder="e.g. Free delivery above ₹499"
                  onChange={e => update(idx, { label: e.target.value })} />
              </div>
            </div>

            {offer.type !== 'free_shipping' && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Discount</label>
                  <select className={inputCls} value={offer.discountType || 'none'}
                    onChange={e => update(idx, { discountType: e.target.value as ProductOffer['discountType'] })}>
                    <option value="none">None (informational)</option>
                    <option value="percentage">Percentage %</option>
                    <option value="fixed">Fixed ₹</option>
                  </select>
                </div>
                {offer.discountType && offer.discountType !== 'none' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">{offer.discountType === 'percentage' ? 'Value %' : 'Value ₹'}</label>
                    <input type="number" min="0" step="0.5" className={inputCls} value={offer.value ?? ''}
                      onChange={e => update(idx, { value: parseFloat(e.target.value) || undefined })} placeholder={offer.discountType === 'percentage' ? '10' : '50'} />
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Min. order ₹</label>
                  <input type="number" min="0" className={inputCls} value={offer.minSubtotal ?? ''}
                    onChange={e => update(idx, { minSubtotal: parseFloat(e.target.value) || undefined })} placeholder="0" />
                </div>
              </div>
            )}

            {offer.type === 'combo' && (
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Coupon Code</label>
                <input className={inputCls + ' w-40'} value={offer.coupon || ''} placeholder="B2G1"
                  onChange={e => update(idx, { coupon: e.target.value })} />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <input className={inputCls} value={offer.details || ''} placeholder="Additional details (tooltip)"
                onChange={e => update(idx, { details: e.target.value })} />
              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap"
                title="If enabled, this offer can be combined (clubbed) with other stackable offers and clubbable coupons. If disabled, it's applied exclusively (best single offer wins).">
                <input type="checkbox" checked={!!offer.stackable}
                  onChange={e => update(idx, { stackable: e.target.checked })} />
                Clubbable
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductOffers;
