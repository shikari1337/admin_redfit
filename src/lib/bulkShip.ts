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
 * Answers the reason to skip it (with the order read, to name it), or the order as it stands now.
 */
export async function recheckOrder(id: string): Promise<{ skip: string; order?: any } | { order: any }> {
  const [res, parcels] = await Promise.all([api.get(`/orders/${id}`), shipmentsAPI.byOrder(id)]);
  const order = unwrap(res);
  const status = String(order?.orderStatus ?? order?.order_status ?? '');
  if (!BOOKABLE.includes(status)) {
    return { skip: `Skipped: the order is ${status.replace(/_/g, ' ') || 'not confirmed'}. Only confirmed or processing orders are booked.`, order };
  }
  const live = liveParcels(parcels);
  if (live.length) {
    const awb = shipmentAwb(live[0]);
    return { skip: `Skipped: it already has a parcel${awb ? ` (AWB ${awb})` : ''}.`, order };
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
 * Growcord Ship board's Pending Orders) book through this one step. `check` may name a reason the order as it stands
 * now cannot be sent (the bulk bar: no line to weigh); it is then skipped with that reason, never sent.
 */
export async function bookOrder(id: string, send: (order: any) => Promise<any>, check?: (order: any) => string | null): Promise<Outcome> {
  let checked: { skip: string } | { order: any };
  try {
    checked = await recheckOrder(id);
  } catch (e) {
    return { ok: false, text: `Not sent: the order could not be read again (${errorText(e, 'no answer')}).` };
  }
  if ('skip' in checked) return { ok: false, skip: true, text: checked.skip };
  const why = check?.(checked.order) ?? null;
  if (why) return { ok: false, skip: true, text: `Skipped: ${why}` };
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

/**
 * The box a booking starts on: the store's default box among the boxes in use, else the first box in use (the create
 * window's rule, components/order/ShipmentCreationModal). Null when the store has no box in use.
 */
export function defaultBoxOf(boxes: any[] | null | undefined): any | null {
  const inUse = (boxes ?? []).filter((b) => b && (b.isActive ?? b.is_active) !== false);
  return inUse.find((b) => b.isDefault ?? b.is_default) ?? inUse[0] ?? null;
}

/** One unit of an order line in kg: the product's weight, 0.5 kg when it has none. */
export const itemUnitWeightKg = (item?: { weight_kg?: number | string | null; weightKg?: number | string | null } | null): number =>
  Number(item?.weight_kg ?? item?.weightKg ?? 0.5) || 0.5;

/**
 * An order line's identity exactly as Ship keys it (`line_key`, ship domain/fulfillment.rs:17-26): its SKU, else its
 * product name (`product_name`, `productName`, then `name`). A line with no SKU still has a key.
 */
export const lineKeyOf = (item: any): string =>
  String(item?.sku || item?.product_name || item?.productName || item?.name || '').trim();

/**
 * The units still to ship of each line, by that key, from the order's `fulfillment.lines` (Ship names each line by its
 * SKU, else its product name); undefined when the order carries none. The one reading for the create window's
 * line limits (the order page, the shipments board) and the weighing below.
 */
export function remainingByLineKey(order: any): Record<string, number> | undefined {
  const lines: any[] | null = Array.isArray(order?.fulfillment?.lines) ? order.fulfillment.lines : null;
  return lines ? Object.fromEntries(lines.map((l) => [String(l?.sku || l?.name || '').trim(), Number(l?.remaining) || 0])) : undefined;
}

/**
 * An order's parcel weight in kg: each unit at its product's weight (itemUnitWeightKg) plus the box's own weight
 * (`tareKg`), to two places, at least 0.05 kg. With `remaining`, only the units still to ship (remainingByLineKey,
 * each item found by lineKeyOf) count. 0 when the order has no line to weigh. The one weighing of Growcord Ship's Bulk
 * shipment, Ship from a file and the bulk bar's Create shipments.
 */
export function orderWeightKg(order: any, tareKg = 0, opts: { remaining?: boolean } = {}): number {
  const items: any[] = Array.isArray(order?.items) ? order.items : [];
  const left = opts.remaining ? remainingByLineKey(order) : undefined;
  const useLeft = !!left && Object.keys(left).length > 0;
  const kg = items.reduce((s, it) => {
    const qty = useLeft ? (left![lineKeyOf(it)] ?? 0) : (Number(it?.quantity) || 1);
    return s + itemUnitWeightKg(it) * qty;
  }, 0);
  return kg > 0 ? Math.max(Math.round((kg + tareKg) * 100) / 100, 0.05) : 0;
}
