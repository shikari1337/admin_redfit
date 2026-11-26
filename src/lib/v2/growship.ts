/**
 * Growcord Ship, as this store sees it through the shipper's own door (`/api/v2/ship/*`, growcord-rs
 * `apps/ship/core/src/api/ship_shipper.rs`). A staff session holding the store's own `shipments.read`
 * reads it and `shipments.manage` quotes and books (`needs`, ship_shipper.rs:269); the store must have
 * Growcord Ship switched on, else the door answers a typed `not_enabled` refusal that the screens show.
 *
 * Every answer is an `Owner` view (`views/door.rs`): sell side only. Money fields (`sell_price`, `gst`,
 * `sell_with_gst`, `final_sell`, `cod_amount`, a wallet leg's `amount`) arrive in rupees through `v2call`;
 * the opaque JSON parts (`charges[].amount_minor`, `charge_totals`, a rate card's `pricing`) stay in paise.
 *
 * The platform wallet (`/api/v2/platform/wallet`, walletAPI in services/api.ts) is the money Growcord Ship
 * freight comes off (`domain/booking.rs:494`, category `shipping`). Ship keeps its own copy of each
 * movement (`ship_wallet_ledger`) carrying the AWB and the platform transaction id (`platform_ref`), which
 * is how a wallet line is matched to its parcel here.
 */
import { v2call } from './http';
import { toMoney } from './money';

const SHIP = '/api/v2/ship';
const seg = (s: string) => encodeURIComponent(s);

/* ── shapes ─────────────────────────────────────────────────────────────── */

/** One sell-side charge line on a parcel (`shipperCharge`, customer_view.rs:210). Paise. */
export interface GsCharge {
  id?: string;
  stage?: string | null;
  kind?: string | null;
  label?: string | null;
  amount_minor?: number | null;
  basis?: string | null;
  reference?: string | null;
  created_at?: string | null;
}

/** One line of a parcel's timeline in the shipper's words (`shipperEvent`, customer_view.rs). */
export interface GsEvent {
  id?: string;
  awb?: string | null;
  status?: string | null;
  board_status?: string | null;
  label?: string | null;
  description?: string | null;
  location?: string | null;
  occurred_at?: string | null;
  by?: string | null;
  courier_status?: string | null;
}

/** A Growcord Ship parcel (`ConsignmentOwnerView`). Money in rupees. */
export interface GsConsignment {
  id: string;
  consignment_number?: string | null;
  shipper_reference?: string | null;
  kind?: string | null;
  service_mode?: string | null;
  direction?: string | null;
  consignee?: Record<string, any> | null;
  origin_pincode?: string | null;
  destination_pincode?: string | null;
  zone_code?: string | null;
  payment_mode?: string | null;
  cod_amount?: number | null;
  cod_collected?: number | null;
  sell_price?: number | null;
  gst?: number | null;
  sell_with_gst?: number | null;
  final_sell?: number | null;
  courier_id?: string | null;
  awb?: string | null;
  status?: string | null;
  board_status?: string | null;
  chargeable_weight_g?: number | null;
  dead_weight_g?: number | null;
  volumetric_weight_g?: number | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  edd_promised?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  charges?: GsCharge[] | null;
  charge_totals?: Record<string, number> | null;
  events?: GsEvent[] | null;
}

/** A page of parcels: `v2call` hands the door's `{items, total, limit, offset}` back as an array carrying `total`. */
export interface GsPage<T> { items: T[]; total: number }

const pageOf = <T>(d: unknown): GsPage<T> => {
  if (Array.isArray(d)) {
    const total = Number((d as unknown as { total?: unknown }).total);
    return { items: Array.from(d) as T[], total: Number.isFinite(total) ? total : d.length };
  }
  const o = (d ?? {}) as { items?: unknown; total?: unknown };
  const items = Array.isArray(o.items) ? (o.items as T[]) : [];
  const total = Number(o.total);
  return { items, total: Number.isFinite(total) ? total : items.length };
};

/** One courier offer of a quote (`OptionOwnerView`). Money in rupees; `sell_lines[].amount_minor` in paise. */
export interface GsOption {
  courier_id?: string | null;
  courier_code?: string | null;
  courier_name?: string | null;
  service_code?: string | null;
  service_name?: string | null;
  mode?: string | null;
  zone_code?: string | null;
  chargeable_weight_g?: number | null;
  volumetric_weight_g?: number | null;
  dead_weight_g?: number | null;
  sell?: number | null;
  gst?: number | null;
  sell_with_gst?: number | null;
  tat_days?: number | null;
  sell_lines?: Array<{ kind?: string; label?: string; amount_minor?: number; basis?: string | null }> | null;
  rate_source?: string | null;
  offer_id?: string | null;
}

