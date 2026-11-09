/**
 * Facebook and Instagram (META-0 plan section 3, lane META-5): every read and write the
 * "Facebook and Instagram" page makes, typed, in ONE place.
 *
 * New routes are called straight through `v2call` (envelope unwrapped, a Page becomes an array with `total`,
 * a wire Money becomes its major-unit number); contract money is integer minor units under `*_minor` names and
 * passes through unchanged. Routes the admin already had are reused through their existing callers
 * (`channelsAPI`, `productsAPI.searchVariations`, `categoriesAPI.list`, `GET /settings/admin`, `PUT /settings`,
 * the shared connect flow in `lib/connectorConnect.ts`), so nothing is called two ways.
 *
 * Development only: with `?mock=meta` in the address bar a dev server answers every call here from
 * `meta.mock.ts`. A production build replaces `import.meta.env.DEV` with `false`, the branch is dropped and the
 * mock module is never bundled.
 */
import { V2_ENABLED } from '../config';
import { backendGap, v2call } from '../http';
import api, { categoriesAPI, channelsAPI, productsAPI } from '../../../services/api';
import { startConnect } from '../../connectorConnect';
import type { MetaMock } from './meta.mock';

const MK = '/api/v2/marketing';
const CM = '/api/v2/commerce';
const WA = '/api/v2/whatsapp';
const seg = (v: string) => encodeURIComponent(v);

/** Every contract path, so a route is re-pointed here and nowhere else. */
export const META_PATHS = {
  setup: `${MK}/meta/setup`,
  resources: (connectionId: string, service: string) => `${MK}/connections/${seg(connectionId)}/services/${seg(service)}/resources`,
  service: (connectionId: string, service: string) => `${MK}/connections/${seg(connectionId)}/services/${seg(service)}`,
  campaigns: `${MK}/meta/campaigns`,
  campaignsSync: `${MK}/meta/campaigns/sync`,
  campaignStatus: (externalId: string) => `${MK}/meta/campaigns/${seg(externalId)}/status`,
  campaignBudget: (externalId: string) => `${MK}/meta/campaigns/${seg(externalId)}/budget`,
  remarketingOptions: `${MK}/meta/remarketing/options`,
  drafts: `${MK}/meta/remarketing/drafts`,
  draft: (id: string) => `${MK}/meta/remarketing/drafts/${seg(id)}`,
  draftPreviews: (id: string) => `${MK}/meta/remarketing/drafts/${seg(id)}/previews`,
  draftApply: (id: string) => `${MK}/meta/remarketing/drafts/${seg(id)}/apply`,
  draftDiscard: (id: string) => `${MK}/meta/remarketing/drafts/${seg(id)}/discard`,
  igPosts: `${MK}/instagram/posts`,
  igRefresh: `${MK}/instagram/refresh`,
  igTags: (mediaId: string) => `${MK}/instagram/posts/${seg(mediaId)}/tags`,
  igShopping: `${MK}/instagram/shopping`,
  catalogSummary: (channelId: string) => `${CM}/channels/${seg(channelId)}/catalog-summary`,
  catalogItems: (channelId: string) => `${CM}/channels/${seg(channelId)}/catalog-items`,
  productSets: (channelId: string) => `${CM}/channels/${seg(channelId)}/product-sets`,
  waCatalogStatus: `${WA}/products/catalog/status`,
  waCatalogConnect: `${WA}/products/catalog/connect`,
  /* Wave 2 (contract META-W2): the Ads Manager tree, creating any ad, audiences, the creative library, insights. */
  adsTree: `${MK}/meta/ads/tree`,
  adObject: (level: string, id: string) => `${MK}/meta/ads/${seg(level)}/${seg(id)}`,
  adOp: (level: string, id: string, op: 'status' | 'budget' | 'schedule' | 'rename' | 'duplicate') => `${MK}/meta/ads/${seg(level)}/${seg(id)}/${op}`,
  adsBulk: `${MK}/meta/ads/bulk`,
  adsRecommendations: `${MK}/meta/ads/recommendations`,
  adsRecommendationApply: (id: string) => `${MK}/meta/ads/recommendations/${seg(id)}/apply`,
  adsRules: `${MK}/meta/ads/rules`,
  adsRule: (id: string) => `${MK}/meta/ads/rules/${seg(id)}`,
  adsTests: `${MK}/meta/ads/tests`,
  adsTest: (id: string) => `${MK}/meta/ads/tests/${seg(id)}`,
  adsOptions: `${MK}/meta/ads/options`,
  adsDrafts: `${MK}/meta/ads/drafts`,
  adsDraft: (id: string) => `${MK}/meta/ads/drafts/${seg(id)}`,
  adsDraftStep: (id: string, step: 'previews' | 'apply' | 'discard') => `${MK}/meta/ads/drafts/${seg(id)}/${step}`,
  adsTargeting: `${MK}/meta/ads/targeting/search`,
  adsAudiences: `${MK}/meta/ads/audiences`,
  adsAudience: (id: string) => `${MK}/meta/ads/audiences/${seg(id)}`,
  adsLibrary: `${MK}/meta/ads/library`,
  adsLibraryItem: (id: string) => `${MK}/meta/ads/library/${seg(id)}`,
  insights: `${MK}/meta/insights`,
  insightsExport: `${MK}/meta/insights/export`,
  /* META-10 added (its PORT_NOTES CQ-5): read a range now, and the alert thresholds as an editable store setting. */
  insightsSync: `${MK}/meta/insights/sync`,
  insightsSettings: `${MK}/meta/insights/settings`,
  alerts: `${MK}/meta/alerts`,
  /* Wave 2, lane META-15B (contract META-W2-social): the Publisher, comments, social insights and the
   * `social` setting (META-12), lead forms and leads (META-11), events health (META-16), one product's Meta status (META-9C). */
  socialChannels: `${MK}/social/channels`,
  socialPosts: `${MK}/social/posts`,
  socialPost: (id: string) => `${MK}/social/posts/${seg(id)}`,
  socialPostPublish: (id: string) => `${MK}/social/posts/${seg(id)}/publish`,
  socialComments: `${MK}/social/comments`,
  socialComment: (id: string) => `${MK}/social/comments/${seg(id)}`,
  socialCommentOp: (id: string, op: 'reply' | 'hide' | 'private_reply') => `${MK}/social/comments/${seg(id)}/${op}`,
  socialSettings: `${MK}/social/settings`,
  socialPageSync: `${MK}/social/page/sync`,
  socialInsights: `${MK}/social/insights`,
  socialInsightsSync: `${MK}/social/insights/sync`,
  leadForms: `${MK}/meta/leads/forms`,
  leadFormArchive: (id: string) => `${MK}/meta/leads/forms/${seg(id)}/archive`,
  /** META-9D: the question types and thank you buttons a new form may use. */
  leadFormOptions: `${MK}/meta/leads/forms/options`,
  leads: `${MK}/meta/leads`,
  eventsHealth: `${MK}/meta/events/health`,
  eventsHealthRead: `${MK}/meta/events/health/read`,
  /** CAT-08 (META-9C): one product's state on the Meta catalog. */
  productMetaStatus: (productId: string) => `${CM}/products/${seg(productId)}/meta-status`,
  /** CAT-10 (META-9C): the API push, the hosted feed fallback and Meta's diagnostics; a person stops the fallback. */
  catalogHealth: (channelId: string) => `${CM}/channels/${seg(channelId)}/catalog-health`,
  feedFallback: (channelId: string) => `${CM}/channels/${seg(channelId)}/feed-fallback`,
} as const;

/* Shapes (contract section 3) */

export type SetupKey = 'business' | 'page' | 'instagram' | 'ad_account' | 'pixel' | 'catalog' | 'whatsapp';
export type SetupState = 'done' | 'todo' | 'blocked';
export type SetupNeed = 'connect' | 'permission' | 'pick' | 'review' | 'shopping_approval';

/**
 * The one action that fixes a row. The contract names `action` without a shape (CONTRACT QUESTION in the
 * lane report); a bare string is read as its `kind`.
 */
export interface SetupAction {
  kind: 'pick' | 'reconnect' | 'open' | 'wait' | string;
  /** The connection service whose resources the picker lists (`pages`, `instagram`, `ads`, `pixel`, ...). */
  service?: string | null;
  /** Where to finish it on Meta's side (Commerce Manager, Business settings). */
  url?: string | null;
  label?: string | null;
}

export interface SetupItem {
  key: SetupKey | string;
  state: SetupState | string;
  picked: { id: string; name: string } | null;
  needs: Array<SetupNeed | string>;
  action: SetupAction | null;
  /** The permissions this row is missing (not in the contract; falls back to the connection's `missing`). */
  missing_permissions?: string[];
  /** A sentence from the server for this row (META-9C: the `messaging` row says Instagram must allow message access). */
  note?: string | null;
  /** The row's own consent button (META-SETS); absent on a row no permission set covers. */
  login_set?: SetupLoginSet | null;
  /** The `pixel` row: every pixel of the store with its role (META-SETS). */
  pixels?: SetupPixel[];
}

/** One row's own Facebook consent: it asks for `services` only, so a freeze on another step cannot block it. */
export interface SetupLoginSet {
  key: string;
  state: 'connect' | 'reconnect' | 'connected' | string;
  /** Empty when there is nothing to press. */
  label: string;
  services: string[];
  error?: string | null;
}

/** `role` store = the store's own pixel, connected = added through the Meta connection. */
export interface SetupPixel {
  role: 'store' | 'connected' | string;
  pixel_id: string;
  name?: string | null;
  server: 'connection' | 'pasted_token' | 'browser_only' | string;
}

export interface MetaConnection {
  id: string;
  status: string;
  connected_as: string | null;
  token_expires_at: string | null;
  granted: string[];
  missing: string[];
  /* META-8 (docs/PORT_NOTES/META-8.md section 4): Meta's own token check. Optional: an older server leaves them out. */
  /** `business` (Facebook Login for Business) or `classic` (the older dialog; reconnect once). */
  login?: 'business' | 'classic' | string;
  /** `system_user` (does not expire, reaches only the picked assets) or `user` (a person's, expires). */
  token_kind?: 'system_user' | 'user' | string | null;
  token_valid?: boolean | null;
  token_never_expires?: boolean;
  data_access_expires_at?: string | null;
  token_checked_at?: string | null;
  token_error?: string | null;
  business?: { id: string; name: string } | null;
  /** What the token reaches, from Meta's granular scopes; `name` when the store picked it. */
  assets?: Array<{ id: string; kind: string | null; name: string | null; permissions: string[] }>;
  permissions_for_every_asset?: string[];
  configuration?: Array<{ permission: string; services: string[]; granted: boolean; on_system_user: boolean }>;
  /** One fix for the whole connection (`none` when nothing is needed). */
  action?: SetupAction | null;
  note?: string | null;
}

export interface MetaSetup { connection: MetaConnection | null; items: SetupItem[] }

export interface PickableResource { id: string; name: string; detail?: string | null }

export interface MetaProviderDef { key: string; label: string; services: Array<{ key: string; label: string }> }

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  effective_status: string | null;
  daily_budget_minor: number | null;
  lifetime_budget_minor: number | null;
  spend_minor: number | null;
  impressions: number | null;
  clicks: number | null;
  /** Percent, as Meta reports it (1.84 = 1.84%). */
  ctr: number | null;
  purchases: number | null;
  purchase_value_minor: number | null;
  roas: number | null;
  created_by_growcord: boolean;
}
export interface MetaCampaigns { synced_at: string | null; currency: string; rows: MetaCampaign[] }

export interface AiFeature { key: string; label: string; help: string; default: boolean | 'on' | 'off' | string }
export interface Placeholder { key: string; label: string }
/** carousel | single | collection (collection = Meta's Advantage catalog video cover). */
export type RemarketingFormat = 'carousel' | 'single' | 'collection';
/**
 * One ad format and the Meta AI features Meta documents for it. The per-format shape is a CONTRACT QUESTION
 * (the contract says only "per format"); a reply with a flat `ai_features` list is read as one list for every format.
 */
export interface FormatOption { key: RemarketingFormat | string; label: string; help?: string | null; ai_features: AiFeature[] }
export interface RemarketingOptions {
  pixel: { id: string; name: string } | null;
  catalog: { id: string; name: string } | null;
  countries_default: string[];
  formats: FormatOption[];
  placeholders: Placeholder[];
  currency?: string;
}

export type RemarketingEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout';
export interface DraftInput {
  name: string;
  product_set_id: string;
  include: Array<{ event: RemarketingEvent; days: number }>;
  exclude_purchased_days: number;
  daily_budget_minor: number;
  countries: string[];
  primary_text: string;
  headline: string;
  description: string;
  format: RemarketingFormat | string;
  ai_features: Record<string, 'on' | 'off'>;
}
export interface DraftPreview { placement: string; label?: string; html: string }
export interface RemarketingDraft extends Partial<DraftInput> {
  id: string;
  status?: string;
  previews?: DraftPreview[];
  created_at?: string | null;
}
export interface ApplyResult { campaign_id?: string | null; status?: string; name?: string | null }

