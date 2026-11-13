/**
 * The store app's round two admin routes (HMAPP-3, admin lane DA), one typed call each. Like
 * `appSettings.ts`, every route here is mounted only with the app route switch (`GC_APP_ROUTES`), so a
 * screen shows `NotServed` until the server has it (the host's 404 "No such route", `isNotServed`).
 *
 * Which backend lane serves what (growcord-rs `docs/briefs/HMAPP-3-growth.md` section 2):
 *   BB  app analytics       GET       /api/v2/insights/app/analytics?from&to          orders.read, module analytics
 *   BB  one customer        GET       /api/v2/commerce/customers/{id}/app-answers     customers.read
 *   BB  audience report     GET       /api/v2/commerce/app/audience/report            reports.read
 *   BB  event destinations  GET       /api/v2/marketing/app-events/destinations       settings.read, module connectors
 *                           PUT       /api/v2/marketing/app-events/destinations/{key} settings.manage, a person
 *   BA  app offers          the coupon resource /api/v2/commerce/coupons with `sales_channels` ["app"] and
 *                           `first_channel_order` (tenant 450), through the coupon form; marketing.read; marketing.manage
 *   BC  assistant status    GET       /api/v2/commerce/app/assistant                  public (the app's own read)
 *   BC  assistant settings  GET, PUT  /api/v2/commerce/app/assistant/settings         settings.read; settings.manage, a person
 *   BC  assistant usage     GET       /api/v2/commerce/app/assistant/usage?days       settings.read
 *   BC  feed queue items    (extends `getFeedQueue` in `appSettings.ts`: Instagram items beside reels)
 *
 * The shapes follow the lanes' notes (growcord-rs `.runs/wt-hm3-{a,b,c}/docs/PORT_NOTES/HMAPP-B{A,B,C}.md`)
 * and their views, checked 13 Nov 2026. The commerce and insights routes mount only with the app route
 * switch; the destinations route is always mounted. Every reader below is lenient: a field the server
 * does not send reads as `null` and the screen says it is not given, never a zero that looks real.
 */
import { v2call } from './http';

const C = '/api/v2/commerce';
const I = '/api/v2/insights';

export interface DayRange { from?: string; to?: string }

/* ── small readers ─────────────────────────────────────────────────────── */

/** A finite number, or null (a missing or non-numeric field is "not given", never 0). */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** A list answered bare, as `{items}` or under one of `keys`. */
function listOf(v: unknown, ...keys: string[]): any[] {
  if (Array.isArray(v)) return Array.from(v);
  if (v && typeof v === 'object') {
    for (const k of ['items', ...keys]) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return Array.from(x);
    }
  }
  return [];
}

/* ── App analytics (BB) ───────────────────────────────────────────────── */

/*
 * Lane BB (growcord-rs `.runs/wt-hm3-b`, `apps/insights/core/src/api/app_analytics.rs`, read 13 Nov 18:57):
 * `GET /api/v2/insights/app/analytics?from&to` (`orders.read`, module analytics) answers a panel
 * `{panel: "app", range, bucket, figures}`; the figures: installs, active_devices, sessions, opens,
 * events_total, daily_active_average, monthly_active {end, days, active_devices}, stickiness, series
 * [{bucket, installs, active_devices, sessions}], platforms, install_sources [{channel, source, campaign,
 * partner, installs}], funnel (one object of session counts per step, then `ordered`, the app's orders),
 * events [{event, count}], searches [{via, searches, no_results}] (never the words), orders {app,
 * website, other: {orders, sales, buyers}, app_share_of_orders, app_share_of_sales} (sales in rupees, a
 * plain number) and retention {app, other: {buyers, repeat_buyers, repeat_share}}. The reader also takes
 * flatter spellings; a part not sent reads as not given.
 */

export interface ChannelTotals { orders: number | null; sales: number | null; customers: number | null }
export interface AnalyticsDay {
  day: string;
  installs: number | null;
  active_users: number | null;
  sessions: number | null;
  app_orders: number | null;
  app_sales: number | null;
  web_orders: number | null;
  web_sales: number | null;
}
export interface FunnelStep { step: string; label: string | null; count: number }
/** One searches row: a search's words when the server gives them, else the way people searched (`via`). */
export interface SearchRow { term: string; by_way: boolean; count: number; no_results: number | null }
export interface ReturnPoint { after_days: number; label: string | null; users: number | null; of: number | null; rate: number | null }
export interface PlatformRow { platform: string; installs: number | null; active_users: number | null; sessions: number | null }
export interface InstallSource { channel: string; source: string | null; campaign: string | null; partner: string | null; installs: number }
export interface RepeatRow { buyers_of: string; buyers: number; repeat_buyers: number | null }

