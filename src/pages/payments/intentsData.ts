/**
 * Payment requests — Growcord Payments OWNED intents of this store (PAY-1 / DEC-074; shapes:
 * growcord-rs apps/payments/docs/CONTRACT.md "Owned intents"). An intent is what we ASKED a payer to pay (one
 * per order / session / domain / top-up, its gateway orders = attempts, one state machine); the ledger row
 * (Payments page) is what the gateway actually TOOK, linked to it by `intent_id`.
 */
import { STORE_INTENT_PATHS as I } from '@/lib/v2/areas/payments';
import { LINK, v2raw } from './data';

export interface Intent {
  id: string; source: string; source_id: string | null; source_number: string | null; status: string;
  amount_minor: number | null; captured_minor: number | null; refunded_minor: number | null; currency: string;
  mode: string | null; provider: string | null; gateway_ref: string | null; payment_ref: string | null;
  late_capture: boolean; cancel_reason: string | null; created_at: string | null; captured_at: string | null;
}
export interface IntentAttempt {
  id: string; provider: string; mode: string | null; gateway_ref: string | null; amount_minor: number | null; currency: string;
  status: string; payment_ref: string | null; method: string | null; account_source: string | null; failure_reason: string | null; created_at: string | null;
}
export interface IntentRefund {
  id: string; amount_minor: number | null; currency: string; status: string; reason: string | null; provider: string | null;
  refund_ref: string | null; failure_reason: string | null; requested_by: string | null; created_at: string | null; processed_at: string | null;
}
export interface IntentEvent { event: string; from_status: string | null; to_status: string | null; actor: string | null; detail: unknown; at: string | null }
export interface IntentDetail {
  intent: Intent; attempts: IntentAttempt[]; refunds: IntentRefund[]; timeline: IntentEvent[];
  links: { order_id: string | null; order_number: string | null; transaction_id: string | null };
}
export interface IntentFilters { from?: string; to?: string; status?: string; source?: string; q?: string }

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const int = (v: unknown): number | null => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function toIntent(r: any): Intent {
  return {
    id: String(r?.id ?? ''), source: String(r?.source ?? 'unknown'), source_id: str(r?.source_id), source_number: str(r?.source_number),
    status: String(r?.status ?? ''), amount_minor: int(r?.amount_minor), captured_minor: int(r?.captured_minor), refunded_minor: int(r?.refunded_minor),
    currency: String(r?.currency || 'INR'), mode: str(r?.mode), provider: str(r?.provider), gateway_ref: str(r?.gateway_ref),
    payment_ref: str(r?.payment_ref), late_capture: !!r?.late_capture, cancel_reason: str(r?.cancel_reason),
    created_at: str(r?.created_at), captured_at: str(r?.captured_at),
  };
}

export const intentsAPI = {
  async list(f: IntentFilters & { cursor?: string | null; limit?: number }): Promise<{ items: Intent[]; next_cursor: string | null }> {
    const params: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') params[k] = v;
    const d: any = await v2raw('GET', I.intents, { params });
    const rows = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
    return { items: rows.map(toIntent), next_cursor: str(d?.next_cursor) };
  },
  async get(id: string): Promise<IntentDetail> {
    const d: any = await v2raw('GET', I.intent(id));
    const l = d?.links ?? {};
    return {
      intent: toIntent(d?.intent ?? d),
      attempts: (Array.isArray(d?.attempts) ? d.attempts : []).map((a: any): IntentAttempt => ({
        id: String(a?.id ?? ''), provider: String(a?.provider ?? ''), mode: str(a?.mode), gateway_ref: str(a?.gateway_ref),
        amount_minor: int(a?.amount_minor), currency: String(a?.currency || 'INR'), status: String(a?.status ?? ''),
        payment_ref: str(a?.payment_ref), method: str(a?.method), account_source: str(a?.account_source),
        failure_reason: str(a?.failure_reason), created_at: str(a?.created_at),
      })),
      refunds: (Array.isArray(d?.refunds) ? d.refunds : []).map((r: any): IntentRefund => ({
        id: String(r?.id ?? ''), amount_minor: int(r?.amount_minor), currency: String(r?.currency || 'INR'), status: String(r?.status ?? ''),
        reason: str(r?.reason), provider: str(r?.provider), refund_ref: str(r?.refund_ref), failure_reason: str(r?.failure_reason),
        requested_by: str(r?.requested_by), created_at: str(r?.created_at), processed_at: str(r?.processed_at),
      })),
      timeline: (Array.isArray(d?.timeline) ? d.timeline : []).map((e: any): IntentEvent => ({
        event: String(e?.event ?? ''), from_status: str(e?.from_status), to_status: str(e?.to_status), actor: str(e?.actor), detail: e?.detail ?? null, at: str(e?.at),
      })),
      links: { order_id: str(l.order_id), order_number: str(l.order_number), transaction_id: str(l.transaction_id) },
    };
  },
};

