/**
 * The partner programme's store admin routes (Retain, `/api/v2/retain/partners*`; lane HMAPP-T5,
 * growcord-rs `.runs/wt-hmapp-c/docs/PORT_NOTES/HMAPP-T5.md` section 2 "The store admin"). Shapes are
 * the staff views of `apps/retain/core/src/views.rs` (PartnerTermsStaffView, PartnerStaffView,
 * CommissionStaffView, PayoutBatchStaffView, PayoutLineStaffView, StatementStaffView).
 *
 * Permissions (the server decides; screens only choose what to offer, `ret/permissions.rs`):
 *   read            marketing.read
 *   decide, money   marketing.manage (approve, refuse, suspend, resume, commissions, build, quote, cancel)
 *   terms, own rate settings.manage
 *   approve, paid   accounting.post (never the person who built the batch)
 *
 * Every list is a keyset page `{items, next_cursor, limit}`; `v2call` hands it over as an array with
 * `next_cursor` on it, which `page()` reads back. Money arrives in major units (rupees), except the
 * terms read, which keeps the wire's `{minor, currency}` so the form writes Money back exactly.
 */
import { v2call } from './http';
import type { Money } from './money';

const R = '/api/v2/retain';

export const PARTNER_PERMS = {
  read: 'marketing.read',
  manage: 'marketing.manage',
  terms: 'settings.manage',
  payout: 'accounting.post',
} as const;

/** One page of a keyset list. */
export interface KeysetPage<T> { items: T[]; nextCursor: string | null }

/** A `v2call` answer of a keyset page (an array carrying `next_cursor`, or the plain object). */
export function keysetPage<T>(d: unknown): KeysetPage<T> {
  if (Array.isArray(d)) {
    const cur = (d as unknown as { next_cursor?: unknown }).next_cursor;
    return { items: Array.from(d) as T[], nextCursor: typeof cur === 'string' && cur ? cur : null };
  }
  const o = (d ?? {}) as { items?: unknown; next_cursor?: unknown };
  return {
    items: Array.isArray(o.items) ? (o.items as T[]) : [],
    nextCursor: typeof o.next_cursor === 'string' && o.next_cursor ? o.next_cursor : null,
  };
}

/* ── terms ─────────────────────────────────────────────────────────────── */

export interface RateRule { id: string; rate_milli: number }
export interface KindDoc { code: string; label: string }

/** One version of the store's terms, or the platform's defaults: every field optional. */
export interface TermsDoc {
  commission_milli?: number | null;
  category_rates?: RateRule[] | null;
  brand_rates?: RateRule[] | null;
  hold_days?: number | null;
  attribution_days?: number | null;
  min_payout?: Money | null;
  payout_day?: number | null;
  eligible_kinds?: KindDoc[] | null;
  ad_label?: string | null;
  share_rules?: string | null;
}

export interface LimitsDoc {
  max_commission_milli?: number | null;
  min_hold_days?: number | null;
  max_attribution_days?: number | null;
  min_payout_floor?: Money | null;
  allowed_kinds?: string[] | null;
  tds_rule_code?: string | null;
}

