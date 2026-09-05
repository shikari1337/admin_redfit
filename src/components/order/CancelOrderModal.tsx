import React, { useState, useEffect } from 'react';
import { FaBan, FaSpinner } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, type OrderCancelRefund } from '../../services/api';
import { payload } from '@/lib/unwrap';

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Internal uuid — what the status route is called with. */
  orderId: string;
  /** Printed number, for the wording. */
  orderNumber: string;
  paymentMethod?: string | null;
  onCancelled: (refund: RefundOutcome | null) => void;
}

export interface RefundOutcome {
  attempted: boolean;
  ok: boolean;
  message: string;
  outcome: string;
  refund?: { id: string; gateway_refund_id?: string | null; status?: string } | null;
}

/** What `GET /refunds/refundable/:id` answers — all money fields are PAISE strings. */
interface Refundable {
  orderNumber: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  gatewayPaymentId: string | null;
  paidMinor: string;
  refundedMinor: string;
  inFlightMinor: string;
  refundableMinor: string;
}

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};

/**
 * CANCEL AN ORDER — and decide what happens to the money, in the same breath.
 *
 * Cancelling used to be a bare `confirm("Update order status to Cancelled?")`
 * that changed `order_status` and nothing else. A prepaid order kept
 * `payment_status='completed'` forever: it still counted as collected revenue,
 * and no screen anywhere said the customer was owed their money back.
 *
 * So this dialog asks the one question that was missing. It reads the order's
 * REAL paid/refundable position first (`GET /refunds/refundable/:id`) and only
 * offers rails that can actually work:
 *
 *  • an online payment we can reverse  → "Refund via Razorpay now" is offered
 *    and pre-selected. This is the automatic path — one confirmation, money out.
 *  • paid by hand (bank transfer, cash, UPI outside the gateway, a manual
 *    "Mark as Paid") → there is nothing to reverse, so we ask for the refund
 *    REFERENCE the operator already has, or the OTHER ORDER the amount is being
 *    adjusted onto. Both are recorded; neither is invented.
 *  • an unpaid order (COD that never delivered) → no refund question at all.
 *
 * Nothing here can move money silently: the operator picks the rail, sees the
 * exact amount, and presses a button that says what it will do.
 */
