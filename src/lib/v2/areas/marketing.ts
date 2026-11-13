/**
 * Marketing (marketing ROUTE_MAP: the marketing hub, campaigns, audiences, automation, ads, analytics, attribution, the connections organ and AI studio; crm leads): every list, report and write the marketing panels and the old marketing screens call.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2call, v2try, mapList } from '../http';
import { shapeBody, shapeQuery, snake } from '../shape';
import type { Spec } from '../shape';


const CONNECT: Spec = { connection_id: 's', provider: 's', redirect_uri: 's', services: ['s'] };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The Business Profile location the Google Reviews page shows and syncs: the one on the daily sync, else the first. */
export const pickGoogleLocation = (list: any[]): any | null =>
  list.find((l) => l?.sync_enabled) ?? list[0] ?? null;

/**
 * Google Business Profile locations on v2 (reviews api/saas/mod.rs, content.read to read, content.manage to change;
 * lane MENU-1 social). The old API refreshed the location inside every sync; v2 mirrors locations only when asked.
 */
export const googleBusinessV2 = {
  /** GoogleLocationView[]: each location, its daily-sync switch, Google's own rating and count, the last sync. */
  locations: () => v2call<any[]>('GET', '/api/v2/reviews/google/locations'),
  /** Ask the Google connection which locations it reaches and mirror them; answers the list. */
  refreshLocations: async () => {
    const r = await v2call<any[]>('POST', '/api/v2/reviews/google/locations/refresh', { data: {} });
    return Array.isArray(r) ? r : [];
  },
};

/**
 * MarketingAnalyticsView {model, currency, analytics} (marketing views/beacons.rs:113; the block is db/attribution.rs:544
 * {summary, by_channel, …}): the screens read the block's keys at the top (`summary`, `by_channel`; the hub's
 * attribution tab reads `channels`).
 */
const attributionReply = (d: any) => (isObj(d) && isObj(d.analytics)
  ? { ...d.analytics, channels: d.analytics.channels ?? d.analytics.by_channel, currency: d.currency, model: d.model ?? d.analytics.model, analytics: d.analytics }
  : d);

/** StudioDraftView {draft, creatives} (marketing views/connections.rs:140); AdsAiStudio reads the draft's own keys + `creatives` (old `{...draft, creatives}`). */
const studioDraftReply = (d: any) => (isObj(d) && isObj(d.draft) ? { ...d.draft, creatives: d.creatives ?? [], draft: d.draft } : d);

/** Drop a stale camelCase alias whose snake twin is in the same object (the reply's legacy aliases, sent back on save). */
const unalias = (o: unknown): unknown => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !(/[A-Z]/.test(k) && snake(k) !== k && snake(k) in o))) : o);
const POLICY: Spec = { budgets: 'j', default_utm: 'j', max_per_contact_7d: 'i', quiet_hours: 'j', require_consent: 'b' };

