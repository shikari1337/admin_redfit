/**
 * The store's money in — the typed reads/writes behind Payments, Settlements, Payment analytics, the COD
 * payouts page and the order page's payment card (PAY-0 contract §2, §3, §5; lane ADMIN-PAY-1).
 *
 * Every path comes from `src/lib/v2/areas/payments.ts` (STORE_PAYMENT_PATHS / COD_PAYOUT_PATHS) so the
 * orchestrator re-points a route in one place. Calls go straight to v2 (`v2http`, envelope unwrapped only).
 *
 * Money, exactly: the ledger answers integer MINOR units (`amount_minor`) beside one `currency` per row; the
 * Ship COD routes answer wire `Money {minor, currency}` under bare names (`collected`). `v2call` would turn
 * every Money into a rupee float (`moneyToMajorDeep`), so these calls use `v2http` and unwrap only the
 * `{success, data}` envelope: `minorOf` then reads `x_minor` or `x.minor` — integers end to end. (The COD
 * list still comes through the legacy mapping, already in rupees; `minorOf` converts that back by decimal
 * string, never a float product.)
 */
import { V2_ENABLED } from '@/lib/v2/config';
import { backendGap, v2http } from '@/lib/v2/http';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import { fmtCurrencyMinor } from '@/lib/money';
import { STORE_PAYMENT_PATHS as P, COD_PAYOUT_PATHS as C } from '@/lib/v2/areas/payments';

/* ── shapes (PAY-0 §2) ────────────────────────────────────────────────────── */

export type TxnSource = 'checkout_order' | 'checkout_session' | 'domains_order' | 'platform_invoice' | 'payment_link' | 'unknown';
export type TxnStatus = 'captured' | 'refunded' | 'partially_refunded' | 'failed';
export type ReconStatus = 'unsettled' | 'settled' | 'mismatch' | 'orphan';

export interface Transaction {
  id: string;
  source: TxnSource | string;
  source_id: string | null;
  source_number: string | null;
  provider: string;
  mode: string;
  account_ref: string | null;
  payment_ref: string;
  intent_ref: string | null;
  method: string | null;
  instrument: string | null;
  international: boolean;
  amount_minor: number | null;
  currency: string;
  fee_minor: number | null;
  tax_minor: number | null;
  net_minor: number | null;
  fee_source: string | null;
  refunded_minor: number | null;
  status: TxnStatus | string;
  settlement_id: string | null;
  settlement_utr: string | null;
  settled_at: string | null;
  recon_status: ReconStatus | string;
  recon_note: string | null;
  fee_journal_id: string | null;
  captured_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** The Growcord Payments request (owned intent) that took this payment, when one did (PAY-1). */
  intent_id?: string | null;
  /** The order's customer (PAY-LEDGER-1 sends it). */
  customer_name?: string | null;
}

export interface TxnRefund {
  id?: string;
  refund_ref?: string | null;
  amount_minor: number | null;
  status?: string | null;
  created_at?: string | null;
  note?: string | null;
}

export interface TransactionDetail extends Transaction {
  refunds: TxnRefund[];
  links: { order_id: string | null; order_number: string | null; settlement_id: string | null };
}

export interface Totals {
  count: number;
  gross_minor: number | null;
  fee_minor: number | null;
  tax_minor: number | null;
  net_minor: number | null;
  refunded_minor: number | null;
  settled_minor: number | null;
  unsettled_minor: number | null;
  fee_unknown_count: number;
  currency: string;
}
export interface SummaryRow extends Totals { key: string }
export interface Summary { totals: Totals; rows: SummaryRow[]; currencies: string[] }

export interface Settlement {
  settlement_id: string;
  utr: string | null;
  settled_at: string | null;
  count: number;
  gross_minor: number | null;
  fee_minor: number | null;
  tax_minor: number | null;
  net_minor: number | null;
  currency: string;
}
export interface SettlementDetail extends Settlement { transactions: Transaction[] }

