/**
 * Competitive repricing and Google automated discounts (PRICING-AUTO, DEC-089), the store admin's
 * calls. Backend: growcord-rs commerce `api/pricing/policies.rs` (policies at three scopes, revert,
 * run now), `api/pricing/mod.rs` (recommendations, discovery status and runs), `resources/pricing.rs`
 * (the `PriceChange` and `PriceRecommendation` lists); contract `apps/commerce/docs/PRICING.md`
 * sections 4, 4a and 4b.
 *
 * Permissions (the server decides; screens only choose what to offer):
 *   reads                                   products.read
 *   policies, revert, run now, adopt, dismiss products.manage
 *   the discovery switches (registry key pricingDiscovery)  settings.manage
 *
 * Money: the policy reads keep the wire's `{minor, currency}` (`keepMoney`), so a form writes the same
 * minor units back; the lists arrive in rupees (the one normaliser). Percents travel as decimal TEXT
 * (`"10"`, `"60.5"`): the server's `Decimal` reads text exactly and answers text.
 */
import { listMeta, v2call } from './http';
import type { Money } from './money';
import { settingsRegistryAPI } from '../../services/api';

const C = '/api/v2/commerce';
const enc = encodeURIComponent;

export const PRICING_PERMS = {
  read: 'products.read',
  manage: 'products.manage',
  switches: 'settings.manage',
} as const;

/** The registry key that holds the discovery switches (settings_registry.rs, page `/pricing/discovery`). */
export const DISCOVERY_KEY = 'pricingDiscovery';

/* ── policies ───────────────────────────────────────────────────────────── */

export type PolicyScope = 'store' | 'brand' | 'variation';
/** Where a value in force came from. */
export type Origin = 'variation' | 'brand' | 'store' | 'default';

/** A Decimal as the server sends it (text; a number is accepted too). */
export type DecimalText = string | number;

export type FlagKey = 'auto_reprice' | 'google_auto_discounts' | 'freeze';
export type PctKey = 'cost_pct_of_mrp' | 'min_margin_pct' | 'solo_discount_pct' | 'max_daily_change_pct' | 'google_max_discount_pct';
export type MoneyKey = 'undercut_min' | 'undercut_max' | 'floor_price';
export type WordKey = 'cost_basis' | 'strategy' | 'charm_ending';
export type PolicyKey = FlagKey | PctKey | MoneyKey | WordKey;

/** The fourteen values one scope stores; `null` = not set here (the next scope decides). */
export interface StoredPolicy {
  cost_basis: string | null;
  strategy: string | null;
  auto_reprice: boolean | null;
  cost_pct_of_mrp: DecimalText | null;
  min_margin_pct: DecimalText | null;
  undercut_min: Money | null;
  undercut_max: Money | null;
  charm_ending: string | null;
  solo_discount_pct: DecimalText | null;
  max_daily_change_pct: DecimalText | null;
  google_auto_discounts: boolean | null;
  google_max_discount_pct: DecimalText | null;
  floor_price: Money | null;
  freeze: boolean | null;
}

export interface Sourced<T> { value: T; from: Origin }

export interface EffectivePolicy {
  cost_basis: Sourced<string>;
  strategy: Sourced<string>;
  auto_reprice: Sourced<boolean>;
  cost_pct_of_mrp: Sourced<DecimalText>;
  min_margin_pct: Sourced<DecimalText>;
  undercut_min: Sourced<Money | null>;
  undercut_max: Sourced<Money | null>;
  charm_ending: Sourced<string>;
  solo_discount_pct: Sourced<DecimalText>;
  max_daily_change_pct: Sourced<DecimalText>;
  google_auto_discounts: Sourced<boolean>;
  google_max_discount_pct: Sourced<DecimalText>;
  floor_price: Sourced<Money | null>;
  freeze: Sourced<boolean>;
}

/** What pricing knows of one variation (the variation scope only). */
export interface VariationPricing {
  sku: string | null;
  brand_id: string | null;
  price: Money | null;
  mrp: Money | null;
  cost: Money | null;
  lowest_allowed: Money | null;
}

export interface PolicyView {
  scope: PolicyScope;
  brand_id: string | null;
  variation_id: string | null;
  stored: StoredPolicy;
  effective: EffectivePolicy;
  variation: VariationPricing | null;
  updated_at: string | null;
  updated_by: string | null;
  /** The policy tables exist in this store's database (tenant migration 478). */
  tables_present: boolean;
}

/** Every policy field, in the order the server lists them. `cost_basis` is the store's only. */
export const POLICY_KEYS: readonly PolicyKey[] = [
  'cost_basis', 'strategy', 'auto_reprice', 'cost_pct_of_mrp', 'min_margin_pct', 'undercut_min', 'undercut_max',
  'charm_ending', 'solo_discount_pct', 'max_daily_change_pct', 'google_auto_discounts', 'google_max_discount_pct',
  'floor_price', 'freeze',
];

