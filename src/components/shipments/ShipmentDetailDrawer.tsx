import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { shipmentsAPI, errorText } from '../../services/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/order/StatusBadge';
import { fmtRupees } from '@/lib/money';
import { formatDate, formatPickupWhen } from '../../utils/date';
import ShipmentTimeline from './ShipmentTimeline';
import {
  chargeBasisText, chargeEditable, chargeHistory, courierUpdate, customerAnswerLine, hasCarrierDocuments, isTerminal,
  ndrActionsFor, ndrCustomerAnswerOf, ndrDetailsOf, ndrPhoneOf, needsNdrAnswer, nextStep, providerLabel, providerOf,
  shipmentAwb, shipmentCharge, shipmentCod, shipmentCourier, shipmentTags,
} from './shipmentFacts';
import { NdrActionButtons, NdrActionDialog, type NdrTarget } from './NdrActions';
import PickupModal from './PickupModal';
import GrowshipParcelPanel from '../growship/GrowshipParcelPanel';

interface ShipmentDetailDrawerProps {
  shipmentId: string | null;
  onClose: () => void;
  /** Called after something on the shipment changed here (its charge), so the list behind can reload. */
  onChanged?: () => void;
  /** The store's carrier names by code. */
  providerNames?: Record<string, string>;
}

const MILESTONE_LABELS: Record<string, string> = {
  created: 'Shipment created',
  pending: 'Booked (ready to pick)',
  pickup_scheduled: 'Pickup scheduled',
  picked_up: 'Picked up by courier',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  ndr_failed_delivery: 'Delivery failed (NDR raised)',
  delivered: 'Delivered',
  rto_in_transit: 'Returning to you (RTO)',
  rto_delivered: 'Returned to you (RTO)',
  cancelled: 'Cancelled',
};

const MILESTONE_ORDER = [
  'created', 'pending', 'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'ndr_failed_delivery', 'delivered', 'rto_in_transit',
  'rto_delivered', 'cancelled',
];

function safeDate(d: any, fmt = 'dd MMM yyyy, HH:mm') {
  return formatDate(d, fmt, '') || null;
}

const Fact: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div>
    <p className="text-muted-foreground">{k}</p>
    <div className="font-medium">{children}</div>
  </div>
);

/**
 * One shipment: who carries it, where it is, what it collects, what it cost to ship (and, for a parcel the
 * store sent with its own carrier, entering or correcting that charge with the reason), its pickup, NDR,
 * milestones and full timeline.
 */
