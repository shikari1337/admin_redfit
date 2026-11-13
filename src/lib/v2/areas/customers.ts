/**
 * Customers (commerce ROUTE_MAP `customers.ts`). The v2 directory row carries the
 * person's contact as `contact {name, phone, email}` (the GLOBAL customer, read
 * through the directory port); the Customers table reads them flat.
 */
import type { V2Ctx, V2Route } from '../routes';
import { mapList } from '../http';

const C = '/api/v2/commerce';

function customerRow(c: any): any {
  if (!c || typeof c !== 'object') return c;
  const contact = c.contact ?? {};
  return {
    ...c,
    id: c.id ?? c.customer_id,
    name: c.name ?? contact.name ?? null,
    phone: c.phone ?? contact.phone ?? null,
    email: c.email ?? contact.email ?? null,
  };
}

/**
 * CustomerDetailView (commerce views/shoppers.rs:608): `contact.dial_code` and each
 * CustomerOrderView's `order_number` (views/shoppers.rs:580); UserDetail reads `dial_code`
 * and the old `order_id` flat.
 */
function customerDetail(c: any): any {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return c;
  return {
    ...c,
    dial_code: c.dial_code ?? c.contact?.dial_code ?? null,
    orders: Array.isArray(c.orders) ? c.orders.map((o: any) => (o && typeof o === 'object' ? { ...o, order_id: o.order_id ?? o.order_number } : o)) : c.orders,
  };
}

const pageOffset = (c: V2Ctx) => {
  if (c.query.offset !== undefined) return c.query.offset;
  const page = Number(c.query.page);
  const limit = Number(c.query.limit) || 20;
  return Number.isFinite(page) && page > 0 ? (page - 1) * limit : undefined;
};

export const CUSTOMER_ROUTES: V2Route[] = [
  {
    // Every filter runs on the server before the page is cut (lane MENU-1): kind b2b|retail,
    // activity ordered|never|once|repeat, one tag, the origin channel and the search.
    m: 'GET', from: '/customers', row: 'commerce customers.ts:30', to: `${C}/customers`,
    query: (c) => ({
      search: c.query.search, origin: c.query.origin, kind: c.query.kind, activity: c.query.activity,
      tag: c.query.tag, limit: c.query.limit, offset: pageOffset(c),
    }),
    reply: (d) => (Array.isArray(d) ? mapList(d, customerRow) : d),
  },
  // CustomerSummaryView (commerce views/shoppers.rs): counts, every sales channel with its count, tags in use.
  { m: 'GET', from: '/customers/summary', row: 'commerce lane MENU-1', to: `${C}/customers/summary` },
  // The store's own tags and note on its directory row (never the person's global contact).
  { m: 'PATCH', from: '/customers/:id', row: 'commerce customers.ts:410', to: `${C}/customers/{id}`, body: (c) => ({ tags: c.body?.tags, notes: c.body?.notes }) },
  { m: 'GET', from: '/customers/duplicates', row: 'commerce customers.ts:146', to: `${C}/customer-duplicates`, query: (c) => ({ status: c.query.status }) },
  { m: 'POST', from: '/customers/duplicates', row: 'commerce customers.ts:157', to: `${C}/customer-duplicates`, body: (c) => ({ customer_id_a: c.body?.customerIdA, customer_id_b: c.body?.customerIdB }) },
  { m: 'POST', from: '/customers/duplicates/:id/dismiss', row: 'commerce customers.ts:168', to: `${C}/customer-duplicates/{id}/dismiss`, body: () => ({}) },
  { m: 'POST', from: '/customers/duplicates/:id/merge', row: 'commerce customers.ts:187', to: `${C}/customer-duplicates/{id}/merge`, body: (c) => ({ winner_id: c.body?.winnerId }) },
  { m: 'GET', from: '/customers/:id', row: 'commerce customers.ts:228', to: `${C}/customers/{id}`, reply: (d) => customerDetail(customerRow(d?.customer ? { ...d.customer, ...d } : d)) },
  { m: 'POST', from: '/customers/:id/portal-token', row: 'commerce customers.ts:400', to: `${C}/customers/{id}/portal-token`, body: (c) => ({ label: c.body?.label ?? null, expires_at: c.body?.expiresAt ?? null }) },
];
