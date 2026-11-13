/**
 * DEVELOPMENT ONLY sample data for the Facebook and Instagram page (`?mock=meta` on a dev server; see
 * `meta.ts`). Never imported by a production build. A sample Indian homeopathy store: about 2,400 catalog
 * items with a few dozen Meta errors, campaigns spending a few hundred to a few thousand rupees a day,
 * Instagram posts with captions. State changes (tags, pauses, budgets, sets) live in memory until reload.
 * Wave 2 adds the Ads Manager tree (ad sets and ads under the same campaigns), create options, audiences, the
 * creative library, rules, tests, recommendations, daily insights with breakdowns and the alerts.
 * `&mockvariant=fresh` shows a store that has not connected Meta yet.
 */
import type {
  AiFeature, ApplyResult, CatalogItem, CatalogPage, CatalogSummary, ChannelPlatform, DraftInput, IgFeedSettings,
  IgPost, IgShopping, IgTag, MetaCampaign, MetaCampaigns, MetaProviderDef, MetaSetup, PickableResource, ProductHit,
  ProductSet, ProductSetFilter, RemarketingDraft, RemarketingOptions, StoreCategory, StoreChannel, SyncResult,
  WaCatalogStatus, WaLinkResult,
} from './meta';
import { APPLY_STEPS } from './meta';
import { socialMock } from './meta.mock.social';
import { assistantMock } from './meta.mock.assistant'; // META-17
import { canvasMock } from './meta.mock.canvas'; // META-19
import type {
  AdBudget, AdDetail, AdIssue, AdLevel, AdMetrics, AdPreview, AdRecommendation, AdRow, AdRule, AdsDraft, AdsDraftInput, AdsOptions,
  AdTargeting, AdTest, AdTree, AdTreeQuery, AudienceType, InsightMetrics, Insights, InsightsQuery, LibraryItem, MetaAlert, MetaAudience,
  RuleInput, TargetingHit, TargetingType, TestInput, InsightsSettings, InsightsSyncResult,
} from './meta';

const fresh = (): boolean => {
  try { return new URLSearchParams(window.location.search).get('mockvariant') === 'fresh'; } catch { return false; }
};
const wait = <T,>(v: T, ms = 140): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

/** The draft view an apply answers once every object exists (status `applied`, the ids under `created`). */
const appliedReply = (id: string, name: string | null, campaignId: string): ApplyResult => {
  const created: Record<string, string> = {
    campaign_id: campaignId, adset_id: `${campaignId}1`, creative_id: `${campaignId}2`, ad_id: `${campaignId}3`,
  };
  const at = new Date().toISOString();
  return {
    id, name, status: 'applied', campaign_id: campaignId, created, failed_step: null, error: null, mock_run: null,
    steps: APPLY_STEPS.map((s) => ({ step: s.step, ok: true, id: created[s.slot], at })),
  };
};
const daysAgo = (d: number, h = 10): string => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

/* Pictures: small SVG drawings so the preview needs no network. */
const HUES = [152, 28, 205, 340, 45, 265, 12, 182];
function art(label: string, hue: number, kind: 'bottle' | 'jar' | 'tube' | 'flower' = 'bottle', sub = ''): string {
  const bg = `hsl(${hue} 55% 92%)`, mid = `hsl(${hue} 45% 70%)`, ink = `hsl(${hue} 50% 25%)`;
  const shape = kind === 'jar'
    ? `<rect x="200" y="210" width="200" height="230" rx="26" fill="#fff" stroke="${mid}" stroke-width="6"/><rect x="215" y="170" width="170" height="52" rx="12" fill="${mid}"/>`
    : kind === 'tube'
      ? `<path d="M230 180h140l-20 280h-100z" fill="#fff" stroke="${mid}" stroke-width="6"/><rect x="262" y="140" width="76" height="44" rx="8" fill="${mid}"/>`
      : kind === 'flower'
        ? `${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="300" cy="230" rx="44" ry="92" fill="${mid}" opacity=".8" transform="rotate(${r} 300 300)"/>`).join('')}<circle cx="300" cy="300" r="42" fill="#fff"/>`
        : `<rect x="235" y="190" width="130" height="250" rx="22" fill="#fff" stroke="${mid}" stroke-width="6"/><rect x="262" y="140" width="76" height="56" rx="10" fill="${mid}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="${bg}"/><circle cx="470" cy="120" r="90" fill="${mid}" opacity=".35"/>${shape}<text x="300" y="${kind === 'flower' ? 470 : 330}" font-family="Helvetica,Arial" font-size="26" font-weight="700" fill="${ink}" text-anchor="middle">${label.slice(0, 18)}</text>${sub ? `<text x="300" y="${kind === 'flower' ? 505 : 365}" font-family="Helvetica,Arial" font-size="20" fill="${ink}" text-anchor="middle">${sub.slice(0, 22)}</text>` : ''}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* Catalog */
const REMEDIES = ['Arnica Montana', 'Belladonna', 'Nux Vomica', 'Rhus Tox', 'Pulsatilla', 'Bryonia Alba', 'Calcarea Carb', 'Lycopodium', 'Sulphur',
  'Thuja Occ', 'Calendula Off', 'Hypericum', 'Ignatia Amara', 'Natrum Mur', 'Sepia', 'Silicea', 'Phosphorus', 'Graphites', 'Kali Bich',
  'Apis Mel', 'Gelsemium', 'Arsenicum Alb', 'Chamomilla', 'Cina', 'Drosera', 'Ferrum Phos', 'Magnesia Phos', 'Kali Phos', 'Berberis Vulg',
  'Alfalfa', 'Avena Sativa', 'Echinacea', 'Ruta Grav', 'Ledum Pal', 'Antim Crud', 'Carbo Veg', 'Cantharis', 'Causticum', 'Spongia', 'Staphysagria',
  'Aconite Nap', 'Hepar Sulph', 'Merc Sol', 'Bellis Perennis', 'Coffea Cruda', 'Colocynthis'];
const BRANDS = [
  { code: 'REC', name: 'Dr. Reckeweg' }, { code: 'SBL', name: 'SBL' }, { code: 'SCH', name: 'Schwabe' }, { code: 'BAK', name: 'Bakson' },
  { code: 'ADL', name: 'Adel' }, { code: 'BJN', name: 'Bjain' },
];
const FORMS = [
  { code: '30C-30', name: 'Dilution 30C, 30 ml', cat: 'cat_dil', price: 105, kind: 'bottle' as const },
  { code: '200C-30', name: 'Dilution 200C, 30 ml', cat: 'cat_dil', price: 115, kind: 'bottle' as const },
  { code: '1M-30', name: 'Dilution 1M, 30 ml', cat: 'cat_dil', price: 140, kind: 'bottle' as const },
  { code: 'Q-30', name: 'Mother Tincture Q, 30 ml', cat: 'cat_mt', price: 185, kind: 'bottle' as const },
  { code: '6X-25', name: 'Biochemic 6X, 25 g', cat: 'cat_bio', price: 95, kind: 'jar' as const },
  { code: '6X-450', name: 'Biochemic 6X, 450 g', cat: 'cat_bio', price: 640, kind: 'jar' as const },
  { code: 'OINT', name: 'Ointment, 25 g', cat: 'cat_oint', price: 120, kind: 'tube' as const },
  { code: 'DRP', name: 'Drops, 30 ml', cat: 'cat_drops', price: 210, kind: 'bottle' as const },
  { code: 'SYR', name: 'Syrup, 180 ml', cat: 'cat_syrup', price: 175, kind: 'bottle' as const },
  { code: 'BK', name: 'Book, paperback', cat: 'cat_books', price: 320, kind: 'jar' as const },
];

const ERRORS = {
  image: { level: 'error', code: 'image_missing', text: 'Missing image: Meta needs at least one product image.' },
  price: { level: 'error', code: 'price_mismatch', text: 'Price mismatch: the product page shows a different price.' },
  gtin: { level: 'warning', code: 'gtin_missing', text: 'No GTIN (barcode): Meta matches products better with one.' },
  desc: { level: 'warning', code: 'description_short', text: 'Short description: Meta suggests at least 30 characters.' },
};

let CATALOG: CatalogItem[] | null = null;
function catalog(): CatalogItem[] {
  if (CATALOG) return CATALOG;
  const out: CatalogItem[] = [];
  let i = 0;
  for (const r of REMEDIES) {
    for (const b of BRANDS) {
      for (const f of FORMS) {
        if (out.length >= 2412) break;
        i += 1;
        // Not every brand makes every form: skip some so the counts look like a real store.
        if ((i * 7 + r.length) % 11 === 0 && f.code !== '30C-30') continue;
        const pid = `p_${r.replace(/\W+/g, '').toLowerCase()}_${b.code.toLowerCase()}`;
        const n = out.length;
        let status: CatalogItem['status'] = 'synced';
        let messages: CatalogItem['messages'] = [];
        let review: string | null = 'approved';
        if (f.cat === 'cat_books') { status = 'excluded'; review = null; }
        else if (n % 113 === 7) { status = 'error'; messages = [ERRORS.image]; review = 'rejected'; }
        else if (n % 139 === 11) { status = 'error'; messages = [ERRORS.price]; review = 'rejected'; }
        else if (n % 37 === 5) { status = 'warning'; messages = [n % 2 ? ERRORS.gtin : ERRORS.desc]; }
        else if (n % 97 === 3) { status = 'pending'; review = 'pending'; }
        else if (n % 401 === 9) { status = 'deleted'; review = null; }
        out.push({
          variation_id: `v_${n + 1}`,
          product_id: pid,
          retailer_id: `${b.code}-${r.replace(/\W+/g, '').slice(0, 4).toUpperCase()}-${f.code}`,
          title: `${b.name} ${r} ${f.name}`,
          image: messages[0]?.code === 'image_missing' ? null : art(r, HUES[(n + b.code.length) % HUES.length], f.kind, f.name.split(',')[0]),
          price: f.price + ((n * 13) % 4) * 5 + (b.code === 'SCH' ? 40 : 0),
          currency: 'INR',
          status,
          messages,
          pushed_at: status === 'pending' || status === 'excluded' ? null : minutesAgo(3 + (n % 600)),
          meta_review_status: review,
        });
      }
    }
  }
  CATALOG = out;
  return out;
}

const count = (s: string) => catalog().filter((c) => c.status === s).length;

const CATEGORIES: StoreCategory[] = [
  { id: 'cat_dil', name: 'Dilutions' }, { id: 'cat_mt', name: 'Mother Tinctures' }, { id: 'cat_bio', name: 'Biochemic Tablets' },
  { id: 'cat_oint', name: 'Ointments and Creams' }, { id: 'cat_drops', name: 'Drops' }, { id: 'cat_syrup', name: 'Syrups' },
  { id: 'cat_bach', name: 'Bach Flower Remedies' }, { id: 'cat_hair', name: 'Hair Care' }, { id: 'cat_skin', name: 'Skin Care' },
  { id: 'cat_books', name: 'Books' }, { id: 'cat_kits', name: 'Combos and Kits' }, { id: 'cat_rx', name: 'Doctor prescribed' },
];

let CHANNELS: StoreChannel[] = [
  {
    id: 'ch_fb', platform_code: 'facebook_catalog', display_name: 'Facebook catalog', is_active: true, last_push_at: minutesAgo(4), last_error: null,
    config: { connect_method: 'api', realtime: true, excluded_category_ids: ['cat_books'], custom_labels: { 0: 'brand', 1: 'margin_band', 2: '', 3: '', 4: '' }, out_of_stock: 'exclude' },
  },
  { id: 'ch_wa', platform_code: 'whatsapp_catalog', display_name: 'WhatsApp catalog', is_active: true, last_push_at: minutesAgo(9), last_error: null, config: {} },
  { id: 'ch_gs', platform_code: 'google_shopping', display_name: 'Google Shopping', is_active: true, last_push_at: minutesAgo(12), last_error: null, config: {} },
];

let SETS: ProductSet[] = [
  { id: 'ps_1', name: 'All in-stock products', filter: { in_stock_only: true }, product_count: 2186 },
  { id: 'ps_2', name: 'Mother tinctures', filter: { category_ids: ['cat_mt'] }, product_count: 212 },
  { id: 'ps_3', name: 'Bestsellers under 300 rupees', filter: { price_max_minor: 30000, in_stock_only: true }, product_count: 148 },
];