/** The `PUT` body: every field of the scope, `null` = not set here. */
export type PolicyBody = Partial<Record<PolicyKey, string | boolean | Money | null>>;

function policyPath(scope: PolicyScope, id?: string | null): string {
  if (scope === 'store') return `${C}/pricing/policies/store`;
  if (!id) throw new Error(`A ${scope} policy needs its id.`);
  return scope === 'brand' ? `${C}/pricing/policies/brands/${enc(id)}` : `${C}/pricing/policies/variations/${enc(id)}`;
}

export const getPolicy = (scope: PolicyScope, id?: string | null) =>
  v2call<PolicyView>('GET', policyPath(scope, id), { keepMoney: true });

/** Replaces that scope's stored values (a field left out or null inherits). */
export const putPolicy = (scope: PolicyScope, id: string | null | undefined, body: PolicyBody) =>
  v2call<PolicyView>('PUT', policyPath(scope, id), { data: body, keepMoney: true });

/** Integer minor units of a wire amount, or null. */
export function minorOf(m: unknown): number | null {
  if (m && typeof m === 'object' && 'minor' in (m as object)) {
    const n = Number((m as { minor: unknown }).minor);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/* ── the history of price changes ───────────────────────────────────────── */

/** One recorded catalogue price change (`/pricing/changes`; amounts in rupees). */
export interface PriceChangeRow {
  id: string;
  variation_id: string;
  sku: string | null;
  price_before: number;
  price_after: number;
  own_before?: number | null;
  currency: string;
  /** `discovery`, `revert`, `person`. */
  source: string;
  reason: string | null;
  recommendation_id: string | null;
  run_id: string | null;
  /** The change this one undid. */
  reverts_id: string | null;
  /** `service` (the daily run), `staff`. */
  actor_kind: string;
  actor_id: string | null;
  actor_name: string | null;
  at: string;
}

export interface ChangeFilters {
  source?: string;
  run_id?: string;
  variation_id?: string;
  /** Searches the SKU and the reason. */
  q?: string;
}

export interface Listed<T> { rows: T[]; total: number }

function listed<T>(d: unknown): Listed<T> {
  const rows = Array.isArray(d) ? (Array.from(d) as T[]) : [];
  const total = Number(listMeta(d).total);
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

const clean = (q: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const listChanges = async (f: ChangeFilters, limit: number, offset: number) =>
  listed<PriceChangeRow>(await v2call('GET', `${C}/pricing/changes`, { params: clean({ ...f, limit, offset }) }));

/** The same list as a file (the server's export of these filters). */
export const exportChanges = (f: ChangeFilters) =>
  v2call<Blob>('GET', `${C}/pricing/changes/export`, { params: clean({ ...f }), responseType: 'blob' });

export interface RevertAnswer { change: PriceChangeRow; frozen: boolean }

/** Puts the price back to what it was before the change; `freeze` keeps the daily run off the item. */
export const revertChange = (id: string, body: { note?: string; freeze?: boolean }) =>
  v2call<RevertAnswer>('POST', `${C}/pricing/changes/${enc(id)}/revert`, { data: body });

/* ── recommendations ────────────────────────────────────────────────────── */

/** One suggested price (`/pricing/recommendations`; amounts in rupees). */
export interface RecommendationRow {
  id: string;
  run_id: string | null;
  variation_id: string;
  sku: string | null;
  current_price: number;
  suggested_price: number;
  currency: string;
  reason: string;
  /** `open`, `adopted`, `dismissed`, `superseded`, `applied`. */
  status: string;
  adopted_rule_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export const listRecommendations = async (f: { status?: string; q?: string; run_id?: string }, limit: number, offset: number) =>
  listed<RecommendationRow>(await v2call('GET', `${C}/pricing/recommendations`, { params: clean({ ...f, limit, offset }) }));

/** The suggestion becomes a fixed-price rule for its item (a draft unless `activate`). */
export const adoptRecommendation = (id: string, body: { activate?: boolean; follow_recommendation?: boolean }) =>
  v2call('POST', `${C}/pricing/recommendations/${enc(id)}/adopt`, { data: body });

export const dismissRecommendation = (id: string, note?: string) =>
  v2call('POST', `${C}/pricing/recommendations/${enc(id)}/dismiss`, { data: note ? { note } : {} });

/* ── discovery runs and switches ────────────────────────────────────────── */

/** One source a run tried: `{source, reached, observations?, reason?}`. */
export interface RunSource { source: string; reached: boolean; observations?: number; reason?: string }

export interface RunSummary {
  applied?: number;
  held?: Record<string, number>;
  kinds?: Record<string, number>;
  skipped?: Record<string, number>;
  left_for_a_person?: number;
  can_apply?: boolean;
}

export interface DiscoveryRun {
  id: string;
  run_key: string;
  /** `running`, `ok`, `partial`, `unreachable`, `skipped`, `failed`. */
  status: string;
  sources: RunSource[] | unknown;
  observations: number;
  recommendations: number;
  note: string | null;
  started_at: string | null;
  finished_at: string | null;
  applied: number;
  summary: RunSummary | null;
}

export interface DiscoveryStatus {
  enabled: boolean;
  merchant_center: boolean;
  competitor_urls: boolean;
  allowed_hosts: string[];
  max_pages_per_run: number;
  min_seconds_between_requests: number;
  min_margin_pct: DecimalText;
  above_benchmark_pct: DecimalText;
  min_confidence: DecimalText;
  recommendation_ttl_days: number;
  /** The NAME of the server switch the daily schedule needs. */
  deployment_switch: string;
  merchant_center_service: string;
  open_recommendations: number;
  last_run: DiscoveryRun | null;
  /** The discovery tables exist in this store's database. */
  tables_present: boolean;
}

export const discoveryStatus = () => v2call<DiscoveryStatus>('GET', `${C}/pricing/discovery/status`);

export const listRuns = async (limit: number, offset: number) =>
  listed<DiscoveryRun>(await v2call('GET', `${C}/pricing/discovery/runs`, { params: { limit, offset } }));

/** Runs discovery now as the person who asked; refused (409) while discovery or every source is off. */
export const runDiscoveryNow = () =>
  v2call<{ started: boolean; run_key: string }>('POST', `${C}/pricing/discovery/run`);

/** The discovery switches as the registry key `pricingDiscovery` names them (dotted field paths). */
export interface DiscoveryPatch {
  enabled?: boolean;
  merchantCenter?: boolean;
  competitorUrls?: boolean;
  allowedHosts?: string[];
  maxPagesPerRun?: number;
  minSecondsBetweenRequests?: number;
  aboveBenchmarkPct?: number;
  minConfidence?: number;
  recommendationTtlDays?: number;
}

/** Written through the registry's own write (`PATCH /commerce/settings/registry/pricingDiscovery`). */
export const saveDiscoverySwitches = (patch: DiscoveryPatch) =>
  settingsRegistryAPI.update(DISCOVERY_KEY, patch as Record<string, unknown>);

/* ── words ──────────────────────────────────────────────────────────────── */

/** The refusal codes the screens answer in their own words. */
export const PRICING_CODES = {
  notRevertible: 'commerce.price_change_not_revertible',
  changedSince: 'commerce.price_changed_since',
  discoveryOff: 'commerce.pricing_discovery_off',
} as const;

export const ORIGIN_WORDS: Record<Origin, string> = {
  variation: 'this item',
  brand: 'the brand',
  store: 'the whole website',
  default: "Growcord's default",
};

export const SOURCE_WORDS: Record<string, string> = {
  discovery: 'Daily run',
  revert: 'Undo',
  person: 'A person',
};

/** The sources a run records (`jobs/pricing_discovery.rs`, `domain/pricing/discovery.rs` `Source`). */
export const RUN_SOURCE_WORDS: Record<string, string> = {
  merchant_center: 'Google Merchant Center',
  merchant_center_benchmark: "Google's benchmark",
  merchant_center_insight: "Google's suggested prices",
  merchant_center_feed: "Google's product list",
  competitor_page: 'Competitor pages',
};

export const RUN_STATUS_WORDS: Record<string, string> = {
  running: 'Running',
  ok: 'Done',
  partial: 'Done, some sources not reached',
  unreachable: 'No source reached',
  skipped: 'Skipped',
  failed: 'Failed',
};

export const RECOMMENDATION_STATUS_WORDS: Record<string, string> = {
  open: 'Waiting for you',
  adopted: 'Adopted',
  dismissed: 'Dismissed',
  superseded: 'Replaced by a newer one',
  applied: 'Applied by the daily run',
};

/** Reasons a run held a change back or skipped an item, in words. */
export const HELD_WORDS: Record<string, string> = {
  price_changed_since: 'price changed during the run',
  on_sale: 'a sale price is running',
  batch_pricing_full: 'the lot price is charged instead',
  variation_gone: 'the item no longer exists',
  frozen: 'frozen',
  cost_unknown: 'cost not known',
  no_mrp: 'no MRP',
};

export const KIND_WORDS: Record<string, string> = {
  undercut: 'undercut',
  solo: 'nobody else sells',
  insight: "Google's suggestion",
  match_lowest: 'matched lowest',
};

/** `snake_case` to words, for a code the tables above do not know. */
export function wordsOf(code: string, table: Record<string, string> = {}): string {
  if (table[code]) return table[code];
  const s = String(code || '').replace(/[_.]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
