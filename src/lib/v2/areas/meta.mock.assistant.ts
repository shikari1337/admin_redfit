/**
 * DEVELOPMENT ONLY sample data for lane META-17 (`?mock=meta` on a dev server; imported only by `meta.mock.ts`, which
 * a production build never bundles): the Ads Manager's assistant over Meta's ads MCP server. `?mockvariant=fresh`
 * shows it switched off. Answers are canned from the sample Homeomed ad account (the same campaign ids and creative
 * library ids as `meta.mock.ts`); a question that asks for a change or a new ad gets one proposal. State changes live
 * in memory until reload.
 */
import type {
  AssistantAnswer, AssistantLimits, AssistantProposal, AssistantSettings, AssistantStatus, AssistantTool, AssistantTools, AssistantTurn,
} from './meta';

const fresh = (): boolean => {
  try { return new URLSearchParams(window.location.search).get('mockvariant') === 'fresh'; } catch { return false; }
};
const wait = <T,>(v: T, ms = 220): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

const NOT_VERIFIED = 'Not verified with a real Meta token yet (MCP-01): Meta may refuse the store connection\'s token.';
const OFF_NOTE = 'The ads assistant is off for this store. When a person turns it on, it reads the ad account through Meta\'s ads MCP server with read only tools and turns any change you ask for into a paused draft that you preview and apply. Not verified yet: it waits for the first run with a real token (MCP-01).';

const READ_TOOLS = [
  'ads_get_ad_entities', 'ads_get_opportunity_score', 'ads_insights_advertiser_context', 'ads_insights_anomaly_signal',
  'ads_insights_auction_ranking_benchmarks', 'ads_insights_industry_benchmark', 'ads_insights_performance_trend',
  'ads_get_ad_account_pages', 'ads_get_field_context', 'ads_get_creatives', 'ads_get_creative_ads', 'ads_get_ad_images',
  'ads_get_ad_videos', 'ads_get_ad_preview', 'ads_library_search', 'ads_get_ig_accounts', 'ads_get_ig_media',
  'ads_get_ad_account_custom_audiences', 'ads_get_custom_audience', 'ads_get_custom_audience_adsets', 'ads_catalog_list_catalogs',
  'ads_catalog_list_dpa_eligible_catalogs', 'ads_catalog_get_diagnostics', 'ads_catalog_get_dynamic_ads_health',
  'ads_catalog_get_data_sources', 'ads_catalog_list_products', 'ads_catalog_get_suggested_filter', 'ads_catalog_list_product_sets',
  'ads_catalog_list_product_feeds', 'ads_catalog_get_product_feed_upload_sessions', 'ads_catalog_get_feed_rules',
  'ads_catalog_event_source_get', 'ads_catalog_event_source_get_catalogs', 'ads_catalog_event_source_get_health',
  'ads_catalog_event_source_get_recommendations', 'ads_get_datasets', 'ads_get_dataset_details', 'ads_get_dataset_stats',
  'ads_get_dataset_quality', 'ads_pixel_event_read', 'ads_pixel_parameter_read', 'ads_get_customconversions', 'ads_get_errors',
  'ads_get_help_article', 'ads_experiment_list_tests', 'ads_experiment_check_eligibility', 'ads_experiment_abtest_get_test',
  'ads_experiment_lift_get_test', 'ads_account_get_activity_logs',
];
const LIMITS: AssistantLimits = {
  max_rounds: 3, max_tool_calls: 6, max_tool_result_chars: 8000, max_tool_output_chars: 24000, max_message_chars: 2000,
  max_history_turns: 8, max_proposals: 3, max_tool_pages: 5, timeout_seconds: 60,
};
const DEFAULTS: AssistantSettings = { enabled: false, read_tools: READ_TOOLS, limits: LIMITS };

let STORED: Partial<AssistantSettings> = {};
let STATE_LOADED = false;
let PROPOSALS: AssistantProposal[] = [];

function load(): void {
  if (STATE_LOADED) return;
  STATE_LOADED = true;
  if (fresh()) return;
  STORED = { enabled: true };
  PROPOSALS = [{
    id: 'prop_1', saved: true, status: 'drafted', title: 'Winter immunity: Arsenicum Album 30C, sales',
    summary: 'A sales campaign for Arsenicum Album 30C to people in India aged 30 to 60, at 600 rupees a day, with the Winter kit image. It starts paused.',
    rationale: 'Winter immunity: Arsenicum Alb ran as a traffic campaign and brought 41 purchases from link clicks in 30 days; a sales objective optimises for those purchases.',
    kind: 'sales', budget: { kind: 'daily', amount_minor: 60000 },
    draft: {
      kind: 'sales', name: 'Winter immunity: Arsenicum Album 30C, sales', campaign: { objective: 'sales', budget: { kind: 'daily', amount_minor: 60000 } },
      adset: { destination: 'website', targeting: { countries: ['IN'], age_min: 30, age_max: 60 }, placements: 'auto' },
      creative: { format: 'image', media: ['lib_i2'], texts: { primary: ['Stay ready for winter with Arsenicum Album 30C, made by trusted homeopathic brands.'], headlines: ['Winter immunity kit'], descriptions: [] }, call_to_action: 'SHOP_NOW' },
    },
    draft_id: 'adsdraft_seed', draft_status: 'draft', question: 'Make a sales version of the winter campaign',
    sources: ['ads_get_ad_entities', 'ads_insights_performance_trend'], model: 'gemini-2.5-flash', created_at: minutesAgo(60 * 26), decided_at: minutesAgo(60 * 25),
  }];
}

