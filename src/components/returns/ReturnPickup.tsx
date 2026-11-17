import React from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Chip } from '../../components/erp';
import { formatCarrierWhen, formatDateTime } from '../../utils/date';
import ShipmentTimeline, { type TrackingEvent } from '../shipments/ShipmentTimeline';

/**
 * WHERE THE RETURN PARCEL IS (RET-PICKUP-2, owner 17 Nov 2026: "i have booked via shiprocket but tracking id or
 * return shipment info not shown"). The return's collection is a shipment in the Ship register like any forward
 * parcel; `GET /returns/{id}` carries it as `pickup` (the attempt the return points at) and every attempt as
 * `pickups`, newest first. One block for the returns desk and the order page.
 */

export interface ReturnPickupView {
  /** The collection's shipment id (Ship `return_pickup::desk_view` names it `id`). */
  id?: string | null;
  shipment_number?: string | null;
  attempt_no?: number | null;
  status?: string | null;
  shipping_provider?: string | null;
  courier_name?: string | null;
  awb?: string | null;
  tracking_url?: string | null;
  tracking_status?: string | null;
  expected_delivery?: string | null;
  pickup_scheduled_date?: string | null;
  carrier_order_id?: string | null;
  carrier_shipment_id?: string | null;
  awb_error?: string | null;
  can_get_awb?: boolean;
  status_history?: Array<{ status?: string | null; changed_at?: string | null; notes?: string | null }> | null;
  timeline?: TrackingEvent[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A status code in words: "pickup_scheduled" reads "pickup scheduled". */
export const spaced = (code?: string | null): string => String(code ?? '').replace(/_/g, ' ').trim();

/** A carrier's own date and time, read as written (formatCarrierWhen), with a comma before the time. */
const carrierWhen = (v: unknown): string => formatCarrierWhen(v, '').replace(' · ', ', ');

/** Who carries it: the courier the carrier gave, else the provider. */
export const carrierOf = (p: ReturnPickupView): string => p.courier_name || p.shipping_provider || '';

/** The tracking link, opening in a new tab; nothing when there is no link. */
export const TrackingLink: React.FC<{ url?: string | null; children?: React.ReactNode }> = ({ url, children }) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
      {children ?? 'Track the parcel'} <ExternalLink className="h-3 w-3" />
    </a>
  ) : null;

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium break-words">{children}</dd>
  </div>
);

interface Props {
  pickup: ReturnPickupView;
  /** Earlier attempts (`pickups` less the current one), shown folded. */
  earlier?: ReturnPickupView[];
  /** Fold the tracking events (the order page); open by default on the returns desk. */
  foldTimeline?: boolean;
  /** A button beside the facts (Get AWB on the returns desk). */
  action?: React.ReactNode;
}

/** One collection attempt: carrier, AWB, tracking link and statuses, pickup date, attempt, tracking events. */
const ReturnPickup: React.FC<Props> = ({ pickup, earlier = [], foldTimeline = false, action }) => {
  const events = Array.isArray(pickup.timeline) ? pickup.timeline : [];
  const timeline = <ShipmentTimeline events={events} emptyText="The carrier has not reported any tracking events yet." />;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {pickup.shipment_number && <span className="font-mono text-sm">{pickup.shipment_number}</span>}
          {pickup.attempt_no != null && <Chip tone="neutral">Attempt {pickup.attempt_no}</Chip>}
          {pickup.status && <Chip tone="blue"><span className="capitalize">{spaced(pickup.status)}</span></Chip>}
        </div>
        {action}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
        <Fact label="Carrier"><span className="capitalize">{carrierOf(pickup) || 'Not known yet'}</span></Fact>
        <Fact label="AWB">
          {pickup.awb ? <span className="font-mono">{pickup.awb}</span> : <span className="text-muted-foreground font-normal">Not assigned yet</span>}
        </Fact>
        <Fact label="Tracking">
          {pickup.tracking_url ? <TrackingLink url={pickup.tracking_url} /> : <span className="text-muted-foreground font-normal">No link yet</span>}
        </Fact>
        <Fact label="Tracking status">
          {pickup.tracking_status ? <span className="capitalize">{spaced(pickup.tracking_status)}</span> : <span className="text-muted-foreground font-normal">No update yet</span>}
        </Fact>
        <Fact label="Pickup date">
          {pickup.pickup_scheduled_date ? carrierWhen(pickup.pickup_scheduled_date) : <span className="text-muted-foreground font-normal">Not scheduled yet</span>}
        </Fact>
        <Fact label="Booked">{pickup.created_at ? formatDateTime(pickup.created_at) : <span className="text-muted-foreground font-normal">Not known</span>}</Fact>
      </dl>
      {pickup.awb_error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>The carrier did not assign an AWB: {pickup.awb_error}</span>
        </p>
      )}
      {foldTimeline ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Tracking events ({events.length})</summary>
          <div className="mt-2">{timeline}</div>
        </details>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Tracking events</p>
          {timeline}
        </div>
      )}
      {earlier.length > 0 && (
        <details className="text-sm rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Earlier collection attempts ({earlier.length})
          </summary>
          <div className="mt-3 space-y-4 divide-y divide-border">
            {earlier.map((p, i) => (
              <div key={p.id ?? i} className={i > 0 ? 'pt-3' : ''}>
                <ReturnPickup pickup={p} foldTimeline />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

/** Every attempt except the current one (`pickup`: the one the return points at, else its newest; `pickups` is
 *  newest first). Compared by the row's `id`: the earlier `shipment_id` was never sent, so every attempt was
 *  listed as earlier, the current one too (RET/26-27/00018 showed 2 earlier attempts for 1). */
export const earlierPickups = (doc: any): ReturnPickupView[] => {
  const all: ReturnPickupView[] = Array.isArray(doc?.pickups) ? doc.pickups : [];
  const current = doc?.pickup?.id ?? null;
  return all.filter((p) => p && (current == null || p.id !== current));
};

/** Where a collection stands, as the returns desk acts on it: `live` (booked and not over yet), `delivered` (the
 *  courier brought it to our warehouse), `failed` (the courier could not collect it, or it went back to the
 *  customer) or `cancelled`. The failed statuses are the ones Ship's `return_pickup::tracked_event` reports as
 *  `return_pickup_failed`; any other status counts as live, so the desk never books a second courier on a guess. */
export type CollectionState = 'live' | 'delivered' | 'failed' | 'cancelled';

const FAILED_COLLECTION = new Set(['ndr_failed_delivery', 'rto_in_transit', 'rto_delivered', 'rto_failed']);

export const collectionState = (p?: ReturnPickupView | null): CollectionState | null => {
  if (!p) return null;
  const s = String(p.status ?? '').trim().toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'delivered') return 'delivered';
  if (FAILED_COLLECTION.has(s)) return 'failed';
  return 'live';
};

export default ReturnPickup;
