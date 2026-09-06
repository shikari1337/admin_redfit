import React, { useEffect, useState } from 'react';
import { shipmentsAPI } from '../../services/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '../../utils/date';

interface ShipmentDetailDrawerProps {
  shipmentId: string | null;
  onClose: () => void;
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
  rto_in_transit: 'RTO — returning',
  rto_delivered: 'RTO delivered back',
  cancelled: 'Cancelled',
};

const MILESTONE_ORDER = [
  'created', 'pending', 'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'ndr_failed_delivery', 'delivered', 'rto_in_transit',
  'rto_delivered', 'cancelled',
];

function safeDate(d: any, fmt = 'MMM dd, yyyy HH:mm') {
  return formatDate(d, fmt, '') || null;
}

const ShipmentDetailDrawer: React.FC<ShipmentDetailDrawerProps> = ({ shipmentId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [shipment, setShipment] = useState<any | null>(null);

  useEffect(() => {
    if (!shipmentId) { setShipment(null); return; }
    setLoading(true);
    shipmentsAPI.getById(shipmentId)
      .then((res: any) => setShipment(res?.data ?? res))
      .catch(() => setShipment(null))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  const milestones: Record<string, string> = shipment?.milestones ?? {};
  const timeline: any[] = Array.isArray(shipment?.timeline) ? [...shipment.timeline].reverse() : [];
  const ndr = shipment?.ndrDetails;

  return (
    <Sheet open={!!shipmentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{shipment?.shipmentNumber || 'Shipment details'}</SheetTitle>
          <SheetDescription>
            {shipment?.shippingProvider ? `${shipment.shippingProvider}` : ''}
            {shipment?.awb ? ` · AWB ${shipment.awb}` : ''}
          </SheetDescription>
        </SheetHeader>

        {loading && <p className="text-sm text-muted-foreground mt-6">Loading…</p>}

        {!loading && shipment && (
          <div className="mt-6 space-y-6">
            {/* Header facts */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Courier</p>
                <p className="font-medium">{shipment.courierName || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. delivery</p>
                <p className="font-medium">{safeDate(shipment.expectedDelivery, 'MMM dd, yyyy') || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Warehouse</p>
                <p className="font-medium">
                  {typeof shipment.warehouseId === 'object' ? shipment.warehouseId?.name : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total weight</p>
                <p className="font-medium">{shipment.totalWeight ? `${shipment.totalWeight} kg` : '—'}</p>
              </div>
            </div>

            {/* NDR detail — the "why is this failing and can it still deliver" panel */}
            {ndr && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    NDR detail
                    <Badge variant="destructive">Actionable</Badge>
                  </h3>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Reason: </span>{ndr.reason || 'Unknown'}</p>
                    <p><span className="text-muted-foreground">Attempts: </span>{ndr.attempts ?? '—'}</p>
                    <p><span className="text-muted-foreground">Raised: </span>{safeDate(ndr.raisedAt) || '—'}</p>
                  </div>
                  {Array.isArray(ndr.history) && ndr.history.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {ndr.history.map((h: any, i: number) => (
                        <div key={i} className="text-xs border-l-2 border-red-200 pl-2">
                          <span className="font-medium">Attempt {h.attempt ?? i + 1}</span>
                          {' — '}{h.reason || 'Unknown reason'}
                          {h.raisedAt && <span className="text-muted-foreground"> · {safeDate(h.raisedAt)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Milestones — dated, derived from status_history */}
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

            {/* Full raw timeline — complete audit trail */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Full timeline</h3>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events yet.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((e: any, i: number) => (
                    <div key={i} className="text-sm border-l-2 border-slate-200 pl-3">
                      <p className="font-medium">{e.event || e.description || 'Update'}</p>
                      {e.description && e.description !== e.event && (
                        <p className="text-xs text-muted-foreground">{e.description}</p>
                      )}
                      {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
                      <p className="text-xs text-muted-foreground">{safeDate(e.timestamp) || ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ShipmentDetailDrawer;
