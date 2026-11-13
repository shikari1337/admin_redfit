/**
 * B2B and the partner trade desk (trade ROUTE_MAP `routes/b2b.ts`, `consignment.ts`, `distributorRoyalty.ts`): applications, settings and tiers, slabs, accounts, contracts, price lists with rules and MOQ rules; consignment partners and dispatches; the distributor network and royalty invoices. Rates travel as milli-percent (18000 = 18 %), amounts as Money.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route, V2Ctx } from '../routes';
import { v2http, mapList } from '../http';
import { isMoney, majorToMinor } from '../money';
import { shapeReply, shapeBody } from '../shape';
import type { Spec } from '../shape';

/* ── the admin trade screens (pages/panels/Consignment.tsx, DistributorNetwork.tsx) ─────────────────────────────── */

/**
 * The franchise and royalty screens read paise under the old `x_minor` names (`dispatch_value_minor`,
 * `net_due_minor`, `total_minor` …) and divide by 100 themselves; v2 names the Money `x` (trade
 * views/consignment.rs:97-470, views/network.rs:92-175: `dispatch_value: Money = minor("dispatch_value_minor")`)
 * and the normaliser has made it rupees, so every figure showed "—". Each listed `x` ALSO as `x_minor`
 * (integer paise), at any depth; nothing is renamed away.
 */
const TRADE_MONEY = new Set([
  'dispatch_value', 'dispatch_cost', 'unsettled_gross', 'unit_price', 'unit_cost', 'gross', 'line_total',
  'partner_margin', 'taxable', 'tax', 'invoice_total', 'net_due', 'cogs', 'total', 'sold_gross', 'settled_net',
  'value_at_price', 'value_at_cost', 'deemed_gross', 'deemed_invoice_total', 'deemed_cogs',
  'base_amount', 'royalty', 'marketing_fund',
]);
function minorTwins(v: any): any {
  if (Array.isArray(v)) return v.map(minorTwins);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, any> = {};
  for (const [k, x] of Object.entries(v)) out[k] = minorTwins(x);
  for (const k of Object.keys(v)) {
    const twin = `${k}_minor`;
    if (TRADE_MONEY.has(k) && typeof out[k] === 'number' && out[twin] === undefined) out[twin] = majorToMinor(out[k]);
  }
  return out;
}
const tradeMinor = (d: any) => (Array.isArray(d) ? mapList(d, minorTwins) : minorTwins(d));

/**
 * PartnerView nests the portal link (`portal_link {live, prefix, issued_at, revoked_at, expires_at,
 * last_seen_at}`, trade views/consignment.rs:19,54); the Partners tab reads the old flat `portal_link_live`,
 * `portal_token_*`, `portal_last_seen_at` (the link always read "not shared").
 */
function partnerRow(p: any): any {
  const l = p?.portal_link;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !l || typeof l !== 'object') return p;
  return {
    ...p,
    portal_link_live: p.portal_link_live ?? l.live,
    portal_token_prefix: p.portal_token_prefix ?? l.prefix,
    portal_token_issued_at: p.portal_token_issued_at ?? l.issued_at,
    portal_token_revoked_at: p.portal_token_revoked_at ?? l.revoked_at,
    portal_token_expires_at: p.portal_token_expires_at ?? l.expires_at,
    portal_last_seen_at: p.portal_last_seen_at ?? l.last_seen_at,
  };
}

/**
 * The royalty preview (RoyaltyPreviewView, trade views/network.rs:160): the paise twins as above (the legacy
 * aliases then give `baseAmountMinor`, `totalMinor` …), plus the camelCase of `gst` — `gst` is an opaque key to
 * the legacy aliaser (services/api.ts OPAQUE_VALUE_KEYS), and the screen reads `gst.taxType` / `gst.rateSource`.
 */
function royaltyPreview(d: any): any {
  const out = minorTwins(d);
  const g = out?.gst;
  if (g && typeof g === 'object' && !Array.isArray(g)) out.gst = { ...g, taxType: g.taxType ?? g.tax_type, rateSource: g.rateSource ?? g.rate_source };
  return out;
}

