import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaBan, FaSpinner, FaFileInvoiceDollar, FaBoxOpen, FaUndo } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, type CancelItemsPreview, type CancelItemsResult, type CancelLineInput } from '../../services/api';

interface OrderLine {
  id?: string;
  sku?: string;
  product_name?: string;
  productName?: string;
  catalog_name?: string;
  catalogName?: string;
  quantity?: number;
  cancelled_quantity?: number;
  cancelledQuantity?: number;
  price?: number;
  variation_id?: string;
  variationId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Printed number — this route resolves either, and the wording uses it. */
  orderId: string;
  orderNumber: string;
  items: OrderLine[];
  /** Units already SHIPPED per line key (SKU, else name) — those cannot be cancelled. */
  shippedByKey?: Record<string, number>;
  /** True when a tax invoice is out: the dialog must say a credit note is coming. */
  invoiceNumber?: string | null;
  onCancelled: (result: CancelItemsResult) => void;
}

const inr = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
};

/**
 * CANCEL PART OF AN ORDER — some units of some lines.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `POST /orders/:id/cancel-items` has been built and correct since migration
 * 168 — it restocks exactly the cancelled units, reprices the order through the
 * one totals formula and raises the refund — and it had NO user interface at
 * all. Live homeomead has 17,047 order lines and zero with a cancelled
 * quantity, because there has never been a way to reach it. The whole-order
 * `CancelOrderModal` was the only cancellation staff could perform, so "drop one
 * item from this order" meant cancelling all of it and keying a new one.
 *
 * ── IT SHOWS THE CONSEQUENCE BEFORE IT HAPPENS ──────────────────────────────
 * Every number on screen comes from `POST /cancel-items/preview`, which runs the
 * SAME `planCancelItems` → `repriceOrderMoney` the real call runs. Nothing is
 * derived in the browser — not the new total, not the refund, not the tax. So
 * the figure the operator approves is the figure that will be written, and the
 * preview cannot drift from the act.
 *
 * ── AND IT SAYS WHAT THE ACCOUNTING WILL DO ─────────────────────────────────
 * The part that was invisible: when a tax invoice has already been issued,
 * cancelling raises a CREDIT NOTE against it (the invoice itself is frozen and
 * never changes), and that note is what opens the refund. An operator pressing
 * this button is issuing a statutory document, so the dialog says so, names the
 * invoice, and states whether money is actually going back — before they commit,
 * not in a toast afterwards.
 *
 * A line that a shipment already covers cannot be cancelled: the server refuses
 * it by name, and this caps the stepper at the unshipped remainder so the
 * refusal is usually never reached.
 */