const settings = (): AssistantSettings => ({
  enabled: STORED.enabled ?? DEFAULTS.enabled,
  read_tools: STORED.read_tools ?? DEFAULTS.read_tools,
  limits: { ...DEFAULTS.limits, ...(STORED.limits ?? {}) },
});

const status = (): AssistantStatus => {
  load();
  const s = settings();
  return {
    state: s.enabled ? 'on' : 'off', note: s.enabled ? null : OFF_NOTE, verified: false, not_verified: NOT_VERIFIED, off_note: OFF_NOTE,
    account: { id: '1234567890123', name: 'Homeomed India' }, settings: s, defaults: DEFAULTS, stored: STORED,
    proposals: PROPOSALS, can_manage: true,
  };
};

const TOOL_LIST: AssistantTool[] = [
  ...READ_TOOLS.map((name) => ({
    name, title: null, description: `Meta's ${name.replace(/^ads_/, '').replace(/_/g, ' ')} tool.`, read_only_hint: true as boolean | null,
    writes: false, allowed: true, offered: true,
  })),
  ...['ads_create_campaign', 'ads_create_ad_set', 'ads_create_ad', 'ads_update_entity', 'ads_activate_entity', 'ads_boost_ig_post'].map((name) => ({
    name, title: null, description: `Meta's ${name.replace(/^ads_/, '').replace(/_/g, ' ')} tool (changes the ad account).`, read_only_hint: false as boolean | null,
    writes: true, allowed: false, offered: false,
  })),
];

const SOURCES_EXPLAIN = [
  { tool: 'ads_get_ad_entities', title: 'Campaigns with results', ok: true, args: '{"ad_account_id":"act_1234567890123","level":"campaign","date_preset":"last_30d"}', excerpt: '8 campaigns; 6 running. Spend 1,52,340.00 INR; purchases 412; purchase value 5,08,900.00 INR...' },
  { tool: 'ads_get_opportunity_score', title: 'Opportunity score', ok: true, args: '{"ad_account_id":"act_1234567890123"}', excerpt: 'Score 64 of 100. Recommendations: consolidate ad sets with small audiences; add Reels placements to 2 campaigns...' },
  { tool: 'ads_insights_anomaly_signal', title: 'Anomalies', ok: true, args: '{"ad_account_id":"act_1234567890123","level":"campaign"}', excerpt: 'Cost per purchase of Hair care: Arnica shampoo rose 58% in the last 3 days against its 14 day baseline.' },
];

const PROPOSAL_DRAFT = {
  kind: 'sales', name: 'Bach flower remedies: Rescue Remedy reel, sales',
  campaign: { objective: 'sales', budget: { kind: 'daily', amount_minor: 75000 } },
  adset: { destination: 'website', targeting: { countries: ['IN'], age_min: 25, age_max: 55 }, placements: 'auto' },
  creative: {
    format: 'video', media: ['lib_v1'],
    texts: { primary: ['Rescue Remedy, the Bach flower blend people keep in their travel bag. Shop the original from Homeomed.'], headlines: ['Rescue Remedy for travel'], descriptions: ['Original Bach flower remedy'] },
    call_to_action: 'SHOP_NOW',
  },
};

const asksChange = (q: string) => /\b(propose|create|make|new ad|launch|start|draft|set up)\b/i.test(q);

