/**
 * Payments, refunds, coupons, returns and the counter (checkout ROUTE_MAP payments/refunds/coupons/payment rules; retail POS; wms outlets): verifying and recording payments by hand, refund requests, coupons, returns, POS sessions and outlet transfers.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Ctx, V2Route } from '../routes';
import { mapList } from '../http';
import { majorToMinor } from '../money';
import { shapeBody } from '../shape';
import type { Spec } from '../shape';


/** POS drawer: the counter screen reads paise (`cash_minor`, `expected_cash_now_minor`, the close
 *  result's `*_cash_minor` / `variance_minor`); v2 answers Money, already turned into rupees by
 *  the envelope normaliser — give the screen its paise twins so nothing renders ₹NaN. */
const toMinor = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null);
const posMinor = (d: any) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
  const out: any = { ...d };
  const twin = (minorKey: string, majorKey: string) => { if (out[minorKey] == null && toMinor(out[majorKey]) != null) out[minorKey] = toMinor(out[majorKey]); };
  twin('cash_minor', 'cash_taken');
  twin('expected_cash_now_minor', 'expected_cash');
  twin('expected_cash_minor', 'expected_cash');
  twin('counted_cash_minor', 'counted_cash');
  twin('variance_minor', 'variance');
  twin('opening_float_minor', 'opening_float');
  return out;
};

/** RefundView carries `amount` as Money (commerce views/refunds.rs:41, rupees here); the Refunds panel, its CSV and the
 *  order page read `amount_minor` (paise, the old row). */
const refundRow = (r: any) => (r && typeof r === 'object' && !Array.isArray(r) ? { ...r, amount_minor: r.amount_minor ?? majorToMinor(r.amount) } : r);
const refundReply = (d: any) => (Array.isArray(d) ? mapList(d, refundRow) : refundRow(d));

/** ReturnStaffView (commerce views/returns.rs:124): the order uuid is `order_id` (read from `order_uuid`, :180) and the
 *  amounts are Money (:138-140, a line's :78-79); Returns.tsx / ReturnDetailPanel read `order_uuid`, `line_count` and the
 *  paise twins (`eligible_amount_minor`, a line's `unit_price_minor` …). */
const minorOf = (o: any, k: string) => (o[`${k}_minor`] ?? (typeof o[k] === 'number' ? majorToMinor(o[k]) : o[k] ?? null));
const returnRow = (r: any) => {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
  const lines = Array.isArray(r.lines) ? r.lines.map((l: any) => (l && typeof l === 'object' ? { ...l, eligible_amount_minor: minorOf(l, 'eligible_amount'), unit_price_minor: minorOf(l, 'unit_price') } : l)) : r.lines;
  return {
    ...r, lines,
    order_uuid: r.order_uuid ?? r.order_id ?? null,
    line_count: r.line_count ?? (Array.isArray(r.lines) ? r.lines.length : null),
    eligible_amount_minor: minorOf(r, 'eligible_amount'), claimed_amount_minor: minorOf(r, 'claimed_amount'), refund_amount_minor: minorOf(r, 'refund_amount'),
  };
};
const returnReply = (d: any) => (Array.isArray(d) ? mapList(d, returnRow) : returnRow(d));

/** Paise from a screen (`*Minor` / `*_minor`) → wire Money, which the 'm' shaper passes through as is (shape.ts shapeValue). */
export const paiseMoney = (v: unknown): { minor: number; currency: string } | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? { minor: Math.round(n), currency: 'INR' } : undefined;
};
/** The row's typed body after `fix` re-spells the screen's legacy keys on a copy (shapeBody drops an unknown key silently). */
export const respelt = (spec: Spec, fix: (b: Record<string, any>) => void) => (c: V2Ctx): unknown => {
  const src = c.body;
  if (!src || typeof src !== 'object' || Array.isArray(src) || (typeof FormData !== 'undefined' && src instanceof FormData)) return shapeBody(spec)(c);
  const b: Record<string, any> = { ...src };
  fix(b);
  return shapeBody(spec)({ ...c, body: b });
};
/** `key` ← the paise spelling `<camel>Minor` / `<key>_minor` when the body has no `key` itself. */
const paiseInto = (b: Record<string, any>, key: string) => {
  const camel = key.replace(/_([a-z])/g, (_m, x: string) => x.toUpperCase()) + 'Minor';
  const minor = b[camel] ?? b[`${key}_minor`];
  if (b[key] === undefined && minor !== undefined) b[key] = paiseMoney(minor);
  delete b[camel]; delete b[`${key}_minor`];
};
/** The coupon resource's money fields take `{minor, currency}` only (commerce resources/catalog_mgmt.rs:797-814; kernel resource
 *  value.rs:563 money_parts), so the binary's free-JSON `j` is shaped as Money here; CouponForm sends rupees and `clubbedWithOtherCoupons`. */
