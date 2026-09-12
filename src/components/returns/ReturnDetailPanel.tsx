import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Loader2, PackageCheck, CheckCircle2, XCircle, ExternalLink, Clock,
  ShieldAlert, Receipt, PackagePlus, Wallet, RotateCcw, Trash2, Recycle, Truck,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inr, Chip } from '../../components/erp';
import { formatDate, formatDateTime } from '../../utils/date';
import ReturnPhotos from './ReturnPhotos';
import ReceiveGoodsModal from './ReceiveGoodsModal';
import SettleReturnModal from './SettleReturnModal';

/**
 * One return, end to end: what the customer said and sent, what physically
 * arrived, what condition it was in, and what the store did about the money.
 *
 * The four acts are laid out in the order they actually happen, and each one
 * only offers its button when it is genuinely available — a returns desk should
 * never have to guess why a button did nothing (COMMON_MISTAKES #171).
 */

const RESOLUTION_META: Record<string, { label: string; icon: React.ElementType; tone: any }> = {
  refund:       { label: 'Refund',       icon: RotateCcw,   tone: 'blue' },
  replacement:  { label: 'Replacement',  icon: PackagePlus, tone: 'green' },
  store_credit: { label: 'Store credit', icon: Wallet,      tone: 'amber' },
  undecided:    { label: 'Undecided',    icon: Clock,       tone: 'neutral' },
};

const STATUS_TONE: Record<string, any> = {
  pending: 'amber', approved: 'blue', received: 'green',
  completed: 'green', rejected: 'red', cancelled: 'neutral',
};

