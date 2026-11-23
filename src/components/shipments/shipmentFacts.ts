/**
 * What a shipment row says, read the same way on every shipment screen (the board, the detail drawer,
 * the order's parcels): its tracking number, courier, provider name, COD amount, shipping charge and
 * the status moves that make sense from where it is. One reading, so the screens never disagree.
 *
 * The rows are ship's ShipmentView (growcord-rs apps/ship views/store.rs) after the legacy aliases
 * (snake and camel keys both present; Money already in rupees).
 */
import { fmtRupees } from '@/lib/money';

/** Board statuses past which a parcel is done: no dispatch action is offered on them. */
export const TERMINAL_STATUSES = ['delivered', 'cancelled', 'returned', 'rto_delivered', 'rto_failed'];

export const isTerminal = (status?: string | null): boolean => TERMINAL_STATUSES.includes(String(status || ''));

const pd = (s: any): Record<string, any> => (s?.providerData ?? s?.provider_data ?? {}) as Record<string, any>;

const str = (v: unknown): string | null => {
  const t = v === null || v === undefined ? '' : String(v).trim();
  return t ? t : null;
};

/**
 * The parcel's tracking number: the shipment's own column, else what its booking stored (a Shiprocket or
 * Delhivery AWB, or the tracking id typed for a manual parcel; 548 of the store's manual parcels carry it
 * only there).
 */
export function shipmentAwb(s: any): string | null {
  const p = pd(s);
  return str(s?.awb) ?? str(p.awb) ?? str(p.shiprocketAWB) ?? str(p.delhiveryWaybill) ?? str(p.manualTrackingId);
}

/** The courier that carries it: the booked courier, else the carrier named for a manual parcel. */
export function shipmentCourier(s: any): string | null {
  const p = pd(s);
  return str(s?.courierName ?? s?.courier_name) ?? str(p.courier) ?? str(p.manualCarrierName);
}

export const providerOf = (s: any): string => String(s?.shippingProvider ?? s?.shipping_provider ?? '');

/** A provider code as words ("growcord_ship" reads "Growcord Ship"), unless the store's provider list names it. */
export function providerLabel(code: string | null | undefined, names?: Record<string, string>): string {
  const c = String(code || '').trim();
  if (!c) return 'Not set';
  if (names?.[c]) return names[c];
  return c.split(/[_\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** What the courier collects at the door on THIS parcel (rupees), or null for a prepaid parcel. */
export function shipmentCod(s: any): number | null {
  const p = pd(s);
  const n = num(s?.codSent ?? s?.cod_sent) ?? num(p.cod_amount ?? p.codAmount);
  return n !== null && n > 0 ? n : null;
}

export type ChargeBasis = 'gst_included' | 'quoted' | 'entered';

export interface ShipCharge {
  /** What the store pays for the parcel, rupees. */
  total: number;
  freight: number | null;
  cod: number | null;
  gst: number | null;
  basis: ChargeBasis | string;
}

/** The parcel's shipping charge as the server read it from its quote; null when none is recorded. */
export function shipmentCharge(s: any): ShipCharge | null {
  const total = num(s?.shipCharge ?? s?.ship_charge);
  if (total === null) return null;
  return {
    total,
    freight: num(s?.shipChargeFreight ?? s?.ship_charge_freight),
    cod: num(s?.shipChargeCod ?? s?.ship_charge_cod),
    gst: num(s?.shipChargeGst ?? s?.ship_charge_gst),
    basis: String(s?.shipChargeBasis ?? s?.ship_charge_basis ?? ''),
  };
}

/** Where a charge comes from, in words. */
export function chargeBasisText(basis: string | null | undefined): string {
  switch (basis) {
    case 'gst_included': return 'Growcord Ship price, GST included';
    case 'quoted': return 'Courier quote at booking; the quote does not say whether GST is included';
    case 'entered': return 'Entered by staff';
    default: return '';
  }
}

/** One line: "₹96.40 incl. ₹14.70 GST" / "₹87.72 (GST not stated)" / "₹120.00 entered". */
export function chargeLine(c: ShipCharge | null): string {
  if (!c) return 'Not recorded';
  if (c.basis === 'gst_included' && c.gst !== null) return `${fmtRupees(c.total)} incl. ${fmtRupees(c.gst)} GST`;
  if (c.basis === 'quoted') return `${fmtRupees(c.total)} (GST not stated)`;
  return fmtRupees(c.total);
}

/** The history of a staff-entered charge (who set which amount, when, why), newest first. */
export function chargeHistory(s: any): Array<{ at: string | null; by: string | null; from: number | null; to: number | null; reason: string | null }> {
  const q = pd(s).quote;
  const list = Array.isArray(q?.history) ? q.history : [];
  return list.map((h: any) => ({ at: str(h?.at), by: str(h?.by), from: num(h?.from), to: num(h?.to), reason: str(h?.reason) })).reverse();
}

/**
 * Whether staff may state or correct this parcel's charge: a manual parcel always (its charge is what was
 * paid to the carrier), a booked parcel only when its booking stored no quote. A courier's own quote is never
 * overwritten (a different bill is a weight claim).
 */
export function chargeEditable(s: any): boolean {
  const c = shipmentCharge(s);
  return providerOf(s) === 'manual' || !c || c.basis === 'entered';
}

/** A parcel the carrier has documents for: a booked (not manual) parcel with an AWB, still on its way. */
export function hasCarrierDocuments(s: any): boolean {
  return providerOf(s) !== 'manual' && !!shipmentAwb(s) && !isTerminal(s?.status);
}

/**
 * The status moves that make sense from where a parcel is (the board's words). A booked parcel's courier
 * reports most of these itself; a manual parcel moves only when staff move it, so its next step matters most.
 */
const NEXT: Record<string, string[]> = {
  pending: ['picked_up', 'in_transit', 'cancelled'],
  pickup_scheduled: ['picked_up', 'in_transit', 'cancelled'],
  picked_up: ['in_transit', 'out_for_delivery', 'delivered', 'rto_in_transit'],
  in_transit: ['out_for_delivery', 'delivered', 'ndr_failed_delivery', 'rto_in_transit'],
  out_for_delivery: ['delivered', 'ndr_failed_delivery', 'rto_in_transit'],
  ndr_failed_delivery: ['out_for_delivery', 'delivered', 'rto_in_transit'],
  rto_in_transit: ['rto_delivered', 'rto_failed'],
};

export function nextStatuses(status: string | null | undefined): string[] {
  return NEXT[String(status || '')] ?? [];
}

/** The one step a person most likely takes next on this parcel, in words (null when the courier drives it). */
export function nextStep(s: any): string | null {
  const status = String(s?.status || '');
  const manual = providerOf(s) === 'manual';
  if (status === 'pending' && !manual && !s?.pickup?.scheduledDate) return 'Schedule the pickup';
  if (status === 'ndr_failed_delivery') return 'Answer the failed delivery: re-attempt, new phone, or return';
  if (manual && ['pending', 'picked_up', 'in_transit', 'out_for_delivery'].includes(status)) return 'Mark delivered when the carrier confirms';
  if (manual && status === 'rto_in_transit') return 'Mark returned when it reaches you';
  return null;
}