export interface ReconResult {
  checked: number; settled: number; orphans: number; mismatches: number; refunds: number; unchecked: number;
  /** false = the store takes payments on Growcord's account: nothing of its own to reconcile. */
  own_account: boolean;
}

export interface TxnFilters {
  from?: string; to?: string; status?: string; recon_status?: string; method?: string; source?: string; q?: string;
}

/* ── COD (PAY-0 §3) ───────────────────────────────────────────────────────── */

export type CodMatch = 'matched' | 'short' | 'excess' | 'unmatched' | 'duplicate' | 'not_cod' | 'not_delivered' | 'missing_order';

export interface CodSummary {
  delivered_cod_count: number;
  expected_minor: number | null;
  collected_minor: number | null;
  remitted_minor: number | null;
  pending_minor: number | null;
  courier_cod_charges_minor: number | null;
  freight_deducted_minor: number | null;
  other_deductions_minor: number | null;
  /** The COD fee shoppers paid, WITHOUT its GST. */
  cod_fee_from_shoppers_minor: number | null;
  /** COD fee from shoppers (without GST) − courier COD charges. */
  cod_margin_minor: number | null;
  mismatched_count: number;
  currency: string;
}

export interface CodLine {
  id: string;
  order_id: string | null;
  order_number: string | null;
  /** The order number as the courier's file wrote it (may differ from the matched order's). */
  listed_order_number: string | null;
  awb: string | null;
  /** collected − expected, as the server computed it. */
  difference_minor: number | null;
  /** What the order says the courier should have collected (the COD amount due). */
  expected_minor: number | null;
  /** What the courier says it collected. */
  collected_minor: number | null;
  courier_cod_charge_minor: number | null;
  freight_deducted_minor: number | null;
  other_deductions_minor: number | null;
  net_remitted_minor: number | null;
  match_status: CodMatch | string;
  match_note: string | null;
  currency: string;
}

/** A COD line as the order page shows it: which payout it sits in, and that payout's state. */
export interface CodOrderRemittance { id: string; courier: string | null; remitted_at: string | null; utr: string | null; status: string | null }
export interface CodOrderLink { line: CodLine | null; remittance: CodOrderRemittance | null }

/* ── errors ───────────────────────────────────────────────────────────────── */

/** A route this server does not serve yet (older backend): 404/405/501 or the typed backend gap. */
export function isGap(e: any): boolean {
  const s = e?.response?.status;
  const code = e?.response?.data?.code ?? e?.response?.data?.error?.code ?? e?.code;
  return s === 404 || s === 405 || s === 501 || code === 'v2.backend_gap' || code === 'V2_BACKEND_GAP';
}

/** The server's own words for a refusal, else the fallback. */
export function errText(e: any, fallback: string): string {
  const d = e?.response?.data;
  return d?.message || d?.error?.message || (typeof d?.error === 'string' ? d.error : '') || e?.message || fallback;
}

export interface LoadFailure { gap: boolean; forbidden: boolean; message: string }
export const failureOf = (e: any, fallback: string): LoadFailure => ({
  gap: isGap(e),
  forbidden: e?.response?.status === 403,
  message: errText(e, fallback),
});

/** A v2 call answering the envelope's data UNCHANGED (Money stays `{minor, currency}`; see the header). */
async function call<T>(method: string, path: string, opts: { params?: Record<string, unknown>; data?: unknown } = {}): Promise<T> {
  if (!V2_ENABLED) backendGap(`${method} ${path} (this build is not on the v2 API)`);
  const res = await v2http.request({ method, url: path, params: opts.params, data: opts.data });
  const body: any = res.data;
  return (body && typeof body === 'object' && !Array.isArray(body) && 'success' in body && 'data' in body ? body.data : body) as T;
}

/** The same raw call for the sibling modules (fee vendors). */
export const v2raw = call;

/* ── money helpers ────────────────────────────────────────────────────────── */

const isInt = (v: unknown): boolean => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^-?\d+$/.test(v.trim()));