export interface GsQuote {
  quote_id?: string | null;
  zone_code?: string | null;
  chargeable_weight_g?: number | null;
  options: GsOption[];
  rejected?: Array<{ courier_code?: string; service_code?: string; reason?: string }> | null;
  not_serviceable?: Array<{ courier_code?: string; service_code?: string; reason?: string }> | null;
  allocation_reason?: string | null;
  empty?: boolean;
  empty_reason?: string | null;
}

export interface GsRateCard {
  id: string;
  name?: string | null;
  plan_code?: string | null;
  currency?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  prices_include_gst?: boolean | null;
  /** `tariff` or `per_parcel`. */
  pricing?: string | null;
  /** In words: "Fixed tariff" or "Priced per parcel at booking". */
  basis?: string | null;
}

export interface GsLocation {
  id: string;
  code?: string | null;
  label?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  is_active?: boolean | null;
}

/** The store's Growcord Ship account (`MeOwnerView`, the parts the screens read). */
export interface GsAccount {
  shipper?: { name?: string | null; code?: string | null; status?: string | null; kyc_status?: string | null; billing_mode?: string | null; plan_code?: string | null; cod_cycle?: string | null } | null;
  locations?: GsLocation[] | null;
  plan?: { code?: string | null; billing_mode?: string | null; cod_cycle?: string | null; rate_cards?: GsRateCard[] | null } | null;
  access?: { provider_enabled?: boolean | null } | null;
}

/** One of Ship's own wallet movements (`WalletLegOwnerView`): the AWB and the platform transaction id. */
export interface GsWalletLeg {
  id: string;
  leg?: string | null;
  amount?: number | null;
  awb?: string | null;
  consignment_id?: string | null;
  reference?: string | null;
  reason?: string | null;
  platform_ref?: string | null;
  created_at?: string | null;
}

/** A bulk sheet run or a past job (`BulkRunOwnerView`, `BulkJobOwnerView`). */
export interface GsBulkRun {
  job_id?: string | null;
  id?: string | null;
  dry_run?: boolean | null;
  is_dry_run?: boolean | null;
  filename?: string | null;
  total?: number | null;
  ok?: number | null;
  failed?: number | null;
  skipped?: number | null;
  status?: string | null;
  detail?: unknown;
  rows?: Array<Record<string, any>> | null;
  created_at?: string | null;
  /** Set when the run is over; a job without it is still running (or was cut off). */
  finished_at?: string | null;
}

/* ── the door ───────────────────────────────────────────────────────────── */

export const growshipAPI = {
  /** The account: shipper, pickup addresses, plan with its rate cards, whether booking is switched on. */
  account: (): Promise<GsAccount> => v2call<GsAccount>('GET', `${SHIP}/account`),

  /** Parcels, newest first. `from`/`to` are booking days (YYYY-MM-DD); `limit` up to 200. */
  consignments: async (f: {
    status?: string; board_status?: string; awb?: string; q?: string; from?: string; to?: string;
    open?: boolean; limit?: number; offset?: number;
  } = {}): Promise<GsPage<GsConsignment>> => pageOf<GsConsignment>(await v2call('GET', `${SHIP}/consignments`, { params: f })),

  /** One parcel whole: its charge lines, charge totals and timeline. */
  consignment: (id: string): Promise<GsConsignment> => v2call<GsConsignment>('GET', `${SHIP}/consignments/${seg(id)}`),

  /** Prices for a lane: one parcel of `weight_g` grams and `length_mm` x `breadth_mm` x `height_mm`. Needs shipments.manage. */
  quote: async (q: {
    origin_pincode: string; destination_pincode: string; weight_g: number;
    length_mm?: number; breadth_mm?: number; height_mm?: number;
    payment_mode: 'prepaid' | 'cod'; cod_amount?: number; declared_value?: number;
  }): Promise<GsQuote> => {
    const piece: Record<string, number> = { dead_weight_g: Math.round(q.weight_g) };
    if (q.length_mm) piece.length_mm = Math.round(q.length_mm);
    if (q.breadth_mm) piece.breadth_mm = Math.round(q.breadth_mm);
    if (q.height_mm) piece.height_mm = Math.round(q.height_mm);
    const body: Record<string, unknown> = {
      origin_pincode: q.origin_pincode,
      destination_pincode: q.destination_pincode,
      pieces: [piece],
      payment_mode: q.payment_mode,
      persist: false,
    };
    if (q.payment_mode === 'cod' && q.cod_amount && q.cod_amount > 0) body.cod_amount = toMoney(q.cod_amount);
    if (q.declared_value && q.declared_value > 0) body.declared_value = toMoney(q.declared_value);
    const d = await v2call<any>('POST', `${SHIP}/quote`, { data: body });
    return { ...(d ?? {}), options: Array.isArray(d?.options) ? d.options : [] };
  },

  /** The rate cards this account is priced on. */
  rateCards: async (): Promise<GsRateCard[]> => {
    const d = await v2call<any>('GET', `${SHIP}/rate-cards`);
    return Array.isArray(d) ? d : [];
  },

  /** Pickup addresses on Growcord Ship. */
  locations: async (): Promise<GsLocation[]> => {
    const d = await v2call<any>('GET', `${SHIP}/locations`);
    return Array.isArray(d) ? d : [];
  },

  /**
   * Ship's own record of the wallet movements, newest first (up to 200): each carries the AWB and the
   * platform wallet transaction it was taken through (`platform_ref`).
   */
  walletLegs: async (limit = 200): Promise<GsWalletLeg[]> => {
    const d = await v2call<any>('GET', `${SHIP}/wallet`, { params: { limit } });
    return Array.isArray(d?.legs) ? d.legs : [];
  },

  /**
   * A sheet of parcels as CSV text. A dry run (the default) prices and checks every row and books nothing. A real
   * run books row after row on the server in one call, so it is given ten minutes; when the answer is lost anyway,
   * the job list (`bulkJobs`) says what was booked. Never send the same sheet for real twice.
   */
  bulkRun: (b: { csv: string; filename?: string | null; dryRun: boolean; pickupLocationId?: string | null }): Promise<GsBulkRun> =>
    v2call<GsBulkRun>('POST', `${SHIP}/bulk`, {
      data: {
        csv: b.csv,
        ...(b.filename ? { filename: b.filename } : {}),
        dry_run: b.dryRun,
        ...(b.pickupLocationId ? { pickup_location_id: b.pickupLocationId } : {}),
      },
      ...(b.dryRun ? {} : { timeout: 10 * 60_000 }),
    }),

  /** Every sheet run so far, real and dry, newest first. */
  bulkJobs: async (): Promise<GsBulkRun[]> => {
    const d = await v2call<any>('GET', `${SHIP}/bulk`);
    return Array.isArray(d) ? d : [];
  },

  /** One sheet run with its rows. */
  bulkJob: (id: string): Promise<GsBulkRun> => v2call<GsBulkRun>('GET', `${SHIP}/bulk/${seg(id)}`),
};

