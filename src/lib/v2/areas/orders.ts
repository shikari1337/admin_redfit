/**
 * Orders (commerce ROUTE_MAP `orders.ts`, the desk; `refunds.ts`). Paths are
 * one-to-one except where the row renames them; writes take snake_case typed
 * inputs with Money for amounts.
 *
 * Shapes: the v2 list row carries the buyer as `buyer {name, phone, email}`; the
 * screens read it as the checkout `shippingAddress` snapshot. The v2 detail nests
 * the order under `order` beside `items`, `risk`, `shipments`, `fulfillment`, `sla`,
 * `abilities`, `refunds` …; the screens read one flat object (the old answer).
 * The human number is `order_number` in v2 and `order_id`/`orderId` on screen.
 */
import type { V2Ctx, V2Route } from '../routes';
import { v2call, v2try, v2http, normaliseEnvelope, asList, listMeta, mapList } from '../http';
import { toMoney, majorToMinor } from '../money';
import { shapeBody, pageAs } from '../shape';
import type { Spec } from '../shape';

const O = '/api/v2/commerce';

/* ── typed bodies (closed v2 schemas: an unknown field is a 400; amounts are Money, percents decimal strings) ── */

/** One order line: `ManualLineIn` / `EditLineIn` (commerce api/orders/manual.rs:50, items.rs:69). Rupees → Money. */
const LINE_IN: Spec = { product_id: 's', variation_id: 's', sku: 's', quantity: 'i', unit_price: 'm', discount_percent: 'd' };
/** `OrderAddressIn` (commerce api/orders/create.rs:67). */
const ADDRESS_IN: Spec = { full_name: 's', mobile: 's', dial_code: 's', email: 's', line1: 's', line2: 's', landmark: 's', city: 's', district: 's', state: 's', pincode: 's', country: 's', company: 's', gstin: 's', latitude: 'j', longitude: 'j' };
/** `ManualBody` (commerce api/orders/manual.rs:64) — preview and create take the same body. */
const MANUAL_ORDER: Spec = { items: [LINE_IN], shipping_address: ADDRESS_IN, billing_address: ADDRESS_IN, customer_id: 's', payment_method: 's', shipping_cost: 'm', discount: 'm', discount_reason: 's', notes: 's', hold: 'b', gstin: 's', sales_agent_id: 's', sales_channel: 's', channel_id: 's', commission_tier: 's', credit_override: 'b', credit_override_reason: 's' };
/** `EditItemsBody` (commerce api/orders/items.rs:83) — the edit preview and the save. */
const EDIT_ITEMS: Spec = { items: [LINE_IN], discount: 'm', discount_reason: 's', shipping_cost: 'm' };
/** `CancelItemsBody` (commerce api/orders/cancel_items.rs:193) + `RefundChoice` (status.rs:554). */
const CANCEL_ITEMS: Spec = { lines: [{ sku: 's', variation_id: 's', qty: 'i', reason: 's' }], reason: 's', refund: { mode: 's', amount: 'm', reference: 's', adjusted_order_number: 's', reason: 's' } };
/** `ExportBody` (commerce api/order_desk/export.rs:322). */
const ERP_EXPORT: Spec = { mode: 's', from: 's', to: 's', exclude_cancelled: 'b', config: { website_channel_code: 's', admin_channel_code: 's', order_number_style: 's' } };