export interface AppAnalytics {
  installs: number | null;
  active_users: number | null;
  sessions: number | null;
  daily_active_avg: number | null;
  monthly_active: number | null;
  app: ChannelTotals;
  website: ChannelTotals;
  /** Orders placed anywhere else (counter, marketplaces, manual). */
  other: ChannelTotals;
  /** The app's share of every order and of all sales in the range, 0 to 1 (the server's; null with no orders). */
  app_share_of_orders: number | null;
  app_share_of_sales: number | null;
  days: AnalyticsDay[];
  funnel: FunnelStep[];
  searches: SearchRow[];
  retention: ReturnPoint[];
  platforms: PlatformRow[];
  install_sources: InstallSource[];
  repeat_buyers: RepeatRow[];
  /** What the server says about these figures, in its words. */
  notes: string[];
}

function totals(v: any): ChannelTotals {
  return { orders: numOrNull(v?.orders), sales: numOrNull(v?.sales ?? v?.revenue), customers: numOrNull(v?.customers ?? v?.buyers) };
}

/**
 * The funnel's steps in the order a session walks them (lane BB `db/app_analytics/queries.rs` `funnel`,
 * then `ordered`, the range's app orders), so the screen never depends on an object's key order.
 * A step the server adds later follows these, in the order it came.
 */
export const APP_FUNNEL_STEPS = [
  'sessions', 'viewed_screen', 'searched', 'viewed_item', 'added_to_cart', 'began_checkout', 'added_payment', 'ordered',
] as const;

/** A funnel answered as a list, or as one object of counts, in the walking order above. */
function funnelOf(v: unknown): FunnelStep[] {
  let out: FunnelStep[] = [];
  if (Array.isArray(v)) {
    out = v.map((r: any): FunnelStep => ({
      step: String(r?.step ?? r?.event ?? r?.key ?? ''), label: str(r?.label), count: numOrNull(r?.count ?? r?.users ?? r?.sessions) ?? 0,
    })).filter((r) => r.step);
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = numOrNull(x);
      if (n !== null) out.push({ step: k, label: null, count: n });
    }
  }
  const rank = (step: string) => {
    const i = (APP_FUNNEL_STEPS as readonly string[]).indexOf(step);
    return i < 0 ? APP_FUNNEL_STEPS.length : i;
  };
  return out.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.step) - rank(b.r.step) || a.i - b.i).map((x) => x.r);
}