/* Setup */
let SETUP: MetaSetup = {
  connection: {
    id: 'conn_meta_1', status: 'connected', connected_as: 'Wasim Idrishi (Facebook)', token_expires_at: daysAgo(-5),
    granted: ['business_management', 'catalog_management', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'instagram_basic',
      'instagram_manage_insights', 'ads_read', 'ads_management', 'whatsapp_business_management'],
    missing: ['instagram_shopping_tag_products', 'pages_messaging', 'instagram_manage_messages'],
    // META-8: a person's token (user token configuration), so it expires; a system user token would not.
    login: 'business', token_kind: 'user', token_valid: true, token_never_expires: false, data_access_expires_at: daysAgo(-74),
    token_checked_at: daysAgo(0, 3), token_error: null, business: { id: '1029384756001', name: 'Homeomed Healthcare' },
    assets: [
      { id: '104455667788990', kind: 'page', name: 'Homeomed', permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata'] },
      { id: '100200300400500', kind: 'page', name: null, permissions: ['pages_show_list'] },
      { id: 'act_2233445566', kind: 'ad_account', name: 'Homeomed Ads (INR)', permissions: ['ads_read', 'ads_management'] },
      { id: '889900112233', kind: 'catalog', name: 'Homeomed catalog', permissions: ['catalog_management'] },
      { id: '1029384756001', kind: 'business', name: 'Homeomed Healthcare', permissions: ['business_management'] },
      { id: '109876543210', kind: 'whatsapp_business_account', name: null, permissions: ['whatsapp_business_management'] },
    ],
    permissions_for_every_asset: ['instagram_basic', 'instagram_manage_insights'],
    configuration: [],
    action: { kind: 'reconnect', label: 'Reconnect Meta' },
    note: 'This connection holds a person\'s token, which expires. Reconnect with the business login to get a token that does not expire.',
  },
  items: [
    { key: 'business', state: 'done', picked: { id: '1029384756001', name: 'Homeomed Healthcare' }, needs: [], action: { kind: 'pick', service: 'business', label: 'Change' } },
    { key: 'page', state: 'done', picked: { id: '104455667788990', name: 'Homeomed' }, needs: [], action: { kind: 'pick', service: 'pages', label: 'Change' } },
    {
      key: 'instagram', state: 'blocked', picked: { id: '17841400011122233', name: '@homeomed.in' }, needs: ['shopping_approval', 'permission'],
      missing_permissions: ['instagram_shopping_tag_products'], action: { kind: 'reconnect', label: 'Grant tagging permission' },
    },
    { key: 'ad_account', state: 'done', picked: { id: 'act_2233445566', name: 'Homeomed Ads (INR)' }, needs: [], action: { kind: 'pick', service: 'ads', label: 'Change' } },
    { key: 'pixel', state: 'todo', picked: null, needs: ['pick'], action: { kind: 'pick', service: 'pixel', label: 'Pick pixel' } },
    {
      key: 'catalog', state: 'blocked', picked: { id: '889900112233', name: 'Homeomed catalog' }, needs: ['review'],
      action: { kind: 'open', url: 'https://business.facebook.com/commerce/', label: 'Open Commerce Manager' },
    },
    { key: 'whatsapp', state: 'done', picked: { id: '109876543210', name: '+91 98100 12345 (Homeomed)' }, needs: [], action: { kind: 'pick', service: 'whatsapp', label: 'Change' } },
    {
      key: 'messaging', state: 'blocked', picked: { id: '104455667788990', name: 'Homeomed' }, needs: ['permission'], missing_permissions: ['pages_messaging', 'instagram_manage_messages'],
      action: { kind: 'reconnect', service: 'messaging', label: 'Allow messages' },
      note: 'The Instagram account owner must also switch on Allow access to messages in the Instagram app (Settings, Messages and story replies).',
    },
  ],
};

const RESOURCES: Record<string, PickableResource[]> = {
  pixel: [
    { id: '1187654321098765', name: 'Homeomed Pixel', detail: 'Last event 4 minutes ago' },
    { id: '9988776655443322', name: 'Homeomed old pixel 2023', detail: 'No events in 90 days' },
  ],
  pages: [{ id: '104455667788990', name: 'Homeomed', detail: '12,480 followers' }, { id: '100200300400500', name: 'Homeomed Clinic Lucknow', detail: '1,906 followers' }],
  business: [{ id: '1029384756001', name: 'Homeomed Healthcare' }],
  ads: [{ id: 'act_2233445566', name: 'Homeomed Ads (INR)' }, { id: 'act_9988001122', name: 'Homeomed Test Account (INR)' }],
  instagram: [{ id: '17841400011122233', name: '@homeomed.in' }],
  whatsapp: [{ id: '109876543210', name: '+91 98100 12345 (Homeomed)' }],
  merchant_feed: [{ id: '889900112233', name: 'Homeomed catalog', detail: '2,412 items' }],
};

/* Campaigns: per-day figures, scaled to the chosen range. */
const CAMPAIGNS: Array<Omit<MetaCampaign, 'spend_minor' | 'impressions' | 'clicks' | 'ctr' | 'purchases' | 'purchase_value_minor' | 'roas'> & { perDay: number; roasBase: number | null; ctrBase: number }> = [
  { id: '120210000000001', name: 'Remarketing: viewed, not bought (14 days)', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: 150000, lifetime_budget_minor: null, created_by_growcord: true, perDay: 141200, roasBase: 3.8, ctrBase: 2.41 },
  { id: '120210000000002', name: 'Advantage+ shopping: Mother tinctures', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: 250000, lifetime_budget_minor: null, created_by_growcord: false, perDay: 236500, roasBase: 2.4, ctrBase: 1.62 },
  { id: '120210000000003', name: 'Bach flower remedies: Reels', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: 80000, lifetime_budget_minor: null, created_by_growcord: false, perDay: 77300, roasBase: 0.6, ctrBase: 0.94 },
  { id: '120210000000004', name: 'Biochemic tablets: lookalike 1%', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: 120000, lifetime_budget_minor: null, created_by_growcord: false, perDay: 112800, roasBase: 1.1, ctrBase: 1.21 },
  { id: '120210000000005', name: 'Hair care: Arnica shampoo', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: 50000, lifetime_budget_minor: null, created_by_growcord: false, perDay: 46100, roasBase: 0.8, ctrBase: 1.08 },
  { id: '120210000000006', name: 'Diwali wellness kits', objective: 'OUTCOME_SALES', status: 'PAUSED', effective_status: 'PAUSED', daily_budget_minor: 300000, lifetime_budget_minor: null, created_by_growcord: true, perDay: 0, roasBase: 1.9, ctrBase: 1.9 },
  { id: '120210000000007', name: 'Winter immunity: Arsenicum Alb', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_minor: null, lifetime_budget_minor: 2500000, created_by_growcord: false, perDay: 61900, roasBase: 1.4, ctrBase: 2.05 },
  { id: '120210000000008', name: 'Page likes: Homeomed', objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', effective_status: 'PAUSED', daily_budget_minor: 30000, lifetime_budget_minor: null, created_by_growcord: false, perDay: 0, roasBase: null, ctrBase: 0.7 },
];
let SYNCED_AT = minutesAgo(26);

function rangeDays(from?: string, to?: string): number {
  if (!from || !to) return 30;
  const d = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.min(365, d));
}

function campaignRows(days: number): MetaCampaign[] {
  return CAMPAIGNS.map((c) => {
    // A paused campaign still shows what it spent before it was paused (at most its first 10 days).
    const activeDays = c.status === 'PAUSED' ? Math.min(days, 10) : days;
    const perDay = c.perDay || (c.roasBase === null ? 0 : (c.daily_budget_minor ?? 0) * 0.9);
    const spend = Math.round(perDay * activeDays);
    const impressions = Math.round((spend / 100) / 118 * 1000);
    const clicks = Math.round(impressions * c.ctrBase / 100);
    const value = c.roasBase === null ? 0 : Math.round(spend * c.roasBase);
    const purchases = value ? Math.max(1, Math.round(value / 100 / 640)) : 0;
    return {
      id: c.id, name: c.name, objective: c.objective, status: c.status, effective_status: c.effective_status,
      daily_budget_minor: c.daily_budget_minor, lifetime_budget_minor: c.lifetime_budget_minor, created_by_growcord: c.created_by_growcord,
      spend_minor: spend, impressions, clicks, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null,
      purchases, purchase_value_minor: value, roas: spend && c.roasBase !== null ? Math.round((value / spend) * 100) / 100 : null,
    };
  });
}

/* Instagram */
const CAPTIONS = [
  'Bruised knee from the weekend cricket match? Arnica Montana 30C is the first thing our pharmacists reach for. #homeopathy #arnica',
  'Winter is here. Keep your family kit ready: Arsenicum Alb, Belladonna and Bryonia, all in one box. Link in bio.',
  'Calendula ointment: gentle on small cuts and dry skin. Now back in stock in the 25 g tube.',
  'Exam season stress? Talk to your homeopath about Kali Phos 6X. Free delivery above 499 rupees.',
  'Behind the scenes: every order is packed and checked by a registered pharmacist in Lucknow.',
  'Dr. Reckeweg R-series is here. Swipe to see the most asked for drops this month.',
  'Bach Rescue Remedy for travel days. Small bottle, fits in any bag.',
  'Hair fall is the number one question in our inbox. Here are the remedies people ask about most.',
  'Mother tinctures explained in 30 seconds. Watch the reel.',
  'Diwali hampers are live: wellness kits from 699 rupees, gift wrapped.',
  'Thank you for 12,000 followers! A small gift code for you in the story today.',
  'Biochemic 12 salts: what each one is traditionally used for. Save this post.',
];
let POSTS: IgPost[] = CAPTIONS.map((caption, n) => {
  const kind = n % 4 === 2 || n === 8 ? 'VIDEO' : n % 4 === 1 ? 'CAROUSEL_ALBUM' : 'IMAGE';
  const words = ['Arnica 30C', 'Winter kit', 'Calendula', 'Kali Phos 6X', 'Packed with care', 'R-series', 'Rescue Remedy', 'Hair care', 'Mother tinctures', 'Diwali hampers', '12,000 thank you', 'Biochemic salts'];
  const pic = art(words[n], HUES[n % HUES.length], n === 6 || n === 10 ? 'flower' : n % 3 === 0 ? 'bottle' : n % 3 === 1 ? 'jar' : 'tube');
  return {
    id: `1789${String(4500000000 + n * 7919)}`,
    media_type: kind,
    media_url: kind === 'VIDEO' ? null : pic,
    thumbnail_url: pic,
    permalink: `https://www.instagram.com/p/C${(n + 10).toString(36).toUpperCase()}xHmd${n}/`,
    caption,
    timestamp: daysAgo(n * 3 + 1, n % 9),
    tags: [] as IgTag[],
  };
});
POSTS[0].tags = [{ product_id: 'p_arnicamontana_sbl', variation_id: 'v_1', x: 0.48, y: 0.52, name: 'SBL Arnica Montana Dilution 30C, 30 ml', image: art('Arnica', 152) }];
POSTS[1].tags = [
  { product_id: 'p_arsenicumalb_rec', variation_id: 'v_1301', x: 0.32, y: 0.55, name: 'Dr. Reckeweg Arsenicum Alb Dilution 30C, 30 ml', image: art('Arsenicum', 28), push_to_instagram: true, tagged_on_instagram: true, push_error: null },
  { product_id: 'p_belladonna_sbl', variation_id: 'v_61', x: 0.66, y: 0.48, name: 'SBL Belladonna Dilution 30C, 30 ml', image: art('Belladonna', 205), push_to_instagram: true, tagged_on_instagram: false, push_error: 'This product is not approved in your Meta catalog yet.' },
];
POSTS[2].tags = [{ product_id: 'p_calendulaoff_sch', variation_id: 'v_621', x: 0.5, y: 0.6, name: 'Schwabe Calendula Off Ointment, 25 g', image: art('Calendula', 45, 'tube') }];
POSTS[5].tags = [{ product_id: 'p_arnicamontana_rec', variation_id: 'v_8', x: 0.42, y: 0.5, name: 'Dr. Reckeweg Arnica Montana Drops, 30 ml', image: art('Arnica', 12) }];
POSTS[9].tags = [{ product_id: 'p_kits', variation_id: null, x: 0.5, y: 0.45, name: 'Diwali Wellness Kit', image: art('Wellness kit', 340, 'jar') }];

let FEED: IgFeedSettings = { isEnabled: true, username: 'homeomed.in', heading: 'Follow us on Instagram', count: 8, layout: 'grid' };

/* Remarketing */
const CATALOG_AI: AiFeature[] = [
  { key: 'adapt_to_placement', label: 'Adapt to placement', help: 'Meta fits each image to Feed, Stories and Reels.', default: 'on' },
  { key: 'media_type_automation', label: 'Dynamic media', help: 'Meta shows a product\'s video instead of its image when it expects better results.', default: 'on' },
  { key: 'add_text_overlay', label: 'Add overlays', help: 'Meta adds price or free delivery details from your catalog on top of the image.', default: 'off' },
  { key: 'description_automation', label: 'Dynamic description', help: 'Meta picks the product text to show under each card.', default: 'on' },
  { key: 'image_background_gen', label: 'Generate backgrounds', help: 'Mobile Feed only', default: 'off' },
];
const SINGLE_AI: AiFeature[] = [
  { key: 'image_background_gen', label: 'Generate backgrounds', help: 'Meta places the product photo on backgrounds it makes.', default: 'off' },
  { key: 'image_uncrop', label: 'Expand image', help: 'Meta widens square photos to fit more placements.', default: 'on' },
  { key: 'image_animation', label: 'Image animation', help: 'Meta adds motion to the still photo.', default: 'off' },
  { key: 'text_generation', label: 'Text generation', help: 'Meta writes other versions of your primary text.', default: 'off' },
  { key: 'adapt_to_placement', label: 'Adapt to placement', help: 'Meta fits the image to Feed, Stories and Reels.', default: 'on' },
  { key: 'enhance_cta', label: 'Enhance call to action', help: 'Meta pairs your button with a short phrase from your text.', default: 'off' },
];

const OPTIONS: RemarketingOptions = {
  pixel: { id: '1187654321098765', name: 'Homeomed Pixel' },
  catalog: { id: '889900112233', name: 'Homeomed catalog' },
  countries_default: ['IN'],
  currency: 'INR',
  placeholders: [
    { key: '{{product.name}}', label: 'Product name' },
    { key: '{{product.brand}}', label: 'Brand' },
    { key: '{{product.price}}', label: 'Price' },
    { key: '{{product.current_price}}', label: 'Sale price' },
    { key: '{{product.description}}', label: 'Description' },
  ],
  // Meta's own creative feature keys per format; labels and help are this mock's wording.
  formats: [
    { key: 'carousel', label: 'Carousel', help: 'Several products from the set, side by side.', ai_features: CATALOG_AI },
    { key: 'single', label: 'Single image', help: 'One product image per ad.', ai_features: SINGLE_AI },
    { key: 'collection', label: 'Collection with catalog video', help: 'A cover video Meta makes from your product images for each viewer, with products below it.', ai_features: CATALOG_AI },
  ],
};
let DRAFTS: RemarketingDraft[] = [];

function previewHtml(d: RemarketingDraft, placement: 'facebook_feed' | 'instagram_feed' | 'instagram_story'): string {
  const items = catalog().filter((c) => c.status === 'synced').slice(0, d.format === 'single' ? 1 : d.format === 'collection' ? 3 : 4);
  const sub = (t: string, k: string, v: string) => t.split(k).join(v);
  const fill = (t: string, it: CatalogItem) => [
    ['{{product.name}}', it.title.replace(/^(Dr\. Reckeweg|SBL|Schwabe|Bakson|Adel|Bjain) /, '')],
    ['{{product.brand}}', it.title.split(' ')[0]],
    ['{{product.price}}', `Rs. ${it.price}`],
    ['{{product.current_price}}', `Rs. ${it.price}`],
    ['{{product.description}}', 'Genuine, sealed, from the maker.'],
  ].reduce((acc, [k, v]) => sub(acc, k, v), t);
  const story = placement === 'instagram_story';
  const cover = d.format === 'collection'
    ? `<div style="position:relative;aspect-ratio:1.4;border-radius:8px;overflow:hidden;background:#0f766e;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:8px"><img src="${items[0]?.image ?? ''}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55"/><span style="position:relative;font-size:28px">&#9654;</span><span style="position:absolute;left:8px;bottom:6px;font-size:11px">Catalog video made by Meta</span></div>`
    : '';
  const cards = items.map((it) => `<div style="flex:0 0 ${d.format === 'single' ? '100%' : d.format === 'collection' ? '31%' : '72%'};border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff">
    <img src="${it.image}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block"/>
    <div style="padding:8px 10px;color:#111"><div style="font-weight:600;font-size:13px">${fill(d.headline || '{{product.name}}', it)}</div>
    <div style="font-size:12px;color:#6b7280">${fill(d.description || '{{product.price}}', it)}</div></div></div>`).join('');
  return `<!doctype html><html><body style="margin:0;font-family:Helvetica,Arial,sans-serif;background:${story ? '#111' : '#f3f4f6'}">
  <div style="max-width:360px;margin:0 auto;background:${story ? '#111' : '#fff'};color:${story ? '#fff' : '#111'};padding:10px">
    <div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="width:28px;height:28px;border-radius:50%;background:#0f766e;display:inline-block"></span><b>${placement === 'facebook_feed' ? 'Homeomed' : 'homeomed.in'}</b><span style="color:#9ca3af">Sponsored</span></div>
    <p style="font-size:13px;line-height:1.4;margin:8px 0">${fill(d.primary_text || '', items[0])}</p>
    ${cover}<div style="display:flex;gap:8px;overflow:hidden">${cards}</div>
    <div style="margin-top:8px;padding:8px;border-radius:6px;background:${story ? '#fff' : '#f3f4f6'};color:#111;text-align:center;font-size:13px;font-weight:600">Shop now</div>
    <p style="font-size:10px;color:#9ca3af;margin-top:6px">Sample preview drawn by the development mock. Meta's real preview appears here.</p>
  </div></body></html>`;
}

/* ============================================================================================================
 * Wave 2: the Ads Manager tree, create options, audiences, creative library, rules, tests, insights and alerts.
 * The campaigns are the wave 1 ones above (so a pause in either screen shows in both); ad sets and ads hang under
 * them with a share of each campaign's daily spend. Figures scale with the chosen date range.
 * ========================================================================================================== */

interface MockChild {
  id: string; level: 'adset' | 'ad'; parent_id: string; name: string; status: 'ACTIVE' | 'PAUSED';
  share: number; roasMul: number; ctrMul: number; freq: number;
  budget?: AdBudget; optimization_goal?: string | null;
  issues?: AdIssue[]; review?: { status: string; reasons: string[] }; created_by_growcord?: boolean;
  format?: string; hue?: number; text?: string; kind?: 'bottle' | 'jar' | 'tube' | 'flower';
  targeting?: AdTargeting; placements?: 'auto' | string[];
}

const ADSETS: MockChild[] = [
  { id: 'as_101', level: 'adset', parent_id: '120210000000001', name: 'Viewed a product, 14 days', status: 'ACTIVE', share: 0.62, roasMul: 1.1, ctrMul: 1.1, freq: 2.4, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], age_min: 25, age_max: 65, custom_audiences: [{ id: 'aud_w1', name: 'Viewed a product, 14 days' }], excluded_audiences: [{ id: 'aud_w3', name: 'Bought, 180 days' }], advantage_audience: false }, placements: 'auto' },
  { id: 'as_102', level: 'adset', parent_id: '120210000000001', name: 'Added to cart, 7 days', status: 'ACTIVE', share: 0.38, roasMul: 0.85, ctrMul: 0.9, freq: 3.1, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], age_min: 25, age_max: 65, custom_audiences: [{ id: 'aud_w2', name: 'Added to cart, 30 days' }], advantage_audience: false }, placements: 'auto' },
  { id: 'as_201', level: 'adset', parent_id: '120210000000002', name: 'Advantage+ audience, India', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.7, optimization_goal: 'VALUE',
    targeting: { countries: ['IN'], age_min: 18, age_max: 65, advantage_audience: true }, placements: 'auto' },
  { id: 'as_301', level: 'adset', parent_id: '120210000000003', name: 'Women 25 to 45, metros', status: 'ACTIVE', share: 0.55, roasMul: 1.2, ctrMul: 1.1, freq: 3.9, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], cities: [{ key: 'c_mum', name: 'Mumbai', radius_km: 25 }, { key: 'c_del', name: 'Delhi', radius_km: 25 }, { key: 'c_blr', name: 'Bengaluru', radius_km: 25 }], age_min: 25, age_max: 45, genders: ['female'], interests: [{ id: '6003107902433', name: 'Bach flower remedies' }], advantage_audience: false }, placements: ['instagram_reels', 'facebook_reels', 'instagram_stories'] },
  { id: 'as_302', level: 'adset', parent_id: '120210000000003', name: 'Interest: natural remedies', status: 'ACTIVE', share: 0.45, roasMul: 0.75, ctrMul: 0.9, freq: 2.2, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], age_min: 25, age_max: 55, interests: [{ id: '6003397425735', name: 'Alternative medicine' }, { id: '6003139266461', name: 'Homeopathy' }], advantage_audience: true }, placements: ['instagram_reels', 'facebook_reels'] },
  { id: 'as_401', level: 'adset', parent_id: '120210000000004', name: 'Lookalike 1%, buyers', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.9, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], age_min: 25, age_max: 65, custom_audiences: [{ id: 'aud_l1', name: 'Lookalike 1%, India: buyers' }], advantage_audience: false }, placements: 'auto' },
  { id: 'as_501', level: 'adset', parent_id: '120210000000005', name: 'Hair fall interest', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 2.8, optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: { countries: ['IN'], age_min: 22, age_max: 50, interests: [{ id: '6003456330903', name: 'Hair care' }], advantage_audience: true }, placements: 'auto' },
  { id: 'as_601', level: 'adset', parent_id: '120210000000006', name: 'Gifting interest', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.5, optimization_goal: 'VALUE',
    targeting: { countries: ['IN'], age_min: 25, age_max: 60, interests: [{ id: '6003349442621', name: 'Gifts' }], advantage_audience: true }, placements: 'auto' },
  { id: 'as_701', level: 'adset', parent_id: '120210000000007', name: 'Lucknow and Kanpur, 25 km', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 3.4, optimization_goal: 'LANDING_PAGE_VIEWS',
    issues: [{ code: 'learning_limited', text: 'Learning limited: the audience is small, so Meta finds few people to show it to. Widen the area or the ages.' }],
    targeting: { countries: ['IN'], cities: [{ key: 'c_lko', name: 'Lucknow', radius_km: 25 }, { key: 'c_knp', name: 'Kanpur', radius_km: 25 }], age_min: 30, age_max: 60, advantage_audience: false }, placements: ['facebook_feed', 'instagram_feed'] },
  { id: 'as_801', level: 'adset', parent_id: '120210000000008', name: 'Followers lookalike', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.6, optimization_goal: 'PAGE_LIKES',
    targeting: { countries: ['IN'], age_min: 18, age_max: 65, advantage_audience: true }, placements: ['facebook_feed'] },
];