/** The desk's address (checkout snapshot keys: `fullName`, `mobileNumber`, `address` …) → `OrderAddressIn`. `noAccount` has no v2 field (Node ignored it too). */
function addressIn(a: any): any {
  if (!a || typeof a !== 'object') return a ?? undefined;
  return {
    full_name: a.full_name ?? a.fullName ?? a.name,
    mobile: a.mobile ?? a.mobileNumber ?? a.mobile_number ?? a.phone,
    dial_code: a.dial_code ?? a.dialCode,
    email: a.email,
    line1: a.line1 ?? a.address ?? a.addressLine1 ?? a.address_line1,
    line2: a.line2 ?? a.addressLine2 ?? a.address_line2,
    landmark: a.landmark,
    city: a.city,
    district: a.district,
    state: a.state,
    pincode: a.pincode ?? a.postal_code ?? a.zip,
    country: a.country ?? a.countryCode,
    company: a.company,
    gstin: a.gstin,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

/** The manual-order / POS body (camelCase, rupees) → `ManualBody`. The POS sends `note`; v2 names it `notes`. */
function manualOrderBody(c: V2Ctx): unknown {
  const { shippingAddress, shipping_address, billingAddress, billing_address, note, ...rest } = c.body ?? {};
  return shapeBody(MANUAL_ORDER)({
    ...c,
    body: { ...rest, shipping_address: addressIn(shipping_address ?? shippingAddress), billing_address: addressIn(billing_address ?? billingAddress), notes: rest.notes ?? note },
  });
}

/** `OrderMoneyStepView {order, result{lines, pay_link, commission}}` (commerce views/orders.rs:134) → the flat order the desk (`orderId`, `payLink`, `total`) and the POS (`id`, `total`) read. */
function createdOrder(d: any): any {
  if (!d || typeof d !== 'object' || !d.order) return d;
  const r = d.result ?? {};
  // `replayed: true` = the key's first order, answered again (200): a success, never a second order.
  return { ...orderRow(d.order), pay_link: r.pay_link ?? null, lines: r.lines, commission: r.commission, replayed: r.replayed === true };
}

/**
 * The create, with the screen's per-submit `Idempotency-Key` forwarded (claimed in the order's own unit of work,
 * commerce api/orders/manual.rs:312-434). A 409 is either the same key still in flight or the key reused with
 * another body; both get words a person can act on.
 */
async function createManualOrder(body: unknown, headers: Record<string, string> | undefined): Promise<any> {
  try {
    const res = await v2http.request({ method: 'POST', url: `${O}/manual-orders`, data: body, headers });
    return normaliseEnvelope(res.data);
  } catch (e: any) {
    const data = e?.response?.data;
    if (e?.response?.status === 409 && data && typeof data === 'object') {
      const inFlight = /in progress/i.test(String(data.message ?? ''));
      e.response.data = {
        ...data,
        message: inFlight
          ? 'This order is still being created. Wait a moment, then look in the orders list before submitting again.'
          : 'This order was already submitted with different details. Look in the orders list before keying it in again.',
      };
    }
    throw e;
  }
}

/**
 * A double click on "Create order" / "Charge" must not key in two orders. Each submit sends its own idempotency
 * key (so the server replays a retried submit); on top, while one create is in flight an IDENTICAL body is answered
 * by that same call, so two quick submits (two keys) still make one order.
 */
const inFlight = new Map<string, Promise<any>>();
function once(key: string, send: () => Promise<any>): Promise<any> {
  const hit = inFlight.get(key);
  if (hit) return hit;
  const p = send().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** base64url (no padding) → bytes (an ArrayBuffer-backed view, so it is a BlobPart under TS 5.9's lib). */
function base64urlBytes(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** One list row → the legacy row the Orders table reads. */
export function orderRow(o: any): any {
  if (!o || typeof o !== 'object') return o;
  const buyer = o.buyer ?? {};
  return {
    ...o,
    order_id: o.order_number ?? o.order_id,
    shipping_address: o.shipping_address ?? { fullName: buyer.name ?? null, mobileNumber: buyer.phone ?? null, email: buyer.email ?? null },
    fulfillment_state: o.fulfilment,
  };
}

/** The v2 detail → the one flat order object the order page reads. */
export function orderDetail(d: any): any {
  if (!d || typeof d !== 'object' || !d.order) return d;
  const { order, items, ...rest } = d;
  const lines = Array.isArray(items) ? items.map((it: any) => ({
    ...it,
    catalog_brand: it.catalog_brand ?? it.brand ?? null,
    catalog_hsn: it.catalog_hsn ?? it.hsn ?? null,
    catalog_tax_rate: it.catalog_tax_rate ?? (it.tax_rate !== undefined && it.tax_rate !== null ? Number(it.tax_rate) : null),
    catalog_image: it.catalog_image ?? it.image ?? null,
    name: it.name ?? it.product_name,
  })) : [];
  // The legacy order columns Node stamped from the parcel it booked last (`orders.shipment_id` /
  // `shipping_provider` / `shiprocket_awb` / `delhivery_waybill`, api_redfit shippingProviderService.ts:86,589-603)
  // live on v2's `shipments[]` (live parcels, oldest first: commerce ports.rs:609; `awb` = provider_data.awb,
  // views/order_desk.rs:305). `user_id` is `created_by` in v2 (views/order_desk.rs:164).
  const ships: any[] = Array.isArray(rest.shipments) ? rest.shipments : [];
  const last = ships.length ? ships[ships.length - 1] : null;
  const provider = last?.shipping_provider ?? null;
  return {
    ...orderRow(order),
    ...rest,
    items: lines,
    order_id: order.order_number,
    shipping: order.shipping_cost,
    user_id: order.user_id ?? order.created_by ?? null,
    shipment_id: last?.id ?? null,
    shipping_provider: provider,
    shiprocket_awb: provider === 'shiprocket' ? last?.awb ?? null : null,
    delhivery_waybill: provider === 'delhivery' ? last?.awb ?? null : null,
    shiprocket_pickup_scheduled_date: provider === 'shiprocket' ? last?.pickup_scheduled ?? null : null,
  };
}

/** Legacy refund choice (`OrderCancelRefund`) → the v2 typed refund. */
function refundOf(r: any): any {
  if (!r || typeof r !== 'object') return r ?? undefined;
  return {
    mode: r.mode ?? null,
    reference: r.reference ?? null,
    reason: r.reason ?? null,
    adjusted_order_number: r.adjustedOrderNumber ?? r.adjusted_order_number ?? null,
    amount: r.amount !== undefined && r.amount !== null ? toMoney(r.amount) : null,
  };
}

const listQuery = (c: V2Ctx) => ({
  status: c.query.status,
  payment_status: c.query.payment_status ?? c.query.paymentStatus,
  order_type: c.query.order_type ?? c.query.orderType,
  channel: c.query.channel,
  search: c.query.search ?? c.query.mobileNumber,
  from: c.query.from ?? c.query.startDate,
  to: c.query.to ?? c.query.endDate,
  limit: c.query.limit,
  offset: c.query.offset ?? (c.query.page ? (Number(c.query.page) - 1) * (Number(c.query.limit) || 20) : undefined),
});

export const ORDER_ROUTES: V2Route[] = [
  {
    // The list + the channel picker the old envelope carried beside it (`channels`, `channelAccess`)
    // — v2 serves those at GET /sales-channels (orders.ts:9), asked once with the page.
    m: 'GET', from: '/orders', row: 'commerce orders.ts:269 + :9',
    run: async (c) => {
      const q: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(listQuery(c))) if (v !== undefined && v !== null && v !== '') q[k] = v;
      const [list, ch] = await Promise.all([
        v2call<any[]>('GET', `${O}/orders`, { params: q }),
        v2try<any>('GET', `${O}/sales-channels`, null),
      ]);
      const asked = Number(q.limit);
      const mapped = (Array.isArray(list) ? list : []).map(orderRow);
      // The screen asked for N. Never draw more than N, even if a page came back longer.
      const rows = Number.isFinite(asked) && asked > 0 ? mapped.slice(0, asked) : mapped;
      return asList(rows, { ...listMeta(list), channels: ch?.channels, channelAccess: ch?.channel_access });
    },
  },
  { m: 'GET', from: '/orders/assignable-staff', row: 'commerce orders.ts:376', to: `${O}/assignable-staff` },
  { m: 'GET', from: '/orders/sales-claims/queue', row: 'commerce orders.ts:390', to: `${O}/sales-claims`, query: (c) => ({ state: c.query.state, limit: c.query.limit, offset: c.query.offset }), reply: (d) => (Array.isArray(d) ? pageAs('items')(mapList(d, (r: any) => ({ ...r, order_id: r.order_id ?? r.order_number }))) : d) }, // ClaimQueueRowView {order_number …} (commerce views/order_desk.rs:760); ordersAPI.salesClaimQueue reads {items, total}, SalesTeam reads o.order_id
  { m: 'GET', from: '/orders/assignment-queue', row: 'commerce orders.ts:407', to: `${O}/order-queue`, query: (c) => ({ assigned_to: c.query.assignedTo, limit: c.query.limit, offset: c.query.offset }) },
  { m: 'GET', from: '/orders/export/csv', row: 'commerce orders.ts:1885', to: `${O}/orders/export`, query: (c) => ({ ids: Array.isArray(c.query.ids) ? c.query.ids.join(',') : c.query.ids, status: c.query.status, from: c.query.from, to: c.query.to }) },
  { m: 'GET', from: '/orders/export', row: 'commerce orders.ts:1885 (merged)', to: `${O}/orders/export`, query: (c) => ({ status: c.query.status, from: c.query.startDate ?? c.query.from, to: c.query.endDate ?? c.query.to }) },
  { m: 'GET', from: '/orders/export/erp/status', row: 'commerce orders.ts:1966', to: `${O}/erp-exports/status` },
  // PreviewQuery (commerce api/order_desk/export.rs:260) is closed: `excludeCancelled` → `exclude_cancelled`.
  { m: 'GET', from: '/orders/export/erp/preview', row: 'commerce orders.ts:1995', to: `${O}/erp-exports/preview`, query: (c) => ({ mode: c.query.mode, from: c.query.from, to: c.query.to, exclude_cancelled: c.query.exclude_cancelled ?? c.query.excludeCancelled }) },
  {
    // ErpExportView {run, file_name, content_type, content_base64url} (commerce api/order_desk/export.rs:592): the
    // workbook travels inside the JSON. The caller (responseType blob) reads the bytes, content-disposition, x-export-run.
    m: 'POST', from: '/orders/export/erp', row: 'commerce orders.ts:2021',
    run: async (c) => {
      const d = await v2call<any>('POST', `${O}/erp-exports`, { data: shapeBody(ERP_EXPORT)(c) });
      const type = d?.content_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const name = String(d?.file_name || 'Order_Items_Export.xlsx').replace(/"/g, '');
      return {
        __v2raw: true,
        data: new Blob([base64urlBytes(String(d?.content_base64url ?? ''))], { type }),
        headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}"`, 'x-export-run': encodeURIComponent(JSON.stringify(d?.run ?? null)) },
      };
    },
  },
  { m: 'DELETE', from: '/orders/export/erp/runs/:runId', row: 'commerce orders.ts:2058', method: 'POST', to: `${O}/erp-exports/runs/{runId}/forget`, body: () => ({}) },
  { m: 'POST', from: '/orders/manual/preview', row: 'commerce orders.ts:2693', to: `${O}/manual-orders/preview`, body: manualOrderBody, reply: (d) => d?.preview ?? d }, // OrderPreviewView {preview} (commerce views/orders.rs:143); the screen reads the totals flat
  {
    // ManualOrderCreate.tsx and the POS charge (pos/PosSurface.tsx) — the per-submit key forwarded; one in-flight create per identical body.
    m: 'POST', from: '/orders/manual', row: 'commerce orders.ts:2738 (key: api/orders/common.rs:100)', reply: createdOrder,
    run: (c) => {
      const body = manualOrderBody(c);
      return once(JSON.stringify(body), () => createManualOrder(body, c.headers));
    },
  },
  { m: 'GET', from: '/orders/manual/lines/sheet-columns', row: 'commerce orders.ts:2587', to: `${O}/manual-orders/sheet-columns` },
  { m: 'POST', from: '/orders/manual/lines/from-sheet', row: 'commerce orders.ts:2592', to: `${O}/manual-orders/lines-from-sheet` },

  { m: 'GET', from: '/orders/:id', row: 'commerce orders.ts:418 (+ /orders/order/:id merged)', to: `${O}/orders/{id}`, reply: orderDetail },
  { m: 'GET', from: '/orders/order/:id', row: 'commerce orders.ts:339 (merged into GET /orders/{id})', to: `${O}/orders/{id}`, reply: orderDetail },
  { m: 'PUT', from: '/orders/:id', row: 'commerce orders.ts:1871', method: 'PATCH', to: `${O}/orders/{id}` },
  {
    m: 'PUT', from: '/orders/:id/status', row: 'commerce orders.ts:920', method: 'POST', to: `${O}/orders/{id}/status`,
    body: (c) => ({ status: c.body?.status, notes: c.body?.notes ?? null, refund: c.body?.refund ? refundOf(c.body.refund) : null, customer_message: c.body?.customerMessage ?? c.body?.customer_message ?? null, location: c.body?.location ?? null }),
  },
  { m: 'PUT', from: '/orders/:id/flag', row: 'commerce orders.ts:1182', method: 'POST', to: `${O}/orders/{id}/flag`, body: (c) => ({ flagged: c.body?.flagged ?? null, reason: c.body?.reason ?? null }) },
  { m: 'POST', from: '/orders/:id/notes', row: 'commerce orders.ts:1213', to: `${O}/orders/{id}/notes`, body: (c) => ({ text: c.body?.text ?? '' }) },
  { m: 'PUT', from: '/orders/:id/assign', row: 'commerce orders.ts:1239', method: 'POST', to: `${O}/orders/{id}/assign`, body: (c) => ({ assigned_to: c.body?.assignedTo ?? c.body?.assigned_to ?? null }) },
  { m: 'PUT', from: '/orders/:id/sales-agent', row: 'commerce orders.ts:1273', method: 'POST', to: `${O}/orders/{id}/sales-agent`, body: (c) => ({ sales_agent_id: c.body?.salesAgentId ?? c.body?.sales_agent_id ?? null }) },
  { m: 'GET', from: '/orders/:id/claims', row: 'commerce orders.ts:1322', to: `${O}/orders/{id}/claims` },
  { m: 'POST', from: '/orders/:id/claims', row: 'commerce orders.ts:1340', to: `${O}/orders/{id}/claims` },
  { m: 'DELETE', from: '/orders/:id/claims/mine', row: 'commerce orders.ts:1374', method: 'POST', to: `${O}/orders/{id}/claims/withdraw`, body: () => ({}) },
  { m: 'POST', from: '/orders/:id/claims/:claimId/decide', row: 'commerce orders.ts:1403', to: `${O}/orders/{id}/claims/{claimId}/decide` },
  { m: 'GET', from: '/orders/:id/activity', row: 'commerce orders.ts:1433', to: `${O}/orders/{id}/activity`, query: (c) => ({ limit: c.query.limit }), reply: pageAs('items') }, // a Page of ActivityView rows (commerce views/order_desk.rs:633); ordersAPI.activity reads response.data.items (OrderTeamCard "Staff activity")
  {
    m: 'POST', from: '/orders/:id/send-email', row: 'commerce orders.ts:1452', to: `${O}/orders/{id}/email`,
    body: (c) => ({ kind: c.body?.type ?? c.body?.kind, subject: c.body?.subject ?? null, content: c.body?.content ?? null }),
  },
  { m: 'POST', from: '/orders/:id/notify', row: 'commerce orders.ts:1492', to: `${O}/orders/{id}/notify`, body: (c) => ({ event: c.body?.event, channel: c.body?.channel ?? null, channels: c.body?.channels ?? null }) },
  { m: 'GET', from: '/orders/:id/communications', row: 'commerce orders.ts:1631', to: `${O}/orders/{id}/communications` },
  // OrderLinkView {key, label, purpose, long_url, url, shortened} (commerce views/order_desk.rs:874) is flat; OrderLinksCard reads the
  // short link as `group.link {url, longUrl, shortened, fits}`. `fits` = the 30-character DLT slot (api_redfit outboundLinks.ts:387, urlShortener.ts:127).
  { m: 'GET', from: '/orders/:id/links', row: 'commerce orders.ts:1700', to: `${O}/orders/{id}/links`, reply: (d) => (d && Array.isArray(d.links) ? { ...d, links: d.links.map((l: any) => (l && typeof l === 'object' && !l.link ? { ...l, link: { url: l.url, long_url: l.long_url, shortened: !!l.shortened, fits: String(l.url ?? '').length <= 30 } } : l)) } : d) },
  {
    m: 'PUT', from: '/orders/:id/payment', row: 'commerce orders.ts:1777', method: 'POST', to: `${O}/orders/{id}/payment`,
    body: (c) => ({ payment_status: c.body?.paymentStatus ?? c.body?.payment_status, razorpay_payment_id: c.body?.razorpayPaymentId ?? null, razorpay_signature: c.body?.razorpaySignature ?? null, upi_payment_id: c.body?.upiPaymentId ?? null }),
  },
  {
    m: 'POST', from: '/orders/:id/cancel', row: 'commerce orders.ts:1791', to: `${O}/orders/{id}/cancel`,
    body: (c) => ({ reason: c.body?.reason ?? null, refund: c.body?.refund ? refundOf(c.body.refund) : null, customer_message: c.body?.customerMessage ?? null }),
  },
  { m: 'POST', from: '/orders/:id/items/preview', row: 'commerce orders.ts:2785', to: `${O}/orders/{id}/items/preview`, bs: EDIT_ITEMS, reply: (d) => d?.preview ?? d }, // OrderPreviewView {preview} (commerce views/orders.rs:143); the screen reads the totals flat
  { m: 'PUT', from: '/orders/:id/items', row: 'commerce orders.ts:2820', method: 'PATCH', to: `${O}/orders/{id}/items`, bs: EDIT_ITEMS },
  {
    m: 'POST', from: '/orders/:id/apply-discount', row: 'commerce orders.ts:2904', to: `${O}/orders/{id}/discount`,
    body: (c) => {
      const b = c.body ?? {};
      return {
        mode: b.mode,
        percent: b.mode === 'percent' && b.value !== undefined ? String(b.value) : null,
        amount: b.mode === 'amount' && b.value !== undefined ? toMoney(b.value) : null,
        coupon_code: b.couponCode ?? null,
        reason: b.reason ?? null,
        customer_label: b.customerLabel ?? null,
      };
    },
  },
  { m: 'POST', from: '/orders/:id/cancel-items/preview', row: 'commerce orders.ts:3100', to: `${O}/orders/{id}/cancel-items/preview`, bs: CANCEL_ITEMS, reply: (d) => d?.preview ?? d }, // OrderPreviewView {preview} (commerce views/orders.rs:143); the screen reads the totals flat
  { m: 'POST', from: '/orders/:id/cancel-items', row: 'commerce orders.ts:3213', to: `${O}/orders/{id}/cancel-items`, bs: CANCEL_ITEMS },
  { m: 'POST', from: '/orders/:id/waive-charge', row: 'commerce orders.ts:3547', to: `${O}/orders/{id}/waive-charge`, body: (c) => ({ charge: c.body?.charge, reason: c.body?.reason ?? null }) },
  {
    m: 'POST', from: '/orders/:id/record-payment', row: 'commerce orders.ts:3632', to: `${O}/orders/{id}/payments`,
    body: (c) => ({ amount: toMoney(c.body?.amount), method: c.body?.method ?? null, reference: c.body?.reference ?? null, notes: c.body?.notes ?? null }),
  },
  { m: 'GET', from: '/orders/:id/pay-link', row: 'commerce orders.ts:3703', to: `${O}/orders/{id}/pay-link` },
  { m: 'GET', from: '/orders/:id/fulfilment-guidance', row: 'commerce orders.ts:3780', to: `${O}/orders/{id}/fulfilment-guidance`, reply: (d) => d?.guidance ?? d }, // FulfilmentGuidanceView {guidance} (commerce views/order_desk.rs:879); FulfilmentCard reads data.withheld

  // The order page's shipping lookups (ship ROUTE_MAP 301/308).
  { m: 'GET', from: '/shipping/providers', row: 'ship — GET /api/v2/ship/providers', to: '/api/v2/ship/providers' },
  { m: 'GET', from: '/shipping/warehouses', row: 'ship — GET /api/v2/ship/warehouses', to: '/api/v2/ship/warehouses' },

  // Refunds the order page reads.
  // RefundableView {paid, refunded, in_flight, refundable: Money} (commerce views/refunds.rs:156) → rupees; CancelOrderModal,
  // RaiseRefundModal and the Refunds panel read the paise twins (`refundableMinor` …, the old answer).
  { m: 'GET', from: '/refunds/refundable/:identifier', row: 'commerce refunds.ts:101 (binary path /refunds/refundable/{identifier})', to: `${O}/refunds/refundable/{identifier}`,
    reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, paid_minor: d.paid_minor ?? majorToMinor(d.paid), refunded_minor: d.refunded_minor ?? majorToMinor(d.refunded), in_flight_minor: d.in_flight_minor ?? majorToMinor(d.in_flight), refundable_minor: d.refundable_minor ?? majorToMinor(d.refundable) } : d) },
  // RefundConfigView {auto_approve_under: Money} (commerce views/refunds.rs:120); CancelOrderModal reads `autoApproveUnderMinor` (paise).
  { m: 'GET', from: '/refunds/config', row: 'commerce refunds.ts:79', to: `${O}/refunds/config`,
    reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, auto_approve_under_minor: d.auto_approve_under_minor ?? majorToMinor(d.auto_approve_under) } : d) },
];
