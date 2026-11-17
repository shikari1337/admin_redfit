import React, { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { Chip, inr } from '../../components/erp';
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
  /** How the AWB's courier was chosen (Ship SHIP-CHEAPEST `provider_data.courier_choice`): `cheapest` (with the
   *  courier, its rate in rupees and days), `chosen` by the desk, or `shiprocket_default` with the reason. */
  courier_choice?: {
    mode?: string | null; courier?: string | null; rate?: number | string | null;
    delivery_days?: number | string | null; reason?: string | null; offers?: number | null;
  } | null;
  status_history?: Array<{ status?: string | null; changed_at?: string | null; notes?: string | null }> | null;
  timeline?: TrackingEvent[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A rupee rate as words, nothing when there is none (never a dash). */
const rateWords = (rate?: number | string | null): string =>
  rate == null || rate === '' || Number.isNaN(Number(rate)) ? '' : inr(Number(rate));

/** Delivery days as words ("3 days"), nothing when not known. */
const daysWords = (days?: number | string | null): string => {
  const n = Number(days);
  return days == null || days === '' || !Number.isFinite(n) || n <= 0 ? '' : `${n} day${n === 1 ? '' : 's'}`;
};

/** How the collection's courier was chosen, in words; nothing before a courier was asked for. */
export const courierChoiceWords = (c: ReturnPickupView['courier_choice']): string => {
  if (!c?.mode) return '';
  if (c.mode === 'cheapest') {
    return ['Cheapest offer', rateWords(c.rate), daysWords(c.delivery_days)].filter(Boolean).join(', ');
  }
  if (c.mode === 'chosen') return 'Chosen on the returns desk';
  if (c.mode === 'shiprocket_default') return c.reason ? `Shiprocket's pick (${c.reason})` : "Shiprocket's pick";
  return spaced(c.mode);
};

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
  /** The desk's acts on this collection (the courier choice and Get AWB), in a row under its facts. */
  action?: React.ReactNode;
}

/** One collection attempt: carrier, AWB, tracking link and statuses, pickup date, attempt, tracking events. */
const ReturnPickup: React.FC<Props> = ({ pickup, earlier = [], foldTimeline = false, action }) => {
  const events = Array.isArray(pickup.timeline) ? pickup.timeline : [];
  const timeline = <ShipmentTimeline events={events} emptyText="The carrier has not reported any tracking events yet." />;
  const choice = courierChoiceWords(pickup.courier_choice);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {pickup.shipment_number && <span className="font-mono text-sm">{pickup.shipment_number}</span>}
        {pickup.attempt_no != null && <Chip tone="neutral">Attempt {pickup.attempt_no}</Chip>}
        {pickup.status && <Chip tone="blue"><span className="capitalize">{spaced(pickup.status)}</span></Chip>}
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
        {choice && <Fact label="Courier choice">{choice}</Fact>}
      </dl>
      {action && <div className="pt-1">{action}</div>}
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

/** One courier offer of a return collection (`GET /returns/{id}/pickup/couriers`, Ship SHIP-CHEAPEST). */
export interface CourierOffer {
  courier_company_id: number;
  courier_name?: string | null;
  courier_code?: string | null;
  /** Rupees, as Shiprocket quoted it. */
  rate?: number | string | null;
  delivery_days?: number | string | null;
  etd?: string | null;
  cheapest?: boolean;
}

interface CourierOffers {
  shipment_id?: string | null;
  pickup_pincode?: string | number | null;
  delivery_pincode?: string | number | null;
  weight_kg?: string | number | null;
  quality_check?: boolean;
  offers?: CourierOffer[];
  default_choice?: { mode?: string | null; courier_company_id?: number | null; reason?: string | null } | null;
  error?: string | null;
}

/** An offer in the picker: courier, rate, days, and "cheapest" on the one booked when nobody chooses. */
const offerWords = (o: CourierOffer): string =>
  [o.courier_name || o.courier_code || `Courier ${o.courier_company_id}`, rateWords(o.rate),
    daysWords(o.delivery_days) || (o.etd ? `by ${o.etd}` : '')].filter(Boolean).join(', ')
  + (o.cheapest ? ' (cheapest)' : '');

/**
 * The courier picker of a return collection (RET-FLOW-UI, owner 17 Nov 2026: "in return also show option to
 * choose courier"): Shiprocket's offers, cheapest first, for a new booking (`qualityCheck` as the booking would ask)
 * or for the collection Get AWB finishes. What the server books when nobody chooses is preselected and labelled:
 * the cheapest offer, or for a doorstep-check return Shiprocket's own pick (the rates do not say which courier
 * checks). Choosing it hands up `null`, so the server records its own choice with the rate; any other offer hands
 * up its `courier_company_id`. When no offer can be read the picker says so and the booking still works.
 */
export const ReturnCourierPicker: React.FC<{
  returnId: string;
  qualityCheck?: boolean;
  disabled?: boolean;
  onChange: (courierId: number | null) => void;
}> = ({ returnId, qualityCheck = false, disabled = false, onChange }) => {
  const [data, setData] = useState<CourierOffers | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState('');
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setFailed(''); setData(null); setPicked(''); onChange(null);
    api.get(`/returns/${returnId}/pickup/couriers`, { params: { qualityCheck } })
      .then((r) => { if (live) setData(payload<CourierOffers>(r)); })
      .catch((e: any) => { if (live) setFailed(e?.response?.data?.message || 'The courier offers could not be read.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnId, qualityCheck]);

  const offers: CourierOffer[] = Array.isArray(data?.offers) ? data!.offers! : [];
  const byDefault = data?.default_choice?.mode === 'cheapest' ? data.default_choice.courier_company_id ?? null : null;
  /** The option shown first: the cheapest offer, else Shiprocket's own pick (value ''). */
  const shown = picked || (byDefault != null ? String(byDefault) : '');

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading Shiprocket&apos;s courier offers
      </p>
    );
  }
  const reason = failed || data?.error || (data && offers.length === 0 ? 'Shiprocket offered no courier.' : '');
  if (reason) {
    return (
      <p className="text-xs text-muted-foreground">
        No courier offers to choose from: {/[.!?]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`} You can
        go ahead without choosing; Shiprocket then picks the courier.
      </p>
    );
  }
  if (!data) return null;
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Courier</span>
      <select value={shown} disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                setPicked(v);
                onChange(v === '' || (byDefault != null && v === String(byDefault)) ? null : Number(v));
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
        {byDefault == null && (
          <option value="">
            Shiprocket&apos;s pick{data.default_choice?.reason ? ` (${data.default_choice.reason})` : ''}
          </option>
        )}
        {offers.map((o) => (
          <option key={o.courier_company_id} value={String(o.courier_company_id)}>{offerWords(o)}</option>
        ))}
      </select>
      {data.pickup_pincode && data.delivery_pincode && (
        <span className="block text-xs text-muted-foreground">
          Rates from PIN {data.pickup_pincode} to PIN {data.delivery_pincode}
          {data.weight_kg ? ` for ${data.weight_kg} kg` : ''}, as Shiprocket quoted them.
        </span>
      )}
    </label>
  );
};

export default ReturnPickup;