/** A share answered as 0 to 1 (or a percent), as 0 to 1; null when not given. */
function shareOf(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

/** Money reaches this reader in rupees (`v2call` turns every Money into major units). */
export function readAnalytics(raw: any): AppAnalytics {
  const d = raw?.figures && typeof raw.figures === 'object' ? raw.figures : raw;
  const sum = d?.summary ?? {};
  const orders = d?.orders && typeof d.orders === 'object' && !Array.isArray(d.orders) ? d.orders : null;
  const back = d?.retention && typeof d.retention === 'object' && !Array.isArray(d.retention) ? d.retention : null;
  const days = listOf(d?.daily ?? d?.days ?? d?.series, 'days', 'series').map((r: any): AnalyticsDay => ({
    day: String(r.day ?? r.date ?? r.bucket ?? ''),
    installs: numOrNull(r.installs),
    active_users: numOrNull(r.active_devices ?? r.active_users ?? r.dau),
    sessions: numOrNull(r.sessions),
    app_orders: numOrNull(r.app_orders ?? r.app?.orders),
    app_sales: numOrNull(r.app_sales ?? r.app?.sales),
    web_orders: numOrNull(r.web_orders ?? r.website_orders ?? r.website?.orders),
    web_sales: numOrNull(r.web_sales ?? r.website_sales ?? r.website?.sales),
  })).filter((r) => r.day);
  const byChannel = listOf(d?.orders_by_channel ?? d?.channels ?? (Array.isArray(d?.orders) ? d.orders : null));
  const chan = (name: string) => byChannel.find((r: any) => r?.channel === name);
  const searches = listOf(d?.searches ?? d?.top_searches, 'terms').map((r: any): SearchRow => {
    const term = r?.term ?? r?.query;
    return {
      term: String(term ?? r?.via ?? ''), by_way: !term && !!r?.via,
      count: numOrNull(r?.searches ?? r?.count) ?? 0, no_results: numOrNull(r?.no_results ?? r?.empty),
    };
  }).filter((r) => r.term);
  const retention = (back ? [] : listOf(d?.retention, 'points')).map((r: any): ReturnPoint => {
    const users = numOrNull(r.users ?? r.returned);
    const of = numOrNull(r.of ?? r.cohort ?? r.installs);
    let rate = numOrNull(r.rate ?? r.share);
    if (rate !== null && rate <= 1) rate *= 100;
    if (rate === null && users !== null && of) rate = (users / of) * 100;
    return { after_days: numOrNull(r.after_days ?? r.day) ?? 0, label: str(r.label), users, of, rate };
  });
  const active = d?.active_users;
  const monthly = d?.monthly_active;
  return {
    installs: numOrNull(sum.installs ?? d?.installs?.total ?? d?.installs),
    active_users: numOrNull(sum.active_devices ?? d?.active_devices ?? (typeof active === 'object' && active ? active.total ?? active.distinct : active)),
    sessions: numOrNull(sum.sessions ?? d?.sessions),
    daily_active_avg: numOrNull(d?.daily_active_average ?? d?.daily_active_avg ?? (typeof active === 'object' && active ? active.daily_avg : null)),
    monthly_active: numOrNull(typeof monthly === 'object' && monthly ? monthly.active_devices : monthly ?? d?.monthly_active_devices),
    app: orders ? totals(orders.app) : byChannel.length ? totals(chan('app')) : totals(d?.app),
    website: orders ? totals(orders.website) : byChannel.length ? totals(chan('website')) : totals(d?.website ?? d?.web),
    other: orders ? totals(orders.other) : byChannel.length ? totals(chan('other')) : totals(d?.other),
    app_share_of_orders: shareOf(orders?.app_share_of_orders ?? d?.app_share_of_orders),
    app_share_of_sales: shareOf(orders?.app_share_of_sales ?? d?.app_share_of_sales),
    days,
    funnel: funnelOf(d?.funnel),
    searches,
    retention,
    platforms: listOf(d?.platforms).map((r: any) => ({
      platform: String(r?.platform ?? 'unknown'), installs: numOrNull(r?.installs), active_users: numOrNull(r?.active_devices ?? r?.active_users), sessions: numOrNull(r?.sessions),
    })),
    install_sources: listOf(d?.install_sources).map((r: any) => ({
      channel: String(r?.channel ?? 'unattributed'), source: str(r?.source), campaign: str(r?.campaign), partner: str(r?.partner), installs: numOrNull(r?.installs) ?? 0,
    })),
    repeat_buyers: (back
      ? Object.entries(back).filter(([, v]) => v && typeof v === 'object').map(([k, v]: [string, any]) => ({ buyers_of: k, ...v }))
      : listOf(d?.repeat_buyers)
    ).map((r: any) => ({
      buyers_of: String(r?.buyers_of ?? ''), buyers: numOrNull(r?.buyers) ?? 0, repeat_buyers: numOrNull(r?.repeat_buyers),
    })).filter((r) => r.buyers_of),
    notes: listOf(d?.notes).filter((x): x is string => typeof x === 'string' && !!x.trim()),
  };
}

export const getAppAnalytics = async (range: DayRange): Promise<AppAnalytics> =>
  readAnalytics(await v2call('GET', `${I}/app/analytics`, { params: { from: range.from, to: range.to } }));

/* ── a customer's app answers and the audience report (BB) ───────────── */

/*
 * Lane BB (growcord-rs `.runs/wt-hm3-b`, `apps/commerce/core/src/api/app_audience.rs`, read 13 Nov): both
 * reads name what they count in the request's language (the store's persona list, the active catalogue),
 * `null` when the list or the catalogue no longer has the id. Only answers whose consent is in force.
 */

export interface AnsweredPersona { id: string; kind: string | null; label: string | null }
export interface AnsweredInterest { kind: string; id: string; name: string | null }
export interface CustomerAppAnswers {
  /** `plane_off`, `not_kept`, `no_person`, `not_answered`, `consent_withdrawn` or `answered`. */
  state: string;
  consent: boolean;
  persona: AnsweredPersona | null;
  interests: AnsweredInterest[];
  answered_via: string | null;
  updated_at: string | null;
}

export const getCustomerAppAnswers = async (customerId: string): Promise<CustomerAppAnswers> => {
  const d: any = await v2call('GET', `${C}/customers/${encodeURIComponent(customerId)}/app-answers`);
  const p = d?.persona;
  return {
    state: String(d?.state ?? (d?.consent ? 'answered' : 'not_answered')),
    consent: d?.consent === true,
    persona: p && typeof p === 'object' && p.id ? { id: String(p.id), kind: str(p.kind), label: str(p.label) } : null,
    interests: listOf(d?.interests).map((r: any) => ({ kind: String(r?.kind ?? ''), id: String(r?.id ?? ''), name: str(r?.name) })).filter((r) => r.id),
    answered_via: str(d?.answered_via),
    updated_at: str(d?.updated_at),
  };
};

export interface PersonaCount { id: string; kind: string | null; label: string | null; count: number }
export interface InterestCount { kind: string; id: string; name: string | null; count: number }
export interface AudienceReport {
  /** The person records serve on this deployment (`false`: no answers are kept). */
  plane_on: boolean;
  /** The answers table is there (platform migration 430). */
  kept: boolean;
  /** People whose answers are kept with their consent in force. */
  answered: number | null;
  /** Of them, how many named no persona. */
  without_persona: number | null;
  personas: PersonaCount[];
  interests: InterestCount[];
}

/** Every answer kept now (no date range: an answer is kept or not, whenever it was given). */
export const getAudienceReport = async (): Promise<AudienceReport> => {
  const d: any = await v2call('GET', `${C}/app/audience/report`);
  return {
    plane_on: d?.plane_on !== false,
    kept: d?.kept !== false,
    answered: numOrNull(d?.answered),
    without_persona: numOrNull(d?.without_persona),
    personas: listOf(d?.personas).map((r: any) => ({ id: String(r?.id ?? ''), kind: str(r?.kind), label: str(r?.label), count: numOrNull(r?.count) ?? 0 })).filter((r) => r.id),
    interests: listOf(d?.interests).map((r: any) => ({ kind: String(r?.kind ?? ''), id: String(r?.id ?? ''), name: str(r?.name), count: numOrNull(r?.count) ?? 0 })).filter((r) => r.id),
  };
};

/* ── app offers (BA): coupons limited to the app ─────────────────────── */

/**
 * The sales channel of an order the store's app places (growcord-rs `app_headers::APP_SALES_CHANNEL`,
 * lane BA). An app offer is a COUPON limited to this channel (`coupons.sales_channels`, tenant 450):
 * the server applies the best live one by itself on app orders, code or none, and the app shows it as
 * the App price (`Quote.channel_price`). One editor for every discount: the coupon form.
 */
export const APP_SALES_CHANNEL = 'app';
/** The website's sales channel, the other value a coupon may be limited to (BA's `COUPON_CHANNEL`: `online_store`, `app`). */
export const WEBSITE_SALES_CHANNEL = 'online_store';

/** The channels a coupon row is limited to (empty = every channel), as the list or the form read it. */
export function couponChannels(c: Record<string, any> | null | undefined): string[] {
  const v = c?.sales_channels ?? c?.salesChannels;
  return Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()) : [];
}