export const MARKETING_ROUTES: V2Route[] = [
  { m: 'GET', from: '/attribution/analytics', row: 'marketing 1. Public beacons and the Instagram feed', to: '/api/v2/marketing/attribution/analytics', qs: ['from','model','to'], reply: attributionReply }, // pages/analytics/MarketingAnalytics reads data.summary / data.by_channel
  { m: 'GET', from: '/connectors',row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections', reply: (d) => d?.connections ?? d }, // ConnectionsView {connections} (marketing views/connections.rs:23); Connections/Leads read the array
  { m: 'DELETE', from: '/connectors/:id', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/{id}' },
  { m: 'POST', from: '/connectors/:provider/callback', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/callback', bs: {'code':'s','state':'s'}, reply: (d) => d?.completed ?? d }, // ConnectCompletedView {completed} (marketing views/connections.rs:49); the callback page reads services/accountEmail
  { m: 'POST', from: '/connectors/:provider/connect', row: 'marketing 8.1 (provider → body)', to: '/api/v2/marketing/connections', body: (c) => shapeBody(CONNECT)({ ...c, body: { ...(c.body ?? {}), provider: c.params.provider } }) },
  { m: 'PATCH', from: '/connectors/:id/credentials', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/{id}/credentials', bs: {'app_owner':'s','credentials':'j'} },
  { m: 'PUT', from: '/connectors/:id/services/:service', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/{id}/services/{service}', bs: {'config':'j','external_resource_id':'s','external_resource_name':'s','is_enabled':'b'} },
  { m: 'GET', from: '/connectors/:id/services/:service/resources', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/{id}/services/{service}/resources', reply: (d) => d?.resources ?? d }, // ResourcesView {resources} (marketing views/connections.rs:71)
  { m: 'POST', from: '/connectors/:id/services/auto-configure', row: 'marketing 8.1 connections, auto configure (META-FIX-1 E1)', to: '/api/v2/marketing/connections/{id}/services/auto-configure', body: () => ({}) }, // META-FIX-1 E1: nothing to send; answers {results: [{service, status: picked | skipped | failed, resource_id, resource_name, reason}]}
  { m: 'POST', from: '/connectors/:id/test', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/{id}/test', bs: 'j' },
  { m: 'POST', from: '/connectors/ai/audit', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/audit', bs: 'j', reply: studioDraftReply }, // draft_view → StudioDraftView (marketing api/connectors.rs:1294); AdsAiStudio reads d.id / d.kind
  { m: 'POST', from: '/connectors/ai/creative-set', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/creative-sets', bs: {'base_prompt':'s','category_id':'s','draft_id':'s','reference_images':['s'],'slots':['s']} },
  { m: 'POST', from: '/connectors/ai/creatives', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/creatives', bs: {'category_id':'s','draft_id':'s','prompt':'s','reference_images':['s'],'slot':'s'} },
  { m: 'GET', from: '/connectors/ai/drafts', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/drafts', qs: ['kind','status'], reply: (d) => d?.drafts ?? d }, // StudioDraftsView {drafts} (marketing views/connections.rs:148)
  { m: 'GET', from: '/connectors/ai/drafts/:id', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/drafts/{id}', reply: studioDraftReply }, // AdsAiStudio openDraft reads d.output / d.kind / d.creatives
  { m: 'POST', from: '/connectors/ai/drafts/:id/apply', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/drafts/{id}/apply', bs: {'daily_budget':'m','edited':'j','landing_url':'s','merchant_id':'s'}, reply: (d) => d?.result ?? d }, // ApplyResultView {result} (marketing views/connections.rs:155); the studio reads campaignId
  { m: 'POST', from: '/connectors/ai/drafts/:id/discard', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/drafts/{id}/discard', bs: 'j' },
  { m: 'POST', from: '/connectors/ai/plan-ad-copy', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/plans/ad-copy', bs: {'brand_name':'s','campaign_id':'s','category_id':'s','landing_url':'s','product_or_theme':'s','usp':'s'}, reply: studioDraftReply },
  { m: 'POST', from: '/connectors/ai/plan-campaign', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/plans/campaign', bs: {'brand_name':'s','campaign_type':'s','category_id':'s','goal':'s','landing_url':'s','monthly_budget':'m','target_audience':'s'}, reply: studioDraftReply },
  { m: 'POST', from: '/connectors/ai/plan-keywords', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/plans/keywords', bs: {'category_id':'s','existing_keywords':['s'],'seed_topic':'s'}, reply: studioDraftReply },
  { m: 'POST', from: '/connectors/ai/plan-pmax', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/ai-studio/plans/pmax', bs: {'brand_name':'s','campaign_id':'s','category_id':'s','landing_url':'s','theme':'s'}, reply: studioDraftReply },
  { m: 'GET', from: '/connectors/dashboard', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/dashboard',
    // DashboardView (marketing views/connections.rs:110): each block is {connected, data}; the Google figures inside `data`
    // are snake_case (google/search_console.rs:371-372, google/merchant.rs:279-283) and `data` gets no legacy alias —
    // ConnectorInsights reads topQueries/topPages and byStatus/lastCheckedAt/topIssues.
    reply: (d: any) => {
      if (!isObj(d)) return d;
      const sc = d.search_console, m = d.merchant;
      const scData = isObj(sc) && isObj(sc.data) ? { ...sc, data: { ...sc.data, topQueries: sc.data.topQueries ?? sc.data.top_queries, topPages: sc.data.topPages ?? sc.data.top_pages } } : sc;
      const mData = isObj(m) && isObj(m.data) ? { ...m, data: { ...m.data, byStatus: m.data.byStatus ?? m.data.by_status, lastCheckedAt: m.data.lastCheckedAt ?? m.data.last_checked_at, topIssues: m.data.topIssues ?? m.data.top_issues } } : m;
      return { ...d, search_console: scData, merchant: mData };
    } },
  {
    // The old filters on the v2 resource (reviews resources.rs GOOGLE_REVIEWS, lane MENU-1 social): `search` is `q`,
    // `published=true|false` is `is_published`, `replied=false` (awaiting a reply) is `reply_comment=null`. The engine
    // filters by equality only, so `replied=true` and a star rating have no v2 filter yet and are not sent.
    m: 'GET', from: '/connectors/google/business-profile/reviews', row: 'marketing 8.3 → reviews google/business-reviews', to: '/api/v2/reviews/google/business-reviews',
    query: (c) => {
      const q = c.query || {};
      const out: Record<string, unknown> = shapeQuery(['limit', 'offset', 'page', 'sort', 'q', 'location_name', 'is_published', 'is_featured'])(c);
      if (q.published === 'true' || q.published === true) out.is_published = true;
      if (q.published === 'false' || q.published === false) out.is_published = false;
      if (q.replied === 'false' || q.replied === false) out.reply_comment = 'null';
      return out;
    },
  },
  { m: 'PATCH', from: '/connectors/google/business-profile/reviews/:id', row: 'marketing 8.3 → reviews', to: '/api/v2/reviews/google/business-reviews/{id}', bs: { display_order: 'i', is_featured: 'b', is_published: 'b' } },
  { m: 'POST', from: '/connectors/google/business-profile/reviews/:id/reply', row: 'marketing 8.3 → reviews', to: '/api/v2/reviews/google/business-reviews/{id}/reply', body: (c) => ({ comment: c.body?.comment ?? c.body?.reply ?? c.body?.text ?? '' }) },
  // Removing a reply: v2 removes it (at Google first) when the reply route gets a blank comment
  // (reviews api/saas/operations.rs google_reply), so the old DELETE is that POST with no comment.
  { m: 'DELETE', from: '/connectors/google/business-profile/reviews/:id/reply', row: 'marketing 8.3 → reviews google/business-reviews/{id}/reply (blank comment)', method: 'POST', to: '/api/v2/reviews/google/business-reviews/{id}/reply', body: () => ({}) },
  {
    // The old summary was {connected, location{…}, rating, reviewCount, local} (connected = a stored location). v2 splits it:
    // the stored locations (GoogleLocationView, reviews views_saas.rs:535) and the public GoogleSummaryView (views_saas.rs:249,
    // `rating` a STRING — the screen calls rating.toFixed). The `local` aggregate is GET /google/curation (GoogleCurationView,
    // lane MENU-1 social): the store's own counts of the chosen location, the star spread as {"1".."5"} like the old one.
    m: 'GET', from: '/connectors/google/business-profile/summary', row: 'marketing 8.3 → reviews google/summary + google/locations + google/curation',
    run: async () => {
      const [sum, locs] = await Promise.all([
        v2try<any>('GET', '/api/v2/reviews/google/summary', {}),
        v2try<any[]>('GET', '/api/v2/reviews/google/locations', []),
      ]);
      const list = Array.isArray(locs) ? locs : [];
      const loc = pickGoogleLocation(list);
      if (!loc) return { ...(isObj(sum) ? sum : {}), connected: false, locations: list };
      const milli = loc.rating_milli ?? sum?.rating_milli;
      const cur = await v2try<any>('GET', '/api/v2/reviews/google/curation', null, { params: { location: loc.name } });
      const local = isObj(cur) ? {
        shownCount: Number(cur.stored) || 0,
        shownAverage: cur.average_milli != null ? Number(cur.average_milli) / 1000 : 0,
        withCommentCount: Number(cur.with_comment) || 0,
        publishedCount: Number(cur.published) || 0,
        featuredCount: Number(cur.featured) || 0,
        unrepliedCount: Number(cur.unreplied) || 0,
        distribution: isObj(cur.distribution) ? cur.distribution : {},
      } : undefined;
      return {
        local,
        ...(isObj(sum) ? sum : {}),
        connected: true,
        location: {
          name: loc.name, title: loc.title ?? sum?.title ?? null, address: loc.address ?? null, placeId: null,
          mapUri: loc.map_uri ?? sum?.map_uri ?? null, newReviewUri: sum?.new_review_uri ?? null,
          lastSyncedAt: loc.last_synced_at ?? null, lastError: loc.last_error ?? null,
        },
        rating: milli != null ? Number(milli) / 1000 : (sum?.rating != null && sum.rating !== '' ? Number(sum.rating) : null),
        reviewCount: Number(loc.total ?? sum?.total ?? 0),
        locations: list,
      };
    },
  },
  {
    // v2 syncs ONE named location: the store's chosen one (else the first) is read first. A store that has never asked
    // Google for its locations has none mirrored, so they are fetched first (POST /google/locations/refresh), as the
    // old sync refreshed the location before pulling reviews.
    m: 'POST', from: '/connectors/google/business-profile/sync', row: 'marketing 8.3 → reviews google/locations/sync',
    run: async (c) => {
      let location = String(c.body?.location ?? '');
      if (!location) {
        let locs = await v2call<any[]>('GET', '/api/v2/reviews/google/locations');
        if (!Array.isArray(locs) || !locs.length) locs = await googleBusinessV2.refreshLocations();
        const pick = pickGoogleLocation(Array.isArray(locs) ? locs : []);
        location = pick?.name ?? '';
        if (!location) throw new Error('Google lists no Business Profile location for this connection. Check that the Google account you connected manages the business, then try again.');
      }
      const r = await v2call<any>('POST', '/api/v2/reviews/google/locations/sync', { data: { location } });
      // GoogleSyncView {location, pulled, pages, …} (reviews views_saas.rs:552); the notice reads `fetched`
      return isObj(r) ? { ...r, fetched: r.fetched ?? r.pulled } : r;
    },
  },
  { m: 'POST', from: '/connectors/google/merchant/sync-status', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/google/merchant/sync-status', bs: 'j' },
  // MENU-1 mkt-overview: GoogleBlockView {currency, data{url, strategy, fetched_at, scores, metrics}}; the snake keys inside `data` pass as they are
  { m: 'GET', from: '/connectors/google/pagespeed', row: 'marketing 8.2 (MENU-1, connectors.ts:543)', to: '/api/v2/marketing/google/pagespeed', qs: ['url', 'strategy'] },
  { m: 'POST', from: '/connectors/google/search-console/inspect', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/google/search-console/inspect', bs: {'url':'s'} },
  { m: 'POST', from: '/connectors/google/search-console/sitemaps', row: 'marketing 8.2 Service features — Marketing’s own o', to: '/api/v2/marketing/google/search-console/sitemaps', bs: {'url':'s'}, reply: (d: any) => (isObj(d) && isObj(d.data) ? { ...d, data: { ...d.data, sitemapUrl: d.data.sitemapUrl ?? d.data.sitemap_url } } : d) }, // GoogleBlockView {currency, data{sitemap_url}} (marketing google/search_console.rs:103); `data` gets no alias, the alert reads sitemapUrl
  { m: 'GET', from: '/connectors/meta/webhooks', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/meta/webhooks', qs: ['limit','object','status'] },
  { m: 'POST', from: '/connectors/meta/webhooks/resync', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/meta/webhooks/resync', bs: 'j' },
  { m: 'GET', from: '/connectors/providers', row: 'marketing 8.1 The connections organ’s face (15)', to: '/api/v2/marketing/connections/providers', reply: (d) => d?.providers ?? d }, // ProvidersView {providers} (marketing views/connections.rs:16)
  { m: 'GET', from: '/crm/contacts', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'POST', from: '/crm/contacts', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'GET', from: '/crm/contacts/:p1', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'PUT', from: '/crm/contacts/:p1', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'DELETE', from: '/crm/contacts/:p1', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'GET', from: '/crm/contacts/:p1/interactions', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'POST', from: '/crm/contacts/:p1/interactions', row: 'no ROUTE_MAP row', gap: 'the old CRM contacts have no v2 route (crm ROUTE_MAP: no row; v2 keeps people as parties — CONTRACT QUESTION for crm)' },
  { m: 'GET', from: '/leads', row: 'crm Route map', to: '/api/v2/crm/leads', qs: ['limit','offset','page','sort','q','source','status','assigned_to'] },
  // MENU-1 crm: a lead staff key in is the `leads` resource create (ROUTE_MAP "POST /crm/leads": marketing.manage,
  // on the audit chain with the staff actor), never the public form route (IP form limiter, no actor, status dropped).
  { m: 'POST', from: '/leads', row: 'crm Route map (Resource leads create)', to: '/api/v2/crm/leads', bs: {'assigned_to':'s','budget_range':'s','email':'s','follow_up_date':'s','metadata':'j','name':'s','notes':'s','phone':'s','product_interest':'s','score':'i','source':'s','status':'s'} },
  { m: 'GET', from: '/leads/follow-up', row: 'crm Route map (GET /leads/follow-up)', to: '/api/v2/crm/leads/follow-ups' },
  // MENU-1 crm: the CRM owner picker (crm desk.rs `GET /staff`: marketing.read, module crm), [{id, name, role}].
  { m: 'GET', from: '/crm/staff', row: 'crm desk (GET /crm/staff)', to: '/api/v2/crm/staff' },
  { m: 'GET', from: '/leads/:id', row: 'crm Route map', to: '/api/v2/crm/leads/{id}' },
  { m: 'PUT', from: '/leads/:id', row: 'crm Route map', method: 'PATCH', to: '/api/v2/crm/leads/{id}', bs: {'assigned_to':'j','budget_range':'j','email':'j','follow_up_date':'j','metadata':'j','name':'s','notes':'j','phone':'j','product_interest':'j','score':'j','source':'j','status':'s'} },
  { m: 'DELETE', from: '/leads/:id', row: 'crm (dropped duplicate → DELETE /crm/leads/{id})', to: '/api/v2/crm/leads/{id}' },
  { m: 'POST', from: '/leads/:id/convert', row: 'crm (dropped duplicate → POST /crm/leads/{id}/convert)', to: '/api/v2/crm/leads/{id}/convert', bs: { customer_id: 's' } },
  { m: 'GET', from: '/leads/stats', row: 'crm Route map', to: '/api/v2/crm/leads/stats' },
  { m: 'GET', from: '/marketing-hub/ads/accounts', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/accounts', reply: (d) => (Array.isArray(d) ? mapList(d, (a: any) => ({ ...a, auth_source: a.auth_source ?? (a.connection_id ? 'connector' : 'account') })) : d) }, // AdAccountView has connection_id, not the old derived auth_source (marketing views/ads.rs:21; Node ads.ts:83); AdsManager tags 'shared connection'
  { m: 'POST', from: '/marketing-hub/ads/accounts', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/accounts', bs: {'account_id':'s','account_name':'s','credentials':'j','is_active':'b','platform':'s'} },
  { m: 'DELETE', from: '/marketing-hub/ads/accounts/:id', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/accounts/{id}' },
  { m: 'POST', from: '/marketing-hub/ads/accounts/:id/test', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/accounts/{id}/test', bs: 'j' },
  { m: 'GET', from: '/marketing-hub/ads/audiences', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences' },
  { m: 'POST', from: '/marketing-hub/ads/audiences', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences', bs: {'description':'s','filter':'j','list_id':'s','name':'s','source':'s'} },
  { m: 'DELETE', from: '/marketing-hub/ads/audiences/:id', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences/{id}' },
  { m: 'POST', from: '/marketing-hub/ads/audiences/:id/approve', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences/{id}/approve', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/ads/audiences/:id/refresh', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences/{id}/refresh', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/ads/audiences/:id/sync', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences/{id}/sync', bs: {'platforms':['s']} },
  { m: 'GET', from: '/marketing-hub/ads/audiences/:id/sync-log', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/audiences/{id}/sync-log' },
  { m: 'GET', from: '/marketing-hub/ads/campaigns', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns', qs: ['account_id','limit','offset','platform','status'] },
  { m: 'POST', from: '/marketing-hub/ads/campaigns', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns', bs: {'ad_account_id':'s','assets':'j','audience':'j','budget_daily':'m','budget_total':'m','campaign_type':'s','custom_audience_id':'s','end_date':'s','formats':['s'],'is_remarketing':'b','name':'s','objective':'s','placements':['s'],'start_date':'s','utm':'j'} },
  { m: 'DELETE', from: '/marketing-hub/ads/campaigns/:id', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns/{id}' },
  { m: 'POST', from: '/marketing-hub/ads/campaigns/:id/pause', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns/{id}/pause', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/ads/campaigns/:id/refresh-stats', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns/{id}/refresh-stats', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/ads/campaigns/:id/sync', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/campaigns/{id}/sync', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/ads/google/reconcile', row: 'marketing 5.6 Ads (MENU-1 ads)', to: '/api/v2/marketing/ads/google/reconcile', bs: 'j' }, // GoogleMeasurementView; the Ad accounts page calls it on a person's click (lib/v2/areas/ads.ts)
  { m: 'POST', from: '/marketing-hub/ads/oauth/:platform/exchange', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/oauth/{platform}/exchange', bs: {'account_id':'s','code':'s','redirect_uri':'s'} },
  { m: 'GET', from: '/marketing-hub/ads/oauth/:platform/url', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/oauth/{platform}/url', qs: ['account_id','redirect_uri'] },
  { m: 'GET', from: '/marketing-hub/ads/platforms', row: 'marketing 5.6 Ads (22) — module ads_management + m', to: '/api/v2/marketing/ads/platforms', reply: (d) => d?.platforms ?? d }, // AdPlatformsView {platforms} (marketing views/ads.rs:13); AdsManager calls platforms.find
  { m: 'GET', from: '/marketing-hub/analytics/ads', row: 'marketing 5.3 Analytics (5)', to: '/api/v2/marketing/analytics/ads' },
  { m: 'GET', from: '/marketing-hub/analytics/attribution', row: 'marketing 5.3 Analytics (5)', to: '/api/v2/marketing/attribution/analytics', qs: ['from','model','to'], reply: attributionReply }, // MarketingAnalyticsHub reads attr.summary / attr.channels
  { m: 'GET', from: '/marketing-hub/analytics/campaigns', row: 'marketing 5.3 Analytics (5)', to: '/api/v2/marketing/analytics/campaigns', qs: ['channel','from','to'] },
  { m: 'GET', from: '/marketing-hub/analytics/kpis', row: 'marketing 5.3 Analytics (5)', to: '/api/v2/marketing/analytics/kpis', qs: ['days'] },
  { m: 'GET', from: '/marketing-hub/audiences/lists', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists' },
  { m: 'POST', from: '/marketing-hub/audiences/lists', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists', bs: {'description':'s','filter':'j','name':'s','source':'s'} },
  { m: 'DELETE', from: '/marketing-hub/audiences/lists/:id', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}' },
  { m: 'POST', from: '/marketing-hub/audiences/lists/:id/from-source', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}/from-source', bs: {'source':'s','status':'s'}, reply: (d: any) => (isObj(d) ? { ...d, source_rows: d.source_rows ?? d.source_count } : d) }, // PopulateResultView {inserted, total, source_count} (marketing views/hub.rs:420); MarketingAudiences reads source_rows
  { m: 'POST', from: '/marketing-hub/audiences/lists/:id/import', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}/import', bs: {'members':[{'consent':'b','email':'s','name':'s','phone':'s'}]} },
  { m: 'GET', from: '/marketing-hub/audiences/lists/:id/members', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}/members', qs: ['limit','offset'] },
  { m: 'DELETE', from: '/marketing-hub/audiences/lists/:id/members/:memberId', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}/members/{memberId}' },
  { m: 'POST', from: '/marketing-hub/audiences/lists/:id/refresh', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/{id}/refresh', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/audiences/lists/from-system', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/lists/from-system', bs: {'name':'s','system':'s'}, reply: (d: any) => (isObj(d) && isObj(d.result) ? { ...d.result, ...d } : d) }, // ListFromSystemView {list, result{inserted,…}} (marketing views/hub.rs:429); the screens read .list.name + .inserted (old {list, ...out})
  { m: 'GET', from: '/marketing-hub/audiences/sources', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/audiences/sources' },
  { m: 'GET', from: '/marketing-hub/audiences/system', row: 'marketing 5.4 Audiences and lists (12)', to: '/api/v2/marketing/audiences/system' },
  { m: 'GET', from: '/marketing-hub/automation/executions', row: 'marketing 5.5 Automation (6)', to: '/api/v2/marketing/automation/executions', qs: ['limit','rule_id'] },
  { m: 'GET', from: '/marketing-hub/automation/rules', row: 'marketing 5.5 Automation (6)', to: '/api/v2/marketing/automation-rules', qs: ['limit','offset','page','sort','q','trigger_event','is_active'] },
  { m: 'POST', from: '/marketing-hub/automation/rules', row: 'marketing 5.5 Automation (6)', to: '/api/v2/marketing/automation-rules', bs: {'channels':['s'],'config':'j','delay_minutes':'i','is_active':'b','name':'s','template_id':'j','trigger_event':'s'} },
  { m: 'PUT', from: '/marketing-hub/automation/rules/:id', row: 'marketing 5.5 Automation (6)', method: 'PATCH', to: '/api/v2/marketing/automation-rules/{id}', bs: {'channels':['s'],'config':'j','delay_minutes':'i','is_active':'b','name':'s','template_id':'j','trigger_event':'s'} },
  { m: 'DELETE', from: '/marketing-hub/automation/rules/:id', row: 'marketing 5.5 Automation (6)', to: '/api/v2/marketing/automation-rules/{id}' },
  { m: 'GET', from: '/marketing-hub/automation/triggers', row: 'marketing 5.5 Automation (6)', to: '/api/v2/marketing/automation/triggers', reply: (d) => d?.triggers ?? d }, // TriggersView {triggers} (marketing views/hub.rs:10); MarketingAutomation maps the array
  { m: 'GET', from: '/marketing-hub/campaigns', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns', qs: ['channel','limit','offset','status'], reply: (d) => (Array.isArray(d) ? mapList(d, (c: any) => ({ ...c, template_name_resolved: c.template_name_resolved ?? c.template_name })) : d) }, // CampaignView.template_name = the old template_name_resolved (marketing views/campaigns.rs:29,71); MarketingCampaigns shows 'tpl:'
  { m: 'POST', from: '/marketing-hub/campaigns', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns', bs: {'ab_split':'i','audience':'j','channel':'s','list_id':'s','name':'s','product_ids':['s'],'scheduled_at':'s','template_ref':'s','template_ref_b':'s','utm':'j'} },
  { m: 'GET', from: '/marketing-hub/campaigns/:id', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns/{id}', reply: (d: any) => (isObj(d) && isObj(d.campaign) ? { ...d.campaign, funnel: d.funnel, recipient_stats: d.recipient_stats, campaign: d.campaign } : d) }, // CampaignDetailView {campaign, funnel, recipient_stats} (marketing views/campaigns.rs:103); the detail panel reads id/status/stats flat (old {...campaign, funnel, recipient_stats})
  { m: 'DELETE', from: '/marketing-hub/campaigns/:id', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns/{id}' },
  { m: 'POST', from: '/marketing-hub/campaigns/:id/estimate', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns/{id}/estimate', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/campaigns/:id/send', row: 'marketing 5.2 Campaigns (8)', to: '/api/v2/marketing/campaigns/{id}/send', bs: 'j' },
  { m: 'GET', from: '/marketing-hub/channels', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/channels', reply: (d: any) => (isObj(d) && Array.isArray(d.channels) ? { ...d, channels: d.channels.map((c: any) => (isObj(c) && isObj(c.stats) ? { ...c.stats, ...c } : c)) } : d) }, // ChannelReadinessView moves the counts (campaigns_total, templates_approved, messages_30d …) into `stats` (marketing views/hub.rs:93,129); ChannelReadiness reads them flat
  { m: 'GET', from: '/marketing-hub/compliance/consents', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/compliance/consents', qs: ['channel','limit','offset','status'] },
  { m: 'POST', from: '/marketing-hub/compliance/consents', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/compliance/consents', bs: {'channels':['s'],'email':'s','granted':'b','note':'s','phone':'s'} },
  { m: 'POST', from: '/marketing-hub/compliance/erase', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/compliance/erase', bs: {'email':'s','phone':'s'} },
  { m: 'GET', from: '/marketing-hub/compliance/export', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/compliance/export', qs: ['email','phone'] },
  { m: 'GET', from: '/marketing-hub/doctor', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/doctor' },
  { m: 'GET', from: '/marketing-hub/overview', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/overview',
    // v2 nests the counters under `overview` (as strings); the dashboard reads them flat as numbers.
    reply: (d: any) => {
      const o = d && typeof d === 'object' && d.overview && typeof d.overview === 'object' ? d.overview : d;
      if (!o || typeof o !== 'object') return d;
      const flat: any = { ...o, currency: d.currency ?? o.currency };
      for (const [k, v] of Object.entries(flat)) if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) flat[k] = Number(v);
      return flat;
    } },
  { m: 'GET', from: '/marketing-hub/settings', row: 'marketing 5.1 Home, settings, compliance (10)', to: '/api/v2/marketing/settings' },
  { m: 'PUT', from: '/marketing-hub/settings/policy', row: 'marketing 5.1 Home, settings, compliance (10)', method: 'PATCH', to: '/api/v2/marketing/settings/policy', bs: {'budgets':'j','default_utm':'j','max_per_contact_7d':'i','quiet_hours':'j','require_consent':'b'},
    // MarketingSettings sends back the GET's policy with BOTH the snake fields and their camelCase aliases, and edits only
    // the camelCase ones (requireConsent, defaultUtm, maxPerContact7d, quietHours); the shaper lets the stale snake twin win,
    // so every edit was dropped. The edited camelCase value wins here; alias junk inside the JSON blocks is dropped.
    body: (c) => {
      const b: any = isObj(c.body) ? c.body : {};
      const pick = (camel: string, sn: string) => (b[camel] !== undefined ? b[camel] : b[sn]);
      return shapeBody(POLICY)({ ...c, body: {
        require_consent: pick('requireConsent', 'require_consent'),
        default_utm: unalias(pick('defaultUtm', 'default_utm')),
        max_per_contact_7d: pick('maxPerContact7d', 'max_per_contact_7d'),
        quiet_hours: unalias(pick('quietHours', 'quiet_hours')),
        budgets: unalias(b.budgets),
      } });
    } },
  { m: 'PUT', from: '/marketing-hub/settings/push', row: 'marketing 5.1 Home, settings, compliance (10)', method: 'PATCH', to: '/api/v2/marketing/settings/push', bs: {'fcm_server_key':'s','vapid_private_key':'s','vapid_public_key':'s','vapid_subject':'s'} },
  { m: 'GET', from: '/marketing-hub/templates', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates', qs: ['channel','limit','offset','status'] },
  { m: 'POST', from: '/marketing-hub/templates', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates', bs: {'body':'s','channel':'s','meta':'j','name':'s','provider_template_id':'s','subject':'s','variables':['s']} },
  { m: 'PUT', from: '/marketing-hub/templates/:id', row: 'comms Marketing templates (duplicate store, me', method: 'PATCH', to: '/api/v2/comms/marketing-templates/{id}', bs: {'body':'s','meta':'j','name':'s','provider_template_id':'s','subject':'s','variables':['s']} },
  { m: 'DELETE', from: '/marketing-hub/templates/:id', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates/{id}' },
  // MSG-0 §5 (ADMIN-MSG-1): the comms routes exist (`apps/comms/core/src/api/marketing_templates.rs:103,112`, permission
  // `marketing.approve`); approve takes no body, reject requires `{ reason }`.
  { m: 'POST', from: '/marketing-hub/templates/:id/approve', row: 'comms marketing_templates.rs:103 (templates.ts:90)', to: '/api/v2/comms/marketing-templates/{id}/approve', body: () => ({}) },
  { m: 'POST', from: '/marketing-hub/templates/:id/reject', row: 'comms marketing_templates.rs:112 (templates.ts:99)', to: '/api/v2/comms/marketing-templates/{id}/reject', bs: {'reason':'s'}, body: (c) => ({ reason: String(c.body?.reason ?? '') }) },
  { m: 'POST', from: '/marketing-hub/templates/:id/submit', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates/{id}/submit', bs: 'j' },
  { m: 'POST', from: '/marketing-hub/templates/sync-sms', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates/sync', bs: {'source':'s'}, body: () => ({ source: 'sms' }) }, // SyncBody {source} is required (comms api/marketing_templates.rs:210); the screen posts no body
  { m: 'POST', from: '/marketing-hub/templates/sync-whatsapp', row: 'comms Marketing templates (duplicate store, me', to: '/api/v2/comms/marketing-templates/sync', bs: {'source':'s'}, body: () => ({ source: 'whatsapp' }) }, // SyncBody {source} is required (comms api/marketing_templates.rs:210); the screen posts no body
  { m: 'GET', from: '/marketing/abandoned-carts', row: 'marketing routes/marketing.ts', to: '/api/v2/marketing/abandoned-carts', qs: ['limit','min_age_hours','min_value','offset'], reply: (d) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, total: r.total ?? r.total_value })) : d) }, // AbandonedCartView.total_value (marketing views/marketing.rs:16); pages/Marketing.tsx reads cart.total
  // MSG-0 §5 (ADMIN-MSG-1): the same hand send as the carts desk — Retain's `POST /carts/{id}/send-recovery` (MSG-4).
  { m: 'POST', from: '/marketing/abandoned-carts/recover/:id', row: 'retain carts — POST /carts/{id}/send-recovery (MSG-4)', to: '/api/v2/retain/carts/{id}/send-recovery', body: (c) => (c.body?.channel ? { channel: c.body.channel } : {}) },
  { m: 'GET', from: '/marketing/campaigns', row: 'marketing routes/marketing.ts', to: '/api/v2/marketing/campaigns', qs: ['channel','limit','offset','status'] },
  { m: 'POST', from: '/marketing/campaigns', row: 'marketing routes/marketing.ts', to: '/api/v2/marketing/campaigns', bs: {'ab_split':'i','audience':'j','channel':'s','list_id':'s','name':'s','product_ids':['s'],'scheduled_at':'s','template_ref':'s','template_ref_b':'s','utm':'j'} },
  { m: 'GET', from: '/marketing/campaigns/:id', row: 'marketing routes/marketing.ts', to: '/api/v2/marketing/campaigns/{id}' },
  { m: 'PUT', from: '/marketing/campaigns/:id', row: 'marketing routes/marketing.ts', method: 'PATCH', to: '/api/v2/marketing/campaigns/{id}', bs: {'audience':'j','body':'s','list_id':'s','media_url':'s','name':'s','product_ids':['s'],'scheduled_at':'s','status':'s','subject':'s','template_name':'s','template_ref':'s','utm':'j'} },
  { m: 'DELETE', from: '/marketing/campaigns/:id', row: 'marketing routes/marketing.ts', to: '/api/v2/marketing/campaigns/{id}' },
  { m: 'POST', from: '/marketing/campaigns/:id/send', row: 'marketing (the hub sender: POST /campaigns/{id}/send)', to: '/api/v2/marketing/campaigns/{id}/send', body: () => ({}) },
];
