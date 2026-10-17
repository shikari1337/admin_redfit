/**
 * The carts desk (commerce ROUTE_MAP `carts.ts`): cart timings, export, one cart with its recovery log, schedule, team and links, notes, discount, charge waivers, clearing. The list itself is the dashboard's `/carts/admin` row (dashboard.ts), shaped by `cartList` here.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { mapList } from '../http';


/**
 * One v2 cart → the row the carts desk reads: the shopper as `user {name, email, phoneNumber}` (null for an
 * anonymous cart), the cart's public ref as `cartId`, the order it became as `orderId`, the shopper id as `userId`.
 */
export function cartRow(c: any): any {
  if (!c || typeof c !== 'object') return c;
  const sh = c.shopper;
  return {
    ...c,
    cart_id: c.cart_ref ?? c.cart_id,
    order_id: c.order_number ?? c.order_id ?? null,
    user_id: c.customer_id ?? null,
    user: sh ? { name: sh.name ?? null, email: sh.email ?? null, phoneNumber: sh.phone_info?.e164 ?? sh.phone ?? null } : null,
    // a line's price is `unit_price` (Money → rupees) in v2; the desk reads `price` / `lineTotal`
    items: Array.isArray(c.items) ? c.items.map((it: any) => {
      const price = it.price ?? it.unit_price ?? 0;
      return { ...it, price, lineTotal: it.line_total ?? it.lineTotal ?? Number((Number(price) * Number(it.quantity ?? 0)).toFixed(2)) };
    }) : c.items,
  };
}
export const cartList = (d: any) => (Array.isArray(d) ? mapList(d, cartRow) : d);

export const CART_ROUTES: V2Route[] = [
  { m: 'POST', from: '/carts/:p1/send-recovery', row: 'commerce — no row', gap: 'sending a cart-recovery message by hand has no v2 route (commerce ROUTE_MAP: no row; the hub sends through comms)' },
  { m: 'PUT', from: '/carts/admin/:id/charges', row: 'commerce carts.ts:633', method: 'POST', to: '/api/v2/commerce/carts/{id}/charges', bs: {'cod_waived':'b','shipping_waived':'b'} },
  { m: 'POST', from: '/carts/admin/:id/clear', row: 'commerce carts.ts:1066', to: '/api/v2/commerce/carts/{id}/clear', bs: {'reason':'s'} },
  { m: 'POST', from: '/carts/admin/:id/discount', row: 'commerce carts.ts:979', to: '/api/v2/commerce/carts/{id}/discount', bs: {'coupon_code':'s','expires_in_days':'i','max_discount':'i','mode':'s','type':'s','value':'i'} },
  { m: 'DELETE', from: '/carts/admin/:id/discount', row: 'commerce carts.ts:1037', method: 'POST', to: '/api/v2/commerce/carts/{id}/discount/remove', bs: 'j' },
  { m: 'GET', from: '/carts/admin/:id/links', row: 'commerce carts.ts:849', to: '/api/v2/commerce/carts/{id}/links' },
  { m: 'POST', from: '/carts/admin/:id/notes', row: 'commerce carts.ts:923', to: '/api/v2/commerce/carts/{id}/notes', bs: {'text':'s'} },
  { m: 'GET', from: '/carts/admin/:id/recovery-log', row: 'commerce carts.ts:899', to: '/api/v2/commerce/carts/{id}/recovery-log' },
  { m: 'GET', from: '/carts/admin/:id/schedule', row: 'commerce carts.ts:706', to: '/api/v2/commerce/carts/{id}/schedule' },
  { m: 'GET', from: '/carts/admin/:id/team', row: 'commerce carts.ts:801', to: '/api/v2/commerce/carts/{id}/team' },
  { m: 'GET', from: '/carts/admin/export', row: 'commerce carts.ts:373', to: '/api/v2/commerce/carts/export', qs: ['include_guests'] },
  { m: 'GET', from: '/carts/admin/:id', row: 'commerce carts.ts:456', to: '/api/v2/commerce/carts/{id}', reply: cartRow },
  { m: 'GET', from: '/carts/admin/recovery-steps', row: 'commerce — no row', gap: 'the cart-recovery message steps have no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'GET', from: '/carts/admin/whatsapp-templates', row: 'commerce — no row', gap: 'the cart-recovery WhatsApp template list has no v2 route (commerce ROUTE_MAP: no row; templates live in comms)' },
  { m: 'PUT', from: '/carts/admin/recovery-steps', row: 'commerce — no row', gap: 'saving the cart-recovery message steps has no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'GET', from: '/carts/admin/settings', row: 'commerce carts.ts:209', to: '/api/v2/commerce/cart-settings' },
  { m: 'PUT', from: '/carts/admin/settings', row: 'commerce carts.ts:216', method: 'PATCH', to: '/api/v2/commerce/cart-settings', bs: {'abandonment_minutes':'i','max_recovery_attempts':'i','recovery_automation_enabled':'b','recovery_delay_hours':'i','recovery_gap_hours':'i'} },
  { m: 'GET', from: '/carts/admin/whatsapp-templates/:p1', row: 'commerce — no row', gap: 'one cart-recovery WhatsApp template has no v2 route (commerce ROUTE_MAP: no row)' },
];