export interface IgTag {
  product_id?: string | null;
  variation_id?: string | null;
  x: number;
  y: number;
  /** Display fields the admin list carries with each tag (CONTRACT QUESTION: the contract lists ids only). */
  name?: string | null;
  image?: string | null;
}
export interface IgPost {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
  tags: IgTag[];
  tagged_on_instagram?: boolean;
}
export interface IgShopping { can_tag_on_instagram: boolean; catalog_linked: boolean; reason: string | null }

/** The store's `instagram` setting (the same one Appearance writes; heading, count and layout are META-2's). */
export interface IgFeedSettings { isEnabled: boolean; username?: string; heading: string; count: number; layout: 'grid' | 'carousel' | string }

export type CatalogStatus = 'synced' | 'pending' | 'warning' | 'error' | 'excluded' | 'deleted';
export interface CatalogMessage { level: 'error' | 'warning' | 'info' | string; code: string; text: string }
export interface CatalogItem {
  variation_id: string | null;
  product_id: string;
  retailer_id: string;
  title: string;
  image: string | null;
  /** Major units after the v2 boundary (a wire Money becomes its number). */
  price: number | null;
  currency?: string;
  status: CatalogStatus | string;
  messages: CatalogMessage[];
  pushed_at: string | null;
  meta_review_status: string | null;
}
export interface CatalogSummary {
  mode: 'api' | 'feed' | string;
  realtime: boolean;
  catalog: { id: string; name: string } | null;
  counts: { total: number; synced: number; pending: number; warnings: number; errors: number; excluded: number };
  last_push_at: string | null;
  last_full_at: string | null;
  last_error: string | null;
  /** Where custom labels may come from (CONTRACT QUESTION: not in the contract yet). */
  label_sources?: Array<{ key: string; label: string }>;
  /**
   * CAT-12 (META-9C): the seeded value of every channel config key, so an empty field shows what applies instead of
   * the screen typing the server's defaults.
   */
  config_defaults?: {
    batch_size?: number; batch_max?: number; auto_map?: boolean; margin_bands?: number[]; stock_bands?: number[];
    attribute_fields?: Record<string, string[]>; feed_fallback?: boolean; feed_fallback_hours?: number; feed_fallback_interval?: string;
    diagnostics?: boolean; localized?: { countries?: boolean; languages?: string[]; content_mode?: string };
  } | null;
  /** Meta's variant fields `attribute_fields` may fill. */
  variant_fields?: string[] | null;
  /** The store's active attributes (`key` is the attribute slug), for the attribute pickers. */
  attributes?: Array<{ key: string; label: string }> | null;
}

/** One of Meta's catalog diagnostics (META-9C `Diagnostic`). */
export interface CatalogDiagnostic {
  kind: string;
  /** MUST_FIX or OPPORTUNITY. */
  severity: string;
  title: string;
  text: string | null;
  action: string | null;
  action_uri: string | null;
  affected_items: number | null;
  entity: string | null;
  sample_ids: string[];
}
/** `GET /channels/{id}/catalog-health` (META-9C section 2). */
export interface CatalogHealth {
  api_failing_since: string | null;
  api_last_ok_at: string | null;
  api_last_error: string | null;
  /** state: off, active (Meta fetches the hosted feed), standby (the API works again, the feed still runs), failed. */
  fallback: { state: string; feed_id: string | null; since: string | null; error: string | null; feed_url: string | null };
  diagnostics: CatalogDiagnostic[];
  diagnostics_read_at: string | null;
  diagnostics_error: string | null;
  localized_at: string | null;
  localized_error: string | null;
  note: string | null;
}

/** The store's `catalogFacts` setting (CAT-11): what the Meta catalog sends when a product and its brand state none. */
export interface CatalogFacts {
  originCountry: string;
  importerName: string;
  importerAddress: { street1: string; street2: string; city: string; region: string; postalCode: string; country: string };
  manufacturerInfo: string;
}
export interface CatalogPage { items: CatalogItem[]; total: number; pages: number }

export interface ProductSetFilter {
  category_ids?: string[];
  price_min_minor?: number | null;
  price_max_minor?: number | null;
  in_stock_only?: boolean;
}
export interface ProductSet { id: string; name: string; filter: ProductSetFilter | Record<string, unknown>; product_count?: number | null }

export interface StoreChannel {
  id: string;
  platform_code: string;
  display_name?: string | null;
  config: Record<string, any>;
  is_active: boolean;
  last_push_at?: string | null;
  last_error?: string | null;
  feed_url?: string | null;
}
export interface ChannelPlatform { code: string; name: string }
export interface SyncResult { ok?: number; total?: number; error?: number }

export interface WaCatalogStatus { catalog_id: string | null; linked: boolean; catalog_visible: boolean; cart_enabled: boolean }

export interface ProductHit { product_id: string; variation_id: string | null; name: string; sku?: string | null; image?: string | null }
export interface StoreCategory { id: string; name: string; parent_id?: string | null }

/**
 * What the Events page reads from the store's `metaPixel` setting. One pixel id (REUSE-02, EVT-08): the browser
 * pixel and the server events both use `metaPixel.pixelId`; `tracking.metaPixelId` is read only as the fallback
 * for one release (META-16 section 6), and `pixelIdFromFallback` says when that is where it came from.
 */
export interface EventSettings {
  pixelId: string | null;
  pixelIdFromFallback: boolean;
  serverEventsOn: boolean;
  serverTokenSet: boolean;
  /** Meta's test code while set: every server event goes to Test Events. */
  testEventCode: string;
  /** Delivered, RTO, COD confirmed, staff and WhatsApp orders as server events (default on). */
  businessEvents: boolean;
  /** Product level events with SKUs (DEC-076, default on). */
  productLevelEvents: boolean;
}

/** The one pixel id: `metaPixel.pixelId`, else the older `tracking.metaPixelId` (META-16 section 6, one release). */
export function pixelIdOf(settings: Record<string, any> | null | undefined): { id: string; fromFallback: boolean } {
  const own = String(settings?.metaPixel?.pixelId ?? '').trim();
  if (own) return { id: own, fromFallback: false };
  const old = String(settings?.tracking?.metaPixelId ?? '').trim();
  return { id: old, fromFallback: !!old };
}

/* Transport */

/** True when the development mock answers (dev server and `?mock=meta`). */
export function metaMockOn(): boolean {
  if (!import.meta.env.DEV) return false;
  try { return new URLSearchParams(window.location.search).get('mock') === 'meta'; } catch { return false; }
}

async function via<T>(real: () => Promise<T>, mock: (m: MetaMock) => T | Promise<T>): Promise<T> {
  if (import.meta.env.DEV && metaMockOn()) {
    const mod = await import('./meta.mock');
    return mock(mod.metaMock);
  }
  return real();
}

async function call<T>(method: string, path: string, opts: { params?: Record<string, unknown>; data?: unknown } = {}): Promise<T> {
  if (!V2_ENABLED) backendGap(`${method} ${path} (this build is not on the v2 API)`);
  return v2call<T>(method, path, opts);
}

const asArray = <T,>(d: unknown, key?: string): T[] => {
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === 'object' && key && Array.isArray((d as any)[key])) return (d as any)[key] as T[];
  return [];
};

/** `formats: [{key, label, help, ai_features}]`, or `ai_features` keyed by format, or one flat list. */
const formatsOf = (d: any): FormatOption[] => {
  if (Array.isArray(d?.formats) && d.formats.length && typeof d.formats[0] === 'object') {
    return d.formats.map((f: any) => ({ key: f.key, label: f.label ?? f.key, help: f.help ?? null, ai_features: asArray<AiFeature>(f.ai_features) }));
  }
  const keys: string[] = Array.isArray(d?.formats) ? d.formats : ['carousel', 'single', 'collection'];
  const byFormat = d?.ai_features && !Array.isArray(d.ai_features) ? d.ai_features : null;
  return keys.map((k) => ({ key: k, label: k, help: null, ai_features: byFormat ? asArray<AiFeature>(byFormat[k]) : asArray<AiFeature>(d?.ai_features) }));
};

const normAction = (a: unknown): SetupAction | null => {
  if (!a) return null;
  if (typeof a === 'string') return { kind: a };
  return a as SetupAction;
};

/** A route's list metadata (survives `asList`). */
const totalOf = (list: unknown, fallback: number): number => {
  const t = (list as { total?: unknown })?.total;
  return typeof t === 'number' ? t : fallback;
};

/* Calls */

