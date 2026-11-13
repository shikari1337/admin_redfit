/**
 * The store app's admin routes (Homeomed app, HMAPP), one typed call each. Every route here is
 * mounted only with the app route switches (`GC_APP_ROUTES` or `GC_INTL_ROUTES`), which are OFF on
 * the live server: a screen shows `NotServed` until the backend release (the 404 `RESOURCE_NOT_FOUND`
 * of an unmounted route, `isNotServed` in `lib/v2/erp.ts`).
 *
 * Sources (growcord-rs worktrees, uncommitted; port notes under `.runs/<wt>/docs/PORT_NOTES/`):
 *   app settings        GET, PUT  /api/v2/commerce/app/settings            APP-1, HMAPP-T1, T2b, T2d, T2e
 *   app config          GET       /api/v2/commerce/app/config              (public; switch names, theme preview)
 *   audience            GET, PUT  /api/v2/commerce/app/audience/settings   HMAPP-T1 section 3 and 5
 *   hidden categories   GET, PUT  /api/v2/commerce/app/hidden-categories   HMAPP-T2d section 5
 *   feed review         GET       /api/v2/commerce/app/feed/review         HMAPP-T4b section 1 and 2
 *                       POST      .../reels/{id}/approve, .../refuse
 *                       GET       .../review?kind=instagram                HMAPP-3 lane BC (Instagram items, tenant 461)
 *                       POST      .../instagram/{media_id}/approve, .../refuse
 *   customer orders     GET, PUT  /api/v2/commerce/settings/customer-orders HMAPP-T4c section 3
 *   slips               GET, PUT  /api/v2/commerce/settings/prescriptions  HMAPP-T4d section 2
 *   dispatch calendar   GET, PATCH /api/v2/ship/dispatch-calendar          HMAPP-T3 section 2
 *   app customers       GET, PUT  /api/v2/comms/whatsapp/app-customers     HMAPP-T4b section 2
 *
 * Read with `settings.read`, save with `settings.manage` and a person signed in (never a key or an
 * agent); the feed queue reads with `content.read` and decides with `content.manage`.
 */
import { v2call } from './http';

const C = '/api/v2/commerce';

/* ── the app document ──────────────────────────────────────────────────── */

/** The organisation's app as the operating store holds it (`domain/app.rs` `AppSettings`). Kept loose:
 *  the form edits the fields it knows and sends every other field back as it came. */
export type AppDoc = Record<string, any>;

export interface StoredDoc<T> {
  /** The stored document (`null` when none). */
  settings: T | null;
  /** Why the stored document is read as none (`null` = it is in force). */
  problem: string | null;
  /** A document was saved (the audience and hidden categories reads say it; the app read does not). */
  stored?: boolean;
}

export const getAppSettings = () => v2call<StoredDoc<AppDoc>>('GET', `${C}/app/settings`);
export const putAppSettings = (doc: AppDoc) => v2call<StoredDoc<AppDoc>>('PUT', `${C}/app/settings`, { data: doc });

/**
 * One app switch, from a screen other than Mobile App (the assistant page): the document is read
 * fresh, only `switches.<name>` changes, and it is saved whole as the Mobile App page saves it, so
 * nothing another person saved meanwhile is lost.
 */
export const setAppSwitch = async (name: string, on: boolean): Promise<StoredDoc<AppDoc>> => {
  const cur = await getAppSettings();
  const doc: AppDoc = { ...(cur?.settings ?? {}) };
  doc.switches = { ...(doc.switches ?? {}), [name]: on };
  return putAppSettings(pruneBlank(doc));
};

/** The public app config this store answers now (switch names, theme and brand, the forced India-only switches). */
export const getAppConfig = () => v2call<Record<string, any>>('GET', `${C}/app/config`);

/* ── audience: personas and interest groups ────────────────────────────── */

export interface Words { label: string; hint?: string | null }
export type WordsByLocale = Record<string, Words>;
export interface Persona { id: string; kind: string; leads_to?: string | null; words: WordsByLocale }
export interface InterestGroup { id: string; kind: string; words: WordsByLocale; items: string[] }
export interface AudienceDoc { personas: Persona[]; interest_groups: InterestGroup[] }

export const getAudience = () => v2call<StoredDoc<AudienceDoc>>('GET', `${C}/app/audience/settings`);
export const putAudience = (doc: AudienceDoc) => v2call<StoredDoc<AudienceDoc>>('PUT', `${C}/app/audience/settings`, { data: doc });

/* ── hidden category roots ─────────────────────────────────────────────── */

export interface HiddenDoc { hidden_category_roots: string[] }
export const getHiddenCategories = () => v2call<StoredDoc<HiddenDoc>>('GET', `${C}/app/hidden-categories`);
export const putHiddenCategories = (doc: HiddenDoc) => v2call<StoredDoc<HiddenDoc>>('PUT', `${C}/app/hidden-categories`, { data: doc });

