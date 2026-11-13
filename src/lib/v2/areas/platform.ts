/**
 * Platform and workspace (platform ROUTE_MAP S/C rows; identity staff F rows; insights analytics; commerce exports, reports, attachments, workflow rules, approvals, report schedules): billing, wallet, packages, staff and users, logs, the download queue, analytics reads, store settings keys.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2call, mapList } from '../http';
import { pageAs, shapeBody } from '../shape';
import type { V2Ctx } from '../routes';
import { lift } from './dashboard';
import { majorToMinor } from '../money';

/** A list whose rows each gain `<key>_minor` (the paise the screen divides by 100) from the rupee figure the Money became. */
/** The screen sends a paise integer (`<key>_minor` / camelCase) where the route takes a Money `<key>`: rupees for the Money shaper. */
const minorIn = (key: string, spec: Parameters<typeof shapeBody>[0]) => (c: V2Ctx) => {
  const b = c.body && typeof c.body === 'object' ? { ...c.body } : c.body;
  if (b && b[key] === undefined) {
    const camel = key.replace(/_([a-z])/g, (_m, x: string) => x.toUpperCase()) + 'Minor';
    const minor = b[`${key}_minor`] ?? b[camel];
    if (minor !== undefined && minor !== null && minor !== '') b[key] = Number(minor) / 100;
    delete b[`${key}_minor`]; delete b[camel];
  }
  return shapeBody(spec)({ ...c, body: b });
};

const withMinor = (...keys: string[]) => (d: any) => (Array.isArray(d)
  ? mapList(d, (r: any) => {
    if (!r || typeof r !== 'object') return r;
    const out = { ...r };
    for (const k of keys) if (out[`${k}_minor`] === undefined && out[k] !== undefined) out[`${k}_minor`] = majorToMinor(out[k]);
    return out;
  })
  : d);


/** One staff settings key: v2 serves the staff settings as ONE answer (GET /settings → {settings}); the key is picked from it. */
const settingsKey = (key: string) => async () => {
  const all = await v2call<any>('GET', '/api/v2/commerce/settings');
  return (all?.settings ?? all ?? {})[key] ?? {};
};

