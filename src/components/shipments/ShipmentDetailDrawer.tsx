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
  chargeBasisText, chargeEditable, chargeHistory, nextStep, providerLabel, providerOf, shipmentAwb, shipmentCharge,
  shipmentCod, shipmentCourier,
} from './shipmentFacts';

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

  const load = useCallback((id: string) => {
    setLoading(true); setLoadError(null);
    shipmentsAPI.getById(id)
      .then((res: any) => setShipment(res?.data ?? res))
      .catch((e: any) => { setShipment(null); setLoadError(errorText(e, 'The shipment could not be loaded.')); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEditing(false); setAmount(''); setReason(''); setSaveError(null);
    if (!shipmentId) { setShipment(null); return; }
    load(shipmentId);
  }, [shipmentId, load]);

  const milestones: Record<string, string> = shipment?.milestones ?? {};
  const ndr = shipment?.ndrDetails;
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
            {step && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Next: {step}</p>
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

            {/* NDR detail: why it is failing and whether it can still be delivered */}
            {ndr && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    Failed delivery
                    <Badge variant="destructive">Needs an answer</Badge>
                  </h3>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Reason: </span>{ndr.reason || 'Not given'}</p>
                    <p><span className="text-muted-foreground">Attempts: </span>{ndr.attempts ?? 'Not given'}</p>
                    <p><span className="text-muted-foreground">Raised: </span>{safeDate(ndr.raisedAt) || 'Not given'}</p>
                  </div>
                  {Array.isArray(ndr.history) && ndr.history.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {ndr.history.map((h: any, i: number) => (
                        <div key={i} className="text-xs border-l-2 border-red-200 pl-2">
                          <span className="font-medium">Attempt {h.attempt ?? i + 1}</span>
                          {': '}{h.reason || 'reason not given'}
                          {h.raisedAt && <span className="text-muted-foreground">, {safeDate(h.raisedAt)}</span>}
                        </div>
                      ))}
                    </div>
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
      </SheetContent>
    </Sheet>
  );
};

export default ShipmentDetailDrawer;