const ShipmentDetailDrawer: React.FC<ShipmentDetailDrawerProps> = ({ shipmentId, onClose, onChanged, providerNames }) => {
  const [loading, setLoading] = useState(false);
  const [shipment, setShipment] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ndrTarget, setNdrTarget] = useState<NdrTarget | null>(null);
  // The parcel's own actions, as the shipments board has them (owner 26 Nov 2026: "make sure we can schedule
  // pickup, download labels and manifest from here also"): the same calls and the same pickup dialog.
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docNote, setDocNote] = useState<string | null>(null);

  const load = useCallback((id: string) => {
    setLoading(true); setLoadError(null);
    shipmentsAPI.getById(id)
      .then((res: any) => setShipment(res?.data ?? res))
      .catch((e: any) => { setShipment(null); setLoadError(errorText(e, 'The shipment could not be loaded.')); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEditing(false); setAmount(''); setReason(''); setSaveError(null); setNdrTarget(null);
    setPickupOpen(false); setDocError(null); setDocNote(null);
    if (!shipmentId) { setShipment(null); return; }
    load(shipmentId);
  }, [shipmentId, load]);

  const milestones: Record<string, string> = shipment?.milestones ?? {};
  const ndr = shipment ? ndrDetailsOf(shipment) : null;
  const answer = shipment ? ndrCustomerAnswerOf(shipment) : null;
  const ndrPhone = shipment ? ndrPhoneOf(shipment) : null;
  const failed = shipment?.status === 'ndr_failed_delivery';
  const waiting = !!shipment && needsNdrAnswer(shipment);
  const said = shipment ? courierUpdate(shipment) : null;
  const tags = shipment ? shipmentTags(shipment) : [];
  const returnBy = shipment?.billingReturnDeadline ?? shipment?.billing_return_deadline;
  const attemptNo = shipment?.attemptNo ?? shipment?.attempt_no;
  const notes = typeof shipment?.notes === 'string' ? shipment.notes.trim() : '';
  const provider = providerOf(shipment);
  const manual = provider === 'manual';
  const awb = shipment ? shipmentAwb(shipment) : null;
  const courier = shipment ? shipmentCourier(shipment) : null;
  const cod = shipment ? shipmentCod(shipment) : null;
  const charge = shipment ? shipmentCharge(shipment) : null;
  const history = shipment ? chargeHistory(shipment) : [];
  const canEditCharge = !!shipment && chargeEditable(shipment);
  const step = shipment ? nextStep(shipment) : null;
  const orders: any[] = Array.isArray(shipment?.orders) ? shipment.orders : [];
  const warehouse = typeof shipment?.warehouseId === 'object' ? shipment.warehouseId : null;
  const codBasis = shipment?.codSentBasis ?? shipment?.cod_sent_basis;
  const codNote = shipment?.codSentNote ?? shipment?.cod_sent_note;

  const docs = !!shipment && hasCarrierDocuments(shipment);
  const canPickup = !!shipment && !manual && shipment.status === 'pending' && !shipment.pickup?.scheduledDate;
  const canManifest = docs && ['pending', 'pickup_scheduled'].includes(shipment?.status);
  const canReceipt = !!shipment?.pickup?.pickupId && !isTerminal(shipment?.status) && !manual;

  /** One document download; its refusal shows here in words. */
  const fetchDoc = async (key: string, run: () => Promise<unknown>, fallback: string) => {
    setBusyDoc(key); setDocError(null); setDocNote(null);
    try { await run(); } catch (e: any) { setDocError(errorText(e, fallback)); } finally { setBusyDoc(null); }
  };

  const submitPickup = async () => {
    if (!shipmentId) return;
    if (!pickupDate) { setDocError('Choose the pickup date.'); return; }
    setBusyDoc('pickup'); setDocError(null); setDocNote(null);
    try {
      const res: any = await shipmentsAPI.schedulePickup(shipmentId, {
        scheduledDate: pickupDate,
        pickupTimeSlot: pickupTimeSlot || undefined,
        notes: pickupNotes || undefined,
      });
      const pk = res?.pickup ?? res?.data?.pickup ?? {};
      const when = pk.scheduledFor || pk.scheduledDate || pickupDate;
      const tokenBits = [pk.pickupId, pk.pickupToken].filter(Boolean).join(', ');
      setDocNote(pk.source === 'carrier' || res?.meta?.alreadyScheduled
        ? `A pickup was already booked with the courier for ${when}${tokenBits ? ` (${tokenBits})` : ''}. Recorded on the shipment.`
        : `Pickup scheduled for ${when}${tokenBits ? ` (${tokenBits})` : ''}.`);
      setPickupOpen(false); setPickupDate(''); setPickupTimeSlot(''); setPickupNotes('');
      load(shipmentId);
      onChanged?.();
    } catch (e: any) {
      setDocError(errorText(e, 'The pickup could not be scheduled.'));
    } finally {
      setBusyDoc(null);
    }
  };

  const startEdit = () => {
    setAmount(charge ? String(charge.total) : '');
    setReason(charge ? '' : 'Charge not entered when the parcel was booked');
    setSaveError(null);
    setEditing(true);
  };

  const saveCharge = async () => {
    if (!shipmentId) return;
    const value = amount.trim();
    if (value === '' || !/^\d+(\.\d{1,2})?$/.test(value)) { setSaveError('Enter the amount paid in rupees, for example 85 or 85.50 (0 if it was free).'); return; }
    if (!reason.trim()) { setSaveError('Say why the charge is set or changed; it is kept in the parcel\'s history.'); return; }
    setSaving(true); setSaveError(null);
    try {
      const res: any = await shipmentsAPI.setCharge(shipmentId, Number(value), reason.trim());
      setShipment(res?.data ?? res);
      setEditing(false);
      onChanged?.();
    } catch (e: any) {
      setSaveError(errorText(e, 'The charge could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!shipmentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {shipment?.shipmentNumber || 'Shipment details'}
            {shipment?.status && <StatusBadge status={shipment.status} type="shipment" className="text-xs" />}
          </SheetTitle>
          <SheetDescription>
            {shipment ? `${providerLabel(provider, providerNames)}${courier && courier.toLowerCase() !== provider ? `, ${courier}` : ''}` : ''}
          </SheetDescription>
        </SheetHeader>

        {loading && <p className="text-sm text-muted-foreground mt-6">Loading...</p>}
        {!loading && loadError && <p className="text-sm text-red-600 mt-6">{loadError}</p>}

        {!loading && shipment && (
          <div className="mt-6 space-y-6">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => <Badge key={t.key} variant={t.tone} title={t.title}>{t.label}</Badge>)}
              </div>
            )}

            {step && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Next: {step}</p>
            )}

            {(canPickup || docs || canReceipt) && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {canPickup && (
                    <Button size="sm" onClick={() => { setDocError(null); setPickupOpen(true); }} disabled={!!busyDoc}>
                      Schedule pickup
                    </Button>
                  )}
                  {docs && (
                    <>
                      <Button size="sm" variant="outline" disabled={!!busyDoc}
                              onClick={() => fetchDoc('label4r', () => shipmentsAPI.downloadLabel(shipment._id, '4R'), 'The label could not be downloaded.')}>
                        {busyDoc === 'label4r' ? 'Downloading...' : 'Label, 4R (thermal)'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busyDoc}
                              onClick={() => fetchDoc('labelA4', () => shipmentsAPI.downloadLabel(shipment._id, 'A4'), 'The label could not be downloaded.')}>
                        {busyDoc === 'labelA4' ? 'Downloading...' : 'Label, A4'}
                      </Button>
                    </>
                  )}
                  {canManifest && (
                    <Button size="sm" variant="outline" disabled={!!busyDoc}
                            onClick={() => fetchDoc('manifest', () => shipmentsAPI.downloadManifest(shipment._id), 'The manifest could not be downloaded.')}>
                      {busyDoc === 'manifest' ? 'Downloading...' : 'Manifest'}
                    </Button>
                  )}
                  {canReceipt && (
                    <Button size="sm" variant="outline" disabled={!!busyDoc}
                            onClick={() => fetchDoc('receipt', () => shipmentsAPI.downloadPickupReceipt(shipment._id), 'The pickup receipt could not be downloaded.')}>
                      {busyDoc === 'receipt' ? 'Downloading...' : 'Pickup receipt'}
                    </Button>
                  )}
                </div>
                {docNote && <p className="text-sm text-green-700">{docNote}</p>}
                {docError && <p className="text-sm text-red-600">{docError}</p>}
              </div>
            )}

            {/* The courier's own latest words on the parcel, and when it said them. */}
            {said && (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">Courier's latest update{said.at && safeDate(said.at) ? `, ${safeDate(said.at)}` : ''}</p>
                <p className="font-medium text-slate-800">{said.words}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Fact k="AWB">
                {awb ? (shipment.trackingUrl
                  ? <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">{awb}</a>
                  : <span className="font-mono">{awb}</span>)
                  : <span className="text-muted-foreground">No AWB yet</span>}
              </Fact>
              <Fact k={orders.length > 1 ? 'Orders' : 'Order'}>
                {orders.length ? orders.map((o) => (
                  <Link key={o._id || o.id} to={`/orders/${o._id || o.id}`} className="block text-blue-600 hover:underline">
                    {o.orderId || o.order_id}{o.customerName ? <span className="text-muted-foreground font-normal"> ({o.customerName})</span> : null}
                  </Link>
                )) : <span className="text-muted-foreground">No order linked</span>}
              </Fact>
              <Fact k="Ships from">{warehouse?.name || <span className="text-muted-foreground">Not recorded</span>}</Fact>
              <Fact k="Weight">{shipment.totalWeight ? `${shipment.totalWeight} kg` : <span className="text-muted-foreground">Not recorded</span>}</Fact>
              <Fact k="Parcel value">{shipment.totalValue != null ? fmtRupees(shipment.totalValue) : <span className="text-muted-foreground">Not recorded</span>}</Fact>
              <Fact k="Collect on delivery">
                {cod !== null ? fmtRupees(cod) : 'Nothing (prepaid)'}
                {cod !== null && codBasis === 'estimated' && codNote && <span className="block text-xs font-normal text-muted-foreground">{codNote}</span>}
              </Fact>
              <Fact k="Booked">{safeDate(shipment.createdAt) || '...'}</Fact>
              <Fact k="Expected delivery">{safeDate(shipment.expectedDelivery, 'dd MMM yyyy') || <span className="text-muted-foreground">Not given</span>}</Fact>
              {returnBy && safeDate(returnBy, 'dd MMM yyyy') && (
                <Fact k="Return window ends">{safeDate(returnBy, 'dd MMM yyyy')}</Fact>
              )}
              {attemptNo != null && attemptNo !== '' && (
                <Fact k="Booking attempt">{String(attemptNo)}</Fact>
              )}
              {notes && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium whitespace-pre-line">{notes}</p>
                </div>
              )}
            </div>

            {/* What the parcel cost to ship: the courier's quote at booking, or what staff entered for their own carrier. */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                Shipping charge
                {!charge && manual && <Badge variant="destructive">Not entered</Badge>}
              </h3>
              {charge ? (
                <div className="text-sm space-y-1">
                  <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Store pays</span><span className="font-semibold tabular-nums">{fmtRupees(charge.total)}</span></div>
                  {charge.freight !== null && charge.basis !== 'entered' && (
                    <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Freight</span><span className="tabular-nums">{fmtRupees(charge.freight)}</span></div>
                  )}
                  {charge.cod !== null && (
                    <div className="flex items-baseline justify-between"><span className="text-muted-foreground">COD charge</span><span className="tabular-nums">{fmtRupees(charge.cod)}</span></div>
                  )}
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">GST</span>
                    <span className="tabular-nums">{charge.gst !== null ? `${fmtRupees(charge.gst)} (included)` : charge.basis === 'entered' ? 'as paid' : 'not stated in the quote'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{chargeBasisText(charge.basis)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {manual ? 'What was paid to the carrier for this parcel was not entered when it was booked.' : 'This parcel was booked with no courier quote (for example, linked from the courier\'s own panel).'}
                </p>
              )}

              {history.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Charge history</p>
                  {history.map((h, i) => (
                    <div key={i} className="text-xs border-l-2 border-slate-200 pl-2">
                      <span className="font-medium">{h.from !== null ? `${fmtRupees(h.from)} to ${fmtRupees(h.to)}` : `Set to ${fmtRupees(h.to)}`}</span>
                      {h.reason && <span>: {h.reason}</span>}
                      <span className="block text-muted-foreground">{[h.by, safeDate(h.at)].filter(Boolean).join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}

              {canEditCharge && !editing && (
                <Button size="sm" variant="outline" className="mt-3" onClick={startEdit}>
                  {charge ? 'Correct the charge' : 'Enter the charge'}
                </Button>
              )}
              {canEditCharge && editing && (
                <div className="mt-3 space-y-2 rounded-md border p-3">
                  <label className="block text-xs font-medium text-gray-700">
                    Amount paid to the carrier (Rs, all in) *
                    <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1" />
                  </label>
                  <label className="block text-xs font-medium text-gray-700">
                    Why *
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. carrier's bill received" className="mt-1" />
                  </label>
                  {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveCharge} disabled={saving}>{saving ? 'Saving...' : 'Save charge'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {/* A Growcord Ship parcel: its itemised charges and its own courier timeline, read from Growcord Ship. */}
            {provider === 'growcord_ship' && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Growcord Ship</h3>
                  <GrowshipParcelPanel shipment={shipment} awb={awb} />
                </div>
              </>
            )}

            {/* A delivered COD parcel: its cash comes back on the courier's payout. */}
            {cod !== null && shipment.status === 'delivered' && orders.length > 0 && (
              <>
                <Separator />
                <div className="text-sm">
                  <h3 className="text-sm font-semibold mb-1">COD payout</h3>
                  <p className="text-muted-foreground">The courier owes you {fmtRupees(cod)} for this parcel until its payout is recorded.</p>
                  <Link to={`/panel/orders/cod-recon?record=1&order=${encodeURIComponent(orders[0]._id || orders[0].id)}`} className="mt-1 inline-block text-blue-700 hover:underline">
                    Record or find its COD payout
                  </Link>
                </div>
              </>
            )}

            {/* NDR detail: why it is failing, what the customer said, and the answers this courier takes */}
            {(failed || ndr || answer) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    Failed delivery
                    {waiting && <Badge variant="destructive">Needs an answer</Badge>}
                    {ndr?.resolvedAt && <Badge variant="good">Answered {safeDate(ndr.resolvedAt, 'dd MMM') || ''}</Badge>}
                  </h3>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Reason: </span>{ndr?.reason || 'Not given'}</p>
                    <p><span className="text-muted-foreground">Attempts: </span>{ndr?.attempts ?? 'Not given'}</p>
                    <p><span className="text-muted-foreground">Raised: </span>{safeDate(ndr?.raisedAt) || 'Not given'}</p>
                    {ndr?.actionTaken && <p><span className="text-muted-foreground">Last answer sent: </span>{ndr.actionTaken}</p>}
                    {ndrPhone && <p><span className="text-muted-foreground">Delivery phone given: </span><span className="tabular-nums">{ndrPhone}</span></p>}
                    {ndr?.lastCheckedAt && <p className="text-xs text-muted-foreground">Checked with the courier {safeDate(ndr.lastCheckedAt)}</p>}
                  </div>

                  {answer && (
                    <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      <p className="text-xs text-blue-800">Customer's answer{answer.at && safeDate(answer.at) ? `, ${safeDate(answer.at)}` : ''}</p>
                      <p className="font-medium">{customerAnswerLine(answer)}</p>
                      {answer.carrierNotified !== null && (
                        <p className="text-xs mt-0.5">{answer.carrierNotified ? 'Sent to the courier.' : 'The courier was not told: send it with a button below, or call the courier.'}</p>
                      )}
                    </div>
                  )}

                  {ndr && ndr.history.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {ndr.history.map((h, i) => (
                        <div key={i} className="text-xs border-l-2 border-red-200 pl-2">
                          <span className="font-medium">Attempt {h.attempt ?? i + 1}</span>
                          {': '}{h.reason || 'reason not given'}
                          {h.action && <span>, answered: {h.action}</span>}
                          {h.at && safeDate(h.at) && <span className="text-muted-foreground">, {safeDate(h.at)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {failed && ndrActionsFor(shipment).length > 0 && (
                    <NdrActionButtons shipment={shipment} onPick={(a) => setNdrTarget({ shipment, action: a })} className="mt-3" />
                  )}
                  {failed && !manual && ndrActionsFor(shipment).length === 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">This courier takes no answers online: call the courier, then set the status on the board.</p>
                  )}
                  {failed && manual && (
                    <p className="mt-3 text-xs text-muted-foreground">Your own carrier: call it, then move the parcel on the board.</p>
                  )}
                </div>
              </>
            )}

            {/* Pickup: what the courier actually booked (synced from the carrier when the pickup was made in its own panel) */}
            {(shipment?.pickup?.scheduledDate || shipment?.pickup?.scheduledFor || shipment?.pickup?.manifestId) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    Pickup
                    {shipment.pickup.source === 'carrier' && <Badge variant="outline">booked at courier</Badge>}
                  </h3>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Scheduled: </span>{formatPickupWhen(shipment.pickup) || 'Not given'}</p>
                    {shipment.pickup.pickupTimeSlot && <p><span className="text-muted-foreground">Preferred slot: </span>{shipment.pickup.pickupTimeSlot}</p>}
                    {shipment.pickup.pickupId && <p><span className="text-muted-foreground">Pickup id: </span><span className="font-mono">{shipment.pickup.pickupId}</span></p>}
                    {shipment.pickup.pickupToken && <p><span className="text-muted-foreground">Token: </span><span className="font-mono">{shipment.pickup.pickupToken}</span></p>}
                    {shipment.pickup.manifestId && <p><span className="text-muted-foreground">Manifest: </span><span className="font-mono">{shipment.pickup.manifestId}</span></p>}
                    {shipment.pickup.pickupBookedAt && <p><span className="text-muted-foreground">Booked: </span>{shipment.pickup.pickupBookedAt}</p>}
                    {shipment.pickup.pickupAgent?.name && <p><span className="text-muted-foreground">Pickup agent: </span>{shipment.pickup.pickupAgent.name}{shipment.pickup.pickupAgent.phone ? `, ${shipment.pickup.pickupAgent.phone}` : ''}</p>}
                    {shipment.pickup.pickupException && <p className="text-red-600">{shipment.pickup.pickupException}</p>}
                    {shipment.pickup.syncedAt && <p className="text-xs text-muted-foreground">Synced {safeDate(shipment.pickup.syncedAt)}</p>}
                  </div>
                </div>
              </>
            )}

            {/* Milestones: dated, derived from status_history */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Milestones</h3>
              <div className="space-y-2">
                {MILESTONE_ORDER.filter((k) => milestones[k]).map((key) => (
                  <div key={key} className="flex items-baseline justify-between text-sm">
                    <span>{MILESTONE_LABELS[key] || key}</span>
                    <span className="text-muted-foreground text-xs">{safeDate(milestones[key])}</span>
                  </div>
                ))}
                {MILESTONE_ORDER.filter((k) => milestones[k]).length === 0 && (
                  <p className="text-sm text-muted-foreground">No dated status changes recorded yet.</p>
                )}
              </div>
            </div>

            {/* Full raw timeline, the complete record (one list for every parcel: ShipmentTimeline) */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Full timeline</h3>
              <ShipmentTimeline events={shipment.timeline} />
            </div>
          </div>
        )}

        {/* The failed-delivery answer picked above; the parcel is read again once the server took it. */}
        <NdrActionDialog
          target={ndrTarget}
          onClose={() => setNdrTarget(null)}
          onDone={() => { if (shipmentId) load(shipmentId); onChanged?.(); }}
        />
        <PickupModal
          isOpen={pickupOpen}
          isBulk={false}
          onClose={() => { setPickupOpen(false); setPickupDate(''); setPickupTimeSlot(''); setPickupNotes(''); }}
          onSubmit={submitPickup}
          pickupDate={pickupDate}
          pickupTimeSlot={pickupTimeSlot}
          pickupNotes={pickupNotes}
          onDateChange={setPickupDate}
          onTimeSlotChange={setPickupTimeSlot}
          onNotesChange={setPickupNotes}
          isSubmitting={busyDoc === 'pickup'}
        />
      </SheetContent>
    </Sheet>
  );
};

export default ShipmentDetailDrawer;