const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen, onClose, orderId, orderNumber, paymentMethod, onCancelled,
}) => {
  const [snap, setSnap] = useState<Refundable | null>(null);
  const [autoApproveUnderMinor, setAutoApproveUnderMinor] = useState<number | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);
  const [mode, setMode] = useState<OrderCancelRefund['mode']>('record_only');
  const [reference, setReference] = useState('');
  const [adjustedOrderNumber, setAdjustedOrderNumber] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('record_only'); setReference(''); setAdjustedOrderNumber('');
    setReason(''); setError(null); setSnap(null);

    let cancelled = false;
    setLoadingSnap(true);
    // The store's own approval limit decides whether a refund actually goes out
    // when this dialog is confirmed, or waits for a manager. Telling the
    // operator AFTERWARDS would make "Cancel & refund" a promise we might not
    // keep, so it is read up front and said plainly below.
    // NOTE the `{ data: res }` wrapper on every one of these: the API helpers
    // return `response.data`, which the axios interceptor has ALREADY unwrapped
    // to the payload. Passing that straight to `payload()` makes it look for a
    // `.data` that isn't there and hand back undefined — which showed up here as
    // a cancel dialog with the whole refund section silently missing.
    ordersAPI.refundConfig()
      .then((res) => { if (!cancelled) setAutoApproveUnderMinor(Number(payload<any>({ data: res })?.autoApproveUnderMinor ?? 0)); })
      .catch(() => { /* the warning is a courtesy; cancelling must still work */ });
    ordersAPI.refundable(orderId)
      .then((res) => {
        if (cancelled) return;
        const s = payload<Refundable>({ data: res });
        setSnap(s);
        // Pre-select the rail that can actually run. A reversible online payment
        // is the automatic case the owner asked for; everything else needs the
        // operator to tell us where the money went, so it stays unselected.
        if (s && Number(s.refundableMinor) > 0 && s.gatewayPaymentId) setMode('gateway');
      })
      .catch(() => { /* the snapshot is guidance; cancelling must still be possible */ })
      .finally(() => { if (!cancelled) setLoadingSnap(false); });
    return () => { cancelled = true; };
  }, [isOpen, orderId]);

  const refundable = Number(snap?.refundableMinor ?? 0);
  const hasMoney = refundable > 0;
  const canReverse = !!snap?.gatewayPaymentId;

  const needsReference = mode === 'bank_transfer';
  const needsOrder = mode === 'adjustment';
  const missingDetail =
    (needsReference && !reference.trim()) || (needsOrder && !adjustedOrderNumber.trim());

  const handleClose = () => { if (!submitting) onClose(); };

  const handleSubmit = async () => {
    if (missingDetail) {
      setError(needsReference
        ? 'Enter the reference of the refund you already made, so it can be traced.'
        : 'Enter the order number the amount is being adjusted to.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const refund: OrderCancelRefund = {
        mode: hasMoney ? mode : 'none',
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(adjustedOrderNumber.trim() ? { adjustedOrderNumber: adjustedOrderNumber.trim() } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      const res = await ordersAPI.updateStatus(orderId, 'cancelled', reason.trim() || undefined, refund);
      // `updateStatus` hands back `response.data`, which the axios interceptor
      // has usually already unwrapped to the order itself. Re-wrapping it as an
      // axios-shaped object lets `payload()` read it correctly either way — and
      // the backend deliberately nests `refund_outcome` INSIDE data, because a
      // sibling of `data` would have been dropped by that same unwrap.
      const order = payload<any>({ data: res });
      onCancelled((order?.refund_outcome ?? null) as RefundOutcome | null);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not cancel this order.');
    } finally {
      setSubmitting(false);
    }
  };

  const Choice: React.FC<{
    value: OrderCancelRefund['mode']; title: string; help: string; disabled?: boolean;
  }> = ({ value, title, help, disabled }) => (
    <label className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
      mode === value ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input type="radio" name="refund-mode" value={value} checked={mode === value} disabled={disabled}
        onChange={() => { setMode(value); setError(null); }} className="mt-1" />
      <span className="text-sm">
        <span className="font-medium text-gray-900 block">{title}</span>
        <span className="text-gray-600">{help}</span>
      </span>
    </label>
  );

  const actionLabel = !hasMoney ? 'Cancel Order'
    : mode === 'gateway' ? `Cancel & refund ${inr(refundable)}`
    : mode === 'none' ? 'Cancel without recording a refund'
    : 'Cancel & record refund';

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={submitting}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
        Keep Order
      </button>
      <button type="button" onClick={handleSubmit} disabled={submitting || loadingSnap}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? <FaSpinner className="animate-spin" size={14} /> : <FaBan size={14} />}
        {submitting ? 'Cancelling…' : actionLabel}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Cancel order ${orderNumber}`} footer={footer} maxWidth="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Cancelling is permanent — the order cannot be moved out of this state afterwards.
        </p>

        {loadingSnap && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FaSpinner className="animate-spin" size={13} /> Checking what was paid on this order…
          </div>
        )}

        {!loadingSnap && snap && !hasMoney && (
          <div className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 text-gray-700">
            {Number(snap.paidMinor) <= 0
              ? <>Nothing was paid on this order{paymentMethod === 'cod' ? ' (cash on delivery)' : ''}, so there is no refund to make.</>
              : <>The {inr(snap.refundedMinor)} paid on this order is already back with the customer — nothing further to refund.</>}
          </div>
        )}

        {!loadingSnap && hasMoney && (
          <>
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="font-medium text-amber-900">
                {inr(refundable)} is owed back to the customer.
              </div>
              <div className="text-amber-800 mt-1">
                Paid {inr(snap!.paidMinor)}
                {Number(snap!.refundedMinor) > 0 && <> · {inr(snap!.refundedMinor)} already refunded</>}
                {Number(snap!.inFlightMinor) > 0 && <> · {inr(snap!.inFlightMinor)} already on its way</>}
                {' · '}
                {canReverse
                  ? <>online payment <code className="text-xs">{snap!.gatewayPaymentId}</code> can be reversed</>
                  : <>paid outside the gateway — there is nothing to reverse automatically</>}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">What happens to this money?</div>

              {canReverse && (
                <Choice value="gateway" title="Refund it now via Razorpay"
                  help="Reverses the original payment straight away. The refund id and status are recorded on this order." />
              )}

              <Choice value="bank_transfer"
                title={canReverse ? 'I already refunded it by hand' : 'Refunded by hand — enter the reference'}
                help="A bank transfer, UPI or cash refund you have already made. The reference is what makes it traceable." />

              <Choice value="adjustment" title="Adjust it against another order"
                help="No money moves — the amount is carried onto a different order the customer is placing." />

              <Choice value="store_credit" title="Keep it as store credit"
                help="Stays with you as credit for the customer instead of cash going out." />

              <Choice value="record_only" title="Decide later"
                help="Records that this money is owed and puts it in the Refunds queue, without sending anything yet." />

              <Choice value="none" title="Don't record a refund"
                help="Nothing is owed back — use this only when the money is genuinely not being returned." />
            </div>

            {needsReference && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refund reference / transaction id *
                </label>
                <input type="text" value={reference} onChange={(e) => { setReference(e.target.value); setError(null); }}
                  placeholder="e.g. UTR1234567890, or the refund id from your bank/UPI app"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
            )}

            {/* Will this actually go back on confirm, or wait? Say so BEFORE
                the button is pressed, not in the toast afterwards. */}
            {mode !== 'none' && mode !== 'record_only' && autoApproveUnderMinor !== null
              && refundable >= autoApproveUnderMinor && (
              <div className="text-sm bg-blue-50 border border-blue-200 rounded-md p-3 text-blue-900">
                This refund will be <b>opened and held for a manager's approval</b> — no money moves
                when you confirm.{' '}
                {autoApproveUnderMinor > 0
                  ? <>Your store refunds up to {inr(autoApproveUnderMinor)} without approval.</>
                  : <>Your store currently sends <b>every</b> refund for approval.</>}
                {' '}You can change that in Refunds → “Change”.
                {' '}Whoever raised the refund cannot also approve it.
              </div>
            )}

            {needsOrder && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjusted to order number *
                </label>
                <input type="text" value={adjustedOrderNumber}
                  onChange={(e) => { setAdjustedOrderNumber(e.target.value); setError(null); }}
                  placeholder="e.g. SM-9280"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
                <p className="text-xs text-gray-500 mt-1">
                  That order must already exist. This order's paid position is cleared so the same
                  money is never counted twice.
                </p>
              </div>
            )}
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason <span className="text-gray-400 font-normal">(optional — saved on the order and the refund)</span>
          </label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="e.g. Customer changed their mind"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
      </div>
    </Modal>
  );
};

export default CancelOrderModal;
