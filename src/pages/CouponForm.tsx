import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { couponsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { FaArrowLeft, FaSave } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { fmtRupees } from '@/lib/money';
import { fromStoreDateTimeInput, isoDaysFromToday, storeDateTimeInput } from '../utils/date';

type CouponType = 'percentage' | 'fixed' | 'b2g1';
type Segment = 'all' | 'retail' | 'b2b';

/** The form as typed: numbers stay text so a field can be emptied (an empty field clears the limit). */
interface CouponFormData {
  code: string;
  type: CouponType;
  value: string;
  description: string;
  minPurchase: string;
  maxDiscount: string;
  usageLimit: string;
  userLimit: string;
  clubbedWithOthers: boolean;
  isPublic: boolean;
  /** `YYYY-MM-DDTHH:mm` on the STORE's clock (datetime-local). */
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  /** Who may use it: 'all' | 'retail' (not B2B) | 'b2b' (only B2B accounts) */
  customerSegment: Segment;
}

const blankForm = (): CouponFormData => ({
  code: '',
  type: 'percentage',
  value: '',
  description: '',
  minPurchase: '',
  maxDiscount: '',
  usageLimit: '',
  userLimit: '',
  validFrom: storeDateTimeInput(new Date()),
  validUntil: `${isoDaysFromToday(30)}T23:59`,
  isActive: true,
  clubbedWithOthers: false,
  isPublic: true,
  customerSegment: 'all',
});

const asText = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
const num = (text: string): number | null => {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const FIELD = 'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const LABEL = 'text-sm font-medium leading-none';
const HINT = 'text-[11px] text-muted-foreground';

const CouponForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { canAccess, hasPerm } = useAuth();
  const b2bEnabled = canAccess('b2b');
  const canManage = hasPerm('marketing.manage');
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState<number>(0);
  const [formData, setFormData] = useState<CouponFormData>(blankForm);

  const fetchCoupon = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setLoadError(null);
      const response = await couponsAPI.getById(id);
      const c = response?.data && typeof response.data === 'object' && !Array.isArray(response.data) && response.data.code ? response.data : response;
      if (!c || typeof c !== 'object' || !c.code) throw new Error('The coupon could not be read');
      const type: CouponType = ['percentage', 'fixed', 'b2g1'].includes(c.type) ? c.type : 'percentage';
      // A fixed coupon's amount is `amount_off` on v2 (the rupee `value` is its mirror).
      const amount = type === 'fixed' ? (c.amountOff ?? c.amount_off ?? c.value) : c.value;
      const segment = c.customerSegment ?? c.customer_segment;
      setFormData({
        code: String(c.code ?? ''),
        type,
        value: type === 'b2g1' ? '' : asText(amount),
        description: String(c.description ?? ''),
        minPurchase: asText(c.minPurchase ?? c.min_purchase),
        maxDiscount: asText(c.maxDiscount ?? c.max_discount),
        usageLimit: asText(c.usageLimit ?? c.usage_limit),
        userLimit: asText(c.userLimit ?? c.user_limit),
        validFrom: storeDateTimeInput(c.validFrom ?? c.valid_from),
        validUntil: storeDateTimeInput(c.validUntil ?? c.valid_until),
        isActive: (c.isActive ?? c.is_active ?? true) !== false,
        clubbedWithOthers: !!(c.clubbedWithOthers ?? c.clubbed_with_others ?? c.clubbedWithOtherCoupons),
        isPublic: (c.isPublic ?? c.is_public ?? true) !== false,
        customerSegment: (['all', 'retail', 'b2b'].includes(segment) ? segment : 'all') as Segment,
      });
      setUsedCount(Number(c.usageCount ?? c.usage_count ?? 0) || 0);
    } catch (err: any) {
      setLoadError(err.response?.data?.message || err.message || 'Could not load the coupon');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) fetchCoupon();
  }, [isEdit, fetchCoupon]);

  const set = <K extends keyof CouponFormData>(key: K, value: CouponFormData[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  /** The checks the server would refuse anyway, said before the round trip. */
  const problem = (f: CouponFormData): string | null => {
    const code = f.code.trim();
    if (code.length < 2 || code.length > 100) return 'The code needs 2 to 100 characters.';
    if (/\s/.test(code)) return 'The code cannot have spaces.';
    if (!f.description.trim()) return 'Say in a few words what the coupon gives.';
    const value = num(f.value);
    if (f.type === 'percentage' && (value === null || Number.isNaN(value) || value <= 0 || value > 100)) return 'The percent off is between 1 and 100.';
    if (f.type === 'fixed' && (value === null || Number.isNaN(value) || value <= 0)) return 'Enter the amount off.';
    for (const [label, text, whole] of [
      ['Minimum purchase', f.minPurchase, false], ['Largest discount', f.maxDiscount, false],
      ['Usage limit', f.usageLimit, true], ['Limit per shopper', f.userLimit, true],
    ] as Array<[string, string, boolean]>) {
      const n = num(text);
      if (n === null) continue;
      if (Number.isNaN(n) || n < 0 || (whole && (!Number.isInteger(n) || n < 1))) return `${label} is not a valid ${whole ? 'whole number' : 'amount'}.`;
    }
    const from = fromStoreDateTimeInput(f.validFrom);
    const until = fromStoreDateTimeInput(f.validUntil);
    if (!from || !until) return 'Give the start and the end.';
    if (Date.parse(until) <= Date.parse(from)) return 'The end must come after the start.';
    return null;
  };

  /**
   * Only the form's own fields, each once. The fetched row carries its stored snake_case fields;
   * spreading it made the v2 body shaper keep those over the edited camelCase twins, so edits to
   * limits, dates and switches were lost. An empty optional field is sent as null (cleared).
   */
  const payload = (f: CouponFormData) => {
    const value = num(f.value);
    // valid until = the end of the chosen minute, on the store's clock
    const until = fromStoreDateTimeInput(/T\d{2}:\d{2}$/.test(f.validUntil) ? `${f.validUntil}:59` : f.validUntil);
    return {
      code: f.code.trim().toUpperCase(),
      type: f.type,
      description: f.description.trim(),
      value: f.type === 'b2g1' ? null : value,
      amountOff: f.type === 'fixed' ? value : null,
      minPurchase: num(f.minPurchase),
      maxDiscount: f.type === 'percentage' ? num(f.maxDiscount) : null,
      usageLimit: num(f.usageLimit),
      userLimit: num(f.userLimit),
      validFrom: fromStoreDateTimeInput(f.validFrom),
      validUntil: until,
      isActive: f.isActive,
      isPublic: f.isPublic,
      clubbedWithOthers: f.clubbedWithOthers,
      customerSegment: f.customerSegment,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const why = problem(formData);
    if (why) { setError(why); return; }
    try {
      setSaving(true);
      if (isEdit) await couponsAPI.update(id!, payload(formData));
      else await couponsAPI.create(payload(formData));
      navigate('/coupons');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || `Could not ${isEdit ? 'save' : 'create'} the coupon`);
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <Button variant="ghost" size="icon" onClick={() => navigate('/coupons')}
      className="text-muted-foreground hover:text-foreground" aria-label="Back to coupons">
      <FaArrowLeft className="h-4 w-4" />
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />
        <div className="h-72 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  // A coupon that could not be read is never shown as a blank form (saving it would overwrite the real one).
  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">{back}<h1 className="text-2xl font-bold tracking-tight">Edit coupon</h1></div>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => fetchCoupon()}>Try again</Button>
        </div>
      </div>
    );
  }

  const valueNum = num(formData.value);
  const preview = formData.type === 'b2g1'
    ? 'Every third item free (the average price of the basket)'
    : formData.type === 'percentage'
      ? `${valueNum && valueNum > 0 ? valueNum : 0}% off${num(formData.maxDiscount) ? `, at most ${fmtRupees(num(formData.maxDiscount))}` : ''}`
      : `${fmtRupees(valueNum && valueNum > 0 ? valueNum : 0)} off`;
  const readOnly = !canManage;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {back}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isEdit ? 'Edit coupon' : 'New coupon'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit && usedCount > 0
              ? `Used ${usedCount} time${usedCount === 1 ? '' : 's'}. Changes apply to the next orders, never to placed ones.`
              : 'What the code gives, who may use it and until when.'}
          </p>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You can read this coupon. Changing coupons needs the marketing manage permission.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <fieldset disabled={readOnly || saving} className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="coupon-code" className={LABEL}>Code *</label>
                <Input id="coupon-code" type="text" value={formData.code} autoComplete="off" spellCheck={false}
                  onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  required placeholder="e.g. SUMMER50" className="font-mono uppercase" maxLength={100} />
                <p className={HINT}>What the shopper types. Letters and numbers, no spaces.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="coupon-type" className={LABEL}>Discount type *</label>
                <select id="coupon-type" value={formData.type} className={FIELD}
                  onChange={(e) => set('type', e.target.value as CouponType)}>
                  <option value="percentage">Percent off the order</option>
                  <option value="fixed">Amount off the order</option>
                  <option value="b2g1">Buy 2 get 1 free</option>
                </select>
                <p className={HINT}>Gives: {preview}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="coupon-description" className={LABEL}>Description *</label>
                <Input id="coupon-description" type="text" value={formData.description}
                  onChange={(e) => set('description', e.target.value)} required
                  placeholder="e.g. 10% off your first order" />
                <p className={HINT}>Shoppers see this next to the code on the deals page and at checkout.</p>
              </div>

              {formData.type !== 'b2g1' && (
                <div className="space-y-2">
                  <label htmlFor="coupon-value" className={LABEL}>
                    {formData.type === 'percentage' ? 'Percent off *' : 'Amount off (₹) *'}
                  </label>
                  <Input id="coupon-value" type="number" inputMode="decimal" value={formData.value}
                    onChange={(e) => set('value', e.target.value)} required min="0"
                    max={formData.type === 'percentage' ? '100' : undefined}
                    step={formData.type === 'percentage' ? '1' : '0.01'}
                    placeholder={formData.type === 'percentage' ? '10' : '200'} />
                </div>
              )}

              {formData.type === 'percentage' && (
                <div className="space-y-2">
                  <label htmlFor="coupon-max" className={LABEL}>Largest discount (₹)</label>
                  <Input id="coupon-max" type="number" inputMode="decimal" value={formData.maxDiscount}
                    onChange={(e) => set('maxDiscount', e.target.value)} min="0" step="0.01" placeholder="No cap" />
                  <p className={HINT}>The percent never takes off more than this.</p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="coupon-min" className={LABEL}>Minimum order (₹)</label>
                <Input id="coupon-min" type="number" inputMode="decimal" value={formData.minPurchase}
                  onChange={(e) => set('minPurchase', e.target.value)} min="0" step="0.01" placeholder="Any order" />
                <p className={HINT}>The basket must reach this before the code works.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="coupon-usage" className={LABEL}>Usage limit, in all</label>
                <Input id="coupon-usage" type="number" inputMode="numeric" value={formData.usageLimit}
                  onChange={(e) => set('usageLimit', e.target.value)} min="1" step="1" placeholder="Unlimited" />
                <p className={HINT}>Orders across all shoppers. Empty means no limit.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="coupon-user" className={LABEL}>Limit per shopper</label>
                <Input id="coupon-user" type="number" inputMode="numeric" value={formData.userLimit}
                  onChange={(e) => set('userLimit', e.target.value)} min="1" step="1" placeholder="Unlimited" />
                <p className={HINT}>Counted for signed-in shoppers; cancelled orders do not count.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="coupon-from" className={LABEL}>Starts *</label>
                <Input id="coupon-from" type="datetime-local" value={formData.validFrom}
                  onChange={(e) => set('validFrom', e.target.value)} required />
              </div>

              <div className="space-y-2">
                <label htmlFor="coupon-until" className={LABEL}>Ends *</label>
                <Input id="coupon-until" type="datetime-local" value={formData.validUntil}
                  onChange={(e) => set('validUntil', e.target.value)} required />
                <p className={HINT}>Times are on the store's clock. The code works up to the end of this minute.</p>
              </div>

              <div className="flex flex-col gap-4 md:col-span-2">
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox checked={formData.isActive} onCheckedChange={(v) => set('isActive', v === true)} />
                  <span>
                    <span className="text-sm font-medium leading-none">Switched on</span>
                    <span className={`block ${HINT}`}>Off stops the code at once, whatever the dates say.</span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox checked={formData.isPublic} onCheckedChange={(v) => set('isPublic', v === true)} />
                  <span>
                    <span className="text-sm font-medium leading-none">Show to shoppers</span>
                    <span className={`block ${HINT}`}>
                      {formData.isPublic
                        ? 'Listed on the deals page, the cart and checkout while it runs.'
                        : 'Hidden: it still works when a shopper types the code.'}
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox checked={formData.clubbedWithOthers} onCheckedChange={(v) => set('clubbedWithOthers', v === true)} />
                  <span>
                    <span className="text-sm font-medium leading-none">Combine with other offers</span>
                    <span className={`block ${HINT}`}>Off: when an automatic offer already applies, the shopper gets the better of the two.</span>
                  </span>
                </label>

                {/* Retail/B2B applicability: only meaningful when the B2B module is on.
                    Enforced server side (validate and checkout), not just hidden here. */}
                {b2bEnabled && (
                  <div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/40 p-3">
                    <label htmlFor="coupon-segment" className={LABEL}>Who can use this coupon?</label>
                    <select id="coupon-segment" value={formData.customerSegment} className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      onChange={(e) => set('customerSegment', e.target.value as Segment)}>
                      <option value="all">Everyone (retail and B2B)</option>
                      <option value="retail">Retail shoppers only</option>
                      <option value="b2b">B2B accounts only</option>
                    </select>
                    <p className={HINT}>
                      B2B buyers already get wholesale prices. Retail only stops them adding a retail promotion on top.
                    </p>
                  </div>
                )}
              </div>
            </fieldset>

            {error && (
              <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/coupons')}>
                {readOnly ? 'Back' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={saving} className="min-w-[140px]">
                  <FaSave className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create coupon'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default CouponForm;