/* ── feed approval queue ───────────────────────────────────────────────── */

/** A product tagged on an Instagram post (Marketing's tags, META-2; the name and picture as the admin list carries them). */
export interface FeedTag {
  product_id: string | null;
  variation_id: string | null;
  name: string | null;
  image: string | null;
}
/** One picture or video of an Instagram carousel. */
export interface FeedMedia { media_type: string | null; url: string | null; thumbnail_url: string | null }

/**
 * One item waiting for a person: a store reel (HMAPP-T4b) or, from HMAPP-3 lane BC, an Instagram post
 * or reel from the store's cached Instagram feed (Marketing's `InstagramReview`, tenant 461). The
 * Instagram fields are null on a reel.
 */
export interface FeedItem {
  kind: string;
  id: string;
  /** Instagram's media id: what an Instagram item is decided by (`/instagram/{media_id}/approve`). */
  media_id: string | null;
  /** Instagram: `FEED`, `REELS` and the like. */
  media_product_type: string | null;
  /** Instagram: its files are in the store's own storage (copied when a person approves it). */
  copied: boolean | null;
  title: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  product_id: string | null;
  is_active: boolean;
  created_at: string | null;
  state: string;
  approved_by: string | null;
  approved_at: string | null;
  refused_by: string | null;
  refused_at: string | null;
  refused_reason: string | null;
  /** Instagram: `IMAGE`, `VIDEO` or `CAROUSEL_ALBUM` (Meta's words). */
  media_type: string | null;
  /** Instagram: the picture, or the copy of the video in the store's own storage. */
  media_url: string | null;
  caption: string | null;
  permalink: string | null;
  children: FeedMedia[];
  tags: FeedTag[];
}
/** The name the earlier screens used; one shape for every kind now. */
export type FeedReel = FeedItem;
export interface FeedQueuePage { items: FeedItem[]; next_cursor: string | null; pending: number | null }

const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function feedItemOf(r: any): FeedItem {
  const children = Array.isArray(r?.children) ? r.children : [];
  const tags = Array.isArray(r?.tags) ? r.tags : Array.isArray(r?.products) ? r.products : [];
  return {
    kind: String(r?.kind ?? (r?.media_id ? 'instagram' : 'reel')),
    id: String(r?.id ?? r?.media_id ?? ''),
    media_id: s(r?.media_id),
    media_product_type: s(r?.media_product_type),
    copied: typeof r?.copied === 'boolean' ? r.copied : null,
    title: s(r?.title),
    video_url: s(r?.video_url),
    thumbnail_url: s(r?.thumbnail_url),
    product_id: s(r?.product_id),
    is_active: r?.is_active === true,
    created_at: s(r?.created_at ?? r?.posted_at ?? r?.timestamp),
    state: String(r?.state ?? 'pending'),
    approved_by: s(r?.approved_by),
    approved_at: s(r?.approved_at),
    refused_by: s(r?.refused_by),
    refused_at: s(r?.refused_at),
    refused_reason: s(r?.refused_reason),
    media_type: s(r?.media_type),
    media_url: s(r?.image_url ?? r?.media_url),
    caption: s(r?.caption),
    permalink: s(r?.permalink),
    children: children.map((c: any) => ({ media_type: s(c?.media_type), url: s(c?.media_url ?? c?.url), thumbnail_url: s(c?.thumbnail_url) })),
    tags: tags.map((t: any) => ({
      product_id: s(t?.product_id ?? t?.id), variation_id: s(t?.variation_id), name: s(t?.name ?? t?.title), image: s(t?.image ?? t?.image_url),
    })),
  };
}

/**
 * The queue of one source. `kind` is the queue's own source word: reels by default (sent as nothing,
 * since a server before lane BC refuses a query field it does not know), `instagram` for the store's
 * Instagram items.
 */
export const getFeedQueue = async (q: { state: string; kind?: string; cursor?: string | null; limit?: number }): Promise<FeedQueuePage> => {
  const kind = q.kind && q.kind !== 'reel' ? q.kind : undefined;
  const d: any = await v2call('GET', `${C}/app/feed/review`, { params: { state: q.state, kind, cursor: q.cursor || undefined, limit: q.limit ?? 20 } });
  // Reels come as `items`; Instagram items as `instagram` (lane BC's `FeedReviewPageView`).
  const items = Array.isArray(d) ? Array.from(d)
    : kind && Array.isArray(d?.[kind]) ? d[kind]
    : Array.isArray(d?.items) ? d.items : [];
  // The source asked for is each item's kind: an Instagram item may name its own form (`reel`,
  // `carousel`), which must not send its decision to the reel routes.
  return {
    items: items.map((r: any) => feedItemOf(kind ? { ...r, kind } : { kind: 'reel', ...r })).filter((i: FeedItem) => i.id),
    next_cursor: (d?.next_cursor as string) || null,
    pending: typeof d?.pending === 'number' ? d.pending : null,
  };
};

