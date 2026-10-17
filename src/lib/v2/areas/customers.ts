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

const pageOffset = (c: V2Ctx) => {
  if (c.query.offset !== undefined) return c.query.offset;
  const page = Number(c.query.page);
  const limit = Number(c.query.limit) || 20;
  return Number.isFinite(page) && page > 0 ? (page - 1) * limit : undefined;
};

export const CUSTOMER_ROUTES: V2Route[] = [
  {
    m: 'GET', from: '/customers', row: 'commerce customers.ts:30', to: `${C}/customers`,
    query: (c) => ({ search: c.query.search, origin: c.query.origin, limit: c.query.limit, offset: pageOffset(c) }),
    reply: (d) => (Array.isArray(d) ? mapList(d, customerRow) : d),
  },
  { m: 'GET', from: '/customers/duplicates', row: 'commerce customers.ts:146', to: `${C}/customer-duplicates`, query: (c) => ({ status: c.query.status }) },
  { m: 'POST', from: '/customers/duplicates', row: 'commerce customers.ts:157', to: `${C}/customer-duplicates`, body: (c) => ({ customer_id_a: c.body?.customerIdA, customer_id_b: c.body?.customerIdB }) },
  { m: 'POST', from: '/customers/duplicates/:id/dismiss', row: 'commerce customers.ts:168', to: `${C}/customer-duplicates/{id}/dismiss`, body: () => ({}) },
  { m: 'POST', from: '/customers/duplicates/:id/merge', row: 'commerce customers.ts:187', to: `${C}/customer-duplicates/{id}/merge`, body: (c) => ({ winner_id: c.body?.winnerId }) },
  { m: 'GET', from: '/customers/:id', row: 'commerce customers.ts:228', to: `${C}/customers/{id}`, reply: (d) => customerRow(d?.customer ? { ...d.customer, ...d } : d) },
  { m: 'POST', from: '/customers/:id/portal-token', row: 'commerce customers.ts:400', to: `${C}/customers/{id}/portal-token`, body: (c) => ({ label: c.body?.label ?? null, expires_at: c.body?.expiresAt ?? null }) },
];