export interface TermsVersion {
  id: string;
  version: number;
  terms: TermsDoc;
  effective_from: string;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface PartnerTermsView {
  programme_on: boolean;
  reasons: string[];
  switch_on: boolean | null;
  in_force: TermsVersion | null;
  versions: TermsVersion[];
  platform_defaults: TermsDoc | null;
  platform_defaults_source: string | null;
  platform_limits: LimitsDoc | null;
  platform_limits_source: string | null;
  effective: TermsDoc | null;
  problems: string[];
}

export const getTerms = () => v2call<PartnerTermsView>('GET', `${R}/partners/terms`, { keepMoney: true });

export const putTerms = (body: { terms: TermsDoc; effective_from?: string | null; reason: string }) =>
  v2call<PartnerTermsView>('PUT', `${R}/partners/terms`, { data: body, keepMoney: true });

/* ── partners ──────────────────────────────────────────────────────────── */

export interface PartnerRow {
  id: string;
  customer_id: string;
  party_id: string | null;
  kind: string;
  display_name: string;
  about: string | null;
  channels: unknown;
  declarations: unknown;
  status: string;
  code: string | null;
  own_rate_milli: number | null;
  applied_at: string;
  decided_by: string | null;
  decision_reason: string | null;
  status_changed_by: string | null;
  status_reason: string | null;
  totals: unknown;
  bank: Record<string, unknown> | null;
}

export const listPartners = async (q: { status?: string; cursor?: string | null; limit?: number }) =>
  keysetPage<PartnerRow>(await v2call('GET', `${R}/partners`, { params: { status: q.status || undefined, cursor: q.cursor || undefined, limit: q.limit ?? 50 } }));

export const getPartner = (id: string) => v2call<PartnerRow>('GET', `${R}/partners/${encodeURIComponent(id)}`);

export const approvePartner = (id: string, body: { code?: string; rate_milli?: number; reason?: string }) =>
  v2call<PartnerRow>('POST', `${R}/partners/${encodeURIComponent(id)}/approve`, { data: body });

export type PartnerMove = 'refuse' | 'suspend' | 'resume';
export const movePartner = (id: string, move: PartnerMove, reason: string) =>
  v2call<PartnerRow>('POST', `${R}/partners/${encodeURIComponent(id)}/${move}`, { data: { reason } });

export const setPartnerRate = (id: string, rate_milli: number | null, reason: string) =>
  v2call<PartnerRow>('PUT', `${R}/partners/${encodeURIComponent(id)}/rate`, { data: { rate_milli, reason } });

/* ── commissions ───────────────────────────────────────────────────────── */

export interface CommissionRow {
  id: string;
  partner_id: string;
  order_id: string;
  buyer_party_id: string;
  source: string;
  placed_at: string;
  order_total: number | null;
  base: number | null;
  original: number | null;
  amount: number | null;
  returned: number | null;
  state: string;
  flags: string[];
  delivered_on: string | null;
  approve_after: string | null;
  rejected_reason: string | null;
  reversed_reason: string | null;
  terms_version_id: string | null;
  rule: unknown;
  payout_line_id: string | null;
}

export const listCommissions = async (q: { state?: string; partner_id?: string; cursor?: string | null; limit?: number }) =>
  keysetPage<CommissionRow>(await v2call('GET', `${R}/partners/commissions`, {
    params: { state: q.state || undefined, partner_id: q.partner_id || undefined, cursor: q.cursor || undefined, limit: q.limit ?? 50 },
  }));

export const approveCommission = (id: string) =>
  v2call<CommissionRow>('POST', `${R}/partners/commissions/${encodeURIComponent(id)}/approve`, { data: {} });

export const rejectCommission = (id: string, reason: string) =>
  v2call<CommissionRow>('POST', `${R}/partners/commissions/${encodeURIComponent(id)}/reject`, { data: { reason } });

/* ── payout batches ────────────────────────────────────────────────────── */

export interface PayoutLine {
  id: string;
  partner_id: string;
  display_name: string;
  party_id: string | null;
  account_last4: string;
  ifsc: string;
  gross: number | null;
  tax_deducted: number | null;
  net: number | null;
  tax_detail: unknown;
  commissions: number;
  state: string;
}

export interface PayoutBatch {
  id: string;
  period: string;
  cutoff: string;
  state: string;
  gross: number | null;
  tax_deducted: number | null;
  net: number | null;
  lines_count: number;
  min_payout: number | null;
  skipped: unknown;
  tax_rule: unknown;
  tax_note: string | null;
  books_ref: unknown;
  paid_on: string | null;
  payment_reference: string | null;
  built_by: string | null;
  approved_by: string | null;
  paid_by: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  lines: PayoutLine[];
}

export const listBatches = async (q: { cursor?: string | null; limit?: number }) =>
  keysetPage<PayoutBatch>(await v2call('GET', `${R}/partners/payout-batches`, { params: { cursor: q.cursor || undefined, limit: q.limit ?? 24 } }));

export const getBatch = (id: string) => v2call<PayoutBatch>('GET', `${R}/partners/payout-batches/${encodeURIComponent(id)}`);

export const buildBatch = () => v2call<PayoutBatch>('POST', `${R}/partners/payout-batches`, { data: {} });

export type BatchMove = 'quote' | 'approve';
export const moveBatch = (id: string, move: BatchMove) =>
  v2call<PayoutBatch>('POST', `${R}/partners/payout-batches/${encodeURIComponent(id)}/${move}`, { data: {} });

export const payBatch = (id: string, body: { paid_on: string; reference: string }) =>
  v2call<PayoutBatch>('POST', `${R}/partners/payout-batches/${encodeURIComponent(id)}/paid`, { data: body });

export const cancelBatch = (id: string, reason: string) =>
  v2call<PayoutBatch>('POST', `${R}/partners/payout-batches/${encodeURIComponent(id)}/cancel`, { data: { reason } });

/* ── words ─────────────────────────────────────────────────────────────── */

/**
 * The backend answers state CODES only (design 60 GAP NEW-1). Until it serves words, a code is shown
 * readable ("being_checked" as "Being checked"), never mapped to words the backend did not say.
 */
export function codeWords(code: string | null | undefined): string {
  const s = String(code ?? '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Not known';
}

/** True when two ids name the same person (UUIDs, case ignored); false when either is not an id. */
export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return !!a && !!b && id.test(a) && id.test(b) && a.toLowerCase() === b.toLowerCase();
}