/** The coupon row carries the channel fields, so this server keeps them (tenant 450 is in place). */
export function couponKnowsChannels(c: Record<string, any> | null | undefined): boolean {
  return !!c && ['sales_channels', 'salesChannels', 'first_channel_order', 'firstChannelOrder'].some((k) => k in c);
}

/** Only the buyer's first order on the coupon's channel (`coupons.first_channel_order`). */
export function couponFirstChannelOrder(c: Record<string, any> | null | undefined): boolean {
  return (c?.first_channel_order ?? c?.firstChannelOrder) === true;
}

/* ── app event destinations (BB) ──────────────────────────────────────── */

/*
 * Lane BB (growcord-rs `.runs/wt-hm3-b`, `apps/marketing/core/src/api/app_destinations.rs`; owner, 13 Nov
 * 2026): every app event lands on the store's own server first (the app carries no ad kit). A
 * destination is an ad platform the SERVER may forward the app's events to; the list is the backend's
 * code (`meta`, `google_ads`; GA4 is not offered: an app stream needs Firebase ids the app does not
 * carry). Each has its own switch, off by default; one switched on before its account is connected is
 * kept and sends nothing (`sending` false) until `missing` is empty.
 *   GET  /api/v2/marketing/app-events/destinations         settings.read, module connectors
 *   PUT  /api/v2/marketing/app-events/destinations/{key}   settings.manage, a person (403 for a key or agent); {enabled}
 * Meta's switch is the existing `metaPixel.appEvents`; Google Ads' is `appEventDestinations.google_ads`.
 */