/* ── words ────────────────────────────────────────────────────────────────── */

export const INTENT_STATUS_LABEL: Record<string, string> = {
  created: 'Created', requires_action: 'Waiting for the payer', authorised: 'Held, to be captured', captured: 'Paid', failed: 'Failed', cancelled: 'Cancelled',
};
export const INTENT_STATUS_HELP: Record<string, string> = {
  created: 'Made, but no payment window has been opened at the gateway yet.',
  requires_action: 'A payment window is open at the gateway; the payer has not finished paying.',
  authorised: 'The gateway holds the money; it is taken when the gateway captures it.',
  captured: 'The money was taken.',
  failed: 'No payment was taken and none can be on this request.',
  cancelled: 'Closed without payment — see the reason.',
};
export const INTENT_STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  created: 'neutral', requires_action: 'amber', authorised: 'blue', captured: 'green', failed: 'red', cancelled: 'neutral',
};
export const INTENT_SOURCE_LABEL: Record<string, string> = {
  checkout_order: 'Store order', checkout_session: 'Checkout link', domains_order: 'Domain order', platform_invoice: 'Growcord invoice',
  platform_purchase: 'Plan purchase', platform_recharge: 'Wallet top-up', whatsapp_billing: 'WhatsApp billing', payment_link: 'Payment link',
  merchant_api: 'Payments API', unknown: 'Unknown',
};
export const CANCEL_REASON: Record<string, string> = {
  superseded: 'replaced by a newer request for a different amount',
  owner_settled: 'the order was paid through another request',
  expired: 'it expired unpaid',
};
export const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  created: 'Opened', requires_action: 'Waiting for the payer', authorised: 'Held', captured: 'Paid', failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired',
};

const human = (w: string) => w.replace(/[._]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** One timeline event in plain words. */
export function eventText(e: IntentEvent): string {
  if (e.to_status && e.from_status !== e.to_status) {
    const to = INTENT_STATUS_LABEL[e.to_status] ?? human(e.to_status);
    return e.from_status ? `${INTENT_STATUS_LABEL[e.from_status] ?? human(e.from_status)} → ${to}` : to;
  }
  return human(e.event || 'event');
}

/** Where the thing paid for lives in this admin (or null: no page here). */
export function ownerLink(i: Pick<Intent, 'source' | 'source_id'>, orderId?: string | null): string | null {
  if (i.source === 'checkout_order' && (orderId || i.source_id)) return LINK.order((orderId || i.source_id) as string);
  if (i.source === 'platform_recharge') return '/settings/wallet';
  if (i.source === 'platform_purchase' || i.source === 'platform_invoice') return '/settings/billing';
  return null;
}

export const INTENTS_LINK = '/panel/orders/payments/requests';
export const intentLink = (id: string) => `${INTENTS_LINK}?id=${encodeURIComponent(id)}`;
