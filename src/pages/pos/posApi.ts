/**
 * The counter's one bill path on v2 (`/api/v2/retail`, rows in `lib/v2/areas/payments.ts`).
 *
 * The screen never prices anything: `/pos/quote` answers what the basket costs and `/pos/bills`
 * charges with the SAME computation, so the figure on the screen and the figure in the drawer
 * cannot disagree. Money arrives in rupees (the v2 envelope turns every `Money` into its rupee
 * number) and goes back as rupees (the row's `m` spec turns it into `Money`). Sums the screen does
 * itself (tender legs, a denomination count) run in minor units through `lib/v2/money`, never in
 * floating rupees.
 *
 * Device-only state (the offline queue, held bills, the outlet this terminal sells from) lives in
 * `localStorage` and every read and write is guarded: a private window or blocked storage keeps the
 * counter working, with the queue in memory only.
 */
import { api, errorText } from '../../services/api';
import { majorToMinor, minorToMajor } from '../../lib/v2/money';

// ── shapes (retail views.rs) ─────────────────────────────────────────────────────────────────

export type TenderMethod = 'cash' | 'upi' | 'card';
/** The tenders a counter bill takes: the server's own list (retail inputs.rs `TenderMethod`); any other is refused there. */
export const TENDER_METHODS: TenderMethod[] = ['cash', 'upi', 'card'];

export interface Outlet { id: string; name: string; code?: string | null; city?: string | null }

/** A drawer session. A cashier's view has no `expected_cash` (a blind close counts before it sees that figure). */
export interface Session {
  id: string;
  outlet_id?: string | null;
  outlet_name?: string | null;
  status: string;
  opened_at?: string | null;
  opening_float: number;
  receipt_count: number;
  cash_taken: number;
  digital_taken: number;
  refund_count: number;
  refunds: number;
  cash_refunds: number;
  expected_cash?: number;
}

export interface CounterRules {
  /** Percent; null = no ceiling. */
  max_cashier_discount: number | null;
  variance_tolerance: number;
  allow_expired_fallback: boolean;
  near_expiry_days: number;
}

export interface CounterConfig {
  outlets: Outlet[];
  session: Session | null;
  config: CounterRules;
  is_manager: boolean;
  /** The note and coin ladder of the store's currency, in rupees, largest first. */
  denominations: number[];
  operator: { id?: string | null; email?: string | null; role?: string | null };
}

export interface Hit {
  variation_id: string;
  product_id?: string | null;
  sku?: string | null;
  name: string;
  price: number;
  mrp?: number | null;
  available: number;
  matched_by: string;
  pack_qty?: number | null;
  batch_number?: string | null;
  batch_expiry?: string | null;
}

export interface QuoteLine {
  product_id?: string | null;
  variation_id?: string | null;
  name?: string | null;
  sku?: string | null;
  quantity: number;
  unit_price: number;
  mrp?: number | null;
  line_total: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  discount_reason?: string | null;
  tax: number;
  total: number;
  coupon_applied?: unknown;
  outlet?: { id?: string | null; name?: string | null; state?: string | null; gstin?: string | null } | null;
  blocked: { variation_id: string; blocked: boolean; message: string }[];
  warnings: string[];
  needs_manager: boolean;
  discount_percent: number;
}

export interface TenderLeg { method: string; amount: number; tendered?: number | null; change?: number | null; reference?: string | null }

export interface BillItem {
  variation_id?: string | null;
  name?: string | null;
  sku?: string | null;
  quantity: number;
  mrp?: number | null;
  unit_price: number;
  line_total: number;
  batches: { batch_number?: string | null; expiry_date?: string | null; qty: number }[];
}

export interface Bill {
  replayed: boolean;
  id: string;
  receipt_number: string;
  order_number?: string | null;
  session_id?: string | null;
  outlet?: { name?: string | null; city?: string | null; state?: string | null; gstin?: string | null; address?: string | null; phone?: string | null } | null;
  created_at?: string | null;
  captured_at?: string | null;
  queued_offline: boolean;
  payment_method: string;
  total: number;
  paid: number;
  change_due: number;
  tenders: TenderLeg[];
  items: BillItem[];
  totals?: { subtotal: number; discount: number; discount_reason?: string | null; tax: number; total: number } | null;
  warnings: string[];
  oversell: { variation_id: string; shortfall: number }[];
  refunds: { refund_number: string; amount: number; method: string; reason?: string | null; created_at?: string | null }[];
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
}

export interface ReceiptRow {
  id: string;
  receipt_number: string;
  payment_method: string;
  amount: number;
  total?: number | null;
  created_at?: string | null;
  queued_offline: boolean;
  voided_at?: string | null;
}

export interface ReturnableSale {
  receipt: ReceiptRow;
  order_number?: string | null;
  refunded: number;
  refundable: number;
  items: { variation_id?: string | null; name?: string | null; sku?: string | null; quantity: number; unit_price: number; refunded_qty: number; returnable_qty: number }[];
}

export interface Refund {
  refund_number: string;
  amount: number;
  method: string;
  reason?: string | null;
  created_at?: string | null;
}

