/**
 * The business buyer's new store admin routes (Trade, lane HMAPP-T6, growcord-rs
 * `.runs/wt-hmapp-c/docs/PORT_NOTES/HMAPP-T6.md` sections 1 and 2; views in
 * `apps/trade/core/src/api/app_b2b.rs`). Mounted only with `GC_INTL_ROUTES` (integration adds
 * `GC_APP_ROUTES`): OFF on the live server until the release, so a screen shows `NotServed`.
 *
 *   GET, PUT  /api/v2/trade/business-types                          b2b.read, b2b.manage + a person
 *   GET       /api/v2/trade/applications/{id}/app-facts             b2b.read
 *   GET, POST /api/v2/trade/accounts/{customer_id}/team             b2b.read, b2b.manage + a person
 *   POST      /api/v2/trade/accounts/{customer_id}/team/{member_id}/remove
 *   GET       /api/v2/trade/quotes?status=&limit=                   b2b.read
 *   POST      /api/v2/trade/quotes/{id}/answer                      b2b.manage + a person
 *
 * The licence files of an application are Commerce attachments of record
 * `b2b_application/<customer_id>`, read with `b2b.read` through the existing attachment routes.
 */
import { v2call } from './http';

const T = '/api/v2/trade';

export const B2B_PERMS = { read: 'b2b.read', manage: 'b2b.manage' } as const;

/* ── business types ────────────────────────────────────────────────────── */

export interface BusinessType {
  key: string;
  label: string;
  labels?: Record<string, string>;
  licence: string;
  hospital_or_dispensary: boolean;
}
export interface BusinessTypesView { types: BusinessType[]; source: string; default_types?: BusinessType[] }

export const getBusinessTypes = () => v2call<BusinessTypesView>('GET', `${T}/business-types`);
export const putBusinessTypes = (types: BusinessType[]) => v2call<BusinessTypesView>('PUT', `${T}/business-types`, { data: { types } });

/* ── an application's app facts ────────────────────────────────────────── */

export interface GstinCheck {
  gstin?: string;
  valid?: boolean;
  reason?: string | null;
  state_code?: string | null;
  state?: string | null;
  pan?: string | null;
  holder?: string | null;
  source?: string;
  gstn?: string;
}
export interface ApplicationFacts {
  id: string;
  customer_id: string;
  company_name: string | null;
  business_type: string | null;
  gstin: string | null;
  status: string;
  licence_number: string | null;
  gstin_check: GstinCheck | null;
  channel: string | null;
}
export const getApplicationFacts = (id: string) =>
  v2call<ApplicationFacts>('GET', `${T}/applications/${encodeURIComponent(id)}/app-facts`);

/* ── a business account's team ─────────────────────────────────────────── */

export interface TeamMember {
  id: string;
  owner_customer_id: string;
  member_customer_id: string;
  role: string;
  added_by: string | null;
  added_at: string | null;
}
export interface TeamView { owner_customer_id: string; members: TeamMember[] }

export const getTeam = (customerId: string) => v2call<TeamView>('GET', `${T}/accounts/${encodeURIComponent(customerId)}/team`);
export const addTeamMember = (customerId: string, body: { member_customer_id: string; role: string }) =>
  v2call<TeamView>('POST', `${T}/accounts/${encodeURIComponent(customerId)}/team`, { data: body });
/** `memberCustomerId` is the member's customer id (the route's `{member_id}`), not the team row's id. */
export const removeTeamMember = (customerId: string, memberCustomerId: string, reason: string) =>
  v2call<TeamView>('POST', `${T}/accounts/${encodeURIComponent(customerId)}/team/${encodeURIComponent(memberCustomerId)}/remove`, { data: { reason } });

/* ── quote requests ────────────────────────────────────────────────────── */

export interface QuoteRequest {
  id: string;
  customer_id: string;
  lines: unknown;
  note: string | null;
  status: string;
  answer_note: string | null;
  crm_opportunity_id: string | null;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const listQuotes = async (status?: string): Promise<QuoteRequest[]> => {
  const d: any = await v2call('GET', `${T}/quotes`, { params: { status: status || undefined, limit: 200 } });
  return Array.isArray(d) ? Array.from(d) : Array.isArray(d?.items) ? d.items : [];
};
export const answerQuote = (id: string, body: { status: string; note: string; crm_opportunity_id?: string }) =>
  v2call<QuoteRequest>('POST', `${T}/quotes/${encodeURIComponent(id)}/answer`, { data: body });