const ADS: MockChild[] = [
  { id: 'ad_1011', level: 'ad', parent_id: 'as_101', name: 'Carousel: products they viewed', status: 'ACTIVE', share: 0.7, roasMul: 1.1, ctrMul: 1.2, freq: 2.3, format: 'catalog', hue: 152, text: 'Still thinking about it? Genuine, sealed and delivered across India.', created_by_growcord: true },
  { id: 'ad_1012', level: 'ad', parent_id: 'as_101', name: 'Single image: free delivery above 499', status: 'ACTIVE', share: 0.3, roasMul: 0.8, ctrMul: 0.8, freq: 2.1, format: 'image', hue: 28, text: 'Free delivery on orders above 499 rupees. Packed by a registered pharmacist.' },
  { id: 'ad_1021', level: 'ad', parent_id: 'as_102', name: 'Cart reminder carousel', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 3.1, format: 'catalog', hue: 205, text: 'Your cart is waiting. Complete your order today.', created_by_growcord: true },
  { id: 'ad_2011', level: 'ad', parent_id: 'as_201', name: 'Mother tinctures carousel', status: 'ACTIVE', share: 0.5, roasMul: 1.15, ctrMul: 1.1, freq: 1.7, format: 'carousel', hue: 45, text: 'Mother tinctures from Dr. Reckeweg, SBL and Schwabe. Original, sealed, delivered.' },
  { id: 'ad_2012', level: 'ad', parent_id: 'as_201', name: 'Reel: how a Q tincture is made', status: 'ACTIVE', share: 0.3, roasMul: 0.9, ctrMul: 1.0, freq: 1.6, format: 'video', hue: 265, text: 'From plant to bottle in 30 seconds.' },
  { id: 'ad_2013', level: 'ad', parent_id: 'as_201', name: 'Collection: the MT range', status: 'ACTIVE', share: 0.2, roasMul: 0.8, ctrMul: 0.9, freq: 1.8, format: 'collection', hue: 182, text: 'The full mother tincture range in one place.' },
  { id: 'ad_3011', level: 'ad', parent_id: 'as_301', name: 'Reel: Rescue Remedy for travel', status: 'ACTIVE', share: 0.6, roasMul: 1.3, ctrMul: 1.2, freq: 3.2, format: 'video', hue: 340, text: 'Small bottle, fits in any bag.' },
  { id: 'ad_3012', level: 'ad', parent_id: 'as_301', name: 'Reel: exam season', status: 'ACTIVE', share: 0.4, roasMul: 0.6, ctrMul: 0.7, freq: 4.6, format: 'video', hue: 12, text: 'Exam season? Talk to your homeopath first.',
    issues: [{ code: 'creative_fatigue', text: 'Creative fatigue: shown 4.6 times per person this week; results are falling. Try a new video.' }] },
  { id: 'ad_3021', level: 'ad', parent_id: 'as_302', name: 'Static: Bach flower starter kit', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 2.2, format: 'image', hue: 152, kind: 'flower', text: 'The 38 Bach flowers, explained. Starter kits from 699 rupees.' },
  { id: 'ad_4011', level: 'ad', parent_id: 'as_401', name: 'Carousel: the 12 tissue salts', status: 'ACTIVE', share: 0.75, roasMul: 1.05, ctrMul: 1.1, freq: 1.9, format: 'carousel', hue: 28, kind: 'jar', text: 'Biochemic tissue salts by SBL and Schwabe, 25 g and 450 g.' },
  { id: 'ad_4012', level: 'ad', parent_id: 'as_401', name: 'Single image: Kali Phos 6X', status: 'ACTIVE', share: 0.25, roasMul: 0.5, ctrMul: 0.8, freq: 1.9, format: 'image', hue: 205, kind: 'jar', text: 'Stressed and tired? Kali Phos 6X.',
    review: { status: 'DISAPPROVED', reasons: ['Personal health: the text implies the reader has a health condition (Meta advertising standards, personal attributes).'] } },
  { id: 'ad_5011', level: 'ad', parent_id: 'as_501', name: 'Video: Arnica hair shampoo', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 2.8, format: 'video', hue: 182, kind: 'tube', text: 'Arnica shampoo with jaborandi. 200 ml.' },
  { id: 'ad_6011', level: 'ad', parent_id: 'as_601', name: 'Collection: Diwali hampers', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.5, format: 'collection', hue: 45, kind: 'jar', text: 'Wellness hampers from 699 rupees, gift wrapped.', created_by_growcord: true },
  { id: 'ad_7011', level: 'ad', parent_id: 'as_701', name: 'Single image: Arsenicum Alb', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 3.4, format: 'image', hue: 265, text: 'Winter is here. Keep your family kit ready.' },
  { id: 'ad_8011', level: 'ad', parent_id: 'as_801', name: 'Page like ad', status: 'ACTIVE', share: 1, roasMul: 1, ctrMul: 1, freq: 1.6, format: 'existing_post', hue: 152, text: 'Follow Homeomed for remedy guides every week.' },
];

const campaignOf = (id: string) => CAMPAIGNS.find((c) => c.id === id) ?? null;
const adsetOf = (id: string) => ADSETS.find((a) => a.id === id) ?? null;