/**
 * The minor-unit integer of `<base>`, exactly: `<base>_minor` (ledger), else `<base>.minor` (a wire Money
 * from this file's raw calls), else a rupee number under `<base>` (a Money the legacy mapping already turned
 * into rupees — converted back by decimal string), else null ("not known yet" — never a zero that looks real).
 */
export function minorOf(row: any, base: string, currency?: string | null): number | null {
  if (!row || typeof row !== 'object') return null;
  const m = row[`${base}_minor`];
  if (isInt(m)) return Number(m);
  const v = row[base];
  if (v && typeof v === 'object' && isInt(v.minor)) return Number(v.minor);
  if (typeof v === 'number' && Number.isFinite(v)) return majorToMinor(v, currency ?? row.currency ?? 'INR');
  return null;
}

/** Minor units in the row's currency → "₹1,234.50"; null → "—". */
export function money(minor: number | null | undefined, currency?: string | null): string {
  if (minor === null || minor === undefined || !Number.isFinite(Number(minor))) return '—';
  return fmtCurrencyMinor(minor, String(currency || 'INR').toUpperCase(), 'en-IN');
}

/** Minor units → a plain decimal for a spreadsheet ("1234.50"), never a float product. */
export function plainMajor(minor: number | null | undefined, currency?: string | null): string {
  if (minor === null || minor === undefined || !Number.isFinite(Number(minor))) return '';
  return String(minorToMajor(minor, currency || 'INR'));
}

/** Fee as a share of gross, "1.98%" — display only (both figures are the gateway's own). */
export function feePct(fee: number | null | undefined, gross: number | null | undefined): string {
  if (fee === null || fee === undefined || !gross) return '—';
  const bp = Math.round((Number(fee) * 10000) / Number(gross)); // basis points, integer
  return `${(bp / 100).toFixed(2)}%`;
}

/* ── normalisers ──────────────────────────────────────────────────────────── */

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const int = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toTxn(r: any): Transaction {
  const currency = String(r?.currency || 'INR');
  return {
    id: String(r?.id ?? ''),
    source: String(r?.source ?? 'unknown'),
    source_id: str(r?.source_id),
    source_number: str(r?.source_number),
    provider: String(r?.provider ?? ''),
    mode: String(r?.mode ?? ''),
    account_ref: str(r?.account_ref),
    payment_ref: String(r?.payment_ref ?? ''),
    intent_ref: str(r?.intent_ref),
    method: str(r?.method),
    instrument: str(r?.instrument),
    international: !!r?.international,
    amount_minor: minorOf(r, 'amount', currency),
    currency,
    fee_minor: minorOf(r, 'fee', currency),
    tax_minor: minorOf(r, 'tax', currency),
    net_minor: minorOf(r, 'net', currency),
    fee_source: str(r?.fee_source),
    refunded_minor: minorOf(r, 'refunded', currency),
    status: String(r?.status ?? ''),
    settlement_id: str(r?.settlement_id),
    settlement_utr: str(r?.settlement_utr),
    settled_at: str(r?.settled_at),
    recon_status: String(r?.recon_status ?? ''),
    recon_note: str(r?.recon_note),
    fee_journal_id: str(r?.fee_journal_id),
    captured_at: str(r?.captured_at),
    created_at: str(r?.created_at),
    updated_at: str(r?.updated_at),
    customer_name: str(r?.customer_name),
    intent_id: str(r?.intent_id),
  };
}

function toTotals(r: any): Totals {
  const currency = String(r?.currency || 'INR');
  return {
    count: int(r?.count),
    gross_minor: minorOf(r, 'gross', currency),
    fee_minor: minorOf(r, 'fee', currency),
    tax_minor: minorOf(r, 'tax', currency),
    net_minor: minorOf(r, 'net', currency),
    refunded_minor: minorOf(r, 'refunded', currency),
    settled_minor: minorOf(r, 'settled', currency),
    unsettled_minor: minorOf(r, 'unsettled', currency),
    fee_unknown_count: int(r?.fee_unknown_count),
    currency,
  };
}