const COUPON_IN: Spec = {'amount_off':'m','applies_to':'s','clubbed_with_others':'b','code':'s','currency':'s','customer_segment':'s','description':'s','is_active':'b','is_public':'b','max_discount':'m','min_purchase':'m','type':'s','usage_limit':'j','user_limit':'j','valid_from':'s','valid_until':'s','value':'j'};
const couponBody = respelt(COUPON_IN, (b) => {
  if (b.clubbed_with_others === undefined && b.clubbedWithOthers === undefined && b.clubbedWithOtherCoupons !== undefined) b.clubbed_with_others = b.clubbedWithOtherCoupons;
  delete b.clubbedWithOtherCoupons;
});

export const PAYMENT_ROUTES: V2Route[] = [
  { m: 'POST', from: '/coupons', row: 'commerce coupons.ts:97', to: '/api/v2/commerce/coupons', body: couponBody },
  { m: 'GET', from: '/coupons/:id', row: 'commerce coupons.ts:72', to: '/api/v2/commerce/coupons/{id}' },
  { m: 'PUT', from: '/coupons/:id', row: 'commerce coupons.ts:104', method: 'PATCH', to: '/api/v2/commerce/coupons/{id}', body: couponBody },
  { m: 'DELETE', from: '/coupons/:id', row: 'commerce coupons.ts:112', to: '/api/v2/commerce/coupons/{id}' },
  { m: 'GET', from: '/coupons/admin', row: 'commerce coupons.ts:64', to: '/api/v2/commerce/coupons', qs: ['limit','offset','page','sort','q','code','type','is_active','is_public','applies_to','customer_segment'] },
  { m: 'GET', from: '/orders/:p1/timeline', row: 'commerce — no row', gap: 'the order timeline has no v2 route (commerce ROUTE_MAP: no row; the order page reads /orders/{id}/activity)' },
  { m: 'GET', from: '/outlets', row: 'wms The table', to: '/api/v2/wms/outlets' },
  { m: 'POST', from: '/outlets/:id/transfer', row: 'wms outlets.ts:38', to: '/api/v2/wms/outlets/{id}/transfer', bs: {'qty':'i','variation_id':'s'} },
  { m: 'POST', from: '/outlets/:id/transfer-back', row: 'wms outlets.ts', to: '/api/v2/wms/outlets/{id}/transfer-back', bs: {'qty':'i','variation_id':'s'} },
  { m: 'GET', from: '/outlets/:id/stock', row: 'wms The table', to: '/api/v2/wms/outlets/{id}/stock' },
  { m: 'POST', from: '/outlets/:id/transfer', row: 'wms The table', to: '/api/v2/wms/outlets/{id}/transfer', bs: {'qty':'i','variation_id':'s'} },
  { m: 'POST', from: '/outlets/:id/transfer-back', row: 'wms The table', to: '/api/v2/wms/outlets/{id}/transfer-back', bs: {'qty':'i','variation_id':'s'} },
  { m: 'GET', from: '/payment/rules', row: 'checkout paymentRules.ts:6', to: '/api/v2/checkout/payment-rules', qs: ['limit','offset','page','sort','q','name','method','is_active'] },
  { m: 'POST', from: '/payment/rules', row: 'checkout paymentRules.ts:13', to: '/api/v2/checkout/payment-rules', bs: {'conditions':'j','is_active':'b','method':'s','name':'s','sort_order':'i'} },
  { m: 'PUT', from: '/payment/rules/:id', row: 'checkout paymentRules.ts:25', method: 'PATCH', to: '/api/v2/checkout/payment-rules/{id}', bs: {'conditions':'j','is_active':'b','method':'s','name':'s','sort_order':'i'} },
  { m: 'DELETE', from: '/payment/rules/:id', row: 'checkout paymentRules.ts:41 (dropped → switched off)', method: 'PATCH', to: '/api/v2/checkout/payment-rules/{id}', body: () => ({ is_active: false }) },
  { m: 'POST', from: '/payments/manual/verify', row: 'checkout 21', to: (c) => `/api/v2/checkout/payments/${encodeURIComponent(String(c.body?.orderId ?? ''))}/record-offline`, body: (c) => ({ method: c.body?.method ?? null, notes: c.body?.notes ?? null, transaction_id: c.body?.transactionId ?? null }) },
  { m: 'POST', from: '/payments/mark-paid', row: 'checkout 23', to: (c) => `/api/v2/checkout/payments/${encodeURIComponent(String(c.body?.identifier ?? ''))}/gateway-confirm`, body: (c) => ({ notes: c.body?.notes ?? null, transaction_id: c.body?.transactionId ?? null }) },
  { m: 'POST', from: '/payments/razorpay/audit', row: 'checkout payments.ts:821', to: (c) => `/api/v2/checkout/payments/${encodeURIComponent(String(c.body?.orderId ?? ''))}/audit`, body: () => ({}) },
  { m: 'POST', from: '/payments/razorpay/verify-admin', row: 'checkout 22 (merged into gateway-confirm)', to: (c) => `/api/v2/checkout/payments/${encodeURIComponent(String(c.body?.orderId ?? ''))}/gateway-confirm`, body: (c) => ({ transaction_id: c.body?.paymentId ?? null, notes: null }) },
  { m: 'POST', from: '/payments/upi/verify', row: 'checkout payments.ts:670', to: (c) => `/api/v2/checkout/payments/${encodeURIComponent(String(c.body?.orderId ?? ''))}/upi-approve`, body: (c) => ({ upi_payment_id: c.body?.upiPaymentId ?? null, notes: c.body?.notes ?? null }) },
  { m: 'POST', from: '/pos/bills', row: 'retail ', to: '/api/v2/retail/bills', bs: {'captured_at':'s','client_ref':'s','coupon_code':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','lines':[{'product_id':'s','quantity':'i','variation_id':'s'}],'manager_override_reason':'s','notes':'s','outlet_id':'s','queued_offline':'b','tenders':[{'amount':'m','confirmed':'b','method':'s','reference':'s','tendered':'m'}]} },
  { m: 'GET', from: '/pos/bills/:receiptNumber', row: 'retail ', to: '/api/v2/retail/bills/{receiptNumber}' },
  { m: 'POST', from: '/pos/bills/:receiptNumber/void', row: 'retail ', to: '/api/v2/retail/bills/{receiptNumber}/void', bs: {'method':'s','outlet_id':'s','reason':'s'} },
  { m: 'POST', from: '/pos/bills/sync', row: 'retail ', to: '/api/v2/retail/bills/sync', bs: {'bills':[{'captured_at':'s','client_ref':'s','coupon_code':'s','customer_id':'s','customer_name':'s','customer_phone':'s','lines':[{'product_id':'s','quantity':'i','variation_id':'s'}],'notes':'s','outlet_id':'s','tenders':[{'amount':'m','confirmed':'b','method':'s','reference':'s','tendered':'m'}]}]} },
  { m: 'GET', from: '/pos/config', row: 'retail ', to: '/api/v2/retail/counter/config', qs: ['outlet_id'], rs: {'config':{'max_cashier_discount':'r'}} },
  { m: 'GET', from: '/pos/outlets', row: 'retail ', to: '/api/v2/retail/outlets' },
  { m: 'POST', from: '/pos/quote', row: 'retail ', to: '/api/v2/retail/counter/quote', bs: {'coupon_code':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','lines':[{'product_id':'s','quantity':'i','variation_id':'s'}],'outlet_id':'s'}, rs: {'discount_percent':'r'} },
  { m: 'POST', from: '/pos/receipts', row: 'retail ', to: '/api/v2/retail/receipts', body: respelt({'amount':'m','lines':[{'product_id':'s','qty':'i','variation_id':'s'}],'order_id':'s','outlet_id':'s','payment_method':'s'}, (b) => paiseInto(b, 'amount')) }, // ReceiptIn.amount: Money (retail inputs.rs:187); PosSurface sends amountMinor
  { m: 'GET', from: '/pos/receipts?sessionId=', row: 'retail ', to: '/api/v2/retail/sessions/{id}/receipts' },
  { m: 'GET', from: '/pos/receipts/:receiptNumber', row: 'retail ', to: '/api/v2/retail/receipts/{receiptNumber}' },
  { m: 'POST', from: '/pos/refunds', row: 'retail ', to: '/api/v2/retail/refunds', bs: {'items':[{'qty':'i','variation_id':'s'}],'method':'s','outlet_id':'s','reason':'s','receipt_number':'s'} },
  { m: 'GET', from: '/pos/search', row: 'retail ', to: '/api/v2/retail/counter/search', qs: ['limit','outlet_id','q'] },
  { m: 'GET', from: '/pos/session', row: 'retail ', to: '/api/v2/retail/sessions/open', qs: ['outlet_id'], reply: (d) => posMinor(d) },
  { m: 'GET', from: '/pos/session/:id/z-report', row: 'retail ', to: '/api/v2/retail/sessions/{id}/z-report' },
  { m: 'POST', from: '/pos/session/close', row: 'retail ', to: '/api/v2/retail/sessions/close', body: respelt({'counted_cash':'m','denominations':'j','notes':'s','outlet_id':'s'}, (b) => paiseInto(b, 'counted_cash')), reply: (d) => posMinor(d) }, // CloseSessionIn.counted_cash: Money (retail inputs.rs:142); PosSurface sends countedCashMinor
  { m: 'POST', from: '/pos/session/open', row: 'retail ', to: '/api/v2/retail/sessions', body: respelt({'opening_float':'m','outlet_id':'s'}, (b) => paiseInto(b, 'opening_float')) }, // OpenSessionIn.opening_float: Money, required (retail inputs.rs:133); PosSurface sends openingFloatMinor
  { m: 'POST', from: '/pos/session/z-close', row: 'retail ', to: '/api/v2/retail/sessions/close', bs: {'counted_cash':'m','denominations':'j','notes':'s','outlet_id':'s'} },
  { m: 'POST', from: '/refunds', row: 'commerce refunds.ts:182', to: '/api/v2/commerce/refunds', bs: {'adjusted_order_id':'s','adjusted_order_number':'s','amount':'m','method':'s','note':'s','order_id':'s','order_number':'s','reason':'s','reference':'s','source':'s','source_ref_id':'s'},
    // RefundCreatedView {refund, auto_approved, approval_request_id, approvers, message} (commerce views/refunds.rs:218) → the old
    // `{success, data: refund, …}` (api_redfit routes/refunds.ts:205); the Refunds panel opens `payload(res).id`.
    reply: (d) => (d && typeof d === 'object' && d.refund ? { success: true, ...d, data: refundRow(d.refund) } : d) },
  { m: 'GET', from: '/refunds', row: 'commerce refunds.ts:53', to: '/api/v2/commerce/refunds', qs: ['from','limit','offset','order_id','source','status','to'], reply: refundReply }, // Page of RefundView (views/refunds.rs:33): + amount_minor
  { m: 'GET', from: '/refunds/:id', row: 'commerce refunds.ts:166', to: '/api/v2/commerce/refunds/{id}', reply: refundReply }, // RefundView (views/refunds.rs:33): + amount_minor
  { m: 'POST', from: '/refunds/:id/approve', row: 'commerce refunds.ts:225', to: '/api/v2/commerce/refunds/{id}/approve', bs: {'reason':'s','self_approve':'b'} },
  { m: 'GET', from: '/refunds/:id/approvers', row: 'commerce refunds.ts:136', to: '/api/v2/commerce/refunds/{id}/approvers' },
  { m: 'GET', from: '/refunds/:id/dossier', row: 'commerce refunds.ts:122', to: '/api/v2/commerce/refunds/{id}/dossier', reply: (d) => d?.dossier ?? d }, // RefundDossierView {dossier} (commerce views/refunds.rs:247); RefundDossier reads d.approval / d.refund
  { m: 'POST', from: '/refunds/:id/execute', row: 'commerce refunds.ts:271', to: '/api/v2/commerce/refunds/{id}/execute', bs: {'reference':'s'} },
  { m: 'POST', from: '/refunds/:id/reject', row: 'commerce refunds.ts:249', to: '/api/v2/commerce/refunds/{id}/reject', bs: {'reason':'s','self_approve':'b'} },
  { m: 'PUT', from: '/refunds/config', row: 'commerce refunds.ts:85', method: 'PATCH', to: '/api/v2/commerce/refunds/config', body: respelt({'auto_approve_under':'m','auto_request_on_cancellation':'b','auto_request_on_credit_note':'b','auto_request_on_rto':'b','default_method':'s','require_second_approver':'b'}, (b) => paiseInto(b, 'auto_approve_under')) }, // ConfigBody.auto_approve_under: Money (commerce api/refunds/mod.rs:286); Refunds.tsx sends autoApproveUnderMinor
  { m: 'GET', from: '/returns', row: 'commerce returns.ts:271', to: '/api/v2/commerce/returns', qs: ['limit','offset','resolution','search','status'], reply: returnReply },
  { m: 'GET', from: '/returns/:id', row: 'commerce returns.ts:293', to: '/api/v2/commerce/returns/{id}', reply: returnReply },
  { m: 'PUT', from: '/returns/:id', row: 'commerce returns.ts:400', method: 'PATCH', to: '/api/v2/commerce/returns/{id}', bs: {'decision_note':'s','notes':'s','resolution':'s','status':'s'} },
  { m: 'POST', from: '/returns/:id/items/:itemId/disposition', row: 'commerce returns.ts:491', to: '/api/v2/commerce/returns/{id}/items/{itemId}/disposition', bs: {'disposition':'s','note':'s','photo_url':'s','qty':'i','reason_code':'s'} },
  { m: 'POST', from: '/returns/:id/pickup', row: 'commerce returns.ts:467', to: '/api/v2/commerce/returns/{id}/pickup', bs: {'awb':'s','courier_name':'s','expected_at':'s','mode':'s','note':'s','provider':'s','quality_check':'b','tracking_url':'s','warehouse_id':'s'} },
  { m: 'POST', from: '/returns/:id/receive', row: 'commerce returns.ts:441', to: '/api/v2/commerce/returns/{id}/receive', body: respelt({'lines':[{'batch_number':'s','exception_reason':'s','expiry_date':'s','item_id':'s','qty':'i'}],'warehouse_id':'s'}, (b) => {
    // ReceiveLine.qty: u32, required (commerce api/returns/mod.rs:802); ReceiveGoodsModal sends qtyReceived
    if (Array.isArray(b.lines)) b.lines = b.lines.map((l: any) => { if (!l || typeof l !== 'object') return l; const { qtyReceived, qty_received, ...rest } = l; return { ...rest, qty: l.qty ?? qtyReceived ?? qty_received }; });
  }) },
  { m: 'POST', from: '/returns/:id/settle', row: 'commerce returns.ts:519', to: '/api/v2/commerce/returns/{id}/settle', bs: {'line_ids':['s'],'note':'s','resolution':'s','settlement':'j'} },
  { m: 'GET', from: '/returns/meta', row: 'commerce returns.ts:87', to: '/api/v2/commerce/returns/meta' },

  // Checkout's settings layers (no old route; growcord-rs apps/checkout/core/src/api/saas/merchant.rs settings /
  // put_settings / put_org_settings, routes api/saas/mod.rs "E: the merchant console"). GET answers SettingsView
  // `{settings, sources, store_layer, merchant_layer}` (`sources` = leaf path → platform | merchant | store); each PUT
  // REPLACES its layer whole, so the screen sends the layer it read with its one change. Store layer: checkout.manage
  // (= settings.manage) on a store that is a Growcord Checkout workspace (else checkout.merchant_not_found). Organisation
  // layer: a Growcord ID organisation member holding the organisation's settings.manage (a store-only seat is refused by
  // kind); answers the merchant. Raw: the layers are written back as read, never camelCase-aliased.
  { m: 'GET', from: '/checkout/merchant/settings', row: 'checkout merchant.rs settings (products/checkout.md §5)', to: '/api/v2/checkout/merchant/settings', raw: true },
  { m: 'PUT', from: '/checkout/merchant/settings', row: 'checkout merchant.rs put_settings', to: '/api/v2/checkout/merchant/settings', raw: true },
  { m: 'PUT', from: '/checkout/merchant/settings/organisation', row: 'checkout merchant.rs put_org_settings', to: '/api/v2/checkout/merchant/settings/organisation', raw: true },
];

/* ── The store's money in: payment ledger, settlements, COD payouts (PAY-0 §2–§3; lane ADMIN-PAY-1) ───
 * EVERY path the Payments / Settlements / Payment analytics screens, the COD payouts page and the order
 * page's payment card call, in ONE place, so the orchestrator can re-point a route here and nowhere else.
 * The screens call these straight through `v2call` (src/pages/payments/data.ts); they are not legacy rows.
 *
 *   ledger  /api/v2/payments/store/…   (PAY-LEDGER-1; orders.read, recon run settings.manage)
 *   COD     /api/v2/ship/cod/…         (COD-1, additive under the existing ship logistics routes, which
 *                                        already serve /api/v2/ship/cod-remittances; COD-1 names the
 *                                        exact paths in its report — adjust them here)
 */
const STORE_PAY = '/api/v2/payments/store';
const SHIP = '/api/v2/ship';
const seg = (v: string) => encodeURIComponent(v);

export const STORE_PAYMENT_PATHS = {
  /** GET ?from&to&status&recon_status&method&source&q&cursor&limit → { items, next_cursor } */
  transactions: `${STORE_PAY}/transactions`,
  /** GET → Transaction + refunds[] + links { order_id, order_number, settlement_id } */
  transaction: (id: string) => `${STORE_PAY}/transactions/${seg(id)}`,
  /** GET → { items: Transaction[] } (the order page's payment card) */
  bySource: (source: string, sourceId: string) => `${STORE_PAY}/transactions/by-source/${seg(source)}/${seg(sourceId)}`,
  /** GET ?from&to&group=day|method|source → { totals, rows: [{ key, ...Totals }] } */
  summary: `${STORE_PAY}/summary`,
  /** GET ?from&to → { items: Settlement[] } */
  settlements: `${STORE_PAY}/settlements`,
  /** GET → Settlement + transactions[] */
  settlement: (settlementId: string) => `${STORE_PAY}/settlements/${seg(settlementId)}`,
  /** POST { from, to } → { checked, settled, orphans, mismatches } (settings.manage) */
  reconRun: `${STORE_PAY}/recon/run`,
} as const;

export const COD_PAYOUT_PATHS = {
  /** GET ?from&to → the COD summary (PAY-0 §3). */
  summary: `${SHIP}/cod/summary`,
  /** GET → one remittance with its lines (deductions, match status, order_id / order_number). */
  remittance: (id: string) => `${SHIP}/cod/remittances/${seg(id)}`,
  /** POST multipart: file (CSV) + courier + mapping (JSON) → the remittance with matched lines. */
  import: `${SHIP}/cod/remittances/import`,
  /**
   * NOT in PAY-0 §3 (CONTRACT QUESTION): the remittance line(s) of ONE order, for the order page's COD
   * line. Until COD-1 serves it the card answers 404 and simply leaves the line out.
   */
  byOrder: (orderId: string) => `${SHIP}/cod/orders/${seg(orderId)}/remittance`,
} as const;

/* ── Fee vendors in Books: who each gateway / courier is, held fees, gateway tax invoices (DEC-072/073) ──
 * The settings group and registry live under the commerce Settings Center mount (`/api/v2/commerce/settings/…`,
 * the same mount `areas/settings.ts` uses); a PATCH of `booksFeeVendors` replaces the whole value. */
const BOOKS = '/api/v2/books';
export const FEE_VENDOR_PATHS = {
  /** GET → { settings: { booksFeeVendors, glAutoPosting, … } } (settings.manage) */
  accountingGroup: '/api/v2/commerce/settings/groups/accounting',
  /** PATCH the COMPLETE { gatewayFeeVendor, courierVendor } (settings.manage); 400 names the problem. */
  feeVendorsSetting: '/api/v2/commerce/settings/registry/booksFeeVendors',
  /** GET ?limit → { items: [{ kind, source_id, provider, reference, amount, currency, reason }], count, notes[] } */
  held: `${BOOKS}/fee-vendors/held`,
  /** GET ?vendor_id&from&to → FeeTaxInvoice[]; POST attach (accounting.post) */
  taxInvoices: `${BOOKS}/fee-vendors/tax-invoices`,
  /** POST { reason } (accounting.post) */
  voidTaxInvoice: (id: string) => `${BOOKS}/fee-vendors/tax-invoices/${seg(id)}/void`,
  /** GET → { provider: 'all', data: [{ provider, label, configured, … }] } — the couriers this store has set up. */
  couriers: `${SHIP}/providers/status`,
} as const;

/* ── Payment requests: Growcord Payments owned intents per store (PAY-1 / DEC-074; apps/payments/docs/CONTRACT.md) ──
 * No store-readable route says whether the store's money runs through intents (the switch is console-only,
 * platform staff), so the admin shows no route badge. */
export const STORE_INTENT_PATHS = {
  /** GET ?from&to&status&source&q&cursor&limit → { items: Intent[], next_cursor } (orders.read) */
  intents: `${STORE_PAY}/intents`,
  /** GET → { intent, attempts[], refunds[], timeline[], links: { order_id, order_number, transaction_id } } */
  intent: (id: string) => `${STORE_PAY}/intents/${seg(id)}`,
} as const;