/** Spend per day (minor units) of a node: its campaign's daily spend times the shares down the tree. */
function perDayOf(level: AdLevel, id: string): number {
  if (level === 'campaign') {
    const c = campaignOf(id);
    if (!c) return 0;
    return c.perDay || (c.roasBase === null ? 0 : (c.daily_budget_minor ?? 0) * 0.9);
  }
  if (level === 'adset') { const s = adsetOf(id); return s ? perDayOf('campaign', s.parent_id) * s.share : 0; }
  const a = ADS.find((x) => x.id === id);
  return a ? perDayOf('adset', a.parent_id) * a.share : 0;
}

const objectiveOf = (level: AdLevel, id: string): string | null => {
  if (level === 'campaign') return campaignOf(id)?.objective ?? null;
  if (level === 'adset') return campaignOf(adsetOf(id)?.parent_id ?? '')?.objective ?? null;
  const a = ADS.find((x) => x.id === id);
  return a ? objectiveOf('adset', a.parent_id) : null;
};

function metricsFor(level: AdLevel, id: string, days: number, scale = 1): AdMetrics {
  const campaignId = level === 'campaign' ? id : level === 'adset' ? adsetOf(id)?.parent_id ?? '' : adsetOf(ADS.find((x) => x.id === id)?.parent_id ?? '')?.parent_id ?? '';
  const c = campaignOf(campaignId);
  const node = level === 'adset' ? adsetOf(id) : level === 'ad' ? ADS.find((x) => x.id === id) ?? null : null;
  const parentSet = level === 'ad' ? adsetOf(node?.parent_id ?? '') : null;
  const roasMul = (node?.roasMul ?? 1) * (parentSet?.roasMul ?? 1);
  const ctrMul = (node?.ctrMul ?? 1) * (parentSet?.ctrMul ?? 1);
  const paused = c?.status === 'PAUSED' || node?.status === 'PAUSED' || parentSet?.status === 'PAUSED';
  const activeDays = paused ? Math.min(days, 10) : days;
  const spend = Math.round(perDayOf(level, id) * activeDays * scale);
  const cpm = 11800 + ((id.length * 977) % 6000);
  const impressions = Math.round((spend / cpm) * 1000);
  const ctr = (c?.ctrBase ?? 1) * ctrMul;
  const clicks = Math.round((impressions * ctr) / 100);
  const freq = node?.freq ?? (c?.status === 'PAUSED' ? 1.4 : 2.1);
  const reach = Math.round(impressions / freq);
  const roas = c?.roasBase === null || c?.roasBase === undefined ? null : Math.round(c.roasBase * roasMul * 100) / 100;
  const value = roas === null ? 0 : Math.round(spend * roas);
  const purchases = value ? Math.max(1, Math.round(value / 100 / 640)) : 0;
  const objective = c?.objective ?? 'OUTCOME_SALES';
  const resultType = objective === 'OUTCOME_SALES' ? 'purchase' : objective === 'OUTCOME_TRAFFIC' ? 'landing_page_view' : 'page_like';
  const results = resultType === 'purchase' ? purchases : resultType === 'landing_page_view' ? Math.round(clicks * 0.72) : Math.round(impressions * 0.004);
  return {
    spend_minor: spend, impressions, reach, frequency: impressions ? freq : null, clicks,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null,
    cpc_minor: clicks ? Math.round(spend / clicks) : null,
    cpm_minor: impressions ? Math.round((spend / impressions) * 1000) : null,
    results, result_type: resultType, cost_per_result_minor: results ? Math.round(spend / results) : null,
    purchases, purchase_value_minor: value, roas: spend && roas !== null ? Math.round((value / spend) * 100) / 100 : null,
  };
}

function sumMetrics(list: AdMetrics[]): AdMetrics {
  const t = { spend_minor: 0, impressions: 0, reach: 0, clicks: 0, results: 0, purchases: 0, purchase_value_minor: 0 };
  for (const m of list) {
    t.spend_minor += m.spend_minor; t.impressions += m.impressions; t.reach += m.reach; t.clicks += m.clicks;
    t.results += m.results; t.purchases += m.purchases; t.purchase_value_minor += m.purchase_value_minor;
  }
  return {
    ...t,
    frequency: t.reach ? Math.round((t.impressions / t.reach) * 100) / 100 : null,
    ctr: t.impressions ? Math.round((t.clicks / t.impressions) * 10000) / 100 : null,
    cpc_minor: t.clicks ? Math.round(t.spend_minor / t.clicks) : null,
    cpm_minor: t.impressions ? Math.round((t.spend_minor / t.impressions) * 1000) : null,
    result_type: null,
    cost_per_result_minor: t.results ? Math.round(t.spend_minor / t.results) : null,
    roas: t.spend_minor ? Math.round((t.purchase_value_minor / t.spend_minor) * 100) / 100 : null,
  };
}

function effectiveOf(level: AdLevel, id: string): string {
  if (level === 'campaign') return campaignOf(id)?.status ?? 'PAUSED';
  const node = level === 'adset' ? adsetOf(id) : ADS.find((x) => x.id === id);
  if (!node) return 'PAUSED';
  if (node.review?.status === 'DISAPPROVED') return 'DISAPPROVED';
  if (node.status === 'PAUSED') return 'PAUSED';
  const set = level === 'ad' ? adsetOf(node.parent_id) : node;
  if (level === 'ad' && set?.status === 'PAUSED') return 'ADSET_PAUSED';
  if (campaignOf(level === 'ad' ? set?.parent_id ?? '' : node.parent_id)?.status === 'PAUSED') return 'CAMPAIGN_PAUSED';
  return 'ACTIVE';
}

function budgetOf(level: AdLevel, id: string): AdBudget {
  if (level === 'ad') return { kind: 'none', amount_minor: null, at: null };
  if (level === 'campaign') {
    const c = campaignOf(id);
    if (c?.daily_budget_minor != null) return { kind: 'daily', amount_minor: c.daily_budget_minor, at: 'campaign' };
    if (c?.lifetime_budget_minor != null) return { kind: 'lifetime', amount_minor: c.lifetime_budget_minor, at: 'campaign' };
    return { kind: 'none', amount_minor: null, at: 'adset' };
  }
  const s = adsetOf(id);
  if (s?.budget) return s.budget;
  const parent = budgetOf('campaign', s?.parent_id ?? '');
  return parent.at === 'campaign' ? parent : { kind: 'none', amount_minor: null, at: null };
}

const START = daysAgo(46, 0).slice(0, 10);
function rowFor(level: AdLevel, id: string, days: number): AdRow {
  const c = level === 'campaign' ? campaignOf(id) : null;
  const node = level === 'adset' ? adsetOf(id) : level === 'ad' ? ADS.find((x) => x.id === id) ?? null : null;
  const parentName = level === 'adset' ? campaignOf(node?.parent_id ?? '')?.name ?? null : level === 'ad' ? adsetOf(node?.parent_id ?? '')?.name ?? null : null;
  const issues: AdIssue[] = level === 'campaign'
    ? ADSETS.filter((s) => s.parent_id === id).flatMap((s) => s.issues ?? [])
    : node?.issues ?? [];
  const eff = effectiveOf(level, id);
  return {
    id, level, parent_id: node?.parent_id ?? null, parent_name: parentName,
    name: c?.name ?? node?.name ?? id,
    status: c?.status ?? node?.status ?? 'PAUSED',
    effective_status: eff,
    objective: objectiveOf(level, id),
    budget: budgetOf(level, id),
    bid_strategy: level === 'ad' ? null : 'LOWEST_COST_WITHOUT_CAP',
    optimization_goal: level === 'adset' ? node?.optimization_goal ?? null : null,
    schedule: { start: START, end: id === '120210000000007' ? daysAgo(-22, 0).slice(0, 10) : null },
    delivery: { status: eff === 'ACTIVE' ? (issues.length ? 'LIMITED' : 'DELIVERING') : 'NOT_DELIVERING', issues },
    review: node?.review ?? { status: 'APPROVED', reasons: [] },
    created_by_growcord: c?.created_by_growcord ?? node?.created_by_growcord ?? false,
    metrics: metricsFor(level, id, days),
  };
}

const idsAt = (level: AdLevel): string[] => (level === 'campaign' ? CAMPAIGNS.map((c) => c.id) : level === 'adset' ? ADSETS.map((s) => s.id) : ADS.map((a) => a.id));
const childrenOf = (level: AdLevel, parentId: string): string[] => (level === 'adset'
  ? ADSETS.filter((s) => s.parent_id === parentId).map((s) => s.id)
  : ADS.filter((a) => a.parent_id === parentId || adsetOf(a.parent_id)?.parent_id === parentId).map((a) => a.id));

const statusMatch = (r: AdRow, s: string): boolean => {
  const e = r.effective_status ?? r.status;
  if (s === 'active') return e === 'ACTIVE';
  if (s === 'paused') return /PAUSED/.test(e);
  if (s === 'issues') return e === 'DISAPPROVED' || e === 'WITH_ISSUES' || r.delivery.issues.length > 0;
  if (s === 'in_review') return e === 'PENDING_REVIEW' || e === 'IN_PROCESS';
  return true;
};

function previewFor(row: AdRow, placement: string, label: string): AdPreview {
  const node = ADS.find((a) => a.id === row.id) ?? ADS.find((a) => a.parent_id === row.id) ?? ADS[0];
  const story = /stories|reels|status/.test(placement);
  const pic = art(node.name.replace(/^[^:]+: /, ''), node.hue ?? 152, node.kind ?? 'bottle');
  const html = `<!doctype html><html><body style="margin:0;font-family:Helvetica,Arial,sans-serif;background:${story ? '#111' : '#f3f4f6'}">
  <div style="max-width:340px;margin:0 auto;background:${story ? '#111' : '#fff'};color:${story ? '#fff' : '#111'};padding:10px">
  <div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="width:28px;height:28px;border-radius:50%;background:#0f766e;display:inline-block"></span><b>${placement.startsWith('facebook') ? 'Homeomed' : 'homeomed.in'}</b><span style="color:#9ca3af">Sponsored</span></div>
  <p style="font-size:13px;line-height:1.4;margin:8px 0">${node.text ?? ''}</p>
  <img src="${pic}" style="width:100%;aspect-ratio:${story ? '0.8' : '1'};object-fit:cover;border-radius:6px;display:block"/>
  <div style="margin-top:8px;padding:8px;border-radius:6px;background:${story ? '#fff' : '#f3f4f6'};color:#111;text-align:center;font-size:13px;font-weight:600">Shop now</div>
  <p style="font-size:10px;color:#9ca3af;margin-top:6px">Sample preview drawn by the development mock. Meta's real preview appears here.</p>
  </div></body></html>`;
  return { placement, label, html };
}

function detailFor(level: AdLevel, id: string): AdDetail {
  const row = rowFor(level, id, 30);
  const set = level === 'adset' ? adsetOf(id) : level === 'ad' ? adsetOf(ADS.find((a) => a.id === id)?.parent_id ?? '') : adsetOf(ADSETS.find((s) => s.parent_id === id)?.id ?? '');
  const ad = level === 'ad' ? ADS.find((a) => a.id === id) ?? null : null;
  return {
    ...row,
    spec: {
      targeting: level === 'campaign' ? null : set?.targeting ?? null,
      placements: level === 'campaign' ? null : set?.placements ?? 'auto',
      destination: 'website',
      conversion_event: row.objective === 'OUTCOME_SALES' ? 'Purchase' : null,
      attribution: '7 day click, 1 day view',
      promoted_object: row.objective === 'OUTCOME_SALES' ? { pixel: 'Homeomed Pixel', event: 'Purchase' } : null,
      creative: ad ? {
        format: ad.format ?? 'image',
        texts: { primary: [ad.text ?? ''], headlines: ['Homeomed: genuine remedies'], descriptions: ['Free delivery above 499 rupees'] },
        link: 'https://homeomed.in/', call_to_action: 'SHOP_NOW',
        url_parameters: 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}',
        previews: [previewFor(row, 'facebook_feed', 'Facebook Feed'), previewFor(row, 'instagram_feed', 'Instagram Feed'), previewFor(row, 'instagram_stories', 'Instagram Stories')],
      } : null,
    },
    children: level === 'campaign' ? { adsets: childrenOf('adset', id).length, ads: childrenOf('ad', id).length } : level === 'adset' ? { ads: ADS.filter((a) => a.parent_id === id).length } : null,
  };
}