/** One destination of the app's events, as the server lists it. */
export interface AppEventDestination {
  /** `meta`, `google_ads`. */
  key: string;
  label: string;
  /** The store's switch. */
  enabled: boolean;
  /** Its account is connected as it needs (`missing` empty). */
  ready: boolean;
  /** What the store still lacks: `meta_pixel`, `google_ads_connection`, `google_ads_developer_token`, `server_conversion_action`. */
  missing: string[];
  /** Sending now: switched on and ready (each customer's consent is still checked per event). */
  sending: boolean;
  /** What it receives, in the server's words. */
  sends: string[];
  /** What a person must also do outside this backend, in the server's words. */
  steps: string[];
  /** Where the switch is kept. */
  setting: string | null;
}
export interface AppEventDestinations {
  /** The app's own events always reach the store's own collector. */
  own_server: boolean;
  destinations: AppEventDestination[];
  /** What no destination ever receives, in the server's words. */
  never_sent: string[];
}

const words = (v: unknown): string[] => listOf(v).filter((x): x is string => typeof x === 'string' && !!x.trim());

function destinationsOf(d: any): AppEventDestinations {
  return {
    own_server: d?.own_server !== false,
    destinations: listOf(d?.destinations).map((r: any): AppEventDestination => {
      const missing = words(r?.missing);
      const enabled = r?.enabled === true;
      const ready = typeof r?.ready === 'boolean' ? r.ready : missing.length === 0;
      return {
        key: String(r?.key ?? ''),
        label: str(r?.label) ?? String(r?.key ?? ''),
        enabled,
        ready,
        missing,
        sending: typeof r?.sending === 'boolean' ? r.sending : enabled && ready,
        sends: words(r?.sends),
        steps: words(r?.steps),
        setting: str(r?.setting),
      };
    }).filter((x) => x.key),
    never_sent: words(d?.never_sent),
  };
}

const M = '/api/v2/marketing';

export const getAppEventDestinations = async (): Promise<AppEventDestinations> =>
  destinationsOf(await v2call('GET', `${M}/app-events/destinations`));

/** One destination on or off (the others are left as saved); answers the whole list. */
export const setAppEventDestination = async (key: string, enabled: boolean): Promise<AppEventDestinations> =>
  destinationsOf(await v2call('PUT', `${M}/app-events/destinations/${encodeURIComponent(key)}`, { data: { enabled } }));

/* ── AI assistant and scan (BC) ───────────────────────────────────────── */

/*
 * Lane BC (growcord-rs `.runs/wt-hm3-c`, `apps/commerce/core/src/api/app_assistant.rs`, read 13 Nov):
 *   GET  /app/assistant                  public: which helpers the app may offer now, and why not
 *   GET, PUT /app/assistant/settings     settings.read; settings.manage and a person (never a key or agent)
 *   GET  /app/assistant/usage?days=1..90 settings.read: calls and tokens per day, purpose and outcome
 * The on and off switches are the app document's (`assistant`, `scan_ai`, `scan_ai_slip`, saved with
 * `PUT /app/settings`). The budget is AI TOKENS a day, not money; no per-request list and no cost is
 * served (the log keeps no personal data: purpose, outcome, provider, model, tokens, language, counts).
 */