/** A shift summary: computed live while the drawer is open (`frozen: false`), frozen at close. */
export interface ZReport {
  session_id: string;
  opened_at?: string | null;
  closed_at?: string | null;
  frozen: boolean;
  opening_float: number;
  bills: number;
  gross: number;
  cash: number;
  digital: number;
  refund_count: number;
  refunds: number;
  cash_refunds: number;
  tender_mix: { method: string; legs: number; amount: number }[];
  tax: number;
  net_sales: number;
  z_journal_number?: string | null;
  // manager view only
  expected_cash?: number;
  counted_cash?: number | null;
  variance?: number | null;
  denominations?: { face: number; count: number }[];
}

export interface Closed { z_report: ZReport; journal: { posted: boolean; reason?: string | null; journal_number?: string | null } }

/** A basket line as the screen holds it. `hint` is the shelf price the search showed: display only, never totalled. */
export interface CartLine { variationId: string; productId: string | null; sku: string; name: string; qty: number; hint: number }

/** One tender leg as the cashier types it (rupee text, so a half-typed figure is not rounded away). */
export interface TenderDraft { method: TenderMethod; amount: string; tendered: string; reference: string; confirmed: boolean }

export interface Buyer { name: string; phone: string; customerId: string | null; gstin: string; coupon: string }

// ── money the screen sums (minor units, exact) ───────────────────────────────────────────────

export const minorOf = (rupees: number | string | null | undefined): number => majorToMinor(rupees ?? null) ?? 0;
export const rupeesOf = (minor: number): number => minorToMajor(minor);

// ── calls ────────────────────────────────────────────────────────────────────────────────────

const body = <T>(p: Promise<{ data: unknown }>): Promise<T> => p.then((r) => r.data as T);
const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : undefined);
const key = (k: string) => ({ headers: { 'X-Idempotency-Key': k } });

export const newRef = (): string => {
  try { return crypto.randomUUID(); } catch { return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
};

export const loadCounter = (outletId: string | null) =>
  body<CounterConfig>(api.get('/pos/config', { params: outletId ? { outletId } : {} }));

/** The counter's one lookup: an exact scan comes back alone in `exact`, anything else ranked in `items`. */
export const searchCounter = async (q: string, outletId: string | null): Promise<{ exact: Hit | null; items: Hit[] }> => {
  const d: any = await body<any>(api.get('/pos/search', { params: { q, outletId: outletId ?? undefined, limit: 12 } }));
  // The answer has `items` and `limit`, so the envelope hands it over as the list with `exact` beside it.
  const items: Hit[] = Array.isArray(d) ? Array.from(d) : Array.isArray(d?.items) ? d.items : [];
  const exact: Hit | null = d?.exact && typeof d.exact === 'object' && d.exact.variation_id ? d.exact : null;
  return { exact, items: items.filter((h) => h && h.variation_id) };
};

const basket = (outletId: string | null, lines: CartLine[], buyer: Buyer) => ({
  outletId: outletId ?? undefined,
  lines: lines.map((l) => ({ variationId: l.variationId, productId: l.productId ?? undefined, quantity: l.qty })),
  couponCode: blank(buyer.coupon),
  customerId: buyer.customerId ?? undefined,
  customerName: blank(buyer.name),
  customerPhone: blank(buyer.phone),
  gstin: blank(buyer.gstin)?.toUpperCase(),
});

export const quoteBasket = (outletId: string | null, lines: CartLine[], buyer: Buyer) =>
  body<Quote>(api.post('/pos/quote', basket(outletId, lines, buyer)));

/** The tender legs as the bill takes them: rupees (the row turns them into Money); cash carries what was handed over. */
export const tendersOut = (legs: TenderDraft[]) => legs.map((t) => ({
  method: t.method,
  amount: rupeesOf(minorOf(t.amount)),
  tendered: t.method === 'cash' && t.tendered.trim() ? rupeesOf(minorOf(t.tendered)) : undefined,
  reference: t.method === 'cash' ? undefined : blank(t.reference),
  confirmed: t.method === 'cash' ? true : t.confirmed,
}));

export interface BillDraft {
  outletId: string | null;
  lines: CartLine[];
  buyer: Buyer;
  tenders: TenderDraft[];
  notes: string;
  overrideReason: string;
  clientRef: string;
}

export const ringBill = (d: BillDraft) => body<Bill>(api.post('/pos/bills', {
  ...basket(d.outletId, d.lines, d.buyer),
  tenders: tendersOut(d.tenders),
  notes: blank(d.notes),
  clientRef: d.clientRef,
  managerOverrideReason: blank(d.overrideReason),
}, key(d.clientRef)));

export const getBill = (receiptNumber: string) => body<Bill>(api.get(`/pos/bills/${encodeURIComponent(receiptNumber)}`));

export const voidBill = (receiptNumber: string, reason: string, method: TenderMethod, outletId: string | null) =>
  body<{ receipt_number: string; refund: Refund }>(api.post(`/pos/bills/${encodeURIComponent(receiptNumber)}/void`, {
    reason: reason.trim(), method, outletId: outletId ?? undefined,
  }));

export const sessionBills = async (sessionId: string): Promise<ReceiptRow[]> => {
  const d: any = await body<any>(api.get(`/pos/session/${encodeURIComponent(sessionId)}/receipts`));
  return Array.isArray(d) ? Array.from(d) : Array.isArray(d?.items) ? d.items : [];
};

export const shiftReport = (sessionId: string) => body<ZReport>(api.get(`/pos/session/${encodeURIComponent(sessionId)}/z-report`));

export const openDrawer = (openingFloat: number, outletId: string | null) =>
  body<Session>(api.post('/pos/session/open', { openingFloat, outletId: outletId ?? undefined }));

/** The blind close: the sheet is `{ "<face in minor units>": count }`, or a counted total when the store has no ladder. */
export const closeDrawer = (sheet: Record<string, number> | null, countedCash: number | null, notes: string, outletId: string | null) =>
  body<Closed>(api.post('/pos/session/z-close', {
    denominations: sheet ?? undefined,
    countedCash: sheet ? undefined : countedCash ?? 0,
    notes: blank(notes),
    outletId: outletId ?? undefined,
  }));

export const findSale = (receiptNumber: string) => body<ReturnableSale>(api.get(`/pos/receipts/${encodeURIComponent(receiptNumber)}`));

export const refundSale = (receiptNumber: string, method: TenderMethod, reason: string, items: { variationId: string; qty: number }[], outletId: string | null, ref: string) =>
  body<Refund>(api.post('/pos/refunds', {
    receiptNumber, method, reason: reason.trim(), items, outletId: outletId ?? undefined,
  }, key(ref)));

/** A phone number's customer, so B2B prices apply and the sale lands in their history. Anonymous on any miss. */
export const customerByPhone = async (phone: string): Promise<{ id: string; name: string | null } | null> => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  try {
    const res = await api.get('/customers', { params: { search: digits.slice(-10), limit: 1 } });
    const rows: any[] = (res.data as any)?.customers ?? (res.data as any)?.rows ?? (Array.isArray(res.data) ? res.data : []);
    const hit = rows[0];
    const theirs = String(hit?.phone ?? hit?.phone_number ?? '').replace(/\D/g, '');
    if (hit && theirs.endsWith(digits.slice(-10))) return { id: String(hit.id ?? hit._id), name: hit.name ?? hit.full_name ?? null };
  } catch { /* an anonymous sale is fine */ }
  return null;
};

