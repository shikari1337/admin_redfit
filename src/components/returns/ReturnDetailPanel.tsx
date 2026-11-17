import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Loader2, PackageCheck, CheckCircle2, XCircle, ExternalLink, Clock,
  ShieldAlert, Receipt, RotateCcw, Trash2, Recycle, Truck, Undo2, Ban, IndianRupee,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inrMinor, Chip } from '../../components/erp';
import { formatDate, formatDateTime } from '../../utils/date';
import ReturnPhotos from './ReturnPhotos';
import ReceiveGoodsModal from './ReceiveGoodsModal';
import SettleReturnModal from './SettleReturnModal';
import ReturnPickup, { earlierPickups } from './ReturnPickup';
import ReturnCharges from './ReturnCharges';
import { RESOLUTION_META, STATUS_LABEL, STATUS_TONE, returnStage, stepResult, wordsFor } from './returnWords';
import { ReturnTermsLine, useReturnEligibility, type EligibleLine } from './ReturnTerms';

/**
 * One return, end to end: what the customer said and sent, what physically
 * arrived, what condition it was in, and what the store did about the money.
 *
 * The four acts are laid out in the order they actually happen, and each one
 * only offers its button when it is genuinely available — a returns desk should
 * never have to guess why a button did nothing (COMMON_MISTAKES #171).
 */

/**
 * What the goods turned out to be. `expired` is deliberately separate from
 * `damaged`: an expired pack is undamaged stock that may never be sold, and on
 * a homeopathy catalogue "lost to expiry" and "lost to breakage" are different
 * problems needing different fixes.
 */
const DISPOSITIONS = [
  { code: 'resellable', label: 'Good — back on sale', icon: Recycle, cls: 'text-green-700 border-green-300 hover:bg-green-50' },
  { code: 'damaged',    label: 'Damaged — hold',      icon: ShieldAlert, cls: 'text-amber-700 border-amber-300 hover:bg-amber-50' },
  { code: 'expired',    label: 'Expired — hold',      icon: Clock, cls: 'text-orange-700 border-orange-300 hover:bg-orange-50' },
  { code: 'scrapped',   label: 'Destroy',             icon: Trash2, cls: 'text-red-700 border-red-300 hover:bg-red-50' },
];

interface Props {
  /** Booking a collection IS a shipment act — same gate as the shipments board. */
  hasShipPerm?: boolean;
  doc: any;
  meta: any;
  canManage: boolean;
  canAdjustStock: boolean;
  canManageStock: boolean;
  canSettle: boolean;
  onClose: () => void;
  onChanged: (doc: any) => void;
}