export const assistantMock = {
  assistantStatus: () => wait<AssistantStatus>(status()),
  saveAssistantSettings: (patch: { enabled?: boolean; read_tools?: string[]; limits?: Partial<AssistantLimits> }) => {
    load();
    STORED = {
      ...STORED,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.read_tools ? { read_tools: patch.read_tools } : {}),
      ...(patch.limits ? { limits: { ...DEFAULTS.limits, ...(STORED.limits ?? {}), ...patch.limits } } : {}),
    };
    return wait<AssistantStatus>(status(), 350);
  },
  assistantTools: () => {
    load();
    const allowed = settings().read_tools;
    return wait<AssistantTools>({
      state: 'ready', note: NOT_VERIFIED,
      tools: TOOL_LIST.map((t) => ({ ...t, allowed: allowed.includes(t.name), offered: !t.writes && allowed.includes(t.name) })),
    }, 900);
  },
  assistantAsk: (message: string, history: AssistantTurn[]) => {
    load();
    const s = settings();
    const base = { verified: false, not_verified: NOT_VERIFIED, provider: 'gemini', model: 'gemini-2.5-flash', tools_offered: s.read_tools.length } as const;
    if (!s.enabled) {
      return wait<AssistantAnswer>({ ...base, state: 'off', note: OFF_NOTE, reply: '', sources: [], links: [], proposals: [], dropped: [], tools_used: [], rounds: 0, provider: null, model: null }, 300);
    }
    if (/refused/i.test(message)) {
      return wait<AssistantAnswer>({
        ...base, state: 'refused', reply: '', sources: [], links: [], proposals: [], dropped: [], tools_used: [], rounds: 0, provider: null, model: null,
        note: 'Meta\'s ads MCP server refused the store\'s Meta token. The token must hold the ads_mcp_management permission with ads_read or ads_management, and a system user token must be of the Employee role (Meta refuses Admin role system user tokens). Reconnect Meta with that permission, or leave the assistant off.',
      }, 600);
    }
    if (asksChange(message)) {
      const p: AssistantProposal = {
        id: `prop_${PROPOSALS.length + 2}`, saved: true, status: 'proposed', title: PROPOSAL_DRAFT.name,
        summary: 'A new sales campaign with the Rescue Remedy travel reel, for people in India aged 25 to 55, at 750 rupees a day across Facebook and Instagram. It starts paused.',
        rationale: 'Bach flower remedies: Reels returned 0.60 times its spend over 7 days with a broad audience; the travel reel had the best hook rate of your videos, and a sales objective with a purchase goal should cost less per order.',
        kind: 'sales', budget: { kind: 'daily', amount_minor: 75000 }, draft: PROPOSAL_DRAFT, draft_id: null, draft_status: null,
        question: message.slice(0, 2000), sources: ['ads_get_ad_entities', 'ads_get_ad_videos'], model: base.model, created_at: new Date().toISOString(), decided_at: null,
      };
      PROPOSALS = [p, ...PROPOSALS];
      return wait<AssistantAnswer>({
        ...base, state: 'ready', note: null, rounds: 2, tools_used: ['ads_get_ad_entities', 'ads_get_ad_videos'],
        reply: 'I drafted one new sales campaign around the Rescue Remedy travel reel. Bach flower remedies: Reels spent 5,600 rupees in the last 7 days and brought back 3,360 rupees in sales, so I kept the budget at 750 rupees a day and aimed it at purchases. Preview it, then apply it: it is created paused and spends nothing until you resume it.',
        sources: [
          SOURCES_EXPLAIN[0],
          { tool: 'ads_get_ad_videos', title: 'Ad videos', ok: true, args: '{"ad_account_id":"act_1234567890123"}', excerpt: '4 videos; Rescue Remedy travel reel (18 s) ready; Hair care routine processing...' },
        ],
        links: [{ level: 'campaign', id: '120210000000003', name: 'Bach flower remedies: Reels' }],
        proposals: [p],
        dropped: [],
      }, 1400);
    }
    const followUp = history.length > 0 ? ' Since your last question nothing else changed in the account.' : '';
    return wait<AssistantAnswer>({
      ...base, state: 'ready', note: null, rounds: 2, tools_used: SOURCES_EXPLAIN.map((x) => x.tool),
      reply: `In the last 30 days the account spent 1,52,340 rupees and brought 412 purchases worth 5,08,900 rupees, about 3.3 times the spend. Advantage+ shopping: Mother tinctures earns the most. Two campaigns lose money: Hair care: Arnica shampoo (cost per purchase up 58% in 3 days) and Bach flower remedies: Reels (0.6 times its spend this week). Meta scores the account 64 of 100 and suggests merging small ad sets and adding Reels placements.${followUp}`,
      sources: SOURCES_EXPLAIN,
      links: [
        { level: 'campaign', id: '120210000000002', name: 'Advantage+ shopping: Mother tinctures' },
        { level: 'campaign', id: '120210000000005', name: 'Hair care: Arnica shampoo' },
        { level: 'campaign', id: '120210000000003', name: 'Bach flower remedies: Reels' },
      ],
      proposals: [],
      dropped: [],
    }, 1400);
  },
  assistantDrafted: (id: string, draftId: string) => {
    load();
    PROPOSALS = PROPOSALS.map((p) => (p.id === id ? { ...p, status: 'drafted', draft_id: draftId, draft_status: 'draft', decided_at: new Date().toISOString() } : p));
    return wait<AssistantProposal>(PROPOSALS.find((p) => p.id === id) ?? PROPOSALS[0], 250);
  },
  assistantDismiss: (id: string) => {
    load();
    PROPOSALS = PROPOSALS.map((p) => (p.id === id ? { ...p, status: 'dismissed', decided_at: new Date().toISOString() } : p));
    return wait<AssistantProposal>(PROPOSALS.find((p) => p.id === id) ?? PROPOSALS[0], 250);
  },
};