/* Create options */
const VIDEO_AI: AiFeature[] = [
  { key: 'adapt_to_placement', label: 'Adapt to placement', help: 'Meta fits the video to Feed, Stories and Reels.', default: 'on' },
  { key: 'video_auto_crop', label: 'Visual touch ups', help: 'Meta crops and sharpens frames for each placement.', default: 'on' },
  { key: 'text_generation', label: 'Text generation', help: 'Meta writes other versions of your primary text.', default: 'off' },
  { key: 'music', label: 'Add music', help: 'Meta adds licensed music where the video has none.', default: 'off' },
];
const opt = (key: string, label: string, help?: string) => ({ key, label, help: help ?? null });
const fmt = (key: string, label: string, help: string, ai: AiFeature[]) => ({ key, label, help, ai_features: ai });
const F = {
  image: fmt('image', 'Single image', 'One picture with your text and a button.', SINGLE_AI),
  video: fmt('video', 'Single video', 'One video or Reel.', VIDEO_AI),
  carousel: fmt('carousel', 'Carousel', 'Two to ten cards people swipe through.', CATALOG_AI.filter((f) => f.key !== 'description_automation')),
  collection: fmt('collection', 'Collection', 'A cover picture or video with products below it, opening a full screen shop.', CATALOG_AI),
  catalog: fmt('catalog', 'Catalog products', 'Meta picks products from a set for each person.', CATALOG_AI),
  existing_post: fmt('existing_post', 'Existing post', 'Boost a post already on your Page or Instagram.', []),
  lead_form: fmt('lead_form', 'Instant form', 'People send their details without leaving Facebook or Instagram.', SINGLE_AI.filter((f) => f.key !== 'image_animation')),
};
const ADS_OPTIONS = {
  objectives: [
    { ...opt('awareness', 'Awareness', 'Show your ads to as many people as possible, and get remembered.'), destinations: ['on_ad'],
      optimization_goals: [opt('REACH', 'Reach the most people'), opt('IMPRESSIONS', 'Most impressions'), opt('AD_RECALL_LIFT', 'Ad recall lift'), opt('THRUPLAY', 'Video views (ThruPlay)')],
      formats: [F.image, F.video, F.carousel, F.existing_post] },
    { ...opt('traffic', 'Traffic', 'Send people to your store, WhatsApp or a chat.'), destinations: ['website', 'whatsapp', 'messenger', 'instagram_direct', 'calls'],
      optimization_goals: [opt('LANDING_PAGE_VIEWS', 'Landing page views'), opt('LINK_CLICKS', 'Link clicks'), opt('REACH', 'Daily unique reach'), opt('CONVERSATIONS', 'Conversations')],
      formats: [F.image, F.video, F.carousel, F.collection, F.existing_post] },
    { ...opt('engagement', 'Engagement', 'More likes, comments, messages and video views.'), destinations: ['on_ad', 'whatsapp', 'messenger', 'instagram_direct', 'website'],
      optimization_goals: [opt('POST_ENGAGEMENT', 'Post engagement'), opt('PAGE_LIKES', 'Page likes'), opt('THRUPLAY', 'Video views (ThruPlay)'), opt('CONVERSATIONS', 'Conversations')],
      formats: [F.image, F.video, F.carousel, F.existing_post] },
    // No Messenger destination for leads: Meta no longer lets the API make Messenger lead ads (META-FIX-1 D2).
    { ...opt('leads', 'Leads', 'Collect enquiries through a form, a chat or a call.'), destinations: ['instant_form', 'website', 'whatsapp', 'calls'],
      optimization_goals: [opt('LEAD_GENERATION', 'Leads'), opt('QUALITY_LEAD', 'Conversion leads'), opt('CONVERSATIONS', 'Conversations'), opt('QUALITY_CALL', 'Calls')],
      formats: [F.lead_form, F.image, F.video, F.carousel] },
    { ...opt('sales', 'Sales', 'Find people likely to buy, with or without your catalog.'), destinations: ['website', 'whatsapp', 'messenger', 'calls'],
      optimization_goals: [opt('OFFSITE_CONVERSIONS', 'Conversions'), opt('VALUE', 'Value of conversions'), opt('LANDING_PAGE_VIEWS', 'Landing page views'), opt('CONVERSATIONS', 'Conversations')],
      formats: [F.catalog, F.image, F.video, F.carousel, F.collection, F.existing_post] },
  ],
  bid_strategies: [
    { key: 'LOWEST_COST_WITHOUT_CAP', label: 'Highest volume', help: 'Meta gets the most results for the budget.', needs: null },
    { key: 'COST_CAP', label: 'Cost per result goal', help: 'Meta keeps the average cost per result near your goal.', needs: 'cost_cap' },
    { key: 'LOWEST_COST_WITH_BID_CAP', label: 'Bid cap', help: 'The most Meta may bid in any one auction.', needs: 'bid_amount' },
    { key: 'LOWEST_COST_WITH_MIN_ROAS', label: 'Return on ad spend goal', help: 'Meta aims for at least this return on each rupee (Sales only).', needs: 'roas' },
  ],
  call_to_actions: [opt('SHOP_NOW', 'Shop now'), opt('ORDER_NOW', 'Order now'), opt('LEARN_MORE', 'Learn more'), opt('SEND_WHATSAPP_MESSAGE', 'Send WhatsApp message'),
    opt('SEND_MESSAGE', 'Send message'), opt('CALL_NOW', 'Call now'), opt('SIGN_UP', 'Sign up'), opt('GET_OFFER', 'Get offer'), opt('CONTACT_US', 'Contact us'), opt('BOOK_NOW', 'Book now')],
  placements: [
    { key: 'facebook_feed', label: 'Facebook Feed', platform: 'Facebook' }, { key: 'facebook_reels', label: 'Facebook Reels', platform: 'Facebook' },
    { key: 'facebook_stories', label: 'Facebook Stories', platform: 'Facebook' }, { key: 'facebook_marketplace', label: 'Marketplace', platform: 'Facebook' },
    { key: 'facebook_search', label: 'Search results', platform: 'Facebook' }, { key: 'instagram_feed', label: 'Instagram Feed', platform: 'Instagram' },
    { key: 'instagram_stories', label: 'Instagram Stories', platform: 'Instagram' }, { key: 'instagram_reels', label: 'Instagram Reels', platform: 'Instagram' },
    { key: 'instagram_explore', label: 'Explore', platform: 'Instagram' }, { key: 'threads_feed', label: 'Threads Feed', platform: 'Threads' },
    { key: 'whatsapp_status', label: 'WhatsApp Status', platform: 'WhatsApp' }, { key: 'messenger_inbox', label: 'Messenger inbox', platform: 'Messenger' },
    { key: 'audience_network', label: 'Apps and sites', platform: 'Audience Network' },
  ],
  special_ad_categories: [opt('FINANCIAL_PRODUCTS_SERVICES', 'Financial products and services'), opt('EMPLOYMENT', 'Employment'), opt('HOUSING', 'Housing'), opt('ISSUES_ELECTIONS_POLITICS', 'Social issues, elections or politics')],
  warnings: [{ code: 'health', text: 'Meta treats this store as health and wellness: audiences or texts that suggest a reader has a condition are refused, and some purchase events may be limited.' }],
  destinations: [
    opt('website', 'Website', 'Your store pages.'), opt('whatsapp', 'WhatsApp', 'Opens a chat with your WhatsApp number.'), opt('messenger', 'Messenger', 'Opens a chat with your Page.'),
    opt('instagram_direct', 'Instagram Direct', 'Opens a chat with your Instagram account.'), opt('calls', 'Phone calls', 'People call you from the ad.'),
    opt('instant_form', 'Instant form', 'A form inside Facebook and Instagram.'), opt('on_ad', 'On the ad', 'People react to the ad itself.'),
  ],
  conversion_events: [opt('Purchase', 'Purchase'), opt('AddToCart', 'Add to cart'), opt('InitiateCheckout', 'Start checkout'), opt('ViewContent', 'View a product'), opt('Lead', 'Lead'), opt('CompleteRegistration', 'Sign up')],
  rule_metrics: [
    { key: 'spend_minor', label: 'Amount spent', kind: 'money' }, { key: 'cost_per_result_minor', label: 'Cost per result', kind: 'money' },
    { key: 'roas', label: 'Return on spend', kind: 'ratio' }, { key: 'cpc_minor', label: 'Cost per click', kind: 'money' },
    { key: 'ctr', label: 'Click rate', kind: 'percent' }, { key: 'frequency', label: 'Frequency', kind: 'ratio' },
    { key: 'purchases', label: 'Purchases', kind: 'count' }, { key: 'cpm_minor', label: 'Cost per 1,000 views', kind: 'money' },
  ],
  url_parameters_default: 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}',
  text_limits: { primary: 5, headlines: 5, descriptions: 5 },
  // META-9B's catalog layouts; no app is registered for this sample store, so App promotion is not offered.
  catalog_layouts: [opt('single', 'Single product'), opt('carousel', 'Carousel'), opt('collection', 'Collection with catalog video')],
  apps: [],
  text_lengths: { primary: 1024, headlines: 255, descriptions: 255 },
};

let ADS_DRAFTS: AdsDraft[] = [];

/* Targeting search */
const T_INTERESTS = ['Homeopathy', 'Alternative medicine', 'Ayurveda', 'Natural medicine', 'Herbalism', 'Bach flower remedies', 'Yoga', 'Meditation', 'Wellness',
  'Hair care', 'Skin care', 'Organic food', 'Parenting', 'Healthy diet', 'Aromatherapy', 'Gifts', 'Online shopping', 'Physical fitness', 'Self care', 'Vitamins'];
const T_BEHAVIOURS = ['Engaged shoppers', 'Online spenders', 'Frequent travellers', 'Facebook payments users (90 days)', 'Early technology adopters', 'Small business owners'];
const T_PLACES: Array<{ id: string; name: string; kind: string; path: string[]; cc: string }> = [
  { id: 'IN', name: 'India', kind: 'country', path: [], cc: 'IN' }, { id: 'AE', name: 'United Arab Emirates', kind: 'country', path: [], cc: 'AE' },
  { id: 'NP', name: 'Nepal', kind: 'country', path: [], cc: 'NP' }, { id: 'GB', name: 'United Kingdom', kind: 'country', path: [], cc: 'GB' },
  { id: 'r_up', name: 'Uttar Pradesh', kind: 'region', path: ['India'], cc: 'IN' }, { id: 'r_mh', name: 'Maharashtra', kind: 'region', path: ['India'], cc: 'IN' },
  { id: 'r_dl', name: 'Delhi', kind: 'region', path: ['India'], cc: 'IN' }, { id: 'r_ka', name: 'Karnataka', kind: 'region', path: ['India'], cc: 'IN' },
  { id: 'r_wb', name: 'West Bengal', kind: 'region', path: ['India'], cc: 'IN' }, { id: 'r_tn', name: 'Tamil Nadu', kind: 'region', path: ['India'], cc: 'IN' },
  { id: 'c_lko', name: 'Lucknow', kind: 'city', path: ['Uttar Pradesh', 'India'], cc: 'IN' }, { id: 'c_knp', name: 'Kanpur', kind: 'city', path: ['Uttar Pradesh', 'India'], cc: 'IN' },
  { id: 'c_mum', name: 'Mumbai', kind: 'city', path: ['Maharashtra', 'India'], cc: 'IN' }, { id: 'c_pune', name: 'Pune', kind: 'city', path: ['Maharashtra', 'India'], cc: 'IN' },
  { id: 'c_del', name: 'New Delhi', kind: 'city', path: ['Delhi', 'India'], cc: 'IN' }, { id: 'c_blr', name: 'Bengaluru', kind: 'city', path: ['Karnataka', 'India'], cc: 'IN' },
  { id: 'c_kol', name: 'Kolkata', kind: 'city', path: ['West Bengal', 'India'], cc: 'IN' }, { id: 'c_dxb', name: 'Dubai', kind: 'city', path: ['United Arab Emirates'], cc: 'AE' },
];
const T_LANGUAGES = ['English (All)', 'Hindi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'];

/* Audiences */
let AUDIENCES: MetaAudience[] = [
  { id: 'aud_w1', type: 'website', name: 'Viewed a product, 14 days', size_low: 38000, size_high: 45000, status: 'ready', spec: { rules: [{ event: 'ViewContent', days: 14 }] }, created_at: daysAgo(60) },
  { id: 'aud_w2', type: 'website', name: 'Added to cart, 30 days', size_low: 9800, size_high: 11500, status: 'ready', spec: { rules: [{ event: 'AddToCart', days: 30 }] }, created_at: daysAgo(60) },
  { id: 'aud_w3', type: 'website', name: 'Bought, 180 days', size_low: 4100, size_high: 4800, status: 'ready', spec: { rules: [{ event: 'Purchase', days: 180 }] }, created_at: daysAgo(58) },
  { id: 'aud_e1', type: 'engagement', name: 'Instagram engagers, 90 days', size_low: 21000, size_high: 25000, status: 'ready', spec: { source: 'instagram', days: 90 }, created_at: daysAgo(40) },
  { id: 'aud_e2', type: 'engagement', name: 'Watched half a Reel, 60 days', size_low: 61000, size_high: 72000, status: 'ready', spec: { source: 'video', days: 60 }, created_at: daysAgo(21) },
  { id: 'aud_l1', type: 'lookalike', name: 'Lookalike 1%, India: buyers', size_low: 4400000, size_high: 5200000, status: 'ready', spec: { source_id: 'aud_w3', country: 'IN', percent: 1 }, created_at: daysAgo(35) },
  { id: 'aud_l2', type: 'lookalike', name: 'Lookalike 3%, India: added to cart', size_low: null, size_high: null, status: 'populating', spec: { source_id: 'aud_w2', country: 'IN', percent: 3 }, note: 'Meta is building it; this takes up to a day.', created_at: daysAgo(0, 3) },
  { id: 'aud_s1', type: 'saved', name: 'Metro women 25 to 45, wellness', size_low: 3100000, size_high: 3700000, status: 'ready', spec: { targeting: { countries: ['IN'], cities: [{ key: 'c_mum', name: 'Mumbai', radius_km: 25 }, { key: 'c_del', name: 'New Delhi', radius_km: 25 }], age_min: 25, age_max: 45, genders: ['female'], interests: [{ id: 't_9', name: 'Wellness' }] } }, created_at: daysAgo(12) },
  { id: 'aud_c1', type: 'customer_list', name: 'Repeat buyers (consented)', size_low: 2100, size_high: 2600, status: 'ready', spec: { list: 'Repeat buyers' }, created_at: daysAgo(30) },
  { id: 'aud_w4', type: 'website', name: 'Arthritis remedy viewers', size_low: null, size_high: null, status: 'blocked', spec: { rules: [{ event: 'ViewContent', days: 30, url_contains: 'arthritis' }] }, note: 'Meta refuses audiences whose name or rule suggests a health condition. Rename it and drop the condition word from the rule.', created_at: daysAgo(4) },
];

