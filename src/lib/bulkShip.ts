/**
 * Booking many orders safely, shared by Growcord Ship's Bulk shipment page and Ship from a file (AUTOSHIP-FILE-1
 * moved these out of `pages/growship/Bulk.tsx` so the two pages hold one copy).
 *
 * The rules: an order is re-read just before it is sent and only a confirmed or processing order with no live
 * parcel is booked; a booking whose answer was lost is looked up on the order and never sent twice.
 */
import { api, shipmentsAPI, errorText } from '../services/api';
import { shipmentAwb } from '../components/shipments/shipmentFacts';
import type { CourierRate } from '../components/order/ShipmentCreationModal';

/** The order statuses a booking takes (`POST /shipments/book`, ship api/shipping.rs create_shipment). */
export const BOOKABLE = ['confirmed', 'processing'];

/** What happened when the order was sent. `skip` and `unknown` are never sent again. */
export interface Outcome { ok: boolean; text: string; skip?: boolean; unknown?: boolean }

export const orderNo = (o: any) => o?.orderId || o?.order_id || String(o?._id ?? '').slice(0, 8);
export const unwrap = (res: any) => res?.data?.data ?? res?.data ?? res ?? {};
export const listOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : []);
/** A parcel that still counts: anything not cancelled. */
export const liveParcels = (r: any) => listOf(r).filter((s) => String(s?.status ?? '') !== 'cancelled');

/** Run `task` over `items`, `width` at a time. */
export async function pooled<T>(items: T[], width: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await task(items[i]);
    }
  }));
}

/**
 * Re-read the order just before it is sent: only a confirmed or processing order with no parcel yet is booked.
 * Answers the reason to skip it, or the order as it stands now.
 */
export async function recheckOrder(id: string): Promise<{ skip: string } | { order: any }> {
  const [res, parcels] = await Promise.all([api.get(`/orders/${id}`), shipmentsAPI.byOrder(id)]);
  const order = unwrap(res);
  const status = String(order?.orderStatus ?? order?.order_status ?? '');
  if (!BOOKABLE.includes(status)) {
    return { skip: `Skipped: the order is ${status.replace(/_/g, ' ') || 'not confirmed'}. Only confirmed or processing orders are booked.` };
  }
  const live = liveParcels(parcels);
  if (live.length) {
    const awb = shipmentAwb(live[0]);
    return { skip: `Skipped: it already has a parcel${awb ? ` (AWB ${awb})` : ''}.` };
  }
  return { order };
}

/**
 * After an error: is a parcel on the order now? A refusal the server answered (4xx) books nothing; with no answer
 * (lost, timed out, a server failure) the booking may still have been made, so the order is left as unknown until a
 * parcel shows or staff check again, never sent again from here.
 */
export async function outcomeAfterError(id: string, e: any): Promise<Outcome> {
  const status = Number(e?.response?.status) || 0;
  const answered = status >= 400 && status < 500;
  const why = errorText(e, 'no answer came back.');
  try {
    const live = liveParcels(await shipmentsAPI.byOrder(id));
    if (live.length) {
      const awb = shipmentAwb(live[0]);
      return { ok: true, text: `Booked; the parcel is on the order${awb ? ` (AWB ${awb})` : ''}.` };
    }
    if (answered) return { ok: false, text: `Not booked: ${why}` };
  } catch {
    /* not read: unknown below */
  }
  return { ok: false, unknown: true, text: `Unknown: ${why} No parcel is on the order yet. Check again in a minute.` };
}

/**
 * One order booked by the rules above: re-read it, then `send` the booking with the order as it stands now, and answer
 * the booking's courier and AWB, a reason to skip, or an error's real outcome. Never throws. Growcord Ship's Bulk
 * shipment (ready orders) and the bulk bar's Create shipments (components/order/OrderBulkBar, on Orders and on the
 * Growcord Ship board's Pending Orders) book through this one step.
 */
export async function bookOrder(id: string, send: (order: any) => Promise<any>): Promise<Outcome> {
  let checked: { skip: string } | { order: any };
  try {
    checked = await recheckOrder(id);
  } catch (e) {
    return { ok: false, text: `Not sent: the order could not be read again (${errorText(e, 'no answer')}).` };
  }
  if ('skip' in checked) return { ok: false, skip: true, text: checked.skip };
  try {
    const res: any = await send(checked.order);
    const s = res?.shipment ?? res?.data?.shipment ?? {};
    const awb = s.awbCode ?? s.awb_code ?? s.waybill;
    return { ok: true, text: [s.courierName ?? s.courier, awb ? `AWB ${awb}` : 'waiting for its AWB'].filter(Boolean).join(', ') };
  } catch (e) {
    return outcomeAfterError(id, e);
  }
}

/** How a booking picks among the couriers it may use (owner 27 Nov 2026: "cheaper or fast option for each"). */
export type PickBy = 'cheapest' | 'fastest';

/** The offers a booking chooses between. */
export interface Picks<T> {
  /** The lowest price; the faster of two equal prices. */
  cheapest?: T;
  /** The fewest estimated days; the cheaper of two equal. Absent when no offer gives days. */
  fastest?: T;
  /** The second cheapest. */
  next?: T;
}

/** Estimated days to deliver, or null when the courier gave none. */
const daysOf = (r: CourierRate): number | null => {
  const d = Number(r.estimatedDeliveryDays);
  return Number.isFinite(d) && d > 0 ? d : null;
};

/**
 * The cheapest and the fastest of `offers` (already only those the store allows), each read through `rateOf`. An offer
 * with no estimated days is never the fastest. The one pick rule: Ship from a file and Growcord Ship's Bulk shipment.
 */
export function pickOffers<T>(offers: T[] | undefined, rateOf: (o: T) => CourierRate): Picks<T> {
  const list = offers ?? [];
  const byPrice = [...list].sort((a, b) => rateOf(a).rate - rateOf(b).rate || (daysOf(rateOf(a)) ?? 99) - (daysOf(rateOf(b)) ?? 99));
  const dated = list.filter((o) => daysOf(rateOf(o)) !== null)
    .sort((a, b) => daysOf(rateOf(a))! - daysOf(rateOf(b))! || rateOf(a).rate - rateOf(b).rate);
  return { cheapest: byPrice[0], next: byPrice[1], fastest: dated[0] };
}

/** The offer a choice books: the fastest when asked and one gives days, else the cheapest. */
export const pickedBy = <T>(p: Picks<T>, by: PickBy): T | undefined => (by === 'fastest' ? p.fastest ?? p.cheapest : p.cheapest);

/** A box as a picker or a message names it: its name and its box number, "Box 3 (no. 3)". */
export function boxLabel(b: any): string {
  const name = String(b?.name ?? b?.label ?? '').trim();
  const code = String(b?.code ?? '').trim();
  if (!code) return name || 'Box';
  return name ? `${name} (no. ${code})` : `Box no. ${code}`;
}

/** A box from the store's box list as sides in cm and its own weight in kg; null when it has no usable sides. */
export function boxOf(b: any): { length: number; breadth: number; height: number; deadWeightKg: number } | null {
  if (!b) return null;
  const length = Number(b.length ?? b.lengthCm) || 0;
  const breadth = Number(b.breadth ?? b.widthCm) || 0;
  const height = Number(b.height ?? b.heightCm) || 0;
  if (!(length > 0 && breadth > 0 && height > 0)) return null;
  return { length, breadth, height, deadWeightKg: Number(b.weight ?? b.deadWeightKg ?? 0) || 0 };
}
