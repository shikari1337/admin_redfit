import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { Button } from '@/components/ui/button';
import { ordersAPI, refundsAPI } from '../../services/api';
import { fmtRupees } from '../../lib/money';

/**
 * Raise a refund on an order that is ALREADY cancelled (or returned).
 *
 * `refundForCancellation()` only runs on the transition INTO 'cancelled', and
 * the cancel dialog lets the operator choose "decide later" or "no refund" — so
 * an order could sit cancelled, with the customer's money still held, and no
 * way in the admin to start a refund afterwards. `POST /refunds` has always
 * accepted any order; this is the missing button, not a new capability.
 *
 * It never moves money by itself: the request goes through the same
 * request → approve → execute pipeline everything else uses, and the dialog
 * says up front whether the store's auto-approve limit will clear it.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Order UUID or printed number — the refundable lookup accepts either. */
  orderId: string;
  orderNumber?: string;
  onRaised: () => void;
}

interface Snapshot {
  paidMinor: string;
  refundedMinor: string;
  inFlightMinor: string;
  refundableMinor: string;
  gatewayPaymentId: string | null;
}

const METHODS = [
  { value: 'gateway', label: 'Reverse the online payment', needsGateway: true },
  { value: 'bank_transfer', label: 'Send it by hand (bank transfer / cash / UPI)', needsGateway: false },
  { value: 'store_credit', label: 'Keep it as store credit', needsGateway: false },
  { value: 'adjustment', label: 'Adjust against another order', needsGateway: false },
] as const;

const RaiseRefundModal: React.FC<Props> = ({ isOpen, onClose, orderId, orderNumber, onRaised }) => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<string>('bank_transfer');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [adjustedOrderNumber, setAdjustedOrderNumber] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    ordersAPI.refundable(orderNumber || orderId)
      .then((res: any) => {
        if (cancelled) return;
        const s: Snapshot = res?.data ?? res;
        setSnap(s ?? null);
        const refundable = Number(s?.refundableMinor ?? 0) / 100;
        setAmount(refundable > 0 ? refundable.toFixed(2) : '');
        // Pre-select the rail that can actually run.
        if (s?.gatewayPaymentId) setMethod('gateway');
      })
      .catch((e: any) => !cancelled && setError(e?.response?.data?.message || 'Could not read the refundable amount'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isOpen, orderId, orderNumber]);

  const refundable = Number(snap?.refundableMinor ?? 0) / 100;
  const paid = Number(snap?.paidMinor ?? 0) / 100;
  const already = Number(snap?.refundedMinor ?? 0) / 100;
  const inFlight = Number(snap?.inFlightMinor ?? 0) / 100;
  const amt = Number(amount);
  const amountValid = Number.isFinite(amt) && amt > 0 && amt <= refundable + 0.005;

  const submit = async () => {
    if (!amountValid) { setError(`Enter an amount between ₹0.01 and ${fmtRupees(refundable)}.`); return; }
    if (method === 'adjustment' && !adjustedOrderNumber.trim()) {
      setError('Which order should absorb this money?'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res: any = await refundsAPI.create({
        orderNumber: orderNumber || undefined,
        orderId: orderNumber ? undefined : orderId,
        // The money is going back because the order was cancelled — record that,
        // not a generic 'manual', so Receivables/reporting can tell them apart.
        source: 'cancellation',
        amount: amt,
        method,
        reason: reason.trim() || 'Refund for cancelled order',
        reference: reference.trim() || undefined,
        adjustedOrderNumber: method === 'adjustment' ? adjustedOrderNumber.trim() : undefined,
      });
      onRaised();
      onClose();
      return res;
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not raise the refund.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Refund ${orderNumber ? `#${orderNumber}` : 'this order'}`}>
      <div className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-sm font-semibold text-slate-400">Reading the order's paid position…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg border-2 border-slate-100 bg-slate-50 p-3 text-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Paid</p>
                <p className="text-base font-black tabular-nums text-slate-900">{fmtRupees(paid)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Already refunded</p>
                <p className="text-base font-black tabular-nums text-slate-600">{fmtRupees(already)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Refundable</p>
                <p className="text-base font-black tabular-nums text-emerald-700">{fmtRupees(refundable)}</p>
              </div>
            </div>

            {inFlight > 0 && (
              <p className="rounded border-2 border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                {fmtRupees(inFlight)} is already on its way back and is excluded from the refundable figure.
              </p>
            )}

            {refundable <= 0 ? (
              <p className="rounded border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                There is nothing left to refund on this order.
              </p>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">How</label>
                  <div className="space-y-1">
                    {METHODS.map((m) => {
                      const disabled = m.needsGateway && !snap?.gatewayPaymentId;
                      return (
                        <label key={m.value}
                          className={`flex items-center gap-2 rounded border-2 px-2 py-1.5 text-sm font-semibold ${
                            disabled ? 'cursor-not-allowed border-slate-100 text-slate-300'
                              : method === m.value ? 'border-blue-300 bg-blue-50 text-blue-900'
                              : 'cursor-pointer border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}>
                          <input type="radio" name="refund-method" value={m.value} disabled={disabled}
                            checked={method === m.value} onChange={() => setMethod(m.value)} />
                          {m.label}
                          {disabled && <span className="text-xs font-medium"> — no reversible online payment</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Amount</label>
                    <input type="number" step="0.01" min="0.01" max={refundable}
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-bold tabular-nums" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">
                      {method === 'adjustment' ? 'Absorb into order #' : 'Reference (optional)'}
                    </label>
                    <input type="text"
                      value={method === 'adjustment' ? adjustedOrderNumber : reference}
                      onChange={(e) => (method === 'adjustment'
                        ? setAdjustedOrderNumber(e.target.value) : setReference(e.target.value))}
                      placeholder={method === 'adjustment' ? 'SM-1234' : 'UTR / txn id'}
                      className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-semibold" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Reason</label>
                  <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Refund for cancelled order"
                    className="w-full rounded border-2 border-slate-200 px-2 py-1.5 text-sm font-semibold" />
                </div>

                <p className="text-xs font-medium text-slate-500">
                  This opens a refund request. It still goes through approval before any money moves.
                </p>
              </>
            )}

            {error && (
              <p className="rounded border-2 border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{error}</p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || loading || refundable <= 0 || !amountValid}>
            {saving ? 'Raising…' : `Refund ${amountValid ? fmtRupees(amt) : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RaiseRefundModal;