function toSettlement(r: any): Settlement {
  const currency = String(r?.currency || 'INR');
  return {
    settlement_id: String(r?.settlement_id ?? r?.id ?? ''),
    utr: str(r?.utr ?? r?.settlement_utr),
    settled_at: str(r?.settled_at),
    count: int(r?.count),
    gross_minor: minorOf(r, 'gross', currency),
    fee_minor: minorOf(r, 'fee', currency),
    tax_minor: minorOf(r, 'tax', currency),
    net_minor: minorOf(r, 'net', currency),
    currency,
  };
}

/** `{items}` or a normalised array-with-meta → the rows. */
const itemsOf = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []);

function params(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}

export function toCodSummary(r: any): CodSummary {
  const currency = String(r?.currency || 'INR');
  return {
    delivered_cod_count: int(r?.delivered_cod_count),
    expected_minor: minorOf(r, 'expected', currency),
    collected_minor: minorOf(r, 'collected', currency),
    remitted_minor: minorOf(r, 'remitted', currency),
    pending_minor: minorOf(r, 'pending', currency),
    courier_cod_charges_minor: minorOf(r, 'courier_cod_charges', currency),
    freight_deducted_minor: minorOf(r, 'freight_deducted', currency),
    other_deductions_minor: minorOf(r, 'other_deductions', currency),
    cod_fee_from_shoppers_minor: minorOf(r, 'cod_fee_from_shoppers', currency),
    cod_margin_minor: minorOf(r, 'cod_margin', currency),
    mismatched_count: int(r?.mismatched_count),
    currency,
  };
}

/** One remittance line, old (`cod_amount`/`expected_amount`) or §3 shape. */
export function toCodLine(r: any, fallbackCurrency?: string | null): CodLine {
  const currency = String(r?.currency || r?.collected?.currency || r?.expected?.currency || fallbackCurrency || 'INR');
  return {
    id: String(r?.id ?? ''),
    order_id: str(r?.order_id),
    order_number: str(r?.order_number ?? r?.matched_order_number),
    listed_order_number: str(r?.listed_order_number),
    awb: str(r?.awb),
    difference_minor: minorOf(r, 'difference', currency),
    expected_minor: minorOf(r, 'expected', currency) ?? minorOf(r, 'expected_amount', currency) ?? minorOf(r, 'cod_due', currency),
    collected_minor: minorOf(r, 'collected', currency) ?? minorOf(r, 'cod_amount', currency),
    courier_cod_charge_minor: minorOf(r, 'courier_cod_charge', currency),
    freight_deducted_minor: minorOf(r, 'freight_deducted', currency),
    other_deductions_minor: minorOf(r, 'other_deductions', currency),
    net_remitted_minor: minorOf(r, 'net_remitted', currency),
    match_status: String(r?.match_status ?? (r?.matched ? 'matched' : 'unmatched')),
    match_note: str(r?.match_note),
    currency,
  };
}

/* ── the calls ────────────────────────────────────────────────────────────── */

