import React from 'react';
import { FieldGroup, Field, fieldInputCls } from './FormField';
import { Switch } from '@/components/ui/switch';

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
    <FieldGroup title="Offers"
      description="Deal badges shown on the product page — e.g. free shipping or a bank discount."
      actions={
        <button type="button" onClick={add}
          className="px-3 h-8 text-[13px] bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          + Add offer
        </button>
      }>

      {offers.length === 0 && (
        <button type="button" onClick={add}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-red-300 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          + Add your first offer
        </button>
      )}

      <div className="space-y-3">
        {offers.map((offer, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3 relative bg-gray-50/50">
            <button type="button" onClick={() => remove(idx)} aria-label={`Remove offer ${idx + 1}`}
              className="absolute top-3 right-3 text-gray-300 hover:text-red-600 text-sm p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">✕</button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Offer type" htmlFor={`offerType${idx}`} help="What kind of deal this is.">
                <select id={`offerType${idx}`} className={fieldInputCls} value={offer.type}
                  onChange={e => update(idx, { type: e.target.value as ProductOffer['type'] })}>
                  {Object.entries(offerTypeLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Badge text" htmlFor={`offerLabel${idx}`} help="Exactly what the customer reads on the badge.">
                <input id={`offerLabel${idx}`} className={fieldInputCls} value={offer.label} placeholder="e.g. Free delivery above ₹499"
                  onChange={e => update(idx, { label: e.target.value })} />
              </Field>
            </div>

            {offer.type !== 'free_shipping' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Discount" htmlFor={`offerDiscount${idx}`} help="Pick None for a purely informational badge.">
                  <select id={`offerDiscount${idx}`} className={fieldInputCls} value={offer.discountType || 'none'}
                    onChange={e => update(idx, { discountType: e.target.value as ProductOffer['discountType'] })}>
                    <option value="none">None (informational)</option>
                    <option value="percentage">Percentage %</option>
                    <option value="fixed">Fixed ₹</option>
                  </select>
                </Field>
                {offer.discountType && offer.discountType !== 'none' && (
                  <Field label={offer.discountType === 'percentage' ? 'Value (%)' : 'Value (₹)'} htmlFor={`offerValue${idx}`}
                    help="How much comes off.">
                    <input id={`offerValue${idx}`} type="number" min="0" step="0.5" className={fieldInputCls} value={offer.value ?? ''}
                      onChange={e => update(idx, { value: parseFloat(e.target.value) || undefined })} placeholder={offer.discountType === 'percentage' ? '10' : '50'} />
                  </Field>
                )}
                <Field label="Minimum order (₹)" htmlFor={`offerMin${idx}`} help="Cart total needed before the offer applies.">
                  <input id={`offerMin${idx}`} type="number" min="0" className={fieldInputCls} value={offer.minSubtotal ?? ''}
                    onChange={e => update(idx, { minSubtotal: parseFloat(e.target.value) || undefined })} placeholder="0" />
                </Field>
              </div>
            )}

            {offer.type === 'combo' && (
              <Field label="Coupon code" htmlFor={`offerCoupon${idx}`} help="The code the customer enters at checkout.">
                <input id={`offerCoupon${idx}`} className={`${fieldInputCls} !w-44 font-mono`} value={offer.coupon || ''} placeholder="B2G1"
                  onChange={e => update(idx, { coupon: e.target.value })} />
              </Field>
            )}

            <Field label="Extra details (optional)" htmlFor={`offerDetails${idx}`} help="Shown as a tooltip when the customer hovers the badge.">
              <input id={`offerDetails${idx}`} className={fieldInputCls} value={offer.details || ''} placeholder="Additional details (tooltip)"
                onChange={e => update(idx, { details: e.target.value })} />
            </Field>

            <div className="flex items-center justify-between gap-4 pt-1 border-t border-gray-100">
              <label htmlFor={`offerStackable${idx}`} className="min-w-0 cursor-pointer select-none">
                <span className="block text-[13px] font-medium text-gray-700">Can combine with other offers</span>
                <span className="block text-xs text-gray-400 mt-0.5">Off = applied exclusively; the best single offer wins.</span>
              </label>
              <Switch id={`offerStackable${idx}`} checked={!!offer.stackable}
                onCheckedChange={v => update(idx, { stackable: v })}
                aria-label="Can combine with other offers"
                className="shrink-0 data-[state=checked]:bg-red-600" />
            </div>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
};

export default ProductOffers;