/** The header names Ship's sheet reader takes (`domain/bulk.rs`), for the blank template. */
export const GS_SHEET_HEADERS = [
  'To Name', 'To Phone', 'To Address', 'To City', 'To State', 'To Pincode',
  'Weight (g)', 'Length', 'Breadth', 'Height', 'Pieces',
  'Payment Mode', 'COD Amount', 'Declared Value', 'Invoice Number', 'Contents', 'Kind',
];

/* ── reading a parcel ───────────────────────────────────────────────────── */

/** The store's shipment row to its Growcord Ship parcel id (the booking stores it as `carrier_shipment_id`). */
export function consignmentIdOf(shipment: any): string | null {
  const pd = shipment?.providerData ?? shipment?.provider_data ?? {};
  const id = pd?.carrier_shipment_id ?? pd?.carrierShipmentId ?? null;
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** A Growcord Ship parcel for a store shipment: by its stored id, else by its AWB. Null when none is found. */
export async function consignmentForShipment(shipment: any, awb: string | null): Promise<GsConsignment | null> {
  const id = consignmentIdOf(shipment);
  if (id) return growshipAPI.consignment(id);
  if (!awb) return null;
  const found = await growshipAPI.consignments({ awb, limit: 1 });
  return found.items[0]?.id ? growshipAPI.consignment(found.items[0].id) : null;
}

/** Paise to rupees for the opaque charge parts. */
export const paiseToRupees = (p: unknown): number | null => {
  const n = Number(p);
  return Number.isFinite(n) ? n / 100 : null;
};

/** The parts of a parcel's charges, in rupees, from its sell-side lines (null when it has none of that part). */
export interface GsChargeSplit {
  freight: number | null;
  cod: number | null;
  rto: number | null;
  gst: number | null;
  other: number | null;
  lines: number;
}

const isRto = (c: GsCharge) => /\b(rto|return|reverse)\b/i.test(`${c.kind ?? ''} ${c.label ?? ''}`.replace(/_/g, ' '));

/** Freight, COD fee, return (RTO) and GST from a parcel's charge lines; everything else is "other". */
export function chargeSplit(charges: GsCharge[] | null | undefined): GsChargeSplit {
  const out: GsChargeSplit = { freight: null, cod: null, rto: null, gst: null, other: null, lines: 0 };
  const add = (k: keyof Omit<GsChargeSplit, 'lines'>, minor: number) => {
    out[k] = Math.round(((out[k] ?? 0) + minor / 100) * 100) / 100;
  };
  for (const c of charges ?? []) {
    const minor = Number(c.amount_minor);
    if (!Number.isFinite(minor)) continue;
    out.lines += 1;
    const kind = String(c.kind ?? '').toLowerCase();
    if (isRto(c)) add('rto', minor);
    else if (kind === 'freight' || kind === 'fuel') add('freight', minor);
    else if (kind === 'cod_fee' || kind === 'cod') add('cod', minor);
    else if (kind === 'gst') add('gst', minor);
    else add('other', minor);
  }
  return out;
}

/** Cancelled, by the store or by Growcord Ship. */
export const isCancelled = (c: GsConsignment): boolean => c.status === 'cancelled' || !!c.cancelled_at;

/** Booked, but no courier took it: nothing was charged (`booking.rs`, pending_courier). */
export const neverCharged = (c: GsConsignment): boolean => c.status === 'pending_courier';

/** The sum of a parcel's adjustment lines in rupees, null when its lines are not read or it has none. */
export function adjustmentsOf(c: GsConsignment | undefined): number | null {
  if (!c || !Array.isArray(c.charges)) return null;
  const lines = c.charges.filter((l) => l.stage === 'adjustment');
  if (!lines.length) return null;
  return Math.round(lines.reduce((s, l) => s + (Number(l.amount_minor) || 0), 0)) / 100;
}

/**
 * The cancellation fee in rupees (0 when none was charged), from the parcel's lines; null when its lines are not
 * read. A cancelled parcel's freight goes back to the wallet less this fee (`booking.rs` cancel).
 */
export function cancellationFee(c: GsConsignment | undefined): number | null {
  if (!c || !Array.isArray(c.charges)) return null;
  const minor = c.charges
    .filter((l) => l.stage === 'adjustment' && /cancel/i.test(String(l.label ?? '')))
    .reduce((s, l) => s + (Number(l.amount_minor) || 0), 0);
  return Math.round(minor) / 100;
}

/**
 * What the parcel finally costs the store, in rupees. Cancelled: only the cancellation fee. Never taken by a
 * courier: nothing. Otherwise Growcord Ship's own final amount, else the booking plus any adjustment lines.
 * `whole` is the parcel read with its lines; without it a cancelled parcel's fee is not known (null).
 */
export function finalAmount(c: GsConsignment, whole?: GsConsignment): number | null {
  if (neverCharged(c)) return 0;
  if (isCancelled(c)) return cancellationFee(whole ?? c);
  if (c.final_sell != null) return c.final_sell;
  if (c.sell_with_gst == null) return null;
  const adj = adjustmentsOf(whole ?? c);
  return Math.round((c.sell_with_gst + (adj ?? 0)) * 100) / 100;
}

/** A charge stage in words. */
export const STAGE_LABEL: Record<string, string> = {
  estimated: 'At booking',
  adjustment: 'Adjustment',
  final: 'Final',
  actual: 'Billed by the courier',
};

/** A parcel status in words, from Ship's own status code. */
export function gsStatusText(s: string | null | undefined): string {
  const t = String(s ?? '').trim();
  if (!t) return 'Not known';
  return t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Grams in words ("1.25 kg", "450 g"). */
export function gramsText(g: number | null | undefined): string {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg` : `${Math.round(n)} g`;
}

/** The refusal the door gives when Growcord Ship is not switched on for this store. */
export function isNotEnabled(e: any): boolean {
  const code = String(e?.response?.data?.code ?? e?.response?.data?.error?.code ?? '');
  return /not_enabled|provider_disabled/i.test(code);
}

/* ── bookings no courier took ───────────────────────────────────────────── */

/** The words for a booking no courier took: Growcord Ship gave the money back at once; it is not a parcel. */
export const NOT_TAKEN_TEXT = 'Not booked by the courier, refunded';

/** Growcord Ship's bookings no courier took (status pending_courier), newest first. One read. */
export async function notTakenBookings(limit = 100): Promise<GsConsignment[]> {
  return (await growshipAPI.consignments({ status: 'pending_courier', limit })).items;
}

/** Which store shipment rows are such a booking: by the Growcord Ship id or number the booking stored. */
export function notTakenMatcher(list: GsConsignment[]): (shipment: any) => GsConsignment | null {
  const byId = new Map(list.map((c) => [String(c.id), c]));
  const byNumber = new Map(list.filter((c) => c.consignment_number).map((c) => [String(c.consignment_number), c]));
  return (shipment: any) => {
    const pd = shipment?.providerData ?? shipment?.provider_data ?? {};
    const id = String(pd?.carrier_shipment_id ?? pd?.carrierShipmentId ?? '');
    const num = String(pd?.carrier_order_id ?? pd?.carrierOrderId ?? '');
    return (id && byId.get(id)) || (num && byNumber.get(num)) || null;
  };
}