const DISPOSITIONS = [
  { code: 'resellable', label: 'Good — back on sale', icon: Recycle, cls: 'text-green-700 border-green-300 hover:bg-green-50' },
  { code: 'damaged',    label: 'Damaged — hold',      icon: ShieldAlert, cls: 'text-amber-700 border-amber-300 hover:bg-amber-50' },
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
  const [pickup, setPickup] = useState({ courierName: '', awb: '', mode: '' });
  const [flash, setFlash] = useState('');

  const lines: any[] = doc?.lines ?? [];
  const res = RESOLUTION_META[doc?.resolution] ?? RESOLUTION_META.undecided;
  const ResIcon = res.icon;

  const totalReceived = lines.reduce((s, l) => s + Number(l.qty_received || 0), 0);
  const awaitingDisposition = lines.reduce(
    (s, l) => s + Math.max(0, Number(l.qty_received || 0)
      - Number(l.qty_resellable || 0) - Number(l.qty_damaged || 0) - Number(l.qty_scrapped || 0)), 0);

  const refresh = async () => {
    const r = await api.get(`/returns/${doc.id}`);
    onChanged(payload<any>(r));
  };

  const decide = async (status: 'approved' | 'rejected') => {
    setBusy(status); setError('');
    try {
      await api.put(`/returns/${doc.id}`, { status, decisionNote: note.trim() || undefined });
      setNote('');
      await refresh();
      setFlash(status === 'approved'
        ? 'Approved. When the parcel arrives, book the goods in.'
        : 'Rejected. No goods will be booked in against this return.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not update this return.');
    } finally { setBusy(''); }
  };

  const bookPickup = async () => {
    setBusy('pickup'); setError('');
    try {
      const res = await api.post(`/returns/${doc.id}/pickup`, {
        mode: pickup.mode || doc.return_mode || 'pickup',
        courierName: pickup.courierName.trim() || undefined,
        awb: pickup.awb.trim() || undefined,
      });
      const out = payload<any>(res);
      setPickupOpen(false);
      setPickup({ courierName: '', awb: '', mode: '' });
      setFlash(`Collection booked (attempt ${out?.attemptNo ?? 1}). It now shows on the shipments board.`);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not book the collection.');
    } finally { setBusy(''); }
  };

  const disposition = async (itemId: string, code: string, qty: number) => {
    setBusy(itemId + code); setError('');
    try {
      await api.post(`/returns/${doc.id}/items/${itemId}/disposition`, { disposition: code, qty }, {
        headers: { 'X-Idempotency-Key': `disp-${itemId}-${code}-${qty}` },
      });
      await refresh();
      setFlash(code === 'resellable'
        ? 'Put back on sale.'
        : code === 'damaged' ? 'Held out of sale as damaged.' : 'Written off.');
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
                <Chip tone={STATUS_TONE[doc?.status] ?? 'neutral'}>{doc?.status}</Chip>
                <Chip tone={res.tone}>
                  <ResIcon className="h-3 w-3 mr-1 inline" />{res.label}
                </Chip>
                {doc?.is_exception && (
                  <Chip tone="red">Exception: {doc.exception_reason}</Chip>
                )}
                {doc?.raised_by === 'staff' && <Chip tone="neutral">Raised by staff</Chip>}
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
                  value={doc?.eligible_amount_minor != null ? inr(Number(doc.eligible_amount_minor)) : '—'} />
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
                doc?.claimed_amount_minor != null ? inr(Number(doc.claimed_amount_minor)) : '—'} />
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
          {totalReceived === 0 && doc?.status !== 'rejected' && doc?.status !== 'cancelled' && (
            <section className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" /> Collection
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc?.pickup_shipment_id
                      ? 'A collection is booked. It appears on the shipments board like any other shipment.'
                      : 'Nothing is on its way back yet. Book a courier collection, or record that the customer is shipping it themselves.'}
                  </p>
                </div>
                {hasShipPerm && !pickupOpen && (
                  <button onClick={() => setPickupOpen(true)}
                          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    {doc?.pickup_shipment_id ? 'Book another attempt' : 'Arrange collection'}
                  </button>
                )}
              </div>
              {pickupOpen && (
                <div className="mt-3 pt-3 border-t border-border grid sm:grid-cols-3 gap-2">
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
                  <div className="sm:col-span-3 flex gap-2">
                    <button onClick={bookPickup} disabled={busy === 'pickup'}
                            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium
                                       hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
                      {busy === 'pickup' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Book collection
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
              {canAdjustStock && doc?.status !== 'rejected' && doc?.status !== 'cancelled' && (
                <button
                  onClick={() => setShowReceive(true)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5"
                >
                  <PackageCheck className="h-3.5 w-3.5" /> Book goods in
                </button>
              )}
            </div>
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
                          {l.exception_reason && <Chip tone="red">{l.exception_reason}</Chip>}
                          {l.batch_number && <Chip tone="neutral">Batch {l.batch_number}</Chip>}
                          {Number(l.qty_resellable) > 0 && <Chip tone="green">{l.qty_resellable} back on sale</Chip>}
                          {Number(l.qty_damaged) > 0 && <Chip tone="amber">{l.qty_damaged} damaged</Chip>}
                          {Number(l.qty_scrapped) > 0 && <Chip tone="red">{l.qty_scrapped} destroyed</Chip>}
                        </div>
                        {l.customer_note && (
                          <p className="text-xs mt-2 bg-muted rounded p-2">{l.customer_note}</p>
                        )}
                        <div className="mt-2">
                          <ReturnPhotos photos={l.photos} size="sm" />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium tabular-nums">
                          {l.eligible_amount_minor != null ? inr(Number(l.eligible_amount_minor)) : '—'}
                        </p>
                        {l.unit_price_minor != null && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {inr(Number(l.unit_price_minor))} each
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
                        <div className="flex gap-2 flex-wrap">
                          {DISPOSITIONS.map((d) => {
                            const Icon = d.icon;
                            return (
                              <button
                                key={d.code}
                                disabled={!!busy}
                                onClick={() => disposition(l.id, d.code, outstanding)}
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
            ) : totalReceived === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is owed yet — no goods have been booked in. Receive the parcel first.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {totalReceived} unit{totalReceived !== 1 ? 's' : ''} received, worth{' '}
                  <span className="font-medium text-foreground">
                    {doc?.eligible_amount_minor != null ? inr(Number(doc.eligible_amount_minor)) : '—'}
                  </span>. Nothing has been credited or refunded yet.
                </p>
                {canSettle && (
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
          {canManage && (doc?.status === 'pending' || doc?.status === 'approved' || doc?.status === 'rejected') && (
            <section className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">Decision</h3>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for the record (optional)…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none mb-3
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex gap-2 flex-wrap">
                {doc.status !== 'approved' && (
                  <button onClick={() => decide('approved')} disabled={!!busy}
                          className="px-4 py-2 text-sm rounded-md bg-green-600 text-white font-medium
                                     hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {doc.status === 'rejected' ? 'Approve anyway' : 'Approve'}
                  </button>
                )}
                {doc.status !== 'rejected' && (
                  <button onClick={() => decide('rejected')} disabled={!!busy}
                          className="px-4 py-2 text-sm rounded-md border border-destructive/40 text-destructive font-medium
                                     hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-2">
                    {busy === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Reject
                  </button>
                )}
              </div>
              {doc?.decision_note && (
                <p className="text-xs text-muted-foreground mt-3">
                  Last decision note: {doc.decision_note}
                </p>
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
            setFlash(r?.message ?? 'Settled.');
            if (r?.document) onChanged(r.document); else refresh();
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
