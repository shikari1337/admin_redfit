import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { Button } from '@/components/ui/button';
import { ordersAPI, type ApplyOrderDiscountResult } from '../../services/api';
import { fmtRupees } from '../../lib/money';

/**
 * Apply a manual discount to an order — percent, flat amount, or a coupon
 * code — without hand-editing line items.
 *
 * `POST /orders/:id/apply-discount` is only allowed while the order is unpaid
 * and unshipped (the same gate `PUT /orders/:id/items` already applies), and
 * it always re-runs `computeOrderTotals` server-side — GST, coupon rules and
 * rounding are never re-derived here (rule 7a). This modal shows the order's
 * CURRENT total up front, then — once the server has actually applied the
 * discount — shows the real new total it came back with. It never computes
 * an estimated total itself.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Internal order UUID — what the route is called with. */
  orderId: string;
  orderNumber?: string;
  /** The order's current total, in rupees (e.g. `order.total`). */
  currentTotal: number;
  onApplied: (result: ApplyOrderDiscountResult) => void;
}

type Mode = 'percent' | 'amount' | 'coupon';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'percent', label: '% off the order' },
  { value: 'amount', label: 'Flat amount off' },
  { value: 'coupon', label: 'Coupon code' },
];

const ApplyOrderDiscountModal: React.FC<Props> = ({
  isOpen, onClose, orderId, orderNumber, currentTotal, onApplied,
}) => {
  const [mode, setMode] = useState<Mode>('percent');
  const [value, setValue] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyOrderDiscountResult | null>(null);

  // Reset on every open — a stale "applied" result from a previous order must
  // never bleed into the next one via OrderNavigator.
  useEffect(() => {
    if (!isOpen) return;
    setMode('percent'); setValue(''); setCouponCode(''); setReason('');
    setError(null); setResult(null); setSaving(false);
  }, [isOpen, orderId]);

  const numericValue = Number(value);
  const valueValid = mode === 'coupon'
    || (Number.isFinite(numericValue) && numericValue > 0 && (mode !== 'percent' || numericValue <= 100));
  const couponValid = mode !== 'coupon' || couponCode.trim().length > 0;
  const canSubmit = valueValid && couponValid;

  const handleClose = () => { if (!saving) onClose(); };

  const submit = async () => {
    if (!canSubmit) {
      setError(
        mode === 'coupon' ? 'Enter a coupon code.'
          : mode === 'percent' ? 'Enter a percentage between 0 and 100.'
          : 'Enter an amount greater than ₹0.'
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await ordersAPI.applyDiscount(orderId, {
        mode,
        value: mode !== 'coupon' ? numericValue : undefined,
        couponCode: mode === 'coupon' ? couponCode.trim() : undefined,
        reason: reason.trim() || undefined,
      });
      setResult(res);
      onApplied(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not apply this discount.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Apply a discount${orderNumber ? ` — #${orderNumber}` : ''}`}
    >
      <div className="space-y-3">
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-lg border-2 border-emerald-100 bg-emerald-50 p-3 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Discount applied</p>
                <p className="text-base font-semibold tabular-nums text-slate-900">{fmtRupees(result.discount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">New total</p>
                <p className="text-base font-semibold tabular-nums text-emerald-700">{fmtRupees(result.total)}</p>
              </div>
            </div>
            {result.message && <p className="text-sm font-medium text-slate-600">{result.message}</p>}
            <div className="flex justify-end pt-1">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border-2 border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Current total</p>
              <p className="text-base font-semibold tabular-nums text-slate-900">{fmtRupees(currentTotal)}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">How</label>
              <div className="space-y-1">
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer items-center gap-2 rounded border-2 px-2 py-1.5 text-sm font-semibold ${
                      mode === m.value ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="discount-mode"
                      value={m.value}
                      checked={mode === m.value}
                      onChange={() => { setMode(m.value); setError(null); }}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            {mode === 'coupon' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Coupon code</label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SAVE10"
                  className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-semibold uppercase tracking-wide"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {mode === 'percent' ? 'Percent off' : 'Amount off (₹)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={mode === 'percent' ? 100 : undefined}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === 'percent' ? 'e.g. 10' : 'e.g. 100'}
                  className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-bold tabular-nums"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Reason <span className="font-normal normal-case text-slate-400">(optional — saved on the order)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Goodwill gesture"
                className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-semibold"
              />
            </div>

            <p className="text-xs font-medium text-slate-500">
              Totals and GST are recomputed by the server — the new total shows here once applied.
            </p>

            {error && (
              <p className="rounded border-2 border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !canSubmit}>
                {saving ? 'Applying…' : 'Apply discount'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ApplyOrderDiscountModal;