export const PLATFORM_ROUTES: V2Route[] = [
  { m: 'POST', from: '/ai/describe-image', row: 'commerce aiStudio.ts:221', to: '/api/v2/commerce/ai/describe-image', bs: {'url':'s'} },
  { m: 'GET', from: '/ai/fields', row: 'commerce aiStudio.ts:274', to: '/api/v2/commerce/ai/fields' },
  { m: 'POST', from: '/ai/generate-image', row: 'commerce ai.ts:49', to: '/api/v2/commerce/ai/images/generate', bs: {'context':{'category':'s','content':'s','height':'i','industry_name':'s','product_name':'s','purpose':'s','section':'s','use_case_title':'s','width':'i'},'prompt':'s'} },
  { m: 'POST', from: '/ai/image', row: 'commerce aiStudio.ts:185', to: '/api/v2/commerce/ai/image', bs: {'count':'i','draft':'j','entity':'s','entityId':'s','folder':'s','height':'i','instruction':'s','local':'j','prompt':'s','provider':'s','referenceImages':['s'],'slot':'s','style':'s','width':'i'} },
  { m: 'POST', from: '/ai/product-page/generate', row: 'commerce aiStudio.ts:265', to: '/api/v2/commerce/ai/product-page/generate', bs: {'answers':'j','assets':[{'note':'s','url':'s'}],'audience':'s','draft':'j','entityId':'s','include':{'aplus':'b','dosage':'b','faqs':'b','importantInfo':'b','seo':'b','specifications':'b','tags':'b'},'notes':'s','tone':'s'}, reply: (d) => d?.plan ?? d }, // AiPlanView {plan} (commerce views/ai_studio.rs:141); AiPageWizard reads questions / page
  { m: 'POST', from: '/ai/product-page/questions', row: 'commerce aiStudio.ts:257', to: '/api/v2/commerce/ai/product-page/questions', bs: {'answers':'j','assets':[{'note':'s','url':'s'}],'audience':'s','draft':'j','entityId':'s','include':{'aplus':'b','dosage':'b','faqs':'b','importantInfo':'b','seo':'b','specifications':'b','tags':'b'},'notes':'s','tone':'s'}, reply: (d) => d?.plan ?? d }, // AiPlanView {plan} (commerce views/ai_studio.rs:141); AiPageWizard reads questions / page
  { m: 'POST', from: '/ai/text', row: 'commerce aiStudio.ts:135', to: '/api/v2/commerce/ai/text', bs: {'action':'s','currentValue':'s','draft':'j','entity':'s','entityId':'s','field':'s','fieldLabel':'s','format':'s','instruction':'s','language':'s','length':'s','local':'j','provider':'s','tone':'s'} },
  { m: 'GET', from: '/analytics/customers', row: 'not in this binary', gap: 'the old customer analytics list is not in the insights route map (no v2 route)' },
  { m: 'GET', from: '/analytics/customers/:id/behavior', row: 'insights The 27 core routes', to: '/api/v2/insights/customers/{id}/behavior' },
  { m: 'GET', from: '/analytics/customers/:id/journey', row: 'insights The 27 core routes', to: '/api/v2/insights/customers/{id}/journey', qs: ['limit'], reply: (d) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, type: r.type ?? r.event, created_at: r.created_at ?? r.at })) : d) }, // JourneyEventView {event, at, …} (insights views.rs:283); AbandonedCartDetail reads the old {type, created_at}
  { m: 'GET', from: '/analytics/dashboard', row: 'insights The 27 core routes', to: '/api/v2/insights/dashboard', qs: ['from','range','to'] },
  { m: 'GET', from: '/analytics/devices', row: 'insights The 27 core routes', to: '/api/v2/insights/devices', qs: ['from','range','to'] },
  { m: 'GET', from: '/analytics/funnel', row: 'insights The 27 core routes', to: '/api/v2/insights/funnel', qs: ['from','range','to'] },
  { m: 'GET', from: '/analytics/live/map', row: 'insights The 27 core routes', to: '/api/v2/insights/realtime/map', qs: ['from','range','to'], reply: (d) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, code: r.code ?? r.country, count: r.count ?? r.visits })) : d) }, // CountryVisitsView {country, visits} (insights views.rs:110); the screens read the old {code, count}
  { m: 'GET', from: '/analytics/orders/stats', row: 'insights The 27 core routes', to: '/api/v2/insights/order-stats', qs: ['from','range','to'] },
  { m: 'GET', from: '/analytics/panels/sales-team/agent/:id', row: 'insights The 27 core routes', to: '/api/v2/insights/panels/sales-team/agents/{id}', qs: ['from','to'], reply: lift }, // PanelView {panel, range, bucket, figures} (insights views.rs:541); SalesTeam's agent drawer reads figures.orders / by_action / daily at the top
  { m: 'GET', from: '/analytics/realtime/visitors', row: 'insights The 27 core routes', to: '/api/v2/insights/realtime/visitors' },
  { m: 'GET', from: '/analytics/revenue', row: 'insights The 27 core routes', to: '/api/v2/insights/revenue' },
  { m: 'GET', from: '/analytics/shipments/stats', row: 'insights The 27 core routes', to: '/api/v2/insights/shipment-stats', qs: ['from','range','to'] },
  { m: 'GET', from: '/analytics/store-kpis', row: 'insights The 27 core routes', to: '/api/v2/insights/kpis', qs: ['from','range','to'], reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, totalRevenue: d.totalRevenue ?? d.revenue, totalSessions: d.totalSessions ?? d.sessions } : d) }, // KpisView {revenue, sessions, …} (insights views.rs:164); StoreAnalytics reads the old totalRevenue / totalSessions
  { m: 'GET', from: '/analytics/top-categories', row: 'not in this binary', gap: 'top categories is not in the insights route map (no v2 route; the commerce panel carries the same figures)' },
  { m: 'GET', from: '/analytics/top-products', row: 'not in this binary', gap: 'top products is not in the insights route map (no v2 route; the commerce panel carries the same figures)' },
  { m: 'GET', from: '/analytics/user/journey/:sessionId', row: 'insights The 27 core routes', to: '/api/v2/insights/sessions/{sessionId}/journey', reply: (d) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, created_at: r.created_at ?? r.at })) : d) }, // SessionStepView {…, at} (insights views.rs:252); UserAnalytics reads the old created_at
  { m: 'GET', from: '/approvals/pending', row: 'commerce approvals.ts:74', to: '/api/v2/commerce/approvals/pending', reply: withMinor('amount') }, // ApprovalRequestView {amount: Money} (commerce views/workflow.rs:102); Approvals reads amount_minor (paise)
  { m: 'GET', from: '/approvals/requests', row: 'commerce approvals.ts:82', to: '/api/v2/commerce/approvals/requests', qs: ['doc_type','limit','offset','status'] },
  { m: 'GET', from: '/approvals/requests/:id', row: 'commerce approvals.ts:93', to: '/api/v2/commerce/approvals/requests/{id}' },
  { m: 'POST', from: '/approvals/requests/:id/approve', row: 'commerce approvals.ts:103', to: '/api/v2/commerce/approvals/requests/{id}/approve', bs: {'reason':'s'} },
  { m: 'POST', from: '/approvals/requests/:id/cancel', row: 'commerce approvals.ts:117', to: '/api/v2/commerce/approvals/requests/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/approvals/requests/:id/reject', row: 'commerce approvals.ts:110', to: '/api/v2/commerce/approvals/requests/{id}/reject', bs: {'reason':'s'} },
  { m: 'GET', from: '/approvals/rules', row: 'commerce approvals.ts:28', to: '/api/v2/commerce/approvals/rules', qs: ['doc_type'], reply: withMinor('min_amount') }, // ApprovalRuleView {min_amount: Money} (commerce views/workflow.rs:69); Approvals reads min_amount_minor (paise)
  { m: 'POST', from: '/approvals/rules', row: 'commerce approvals.ts:35', to: '/api/v2/commerce/approvals/rules', body: minorIn('min_amount', {'active':'b','allow_self_approve':'b','approver_role':'s','doc_type':'s','fallback_role':'s','id':'s','min_amount':'m','note':'s','step_no':'i'}) }, // Approvals.tsx sends minAmountMinor (paise)
  { m: 'POST', from: '/approvals/rules/:id/active', row: 'commerce approvals.ts:60', to: '/api/v2/commerce/approvals/rules/{id}/active', bs: {'active':'b'} },
  { m: 'POST', from: '/approvals/stock-adjustments', row: 'commerce approvals.ts:141', to: '/api/v2/commerce/approvals/stock-adjustments', bs: {'delta':'i','reason':'s','variation_id':'s'} },
  { m: 'GET', from: '/attachments/:entityType/:entityId', row: 'commerce attachments.ts:182', to: '/api/v2/commerce/attachments/{entityType}/{entityId}' },
  { m: 'POST', from: '/attachments/:entityType/:entityId', row: 'commerce attachments.ts:147', to: '/api/v2/commerce/attachments/{entityType}/{entityId}', bs: {'#mp':'j','file':'f'} },
  { m: 'DELETE', from: '/attachments/item/:id', row: 'commerce attachments.ts:223', method: 'POST', to: '/api/v2/commerce/attachment-files/{id}/remove', body: () => ({}) }, // the route reads no body
  { m: 'GET', from: '/attachments/item/:id/url', row: 'commerce attachments.ts:202', to: '/api/v2/commerce/attachment-files/{id}/url' }, // {url, expires_in, file_name}; AttachmentPanel opens .url
  { m: 'GET', from: '/billing/invoices', row: 'platform billing.ts:124 ({report} → the rows)', to: '/api/v2/platform/billing/invoices', reply: (d) => d?.report ?? d },
  { m: 'GET', from: '/billing/invoices/:id', row: 'platform billing.ts:137 ({report} → the statement)', to: '/api/v2/platform/billing/invoices/{id}', reply: (d) => d?.report ?? d },
  { m: 'GET', from: '/billing/invoices/:id/orders.pdf', row: 'platform billing.ts:162', to: '/api/v2/platform/billing/invoices/{id}/orders.pdf' }, // download
  { m: 'GET', from: '/billing/invoices/:p1/payment', row: 'not in this binary', gap: 'paying a platform invoice online has no v2 route (platform ROUTE_MAP: no row)' },
  // Pay now: Growcord's own Razorpay account, one order per invoice; verify settles through the webhook's own settle.
  { m: 'POST', from: '/billing/invoices/:id/payment/razorpay', row: 'platform billing.ts:150', to: '/api/v2/platform/billing/invoices/{id}/payment/razorpay', body: () => undefined },
  { m: 'POST', from: '/billing/invoices/:id/payment/razorpay/verify', row: 'platform billing.ts:163', to: '/api/v2/platform/billing/invoices/{id}/payment/razorpay/verify', bs: { razorpay_order_id: 's', razorpay_payment_id: 's', razorpay_signature: 's' } },
  { m: 'GET', from: '/billing/invoices/:id/tax-invoice.pdf', row: 'platform billing.ts:147', to: '/api/v2/platform/billing/invoices/{id}/tax-invoice.pdf' }, // download
  { m: 'GET', from: '/billing/usage', row: 'platform billing.ts:38', to: '/api/v2/platform/billing/usage' },
  { m: 'POST', from: '/checkout/calculate', row: 'checkout checkout.ts:163', to: '/api/v2/checkout/quote', bs: {'billing_address':{'city':'s','country':'s','pincode':'s','state':'s'},'cart_ref':'s','coupon_code':'s','items':[{'product_id':'s','quantity':'i','variation_id':'s'}],'payment_method':'s','selected_offer_ids':['s'],'shipping_address':{'city':'s','country':'s','pincode':'s','state':'s'},'warehouse_id':'s'} },
  { m: 'POST', from: '/exports', row: 'commerce dataJobs.ts:68', to: '/api/v2/commerce/exports', bs: {'dataset':'s','params':'j'} },
  { m: 'GET', from: '/exports', row: 'commerce dataJobs.ts:101', to: '/api/v2/commerce/exports', qs: ['dataset','direction','limit','offset','status'], reply: pageAs('rows') }, // DataJobListView {items, total, unavailable, reason} (commerce views/catalog_admin.rs:1637) arrives as a Page; DownloadsPanel reads {rows, total, unavailable}
  { m: 'GET', from: '/exports/:id', row: 'commerce dataJobs.ts:121', to: '/api/v2/commerce/exports/{id}' },
  { m: 'DELETE', from: '/exports/:id', row: 'commerce dataJobs.ts:255', method: 'POST', to: '/api/v2/commerce/exports/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/exports/:id/download', row: 'commerce dataJobs.ts:168', to: '/api/v2/commerce/exports/{id}/download' }, // download
  { m: 'POST', from: '/exports/:id/download-link', row: 'commerce dataJobs.ts:204', to: '/api/v2/commerce/exports/{id}/download-link', bs: 'j' },
  { m: 'GET', from: '/exports/:id/problems', row: 'commerce dataJobs.ts:149', to: '/api/v2/commerce/exports/{id}/problems' }, // download
  { m: 'POST', from: '/exports/:id/retry', row: 'commerce dataJobs.ts:237', to: '/api/v2/commerce/exports/{id}/retry', bs: 'j' },
  { m: 'GET', from: '/exports/:id/rows', row: 'commerce dataJobs.ts:133', to: '/api/v2/commerce/exports/{id}/rows', qs: ['limit','offset','only_problems'], reply: pageAs('rows') }, // a Page of DataJobRowView (commerce views/catalog_admin.rs:1649); DownloadsPanel reads {rows}
  { m: 'GET', from: '/exports/catalog', row: 'commerce dataJobs.ts:44', to: '/api/v2/commerce/exports/catalog' },
  // GET /api/v2/platform/console/logs[/files] is platform-staff only (platform api/ops.rs:93, :95): a store-staff token is 403 there.
  { m: 'GET', from: '/logs', row: 'platform logs.ts:20 (platform staff only)', gap: 'the server log viewer is a Growcord console screen (platform staff only); store staff have no v2 route for it' },
  { m: 'GET', from: '/logs/files', row: 'platform logs.ts:124 (platform staff only)', gap: 'the server log files are a Growcord console screen (platform staff only); store staff have no v2 route for them' },
  { m: 'GET', from: '/packages', row: 'ship routes/packages.ts', to: '/api/v2/ship/boxes', reply: withMinor('cost') }, // BoxView {cost: Money} (ship views/store.rs:26); PackageBoxes reads cost_minor (paise)
  { m: 'POST', from: '/packages', row: 'ship routes/packages.ts', to: '/api/v2/ship/boxes', body: minorIn('cost', {'breadth':'s','code':'s','cost':'m','description':'s','height':'s','inner_breadth_mm':'i','inner_height_mm':'i','inner_length_mm':'i','is_active':'b','is_default':'b','length':'s','max_weight_g':'i','name':'s','tare_g':'i','weight':'s'}) }, // PackageBoxes.tsx sends cost_minor (paise)
  { m: 'PUT', from: '/packages/:id', row: 'ship routes/packages.ts', method: 'PATCH', to: '/api/v2/ship/boxes/{id}', body: minorIn('cost', {'breadth':'s','code':'s','cost':'m','description':'s','height':'s','inner_breadth_mm':'i','inner_height_mm':'i','inner_length_mm':'i','is_active':'b','is_default':'b','length':'s','max_weight_g':'i','name':'s','tare_g':'i','weight':'s'}) }, // PackageBoxes.tsx sends cost_minor (paise)
  { m: 'DELETE', from: '/packages/:id', row: 'ship routes/packages.ts', to: '/api/v2/ship/boxes/{id}' },
  { m: 'GET', from: '/report-schedules', row: 'books accounting.ts', to: '/api/v2/books/report-schedules' },
  { m: 'POST', from: '/report-schedules', row: 'books accounting.ts', to: '/api/v2/books/report-schedules', bs: {'active':'b','cadence':'s','day_of_month':'i','day_of_week':'i','format':'s','name':'s','recipients':['s'],'report_key':'s','time_of_day':'s'} },
  { m: 'PUT', from: '/report-schedules/:id', row: 'books accounting.ts', method: 'PATCH', to: '/api/v2/books/report-schedules/{id}', bs: {'active':'b','cadence':'s','day_of_month':'i','day_of_week':'i','format':'s','name':'s','recipients':['s'],'report_key':'s','time_of_day':'s'} },
  { m: 'DELETE', from: '/report-schedules/:id', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/{id}' },
  { m: 'GET', from: '/report-schedules/:id', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/{id}' },
  { m: 'POST', from: '/report-schedules/:id/run-now', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/{id}/run', bs: {'as_of':'s'} },
  { m: 'GET', from: '/report-schedules/preview', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/preview', qs: ['format','from','report_key','to'] }, // download
  { m: 'GET', from: '/report-schedules/reports', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/catalogue' },
  { m: 'GET', from: '/report-schedules/runs', row: 'books accounting.ts', to: '/api/v2/books/report-schedules/runs', qs: ['limit','schedule_id'] },
  { m: 'GET', from: '/reports/ageing', row: 'commerce reports.ts:94', to: '/api/v2/commerce/reports/ageing', qs: ['bucket', 'limit', 'offset'], reply: pageAs('rows') },
  { m: 'GET', from: '/reports/batches', row: 'commerce reports.ts:120', to: '/api/v2/commerce/reports/batches', qs: ['limit', 'near_expiry_days', 'variation_id'], reply: pageAs('rows') },
  { m: 'GET', from: '/reports/stock-summary', row: 'commerce reports.ts:44', to: '/api/v2/commerce/reports/stock-summary', qs: ['in_stock_only', 'limit', 'offset', 'search'], reply: pageAs('rows') },
  { m: 'GET', from: '/reports/valuation', row: 'commerce reports.ts:73', to: '/api/v2/commerce/reports/valuation' },
  { m: 'GET', from: '/scheduled-jobs', row: 'books accounting.ts', to: '/api/v2/books/scheduled-jobs', reply: (d) => (d && Array.isArray(d.jobs) ? { ...d, jobs: d.jobs.map((j: any) => (j?.last_run ? { ...j, last_run: withMinor('amount')([j.last_run])[0] } : j)) } : d) }, // SchedulerRunView {amount: Money} (books views/ledger.rs:357); ScheduledJobs reads lastRun.amount_minor (paise)
  { m: 'GET', from: '/scheduled-jobs/runs', row: 'books accounting.ts', to: '/api/v2/books/scheduled-jobs/runs', qs: ['job_key','limit'], reply: withMinor('amount') }, // SchedulerRunView {amount: Money} (books views/ledger.rs:357); ScheduledJobs reads amount_minor (paise)
  { m: 'GET', from: '/settings/gst', row: 'commerce settings.ts:160 (staff GET /settings → .gst)', run: settingsKey('gst') },
  { m: 'GET', from: '/staff', row: 'identity staff.ts:66', to: '/api/v2/identity/staff', qs: ['limit','offset','page','sort','q','role','is_active'] },
  { m: 'POST', from: '/staff', row: 'identity staff.ts:90', to: '/api/v2/identity/staff', bs: {'channel_access':['s'],'dial_code':'j','email':'j','name':'j','password':'s','permissions':['s'],'phone_number':'j','role':'s','warehouse_access':['s'],'warehouse_node_access':['s']} }, // STAFF-1: password = the new person's first Growcord ID password; no is_active / store_access on create
  { m: 'PUT', from: '/staff/:id', row: 'identity staff.ts:110', method: 'PATCH', to: '/api/v2/identity/staff/{id}', bs: {'channel_access':['s'],'dial_code':'j','email':'j','is_active':'b','name':'j','permissions':['s'],'phone_number':'j','role':'s','warehouse_access':['s'],'warehouse_node_access':['s']} },
  { m: 'DELETE', from: '/staff/:id', row: 'identity F8 (STAFF-1: staff.delete)', method: 'POST', to: '/api/v2/identity/staff/{id}/deactivate', bs: 'j' },
  { m: 'POST', from: '/staff/:id/link', row: 'identity F18 (DEC-061: Growcord ID sign-in for an existing account, never a password)', to: '/api/v2/identity/staff/{id}/link', bs: 'j' }, // StaffAccountView {.., access} (identity views/staff.rs:125)
  { m: 'PUT', from: '/staff/:id/warehouse-access', row: 'identity staff.ts:201', method: 'PATCH', to: '/api/v2/identity/staff/{id}', bs: {'channel_access':['s'],'dial_code':'j','email':'j','is_active':'b','name':'j','permissions':['s'],'phone_number':'j','role':'s','warehouse_access':['s'],'warehouse_node_access':['s']} },
  { m: 'GET', from: '/staff/permissions', row: 'identity staff.ts:27', to: '/api/v2/identity/staff/permissions', reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, legacy: d.legacy ?? d.module_grants ?? [] } : d) }, // StaffCatalogueView {catalog, module_grants, roles} (identity views/staff.rs:33); PermissionPicker reads catalog.legacy.length (crashed when absent)
  { m: 'GET', from: '/users', row: 'identity users.ts:10', to: '/api/v2/identity/staff', qs: ['limit','offset','page','sort','q','role','is_active'] },
  { m: 'GET', from: '/users/:id', row: 'identity users.ts:31', to: '/api/v2/identity/staff/{id}' },
  { m: 'GET', from: '/wallet', row: 'platform wallet.ts:28', to: '/api/v2/platform/wallet' },
  { m: 'GET', from: '/wallet/pricing', row: 'platform wallet.ts:64', to: '/api/v2/platform/wallet/pricing', reply: (d) => (Array.isArray(d) ? Object.fromEntries(d.filter((r: any) => r?.service).map((r: any) => [r.service, Number(r.amount)])) : d) }, // [ServicePriceView {service, amount, currency, per}] (platform views/store.rs:228); Wallet reads the old {sms: 0.25, whatsapp: …} map
  { m: 'POST', from: '/wallet/recharge/create-order', row: 'platform wallet.ts:76', to: '/api/v2/platform/wallet/recharges', bs: {'amount':'m'}, reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, razorpay_order_id: d.razorpay_order_id ?? d.gateway_order_id } : d) }, // RechargeOrderView {recharge_id, gateway_order_id, key_id, amount} (platform views/store.rs:269); Wallet hands Razorpay order.razorpay_order_id
  { m: 'POST', from: '/wallet/recharge/verify', row: 'platform wallet.ts:117', to: '/api/v2/platform/wallet/recharges/verify', bs: {'razorpay_order_id':'s','razorpay_payment_id':'s','razorpay_signature':'s'} },
  { m: 'GET', from: '/wallet/recharges', row: 'platform wallet.ts:165', to: '/api/v2/platform/wallet/recharges', reply: (d) => (Array.isArray(d) ? mapList(d, (r: any) => ({ ...r, razorpay_order_id: r.razorpay_order_id ?? r.gateway_order_id, razorpay_payment_id: r.razorpay_payment_id ?? r.gateway_payment_id })) : d) }, // RechargeView {gateway_order_id, gateway_payment_id} (platform views/store.rs:238); Wallet reads razorpay_payment_id
  { m: 'GET', from: '/wallet/transactions', row: 'platform wallet.ts:48', to: '/api/v2/platform/wallet/transactions', qs: ['category','direction','limit','offset'] },
  { m: 'GET', from: '/workflow-rules', row: 'commerce workflowRules.ts:43', to: '/api/v2/commerce/workflow-rules' },
  { m: 'POST', from: '/workflow-rules', row: 'commerce workflowRules.ts:92', to: '/api/v2/commerce/workflow-rules', bs: {'actions':['j'],'active':'b','condition':'j','description':'s','name':'s','note':'s','rate_cap_per_hour':'i','trigger_event':'s'} },
  { m: 'DELETE', from: '/workflow-rules/:id', row: 'commerce workflowRules.ts:113', method: 'POST', to: '/api/v2/commerce/workflow-rules/{id}/remove', bs: 'j' },
  { m: 'PUT', from: '/workflow-rules/:id', row: 'commerce workflowRules.ts:99', method: 'PATCH', to: '/api/v2/commerce/workflow-rules/{id}', bs: {'actions':['j'],'active':'b','condition':'j','description':'s','name':'s','note':'s','rate_cap_per_hour':'i','trigger_event':'s'} },
  { m: 'PATCH', from: '/workflow-rules/:id/active', row: 'commerce workflowRules.ts:105 (binary PATCH /workflow-rules/{id})', to: '/api/v2/commerce/workflow-rules/{id}', body: (c) => ({ active: !!(c.body?.active ?? c.body?.isActive) }) },
  { m: 'GET', from: '/workflow-rules/:id/dry-run', row: 'commerce workflowRules.ts:123', to: '/api/v2/commerce/workflow-rules/{id}/dry-run', qs: ['limit'], reply: (d) => d?.result ?? d }, // WorkflowDryRunView {result} (commerce views/workflow.rs:331); WorkflowRules reads matched / sample
  { m: 'POST', from: '/workflow-rules/dry-run', row: 'commerce workflowRules.ts:136', to: '/api/v2/commerce/workflow-rules/dry-run', bs: {'actions':['j'],'condition':'j','limit':'i','name':'s','trigger_event':'s'}, reply: (d) => d?.result ?? d }, // WorkflowDryRunView {result} (commerce views/workflow.rs:331); WorkflowRules reads matched / sample
  { m: 'GET', from: '/workflow-rules/log', row: 'commerce workflowRules.ts:47', to: '/api/v2/commerce/workflow-rules/log', qs: ['limit','rule_id','status'] },
  { m: 'GET', from: '/workflow-rules/meta', row: 'commerce workflowRules.ts:25', to: '/api/v2/commerce/workflow-rules/meta' },
  { m: 'GET', from: '/workflow-rules/webhook-hosts', row: 'commerce workflowRules.ts:65', to: '/api/v2/commerce/workflow-rules/webhook-hosts' },
  { m: 'POST', from: '/workflow-rules/webhook-hosts', row: 'commerce workflowRules.ts:69', to: '/api/v2/commerce/workflow-rules/webhook-hosts', bs: {'host':'s','note':'s'} },
  { m: 'DELETE', from: '/workflow-rules/webhook-hosts/:id', row: 'commerce workflowRules.ts:76', method: 'POST', to: '/api/v2/commerce/workflow-rules/webhook-hosts/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/settings/markets', row: 'commerce settings.ts:160 (staff GET /settings → .markets)', run: settingsKey('markets') },
  { m: 'GET', from: '/settings/general', row: 'commerce settings.ts:160 (staff GET /settings → .general)', run: settingsKey('general') },
];