/** The store's `app_assistant` setting (every field optional; unset reads the server's default). */
export interface AssistantDoc {
  /** AI tokens (in and out) the app may spend a store day; 0 = none. */
  daily_tokens?: number;
  /** Asks one app install may make an hour. */
  device_per_hour?: number;
  /** Asks one signed-in customer may make a day. */
  customer_per_day?: number;
  /** The fixed reply lines by language tag, each `{key: words}` over the served `word_keys`. */
  words?: Record<string, Record<string, string>>;
}
export interface AssistantSettingsView {
  /** The document in force, the server's defaults filled in. */
  settings: AssistantDoc;
  stored: boolean;
  problem: string | null;
  /** The keys a language's lines may have (`found`, `choose`, `none`, `help` and so on). */
  word_keys: string[];
}

function docOf(v: any): AssistantDoc {
  const out: AssistantDoc = {};
  for (const k of ['daily_tokens', 'device_per_hour', 'customer_per_day'] as const) {
    const n = numOrNull(v?.[k]);
    if (n !== null) out[k] = n;
  }
  if (v?.words && typeof v.words === 'object') {
    const words: Record<string, Record<string, string>> = {};
    for (const [lang, lines] of Object.entries(v.words as Record<string, unknown>)) {
      if (!lines || typeof lines !== 'object') continue;
      const kept: Record<string, string> = {};
      for (const [k, w] of Object.entries(lines as Record<string, unknown>)) if (typeof w === 'string') kept[k] = w;
      words[lang] = kept;
    }
    out.words = words;
  }
  return out;
}

export const getAssistantSettings = async (): Promise<AssistantSettingsView> => {
  const d: any = await v2call('GET', `${C}/app/assistant/settings`);
  return {
    settings: docOf(d?.settings),
    stored: d?.stored === true,
    problem: str(d?.problem),
    word_keys: listOf(d?.word_keys).filter((x): x is string => typeof x === 'string'),
  };
};
/** The whole document (the server refuses a field it does not know). */
export const putAssistantSettings = async (doc: AssistantDoc): Promise<AssistantSettingsView> => {
  const d: any = await v2call('PUT', `${C}/app/assistant/settings`, { data: doc });
  return { settings: docOf(d?.settings), stored: d?.stored === true, problem: str(d?.problem), word_keys: listOf(d?.word_keys).filter((x): x is string => typeof x === 'string') };
};

export interface AssistantHelper { on: boolean; available: boolean; reason: string | null }
export interface AssistantStatus { helpers: Array<{ key: string; helper: AssistantHelper }> }

/** Which helpers the app may offer now (`GET /app/assistant`, the app's own read), each with its reason code. */
export const getAssistantStatus = async (): Promise<AssistantStatus> => {
  const d: any = await v2call('GET', `${C}/app/assistant`);
  const helpers: AssistantStatus['helpers'] = [];
  for (const [key, v] of Object.entries((d && typeof d === 'object' ? d : {}) as Record<string, any>)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'available' in v) {
      helpers.push({ key, helper: { on: v.on === true, available: v.available === true, reason: str(v.reason) } });
    }
  }
  return { helpers };
};

export interface AssistantUseRow { day: string; purpose: string; outcome: string; calls: number; input_tokens: number; output_tokens: number }
export interface AssistantUsage {
  today: string | null;
  daily_tokens: number | null;
  today_tokens: number | null;
  /** The log exists (tenant 460); without it no AI call is made. */
  set_up: boolean;
  rows: AssistantUseRow[];
}

export const getAssistantUsage = async (days: number): Promise<AssistantUsage> => {
  const d: any = await v2call('GET', `${C}/app/assistant/usage`, { params: { days } });
  return {
    today: str(d?.today),
    daily_tokens: numOrNull(d?.daily_tokens),
    today_tokens: numOrNull(d?.today_tokens),
    set_up: d?.set_up === true,
    rows: listOf(d?.rows).map((r: any): AssistantUseRow => ({
      day: String(r?.day ?? ''), purpose: String(r?.purpose ?? ''), outcome: String(r?.outcome ?? ''),
      calls: numOrNull(r?.calls) ?? 0, input_tokens: numOrNull(r?.input_tokens) ?? 0, output_tokens: numOrNull(r?.output_tokens) ?? 0,
    })).filter((r) => r.day),
  };
};