/* ── the partner portal (pages/partner/PartnerPortal.tsx, outside the admin session) ─────────────────────────────── */

/** The portal's milli-percent leaves (trade views/portal.rs: `RatePctMilli`). */
const PORTAL_PCT = new Set(['margin_pct', 'royalty_pct', 'marketing_fund_pct', 'gst_rate', 'rate']);
const camel = (k: string): string => k.replace(/_([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase());

/**
 * A v2 Owner view → the old portal answer the page reads: every Money `x` ALSO as `x_minor` (a minor-unit string;
 * the page divides by 100 itself), milli-percent → percent, and a camelCase twin of every key (the shelf lines were
 * camelCase: `itemId`, `qtyAtShop`, `unitPriceMinor`). Nothing is renamed away.
 */
function portalLegacy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(portalLegacy);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (isMoney(x)) { out[k] = x; out[`${k}_minor`] = String(x.minor); }
    else out[k] = PORTAL_PCT.has(k) ? shapeReply(x, 'r') : portalLegacy(x);
  }
  for (const k of Object.keys(out)) { const c = camel(k); if (c !== k && !(c in out)) out[c] = out[k]; }
  return out;
}

/** Old portal sub-path → v2 (`/api/v2/trade/portal/*`, trade api/portal.rs:63-118). */
const PORTAL_PATHS: Record<string, string> = { '/summary': '/summary', '/settlements': '/settlements', '/royalty-invoices': '/royalty-invoices', '/report-sales': '/sales-reports' };

/**
 * One partner-portal call on v2, answered as the old page's `{ok, status, body}`. THE LINK IS THE AUTH: the token
 * travels in `X-Portal-Token` (never the path — trade api/portal.rs:5-11); the store is the page's own store key
 * (v2http). A 401 is a dead link, as before. `responseType: 'blob'` answers the bytes (the royalty-bill PDF).
 */
export async function partnerPortalCall(
  token: string, method: 'GET' | 'POST', path: string, payload?: any, responseType?: 'blob',
): Promise<{ ok: boolean; status: number; body: any }> {
  const pdf = /^\/royalty-invoices\/([^/]+)\/pdf$/.exec(path);
  const to = pdf ? `/royalty-invoices/${encodeURIComponent(pdf[1])}/pdf` : (PORTAL_PATHS[path] ?? path);
  // SalesReportIn {lines[{item_id, qty, reference?, sold_on?}]} is closed (trade inputs.rs:1351).
  const data = path === '/report-sales'
    ? { lines: (payload?.lines ?? []).map((l: any) => ({ item_id: l.itemId ?? l.item_id, qty: l.qty, ...(l.reference ? { reference: l.reference } : {}), ...((l.soldOn ?? l.sold_on) ? { sold_on: l.soldOn ?? l.sold_on } : {}) })) }
    : payload;
  try {
    const res = await v2http.request({ method, url: `/api/v2/trade/portal${to}`, data, headers: { 'x-portal-token': token }, responseType: responseType ?? 'json' });
    if (responseType === 'blob') return { ok: true, status: res.status, body: res.data };
    const env = (res.data ?? {}) as { data?: unknown };
    const d = portalLegacy(env.data !== undefined ? env.data : env);
    return { ok: true, status: res.status, body: { success: true, data: d, plain: (d as { plain?: unknown } | null)?.plain } };
  } catch (e: any) {
    const r = e?.response;
    return { ok: false, status: r?.status ?? 0, body: r?.data && !(typeof Blob !== 'undefined' && r.data instanceof Blob) ? r.data : {} };
  }
}

/** B2BTiers.tsx:57 saves `tiers` as a name-keyed map; the settings body takes `[{name, discount_pct}]` (trade api/b2b settings). */
const B2B_SETTINGS_SPEC: Spec = {'default_discount_pct':'r','enabled':'b','price_mode':'s','tiers':[{'discount_pct':'r','name':'s'}]};
const b2bSettingsBody = (c: V2Ctx) => {
  const b = c.body && typeof c.body === 'object' ? { ...c.body } : c.body;
  if (b && b.tiers && typeof b.tiers === 'object' && !Array.isArray(b.tiers)) {
    b.tiers = Object.entries(b.tiers).map(([name, t]: [string, any]) => ({ ...(t && typeof t === 'object' ? t : {}), name }));
  }
  return shapeBody(B2B_SETTINGS_SPEC)({ ...c, body: b });
};