/** The server's words for a refusal; a network failure says so plainly. */
export const say = (e: unknown, fallback = 'Something went wrong'): string => errorText(e, fallback);

/** True only when nobody answered (the network, a gateway): a refused bill is never queued for a retry. */
export const unreachable = (e: any): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const status = e?.response?.status;
  if (typeof status === 'number') return status === 0 || status === 502 || status === 503 || status === 504;
  return !!e?.isAxiosError || e instanceof TypeError;
};

// ── device storage (guarded) ─────────────────────────────────────────────────────────────────

const read = <T>(k: string, fallback: T): T => {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: kept in memory */ }
};

export const savedOutlet = (): string | null => { const v = read<string | null>('pos_outlet', null); return typeof v === 'string' && v ? v : null; };
export const saveOutlet = (id: string | null) => write('pos_outlet', id);

/** A bill rung while the network was down: it has no number until `/pos/bills/sync` gives it one. */
export interface QueuedBill { clientRef: string; capturedAt: string; outletId: string | null; lines: CartLine[]; buyer: Buyer; tenders: TenderDraft[]; notes: string; total: number }
const QUEUE = 'pos_offline_bills';
export const readQueue = (): QueuedBill[] => { const q = read<QueuedBill[]>(QUEUE, []); return Array.isArray(q) ? q : []; };
export const writeQueue = (q: QueuedBill[]) => write(QUEUE, q.length ? q : null);

export const syncQueue = (q: QueuedBill[]) =>
  body<{ results: { client_ref?: string | null; ok: boolean; receipt_number?: string | null; error?: string | null }[]; synced: number; failed: number }>(
    api.post('/pos/bills/sync', {
      bills: q.map((b) => {
        // A queued bill carries no buyer GSTIN (retail inputs.rs `QueuedBillIn`): a B2B bill is rung online.
        const out: Record<string, unknown> = { ...basket(b.outletId, b.lines, b.buyer) };
        delete out.gstin;
        return { ...out, tenders: tendersOut(b.tenders), notes: blank(b.notes), clientRef: b.clientRef, capturedAt: b.capturedAt };
      }),
    }),
  );

/** A parked bill on this device (spec: hold and serve the next customer, then recall). */
export interface HeldBill { id: string; at: string; lines: CartLine[]; buyer: Buyer }
const HELD = 'pos_held_bills';
export const readHeld = (): HeldBill[] => { const h = read<HeldBill[]>(HELD, []); return Array.isArray(h) ? h : []; };
export const writeHeld = (h: HeldBill[]) => write(HELD, h.length ? h : null);

export const emptyBuyer = (): Buyer => ({ name: '', phone: '', customerId: null, gstin: '', coupon: '' });