export const storePaymentsAPI = {
  async transactions(f: TxnFilters & { cursor?: string | null; limit?: number }): Promise<{ items: Transaction[]; next_cursor: string | null }> {
    const d: any = await call('GET', P.transactions, { params: params({ ...f, cursor: f.cursor ?? undefined }) });
    return { items: itemsOf(d).map(toTxn), next_cursor: str(d?.next_cursor) };
  },

  async transaction(id: string): Promise<TransactionDetail> {
    const d: any = await call('GET', P.transaction(id));
    const t = toTxn(d);
    const refunds: TxnRefund[] = (Array.isArray(d?.refunds) ? d.refunds : []).map((x: any) => ({
      id: str(x?.id) ?? undefined,
      refund_ref: str(x?.refund_ref ?? x?.payment_ref ?? x?.id),
      amount_minor: minorOf(x, 'amount', t.currency),
      status: str(x?.status),
      created_at: str(x?.created_at),
      note: str(x?.note ?? x?.reason),
    }));
    const l = d?.links ?? {};
    return {
      ...t,
      refunds,
      links: {
        order_id: str(l.order_id) ?? (t.source === 'checkout_order' ? t.source_id : null),
        order_number: str(l.order_number) ?? t.source_number,
        settlement_id: str(l.settlement_id) ?? t.settlement_id,
      },
    };
  },

  async bySource(source: string, sourceId: string): Promise<Transaction[]> {
    const d: any = await call('GET', P.bySource(source, sourceId));
    return itemsOf(d).map(toTxn);
  },

  async summary(f: { from?: string; to?: string; group: 'day' | 'method' | 'source'; currency?: string }): Promise<Summary> {
    const d: any = await call('GET', P.summary, { params: params(f) });
    const totals = toTotals(d?.totals ?? {});
    const currencies = (Array.isArray(d?.currencies) ? d.currencies : []).map(String);
    return { totals, rows: (Array.isArray(d?.rows) ? d.rows : []).map((r: any) => ({ key: String(r?.key ?? ''), ...toTotals({ currency: totals.currency, ...r }) })), currencies };
  },

  async settlements(f: { from?: string; to?: string }): Promise<Settlement[]> {
    const d: any = await call('GET', P.settlements, { params: params(f) });
    return itemsOf(d).map(toSettlement);
  },

  async settlement(id: string): Promise<SettlementDetail> {
    const d: any = await call('GET', P.settlement(id));
    return { ...toSettlement(d), transactions: (Array.isArray(d?.transactions) ? d.transactions : []).map(toTxn) };
  },

  async reconRun(body: { from: string; to: string }): Promise<ReconResult> {
    const d: any = await call('POST', P.reconRun, { data: body });
    return {
      checked: int(d?.checked), settled: int(d?.settled), orphans: int(d?.orphans), mismatches: int(d?.mismatches),
      refunds: int(d?.refunds), unchecked: int(d?.unchecked), own_account: d?.own_account !== false,
    };
  },
};

export const codPayoutsAPI = {
  async summary(f: { from?: string; to?: string }): Promise<CodSummary> {
    return toCodSummary(await call('GET', C.summary, { params: params(f) }));
  },
  async remittance(id: string): Promise<any> {
    return call('GET', C.remittance(id));
  },
  async importCsv(form: FormData): Promise<any> {
    return call('POST', C.import, { data: form });
  },
  /** `{line|null, remittance|null}` — the order's COD payout line and the payout it sits in. */
  async byOrder(orderId: string): Promise<CodOrderLink> {
    const d: any = await call('GET', C.byOrder(orderId));
    const r = d?.remittance;
    return {
      line: d?.line ? toCodLine(d.line) : null,
      remittance: r && r.id ? { id: String(r.id), courier: str(r.courier), remitted_at: str(r.remitted_at), utr: str(r.utr), status: str(r.status) } : null,
    };
  },
};

/** A refused import (422) → its problems by row, whatever the exact list key; [] when none are listed. */
export function importProblems(e: any): Array<{ row: string; field: string; problem: string }> {
  const d = e?.response?.data ?? {};
  const det = d.details ?? d.error?.details ?? {};
  const list = [d.problems, det.problems, det.rows, det.errors, d.errors, Array.isArray(det) ? det : null].find((x) => Array.isArray(x) && x.length) as any[] | undefined;
  return (list ?? []).map((p: any) => {
    // Ship sends plain strings: `row 4: …` or `row 4, column "COD Amount": …`.
    if (typeof p === 'string') {
      const m = /^row (\d+)(?:, column "([^"]*)")?: (.*)$/.exec(p);
      return m ? { row: m[1], field: m[2] ?? '', problem: m[3] } : { row: '', field: '', problem: p };
    }
    return {
      row: String(p?.row ?? p?.line ?? p?.line_no ?? p?.source_line ?? ''),
      field: String(p?.field ?? p?.column ?? p?.header ?? ''),
      problem: String(p?.message ?? p?.problem ?? p?.reason ?? p?.error ?? JSON.stringify(p)),
    };
  });
}

/* ── words ────────────────────────────────────────────────────────────────── */