export const metaApi = {
  /* Setup */
  setup: () => via<MetaSetup>(
    async () => {
      const d = await call<any>('GET', META_PATHS.setup);
      return { connection: d?.connection ?? null, items: asArray<any>(d?.items).map((i) => ({ ...i, needs: i?.needs ?? [], action: normAction(i?.action) })) };
    },
    (m) => m.setup(),
  ),
  /** The Meta provider's services, from the same list Platform Connections renders. */
  provider: () => via<MetaProviderDef | null>(
    async () => {
      const r = await api.get('/connectors/providers');
      const list = asArray<MetaProviderDef>((r as any)?.data?.data ?? (r as any)?.data);
      return list.find((p) => p.key === 'meta') ?? null;
    },
    (m) => m.provider(),
  ),
  /** Start or extend the Meta connection through the shared consent flow; answers a problem in words, or null. */
  connect: (services: string[], connectionId: string | null, returnTo: string) => via<string | null>(
    () => startConnect('meta', services, connectionId, returnTo),
    () => 'Sample data: connecting to Meta is switched off in this preview.',
  ),
  resources: (connectionId: string, service: string) => via<PickableResource[]>(
    async () => asArray<PickableResource>(await call<any>('GET', META_PATHS.resources(connectionId, service)), 'resources'),
    (m) => m.resources(service),
  ),
  pick: (connectionId: string, service: string, r: PickableResource) => via<unknown>(
    () => call('PUT', META_PATHS.service(connectionId, service), { data: { is_enabled: true, external_resource_id: r.id, external_resource_name: r.name } }),
    (m) => m.pick(service, r),
  ),

  /* Campaigns */
  campaigns: (q: { from?: string; to?: string; status?: string }) => via<MetaCampaigns>(
    async () => {
      const d = await call<any>('GET', META_PATHS.campaigns, { params: q });
      return { synced_at: d?.synced_at ?? null, currency: d?.currency || 'INR', rows: asArray<MetaCampaign>(d?.rows) };
    },
    (m) => m.campaigns(q),
  ),
  syncCampaigns: () => via<unknown>(() => call('POST', META_PATHS.campaignsSync, { data: {} }), (m) => m.syncCampaigns()),
  setCampaignStatus: (externalId: string, status: 'ACTIVE' | 'PAUSED') => via<unknown>(
    () => call('POST', META_PATHS.campaignStatus(externalId), { data: { status } }),
    (m) => m.setCampaignStatus(externalId, status),
  ),
  setCampaignBudget: (externalId: string, dailyBudgetMinor: number) => via<unknown>(
    () => call('POST', META_PATHS.campaignBudget(externalId), { data: { daily_budget_minor: dailyBudgetMinor } }),
    (m) => m.setCampaignBudget(externalId, dailyBudgetMinor),
  ),

  /* Dynamic remarketing */
  remarketingOptions: () => via<RemarketingOptions>(
    async () => {
      const d = await call<any>('GET', META_PATHS.remarketingOptions);
      return {
        pixel: d?.pixel ?? null,
        catalog: d?.catalog ?? null,
        countries_default: asArray<string>(d?.countries_default),
        formats: formatsOf(d),
        placeholders: asArray<any>(d?.placeholders).map((p) => (typeof p === 'string' ? { key: p, label: p } : p)),
        currency: d?.currency,
      };
    },
    (m) => m.remarketingOptions(),
  ),
  createDraft: (input: DraftInput) => via<RemarketingDraft>(() => call('POST', META_PATHS.drafts, { data: input }), (m) => m.createDraft(input)),
  draft: (id: string) => via<RemarketingDraft>(() => call('GET', META_PATHS.draft(id)), (m) => m.draft(id)),
  refreshPreviews: (id: string) => via<RemarketingDraft>(() => call('POST', META_PATHS.draftPreviews(id), { data: {} }), (m) => m.draft(id)),
  applyDraft: (id: string) => via<ApplyResult>(() => call('POST', META_PATHS.draftApply(id), { data: {} }), (m) => m.applyDraft(id)),
  discardDraft: (id: string) => via<unknown>(() => call('POST', META_PATHS.draftDiscard(id), { data: {} }), (m) => m.discardDraft(id)),

  /* Instagram */
  igPosts: (limit = 24) => via<IgPost[]>(
    async () => asArray<IgPost>(await call<any>('GET', META_PATHS.igPosts, { params: { limit } }), 'posts'),
    (m) => m.igPosts(limit),
  ),
  igRefresh: () => via<unknown>(() => call('POST', META_PATHS.igRefresh, { data: {} }), (m) => m.igRefresh()),
  igSaveTags: (mediaId: string, tags: IgTag[], pushToInstagram: boolean) => via<unknown>(
    () => call('PUT', META_PATHS.igTags(mediaId), {
      data: {
        tags: tags.map((t) => (t.variation_id ? { variation_id: t.variation_id, x: t.x, y: t.y } : { product_id: t.product_id, x: t.x, y: t.y })),
        push_to_instagram: pushToInstagram,
      },
    }),
    (m) => m.igSaveTags(mediaId, tags, pushToInstagram),
  ),
  igShopping: () => via<IgShopping>(() => call('GET', META_PATHS.igShopping), (m) => m.igShopping()),
  /** The store's `instagram` setting, read from the same admin settings call Appearance uses. */
  igFeedSettings: () => via<IgFeedSettings>(
    async () => {
      const r = await api.get('/settings/admin');
      const ig = ((r as any)?.data?.instagram ?? {}) as Record<string, any>;
      return { isEnabled: !!ig.isEnabled, username: ig.username, heading: ig.heading ?? '', count: Number(ig.count) || 0, layout: ig.layout || '' };
    },
    (m) => m.igFeedSettings(),
  ),
  /** Saved through the existing `PUT /settings` (one registry write per section; untouched fields stay). */
  saveIgFeedSettings: (s: IgFeedSettings) => via<unknown>(
    () => api.put('/settings', { instagram: { isEnabled: s.isEnabled, heading: s.heading, count: s.count, layout: s.layout } }),
    (m) => m.saveIgFeedSettings(s),
  ),
  searchProducts: (q: string) => via<ProductHit[]>(
    async () => (await productsAPI.searchVariations(q, 12)).map((r: any) => ({
      product_id: r.product_id || r.productId || r.id,
      variation_id: (r.product_id || r.productId) ? r.id : null,
      name: r.name || r.product_name || '',
      sku: r.sku ?? null,
      image: Array.isArray(r.images) ? r.images[0] : (r.image || r.product_image || null),
    })),
    (m) => m.searchProducts(q),
  ),

  /* Catalog (commerce channels) */
  channels: () => via<StoreChannel[]>(async () => (await channelsAPI.getConnections()) as StoreChannel[], (m) => m.channels()),
  platform: (code: string) => via<ChannelPlatform | null>(
    async () => ((await channelsAPI.getPlatforms()) as ChannelPlatform[]).find((p) => p.code === code) ?? null,
    (m) => m.platform(code),
  ),
  createChannel: (code: string, displayName: string) => via<StoreChannel>(
    () => channelsAPI.createConnection({ platform_code: code, display_name: displayName, fields: {}, sync_inventory: true, sync_listings: true, sync_orders: false }),
    (m) => m.createChannel(code, displayName),
  ),
  /** The channel's existing PATCH; `config` is sent whole (the current config with the changes on top). */
  saveChannelConfig: (id: string, config: Record<string, any>) => via<unknown>(
    () => channelsAPI.updateConnection(id, { config }),
    (m) => m.saveChannelConfig(id, config),
  ),
  syncChannel: (id: string) => via<SyncResult | null>(async () => (await channelsAPI.syncNow(id)) ?? null, (m) => m.syncChannel(id)),
  catalogSummary: (channelId: string) => via<CatalogSummary>(() => call('GET', META_PATHS.catalogSummary(channelId)), (m) => m.catalogSummary()),
  catalogItems: (channelId: string, q: { status?: string; q?: string; page?: number }) => via<CatalogPage>(
    async () => {
      const list = await call<any>('GET', META_PATHS.catalogItems(channelId), { params: q });
      const items = asArray<CatalogItem>(list, 'items');
      const total = totalOf(list, items.length);
      const pages = Number((list as any)?.pages) || Math.max(1, Math.ceil(total / Math.max(1, Number((list as any)?.limit) || items.length || 1)));
      return { items, total, pages };
    },
    (m) => m.catalogItems(q),
  ),
  productSets: (channelId: string) => via<ProductSet[]>(
    async () => asArray<ProductSet>(await call<any>('GET', META_PATHS.productSets(channelId)), 'items'),
    (m) => m.productSets(),
  ),
  createProductSet: (channelId: string, name: string, filter: ProductSetFilter) => via<ProductSet>(
    () => call('POST', META_PATHS.productSets(channelId), { data: { name, filter } }),
    (m) => m.createProductSet(name, filter),
  ),
  categories: () => via<StoreCategory[]>(
    async () => {
      const d: any = await categoriesAPI.list();
      return asArray<any>(d?.data ?? d).map((c) => ({ id: String(c.id ?? c._id), name: c.name, parent_id: c.parent_id ?? c.parentId ?? c.parent ?? null }));
    },
    (m) => m.categories(),
  ),

  /* WhatsApp */
  waCatalogStatus: (numberId: string) => via<WaCatalogStatus>(() => call('GET', META_PATHS.waCatalogStatus, { params: { number_id: numberId } }), (m) => m.waCatalogStatus()),
  waCatalogConnect: (body: { number_id: string; catalog_id: string; catalog_visible: boolean; cart_enabled: boolean }) => via<WaCatalogStatus>(
    () => call('POST', META_PATHS.waCatalogConnect, { data: body }),
    (m) => m.waCatalogConnect(body),
  ),

  /* Events: the store's `metaPixel` setting (one pixel id, EVT-08) */
  eventSettings: () => via<EventSettings>(
    async () => {
      const r = await api.get('/settings/admin');
      const s = ((r as any)?.data ?? {}) as Record<string, any>;
      const px = pixelIdOf(s);
      const mp = (s.metaPixel ?? {}) as Record<string, any>;
      return {
        pixelId: px.id || null,
        pixelIdFromFallback: px.fromFallback,
        serverEventsOn: mp.isEnabled === true,
        serverTokenSet: !!(mp.accessTokenSet || mp.useEnvVars),
        testEventCode: String(mp.testEventCode ?? ''),
        businessEvents: mp.businessEvents !== false,
        productLevelEvents: mp.productLevelEvents !== false,
      };
    },
    (m) => m.eventSettings(),
  ),
  /**
   * Change fields of the `metaPixel` setting through the existing `PUT /settings` (the same write API and
   * Integrations makes). The section is sent whole: the stored object (as `GET /settings/admin` answers it) with
   * the changes on top and no token, so the saved token stays (`settings_secrets.rs` `token_section`).
   */
  saveEventSettings: (patch: Partial<{ pixelId: string; testEventCode: string; businessEvents: boolean; productLevelEvents: boolean }>) => via<unknown>(
    async () => {
      const r = await api.get('/settings/admin');
      const stored = { ...(((r as any)?.data?.metaPixel ?? {}) as Record<string, any>) };
      delete stored.accessToken;
      return api.put('/settings', { metaPixel: { ...stored, ...patch } });
    },
    (m) => m.saveEventSettings(patch),
  ),
};

/* ================================================================================================================
 * Wave 2 (contract `growcord-rs/docs/briefs/META-W2-ads-contract.md`, lane META-15A): the Ads Manager tree at three
 * levels and its operations, creating any objective and format, targeting search, audiences, the creative library,
 * insights and alerts. Money stays in integer minor units of the ad account currency (`*_minor`); `ctr` is a percent.
 * Where the contract names a field without its shape, the shape read here is marked CONTRACT QUESTION.
 * ============================================================================================================== */

export type AdLevel = 'campaign' | 'adset' | 'ad';

export interface AdMetrics {
  spend_minor: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  /** Percent, as Meta reports it (1.84 = 1.84%). */
  ctr: number | null;
  cpc_minor: number | null;
  cpm_minor: number | null;
  results: number;
  result_type: string | null;
  cost_per_result_minor: number | null;
  purchases: number;
  purchase_value_minor: number;
  roas: number | null;
}

export interface AdBudget { kind: 'daily' | 'lifetime' | 'none' | string; amount_minor: number | null; at: 'campaign' | 'adset' | null | string }
export interface AdIssue { code: string; text: string }

export interface AdRow {
  id: string;
  level: AdLevel;
  parent_id: string | null;
  name: string;
  status: string;
  effective_status: string | null;
  objective: string | null;
  budget: AdBudget;
  bid_strategy: string | null;
  optimization_goal: string | null;
  schedule: { start: string | null; end: string | null };
  delivery: { status: string | null; issues: AdIssue[] };
  review: { status: string | null; reasons: string[] };
  created_by_growcord: boolean;
  metrics: AdMetrics;
  /** The parent's name on ad set and ad rows (CONTRACT QUESTION: not in the contract; the screen falls back to the id). */
  parent_name?: string | null;
}

export interface AdTree {
  synced_at: string | null;
  currency: string;
  totals: AdMetrics;
  rows: AdRow[];
  total: number;
  page: number;
  pages: number;
}

export interface AdTreeQuery {
  level: AdLevel;
  parent_id?: string;
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
}

/** One placement preview: Meta's preview link, or its iframe HTML (CONTRACT QUESTION: the contract says "preview links"). */
export interface AdPreview { placement: string; label?: string | null; url?: string | null; html?: string | null }