/**
 * The path segment of a kind's decision routes: reels are `/reels/{id}` (HMAPP-T4b); Instagram items
 * `/instagram/{id}` (lane BC). Any other kind the server lists is decided at its own name.
 */
export function feedKindSegment(kind: string): string {
  if (kind === 'reel') return 'reels';
  if (kind.startsWith('instagram')) return 'instagram';
  return encodeURIComponent(kind);
}

/** The id a decision route takes: an Instagram item's media id, a reel's own id. */
const decisionId = (item: Pick<FeedItem, 'kind' | 'id' | 'media_id'>) =>
  encodeURIComponent(item.kind.startsWith('instagram') && item.media_id ? item.media_id : item.id);

export const approveFeedItem = async (item: Pick<FeedItem, 'kind' | 'id' | 'media_id'>): Promise<FeedItem> =>
  feedItemOf({ ...(await v2call('POST', `${C}/app/feed/review/${feedKindSegment(item.kind)}/${decisionId(item)}/approve`, { data: {} })), kind: item.kind });
export const refuseFeedItem = async (item: Pick<FeedItem, 'kind' | 'id' | 'media_id'>, reason: string): Promise<FeedItem> =>
  feedItemOf({ ...(await v2call('POST', `${C}/app/feed/review/${feedKindSegment(item.kind)}/${decisionId(item)}/refuse`, { data: { reason } })), kind: item.kind });

/* ── customer orders: cancel window, reasons, words ────────────────────── */

export interface CancelReason { code: string; words: string }
export interface CustomerOrdersDoc {
  cancelUntil?: string;
  cancelOnWebsite?: boolean;
  cancelReasons?: CancelReason[];
  statusWords?: Record<string, string>;
  stepWords?: Record<string, string>;
}
export interface SavedEffective<T> { saved: T | null; effective: T }

export const getCustomerOrders = () => v2call<SavedEffective<CustomerOrdersDoc>>('GET', `${C}/settings/customer-orders`);
export const putCustomerOrders = (doc: CustomerOrdersDoc) =>
  v2call<SavedEffective<CustomerOrdersDoc>>('PUT', `${C}/settings/customer-orders`, { data: doc });

/* ── doctor's slips ────────────────────────────────────────────────────── */

export interface SlipsDoc { retentionDays?: number; customerMayDeleteApproved?: boolean }
export const getSlipSettings = () => v2call<SavedEffective<SlipsDoc>>('GET', `${C}/settings/prescriptions`);
export const putSlipSettings = (doc: SlipsDoc) => v2call<SavedEffective<SlipsDoc>>('PUT', `${C}/settings/prescriptions`, { data: doc });

/* ── dispatch calendar (Ship) ──────────────────────────────────────────── */

export interface DispatchCalendar { saved: boolean; cutoff: string | null; weekdays: number[]; closed: string[] }
export const getDispatchCalendar = () => v2call<DispatchCalendar>('GET', '/api/v2/ship/dispatch-calendar');
export const patchDispatchCalendar = (patch: { cutoff?: string | null; weekdays?: number[] | null; closed?: string[] | null }) =>
  v2call<DispatchCalendar>('PATCH', '/api/v2/ship/dispatch-calendar', { data: patch });

/* ── app customers also on WhatsApp (Comms) ────────────────────────────── */

export interface AppCustomersSteps { also_phone: boolean; app_push: boolean }
export const getAppCustomersSteps = () => v2call<AppCustomersSteps>('GET', '/api/v2/comms/whatsapp/app-customers');
export const putAppCustomersSteps = (also_phone: boolean) =>
  v2call<AppCustomersSteps>('PUT', '/api/v2/comms/whatsapp/app-customers', { data: { also_phone } });

/* ── shared helpers ────────────────────────────────────────────────────── */

/** A code as people read it ("prescription_upload" is "Prescription upload"): the backend serves codes only. */
export function codeLabel(code: string | null | undefined): string {
  const s = String(code ?? '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** A locale tag's language name from the browser (`hi` is "Hindi"), or the tag itself. */
export function localeName(tag: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return dn.of(tag) || tag;
  } catch {
    return tag;
  }
}

/**
 * A document with blank text removed: `''` and whitespace-only strings are dropped, and objects
 * left with no field are dropped too (every field of these documents is optional; the server
 * refuses an empty string where a URL or a phone is expected).
 */
export function pruneBlank<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => pruneBlank(x)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined || x === null) continue;
      if (typeof x === 'string') { const t = x.trim(); if (t) out[k] = t; continue; }
      const p = pruneBlank(x);
      if (p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p as object).length === 0) continue;
      out[k] = p;
    }
    return out as T;
  }
  return v;
}