export const TRADE_ROUTES: V2Route[] = [
  { m: 'POST', from: '/b2b/applications/:id/approve', row: 'trade routes/b2b.ts', to: '/api/v2/trade/applications/{id}/approve', bs: {'credit_days':'i','credit_limit':'m','note':'s','tier':'s'} },
  { m: 'POST', from: '/b2b/applications/:id/reject', row: 'trade routes/b2b.ts', to: '/api/v2/trade/applications/{id}/reject', bs: {'note':'s'} },
  { m: 'POST', from: '/b2b/contracts', row: 'trade routes/b2b.ts', to: '/api/v2/trade/contracts', bs: {'customer_id':'s','product_id':'s','unit_price':'m','valid_from':'s','valid_until':'s','variation_id':'s'} },
  { m: 'GET', from: '/b2b/contracts/:customerId', row: 'trade routes/b2b.ts (merged → GET /contracts?customer_id=)', to: '/api/v2/trade/contracts', query: (c) => ({ customer_id: c.params.customerId }) },
  { m: 'DELETE', from: '/b2b/contracts/:id', row: 'trade routes/b2b.ts', to: '/api/v2/trade/contracts/{id}' },
  { m: 'POST', from: '/b2b/customers', row: 'trade routes/b2b.ts', to: '/api/v2/trade/accounts', bs: {'company_name':'s','credit_days':'i','credit_limit':'m','customer_id':'s','dial_code':'s','email':'s','gstin':'s','name':'s','phone':'s','price_list_id':'s','tier':'s'} },
  { m: 'GET', from: '/b2b/customers/:customerId', row: 'trade routes/b2b.ts', to: '/api/v2/trade/accounts/{customerId}' },
  { m: 'PUT', from: '/b2b/customers/:customerId', row: 'trade routes/b2b.ts', method: 'PATCH', to: '/api/v2/trade/accounts/{customerId}', bs: {'b2b_tier':'s','credit_days':'i','credit_limit':'m','gstin':'s','is_b2b':'b','price_list_id':'s'} },
  { m: 'POST', from: '/b2b/price-lists', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists', bs: {'currency':'s','description':'s','is_active':'b','is_default':'b','name':'s','tier_name':'s'} },
  { m: 'PUT', from: '/b2b/price-lists/:id', row: 'trade routes/b2b.ts', method: 'PATCH', to: '/api/v2/trade/price-lists/{id}', bs: {'currency':'s','description':'s','is_active':'b','is_default':'b','name':'s','tier_name':'s'} },
  { m: 'DELETE', from: '/b2b/price-lists/:id', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}' },
  { m: 'GET', from: '/b2b/price-lists/:id/moq', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/moq-rules' },
  { m: 'POST', from: '/b2b/price-lists/:id/moq', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/moq-rules', bs: {'entity_id':'s','increment_qty':'i','is_active':'b','max_qty':'i','min_order_value':'m','min_qty':'i','rule_type':'s'} },
  { m: 'PUT', from: '/b2b/price-lists/:id/moq/:ruleId', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/moq-rules/{ruleId}', bs: {'entity_id':'s','increment_qty':'i','is_active':'b','max_qty':'i','min_order_value':'m','min_qty':'i','rule_type':'s'} },
  { m: 'DELETE', from: '/b2b/price-lists/:id/moq/:ruleId', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/moq-rules/{ruleId}' },
  { m: 'POST', from: '/b2b/price-lists/:id/rules', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/rules', bs: {'discount_slabs':[{'discount_pct':'r','min_qty':'i'}],'entity_id':'s','flat_discount_pct':'r','flat_price':'m','is_active':'b','pricing_slabs':[{'max_qty':'i','min_qty':'i','price':'m'}],'rule_type':'s'}, rs: {'discount_slabs':[{'discount_pct':'r'}],'flat_discount_pct':'r'} },
  { m: 'PUT', from: '/b2b/price-lists/:id/rules/:ruleId', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/rules/{ruleId}', bs: {'discount_slabs':[{'discount_pct':'r','min_qty':'i'}],'entity_id':'s','flat_discount_pct':'r','flat_price':'m','is_active':'b','pricing_slabs':[{'max_qty':'i','min_qty':'i','price':'m'}],'rule_type':'s'}, rs: {'discount_slabs':[{'discount_pct':'r'}],'flat_discount_pct':'r'} },
  { m: 'DELETE', from: '/b2b/price-lists/:id/rules/:ruleId', row: 'trade routes/b2b.ts', to: '/api/v2/trade/price-lists/{id}/rules/{ruleId}' },
  { m: 'PUT', from: '/b2b/settings', row: 'trade routes/b2b.ts', to: '/api/v2/trade/settings', body: b2bSettingsBody, rs: {'default_discount_pct':'r','tiers':[{'discount_pct':'r'}]} },
  { m: 'GET', from: '/b2b/slabs', row: 'trade routes/b2b.ts', to: '/api/v2/trade/slabs', qs: ['product_id'], rs: {'items':[{'rate':'r'}]} },
  { m: 'POST', from: '/b2b/slabs', row: 'trade routes/b2b.ts', to: '/api/v2/trade/slabs', bs: {'max_qty':'i','min_qty':'i','price':'m','price_type':'s','product_id':'s','rate':'r','tier_name':'s','valid_from':'s','valid_until':'s','variation_id':'s'}, rs: {'rate':'r'} },
  { m: 'PUT', from: '/b2b/slabs/:id', row: 'trade routes/b2b.ts', method: 'PATCH', to: '/api/v2/trade/slabs/{id}', bs: {'is_active':'b','max_qty':'i','min_qty':'i','price':'m','price_type':'s','rate':'r','tier_name':'s','valid_from':'s','valid_until':'s','variation_id':'s'}, rs: {'rate':'r'} },
  { m: 'DELETE', from: '/b2b/slabs/:id', row: 'trade routes/b2b.ts', to: '/api/v2/trade/slabs/{id}' },
  { m: 'GET', from: '/consignments', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments', qs: ['limit','offset','partner_id','status'], rs: {'items':[{'margin_pct':'r'}]}, reply: tradeMinor }, // ConsignmentRowView dispatch_value / unsettled_gross Money (views/consignment.rs:97)
  { m: 'POST', from: '/consignments', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments', bs: {'challan_ref':'s','lines':[{'batch_id':'s','qty':'i','unit_price':'m','variation_id':'s'}],'note':'s','partner_id':'s'}, rs: {'margin_pct':'r'} },
  { m: 'GET', from: '/consignments/:id', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}', rs: {'margin_pct':'r','settlements':[{'margin_pct':'r'}]}, reply: tradeMinor }, // ConsignmentDesk/ManagerView (views/consignment.rs:213): margin_pct milli-percent ("keeps 18000%"), items/settlements Money
  { m: 'POST', from: '/consignments/:id/cancel', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/cancel', bs: {'reason':'s'}, rs: {'margin_pct':'r'} },
  { m: 'GET', from: '/consignments/:id/challan', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/challan' }, // download
  { m: 'POST', from: '/consignments/:id/close', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/close', bs: 'j', rs: {'margin_pct':'r'} },
  { m: 'POST', from: '/consignments/:id/dispatch', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/dispatch', bs: 'j', rs: {'margin_pct':'r'} },
  { m: 'POST', from: '/consignments/:id/return', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/return', bs: {'lines':[{'item_id':'s','qty':'i'}]}, rs: {'consignment':{'margin_pct':'r'}} },
  { m: 'POST', from: '/consignments/:id/sell-through', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/sell-through', bs: {'lines':[{'item_id':'s','qty':'i','reference':'s','sold_on':'s','unit_price':'m'}]}, rs: {'consignment':{'margin_pct':'r'}} },
  { m: 'POST', from: '/consignments/:id/settle', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignments/{id}/settle', bs: {'note':'s','period_from':'s','period_to':'s'} },
  { m: 'GET', from: '/consignments/model-switches', row: 'trade routes/consignment.ts', to: '/api/v2/trade/model-switches', qs: ['limit','partner_id'], reply: tradeMinor }, // ModelSwitchDesk/ManagerView deemed_* Money (views/consignment.rs:433)
  { m: 'GET', from: '/consignments/outright', row: 'trade routes/consignment.ts', to: '/api/v2/trade/outright-dispatches', qs: ['limit','offset','partner_id','status'], reply: tradeMinor }, // OutrightRowView gross/tax/total Money (views/consignment.rs:318)
  { m: 'POST', from: '/consignments/outright', row: 'trade routes/consignment.ts', to: '/api/v2/trade/outright-dispatches', bs: {'challan_ref':'s','credit_override':'b','credit_override_reason':'s','dispatch_now':'b','lines':[{'batch_id':'s','qty':'i','unit_price':'m','variation_id':'s'}],'note':'s','order_id':'s','partner_id':'s'} },
  { m: 'GET', from: '/consignments/partners', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners', qs: ['active_only'], rs: {'items':[{'margin_pct':'r'}]}, reply: (d) => (Array.isArray(d) ? mapList(d, partnerRow) : partnerRow(d)) }, // PartnerView.portal_link nested (views/consignment.rs:54)
  { m: 'POST', from: '/consignments/partners', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners', bs: {'addr_line1':'s','addr_line2':'s','city':'s','code':'s','contact_name':'s','customer_id':'s','email':'s','gstin':'s','is_active':'b','margin_pct':'r','model':'s','name':'s','notes':'s','phone':'s','pincode':'s','price_list_id':'s','state':'s','tax_point':'s'}, rs: {'margin_pct':'r'} },
  { m: 'PUT', from: '/consignments/partners/:id', row: 'trade routes/consignment.ts', method: 'PATCH', to: '/api/v2/trade/consignment-partners/{id}', bs: {'addr_line1':'s','addr_line2':'s','city':'s','contact_name':'s','customer_id':'s','email':'s','gstin':'s','is_active':'b','margin_pct':'r','name':'s','notes':'s','phone':'s','pincode':'s','price_list_id':'s','state':'s','tax_point':'s'}, rs: {'margin_pct':'r'} },
  { m: 'GET', from: '/consignments/partners/:id/at-shop', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners/{id}/at-shop', reply: tradeMinor }, // ShelfDesk/ManagerView value_at_price / value_at_cost Money (views/consignment.rs:411)
  { m: 'POST', from: '/consignments/partners/:id/portal-token', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners/{id}/portal-token', bs: {'expires_at':'s','label':'s'} },
  { m: 'DELETE', from: '/consignments/partners/:id/portal-token', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners/{id}/portal-token' },
  { m: 'GET', from: '/consignments/partners/:id/portal-activity', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners/{id}/portal-activity', qs: ['limit'] }, // PortalEventView (trade views/consignment.rs:84); MENU-1 stock-network
  { m: 'POST', from: '/consignments/partners/:id/switch-model', row: 'trade routes/consignment.ts', to: '/api/v2/trade/consignment-partners/{id}/switch-model', bs: {'effective_date':'s','model':'s','notes':'s'}, rs: {'partner':{'margin_pct':'r'}} },
  { m: 'GET', from: '/consignments/report/sell-through', row: 'trade routes/consignment.ts', to: '/api/v2/trade/reports/sell-through', qs: ['partner_id'], rs: [{'margin_pct':'r','sell_through_pct':'r'}], reply: tradeMinor }, // SellThroughRowView sold_gross / unsettled_gross / settled_net Money (views/consignment.rs:297)
  { m: 'GET', from: '/consignments/settlements', row: 'trade routes/consignment.ts', to: '/api/v2/trade/settlements', qs: ['consignment_id','limit','partner_id'], reply: tradeMinor }, // SettlementDesk/ManagerView gross / partner_margin / tax / net_due Money (views/consignment.rs:165)
  { m: 'GET', from: '/network/partners', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/distributors', rs: [{'margin_pct':'r','marketing_fund_pct':'r','royalty_pct':'r','tier_discount_pct':'r'}] },
  { m: 'PUT', from: '/network/partners/:id/terms', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/distributors/{id}/terms', bs: {'distributor_tier_id':'s','keep_price_list':'b','marketing_fund_pct':'r','royalty_base':'s','royalty_pct':'r'}, rs: {'partner':{'margin_pct':'r','marketing_fund_pct':'r','royalty_pct':'r','tier_discount_pct':'r'}} },
  { m: 'GET', from: '/network/royalty-invoices', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices', qs: ['limit','offset','partner_id','status'], rs: {'items':[{'gst':{'rate':'r'},'gst_rate':'r','marketing_fund_pct':'r','royalty_pct':'r'}]}, reply: tradeMinor }, // RoyaltyInvoiceView base_amount / royalty / marketing_fund / tax / total Money (views/network.rs:92)
  { m: 'POST', from: '/network/royalty-invoices', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices', bs: {'issue_now':'b','note':'s','partner_id':'s','period_from':'s','period_to':'s'}, rs: {'invoice':{'gst':{'rate':'r'},'gst_rate':'r','marketing_fund_pct':'r','royalty_pct':'r'}} },
  { m: 'POST', from: '/network/royalty-invoices/:id/cancel', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices/{id}/cancel', bs: {'reason':'s'}, rs: {'gst':{'rate':'r'},'gst_rate':'r','marketing_fund_pct':'r','royalty_pct':'r'} },
  { m: 'POST', from: '/network/royalty-invoices/:id/issue', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices/{id}/issue', bs: {'note':'s','recompute':'b'}, rs: {'invoice':{'gst':{'rate':'r'},'gst_rate':'r','marketing_fund_pct':'r','royalty_pct':'r'}} },
  { m: 'POST', from: '/network/royalty-invoices/:id/paid', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices/{id}/paid', bs: 'j', rs: {'gst':{'rate':'r'},'gst_rate':'r','marketing_fund_pct':'r','royalty_pct':'r'} },
  { m: 'GET', from: '/network/royalty-invoices/:id/pdf', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty-invoices/{id}/pdf' }, // download (trade api/royalty.rs:136); MENU-1 stock-network
  { m: 'GET', from: '/network/royalty/period', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty/period' },
  { m: 'GET', from: '/network/royalty/preview', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/royalty/preview', qs: ['from','partner_id','to'], rs: {'gst':{'rate':'r'},'partner':{'marketing_fund_pct':'r','royalty_pct':'r'}}, reply: royaltyPreview }, // RoyaltyPreviewView (views/network.rs:160)
  { m: 'GET', from: '/network/tiers', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/distributor-tiers', qs: ['active_only'], rs: [{'discount_pct':'r'}] },
  { m: 'POST', from: '/network/tiers', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/distributor-tiers', bs: {'b2b_price_list_id':'s','code':'s','discount_pct':'r','is_active':'b','level':'i','name':'s','notes':'s'}, rs: {'discount_pct':'r'} },
  { m: 'PUT', from: '/network/tiers/:id', row: 'trade routes/distributorRoyalty.ts', method: 'PATCH', to: '/api/v2/trade/distributor-tiers/{id}', bs: {'b2b_price_list_id':'s','discount_pct':'r','is_active':'b','level':'i','name':'s','notes':'s'}, rs: {'discount_pct':'r'} },
  { m: 'POST', from: '/network/tiers/:id/deactivate', row: 'trade routes/distributorRoyalty.ts', to: '/api/v2/trade/distributor-tiers/{id}/deactivate', bs: 'j', rs: {'tier':{'discount_pct':'r'}} },
];