const CancelItemsModal: React.FC<Props> = ({
  isOpen, onClose, orderId, orderNumber, items, shippedByKey, invoiceNumber, onCancelled,
}) => {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  /**
   * Does the operator want the money sent NOW, or just recorded?
   *
   * Default OFF. A cancellation and a refund are two decisions, and the second
   * one moves real money out of the store's gateway account — it should be an
   * explicit act, not something that happens because somebody cancelled a line.
   */
  const [sendRefund, setSendRefund] = useState(false);
  const [preview, setPreview] = useState<CancelItemsPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  /** Line identity — mirrors the backend's `lineKey` (SKU, else product name). */
  const keyOf = (it: OrderLine) =>
    String(it.sku || it.product_name || it.productName || '').trim();

  /** Units still cancellable: what is live on the line, minus what has shipped. */
  const cancellable = (it: OrderLine) => {
    const live = Number(it.quantity) || 0;
    const shipped = shippedByKey?.[keyOf(it)] ?? 0;
    return Math.max(0, live - shipped);
  };

  const rows = useMemo(() => items.map((it, i) => {
    const live = Number(it.quantity) || 0;
    const alreadyCancelled = Number(it.cancelled_quantity ?? it.cancelledQuantity ?? 0) || 0;
    const shipped = shippedByKey?.[keyOf(it)] ?? 0;
    const max = cancellable(it);
    return {
      it, idx: i, key: keyOf(it) || `row-${i}`,
      max, shipped, alreadyCancelled,
      /**
       * What was ORIGINALLY ordered. `quantity` means "units still live" since
       * migration 168, so a fully-cancelled line reads 0 there — printing that
       * under a heading called "Ordered" says the customer ordered none of it.
       */
      ordered: live + alreadyCancelled,
      /**
       * WHY this line cannot be cancelled — and it is not always "shipped".
       * A line already cancelled to zero also has nothing left, and telling an
       * operator it shipped when it did not is worse than saying nothing.
       */
      blockedReason: max > 0 ? null
        : alreadyCancelled > 0 && live === 0 ? 'fully cancelled'
        : shipped > 0 ? 'already shipped'
        : 'nothing left',
      name: it.catalog_name ?? it.catalogName ?? it.product_name ?? it.productName ?? 'Item',
    };
  }), [items, shippedByKey]);

  useEffect(() => {
    if (!isOpen) return;
    setQty({}); setReason(''); setPreview(null); setPreviewError(null); setError(null); setSendRefund(false);
  }, [isOpen]);

  const selected: CancelLineInput[] = useMemo(
    () => rows.filter((r) => (qty[r.key] ?? 0) > 0)
      .map((r) => ({ sku: r.it.sku || undefined, variationId: r.it.variation_id ?? r.it.variationId ?? undefined, qty: qty[r.key] })),
    [rows, qty],
  );

  /**
   * Re-price on every change, debounced. The preview is the only source of the
   * money shown, so an operator who changes a quantity must never be looking at
   * the previous answer — `setPreview(null)` clears it the moment the selection
   * changes and it is replaced only by a fresh server response.
   */
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(timer.current);
    if (!selected.length) { setPreview(null); setPreviewError(null); return; }
    setPreview(null);
    setPreviewing(true);
    timer.current = setTimeout(async () => {
      try {
        setPreview(await ordersAPI.previewCancelItems(orderId, selected));
        setPreviewError(null);
      } catch (e: any) {
        setPreviewError(e?.response?.data?.message || 'Could not work out what this would cost');
      } finally {
        setPreviewing(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify(selected), isOpen, orderId]);

  const setLine = (key: string, v: number, max: number) =>
    setQty((q) => ({ ...q, [key]: Math.max(0, Math.min(max, Math.floor(v) || 0)) }));

  const handleSubmit = async () => {
    if (!selected.length) { setError('Choose how many units of which lines to cancel.'); return; }
    setSubmitting(true); setError(null);
    try {
      const result = await ordersAPI.cancelItems(orderId, {
        lines: selected,
        reason: reason.trim() || undefined,
        refund: { mode: sendRefund ? 'send' : 'record_only' },
      });
      onCancelled(result);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The cancellation did not go through');
    } finally {
      setSubmitting(false);
    }
  };

  const totalUnits = selected.reduce((s, l) => s + l.qty, 0);
  const everything = preview?.cancels_everything === true;

  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={submitting}
        className="rounded-lg border-2 border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50">
        Keep the order as it is
      </button>
      <button type="button" onClick={handleSubmit} disabled={submitting || !totalUnits || previewing}
        className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? <FaSpinner className="h-3.5 w-3.5 animate-spin" /> : <FaBan className="h-3.5 w-3.5" />}
        {submitting ? 'Cancelling…'
          : !totalUnits ? 'Choose what to cancel'
          : everything ? `Cancel the whole order`
          : `Cancel ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cancel items on ${orderNumber}`} footer={footer} maxWidth="3xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Choose how many units of each line to cancel. The units go back into stock, the order is
          repriced, and any money owed is refunded — all shown below before you commit.
        </p>

        {/* Said UP FRONT, not only once a line has been picked: an operator on an
            invoiced order is about to issue a statutory document, and that should
            not be a surprise revealed by the preview. */}
        {invoiceNumber && (
          <div className="flex gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <FaFileInvoiceDollar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Tax invoice <strong>{invoiceNumber}</strong> has been issued for this order. It will
              not be changed — cancelling raises a <strong>credit note</strong> against it, which is
              how the GST on those units is reversed.
            </span>
          </div>
        )}

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* ── the lines ───────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 text-center font-semibold">Ordered</th>
                <th className="px-3 py-2 text-center font-semibold">Shipped</th>
                <th className="px-3 py-2 text-center font-semibold">Can cancel</th>
                <th className="px-3 py-2 text-center font-semibold">Cancel</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className={r.max === 0 ? 'bg-slate-50/60 text-slate-400' : ''}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.it.sku ? `SKU ${r.it.sku}` : 'No SKU'}
                      {r.alreadyCancelled > 0 && ` · ${r.alreadyCancelled} already cancelled`}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(r.it.price)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.ordered}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.shipped || '—'}</td>
                  <td className="px-3 py-2 text-center tabular-nums font-medium">{r.max}</td>
                  <td className="px-3 py-2 text-center">
                    {r.max === 0 ? (
                      /* Named rather than assumed: shipped goods have left, but a
                         line cancelled earlier simply has nothing left to cancel. */
                      <span className="text-[11px] italic">{r.blockedReason}</span>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => setLine(r.key, (qty[r.key] ?? 0) - 1, r.max)}
                          className="h-6 w-6 rounded border text-slate-600 hover:bg-slate-100">−</button>
                        <input type="number" min={0} max={r.max} value={qty[r.key] ?? 0}
                          onChange={(e) => setLine(r.key, parseInt(e.target.value, 10), r.max)}
                          className="w-14 rounded border border-gray-300 px-1 py-1 text-center text-sm" />
                        <button type="button" onClick={() => setLine(r.key, (qty[r.key] ?? 0) + 1, r.max)}
                          className="h-6 w-6 rounded border text-slate-600 hover:bg-slate-100">+</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── the consequence, computed by the server ─────────────────────── */}
        {previewing && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <FaSpinner className="h-3.5 w-3.5 animate-spin" /> Working out what this costs…
          </p>
        )}
        {previewError && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{previewError}</p>}

        {preview && !previewing && (
          <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
            {everything && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                This cancels every remaining unit, so the whole order will be cancelled — not just these lines.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Order total now" value={inr(preview.current_total)} />
              <Fact label="After cancelling" value={inr(preview.new_total)} strong />
              <Fact label="Refund" value={inr(preview.refund_amount)}
                tone={preview.refund_amount > 0 ? 'money' : undefined} />
              <Fact label="Back into stock" value={`${preview.units_cancelled} unit${preview.units_cancelled === 1 ? '' : 's'}`} />
            </div>

            {/* THE ACCOUNTING — the thing nobody could see before. */}
            <div className={`flex gap-2 rounded-md px-3 py-2 text-xs ${
              preview.credit_note.will_raise ? 'bg-indigo-50 text-indigo-900' : 'bg-white text-slate-600'}`}>
              <FaFileInvoiceDollar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{preview.credit_note.note}</span>
            </div>

            {!preview.money_back_owed && preview.refund_amount > 0 && (
              <div className="flex gap-2 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
                <FaUndo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Nothing has been collected on this order yet, so the total simply drops — there is no money to send back.</span>
              </div>
            )}

            {/* ── HOW THE MONEY GOES BACK ──────────────────────────────────
                A credit note reverses the GST; it does not move cash. This is
                the other half, and it has to be honest about three things: which
                rail (a Razorpay reversal is not the same as "somebody will
                transfer it"), whether it happens on confirm, and whether the
                store's own approval policy will hold it anyway. */}
            {preview.money_back_owed && preview.refund_amount > 0 && preview.refund_rail && (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="flex gap-2 text-xs text-slate-700">
                  <FaUndo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      {preview.refund_rail.method === 'gateway'
                        ? 'Refund by reversing the original payment'
                        : 'Refund by hand'}
                    </p>
                    <p className="mt-0.5 text-slate-600">{preview.refund_rail.reason}</p>

                    {preview.refund_rail.automatic ? (
                      <label className="mt-2 flex cursor-pointer items-start gap-2">
                        <input type="checkbox" className="mt-0.5" checked={sendRefund}
                          onChange={(e) => setSendRefund(e.target.checked)} />
                        <span className="text-slate-700">
                          Send the {inr(preview.refund_amount)} back now
                          {preview.refund_rail.needs_approval && (
                            <span className="ml-1 font-medium text-amber-700">
                              — it will still need a manager&rsquo;s approval before the money leaves.
                            </span>
                          )}
                        </span>
                      </label>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        The refund will be opened and wait on the Refunds screen — this order has no
                        online payment that can be reversed automatically.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              <FaBoxOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {preview.lines.map((l) => `${l.cancel_qty} × ${l.product_name}`).join(', ')}
                {' '}will be put back on the shelf through the stock ledger.
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Why (recorded on the order and on the credit note)
          </label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Customer asked to drop this item"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
    </Modal>
  );
};

const Fact: React.FC<{ label: string; value: string; strong?: boolean; tone?: 'money' }> = ({ label, value, strong, tone }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`tabular-nums ${strong ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold'} ${
      tone === 'money' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
  </div>
);

export default CancelItemsModal;