/* Creative library */
let LIBRARY: LibraryItem[] = [
  ...['Arnica 30C', 'Winter kit', 'Calendula', 'Kali Phos 6X', 'Rescue Remedy', 'Mother tinctures', 'Diwali hampers', 'Tissue salts'].map((n, i) => ({
    id: `lib_i${i + 1}`, type: 'image', name: `${n}.jpg`, url: art(n, HUES[i % HUES.length], i % 3 === 0 ? 'bottle' : i % 3 === 1 ? 'jar' : 'tube'), thumbnail_url: null,
    status: 'ready', width: 1080, height: 1080, used_in: [3, 1, 0, 1, 2, 4, 1, 0][i], created_at: daysAgo(i * 5 + 2), gallery_id: `products/gallery/${n.toLowerCase().replace(/\W+/g, '-')}.jpg`,
  } as LibraryItem)),
  { id: 'lib_v1', type: 'video', name: 'Rescue Remedy travel reel.mp4', url: null, thumbnail_url: art('Travel reel', 340, 'flower'), status: 'ready', width: 1080, height: 1920, duration_s: 18, used_in: 1, created_at: daysAgo(9) },
  { id: 'lib_v2', type: 'video', name: 'How a Q tincture is made.mp4', url: null, thumbnail_url: art('Q tincture', 265), status: 'ready', width: 1080, height: 1920, duration_s: 31, used_in: 1, created_at: daysAgo(14) },
  { id: 'lib_v3', type: 'video', name: 'Hair care routine.mp4', url: null, thumbnail_url: art('Hair care', 182, 'tube'), status: 'processing', progress: 45, width: 1080, height: 1350, duration_s: 24, used_in: 0, created_at: minutesAgo(6) },
  { id: 'lib_v4', type: 'video', name: 'Unboxing teaser.mp4', url: null, thumbnail_url: art('Unboxing', 45, 'jar'), status: 'error', error: 'Meta could not read the file: the video is shorter than 1 second.', used_in: 0, created_at: daysAgo(1) },
];

/* Rules, tests, recommendations */
let RULES: AdRule[] = [
  { id: 'rule_1', name: 'Pause ads costing more than 600 rupees a purchase', enabled: true, level: 'ad', ids: [], window_days: 3,
    conditions: [{ metric: 'cost_per_result_minor', op: 'gt', value: 60000 }, { metric: 'spend_minor', op: 'gt', value: 150000 }], action: { kind: 'pause' }, schedule: 'hourly',
    last_run_at: minutesAgo(18), last_triggered_at: daysAgo(2), triggered_count: 4 },
  { id: 'rule_2', name: 'Tell me when people see an ad too often', enabled: true, level: 'adset', ids: [], window_days: 7,
    conditions: [{ metric: 'frequency', op: 'gt', value: 4 }], action: { kind: 'notify' }, schedule: 'daily', last_run_at: daysAgo(0, 6), last_triggered_at: daysAgo(0, 6), triggered_count: 1 },
  { id: 'rule_3', name: 'Raise budget 15% when return stays above 3x', enabled: false, level: 'campaign', ids: ['120210000000001'], window_days: 7,
    conditions: [{ metric: 'roas', op: 'gt', value: 3 }], action: { kind: 'budget_percent', value: 15 }, schedule: 'daily', last_run_at: null, last_triggered_at: null, triggered_count: 0 },
];

let TESTS: AdTest[] = [
  { id: 'test_1', name: 'Reels or Feed images for Bach flower', status: 'running', kind: 'adset', metric: 'cost_per_result_minor', start: daysAgo(6).slice(0, 10), end: daysAgo(-8).slice(0, 10),
    cells: [
      { id: 'cell_a', name: 'Reels (women 25 to 45)', object_ids: ['as_301'], metrics: metricsFor('adset', 'as_301', 6) },
      { id: 'cell_b', name: 'Interest: natural remedies', object_ids: ['as_302'], metrics: metricsFor('adset', 'as_302', 6) },
    ], winner_cell_id: null, confidence: 64 },
  { id: 'test_2', name: 'Carousel or single image for remarketing', status: 'completed', kind: 'adset', metric: 'cost_per_result_minor', start: daysAgo(40).slice(0, 10), end: daysAgo(26).slice(0, 10),
    cells: [
      { id: 'cell_c', name: 'Carousel of viewed products', object_ids: ['as_101'], metrics: metricsFor('adset', 'as_101', 14), is_winner: true },
      { id: 'cell_d', name: 'Single image reminder', object_ids: ['as_102'], metrics: metricsFor('adset', 'as_102', 14) },
    ], winner_cell_id: 'cell_c', confidence: 94 },
];

let RECOMMENDATIONS: AdRecommendation[] = [
  { id: 'rec_1', kind: 'rejected', level: 'ad', object_id: 'ad_4012', object_name: 'Single image: Kali Phos 6X', title: 'An ad was rejected',
    text: 'Meta says the text implies the reader has a health condition. Rewrite it without "stressed and tired", then ask for a review.', can_apply: false, since: daysAgo(1) },
  { id: 'rec_2', kind: 'creative_fatigue', level: 'ad', object_id: 'ad_3012', object_name: 'Reel: exam season', title: 'People are tiring of a video',
    text: 'Shown 4.6 times per person this week and the cost per purchase rose 38%. Add a new video to the ad set or pause this one.', can_apply: false, since: daysAgo(2) },
  { id: 'rec_3', kind: 'budget_limited', level: 'campaign', object_id: '120210000000001', object_name: 'Remarketing: viewed, not bought (14 days)', title: 'Your best campaign is held back by its budget',
    text: 'It returns 3.8x and spends its whole budget by evening.', impact: 'Meta estimates 18% more purchases a week.',
    apply_text: 'Raise the daily budget from ₹1,500 to ₹1,950: up to ₹13,500 more over 30 days.', can_apply: true, since: daysAgo(3) },
  { id: 'rec_4', kind: 'advantage_audience', level: 'adset', object_id: 'as_401', object_name: 'Lookalike 1%, buyers', title: 'Let Meta widen a lookalike audience',
    text: 'Turning on Advantage audience lets Meta reach people beyond the lookalike when they are likely to buy.', impact: 'Meta estimates 12% lower cost per purchase.',
    apply_text: 'Turn on Advantage audience for this ad set. Its budget does not change.', can_apply: true, since: daysAgo(5) },
  { id: 'rec_5', kind: 'learning_limited', level: 'adset', object_id: 'as_701', object_name: 'Lucknow and Kanpur, 25 km', title: 'An ad set is learning limited',
    text: 'Fewer than 50 results a week. Widen the area to 40 km or merge it with another ad set.', can_apply: false, since: daysAgo(6) },
];

/* Insights */
const BREAKDOWN_ROWS: Record<string, Array<[string, string, number, number]>> = {
  // key, label, share of spend, return multiplier
  age: [['18-24', '18 to 24', 0.08, 0.5], ['25-34', '25 to 34', 0.31, 1.0], ['35-44', '35 to 44', 0.29, 1.25], ['45-54', '45 to 54', 0.18, 1.2], ['55-64', '55 to 64', 0.1, 0.9], ['65+', '65 and over', 0.04, 0.7]],
  gender: [['female', 'Women', 0.58, 1.12], ['male', 'Men', 0.39, 0.86], ['unknown', 'Not known', 0.03, 0.7]],
  country: [['IN', 'India', 0.95, 1.02], ['AE', 'United Arab Emirates', 0.03, 0.6], ['NP', 'Nepal', 0.02, 0.3]],
  region: [['up', 'Uttar Pradesh', 0.24, 1.2], ['mh', 'Maharashtra', 0.19, 1.05], ['dl', 'Delhi', 0.14, 1.1], ['ka', 'Karnataka', 0.11, 0.95], ['wb', 'West Bengal', 0.09, 1.0], ['tn', 'Tamil Nadu', 0.07, 0.8], ['other', 'Other regions', 0.16, 0.85]],
  placement: [['facebook_feed', 'Facebook Feed', 0.27, 1.1], ['instagram_feed', 'Instagram Feed', 0.21, 1.05], ['instagram_reels', 'Instagram Reels', 0.22, 0.95], ['instagram_stories', 'Instagram Stories', 0.12, 0.8], ['facebook_reels', 'Facebook Reels', 0.09, 0.85], ['whatsapp_status', 'WhatsApp Status', 0.04, 0.7], ['audience_network', 'Apps and sites', 0.05, 0.2]],
  device: [['android', 'Android phone', 0.74, 0.95], ['iphone', 'iPhone', 0.17, 1.35], ['desktop', 'Computer', 0.06, 1.1], ['tablet', 'Tablet', 0.03, 0.8]],
  product_id: [['REC-ARNI-30C-30', 'Dr. Reckeweg Arnica Montana 30C', 0.12, 1.4], ['SBL-CALE-OINT', 'SBL Calendula ointment', 0.09, 1.2], ['SCH-KALI-6X-25', 'Schwabe Kali Phos 6X, 25 g', 0.08, 1.1], ['BAK-ARSE-30C-30', 'Bakson Arsenicum Alb 30C', 0.07, 1.0], ['REC-BELL-Q-30', 'Dr. Reckeweg Belladonna Q', 0.06, 0.9], ['other', 'Other products', 0.58, 0.95]],
  creative: ADS.slice(0, 8).map((a, i) => [a.id, a.name, [0.18, 0.08, 0.12, 0.16, 0.09, 0.07, 0.11, 0.07][i], [1.2, 0.8, 1.0, 1.15, 0.9, 0.8, 1.3, 0.6][i]] as [string, string, number, number]),
};

function dailySeries(from: string, to: string): Array<{ date: string; factor: number }> {
  const out: Array<{ date: string; factor: number }> = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(start), i = 0; d <= end && i < 400; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const dow = d.getUTCDay();
    // Weekends sell a little more; a slow drift up over the period.
    const factor = (dow === 0 || dow === 6 ? 1.12 : 0.96) * (0.9 + (i % 9) * 0.025);
    out.push({ date: d.toISOString().slice(0, 10), factor });
  }
  return out;
}

function scaleMetrics(m: AdMetrics, f: number, rf = 1): InsightMetrics {
  const spend = Math.round(m.spend_minor * f);
  const value = Math.round(m.purchase_value_minor * f * rf);
  const impressions = Math.round(m.impressions * f);
  const clicks = Math.round(m.clicks * f);
  const purchases = Math.round(m.purchases * f * rf);
  return {
    ...m, spend_minor: spend, purchase_value_minor: value, impressions, clicks, reach: Math.round(m.reach * f), purchases,
    results: Math.round(m.results * f * rf), roas: spend ? Math.round((value / spend) * 100) / 100 : null,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null, cpc_minor: clicks ? Math.round(spend / clicks) : null,
    cpm_minor: impressions ? Math.round((spend / impressions) * 1000) : null, cost_per_result_minor: purchases ? Math.round(spend / purchases) : null,
    landing_page_views: Math.round(clicks * 0.71), add_to_carts: Math.round(purchases * 3.4), checkouts: Math.round(purchases * 1.7),
    video_plays: Math.round(impressions * 0.21), thruplays: Math.round(impressions * 0.06), leads: 0,
  };
}

function insightsFor(q: InsightsQuery): Insights {
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? daysAgo(29, 0).slice(0, 10);
  const days = rangeDays(from, to);
  const level: AdLevel = q.level === 'account' ? 'campaign' : q.level;
  const pick = q.ids ? q.ids.split(',').filter(Boolean) : idsAt(level);
  const attr = q.attribution === '1d_click' ? 0.72 : q.attribution === '7d_click' ? 0.88 : 1;
  const totals = scaleMetrics(sumMetrics(pick.map((id) => metricsFor(level, id, days))), 1, attr);
  const series = dailySeries(from, to).map(({ date, factor }) => ({ date, ...scaleMetrics(totals, factor / days) }));
  const prev = scaleMetrics(totals, 0.86, 0.92);
  let rows: Insights['rows'] = [];
  if (!q.breakdown || q.breakdown === 'none') {
    rows = pick.map((id) => ({ key: id, label: rowFor(level, id, days).name, ...scaleMetrics(metricsFor(level, id, days), 1, attr) }));
  } else {
    const spec = BREAKDOWN_ROWS[q.breakdown === 'age_gender' ? 'age' : q.breakdown]
      ?? Array.from({ length: 24 }, (_, h) => [String(h), `${String(h).padStart(2, '0')}:00`, [0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2.4, 3.6, 4.4, 5, 5.2, 5.4, 5.3, 5.1, 5.0, 5.2, 5.6, 6.4, 7.4, 8.2, 8.0, 6.2, 3.4][h] / 100, 0.7 + (h % 7) * 0.08] as [string, string, number, number]);
    rows = spec.map(([key, label, share, mul]) => ({ key, label, ...scaleMetrics(totals, share, mul) }));
  }
  return {
    currency: 'INR', synced_at: SYNCED_AT, totals, compare_totals: q.compare === 'previous' ? prev : null, series, rows,
    store_truth: { orders: Math.round(totals.purchases * 0.82), revenue_minor: Math.round(totals.purchase_value_minor * 0.78), matched_by: ['click_id', 'utm'] },
    choices: INSIGHT_CHOICES, notes: [], report: { status: 'done', running: false },
  };
}