export const RECON_LABEL: Record<string, string> = {
  unsettled: 'Not paid out yet', settled: 'In the bank', mismatch: 'Mismatch', orphan: 'Not from our checkout',
};
export const RECON_HELP: Record<string, string> = {
  unsettled: 'Captured, but the gateway has not paid it into your bank yet (it usually takes 2–3 working days).',
  settled: 'The gateway paid it into your bank in the settlement shown.',
  mismatch: 'The amount or currency the gateway took differs from the order. Open it to see the reason.',
  orphan: 'A payment on your gateway account that no order or checkout of ours recorded — someone took money outside the store’s checkout.',
};
export const RECON_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  unsettled: 'amber', settled: 'green', mismatch: 'red', orphan: 'red',
};
export const STATUS_LABEL: Record<string, string> = {
  captured: 'Paid', refunded: 'Refunded', partially_refunded: 'Part refunded', failed: 'Failed',
};
export const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  captured: 'green', refunded: 'neutral', partially_refunded: 'amber', failed: 'red',
};
export const METHOD_LABEL: Record<string, string> = {
  upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', cod: 'Cash on delivery', unknown: 'Unknown',
};
export const SOURCE_LABEL: Record<string, string> = {
  checkout_order: 'Store order', checkout_session: 'Checkout link', domains_order: 'Domain order',
  platform_invoice: 'Growcord invoice', payment_link: 'Payment link', unknown: 'Unknown (found by reconciliation)',
};
export const label = (map: Record<string, string>, v: string | null | undefined): string =>
  (v ? map[v] ?? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

export const COD_MATCH_LABEL: Record<string, string> = {
  matched: 'Matched', short: 'Paid short', excess: 'Paid over', unmatched: 'No order found', missing_order: 'No order found',
  duplicate: 'Listed twice', not_cod: 'Not a COD order', not_delivered: 'Not delivered yet',
};
export const COD_MATCH_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  matched: 'green', short: 'red', excess: 'amber', unmatched: 'red', missing_order: 'red',
  duplicate: 'amber', not_cod: 'amber', not_delivered: 'amber',
};

/** The plain reason of a COD line's result: the server's note, else the difference in words. */
export function codReason(l: CodLine): string {
  if (l.match_note) return l.match_note;
  const diff = l.difference_minor ?? (l.collected_minor !== null && l.expected_minor !== null ? l.collected_minor - l.expected_minor : null);
  switch (l.match_status) {
    case 'matched': return 'Collected exactly the COD amount due.';
    case 'short': return diff !== null ? `The courier collected ${money(-diff, l.currency)} less than the COD amount due.` : 'The courier collected less than the COD amount due.';
    case 'excess': return diff !== null ? `The courier collected ${money(diff, l.currency)} more than the COD amount due.` : 'The courier collected more than the COD amount due.';
    case 'unmatched': return 'No order matches this tracking or order number.';
    case 'duplicate': return 'This parcel is already on another payout line.';
    case 'not_cod': return 'The order was paid online, so no cash was due at the door.';
    case 'not_delivered': return 'The order is not marked delivered yet.';
    case 'missing_order': return 'No order matches this tracking or order number.';
    default: return '';
  }
}

export const LINK = {
  transactions: '/panel/orders/payments',
  settlements: '/panel/orders/payments/settlements',
  settlement: (id: string) => `/panel/orders/payments/settlements/${encodeURIComponent(id)}`,
  analytics: '/panel/orders/payments/analytics',
  cod: '/panel/orders/cod-recon',
  order: (id: string) => `/orders/${encodeURIComponent(id)}`,
  /** The transactions table filtered (and, with `id`, the drawer open on one payment). */
  filtered: (f: Record<string, string | null | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    const s = q.toString();
    return `/panel/orders/payments${s ? `?${s}` : ''}`;
  },
};

/** The order page link for a ledger row, when it points at a store order. */
export function orderLinkOf(t: { source: string; source_id: string | null }): string | null {
  return t.source === 'checkout_order' && t.source_id ? LINK.order(t.source_id) : null;
}
