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
import { v2call, v2try, asList, listMeta } from '../http';
import { toMoney } from '../money';

const O = '/api/v2/commerce';

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
  return {
    ...orderRow(order),
    ...rest,
    items: lines,
    order_id: order.order_number,
    shipping: order.shipping_cost,
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
      const rows = (Array.isArray(list) ? list : []).map(orderRow);
      return asList(rows, { ...listMeta(list), channels: ch?.channels, channelAccess: ch?.channel_access });
    },
  },
  { m: 'GET', from: '/orders/assignable-staff', row: 'commerce orders.ts:376', to: `${O}/assignable-staff` },
  { m: 'GET', from: '/orders/sales-claims/queue', row: 'commerce orders.ts:390', to: `${O}/sales-claims`, query: (c) => ({ state: c.query.state, limit: c.query.limit, offset: c.query.offset }) },
  { m: 'GET', from: '/orders/assignment-queue', row: 'commerce orders.ts:407', to: `${O}/order-queue`, query: (c) => ({ assigned_to: c.query.assignedTo, limit: c.query.limit, offset: c.query.offset }) },
  { m: 'GET', from: '/orders/export/csv', row: 'commerce orders.ts:1885', to: `${O}/orders/export`, query: (c) => ({ ids: Array.isArray(c.query.ids) ? c.query.ids.join(',') : c.query.ids, status: c.query.status, from: c.query.from, to: c.query.to }) },
  { m: 'GET', from: '/orders/export', row: 'commerce orders.ts:1885 (merged)', to: `${O}/orders/export`, query: (c) => ({ status: c.query.status, from: c.query.startDate ?? c.query.from, to: c.query.endDate ?? c.query.to }) },
  { m: 'GET', from: '/orders/export/erp/status', row: 'commerce orders.ts:1966', to: `${O}/erp-exports/status` },
  { m: 'GET', from: '/orders/export/erp/preview', row: 'commerce orders.ts:1995', to: `${O}/erp-exports/preview`, query: (c) => c.query },
  { m: 'POST', from: '/orders/export/erp', row: 'commerce orders.ts:2021', to: `${O}/erp-exports` },
  { m: 'DELETE', from: '/orders/export/erp/runs/:runId', row: 'commerce orders.ts:2058', method: 'POST', to: `${O}/erp-exports/runs/{runId}/forget`, body: () => ({}) },
  { m: 'POST', from: '/orders/manual/preview', row: 'commerce orders.ts:2693', to: `${O}/manual-orders/preview` },
  { m: 'POST', from: '/orders/manual', row: 'commerce orders.ts:2738', to: `${O}/manual-orders` },
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
  { m: 'GET', from: '/orders/:id/activity', row: 'commerce orders.ts:1433', to: `${O}/orders/{id}/activity`, query: (c) => ({ limit: c.query.limit }) },
  {
    m: 'POST', from: '/orders/:id/send-email', row: 'commerce orders.ts:1452', to: `${O}/orders/{id}/email`,
    body: (c) => ({ kind: c.body?.type ?? c.body?.kind, subject: c.body?.subject ?? null, content: c.body?.content ?? null }),
  },
  { m: 'POST', from: '/orders/:id/notify', row: 'commerce orders.ts:1492', to: `${O}/orders/{id}/notify`, body: (c) => ({ event: c.body?.event, channel: c.body?.channel ?? null, channels: c.body?.channels ?? null }) },
  { m: 'GET', from: '/orders/:id/communications', row: 'commerce orders.ts:1631', to: `${O}/orders/{id}/communications` },
  { m: 'GET', from: '/orders/:id/links', row: 'commerce orders.ts:1700', to: `${O}/orders/{id}/links` },
  {
    m: 'PUT', from: '/orders/:id/payment', row: 'commerce orders.ts:1777', method: 'POST', to: `${O}/orders/{id}/payment`,
    body: (c) => ({ payment_status: c.body?.paymentStatus ?? c.body?.payment_status, razorpay_payment_id: c.body?.razorpayPaymentId ?? null, razorpay_signature: c.body?.razorpaySignature ?? null, upi_payment_id: c.body?.upiPaymentId ?? null }),
  },
  {
    m: 'POST', from: '/orders/:id/cancel', row: 'commerce orders.ts:1791', to: `${O}/orders/{id}/cancel`,
    body: (c) => ({ reason: c.body?.reason ?? null, refund: c.body?.refund ? refundOf(c.body.refund) : null, customer_message: c.body?.customerMessage ?? null }),
  },
  { m: 'POST', from: '/orders/:id/items/preview', row: 'commerce orders.ts:2785', to: `${O}/orders/{id}/items/preview` },
  { m: 'PUT', from: '/orders/:id/items', row: 'commerce orders.ts:2820', method: 'PATCH', to: `${O}/orders/{id}/items` },
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
  { m: 'POST', from: '/orders/:id/cancel-items/preview', row: 'commerce orders.ts:3100', to: `${O}/orders/{id}/cancel-items/preview` },
  { m: 'POST', from: '/orders/:id/cancel-items', row: 'commerce orders.ts:3213', to: `${O}/orders/{id}/cancel-items` },
  { m: 'POST', from: '/orders/:id/waive-charge', row: 'commerce orders.ts:3547', to: `${O}/orders/{id}/waive-charge`, body: (c) => ({ charge: c.body?.charge, reason: c.body?.reason ?? null }) },
  {
    m: 'POST', from: '/orders/:id/record-payment', row: 'commerce orders.ts:3632', to: `${O}/orders/{id}/payments`,
    body: (c) => ({ amount: toMoney(c.body?.amount), method: c.body?.method ?? null, reference: c.body?.reference ?? null, notes: c.body?.notes ?? null }),
  },
  { m: 'GET', from: '/orders/:id/pay-link', row: 'commerce orders.ts:3703', to: `${O}/orders/{id}/pay-link` },
  { m: 'GET', from: '/orders/:id/fulfilment-guidance', row: 'commerce orders.ts:3780', to: `${O}/orders/{id}/fulfilment-guidance` },

  // The order page's shipping lookups (ship ROUTE_MAP 301/308).
  { m: 'GET', from: '/shipping/providers', row: 'ship — GET /api/v2/ship/providers', to: '/api/v2/ship/providers' },
  { m: 'GET', from: '/shipping/warehouses', row: 'ship — GET /api/v2/ship/warehouses', to: '/api/v2/ship/warehouses' },

  // Refunds the order page reads.
  { m: 'GET', from: '/refunds/refundable/:identifier', row: 'commerce refunds.ts:101 (binary path /refunds/refundable/{identifier})', to: `${O}/refunds/refundable/{identifier}` },
  { m: 'GET', from: '/refunds/config', row: 'commerce refunds.ts:79', to: `${O}/refunds/config` },
];