/* Insights settings (META-10's seeded defaults; this sample store raised the return target to 1.5x). */
const INSIGHT_DEFAULTS: InsightsSettings['settings'] = {
  sync: { levels: ['account', 'campaign', 'adset', 'ad'], default_days: 30, max_range_days: 400 },
  alerts: {
    levels: ['campaign', 'adset', 'ad'], sales_objectives: ['OUTCOME_SALES'], aov_days: 90,
    spend_no_sales: { enabled: true, days: 3, min_spend_minor: null, aov_multiple: '1' },
    roas_below: { enabled: true, days: 7, target: '1', min_spend_minor: null, aov_multiple: '2' },
    cpa_spike: { enabled: true, recent_days: 3, baseline_days: 14, percent: 50, min_purchases: 3 },
    frequency: { enabled: true, days: 7, max: '4' },
    rejected: { enabled: true }, account_issue: { enabled: true }, token: { enabled: true, expires_within_days: 7 },
  },
  store_truth: { utm: { campaign: ['utm_id', 'utm_campaign'], adset: ['utm_term'], ad: ['utm_content'] } },
};
let INSIGHT_STORED: Partial<InsightsSettings['settings']> = { alerts: { roas_below: { enabled: true, target: '1.5' } } };
const mergeDeep = (a: any, b: any): any => {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = mergeDeep(a[k], b[k]);
  return out;
};
const INSIGHT_CHOICES = {
  breakdowns: [
    { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' }, { key: 'age_gender', label: 'Age and gender' }, { key: 'country', label: 'Country' },
    { key: 'region', label: 'Region' }, { key: 'placement', label: 'Placement' }, { key: 'device', label: 'Device' }, { key: 'product_id', label: 'Product' },
    { key: 'hour', label: 'Hour of day' }, { key: 'creative', label: 'Ad' },
  ],
  attributions: [
    { key: 'default', label: "Ad set's own setting (as in Ads Manager)" }, { key: '7d_click', label: '7 day click' },
    { key: '1d_click', label: '1 day click' }, { key: '7d_click_1d_view', label: '7 day click or 1 day view' },
  ],
};
const insightSettings = (): InsightsSettings => ({ settings: mergeDeep(INSIGHT_DEFAULTS, INSIGHT_STORED), defaults: INSIGHT_DEFAULTS, stored: INSIGHT_STORED, choices: INSIGHT_CHOICES });

const adsMock = {
  adsTree: (q: AdTreeQuery) => {
    const days = rangeDays(q.from, q.to);
    let ids = q.parent_id ? childrenOf(q.level === 'campaign' ? 'adset' : q.level, q.parent_id) : idsAt(q.level);
    if (q.level === 'campaign') ids = idsAt('campaign');
    let rows = ids.map((id) => rowFor(q.level, id, days));
    const term = (q.q ?? '').trim().toLowerCase();
    if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));
    if (q.status) rows = rows.filter((r) => q.status!.split(',').some((s) => statusMatch(r, s)));
    const size = q.page_size ?? 25;
    const page = Math.max(1, q.page ?? 1);
    return wait<AdTree>({
      synced_at: SYNCED_AT, currency: 'INR', totals: sumMetrics(rows.map((r) => r.metrics)), rows: rows.slice((page - 1) * size, page * size),
      total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / size)),
    }, 220);
  },
  adDetail: (level: AdLevel, id: string) => wait<AdDetail>(detailFor(level, id), 260),
  adStatus: (level: AdLevel, id: string, status: 'ACTIVE' | 'PAUSED') => {
    if (level === 'campaign') { const c = campaignOf(id); if (c) { c.status = status; c.effective_status = status; } }
    else { const n = level === 'adset' ? adsetOf(id) : ADS.find((a) => a.id === id); if (n) n.status = status; }
    return wait({ ok: true });
  },
  adBudget: (level: AdLevel, id: string, minor: number, kind: 'daily' | 'lifetime') => {
    if (level === 'campaign') {
      const c = campaignOf(id);
      if (c) { c.daily_budget_minor = kind === 'daily' ? minor : null; c.lifetime_budget_minor = kind === 'lifetime' ? minor : null; }
    } else {
      const s = adsetOf(id);
      if (s) s.budget = { kind, amount_minor: minor, at: 'adset' };
    }
    return wait({ ok: true });
  },
  adEnd: (_level: AdLevel, _id: string, _end: string | null) => wait({ ok: true }),
  adRename: (level: AdLevel, id: string, name: string) => {
    if (level === 'campaign') { const c = campaignOf(id); if (c) c.name = name; }
    else { const n = level === 'adset' ? adsetOf(id) : ADS.find((a) => a.id === id); if (n) n.name = name; }
    return wait({ ok: true });
  },
  adDuplicate: (level: AdLevel, id: string, _deep: boolean) => {
    const name = `${rowFor(level, id, 1).name} (copy)`;
    if (level === 'campaign') {
      const c = campaignOf(id);
      if (c) CAMPAIGNS.push({ ...c, id: `${c.id}9`, name, status: 'PAUSED', effective_status: 'PAUSED', perDay: 0, created_by_growcord: true });
    } else if (level === 'adset') {
      const s = adsetOf(id);
      if (s) ADSETS.push({ ...s, id: `${s.id}c`, name, status: 'PAUSED' });
    } else {
      const a = ADS.find((x) => x.id === id);
      if (a) ADS.push({ ...a, id: `${a.id}c`, name, status: 'PAUSED', review: undefined, issues: undefined });
    }
    return wait({ name }, 500);
  },
  adBulk: (b: { ids: string[]; level: AdLevel; action: string; value?: number | string | null }) => {
    for (const id of b.ids) {
      if (b.action === 'pause' || b.action === 'resume') adsMock.adStatus(b.level, id, b.action === 'pause' ? 'PAUSED' : 'ACTIVE');
      if (b.action === 'budget_percent') {
        const bud = budgetOf(b.level, id);
        if (bud.amount_minor !== null && bud.at === b.level) adsMock.adBudget(b.level, id, Math.round(bud.amount_minor * (1 + Number(b.value) / 100)), bud.kind === 'lifetime' ? 'lifetime' : 'daily');
      }
    }
    return wait({ done: b.ids.length, failed: [] }, 500);
  },
  adRecommendations: () => wait<AdRecommendation[]>(fresh() ? [] : RECOMMENDATIONS),
  applyRecommendation: (id: string) => {
    if (id === 'rec_3') adsMock.adBudget('campaign', '120210000000001', 195000, 'daily');
    RECOMMENDATIONS = RECOMMENDATIONS.filter((r) => r.id !== id);
    return wait({ ok: true }, 500);
  },
  adRules: () => wait<AdRule[]>(RULES),
  createRule: (r: RuleInput) => { const n: AdRule = { ...r, id: `rule_${RULES.length + 1}`, last_run_at: null, triggered_count: 0 }; RULES = [...RULES, n]; return wait(n, 400); },
  updateRule: (id: string, r: Partial<RuleInput>) => { RULES = RULES.map((x) => (x.id === id ? { ...x, ...r } : x)); return wait(RULES.find((x) => x.id === id)!); },
  deleteRule: (id: string) => { RULES = RULES.filter((x) => x.id !== id); return wait({ ok: true }); },
  adTests: () => wait<AdTest[]>(TESTS),
  createTest: (t: TestInput) => {
    const n: AdTest = { id: `test_${TESTS.length + 1}`, name: t.name, status: 'scheduled', kind: t.kind, metric: t.metric, start: t.start, end: t.end,
      cells: t.cells.map((c, i) => ({ id: `cell_n${i}`, name: c.name, object_ids: c.object_ids, metrics: null })), winner_cell_id: null, confidence: null };
    TESTS = [n, ...TESTS];
    return wait(n, 500);
  },

  adsOptions: () => wait<AdsOptions>(ADS_OPTIONS as AdsOptions),
  createAdsDraft: (input: AdsDraftInput) => {
    const d: AdsDraft = { ...input, id: `adsdraft_${ADS_DRAFTS.length + 1}`, status: 'draft', created_at: new Date().toISOString() };
    const fake: AdRow = { ...rowFor('ad', 'ad_1011', 1), name: input.name };
    const pics = input.creative.media.map((id) => LIBRARY.find((l) => l.id === id)).filter(Boolean) as LibraryItem[];
    const placements = input.adset.placements === 'auto' ? ['facebook_feed', 'instagram_feed', 'instagram_stories', 'instagram_reels'] : input.adset.placements.slice(0, 4);
    d.previews = placements.map((p) => {
      const label = ADS_OPTIONS.placements.find((x) => x.key === p)?.label ?? p;
      const base = previewFor(fake, p, label);
      const img = pics[0]?.url ?? pics[0]?.thumbnail_url;
      const html = (base.html ?? '')
        .replace(/<p style="font-size:13px;line-height:1.4;margin:8px 0">[^<]*<\/p>/, `<p style="font-size:13px;line-height:1.4;margin:8px 0">${input.creative.texts.primary[0] ?? ''}</p>`)
        .replace(/<img src="[^"]*"/, img ? `<img src="${img}"` : '$&')
        .replace('Shop now', ADS_OPTIONS.call_to_actions.find((c) => c.key === input.creative.call_to_action)?.label ?? 'Learn more');
      return { ...base, html };
    });
    d.warnings = /stress|pain|arthritis|diabet|anxiety/i.test(input.creative.texts.primary.join(' '))
      ? [{ code: 'health_words', text: 'A text may suggest the reader has a health condition; Meta often rejects that. Describe the product instead.' }] : [];
    ADS_DRAFTS = [...ADS_DRAFTS, d];
    return wait(d, 700);
  },
  adsDraft: (id: string) => wait<AdsDraft>(ADS_DRAFTS.find((d) => d.id === id) ?? { id }, 400),
  applyAdsDraft: (id: string) => {
    const d = ADS_DRAFTS.find((x) => x.id === id);
    const newId = `1202100000000${40 + ADS_DRAFTS.length}`;
    if (d?.campaign) {
      CAMPAIGNS.unshift({
        id: newId, name: d.name || 'New campaign', objective: `OUTCOME_${(d.campaign.objective || 'sales').toUpperCase()}`, status: 'PAUSED', effective_status: 'PAUSED',
        daily_budget_minor: d.campaign.budget?.kind === 'daily' ? d.campaign.budget.amount_minor : d.adset?.budget?.kind === 'daily' ? d.adset.budget.amount_minor : null,
        lifetime_budget_minor: d.campaign.budget?.kind === 'lifetime' ? d.campaign.budget.amount_minor : null, created_by_growcord: true, perDay: 0, roasBase: null, ctrBase: 0,
      });
    }
    return wait<ApplyResult>(appliedReply(id, d?.name ?? null, newId), 900);
  },
  discardAdsDraft: (id: string) => { ADS_DRAFTS = ADS_DRAFTS.filter((d) => d.id !== id); return wait({ ok: true }); },
  targetingSearch: (type: TargetingType, q: string) => {
    const t = q.trim().toLowerCase();
    const has = (s: string) => !t || s.toLowerCase().includes(t);
    let hits: TargetingHit[] = [];
    if (type === 'interests') hits = T_INTERESTS.filter(has).map((n, i) => ({ id: `int_${n.replace(/\W+/g, '').toLowerCase()}`, name: n, type, path: ['Interests', i % 2 ? 'Health and wellness' : 'Fitness and wellness'], size_low: 2_000_000 + ((n.length * 7919) % 90) * 1_000_000, size_high: 3_000_000 + ((n.length * 7919) % 90) * 1_100_000 }));
    if (type === 'behaviors') hits = T_BEHAVIOURS.filter(has).map((n) => ({ id: `beh_${n.replace(/\W+/g, '').toLowerCase()}`, name: n, type, path: ['Behaviours', 'Purchase behaviour'], size_low: 14_000_000, size_high: 16_500_000 }));
    if (type === 'locations') hits = T_PLACES.filter((p) => has(p.name)).map((p) => ({ id: p.id, name: p.name, type, kind: p.kind, path: p.path, country_code: p.cc }));
    if (type === 'languages') hits = T_LANGUAGES.filter(has).map((n, i) => ({ id: `lang_${i + 1}`, name: n, type }));
    return wait(hits.slice(0, 12), 180);
  },
  metaAudiences: () => wait<MetaAudience[]>(fresh() ? [] : AUDIENCES),
  createAudience: (a: { type: AudienceType; name: string; spec: Record<string, unknown>; description?: string | null; confirm?: boolean }) => {
    // META-9B refuses a name that names a health condition of the catalogue until the person confirms (422).
    if (!a.confirm && /hair fall|diabetes|piles|arthritis|asthma|insomnia/i.test(a.name)) {
      return new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('health'), { response: { status: 422, data: { code: 'marketing.unprocessable', message: `This audience names ${a.name.match(/hair fall|diabetes|piles|arthritis|asthma|insomnia/i)?.[0]}, a health condition of the store's catalogue. Since 2 September 2025 Meta flags audiences that suggest health conditions and refuses ads that use them.`, details: { reason: 'health_condition', health_words: [a.name.match(/hair fall|diabetes|piles|arthritis|asthma|insomnia/i)?.[0]], go_ahead: { confirm: true } } } } })), 300));
    }
    const n: MetaAudience = { id: `aud_n${AUDIENCES.length + 1}`, type: a.type, name: a.name, spec: a.spec, size_low: null, size_high: null, status: 'populating', note: 'Meta is building it; this takes up to a day.', created_at: new Date().toISOString() };
    AUDIENCES = [n, ...AUDIENCES];
    return wait(n, 500);
  },
  deleteAudience: (id: string) => { AUDIENCES = AUDIENCES.filter((a) => a.id !== id); return wait({ ok: true }); },
  library: (type?: 'image' | 'video') => wait<LibraryItem[]>(fresh() ? [] : LIBRARY.filter((l) => !type || l.type === type)),
  addToLibrary: (ids: string[]) => {
    const added = ids.map((g, i) => ({ id: `lib_n${LIBRARY.length + i + 1}`, type: /\.(mp4|mov|webm)$/i.test(g) ? 'video' : 'image', name: g.split('/').pop() ?? g, url: art(g.split('/').pop() ?? 'New', HUES[i % HUES.length]), thumbnail_url: null, status: 'uploading', used_in: 0, created_at: new Date().toISOString(), gallery_id: g } as LibraryItem));
    LIBRARY = [...added, ...LIBRARY];
    setTimeout(() => { LIBRARY = LIBRARY.map((l) => (l.status === 'uploading' ? { ...l, status: 'ready', width: 1080, height: 1080 } : l)); }, 4000);
    return wait(added, 500);
  },
  deleteFromLibrary: (id: string) => { LIBRARY = LIBRARY.filter((l) => l.id !== id); return wait({ ok: true }); },
  insights: (q: InsightsQuery) => wait<Insights>(insightsFor(q), 300),
  exportInsights: async (q: InsightsQuery) => {
    const d = insightsFor(q);
    const { toCsv } = await import('@/lib/csv');
    const rupees = (m: number) => (m / 100).toFixed(2);
    const csv = toCsv<Insights['rows'][number]>([
      { key: 'label', label: q.breakdown && q.breakdown !== 'none' ? q.breakdown : 'Campaign' },
      { key: 'spend', label: 'Spend (INR)', format: (r) => rupees(r.spend_minor) },
      { key: 'impressions', label: 'Impressions' }, { key: 'clicks', label: 'Clicks' }, { key: 'ctr', label: 'CTR (%)' },
      { key: 'purchases', label: 'Purchases' }, { key: 'value', label: 'Purchase value (INR)', format: (r) => rupees(r.purchase_value_minor) }, { key: 'roas', label: 'ROAS' },
    ], d.rows);
    return wait(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 300);
  },
  syncInsights: (b: { from?: string; to?: string }) => {
    SYNCED_AT = new Date().toISOString();
    return wait<InsightsSyncResult>({ status: 'done', from: b.from ?? daysAgo(29, 0).slice(0, 10), to: b.to ?? new Date().toISOString().slice(0, 10),
      levels: { 'days:campaign': { status: 'ok', rows: 240 }, 'days:adset': { status: 'ok', rows: 300 }, 'days:ad': { status: 'ok', rows: 450 } }, note: null }, 900);
  },
  insightsSettings: () => wait<InsightsSettings>(insightSettings()),
  saveInsightsSettings: (patch: Partial<InsightsSettings['settings']>) => { INSIGHT_STORED = mergeDeep(INSIGHT_STORED, patch); return wait<InsightsSettings>(insightSettings(), 400); },
  alerts: () => wait<MetaAlert[]>(fresh() ? [] : [
    { level: 'campaign', id: '120210000000005', name: 'Hair care: Arnica shampoo', detail: { roas: '0.80', target: '1.5', days: 7 }, kind: 'roas_below', text: 'Hair care: Arnica shampoo returned 0.80x over the last 7 days, below your 1.50x target.', since: daysAgo(3) },
    { level: 'campaign', id: '120210000000003', name: 'Bach flower remedies: Reels', detail: { roas: '0.60', target: '1.5', days: 7 }, kind: 'roas_below', text: 'Bach flower remedies: Reels returned 0.60x over the last 7 days, below your 1.50x target.', since: daysAgo(5) },
    { level: 'ad', id: 'ad_4012', name: 'Single image: Kali Phos 6X', detail: {}, kind: 'rejected', text: 'Meta rejected the ad "Single image: Kali Phos 6X". Rewrite the text and ask for a review.', since: daysAgo(1) },
    { level: 'ad', id: 'ad_3012', name: 'Reel: exam season', detail: { frequency: '4.6', max: '4' }, kind: 'frequency', text: '"Reel: exam season" is shown 4.6 times per person this week; people are tiring of it.', since: daysAgo(2) },
  ]),
};