const ReturnDetailPanel: React.FC<Props> = ({
  doc, meta, canManage, canAdjustStock, canManageStock, canSettle, hasShipPerm = false,
  onClose, onChanged,
}) => {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [showReceive, setShowReceive] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickup, setPickup] = useState({ courierName: '', awb: '', mode: '', provider: 'shiprocket', qc: false });
  /** How many units of each line the next decision applies to. Received goods
   *  are rarely all one thing — 3 back, 2 fine and 1 broken is the normal case,
   *  and an all-or-nothing button cannot express it. */
  const [dispQty, setDispQty] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState('');
  /** Deny after inspection (RET-PICKUP-2 §5): the goods arrived and failed the check. */
  const [denyOpen, setDenyOpen] = useState(false);
  const [deny, setDeny] = useState({ reason: '', goods: '', note: '' });

  const lines: any[] = doc?.lines ?? [];
  /** The goods-check outcomes (kept, sent back, scrapped) and the charge labels, from `/returns/meta`. */
  const qcOutcomes: any[] = meta?.qc_outcomes ?? meta?.qcOutcomes ?? [];
  const chargeLabels: string[] = meta?.charge_labels ?? meta?.chargeLabels ?? [];
  /** RET-FLOW-UI: one reading of where the return stands; every block below offers only that stage's acts. */
  const { stage, current, collection, received: totalReceived, allIn, settled } = returnStage(doc);
  const closed = stage === 'closed';
  /** The customer is sending it back by courier pickup (`return_mode`; none recorded means pickup, as the server books it). */
  const byCourier = !doc?.return_mode || doc.return_mode === 'pickup';
  /** How they said they would send it, in their words (`/returns/meta` modes, such as "I will ship it back myself"). */
  const modeWords = wordsFor(meta?.modes, doc?.return_mode);
  /** Booking is offered only on an approved return with nothing back and no live collection, and not after the
   *  courier delivered it (then the goods are booked in). Another attempt only after a failed or cancelled one. */
  const canBook = stage === 'arrange' && collection !== 'delivered';
  const anotherAttempt = collection === 'failed' || collection === 'cancelled';
  const res = RESOLUTION_META[doc?.resolution] ?? RESOLUTION_META.undecided;
  /** An exception code in the desk's words (the server's `/returns/meta` exceptions). */
  const exceptionWords = (code?: string | null) =>
    (meta?.exceptions ?? []).find((e: any) => e.code === code)?.label ?? code ?? '';
  // DEC-086: each item's return terms, from the same answer the shop's form reads.
  const termsOf = useReturnEligibility(doc?.order_uuid ?? doc?.order_number ?? null);
  const termsByItem = new Map<string, EligibleLine>(
    ((termsOf.data?.lines ?? []) as EligibleLine[]).map((l) => [l.order_item_id, l]));
  const ResIcon = res.icon;

  const awaitingDisposition = lines.reduce(
    (s, l) => s + Math.max(0, Number(l.qty_received || 0)
      - Number(l.qty_resellable || 0) - Number(l.qty_damaged || 0) - Number(l.qty_scrapped || 0)), 0);

  const refresh = async () => {
    const r = await api.get(`/returns/${doc.id}`);
    onChanged(payload<any>(r));
  };

  /** Approve, reject, or reopen (a rejected or withdrawn request goes back to "needs a decision";
   *  the server allows nothing else from there). Rejecting needs its reason (RET-PICKUP-2 §5). */
  const decide = async (status: 'approved' | 'rejected' | 'pending') => {
    if (status === 'rejected' && !note.trim()) { setError('Write why the return is rejected first.'); return; }
    setBusy(status); setError('');
    // What comes after the approval, read before it (the stage it leaves).
    const approvedNext = stage === 'decide_booked'
      ? 'Approved. The collection already booked carries on; book the goods in when they arrive.'
      : byCourier
        ? 'Approved. Arrange the collection next.'
        : 'Approved. Book the goods in when the parcel arrives.';
    try {
      await api.put(`/returns/${doc.id}`, { status, decisionNote: note.trim() || undefined });
      setNote('');
      await refresh();
      setFlash(status === 'approved'
        ? approvedNext
        : status === 'rejected'
          ? 'Rejected. No goods will be booked in against this return.'
          : 'Reopened. It is back with the requests that need a decision.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not update this return.');
    } finally { setBusy(''); }
  };

  /** The desk withdraws the request (the customer asked to, or it was raised by mistake). The
   *  note is kept on the return as the store's withdrawal reason. */
  const withdraw = async () => {
    setBusy('cancelled'); setError('');
    try {
      const res = await api.post(`/returns/${doc.id}/cancel`, { reason: note.trim() || undefined });
      setNote('');
      const d = payload<any>(res);
      if (d && typeof d === 'object' && d.id) onChanged(d); else await refresh();
      setFlash('Withdrawn. Nothing will be booked in or paid against this return.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not withdraw this return.');
    } finally { setBusy(''); }
  };

  /** The booking form, set for how the customer said it comes back: a courier collection books with Shiprocket;
   *  a customer sending it themselves is recorded with their courier and AWB. Either can be changed in the form. */
  const openPickup = () => {
    setPickup({
      courierName: '', awb: '', qc: false,
      provider: byCourier ? 'shiprocket' : 'manual',
      mode: byCourier ? '' : String(doc?.return_mode ?? ''),
    });
    setPickupOpen(true);
  };

  const bookPickup = async () => {
    setBusy('pickup'); setError('');
    try {
      const res = await api.post(`/returns/${doc.id}/pickup`, {
        provider: pickup.provider,
        // Shiprocket collects from the customer — the other modes are records
        // of an arrangement the store made off-system.
        mode: pickup.provider === 'shiprocket' ? 'pickup' : (pickup.mode || doc.return_mode || 'pickup'),
        courierName: pickup.courierName.trim() || undefined,
        awb: pickup.awb.trim() || undefined,
        qualityCheck: pickup.provider === 'shiprocket' ? pickup.qc : undefined,
      });
      // A step reply: its `message` says when the AWB or the pickup request still needs Get AWB.
      const out = stepResult(payload<any>(res));
      setPickupOpen(false);
      setPickup({ courierName: '', awb: '', mode: '', provider: 'shiprocket', qc: false });
      setFlash(out?.message ?? `Collection booked (attempt ${out?.attemptNo ?? 1}).`);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not book the collection.');
    } finally { setBusy(''); }
  };

  /** Finish the return's existing Shiprocket reverse order: the AWB, then the pickup request (RET-PICKUP-2 §2).
   *  It never books a second collection; a carrier refusal leaves it ready to try again. */
  const getAwb = async () => {
    setBusy('awb'); setError(''); setFlash('');
    try {
      const res = await api.post(`/returns/${doc.id}/pickup/awb`, {}, {
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
      const out = stepResult(payload<any>(res));
      setFlash(out?.message ?? 'The carrier was asked for the AWB and the pickup.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The carrier did not assign an AWB.');
    } finally {
      // The carrier's answer (the AWB, or its refusal in `awb_error`) is on the return either way.
      try { await refresh(); } catch { /* the panel keeps what it shows */ }
      setBusy('');
    }
  };

  /** Deny after the goods arrived and failed the check (RET-PICKUP-2 §5): the reason, what happens to the goods,
   *  a note. The return closes as rejected with no credit note. */
  const denyAfterInspection = async () => {
    if (!deny.reason.trim()) { setError('Write why the return is denied.'); return; }
    if (!deny.goods) { setError('Choose what happens to the goods.'); return; }
    setBusy('deny'); setError('');
    try {
      const res = await api.post(`/returns/${doc.id}/deny`, {
        reason: deny.reason.trim(), goods: deny.goods, note: deny.note.trim() || undefined,
      }, { headers: { 'X-Idempotency-Key': crypto.randomUUID() } });
      const out = stepResult(payload<any>(res));
      setDenyOpen(false);
      setDeny({ reason: '', goods: '', note: '' });
      await refresh();
      setFlash(out?.message ?? 'Denied after inspection. No credit note was raised.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not deny this return.');
    } finally { setBusy(''); }
  };

  const disposition = async (itemId: string, code: string, qty: number) => {
    setBusy(itemId + code); setError('');
    try {
      await api.post(`/returns/${doc.id}/items/${itemId}/disposition`, { disposition: code, qty }, {
        headers: { 'X-Idempotency-Key': `disp-${itemId}-${code}-${qty}` },
      });
      setDispQty((q) => { const n = { ...q }; delete n[itemId]; return n; });
      await refresh();
      setFlash(
        code === 'resellable' ? `${qty} unit(s) put back on sale.`
        : code === 'damaged'  ? `${qty} unit(s) held out of sale as damaged.`
        : code === 'expired'  ? `${qty} unit(s) held out of sale as expired.`
        : `${qty} unit(s) written off.`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not record that decision.');
    } finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex justify-end"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background w-full max-w-4xl h-full overflow-y-auto shadow-2xl border-l border-border">

        {/* ── Command band ─────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold font-mono">
                  {doc?.return_number ?? doc?.id?.slice(0, 8)}
                </h2>
                <Chip tone={STATUS_TONE[doc?.status] ?? 'neutral'}>{STATUS_LABEL[doc?.status] ?? doc?.status}</Chip>
                <Chip tone={res.tone}>
                  <ResIcon className="h-3 w-3 mr-1 inline" />{res.label}
                </Chip>
                {doc?.is_exception && (
                  <Chip tone="red">Exception: {exceptionWords(doc.exception_reason)}</Chip>
                )}
                {doc?.raised_by === 'staff' && <Chip tone="neutral">Raised by staff</Chip>}
                {doc?.qc_outcome && (
                  <Chip tone="red">Denied after inspection, goods {wordsFor(qcOutcomes, doc.qc_outcome).toLowerCase()}</Chip>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                {doc?.order_number ? (
                  <Link to={`/orders/${doc.order_uuid ?? doc.order_number}`}
                        className="text-primary hover:underline inline-flex items-center gap-1">
                    {doc.order_number} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : <span>No linked order</span>}
                <span>·</span>
                <span>{doc?.customer_name || doc?.customer_email || 'Customer'}</span>
                <span>·</span>
                <span>raised {doc?.created_at ? formatDate(doc.created_at, 'dd MMM yyyy') : '—'}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Facts strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Fact label="Eligible value"
                  value={doc?.eligible_amount_minor != null ? inrMinor(Number(doc.eligible_amount_minor)) : '—'} />
            <Fact label="Units received" value={`${totalReceived}`} />
            <Fact label="Awaiting decision"
                  value={`${awaitingDisposition}`}
                  tone={awaitingDisposition > 0 ? 'amber' : undefined} />
            <Fact label="Return window"
                  value={doc?.window_state === 'within' ? `Within (${doc.window_days}d)`
                       : doc?.window_state === 'expired' ? 'Expired'
                       : 'Not known'}
                  tone={doc?.window_state === 'expired' ? 'red' : undefined} />
          </div>
        </div>

        <div className="p-6 space-y-6">
          {flash && (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2">{flash}</p>
          )}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
          )}

          {/* ── What the customer said ─────────────────────────────────── */}
          <section className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">What the customer told us</h3>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Reason" value={
                meta?.returnReasons?.find((r: any) => r.code === doc?.reason_code)?.label ?? doc?.reason ?? '—'} />
              <Row label="They want" value={res.label} />
              <Row label="Sending it back by" value={
                meta?.modes?.find((m: any) => m.code === doc?.return_mode)?.label ?? '—'} />
              <Row label="They asked for" value={
                doc?.claimed_amount_minor != null ? inrMinor(Number(doc.claimed_amount_minor)) : '—'} />
            </dl>
            {doc?.reason && doc?.reason_code && doc.reason !== doc.reason_code && (
              <p className="mt-3 text-sm bg-muted rounded-md p-3">{doc.reason}</p>
            )}
            {doc?.notes && (
              <p className="mt-3 text-sm bg-muted rounded-md p-3 whitespace-pre-wrap">{doc.notes}</p>
            )}
            <div className="mt-3">
              <ReturnPhotos photos={doc?.photos} label="Photos they sent" />
            </div>
          </section>

          {/* ── Getting the goods back ──────────────────────────────────── */}
          {/* RET-FLOW-UI: what this block offers follows the stage. Before approval nothing is booked; while a
              collection is live there is no second booking; another attempt only after a failed or cancelled one. */}
          {(['decide', 'decide_booked', 'arrange', 'collecting'].includes(stage) || current) && (
            <section className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> Collection
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stage === 'decide'
                      ? 'Approve the return first, then arrange its collection.'
                      : stage === 'decide_booked'
                        ? 'This collection was booked before the return was approved. Approve the return to carry on with it.'
                        : stage === 'collecting'
                          ? 'A collection is booked. It appears on the shipments board like any other shipment.'
                          : stage === 'arrange'
                            ? (collection === 'delivered'
                                ? 'The courier reports the parcel delivered to the warehouse. Book the goods in below.'
                                : anotherAttempt
                                  ? `The last collection attempt ${collection === 'failed' ? 'failed' : 'was cancelled'}. Book another attempt, or record that the customer is sending it themselves.`
                                  : byCourier
                                    ? 'Approved. Nothing is on its way back yet. Arrange the courier collection, or record that the customer is sending it themselves.'
                                    : `The customer said: ${modeWords}. Book the goods in when it arrives, and record their courier and AWB here if they share them.`)
                            : stage === 'goods_in'
                              ? 'The goods are back. Their collection is kept here for the record.'
                              : 'This return is closed. Its collection is kept here for the record.'}
                  </p>
                  {canBook && !hasShipPerm && (
                    <p className="text-xs text-muted-foreground mt-1">Arranging the collection needs the shipments permission.</p>
                  )}
                </div>
                {canBook && hasShipPerm && !pickupOpen && (
                  <button onClick={openPickup}
                          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    {anotherAttempt ? 'Book another attempt' : byCourier ? 'Arrange collection' : 'Record their parcel'}
                  </button>
                )}
              </div>
              {/* Where the parcel is: carrier, AWB, tracking, pickup date and the carrier's events (RET-PICKUP-2 §2).
                  Get AWB only finishes a live collection of an approved return. */}
              {current && (
                <div className="mt-3 pt-3 border-t border-border">
                  <ReturnPickup
                    pickup={current}
                    earlier={earlierPickups(doc)}
                    action={stage === 'collecting' && current.can_get_awb && hasShipPerm ? (
                      <button onClick={getAwb} disabled={!!busy}
                              title="Asks Shiprocket for the AWB of this collection, then for the pickup. It never books a second collection."
                              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-medium
                                         hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {busy === 'awb' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                        Get AWB
                      </button>
                    ) : undefined}
                  />
                  {stage === 'collecting' && current.can_get_awb && !hasShipPerm && (
                    <p className="text-xs text-muted-foreground mt-2">
                      This collection has no AWB or pickup yet. Getting one needs the shipments permission.
                    </p>
                  )}
                </div>
              )}
              {canBook && hasShipPerm && pickupOpen && (
                <div className="mt-3 pt-3 border-t border-border grid sm:grid-cols-3 gap-2">
                  {/* WHO carries it. Shiprocket actually books the reverse pickup
                      and returns an AWB; the others only record an arrangement. */}
                  <select value={pickup.provider}
                          onChange={(e) => setPickup((p) => ({ ...p, provider: e.target.value }))}
                          className="sm:col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                    <option value="shiprocket">Book with Shiprocket — they collect from the customer</option>
                    <option value="manual">Record it myself (no courier is called)</option>
                  </select>

                  {pickup.provider === 'shiprocket' ? (
                    <>
                      <label className="sm:col-span-3 flex items-start gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={pickup.qc}
                               onChange={(e) => setPickup((p) => ({ ...p, qc: e.target.checked }))}
                               className="h-3.5 w-3.5 mt-0.5 accent-primary" />
                        <span>
                          <strong className="text-foreground">Check the item at the door.</strong>{' '}
                          The rider inspects it against the product before accepting it — you find
                          out at the customer&apos;s doorstep instead of at your dock.
                        </span>
                      </label>
                      <p className="sm:col-span-3 text-xs text-muted-foreground">
                        Shiprocket collects from the address on the order and delivers to your
                        warehouse. The AWB comes back here and the collection appears on the
                        shipments board. Nothing is added to stock until the goods arrive and you
                        book them in.
                      </p>
                    </>
                  ) : (
                    <>
                      <select value={pickup.mode}
                              onChange={(e) => setPickup((p) => ({ ...p, mode: e.target.value }))}
                              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                        <option value="">How it comes back…</option>
                        <option value="pickup">Courier collects it</option>
                        <option value="self_ship">Customer ships it back</option>
                        <option value="drop_off">Customer drops it off</option>
                      </select>
                      <input placeholder="Courier (optional)" value={pickup.courierName}
                             onChange={(e) => setPickup((p) => ({ ...p, courierName: e.target.value }))}
                             className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                      <input placeholder="AWB / tracking (optional)" value={pickup.awb}
                             onChange={(e) => setPickup((p) => ({ ...p, awb: e.target.value }))}
                             className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                    </>
                  )}
                  <div className="sm:col-span-3 flex gap-2">
                    <button onClick={bookPickup} disabled={busy === 'pickup'}
                            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium
                                       hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
                      {busy === 'pickup' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {pickup.provider === 'shiprocket' ? 'Book with Shiprocket' : 'Record collection'}
                    </button>
                    <button onClick={() => setPickupOpen(false)}
                            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── The items ───────────────────────────────────────────────── */}
          <section className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items</h3>
              {/* Goods are booked in once the return is approved, until every expected unit is in. */}
              {canAdjustStock && ['arrange', 'collecting', 'goods_in'].includes(stage) && !allIn && (
                <button
                  onClick={() => setShowReceive(true)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5"
                >
                  <PackageCheck className="h-3.5 w-3.5" /> Book goods in
                </button>
              )}
              {canAdjustStock && (stage === 'decide' || stage === 'decide_booked') && (
                <span className="text-xs text-muted-foreground">Book the goods in once the return is approved.</span>
              )}
            </div>
            {termsOf.error && (
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                Each item&apos;s return terms could not be read: {termsOf.error}
              </p>
            )}
            <div className="divide-y divide-border">
              {lines.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No line items.</p>
              )}
              {lines.map((l) => {
                const done = Number(l.qty_resellable || 0) + Number(l.qty_damaged || 0) + Number(l.qty_scrapped || 0);
                const outstanding = Math.max(0, Number(l.qty_received || 0) - done);
                const lineRes = RESOLUTION_META[l.resolution] ?? null;
                return (
                  <div key={l.id} className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{l.name ?? 'Item'}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{l.sku ?? '—'}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                          <span className="text-muted-foreground">
                            {l.qty_received}/{l.qty_expected} received
                          </span>
                          {lineRes && <Chip tone={lineRes.tone}>{lineRes.label}</Chip>}
                          {l.exception_reason && <Chip tone="red">{exceptionWords(l.exception_reason)}</Chip>}
                          {l.batch_number && <Chip tone="neutral">Batch {l.batch_number}</Chip>}
                          {Number(l.qty_resellable) > 0 && <Chip tone="green">{l.qty_resellable} back on sale</Chip>}
                          {Number(l.qty_damaged) > 0 && <Chip tone="amber">{l.qty_damaged} damaged</Chip>}
                          {Number(l.qty_scrapped) > 0 && <Chip tone="red">{l.qty_scrapped} destroyed</Chip>}
                        </div>
                        {l.order_item_id && termsByItem.get(l.order_item_id) && (
                          <div className="mt-2">
                            <ReturnTermsLine line={termsByItem.get(l.order_item_id)!} />
                          </div>
                        )}
                        {l.customer_note && (
                          <p className="text-xs mt-2 bg-muted rounded p-2">{l.customer_note}</p>
                        )}
                        <div className="mt-2">
                          <ReturnPhotos photos={l.photos} size="sm" />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium tabular-nums">
                          {l.eligible_amount_minor != null ? inrMinor(Number(l.eligible_amount_minor)) : '—'}
                        </p>
                        {l.unit_price_minor != null && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {inrMinor(Number(l.unit_price_minor))} each
                            {l.eligible_amount_minor != null
                              && Number(l.eligible_amount_minor) < Number(l.unit_price_minor) * Number(l.qty_expected ?? 0)
                              && ', less its share of the order discount'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* What is it? — only when units are actually waiting. */}
                    {outstanding > 0 && canManageStock && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">
                          {outstanding} unit{outstanding !== 1 ? 's' : ''} in quarantine — what condition?
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* How many this decision covers. Defaults to everything
                              still waiting, so the common case is one click. */}
                          {outstanding > 1 && (
                            <div className="inline-flex items-center gap-1 mr-1">
                              <button type="button" aria-label="Fewer"
                                      onClick={() => setDispQty((q) => ({
                                        ...q, [l.id]: Math.max(1, (q[l.id] ?? outstanding) - 1) }))}
                                      className="h-7 w-7 rounded-md border border-border hover:bg-muted">−</button>
                              <span className="w-8 text-center text-xs font-semibold tabular-nums">
                                {Math.min(dispQty[l.id] ?? outstanding, outstanding)}
                              </span>
                              <button type="button" aria-label="More"
                                      onClick={() => setDispQty((q) => ({
                                        ...q, [l.id]: Math.min(outstanding, (q[l.id] ?? outstanding) + 1) }))}
                                      className="h-7 w-7 rounded-md border border-border hover:bg-muted">+</button>
                              <span className="text-xs text-muted-foreground ml-1">of {outstanding}</span>
                            </div>
                          )}
                          {DISPOSITIONS.map((d) => {
                            const Icon = d.icon;
                            const qty = Math.min(dispQty[l.id] ?? outstanding, outstanding);
                            return (
                              <button
                                key={d.code}
                                disabled={!!busy}
                                onClick={() => disposition(l.id, d.code, qty)}
                                className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5
                                            disabled:opacity-50 ${d.cls}`}
                              >
                                {busy === l.id + d.code
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Icon className="h-3.5 w-3.5" />}
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {outstanding > 0 && !canManageStock && (
                      <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                        {outstanding} unit{outstanding !== 1 ? 's' : ''} in quarantine. Deciding whether
                        stock goes back on sale needs the inventory manager permission.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── What the customer bears (RET-PICKUP-2 §4) ───────────────── */}
          <section className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-muted-foreground" /> Charges
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              What the customer pays for this return, such as a pickup fee. Settling takes them off the goods credit.
            </p>
            <ReturnCharges
              returnId={doc.id}
              charges={doc?.charges}
              totalMinor={doc?.charges_total_minor}
              labels={chargeLabels}
              editable={canManage && !settled && !closed}
              onChanged={() => { refresh().catch(() => undefined); }}
              lockedNote={settled ? 'This return is settled, so its charges can no longer change.'
                : closed ? 'This return is closed, so its charges can no longer change.'
                : !canManage ? 'Adding a charge needs the returns manager permission.' : undefined}
            />
          </section>

          {/* ── The money ───────────────────────────────────────────────── */}
          <section className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" /> Settlement
            </h3>
            {doc?.credit_note_id ? (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="Credit note" value={doc.credit_note_id.slice(0, 8) + '…'} />
                <Row label="Settled" value={doc.settled_at ? formatDateTime(doc.settled_at) : '—'} />
                <Row label="Refund request"
                     value={doc.refund_request_id ? doc.refund_request_id.slice(0, 8) + '…' : 'None — no cash moved'} />
                <Row label="Replacement order" value={
                  doc.replacement_order_id
                    ? <Link to={`/orders/${doc.replacement_order_id}`} className="text-primary hover:underline">
                        View order <ExternalLink className="h-3 w-3 inline" />
                      </Link>
                    : '—'} />
              </dl>
            ) : doc?.qc_outcome ? (
              <p className="text-sm text-muted-foreground">
                Denied after inspection. Nothing is credited or refunded, and the goods were{' '}
                {wordsFor(qcOutcomes, doc.qc_outcome).toLowerCase()}.
              </p>
            ) : totalReceived === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is owed yet — no goods have been booked in. Receive the parcel first.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {totalReceived} unit{totalReceived !== 1 ? 's' : ''} received, worth{' '}
                  <span className="font-medium text-foreground">
                    {doc?.eligible_amount_minor != null ? inrMinor(Number(doc.eligible_amount_minor)) : '—'}
                  </span>. Nothing has been credited or refunded yet.
                </p>
                {canSettle && stage === 'goods_in' && (
                  <button
                    onClick={() => setShowSettle(true)}
                    className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                  >
                    Settle this return
                  </button>
                )}
              </div>
            )}
            {!canSettle && !doc?.credit_note_id && totalReceived > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Settling raises a credit note and can place a replacement order, so it needs the
                orders permission as well as returns.
              </p>
            )}
          </section>

          {/* ── Decide ──────────────────────────────────────────────────── */}
          {/* RET-FLOW-UI: Approve while it needs a decision; Reject and Withdraw only while no collection is live;
              nothing to decide while the collection runs; Reopen a rejected or withdrawn return, as before. */}
          {canManage && (['decide', 'decide_booked', 'arrange', 'collecting'].includes(stage)
            || (stage === 'closed' && (doc?.status === 'rejected' || doc?.status === 'cancelled'))) && (
            <section className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">Decision</h3>
              {stage === 'decide_booked' && (
                <p className="text-sm text-muted-foreground mb-3">
                  A collection was booked before this return was approved. Approve the return to carry on with it.
                  While the collection is live the return cannot be rejected or withdrawn. To stop this return,
                  cancel the pickup with the courier first.
                </p>
              )}
              {stage === 'collecting' && (
                <p className="text-sm text-muted-foreground">
                  Approved, and its collection is live, so the return cannot be rejected or withdrawn now. To stop
                  this return, cancel the pickup with the courier first.
                </p>
              )}
              {stage !== 'collecting' && (
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={stage === 'closed'
                    ? 'Why it is being reopened (optional)'
                    : stage === 'decide_booked'
                      ? 'A note for the record (optional)'
                      : 'Why it is rejected (needed to reject), or a note for the record or the withdrawal'}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none mb-3
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              )}
              <div className={`flex gap-2 flex-wrap ${stage === 'collecting' ? 'hidden' : ''}`}>
                {(stage === 'decide' || stage === 'decide_booked') && (
                  <button onClick={() => decide('approved')} disabled={!!busy}
                          className="px-4 py-2 text-sm rounded-md bg-green-600 text-white font-medium
                                     hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                )}
                {(stage === 'decide' || stage === 'arrange') && (
                  <button onClick={() => decide('rejected')} disabled={!!busy || !note.trim()}
                          title={note.trim() ? undefined : 'Write why it is rejected first'}
                          className="px-4 py-2 text-sm rounded-md border border-destructive/40 text-destructive font-medium
                                     hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Reject
                  </button>
                )}
                {(stage === 'decide' || stage === 'arrange') && (
                  <button onClick={withdraw} disabled={!!busy}
                          className="px-4 py-2 text-sm rounded-md border border-border font-medium
                                     hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'cancelled' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Withdraw
                  </button>
                )}
                {stage === 'closed' && (doc.status === 'rejected' || doc.status === 'cancelled') && (
                  <button onClick={() => decide('pending')} disabled={!!busy}
                          className="px-4 py-2 text-sm rounded-md border border-border font-medium
                                     hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'pending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reopen
                  </button>
                )}
              </div>
              {(stage === 'decide' || stage === 'arrange') && (
                <p className="text-xs text-muted-foreground mt-2">
                  Withdraw when the customer no longer wants to return it. Reject when the store refuses it;
                  rejecting needs the reason written above, and it is kept on the return.
                </p>
              )}
              {doc?.decision_note && (
                <p className="text-xs text-muted-foreground mt-3">
                  Last decision note: {doc.decision_note}
                </p>
              )}
            </section>
          )}

          {/* ── Deny after inspection (RET-PICKUP-2 §5): the goods came back and failed the check ── */}
          {canManage && stage === 'goods_in' && totalReceived > 0 && (
            <section className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Ban className="h-4 w-4 text-muted-foreground" /> Deny after inspection
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    When the goods that came back do not qualify. The return closes as rejected and no credit note is raised.
                  </p>
                </div>
                {!denyOpen && (
                  <button onClick={() => setDenyOpen(true)} disabled={!!busy}
                          className="px-3 py-1.5 text-xs rounded-md border border-destructive/40 text-destructive font-medium
                                     hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-1.5">
                    <Ban className="h-3.5 w-3.5" /> Deny this return
                  </button>
                )}
              </div>
              {denyOpen && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <textarea rows={2} value={deny.reason}
                            onChange={(e) => setDeny((d) => ({ ...d, reason: e.target.value }))}
                            placeholder="Why it is denied (required)" aria-label="Why it is denied"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                                       focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  {qcOutcomes.length > 0 ? (
                    <select value={deny.goods} onChange={(e) => setDeny((d) => ({ ...d, goods: e.target.value }))}
                            aria-label="What happens to the goods"
                            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                      <option value="">What happens to the goods?</option>
                      {qcOutcomes.map((o: any) => <option key={o.code} value={o.code}>{o.label ?? o.code}</option>)}
                    </select>
                  ) : (
                    <p className="text-xs text-destructive">The choices for the goods could not be read from the server.</p>
                  )}
                  <input value={deny.note} onChange={(e) => setDeny((d) => ({ ...d, note: e.target.value }))}
                         placeholder="Note (optional)" aria-label="Note"
                         className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                  {awaitingDisposition > 0 && !canManageStock && (
                    <p className="text-xs text-muted-foreground">
                      {awaitingDisposition} unit{awaitingDisposition !== 1 ? 's' : ''} still wait for a decision on their
                      condition. Deciding what happens to them needs the inventory manager permission.
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={denyAfterInspection}
                            disabled={busy === 'deny' || !deny.reason.trim() || !deny.goods || (awaitingDisposition > 0 && !canManageStock)}
                            className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground font-medium
                                       hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-2">
                      {busy === 'deny' && <Loader2 className="h-4 w-4 animate-spin" />}
                      Deny return
                    </button>
                    <button onClick={() => setDenyOpen(false)}
                            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {showReceive && (
        <ReceiveGoodsModal
          returnDoc={doc}
          exceptions={meta?.exceptions ?? []}
          onClose={() => setShowReceive(false)}
          onReceived={(r) => {
            setShowReceive(false);
            setFlash(`Booked in ${r?.received ?? ''} unit(s) to quarantine. Decide their condition below.`);
            if (r?.document) onChanged(r.document); else refresh();
          }}
        />
      )}
      {showSettle && (
        <SettleReturnModal
          returnDoc={doc}
          onClose={() => setShowSettle(false)}
          onSettled={(r) => {
            setShowSettle(false);
            const out = stepResult(r);
            setFlash(out?.message ?? 'Settled.');
            // The step's `document` is the stored row; the desk's view (charges, pickup) is read again.
            refresh().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode; tone?: 'amber' | 'red' }> = ({ label, value, tone }) => (
  <div className="rounded-lg border border-border px-3 py-2">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-sm font-medium mt-0.5 tabular-nums ${
      tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-destructive' : ''}`}>{value}</p>
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-4 sm:block">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium sm:mt-0.5">{value}</dd>
  </div>
);

export default ReturnDetailPanel;
