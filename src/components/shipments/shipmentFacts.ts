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
  if (status === 'ndr_failed_delivery') {
    if (!needsNdrAnswer(s)) return null;
    if (manual) return 'Call your carrier about the failed delivery, then move the parcel';
    const acts = ndrActionsFor(s);
    if (acts.length === 0) return 'This courier takes no answers online: call the courier, then set the status';
    return `Answer the failed delivery: ${joinWords(acts.map((a) => NDR_ACTION_WORDS[a]))}`;
  }
  if (manual && ['pending', 'picked_up', 'in_transit', 'out_for_delivery'].includes(status)) return 'Mark delivered when the carrier confirms';
  if (manual && status === 'rto_in_transit') return 'Mark returned when it reaches you';
  return null;
}

const joinWords = (w: string[]): string => (w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`);

/* ── Failed delivery (NDR) ─────────────────────────────────────────────────────────────────── */

/** The answers a courier may take on a failed delivery (ship `ndr_actions`). */
export type NdrAction = 'reattempt' | 'reschedule' | 'change_phone' | 'change_address' | 'rto';

/** Every answer, in the order a person weighs them: deliver again first, send back last. */
export const NDR_ACTIONS: NdrAction[] = ['reattempt', 'reschedule', 'change_phone', 'change_address', 'rto'];

/** The three answers offered before the server said what each carrier takes: kept whenever it does not say. */
export const NDR_DEFAULT_ACTIONS: NdrAction[] = ['reattempt', 'change_phone', 'rto'];

/** Each answer in a few words, lower case, for sentences. */
export const NDR_ACTION_WORDS: Record<NdrAction, string> = {
  reattempt: 'try again',
  reschedule: 'another day',
  change_phone: 'new phone',
  change_address: 'new address',
  rto: 'return',
};

/** The answers this carrier takes, as the server lists them (`ndr_actions`); null when the server does not say. */
export function ndrActionsOf(s: any): NdrAction[] | null {
  const raw = s?.ndrActions ?? s?.ndr_actions;
  if (!Array.isArray(raw)) return null;
  const set = new Set(raw.map((x: unknown) => String(x ?? '').trim().toLowerCase()));
  return NDR_ACTIONS.filter((a) => set.has(a));
}

/**
 * The answers to offer on this parcel now: only on a failed delivery, never on a manual parcel (its carrier is called
 * directly), and only what the carrier takes. When the server does not list them, today's three.
 */
export function ndrActionsFor(s: any): NdrAction[] {
  if (String(s?.status || '') !== 'ndr_failed_delivery' || providerOf(s) === 'manual') return [];
  // Today's three answers always stay on the parcel (owner, 24 Nov: never remove a control staff use); the carrier's
  // own list adds what it takes beyond them.
  const listed = new Set<NdrAction>([...NDR_DEFAULT_ACTIONS, ...(ndrActionsOf(s) ?? [])]);
  return NDR_ACTIONS.filter((a) => listed.has(a));
}

/**
 * Why this answer cannot reach the courier, when the carrier's own list says it does not take it; null when it can.
 * A new phone is always saved and goes with a re-attempt when the carrier has no phone change, so it is never refused.
 */
export function ndrRefusal(s: any, action: NdrAction): string | null {
  const listed = ndrActionsOf(s);
  if (!listed || listed.includes(action) || action === 'change_phone') return null;
  return action === 'rto'
    ? 'This courier takes no return request online: ask for it on the courier\'s own panel.'
    : 'This courier takes no re-attempt online: ask for it on the courier\'s own panel.';
}

const text = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? str(v) : null);

export interface NdrAttempt { attempt: number | null; reason: string | null; at: string | null; action: string | null }

export interface NdrDetails {
  reason: string | null;
  attempts: number | null;
  raisedAt: string | null;
  /** Set once the failed delivery is answered and closed. */
  resolvedAt: string | null;
  actionTaken: string | null;
  lastCheckedAt: string | null;
  history: NdrAttempt[];
}

/** The failed-delivery record (`ndr_details`), read the same for every carrier; null when there is none. */
export function ndrDetailsOf(s: any): NdrDetails | null {
  const d = s?.ndrDetails ?? s?.ndr_details;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const hist = Array.isArray(d.history) ? d.history : [];
  return {
    reason: text(d.reason),
    attempts: num(d.attempts),
    raisedAt: text(d.raisedAt ?? d.raised_at),
    resolvedAt: text(d.resolvedAt ?? d.resolved_at),
    actionTaken: text(d.actionTaken ?? d.action_taken),
    lastCheckedAt: text(d.lastCheckedAt ?? d.last_checked_at),
    history: hist.map((h: any) => (typeof h === 'string'
      ? { attempt: null, reason: str(h), at: null, action: null }
      : {
        attempt: num(h?.attempt ?? h?.attempts),
        reason: text(h?.reason ?? h?.remarks),
        at: text(h?.raisedAt ?? h?.raised_at ?? h?.at ?? h?.date),
        action: text(h?.action ?? h?.actionTaken ?? h?.action_taken),
      })),
  };
}

/** A failed delivery still waiting for an answer: the status says so and the record is not closed. */
export function needsNdrAnswer(s: any): boolean {
  return String(s?.status || '') === 'ndr_failed_delivery' && !ndrDetailsOf(s)?.resolvedAt;
}

export interface NdrCustomerAnswer {
  action: string | null;
  phone: string | null;
  address: string | null;
  landmark: string | null;
  note: string | null;
  at: string | null;
  /** Whether the courier was told when the customer answered; null when not recorded. */
  carrierNotified: boolean | null;
}

/** What the customer answered on the delivery-help link (`ndr_customer_answer`, kept as `provider_data.ndr_customer_request`). */
export function ndrCustomerAnswerOf(s: any): NdrCustomerAnswer | null {
  const raw = s?.ndrCustomerAnswer ?? s?.ndr_customer_answer ?? pd(s).ndr_customer_request ?? pd(s).ndrCustomerRequest;
  if (typeof raw === 'string') return str(raw) ? { action: null, phone: null, address: null, landmark: null, note: str(raw), at: null, carrierNotified: null } : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const told = raw.carrierNotified ?? raw.carrier_notified;
  return {
    action: text(raw.action),
    phone: text(raw.phone),
    address: text(raw.address),
    landmark: text(raw.landmark),
    note: text(raw.note),
    at: text(raw.at ?? raw.answeredAt ?? raw.answered_at),
    carrierNotified: typeof told === 'boolean' ? told : null,
  };
}

/** The customer's answer in words: "New phone 98...", "New address: ...", "Try again". */
export function customerAnswerLine(a: NdrCustomerAnswer): string {
  const bits: string[] = [];
  if (a.action === 'change_phone') bits.push(a.phone ? `New phone ${a.phone}` : 'New phone');
  else if (a.action === 'change_address') bits.push(a.address ? `New address: ${a.address}${a.landmark ? ` (landmark: ${a.landmark})` : ''}` : 'New address');
  else if (a.action === 'reattempt') bits.push('Try again');
  else if (a.action) bits.push(words(a.action));
  if (a.note) bits.push(a.note);
  return bits.join('; ') || 'Answered';
}

/** The delivery phone staff gave the courier on a failed delivery (`provider_data.ndr_phone`). */
export function ndrPhoneOf(s: any): string | null {
  const p = pd(s);
  return text(p.ndr_phone ?? p.ndrPhone);
}

/** What an NDR call came to, in the words the person reads: told the courier, or only saved and why. */
export function ndrOutcome(res: any, action: NdrAction): { notified: boolean; text: string; detail: string | null } {
  const r = res && typeof res === 'object' && !Array.isArray(res) ? res : {};
  const flag = r.carrierNotified ?? r.carrier_notified;
  const ca = r.carrierAction ?? r.carrier_action;
  const caObj = ca && typeof ca === 'object' && !Array.isArray(ca) ? ca : null;
  // Before `carrierNotified`, the re-attempt and return routes answered only when the courier said yes.
  const notified = typeof flag === 'boolean' ? flag : (action === 'reattempt' || action === 'rto');
  const sent = text(caObj ? (caObj.action ?? caObj.name) : ca);
  const detail = sent ? `Courier action: ${sent}` : null;
  if (notified) return { notified, text: 'Sent to the courier', detail };
  const reason = text(r.carrierReason ?? r.carrier_reason ?? r.carrierNote ?? r.carrier_note ?? r.carrierError ?? r.carrier_error
    ?? caObj?.reason ?? caObj?.message ?? caObj?.note ?? r.reason ?? r.note);
  return { notified, text: `Saved, the courier was not told: ${reason || 'the server gave no reason'}`, detail };
}

/* ── Context the board carries ─────────────────────────────────────────────────────────────── */

const words = (code: string): string => code.split(/[_\s-]+/).filter(Boolean).map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

/** The courier's latest words on the parcel (`tracking_status`) and when it said them (`last_tracking_update`). */
export function courierUpdate(s: any): { words: string; at: string | null } | null {
  const w = text(s?.trackingStatus ?? s?.tracking_status);
  return w ? { words: w, at: text(s?.lastTrackingUpdate ?? s?.last_tracking_update) } : null;
}

export interface ShipmentTag { key: string; label: string; title: string; tone: 'info' | 'warn' | 'bad' | 'neutral' }

/** What sets a parcel apart, as small tags: a return pickup, international, dangerous goods, on hold, several packages. */
export function shipmentTags(s: any): ShipmentTag[] {
  const tags: ShipmentTag[] = [];
  const kind = text(s?.shipmentKind ?? s?.shipment_kind);
  if (kind && kind !== 'forward') {
    tags.push({ key: 'kind', label: kind === 'return_pickup' ? 'Return pickup' : words(kind), title: 'The courier collects this parcel from the customer and brings it back to you', tone: 'info' });
  }
  const dest = text(s?.destinationCountry ?? s?.destination_country);
  const origin = text(s?.originCountry ?? s?.origin_country);
  if (text(s?.kind) === 'international' || (dest && origin && dest.toUpperCase() !== origin.toUpperCase())) {
    tags.push({ key: 'intl', label: dest ? `International, to ${dest.toUpperCase()}` : 'International', title: 'Crosses a border: customs papers travel with it', tone: 'info' });
  }
  if (s?.containsDg === true || s?.contains_dg === true) {
    tags.push({ key: 'dg', label: 'Dangerous goods', title: 'Declared as dangerous goods: only couriers that carry them may take it', tone: 'warn' });
  }
  const hold = text(s?.hold);
  if (hold && hold.toLowerCase() !== 'none') {
    tags.push({ key: 'hold', label: 'On hold', title: `On hold: ${words(hold)}`, tone: 'bad' });
  }
  const n = num(s?.packageCount ?? s?.package_count);
  if (n !== null && n > 1) tags.push({ key: 'pkgs', label: `${n} packages`, title: `This shipment travels as ${n} packages`, tone: 'neutral' });
  return tags;
}

/** Whether a board row matches a search typed on the page (used only when the server cannot search). */
export function shipmentMatches(s: any, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  const orders: any[] = Array.isArray(s?.orders) ? s.orders : [];
  const hay = [
    shipmentAwb(s), s?.shipmentNumber ?? s?.shipment_number, ndrPhoneOf(s),
    ...orders.flatMap((o) => (o && typeof o === 'object' ? [o.orderId ?? o.order_id, o.customerName ?? o.customer_name] : [o])),
  ].map((v) => (v === null || v === undefined ? '' : String(v)));
  return hay.some((h) => h.toLowerCase().includes(needle) || (digits.length >= 4 && h.replace(/\D/g, '').includes(digits)));
}