/* The mock API (same method names as metaApi) */
export const metaMock = {
  ...adsMock,
  ...socialMock,
  ...assistantMock, // META-17
  ...canvasMock, // META-19
  setup: () => wait<MetaSetup>(fresh() ? { connection: null, items: SETUP.items.map((i) => ({ ...i, state: 'todo', picked: null, needs: ['pick'] })) } : SETUP),
  provider: () => wait<MetaProviderDef | null>({
    key: 'meta', label: 'Meta (Facebook and Instagram)',
    services: [
      { key: 'merchant_feed', label: 'Catalog' }, { key: 'ads', label: 'Ads' }, { key: 'analytics', label: 'Insights' }, { key: 'pages', label: 'Pages' },
      { key: 'instagram', label: 'Instagram' }, { key: 'lead_ads', label: 'Lead ads' }, { key: 'pixel', label: 'Pixel' },
    ],
  }),
  resources: (service: string) => wait<PickableResource[]>(RESOURCES[service] ?? [], 300),
  pick: (service: string, r: PickableResource) => {
    SETUP = {
      ...SETUP,
      items: SETUP.items.map((i) => (i.action?.service === service ? { ...i, state: 'done', picked: { id: r.id, name: r.name }, needs: [], action: { kind: 'pick', service, label: 'Change' } } : i)),
    };
    return wait({ ok: true });
  },

  campaigns: (q: { from?: string; to?: string }) => wait<MetaCampaigns>({ synced_at: SYNCED_AT, currency: 'INR', rows: campaignRows(rangeDays(q.from, q.to)) }, 220),
  syncCampaigns: () => { SYNCED_AT = new Date().toISOString(); return wait({ ok: true }, 600); },
  setCampaignStatus: (id: string, status: 'ACTIVE' | 'PAUSED') => {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) { c.status = status; c.effective_status = status; }
    return wait({ ok: true });
  },
  setCampaignBudget: (id: string, minor: number) => {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.daily_budget_minor = minor;
    return wait({ ok: true });
  },

  remarketingOptions: () => wait<RemarketingOptions>(OPTIONS),
  createDraft: (input: DraftInput) => {
    const d: RemarketingDraft = { ...input, id: `draft_${DRAFTS.length + 1}`, status: 'draft', created_at: new Date().toISOString() };
    d.previews = (['facebook_feed', 'instagram_feed', 'instagram_story'] as const).map((p) => ({
      placement: p, label: p === 'facebook_feed' ? 'Facebook Feed' : p === 'instagram_feed' ? 'Instagram Feed' : 'Instagram Stories', html: previewHtml(d, p),
    }));
    DRAFTS = [...DRAFTS, d];
    return wait(d, 700);
  },
  draft: (id: string) => wait<RemarketingDraft>(DRAFTS.find((d) => d.id === id) ?? { id }, 400),
  applyDraft: (id: string) => {
    const d = DRAFTS.find((x) => x.id === id);
    const newId = `1202100000000${10 + DRAFTS.length}`;
    if (d) {
      CAMPAIGNS.unshift({
        id: newId, name: d.name || 'Dynamic remarketing', objective: 'OUTCOME_SALES', status: 'PAUSED', effective_status: 'PAUSED',
        daily_budget_minor: d.daily_budget_minor ?? null, lifetime_budget_minor: null, created_by_growcord: true, perDay: 0, roasBase: null, ctrBase: 0,
      });
    }
    return wait<ApplyResult>(appliedReply(id, d?.name ?? null, newId), 900);
  },
  discardDraft: (id: string) => { DRAFTS = DRAFTS.filter((d) => d.id !== id); return wait({ ok: true }); },

  igPosts: (limit: number) => wait<IgPost[]>(fresh() ? [] : POSTS.slice(0, limit), 250),
  igRefresh: () => wait({ ok: true }, 700),
  igSaveTags: (mediaId: string, tags: IgTag[], push: boolean) => {
    POSTS = POSTS.map((p) => (p.id === mediaId ? { ...p, tags: tags.map((t) => ({ ...t, push_to_instagram: push, tagged_on_instagram: push, push_error: null })) } : p));
    return wait({ ok: true });
  },
  igShopping: () => wait<IgShopping>({
    can_tag_on_instagram: false, catalog_linked: true,
    reason: 'Instagram Shopping is not approved for @homeomed.in yet. Meta reviews the account once the catalog is approved.',
  }),
  igFeedSettings: () => wait<IgFeedSettings>(FEED),
  saveIgFeedSettings: (s: IgFeedSettings) => { FEED = { ...FEED, ...s }; return wait({ ok: true }); },
  searchProducts: (q: string) => {
    const t = q.trim().toLowerCase();
    const seen = new Set<string>();
    const hits: ProductHit[] = [];
    for (const c of catalog()) {
      if (hits.length >= 12) break;
      if (!c.title.toLowerCase().includes(t) || seen.has(c.retailer_id)) continue;
      seen.add(c.retailer_id);
      hits.push({ product_id: c.product_id, variation_id: c.variation_id, name: c.title, sku: c.retailer_id, image: c.image });
    }
    return wait(hits, 200);
  },

  channels: () => wait<StoreChannel[]>(fresh() ? CHANNELS.filter((c) => c.platform_code === 'google_shopping') : CHANNELS),
  platform: (code: string) => wait<ChannelPlatform | null>(code === 'facebook_catalog' ? { code, name: 'Facebook catalog' } : code === 'whatsapp_catalog' ? { code, name: 'WhatsApp catalog' } : null),
  createChannel: (code: string, name: string) => {
    const ch: StoreChannel = { id: `ch_${code}`, platform_code: code, display_name: name, config: {}, is_active: true };
    CHANNELS = [...CHANNELS.filter((c) => c.platform_code !== code), ch];
    return wait(ch);
  },
  saveChannelConfig: (id: string, config: Record<string, any>) => {
    CHANNELS = CHANNELS.map((c) => (c.id === id ? { ...c, config } : c));
    return wait({ ok: true });
  },
  syncChannel: (id: string) => wait<SyncResult | null>(id === 'ch_fb' ? { ok: 2341, total: 2379, error: 38 } : { ok: 2341, total: 2341, error: 0 }, 900),
  catalogSummary: () => {
    const fb = CHANNELS.find((c) => c.platform_code === 'facebook_catalog');
    return wait<CatalogSummary>({
      mode: fb?.config?.connect_method || 'api',
      realtime: fb?.config?.realtime !== false,
      catalog: { id: '889900112233', name: 'Homeomed catalog' },
      counts: { total: catalog().length, synced: count('synced'), pending: count('pending'), warnings: count('warning'), errors: count('error'), excluded: count('excluded') },
      last_push_at: minutesAgo(4),
      last_full_at: daysAgo(0, 7),
      last_error: null,
      label_sources: [
        { key: 'brand', label: 'Brand' }, { key: 'category', label: 'Main category' }, { key: 'margin_band', label: 'Margin band' },
        { key: 'price_band', label: 'Price band' }, { key: 'bestseller', label: 'Bestseller (last 30 days)' }, { key: 'potency', label: 'Potency' },
        { key: 'form', label: 'Form' }, { key: 'new_arrival', label: 'New arrival' },
      ],
      // The seeded fallbacks of `domain/channels/catalog.rs` (META-1), answered as data (CAT-12 CONTRACT QUESTION).
      config_defaults: {
        batch_size: 3000, batch_max: 5000, auto_map: true, margin_bands: [20, 40], stock_bands: [0, 10],
        attribute_fields: { size: ['packagename', 'size', 'volume', 'pack'], color: ['color', 'colour'], material: ['material'], pattern: ['pattern'] },
        feed_fallback: true, feed_fallback_hours: 24, feed_fallback_interval: 'HOURLY', diagnostics: true,
        localized: { countries: true, languages: [], content_mode: 'claim_free' },
      },
      variant_fields: ['size', 'color', 'material', 'pattern', 'gender', 'age_group'],
      attributes: [
        { key: 'packagename', label: 'Pack' }, { key: 'potency', label: 'Potency' }, { key: 'volume', label: 'Volume' }, { key: 'size', label: 'Size' },
        { key: 'form', label: 'Form' }, { key: 'color', label: 'Colour' }, { key: 'flavour', label: 'Flavour' }, { key: 'gender', label: 'For' },
      ],
    });
  },
  catalogItems: (q: { status?: string; q?: string; page?: number }) => {
    const term = (q.q ?? '').trim().toLowerCase();
    const rows = catalog().filter((c) => (!q.status || c.status === q.status) && (!term || c.title.toLowerCase().includes(term) || c.retailer_id.toLowerCase().includes(term)));
    const size = 25;
    const page = Math.max(1, q.page ?? 1);
    return wait<CatalogPage>({ rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pages: Math.ceil(rows.length / size) }, 180);
  },
  productSets: () => wait<ProductSet[]>(SETS),
  createProductSet: (name: string, filter: ProductSetFilter) => {
    const s: ProductSet = { id: `ps_${SETS.length + 1}`, name, filter, product_count: 96 + SETS.length * 31 };
    SETS = [...SETS, s];
    return wait(s, 400);
  },
  categories: () => wait<StoreCategory[]>(CATEGORIES),

  waCatalogStatus: () => wait<WaCatalogStatus>({ catalog_id: '889900112233', linked: true, catalog_visible: true, cart_enabled: false }),
  waCatalogConnect: (b: { catalog_id: string; catalog_visible: boolean; cart_enabled: boolean }) => wait<WaCatalogStatus>({ catalog_id: b.catalog_id, linked: true, catalog_visible: b.catalog_visible, cart_enabled: b.cart_enabled }, 500),
  linkWhatsApp: () => wait<WaLinkResult>({
    numbers: [
      { waba_id: '104455667788990', phone_number_id: '209988776655443', display_phone_number: '+91 98765 43210', outcome: 'updated', reason: null },
      { waba_id: '104455667788990', phone_number_id: '209988776655444', display_phone_number: '+91 98765 43211', outcome: 'skipped', reason: 'This number belongs to another store on Growcord.' },
    ],
    notes: [],
  }, 600),
};

export type MetaMock = typeof metaMock;