export interface AdTargeting {
  countries?: string[];
  regions?: Array<{ key: string; name?: string }>;
  cities?: Array<{ key: string; name?: string; radius_km?: number }>;
  age_min?: number;
  age_max?: number;
  genders?: string[];
  languages?: Array<{ key: string; name?: string }> | string[];
  interests?: Array<{ id: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
  custom_audiences?: Array<{ id: string; name?: string }> | string[];
  excluded_audiences?: Array<{ id: string; name?: string }> | string[];
  advantage_audience?: boolean;
}

export interface AdCreativeSpec {
  format?: string | null;
  texts?: { primary?: string[]; headlines?: string[]; descriptions?: string[] };
  link?: string | null;
  call_to_action?: string | null;
  url_parameters?: string | null;
  media?: Array<{ id: string; type?: string; url?: string | null; thumbnail_url?: string | null }>;
  post_id?: string | null;
  ai_features?: Record<string, 'on' | 'off' | boolean | string>;
  previews?: AdPreview[];
}

export interface AdDetail extends AdRow {
  spec: {
    targeting?: AdTargeting | null;
    placements?: 'auto' | string[] | null;
    promoted_object?: Record<string, unknown> | null;
    destination?: string | null;
    conversion_event?: string | null;
    attribution?: string | null;
    creative?: AdCreativeSpec | null;
  };
  /** Children counts for the side panel (CONTRACT QUESTION: not in the contract). */
  children?: { adsets?: number; ads?: number } | null;
}

export type BulkAction = 'pause' | 'resume' | 'budget_percent' | 'end';

/** A recommendation or an issue to act on (CONTRACT QUESTION: the contract names the route, not the row shape). */
export interface AdRecommendation {
  id: string;
  kind: string;
  level: AdLevel | 'account' | string;
  object_id: string | null;
  object_name: string | null;
  title: string;
  text: string;
  /** Meta's estimate of the effect, in its words. */
  impact?: string | null;
  can_apply: boolean;
  /** What "apply" changes, in words, shown in the confirm (money included). */
  apply_text?: string | null;
  since: string | null;
}

export interface RuleCondition { metric: string; op: 'gt' | 'lt' | 'gte' | 'lte' | string; value: number }
export interface RuleAction { kind: 'pause' | 'resume' | 'budget_percent' | 'notify' | string; value?: number | null }
/** An automated rule (CONTRACT QUESTION: the row shape is not in the contract; this is what the screen reads and sends). */
export interface AdRule {
  id: string;
  name: string;
  enabled: boolean;
  level: AdLevel;
  /** Empty: every object at that level. */
  ids: string[];
  window_days: number;
  conditions: RuleCondition[];
  action: RuleAction;
  schedule?: 'hourly' | 'daily' | string;
  last_run_at?: string | null;
  last_triggered_at?: string | null;
  triggered_count?: number | null;
}
export type RuleInput = Omit<AdRule, 'id' | 'last_run_at' | 'last_triggered_at' | 'triggered_count'>;

export interface AdTestCell { id: string; name: string; object_ids: string[]; metrics: AdMetrics | null; is_winner?: boolean }
/** A split test (CONTRACT QUESTION: the row shape is not in the contract). */
export interface AdTest {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled' | string;
  kind: 'adset' | 'campaign' | string;
  metric: string;
  start: string | null;
  end: string | null;
  cells: AdTestCell[];
  winner_cell_id: string | null;
  /** Meta's confidence in the winner, percent. */
  confidence: number | null;
}
export interface TestInput { name: string; kind: 'adset' | 'campaign'; metric: string; start: string; end: string; cells: Array<{ name: string; object_ids: string[] }> }

export interface OptionItem { key: string; label: string; help?: string | null }
export interface AdsFormat extends OptionItem { ai_features: AiFeature[] }
/** One way an objective can run (META-9B): where it sends people and what the store must have set up first. */
export interface AdsRoute {
  destination: string;
  destination_type: string | null;
  optimization_goals: OptionItem[];
  formats: string[];
  /** What must be picked on the Meta connection first: `page`, `pixel`, `app`, `catalog`. */
  needs: string[];
  note: string | null;
}
export interface AdsObjective extends OptionItem {
  destinations: string[];
  optimization_goals: OptionItem[];
  formats: AdsFormat[];
  /** The ways it can run; the server always answers them (absent only in older sample data). */
  routes?: AdsRoute[];
}
export interface BidStrategy extends OptionItem { needs?: 'bid_amount' | 'cost_cap' | 'roas' | null | string }
export interface Placement { key: string; label: string; platform: string }
export interface MetricOption { key: string; label: string; kind: 'money' | 'count' | 'percent' | 'ratio' | string }
export interface AdsOptions {
  objectives: AdsObjective[];
  bid_strategies: BidStrategy[];
  call_to_actions: OptionItem[];
  placements: Placement[];
  special_ad_categories: OptionItem[];
  warnings: Array<{ code?: string; text: string }>;
  /** Labels and help for destination keys (CONTRACT QUESTION: the contract lists the keys only). */
  destinations: OptionItem[];
  /** The store dataset's conversion events (CONTRACT QUESTION). */
  conversion_events: OptionItem[];
  /** Metrics a rule may test and a split test may compare (CONTRACT QUESTION). */
  rule_metrics: MetricOption[];
  /** The URL parameters the store's attribution settings fill in, shown as the default. */
  url_parameters_default?: string | null;
  /** The longest lists Meta takes per text field. */
  text_limits?: { primary: number; headlines: number; descriptions: number } | null;
  /** ADS-12 (META-9B): catalog ad layouts, the store's registered apps, the longest text per field. */
  catalog_layouts?: OptionItem[];
  apps?: OptionItem[];
  text_lengths?: { primary: number; headlines: number; descriptions: number } | null;
}

export interface AdsDraftInput {
  kind: string;
  name: string;
  campaign: {
    objective: string;
    budget: { kind: 'daily' | 'lifetime'; amount_minor: number } | null;
    bid_strategy: string | null;
    /** Cost cap or bid cap amount, and the ROAS goal (CONTRACT QUESTION: the contract names only `bid_strategy`). */
    bid_amount_minor?: number | null;
    roas_target?: number | null;
    special_ad_categories: string[];
    /** ADS-12: the countries a special ad category applies in (META-9B; default: the targeted countries). */
    special_ad_category_country?: string[];
    /** ADS-12: the most the campaign may ever spend, minor units (Meta's spend cap). */
    spend_cap_minor?: number | null;
    schedule: { start: string | null; end: string | null };
  };
  adset: {
    destination: string;
    optimization_goal: string | null;
    conversion_event: string | null;
    targeting: {
      countries: string[];
      regions: string[];
      cities: Array<{ key: string; radius_km: number }>;
      age_min: number;
      age_max: number;
      genders: string[];
      languages: string[];
      interests: Array<{ id: string; name: string }>;
      behaviors: Array<{ id: string; name: string }>;
      custom_audiences: string[];
      excluded_audiences: string[];
      advantage_audience: boolean;
    };
    placements: 'auto' | string[];
    schedule: { start: string | null; end: string | null };
    budget: { kind: 'daily' | 'lifetime'; amount_minor: number } | null;
    /** Phone number for call ads (CONTRACT QUESTION). */
    phone?: string | null;
    /** ADS-12: the registered app for App promotion (a key of the options' `apps`). */
    app?: string | null;
  };
  creative: {
    format: string;
    media: string[];
    post_id: string | null;
    product_set_id?: string | null;
    texts: { primary: string[]; headlines: string[]; descriptions: string[] };
    link: string | null;
    call_to_action: string | null;
    url_parameters: string | null;
    lead_form_id: string | null;
    ai_features: Record<string, 'on' | 'off'>;
    /** ADS-12: a catalog ad's layout (a key of the options' `catalog_layouts`). */
    catalog_layout?: string | null;
    /** ADS-12: a carousel card's own headline, description and link, one per picked media item, in order. */
    cards?: Array<{ headline?: string | null; description?: string | null; link?: string | null }>;
    /** META-19: the Instant Experience the ad opens (one made here, or Meta's id of one on the Page). */
    canvas_id?: string | null;
  };
}
export interface AdsDraft extends Partial<AdsDraftInput> {
  id: string;
  status?: string;
  previews?: AdPreview[];
  created_at?: string | null;
  /** Meta's warnings for this draft (for example a health word in a text). */
  warnings?: Array<{ code?: string; text: string }>;
}

export type TargetingType = 'interests' | 'behaviors' | 'locations' | 'languages';
export interface TargetingHit {
  id: string;
  name: string;
  type: string;
  /** Interest path, or the country and region of a place. */
  path?: string[] | null;
  size_low?: number | null;
  size_high?: number | null;
  /** For a place: country, region or city. */
  kind?: 'country' | 'region' | 'city' | string | null;
  country_code?: string | null;
}

export type AudienceType = 'website' | 'engagement' | 'customer_list' | 'lookalike' | 'saved';
export interface MetaAudience {
  id: string;
  type: AudienceType | string;
  name: string;
  size_low: number | null;
  size_high: number | null;
  status: string;
  spec: Record<string, any>;
  /** Meta's reason when it is not ready, or a health word warning (CONTRACT QUESTION). */
  note?: string | null;
  created_at?: string | null;
}

export interface LibraryItem {
  id: string;
  type: 'image' | 'video' | string;
  name: string;
  url: string | null;
  thumbnail_url: string | null;
  /** uploading | processing | ready | error */
  status: string;
  /** Video processing, percent. */
  progress?: number | null;
  error?: string | null;
  width?: number | null;
  height?: number | null;
  duration_s?: number | null;
  used_in?: number | null;
  created_at?: string | null;
  /** The store storage key it came from (CONTRACT QUESTION: what a gallery id is). */
  gallery_id?: string | null;
}

export type Breakdown = 'none' | 'age' | 'gender' | 'age_gender' | 'country' | 'region' | 'placement' | 'device' | 'product_id' | 'hour' | 'creative';
export type Attribution = 'default' | '7d_click' | '1d_click' | '7d_click_1d_view';
export interface InsightMetrics extends AdMetrics {
  landing_page_views?: number;
  add_to_carts?: number;
  checkouts?: number;
  video_plays?: number;
  thruplays?: number;
  leads?: number;
}
export interface InsightsQuery {
  level: 'account' | AdLevel;
  ids?: string;
  from?: string;
  to?: string;
  breakdown?: Breakdown;
  attribution?: Attribution;
  compare?: 'none' | 'previous';
}
export interface Insights {
  currency: string;
  synced_at: string | null;
  totals: InsightMetrics;
  compare_totals: InsightMetrics | null;
  series: Array<InsightMetrics & { date: string }>;
  rows: Array<InsightMetrics & { key: string; label: string }>;
  store_truth: { orders: number; revenue_minor: number; matched_by: string[]; currency?: string; by_method?: Record<string, { orders: number; revenue_minor: number }> } | null;
  /* META-10 adds (docs/PORT_NOTES/META-10.md): the choices as data, plain notes, and a long report still running. */
  choices?: { breakdowns?: Array<{ key: string; label: string; note?: string | null }>; attributions?: Array<{ key: string; label: string }> } | null;
  notes?: string[];
  report?: { status?: string; running?: boolean; errors?: unknown } | null;
}

export interface MetaAlert {
  level: 'account' | AdLevel | string;
  id: string | null;
  /** The object's name, and the numbers behind the alert (META-10). */
  name?: string | null;
  detail?: Record<string, unknown> | null;
  kind: 'spend_no_sales' | 'roas_below' | 'cpa_spike' | 'frequency' | 'rejected' | 'account_issue' | 'token' | string;
  text: string;
  since: string | null;
}

/** `POST /meta/insights/sync`: what each level's read came to. */
export interface InsightsSyncResult { status: string; from: string; to: string; levels: Record<string, { status?: string; error?: string | null; rows?: number; retry_after_minutes?: number | null }>; note: string | null }

/** One alert rule of the `meta_insights` store setting (META-10 seeded defaults; every field optional by kind). */
export interface AlertRuleSetting {
  enabled: boolean;
  days?: number;
  recent_days?: number;
  baseline_days?: number;
  percent?: number;
  min_purchases?: number;
  /** A decimal as text, as the setting keeps it ("1.5"). */
  target?: string;
  max?: string;
  min_spend_minor?: number | null;
  aov_multiple?: string | null;
  expires_within_days?: number;
}
export interface InsightsAlertSettings {
  levels?: string[];
  sales_objectives?: string[];
  aov_days?: number;
  spend_no_sales?: AlertRuleSetting;
  roas_below?: AlertRuleSetting;
  cpa_spike?: AlertRuleSetting;
  frequency?: AlertRuleSetting;
  rejected?: AlertRuleSetting;
  account_issue?: AlertRuleSetting;
  token?: AlertRuleSetting;
}
/** `GET|PATCH /meta/insights/settings`: in force, the seeded defaults, what the store changed, the choices. */
export interface InsightsSettings {
  settings: { sync?: Record<string, unknown>; result_types?: Record<string, unknown>; alerts?: InsightsAlertSettings; store_truth?: Record<string, unknown> };
  defaults: InsightsSettings['settings'];
  stored: Partial<InsightsSettings['settings']>;
  choices: NonNullable<Insights['choices']>;
}

const ZERO_METRICS: AdMetrics = {
  spend_minor: 0, impressions: 0, reach: 0, frequency: null, clicks: 0, ctr: null, cpc_minor: null, cpm_minor: null,
  results: 0, result_type: null, cost_per_result_minor: null, purchases: 0, purchase_value_minor: 0, roas: null,
};
const metricsOf = (m: any): AdMetrics => ({ ...ZERO_METRICS, ...(m ?? {}) });
const rowOf = (r: any): AdRow => ({
  ...r,
  budget: r?.budget ?? { kind: 'none', amount_minor: null, at: null },
  schedule: r?.schedule ?? { start: null, end: null },
  delivery: { status: r?.delivery?.status ?? null, issues: asArray<AdIssue>(r?.delivery?.issues) },
  review: { status: r?.review?.status ?? null, reasons: asArray<string>(r?.review?.reasons) },
  metrics: metricsOf(r?.metrics),
});
const optionsOf = (d: any): AdsOptions => ({
  objectives: asArray<any>(d?.objectives).map((o) => ({
    key: o.key, label: o.label ?? o.key, help: o.help ?? null,
    destinations: asArray<string>(o.destinations),
    optimization_goals: asArray<OptionItem>(o.optimization_goals),
    formats: asArray<any>(o.formats).map((f) => ({
      key: f.key, label: f.label ?? f.key, help: f.help ?? null, ai_features: asArray<AiFeature>(f.ai_features),
      /* META-19: a collection from an Instant Experience takes these instead of the catalog's. */
      ...(Array.isArray(f.canvas_ai_features) ? { canvas_ai_features: asArray<AiFeature>(f.canvas_ai_features) } : {}),
    })),
    routes: asArray<any>(o.routes).map((r) => ({
      destination: String(r?.destination ?? ''),
      destination_type: r?.destination_type ?? null,
      optimization_goals: asArray<OptionItem>(r?.optimization_goals),
      formats: asArray<string>(r?.formats),
      needs: asArray<string>(r?.needs),
      note: r?.note ?? null,
    })),
  })),
  bid_strategies: asArray<BidStrategy>(d?.bid_strategies),
  call_to_actions: asArray<OptionItem>(d?.call_to_actions),
  placements: asArray<Placement>(d?.placements),
  special_ad_categories: asArray<OptionItem>(d?.special_ad_categories),
  warnings: asArray<any>(d?.warnings).map((w) => (typeof w === 'string' ? { text: w } : w)),
  destinations: asArray<OptionItem>(d?.destinations),
  conversion_events: asArray<OptionItem>(d?.conversion_events),
  rule_metrics: asArray<MetricOption>(d?.rule_metrics),
  url_parameters_default: d?.url_parameters_default ?? null,
  text_limits: d?.text_limits ?? null,
  catalog_layouts: asArray<OptionItem>(d?.catalog_layouts),
  apps: asArray<OptionItem>(d?.apps),
  text_lengths: d?.text_lengths ?? null,
  /* META-19: which ads open an Instant Experience. */
  canvas: d?.canvas ?? null,
});
const insightsOf = (d: any): Insights => ({
  currency: d?.currency || 'INR',
  synced_at: d?.synced_at ?? null,
  totals: metricsOf(d?.totals),
  compare_totals: d?.compare_totals ? metricsOf(d.compare_totals) : null,
  series: asArray<any>(d?.series).map((s) => ({ ...metricsOf(s), ...s })),
  rows: asArray<any>(d?.rows).map((s) => ({ ...metricsOf(s), ...s })),
  store_truth: d?.store_truth ?? null,
  choices: d?.choices ?? null,
  notes: asArray<string>(d?.notes),
  report: d?.report ?? null,
});

export const metaAdsApi = {
  /* A. Tree and operations (META-9A) */
  tree: (q: AdTreeQuery) => via<AdTree>(
    async () => {
      const d = await call<any>('GET', META_PATHS.adsTree, { params: { ...q } });
      const rows = asArray<any>(d?.rows ?? d).map(rowOf);
      return {
        synced_at: d?.synced_at ?? null, currency: d?.currency || 'INR', totals: metricsOf(d?.totals), rows,
        total: Number(d?.total ?? totalOf(d, rows.length)) || rows.length, page: Number(d?.page) || 1, pages: Number(d?.pages) || 1,
      };
    },
    (m) => m.adsTree(q),
  ),
  detail: (level: AdLevel, id: string) => via<AdDetail>(
    async () => { const d = await call<any>('GET', META_PATHS.adObject(level, id)); return { ...rowOf(d), spec: d?.spec ?? {}, children: d?.children ?? null }; },
    (m) => m.adDetail(level, id),
  ),
  setStatus: (level: AdLevel, id: string, status: 'ACTIVE' | 'PAUSED') => via<unknown>(
    () => call('POST', META_PATHS.adOp(level, id, 'status'), { data: { status } }),
    (m) => m.adStatus(level, id, status),
  ),
  setBudget: (level: AdLevel, id: string, amountMinor: number, kind: 'daily' | 'lifetime') => via<unknown>(
    () => call('POST', META_PATHS.adOp(level, id, 'budget'), { data: { amount_minor: amountMinor, kind } }),
    (m) => m.adBudget(level, id, amountMinor, kind),
  ),
  setEnd: (level: AdLevel, id: string, end: string | null) => via<unknown>(
    () => call('POST', META_PATHS.adOp(level, id, 'schedule'), { data: { end } }),
    (m) => m.adEnd(level, id, end),
  ),
  rename: (level: AdLevel, id: string, name: string) => via<unknown>(
    () => call('POST', META_PATHS.adOp(level, id, 'rename'), { data: { name } }),
    (m) => m.adRename(level, id, name),
  ),
  duplicate: (level: AdLevel, id: string, deep: boolean) => via<{ id?: string; name?: string } | null>(
    () => call('POST', META_PATHS.adOp(level, id, 'duplicate'), { data: { deep } }),
    (m) => m.adDuplicate(level, id, deep),
  ),
  bulk: (body: { ids: string[]; level: AdLevel; action: BulkAction; value?: number | string | null }) => via<{ done?: number; failed?: Array<{ id: string; reason: string }> } | null>(
    () => call('POST', META_PATHS.adsBulk, { data: body }),
    (m) => m.adBulk(body),
  ),
  recommendations: () => via<AdRecommendation[]>(
    async () => asArray<AdRecommendation>(await call<any>('GET', META_PATHS.adsRecommendations), 'items'),
    (m) => m.adRecommendations(),
  ),
  applyRecommendation: (id: string) => via<unknown>(
    () => call('POST', META_PATHS.adsRecommendationApply(id), { data: {} }),
    (m) => m.applyRecommendation(id),
  ),
  rules: () => via<AdRule[]>(async () => asArray<AdRule>(await call<any>('GET', META_PATHS.adsRules), 'items'), (m) => m.adRules()),
  createRule: (r: RuleInput) => via<AdRule>(() => call('POST', META_PATHS.adsRules, { data: r }), (m) => m.createRule(r)),
  updateRule: (id: string, r: Partial<RuleInput>) => via<AdRule>(() => call('PATCH', META_PATHS.adsRule(id), { data: r }), (m) => m.updateRule(id, r)),
  deleteRule: (id: string) => via<unknown>(() => call('DELETE', META_PATHS.adsRule(id)), (m) => m.deleteRule(id)),
  tests: () => via<AdTest[]>(async () => asArray<AdTest>(await call<any>('GET', META_PATHS.adsTests), 'items'), (m) => m.adTests()),
  createTest: (t: TestInput) => via<AdTest>(() => call('POST', META_PATHS.adsTests, { data: t }), (m) => m.createTest(t)),

  /* B. Create any ad, audiences, creative library, targeting (META-9B) */
  options: () => via<AdsOptions>(async () => optionsOf(await call<any>('GET', META_PATHS.adsOptions)), (m) => m.adsOptions()),
  createDraft: (input: AdsDraftInput) => via<AdsDraft>(() => call('POST', META_PATHS.adsDrafts, { data: input }), (m) => m.createAdsDraft(input)),
  draft: (id: string) => via<AdsDraft>(() => call('GET', META_PATHS.adsDraft(id)), (m) => m.adsDraft(id)),
  refreshPreviews: (id: string) => via<AdsDraft>(() => call('POST', META_PATHS.adsDraftStep(id, 'previews'), { data: {} }), (m) => m.adsDraft(id)),
  applyDraft: (id: string) => via<ApplyResult>(() => call('POST', META_PATHS.adsDraftStep(id, 'apply'), { data: {} }), (m) => m.applyAdsDraft(id)),
  discardDraft: (id: string) => via<unknown>(() => call('POST', META_PATHS.adsDraftStep(id, 'discard'), { data: {} }), (m) => m.discardAdsDraft(id)),
  targeting: (type: TargetingType, q: string) => via<TargetingHit[]>(
    async () => asArray<TargetingHit>(await call<any>('GET', META_PATHS.adsTargeting, { params: { type, q } }), 'items'),
    (m) => m.targetingSearch(type, q),
  ),
  audiences: () => via<MetaAudience[]>(async () => asArray<MetaAudience>(await call<any>('GET', META_PATHS.adsAudiences), 'items'), (m) => m.metaAudiences()),
  /** `confirm` makes it although its name or rules name a health condition (META-9B answers 422 first). */
  createAudience: (a: { type: AudienceType; name: string; spec: Record<string, unknown>; description?: string | null; confirm?: boolean }) => via<MetaAudience>(
    () => call('POST', META_PATHS.adsAudiences, { data: a }),
    (m) => m.createAudience(a),
  ),
  deleteAudience: (id: string) => via<unknown>(() => call('DELETE', META_PATHS.adsAudience(id)), (m) => m.deleteAudience(id)),
  library: (type?: 'image' | 'video') => via<LibraryItem[]>(
    async () => asArray<LibraryItem>(await call<any>('GET', META_PATHS.adsLibrary, { params: type ? { type } : {} }), 'items'),
    (m) => m.library(type),
  ),
  addToLibrary: (galleryIds: string[]) => via<LibraryItem[]>(
    async () => asArray<LibraryItem>(await call<any>('POST', META_PATHS.adsLibrary, { data: { gallery_ids: galleryIds } }), 'items'),
    (m) => m.addToLibrary(galleryIds),
  ),
  deleteFromLibrary: (id: string) => via<unknown>(() => call('DELETE', META_PATHS.adsLibraryItem(id)), (m) => m.deleteFromLibrary(id)),

  /* C. Insights and alerts (META-10) */
  insights: (q: InsightsQuery) => via<Insights>(async () => insightsOf(await call<any>('GET', META_PATHS.insights, { params: { ...q } })), (m) => m.insights(q)),
  /** The same query as CSV, as a Blob to save. */
  exportInsights: (q: InsightsQuery) => via<Blob>(
    () => {
      if (!V2_ENABLED) backendGap(`POST ${META_PATHS.insightsExport} (this build is not on the v2 API)`);
      return v2call<Blob>('POST', META_PATHS.insightsExport, { data: q, responseType: 'blob' });
    },
    (m) => m.exportInsights(q),
  ),
  alerts: () => via<MetaAlert[]>(async () => asArray<MetaAlert>(await call<any>('GET', META_PATHS.alerts), 'items'), (m) => m.alerts()),
  /** Read a range from Meta now (a person's click; long ranges become an async report read later). */
  syncInsights: (body: { from?: string; to?: string; levels?: string[] }) => via<InsightsSyncResult>(
    () => call('POST', META_PATHS.insightsSync, { data: body }),
    (m) => m.syncInsights(body),
  ),
  insightsSettings: () => via<InsightsSettings>(() => call('GET', META_PATHS.insightsSettings), (m) => m.insightsSettings()),
  /** Any of the four groups, merged key by key over what the store has. */
  saveInsightsSettings: (patch: Partial<InsightsSettings['settings']>) => via<InsightsSettings>(
    () => call('PATCH', META_PATHS.insightsSettings, { data: patch }),
    (m) => m.saveInsightsSettings(patch),
  ),
};

/* ================================================================================================================
 * Wave 2, lane META-15B (contract `growcord-rs/docs/briefs/META-W2-social-contract.md`): the Publisher, comments
 * and social insights (META-12; Meta retired Page reviews on v22.0, so there is no reviews screen, `api/social.rs`), lead forms and leads (META-11, `api/meta_leads.rs`),
 * events health (META-16, `api/meta_events.rs`) and one product's Meta status (META-9C, not served yet). The inbox's
 * Messenger and Instagram threads are the Comms inbox (`lib/v2/messaging.ts`), not here.
 * ============================================================================================================== */

export type SocialChannelKey = 'facebook_page' | 'instagram' | 'threads';
/** One channel's limits, from the `social` store setting (META-12 `settings.rs`), so nothing here is typed by hand. */
export interface SocialLimits {
  max_chars: number;
  max_media: number;
  video: boolean;
  carousel: boolean;
  reels: boolean;
  stories: boolean;
  first_comment: boolean;
  max_hashtags?: number | null;
  max_mentions?: number | null;
  max_links?: number | null;
  /** Threads counts an emoji as its UTF-8 bytes. */
  count_emoji_bytes?: boolean;
  image_extensions?: string[];
  video_extensions?: string[];
}
export interface SocialAccount { id: string; name: string | null; handle: string | null }
export interface SocialChannel {
  key: SocialChannelKey | string;
  account: SocialAccount | null;
  connected: boolean;
  can_publish: boolean;
  limits: SocialLimits;
  /** Why it cannot publish (connect, reconnect, switch on, pick), in the server's words. */
  reason: string | null;
}

export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type SocialPostKind = 'feed' | 'reel' | 'story' | 'carousel';
export interface SocialMedia { gallery_id: string | null; key: string; kind: string; name: string | null; url: string | null }
export interface SocialPostChannel {
  key: SocialChannelKey | string;
  account_id: string | null;
  /** This channel's own text, when it differs from the post's. */
  text: string | null;
  status: string;
  external_id: string | null;
  permalink: string | null;
  /** Meta's or Threads' words when it failed. */
  error: string | null;
  attempts: number | null;
  published_at: string | null;
  first_comment_error?: string | null;
  metrics: Record<string, number> | null;
  metrics_at?: string | null;
}
export interface SocialPost {
  id: string;
  kind: SocialPostKind | string;
  status: SocialPostStatus | string;
  text: string | null;
  link: string | null;
  media: SocialMedia[];
  first_comment: string | null;
  schedule_at: string | null;
  scheduled_by: string | null;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  channels: SocialPostChannel[];
  /** What a channel leaves out (a link on Instagram, text on a story), in words. */
  notes: Array<{ channel: string | null; message: string }>;
}
export interface SocialPostInput {
  channels: string[];
  text: string;
  per_channel?: Record<string, { text: string | null }>;
  /** Gallery ids: storage keys of the store's media (the shared media browser's `key`). */
  media: string[];
  link: string | null;
  kind: SocialPostKind;
  first_comment: string | null;
  /** ISO time to publish at; null keeps it a draft. */
  schedule_at: string | null;
}
export interface SocialPostsQuery { status?: string; channel?: string; from?: string; to?: string; limit?: number; offset?: number }

export interface SocialComment {
  id: string;
  channel: SocialChannelKey | string;
  kind: string | null;
  post_id: string | null;
  /** META-22: the first 140 characters of the post this is on; null for a post made outside the Publisher. */
  post_excerpt?: string | null;
  object_id: string | null;
  author: { id: string | null; name: string | null; handle: string | null };
  text: string | null;
  permalink: string | null;
  /** open | replied | hidden | deleted */
  status: string;
  hidden: boolean;
  commented_at: string | null;
  reply: { text: string | null; at: string | null; by: string | null; error: string | null } | null;
  private_reply: { id: string | null; at: string | null; by: string | null } | null;
}
/** The `social` store setting (META-12 section 5): limits per channel, scheduler timers, comments, insights, Page. */
export interface SocialSettingsGroups {
  channels?: Record<string, Partial<SocialLimits> & Record<string, unknown>>;
  scheduler?: Record<string, number>;
  comments?: Record<string, number>;
  insights?: Record<string, unknown>;
  page?: Record<string, unknown>;
}
export interface SocialSettings { settings: SocialSettingsGroups; defaults: SocialSettingsGroups; stored: SocialSettingsGroups }
/** `POST /social/page/sync`: pushed, unchanged, nothing, skipped or failed. */
export interface PageSyncResult { status: string; fields: unknown; error: string | null }
export interface SocialInsightsChannel {
  account: SocialAccount | null;
  days: Array<{ date: string; metrics: Record<string, number> }>;
  totals: Record<string, number>;
  synced_at?: string | null;
  error?: string | null;
  /** Metrics Meta refused (it retires some each version); listed, never guessed. */
  refused?: unknown;
}
export interface SocialInsights { from: string; to: string; channels: Record<string, SocialInsightsChannel> }

export interface LeadQuestion {
  /** FULL_NAME, EMAIL, PHONE, CUSTOM, ... (Meta's question types; the server checks them). */
  type: string;
  key?: string;
  label?: string;
  options?: Array<{ key: string; value: string }>;
}
export interface LeadFormInput {
  name: string;
  questions: LeadQuestion[];
  locale?: string | null;
  /** Empty: the server uses the store's own privacy policy page. */
  privacy_policy_url?: string | null;
  privacy_link_text?: string | null;
  thank_you?: { title: string; body?: string | null; button_text?: string | null; button_type?: string | null; website_url?: string | null; business_phone_number?: string | null } | null;
  follow_up_action_url?: string | null;
}
export interface LeadForm {
  id: string;
  name: string | null;
  status: string | null;
  locale: string | null;
  created_time: string | null;
  last_read_at: string | null;
  last_read_status: string | null;
  last_read_error: string | null;
  leads_seen: number | null;
  leads_captured: number | null;
}
export interface LeadForms { page_id: string | null; page_name: string | null; rows: LeadForm[] }
export interface MetaLead {
  lead_id: string | null;
  capture_id: string;
  form: { id: string | null; name: string | null } | null;
  ad: { id: string | null; name: string | null } | null;
  campaign: { id: string | null; name: string | null } | null;
  created_at: string;
  meta_created_at: string | null;
  /** The CRM contact the lead became (open it in the CRM). */
  party_id: string | null;
  deal_id: string | null;
  status: string;
  /** The name the person gave on the form (META-9D). */
  name?: string | null;
}
export interface MetaLeads { rows: MetaLead[]; total: number; limit: number; offset: number }
/** `GET /meta/leads/forms/options` (META-9D): Meta's question types and thank you buttons, as data. */
export interface LeadFormOptions {
  question_types: Array<{ key: string; label: string; group: string; custom: boolean }>;
  button_types: Array<{ key: string; label: string }>;
  default_button_type: string;
  default_button_type_with_website: string;
  max_questions: number;
  privacy_link_text_max: number;
  not_offered: Array<{ key: string; label: string }>;
}

/** One store day and event: Meta's counts beside our own conversions log (META-16 section 1). */
export interface EventDay {
  date: string;
  event: string;
  received: number | null;
  received_server: number | null;
  /** Share (0 to 100) of browser events a server copy with the same event id covers. */
  deduped: number | null;
  /** Meta's event match quality, 0 to 10. */
  match_quality: number | null;
  coverage: number | null;
  sent: number | null;
  failed: number | null;
  sending: number | null;
}
export interface EventQuality {
  event: string;
  read_on: string | null;
  match_quality: number | null;
  deduped: number | null;
  coverage: number | null;
  match_keys: Array<{ identifier: string; coverage: number | null }> | null;
  diagnostics: Array<{ name?: string; description?: string; solution?: string; percentage?: number | null }> | null;
}
export interface EventsHealth {
  pixel_id: string | null;
  from: string;
  to: string;
  days: EventDay[];
  quality: EventQuality[];
  last_read: { at?: string | null; status?: string | null; token?: string | null; error?: string | null } | null;
  last_error: { at: string | null; source: string | null; event: string | null; message: string | null } | null;
  test_event_code: string | null;
  server_events: boolean;
  product_level_events: boolean;
  business_events: boolean;
  notes: string[];
  /** Every pixel of the store with its role (META-SETS); the figures above are for `pixel_id`. */
  pixels: SetupPixel[];
}
export interface EventsReadResult { pixel_id: string | null; status: 'ok' | 'partial' | 'failed' | string; events: number | null; days: number | null; token: string | null; error: string | null }

/** CAT-08 (META-9C): one product's items on the Meta catalog (CONTRACT QUESTION: shape built to META-1's item state). */
export interface ProductMetaStatus {
  product_id: string;
  channel_id: string | null;
  items: Array<{ variation_id: string | null; retailer_id: string; title: string | null; status: CatalogStatus | string; messages: CatalogMessage[]; pushed_at: string | null; meta_review_status: string | null }>;
}

const socialPostOf = (p: any): SocialPost => ({
  ...p,
  id: String(p?.id ?? ''),
  media: asArray<SocialMedia>(p?.media),
  channels: asArray<any>(p?.channels).map((c) => ({ ...c, metrics: c?.metrics && typeof c.metrics === 'object' ? c.metrics : null })),
  notes: asArray<any>(p?.notes).map((n) => (typeof n === 'string' ? { channel: null, message: n } : n)),
});
const socialCommentOf = (c: any): SocialComment => ({
  ...c,
  id: String(c?.id ?? ''),
  author: c?.author ?? { id: null, name: null, handle: null },
  hidden: !!c?.hidden,
  reply: c?.reply && (c.reply.text || c.reply.error) ? c.reply : null,
  private_reply: c?.private_reply && c.private_reply.at ? c.private_reply : null,
});

export const metaSocialApi = {
  /* Publisher (META-12) */
  channels: () => via<SocialChannel[]>(async () => asArray<SocialChannel>(await call<any>('GET', META_PATHS.socialChannels), 'channels'), (m) => m.socialChannels()),
  posts: (q: SocialPostsQuery) => via<{ posts: SocialPost[]; total: number }>(
    async () => {
      const d = await call<any>('GET', META_PATHS.socialPosts, { params: { ...q } });
      const posts = asArray<any>(d, 'posts').map(socialPostOf);
      return { posts, total: Number(d?.total ?? totalOf(d, posts.length)) || posts.length };
    },
    (m) => m.socialPosts(q),
  ),
  post: (id: string) => via<SocialPost>(async () => socialPostOf(await call<any>('GET', META_PATHS.socialPost(id))), (m) => m.socialPost(id)),
  createPost: (input: SocialPostInput) => via<SocialPost>(async () => socialPostOf(await call<any>('POST', META_PATHS.socialPosts, { data: input })), (m) => m.createSocialPost(input)),
  updatePost: (id: string, input: Partial<SocialPostInput>) => via<SocialPost>(async () => socialPostOf(await call<any>('PATCH', META_PATHS.socialPost(id), { data: input })), (m) => m.updateSocialPost(id, input)),
  deletePost: (id: string) => via<unknown>(() => call('DELETE', META_PATHS.socialPost(id)), (m) => m.deleteSocialPost(id)),
  /** Publish now; on a post that failed somewhere, tries the failed channels again (the server's own rule). */
  publishPost: (id: string) => via<SocialPost>(async () => socialPostOf(await call<any>('POST', META_PATHS.socialPostPublish(id), { data: {} })), (m) => m.publishSocialPost(id)),

  /* Comments (one list for the Page, Instagram and Threads) */
  comments: (q: { channel?: string; status?: string; q?: string; post_id?: string; limit?: number; offset?: number }) => via<{ comments: SocialComment[]; total: number }>(
    async () => {
      const d = await call<any>('GET', META_PATHS.socialComments, { params: { ...q } });
      const comments = asArray<any>(d, 'comments').map(socialCommentOf);
      return { comments, total: Number(d?.total ?? totalOf(d, comments.length)) || comments.length };
    },
    (m) => m.socialComments(q),
  ),
  replyComment: (id: string, text: string) => via<SocialComment>(async () => socialCommentOf(await call<any>('POST', META_PATHS.socialCommentOp(id, 'reply'), { data: { text } })), (m) => m.replySocialComment(id, text)),
  hideComment: (id: string, hidden: boolean) => via<SocialComment>(async () => socialCommentOf(await call<any>('POST', META_PATHS.socialCommentOp(id, 'hide'), { data: { hidden } })), (m) => m.hideSocialComment(id, hidden)),
  deleteComment: (id: string) => via<SocialComment>(async () => socialCommentOf(await call<any>('DELETE', META_PATHS.socialComment(id))), (m) => m.deleteSocialComment(id)),
  /** One private message to the commenter; the conversation then lives in the inbox. */
  privateReply: (id: string, text: string) => via<SocialComment>(async () => socialCommentOf(await call<any>('POST', META_PATHS.socialCommentOp(id, 'private_reply'), { data: { text } })), (m) => m.privateReplySocialComment(id, text)),

  /* Insights */
  insights: (q: { channel?: string; from?: string; to?: string }) => via<SocialInsights>(
    async () => { const d = await call<any>('GET', META_PATHS.socialInsights, { params: { ...q } }); return { from: d?.from ?? '', to: d?.to ?? '', channels: d?.channels ?? {} }; },
    (m) => m.socialInsights(q),
  ),
  /** Read a range from Meta and Threads now (a person's click). */
  syncInsights: (q: { channel?: string; from?: string; to?: string }) => via<unknown>(() => call('POST', META_PATHS.socialInsightsSync, { data: q }), (m) => m.syncSocialInsights(q)),

  /* The `social` setting: limits and timers, editable (merged key by key over what the store has) */
  settings: () => via<SocialSettings>(async () => { const d = await call<any>('GET', META_PATHS.socialSettings); return { settings: d?.settings ?? {}, defaults: d?.defaults ?? {}, stored: d?.stored ?? {} }; }, (m) => m.socialSettings()),
  saveSettings: (patch: SocialSettingsGroups) => via<SocialSettings>(
    async () => { const d = await call<any>('PATCH', META_PATHS.socialSettings, { data: patch }); return { settings: d?.settings ?? {}, defaults: d?.defaults ?? {}, stored: d?.stored ?? {} }; },
    (m) => m.saveSocialSettings(patch),
  ),
  /** Push the Page's phone, website, address and hours from the store settings now. */
  syncPage: (force = false) => via<PageSyncResult>(() => call('POST', META_PATHS.socialPageSync, { data: { force } }), (m) => m.syncSocialPage(force)),
};

export const metaLeadsApi = {
  formOptions: () => via<LeadFormOptions>(
    async () => {
      const d = await call<any>('GET', META_PATHS.leadFormOptions);
      return {
        question_types: asArray<any>(d?.question_types).map((t) => ({ key: String(t.key), label: String(t.label ?? t.key), group: String(t.group ?? ''), custom: !!t.custom })),
        button_types: asArray<{ key: string; label: string }>(d?.button_types), default_button_type: String(d?.default_button_type ?? ''),
        default_button_type_with_website: String(d?.default_button_type_with_website ?? ''), max_questions: Number(d?.max_questions) || 0,
        privacy_link_text_max: Number(d?.privacy_link_text_max) || 0, not_offered: asArray<{ key: string; label: string }>(d?.not_offered),
      };
    },
    (m) => m.leadFormOptions(),
  ),
  forms: () => via<LeadForms>(
    async () => { const d = await call<any>('GET', META_PATHS.leadForms); return { page_id: d?.page_id ?? null, page_name: d?.page_name ?? null, rows: asArray<LeadForm>(d?.rows ?? d) }; },
    (m) => m.leadForms(),
  ),
  createForm: (input: LeadFormInput) => via<LeadForm>(() => call('POST', META_PATHS.leadForms, { data: input }), (m) => m.createLeadForm(input)),
  archiveForm: (id: string) => via<{ id: string; archived: boolean }>(() => call('POST', META_PATHS.leadFormArchive(id), { data: {} }), (m) => m.archiveLeadForm(id)),
  leads: (q: { form_id?: string; from?: string; to?: string; limit?: number; offset?: number }) => via<MetaLeads>(
    async () => {
      const d = await call<any>('GET', META_PATHS.leads, { params: { ...q } });
      const rows = asArray<MetaLead>(d?.rows ?? d);
      return { rows, total: Number(d?.total ?? totalOf(d, rows.length)) || rows.length, limit: Number(d?.limit) || rows.length, offset: Number(d?.offset) || 0 };
    },
    (m) => m.metaLeads(q),
  ),
};

/** The events health answer, read once (META-23 reads its own part of the same answer: `eventsMatchOf`). */
const eventsHealthOf = (d: any): EventsHealth => ({
  ...d,
  days: asArray<EventDay>(d?.days), quality: asArray<EventQuality>(d?.quality), notes: asArray<string>(d?.notes),
  pixels: asArray<SetupPixel>(d?.pixels),
  server_events: !!d?.server_events, product_level_events: d?.product_level_events !== false, business_events: d?.business_events !== false,
});

export const metaEventsApi = {
  health: (days?: number) => via<EventsHealth>(
    async () => eventsHealthOf(await call<any>('GET', META_PATHS.eventsHealth, { params: days ? { days } : {} })),
    (m) => m.eventsHealth(days),
  ),
  /** "Read from Meta now": the daily job's read, at a person's click. */
  readNow: () => via<EventsReadResult>(() => call('POST', META_PATHS.eventsHealthRead, { data: {} }), (m) => m.eventsReadNow()),
};

const healthOf = (d: any): CatalogHealth => ({
  api_failing_since: d?.api_failing_since ?? null, api_last_ok_at: d?.api_last_ok_at ?? null, api_last_error: d?.api_last_error ?? null,
  fallback: { state: String(d?.fallback?.state ?? 'off'), feed_id: d?.fallback?.feed_id ?? null, since: d?.fallback?.since ?? null, error: d?.fallback?.error ?? null, feed_url: d?.fallback?.feed_url ?? null },
  diagnostics: asArray<any>(d?.diagnostics).map((x) => ({ ...x, sample_ids: asArray<string>(x?.sample_ids) })),
  diagnostics_read_at: d?.diagnostics_read_at ?? null, diagnostics_error: d?.diagnostics_error ?? null,
  localized_at: d?.localized_at ?? null, localized_error: d?.localized_error ?? null, note: d?.note ?? null,
});

/** CAT-10 and CAT-11 (META-9C): catalog health, stopping the feed fallback, the store's origin and importer defaults. */
export const metaCatalogApi = {
  health: (channelId: string) => via<CatalogHealth>(async () => healthOf(await call<any>('GET', META_PATHS.catalogHealth(channelId))), (m) => m.catalogHealth()),
  /** A person's call: Meta's feed is deleted and the fallback goes off (Meta disables ads of a deleted feed's items). */
  removeFeedFallback: (channelId: string) => via<CatalogHealth>(async () => healthOf(await call<any>('DELETE', META_PATHS.feedFallback(channelId))), (m) => m.removeFeedFallback()),
  /** The `catalogFacts` store setting, from the same admin settings call the other settings use. */
  facts: () => via<CatalogFacts>(
    async () => {
      const r = await api.get('/settings/admin');
      const f = ((r as any)?.data?.catalogFacts ?? {}) as Record<string, any>;
      const a = (f.importerAddress ?? {}) as Record<string, any>;
      const t = (v: unknown) => (v == null ? '' : String(v));
      return {
        originCountry: t(f.originCountry), importerName: t(f.importerName), manufacturerInfo: t(f.manufacturerInfo),
        importerAddress: { street1: t(a.street1), street2: t(a.street2), city: t(a.city), region: t(a.region), postalCode: t(a.postalCode), country: t(a.country) },
      };
    },
    (m) => m.catalogFacts(),
  ),
  /** Saved through the existing `PUT /settings`, the whole section (empty strings saved as empty: the server's fallback applies). */
  saveFacts: (f: CatalogFacts) => via<unknown>(() => api.put('/settings', { catalogFacts: f }), (m) => m.saveCatalogFacts(f)),
};

/** CAT-08: one product's Meta catalog state, for the chip on the product edit page. */
export const productMetaStatus = (productId: string) => via<ProductMetaStatus | null>(
  async () => {
    const d = await call<any>('GET', META_PATHS.productMetaStatus(productId));
    return d ? { product_id: String(d.product_id ?? productId), channel_id: d.channel_id ?? null, items: asArray<any>(d.items).map((i) => ({ ...i, messages: asArray<CatalogMessage>(i?.messages) })) } : null;
  },
  (m) => m.productMetaStatus(productId),
);

/* ================================================================================================================
 * META-17 (MCP-02, `growcord-rs/apps/marketing/core/src/api/meta_assistant.rs`): the Ads Manager's assistant over
 * Meta's ads MCP server. It reads the ad account with read tools only and turns a change into a proposal: a drafts
 * request a person previews (the existing `metaAdsApi.createDraft`, then `drafted` links it) and applies (the
 * existing `metaAdsApi.applyDraft`: everything paused). Off by default (store setting `meta_assistant`).
 * ============================================================================================================== */

const ASSISTANT_PATHS = {
  status: `${MK}/meta/assistant`,
  settings: `${MK}/meta/assistant/settings`,
  tools: `${MK}/meta/assistant/tools`,
  ask: `${MK}/meta/assistant/ask`,
  drafted: (id: string) => `${MK}/meta/assistant/proposals/${seg(id)}/drafted`,
  dismiss: (id: string) => `${MK}/meta/assistant/proposals/${seg(id)}/dismiss`,
};

/** `off`, `not_connected` and `on` come from the status read; a question may also answer `refused`, `unavailable`, `ai_off`, `ready`. */
export type AssistantState = 'off' | 'not_connected' | 'on' | 'refused' | 'unavailable' | 'ai_off' | 'ready' | string;

/** One proposal: a drafts request (`POST /meta/ads/drafts` body) with what it does and why. Money in minor units of the ad account's currency. */
export interface AssistantProposal {
  /** Null when the server could not keep it (before migration 416): it can still be previewed. */
  id: string | null;
  saved: boolean;
  status: 'proposed' | 'drafted' | 'dismissed' | string;
  title: string;
  summary: string;
  rationale: string;
  kind: string;
  budget: { kind?: 'daily' | 'lifetime' | string; amount_minor?: number } | null;
  draft: Record<string, unknown>;
  draft_id: string | null;
  draft_status: string | null;
  question: string | null;
  sources: string[];
  model: string | null;
  created_at: string | null;
  decided_at: string | null;
}

export interface AssistantLimits {
  max_rounds: number; max_tool_calls: number; max_tool_result_chars: number; max_tool_output_chars: number;
  max_message_chars: number; max_history_turns: number; max_proposals: number; max_tool_pages: number; timeout_seconds: number;
}
export interface AssistantSettings { enabled: boolean; read_tools: string[]; limits: AssistantLimits }

export interface AssistantStatus {
  state: AssistantState;
  note: string | null;
  verified: boolean;
  not_verified: string;
  off_note: string;
  account: { id: string; name: string | null } | null;
  settings: AssistantSettings;
  defaults: AssistantSettings;
  stored: Partial<AssistantSettings>;
  proposals: AssistantProposal[];
  can_manage: boolean;
}

export interface AssistantSource { tool: string; title: string | null; ok: boolean; args: string; excerpt: string }
export interface AssistantLink { level: 'campaign' | 'adset' | 'ad'; id: string; name: string }

export interface AssistantAnswer {
  state: AssistantState;
  note: string | null;
  verified: boolean;
  not_verified: string;
  reply: string;
  sources: AssistantSource[];
  links: AssistantLink[];
  proposals: AssistantProposal[];
  dropped: string[];
  tools_offered: number;
  tools_used: string[];
  rounds: number;
  provider: string | null;
  model: string | null;
}

export interface AssistantTool {
  name: string; title: string | null; description: string; read_only_hint: boolean | null;
  /** Meta's hints or the name say it changes something: never offered. */
  writes: boolean;
  allowed: boolean;
  offered: boolean;
}
export interface AssistantTools { state: AssistantState; note: string | null; tools: AssistantTool[] }

/** One earlier turn sent back as context (the server treats it as untrusted, never as facts). */
export interface AssistantTurn { role: 'user' | 'assistant'; text: string }

const proposalOf = (p: any): AssistantProposal => ({
  id: p?.id ? String(p.id) : null, saved: !!p?.saved, status: String(p?.status ?? 'proposed'), title: String(p?.title ?? ''),
  summary: String(p?.summary ?? ''), rationale: String(p?.rationale ?? ''), kind: String(p?.kind ?? ''),
  budget: p?.budget && typeof p.budget === 'object' ? p.budget : null,
  draft: p?.draft && typeof p.draft === 'object' ? p.draft : {}, draft_id: p?.draft_id ?? null, draft_status: p?.draft_status ?? null,
  question: p?.question ?? null, sources: asArray<string>(p?.sources), model: p?.model ?? null, created_at: p?.created_at ?? null, decided_at: p?.decided_at ?? null,
});
const assistantStatusOf = (d: any): AssistantStatus => ({
  ...d,
  note: d?.note ?? null,
  proposals: asArray<any>(d?.proposals).map(proposalOf),
  can_manage: !!d?.can_manage,
});
const answerOf = (d: any): AssistantAnswer => ({
  ...d,
  reply: String(d?.reply ?? ''), note: d?.note ?? null,
  sources: asArray<AssistantSource>(d?.sources), links: asArray<AssistantLink>(d?.links),
  proposals: asArray<any>(d?.proposals).map(proposalOf), dropped: asArray<string>(d?.dropped), tools_used: asArray<string>(d?.tools_used),
});

export const metaAssistantApi = {
  /** Where the assistant stands (no call to Meta), its settings and the newest proposals. */
  status: () => via<AssistantStatus>(async () => assistantStatusOf(await call<any>('GET', ASSISTANT_PATHS.status)), (m) => m.assistantStatus()),
  /** Switch it on or off, or change its read tools or limits (merged over what the store has). */
  saveSettings: (patch: { enabled?: boolean; read_tools?: string[]; limits?: Partial<AssistantLimits> }) => via<AssistantStatus>(
    async () => assistantStatusOf(await call<any>('PATCH', ASSISTANT_PATHS.settings, { data: patch })),
    (m) => m.saveAssistantSettings(patch),
  ),
  /** What Meta's ads MCP server offers the store's token now. */
  tools: () => via<AssistantTools>(
    async () => { const d = await call<any>('POST', ASSISTANT_PATHS.tools, { data: {} }); return { state: d?.state ?? 'unavailable', note: d?.note ?? null, tools: asArray<AssistantTool>(d?.tools) }; },
    (m) => m.assistantTools(),
  ),
  ask: (message: string, history: AssistantTurn[]) => via<AssistantAnswer>(
    async () => answerOf(await call<any>('POST', ASSISTANT_PATHS.ask, { data: { message, history } })),
    (m) => m.assistantAsk(message, history),
  ),
  /** Link the draft the person made from a kept proposal. */
  drafted: (id: string, draftId: string) => via<AssistantProposal>(
    async () => proposalOf((await call<any>('POST', ASSISTANT_PATHS.drafted(id), { data: { draft_id: draftId } }))?.proposal),
    (m) => m.assistantDrafted(id, draftId),
  ),
  dismiss: (id: string) => via<AssistantProposal>(
    async () => proposalOf((await call<any>('POST', ASSISTANT_PATHS.dismiss(id), { data: {} }))?.proposal),
    (m) => m.assistantDismiss(id),
  ),
};
/* end META-17 */

/* ================================================================================================================
 * META-20 (LIVE-01 to LIVE-03, `growcord-rs/apps/marketing/core/src/api/social.rs` live routes,
 * `docs/PORT_NOTES/META-20.md`): live video on the store's Facebook Page, in the Publisher's Live tab. A person
 * schedules it (or keeps it to start by hand), takes the stream key for the streaming app (read from Meta when asked,
 * answered only to that person, never listed; the screen keeps it only while its dialog is open), goes live, ends it,
 * and answers comments written during the live through the Comments calls (`metaSocialApi.replyComment` and the rest).
 * ============================================================================================================== */

const LIVE_PATHS = {
  list: `${MK}/social/live`,
  one: (id: string) => `${MK}/social/live/${seg(id)}`,
  op: (id: string, op: 'stream_key' | 'go_live' | 'end' | 'cancel') => `${MK}/social/live/${seg(id)}/${op}`,
  comments: (id: string) => `${MK}/social/live/${seg(id)}/comments`,
};

/** scheduled (made, not on air), live, ended (Meta keeps it as a video), canceled, failed (Meta refused making it). */
export type LivePhase = 'scheduled' | 'live' | 'ended' | 'canceled' | 'failed';
export interface SocialLive {
  id: string;
  page_id: string;
  external_id: string | null;
  /** The recording (a video on the Page) once the live ended. */
  video_id: string | null;
  title: string;
  description: string | null;
  planned_start_at: string | null;
  /** Meta's own word (SCHEDULED_UNPUBLISHED, UNPUBLISHED, LIVE, VOD, ...). */
  status: string;
  phase: LivePhase | string;
  /** growcord: made here; facebook: started on Facebook and seen by the receiver. */
  origin: string;
  permalink: string | null;
  live_views: number | null;
  started_at: string | null;
  ended_at: string | null;
  /** Meta's words when its last call on this live failed. */
  error: string | null;
  comments: { read_at: string | null; error: string | null };
  /** Who saw the stream key and when; never the key. */
  key: { shown_at: string | null; shown_by: string | null; shown_count: number };
  can: { stream_key: boolean; go_live: boolean; end: boolean; cancel: boolean };
  created_by: string | null;
  updated_by: string | null;
  ended_by: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
/** The `live` group of the `social` store setting (seeded from Meta's rules: 100 followers, 7 days ahead, 254 characters). */
export interface LiveSettings {
  min_followers?: number;
  check_followers?: boolean;
  min_lead_minutes?: number;
  max_days_ahead?: number;
  title_max?: number;
  key_repeat?: boolean;
  comments_poll_seconds?: number;
  page_size?: number;
}
export interface LiveEligibility {
  page: SocialAccount | null;
  can_schedule: boolean;
  /** Why not, in the server's words (connect, pick the Page, too few followers). */
  reason: string | null;
  followers: number | null;
  min_followers: number;
  followers_error: string | null;
}
export interface SocialLives { lives: SocialLive[]; total: number; settings: LiveSettings; eligibility: LiveEligibility | null }
export interface LiveInput {
  title: string;
  description: string | null;
  /** ISO time it is planned to start; null: started by hand from the Live tab. */
  planned_start: string | null;
}
/** Answered once to the person who asked; never stored by the screen beyond its open dialog. */
export interface LiveStreamKey { url: string; server: string; key: string | null; secure: boolean; note: string }
export interface LiveComments { live: SocialLive; read: { kept: number; error: string | null } | null; comments: SocialComment[]; total: number }

const liveOf = (v: any): SocialLive => ({
  ...v,
  id: String(v?.id ?? ''),
  title: v?.title ?? '',
  comments: v?.comments ?? { read_at: null, error: null },
  key: v?.key ?? { shown_at: null, shown_by: null, shown_count: 0 },
  can: v?.can ?? { stream_key: false, go_live: false, end: false, cancel: false },
});
const liveMock = () => import('./meta.mock.live').then((m) => m.liveMock);

export const metaLiveApi = {
  /** `check` also asks Meta for the Page's followers (whether the store can go live). */
  list: (q: { phase?: string; check?: boolean; limit?: number; offset?: number }) => via<SocialLives>(
    async () => {
      const d = await call<any>('GET', LIVE_PATHS.list, { params: { ...q } });
      const lives = asArray<any>(d, 'lives').map(liveOf);
      return { lives, total: Number(d?.total ?? totalOf(d, lives.length)) || lives.length, settings: d?.settings ?? {}, eligibility: d?.eligibility ?? null };
    },
    async () => (await liveMock()).list(q),
  ),
  schedule: (input: LiveInput) => via<SocialLive>(async () => liveOf(await call<any>('POST', LIVE_PATHS.list, { data: input })), async () => (await liveMock()).schedule(input)),
  /** `refresh` reads Meta's status first. */
  get: (id: string, refresh = false) => via<SocialLive>(async () => liveOf(await call<any>('GET', LIVE_PATHS.one(id), { params: { refresh } })), async () => (await liveMock()).get(id)),
  streamKey: (id: string) => via<LiveStreamKey>(() => call<LiveStreamKey>('POST', LIVE_PATHS.op(id, 'stream_key'), { data: {} }), async () => (await liveMock()).streamKey(id)),
  goLive: (id: string) => via<SocialLive>(async () => liveOf(await call<any>('POST', LIVE_PATHS.op(id, 'go_live'), { data: {} })), async () => (await liveMock()).act(id, 'go_live')),
  end: (id: string) => via<SocialLive>(async () => liveOf(await call<any>('POST', LIVE_PATHS.op(id, 'end'), { data: {} })), async () => (await liveMock()).act(id, 'end')),
  cancel: (id: string) => via<SocialLive>(async () => liveOf(await call<any>('POST', LIVE_PATHS.op(id, 'cancel'), { data: {} })), async () => (await liveMock()).act(id, 'cancel')),
  /** `refresh` reads the comments written since the last read from Meta first (the screen does so while on air). */
  comments: (id: string, q: { refresh?: boolean; limit?: number; offset?: number } = {}) => via<LiveComments>(
    async () => {
      const d = await call<any>('GET', LIVE_PATHS.comments(id), { params: { ...q } });
      const comments = asArray<any>(d, 'comments').map(socialCommentOf);
      return { live: liveOf(d?.live), read: d?.read ?? null, comments, total: Number(d?.total ?? comments.length) || comments.length };
    },
    async () => (await liveMock()).comments(id, q),
  ),
};
/* end META-20 */


/* ================================================================================================================
 * META-19 (ADS-11): Instant Experiences (Meta's canvases), `growcord-rs/apps/marketing/core/src/meta_ads/canvas.rs`,
 * routes under `/meta/ads/canvases`: a full screen landing an ad opens, made of the store's own pictures, videos,
 * words and buttons, and the collection ad without a catalog. Made unpublished on the store's Facebook Page; a
 * person's publish (or a person's apply of an ad that opens it) publishes it.
 * ============================================================================================================== */

export const CANVAS_PATHS = {
  options: `${MK}/meta/ads/canvases/options`,
  template: (key: string) => `${MK}/meta/ads/canvases/templates/${seg(key)}`,
  list: `${MK}/meta/ads/canvases`,
  one: (id: string) => `${MK}/meta/ads/canvases/${seg(id)}`,
  step: (id: string, step: 'preview' | 'publish' | 'discard') => `${MK}/meta/ads/canvases/${seg(id)}/${step}`,
};

/** A file of the store's media in an element; the server fills `url`, `name` and `kind`. */
export interface CanvasMedia {
  gallery_id: string;
  /** The size the browser read; a collection thumbnail's square crop needs it. */
  width?: number | null;
  height?: number | null;
  url?: string | null;
  name?: string | null;
  kind?: string | null;
}
/** One element, in the order it shows; which fields count depends on `type` (the options list them). */
export interface CanvasElement {
  type: string;
  name?: string | null;
  media?: CanvasMedia | null;
  items?: CanvasMedia[];
  text?: string | null;
  link?: string | null;
  style?: string | null;
  align?: string | null;
  font_size?: number | null;
  text_color?: string | null;
  color?: string | null;
  product_set_id?: string | null;
  max_items?: number | null;
  show_in_feed?: boolean | null;
  /** Meta's ids, once made there. */
  meta_id?: string | null;
  children?: string[] | null;
}
export interface CanvasInput { name: string; template?: string | null; background_color?: string | null; elements: CanvasElement[] }
export interface CanvasStep { step: string; ok: boolean; id?: string | null; error?: string | null }
export interface Canvas extends CanvasInput {
  id: string;
  /** growcord: made here; meta: made in Meta's tools on the Page. */
  source: 'growcord' | 'meta' | string;
  status: 'draft' | 'published' | 'discarded' | string;
  meta_canvas_id: string | null;
  canvas_link: string | null;
  is_published: boolean;
  is_hidden?: boolean;
  /** Whether a collection ad can open it, and why not (null: not known, made in Meta's tools). */
  collection_ready: boolean | null;
  collection_note: string | null;
  built_at?: string | null;
  build_error?: string | null;
  build_failed_step?: string | null;
  publish_error?: string | null;
  last_refusal?: { at?: string; step?: string; error?: string } | null;
  mock?: boolean;
  steps?: CanvasStep[];
  created_at?: string | null;
  updated_at?: string | number | null;
  published_at?: string | null;
}
export interface CanvasElementOption { key: string; label: string; help: string; fields: string[] }
export interface CanvasTemplateOption { key: string; label: string; help: string | null; template_id: string; needs_catalog: boolean | null }
export interface CanvasOptions {
  mock: boolean;
  mock_reason: string | null;
  page: { id: string; name: string | null } | null;
  elements: CanvasElementOption[];
  templates: CanvasTemplateOption[];
  styles: { photo: string[]; video: string[]; carousel: string[]; button: string[]; align: string[] };
  limits: { elements: number; carousel_items: number; text: number; button: number; name: number; thumbnails: number };
  collection_rule: string;
  not_built: Array<{ key: string; why: string }>;
}
export interface CanvasList { mock: boolean; mock_reason: string | null; page: { id: string; name: string | null } | null; items: Canvas[]; errors: Array<{ list: string; error: string }> }
export interface CanvasTemplate {
  key: string;
  label: string;
  template_id: string;
  needs_catalog: boolean | null;
  /** The template's elements in Meta's order. */
  elements: Array<{ type: string; name?: string | null; meta_type?: string }>;
  unsupported: Array<{ meta_type: string; name?: string | null; why?: string | null }>;
  mock: boolean;
  error: string | null;
  note: string | null;
}
export interface CanvasPreview { id: string; html: string | null; error: string | null; note: string | null; mock: boolean }

/** Which ads open an Instant Experience (`GET /meta/ads/options` `canvas`). */
export interface AdsCanvasRule { formats: string[]; destinations: string[]; collection_needs?: string | null; help?: string | null }
/** Used only when an older server leaves `canvas` out of the ad options. */
export const CANVAS_RULE_FALLBACK: AdsCanvasRule = { formats: ['image', 'video', 'carousel', 'collection'], destinations: ['website', 'on_ad'] };
export interface AdsOptions { canvas?: AdsCanvasRule | null }
export interface AdsFormat { canvas_ai_features?: AiFeature[] }

export const metaCanvasApi = {
  options: () => via<CanvasOptions>(() => call<CanvasOptions>('GET', CANVAS_PATHS.options), (m) => m.canvasOptions()),
  template: (key: string) => via<CanvasTemplate>(() => call<CanvasTemplate>('GET', CANVAS_PATHS.template(key)), (m) => m.canvasTemplate(key)),
  list: () => via<CanvasList>(
    async () => {
      const d = await call<any>('GET', CANVAS_PATHS.list);
      return { mock: !!d?.mock, mock_reason: d?.mock_reason ?? null, page: d?.page ?? null, items: asArray<Canvas>(d?.items), errors: asArray<any>(d?.errors) };
    },
    (m) => m.canvases(),
  ),
  get: (id: string) => via<Canvas>(() => call<Canvas>('GET', CANVAS_PATHS.one(id)), (m) => m.canvas(id)),
  create: (input: CanvasInput) => via<Canvas>(() => call<Canvas>('POST', CANVAS_PATHS.list, { data: input }), (m) => m.createCanvas(input)),
  /** Only while unpublished (Meta keeps a published one as it is). */
  update: (id: string, input: CanvasInput) => via<Canvas>(() => call<Canvas>('PUT', CANVAS_PATHS.one(id), { data: input }), (m) => m.updateCanvas(id, input)),
  preview: (id: string) => via<CanvasPreview>(() => call<CanvasPreview>('GET', CANVAS_PATHS.step(id, 'preview')), (m) => m.canvasPreview(id)),
  publish: (id: string) => via<Canvas>(() => call<Canvas>('POST', CANVAS_PATHS.step(id, 'publish'), { data: {} }), (m) => m.publishCanvas(id)),
  discard: (id: string) => via<Canvas>(() => call<Canvas>('POST', CANVAS_PATHS.step(id, 'discard'), { data: {} }), (m) => m.discardCanvas(id)),
};
/* end META-19 */

/*
 * META-23 (event match quality, Conversions API set up by itself; `growcord-rs/docs/PORT_NOTES/META-23.md`) and META-18's
 * send again of a refused server event (`POST /meta/events/resend`, `docs/PORT_NOTES/META-18.md`), both on the Events
 * health page. One GET: the events health answer, read as META-16's part (`eventsHealthOf`) and this part.
 */
/** One identifier Meta received on too few events of one kind: `line` is the sentence the page shows. */
export interface MatchGap { event: string; identifier: string; label: string; coverage: number | null; line: string }
/** What Meta holds for the pixel's own matching settings, as the pixel pick left them (`metaPixel.pixelSetup`). */
export interface PixelSetup {
  pixel_id?: string | null;
  automatic_matching: boolean | null;
  /** Meta's field words (em, ph, fn, ln, ct, st, zp, country, external_id, ge, db). */
  fields: string[] | null;
  /** FIRST_PARTY_COOKIE_ENABLED, FIRST_PARTY_COOKIE_DISABLED or EMPTY. */
  first_party_cookies: string | null;
  fields_asked?: string[] | null;
  checked_at?: string | null;
  /** Meta's words when it refused the change or the read. */
  error?: string | null;
}
/** A server event Meta did not count (META-18), with whether a person may send it again. */
export interface RefusedEvent {
  /** Which pixel's row (META-SETS): `meta` the store's own, `meta_app` the one added through the connection. */
  platform?: string | null;
  event: string;
  event_id: string;
  order_id: string | null;
  at: string | null;
  last_tried: string | null;
  attempts: number | null;
  message: string;
  action_source: string | null;
  resend: { allowed: boolean; reason: string | null; until: string | null };
}
export interface EventsMatch {
  /** Where the server's token comes from: the store's Meta connection, a token pasted in API and Integrations, or none. */
  server_events_source: 'connection' | 'pasted_token' | string | null;
  connection_pixel_id: string | null;
  /** The pixel added beside the store's own through the Meta connection (META-SETS). */
  connected_pixel_id: string | null;
  pixel_setup: PixelSetup | null;
  /** The store's `metaPixel.matchQualityAlert` (out of 10) and `matchKeyCoverageAlert` (%). */
  match_alert: { match_quality_below: number; coverage_below: number };
  gaps: MatchGap[];
  low_match_quality: Array<{ event: string; match_quality: number }>;
  refused: RefusedEvent[];
}
export interface ResendResult { event: string; event_id: string; order_id: string | null; status: 'sent' | 'failed' | 'skipped' | string; message: string | null; attempts: number | null; at: string | null }

const eventsMatchOf = (d: any): EventsMatch => ({
  server_events_source: d?.server_events_source ?? null,
  connection_pixel_id: d?.connection_pixel_id ?? null,
  connected_pixel_id: d?.connected_pixel_id ?? null,
  pixel_setup: d?.pixel_setup && typeof d.pixel_setup === 'object' ? { ...d.pixel_setup, fields: d.pixel_setup.fields ?? null } : null,
  match_alert: {
    match_quality_below: Number(d?.match_alert?.match_quality_below ?? 6),
    coverage_below: Number(d?.match_alert?.coverage_below ?? 50),
  },
  gaps: asArray<MatchGap>(d?.gaps),
  low_match_quality: asArray<{ event: string; match_quality: number }>(d?.low_match_quality),
  refused: asArray<any>(d?.refused).map((r) => ({
    ...r,
    order_id: r?.order_id ?? null,
    message: String(r?.message ?? 'Meta did not count this event.'),
    resend: { allowed: !!r?.resend?.allowed, reason: r?.resend?.reason ?? null, until: r?.resend?.until ?? null },
  })),
});
const matchMock = () => import('./meta.mock.match').then((m) => m.matchMock);

export const metaMatchApi = {
  /** The events health answer: META-16's part and META-23's (with META-18's refused rows). */
  health: (days?: number, pixel?: string) => via<{ health: EventsHealth; match: EventsMatch }>(
    async () => {
      const d = await call<any>('GET', META_PATHS.eventsHealth, { params: { ...(days ? { days } : {}), ...(pixel ? { pixel } : {}) } });
      return { health: eventsHealthOf(d), match: eventsMatchOf(d) };
    },
    async (m) => {
      const health = await m.eventsHealth(days);
      const { quality, match } = (await matchMock()).extend(health.quality);
      return { health: { ...health, quality }, match };
    },
  ),
  /** META-18: a person sends again a server event Meta refused (same event id; ads manage permission). */
  resend: (event: string, eventId: string, platform?: string | null) => via<ResendResult>(
    () => call<ResendResult>('POST', `${MK}/meta/events/resend`, { data: { event, event_id: eventId, ...(platform ? { platform } : {}) } }),
    async () => (await matchMock()).resend(event, eventId),
  ),
};
/* end META-23 */
