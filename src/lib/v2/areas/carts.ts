/**
 * The carts desk (commerce ROUTE_MAP `carts.ts`): cart timings, export, one cart with its recovery log, schedule, team and links, notes, discount, charge waivers, clearing. The list itself is the dashboard's `/carts/admin` row (dashboard.ts), shaped by `cartList` here.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { mapList, v2call } from '../http';

/**
 * Retain's recovery templates (`GET /api/v2/retain/carts/whatsapp-templates` → `{templates: [{template_key, name,
 * provider_ref, language, approval_status, source, is_active, variables}]}`, MSG-4 `api/carts.rs`) → the summary rows
 * the Cart Recovery Automation screen picks from (`{id, name, language, category, status, paramCount}`). Only approved,
 * active templates are offered: a step cannot send on one Meta has not approved (the old route listed approved only).
 */
export function recoveryTemplates(d: any): any[] {
  const list: any[] = Array.isArray(d?.templates) ? d.templates : Array.isArray(d) ? d : [];
  return list
    .filter((t) => String(t?.approval_status ?? '').toLowerCase() === 'approved' && t?.is_active !== false)
    .map((t) => ({
      id: String(t?.template_key ?? t?.provider_ref ?? ''),
      name: String(t?.provider_ref || t?.name || t?.template_key || ''),
      language: String(t?.language || 'en_US'),
      category: undefined,
      status: String(t?.approval_status ?? ''),
      paramCount: Array.isArray(t?.variables) ? t.variables.length : 0,
      variables: Array.isArray(t?.variables) ? t.variables : [],
      source: t?.source ?? null,
    }))
    .filter((t) => t.id);
}


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
    // a line's price is `unit_price` (Money → rupees) in v2; the desk reads `price` / `lineTotal`.
    // CartDeskLineView is snake_case (commerce views/shoppers.rs:675) and `items` gets no camel aliases
    // (services/api.ts OPAQUE_VALUE_KEYS), so the camel names the cart screens read are set here.
    items: Array.isArray(c.items) ? c.items.map((it: any) => {
      const price = it.price ?? it.unit_price ?? 0;
      return {
        ...it, price, lineTotal: it.line_total ?? it.lineTotal ?? Number((Number(price) * Number(it.quantity ?? 0)).toFixed(2)),
        productId: it.productId ?? it.product_id ?? null, variationId: it.variationId ?? it.variation_id ?? null,
        productName: it.productName ?? it.product_name ?? null, skuInferred: it.skuInferred ?? it.sku_inferred ?? false,
      };
    }) : c.items,
    // v2 lifts `metadata.admin_notes` to `admin_notes` (views/shoppers.rs:837); AbandonedCartDetail reads cart.metadata.admin_notes
    ...(c.admin_notes !== undefined && !c.metadata ? { metadata: { admin_notes: Array.isArray(c.admin_notes) ? c.admin_notes : [] } } : {}),
  };
}
export const cartList = (d: any) => (Array.isArray(d) ? mapList(d, cartRow) : d);

/**
 * CartSettingsView {current, defaults} (commerce views/shoppers.rs:667; timings are decimal strings) → the old flat
 * `{...current, defaults}` (api_redfit routes/carts.ts:212) AbandonedCarts reads (`recoveryAutomationEnabled`, `abandonmentMinutes`).
 */
function cartSettings(d: any): any {
  if (!d || typeof d !== 'object' || Array.isArray(d) || !d.current || typeof d.current !== 'object') return d;
  const cur: Record<string, unknown> = { ...d.current };
  for (const k of ['abandonment_minutes', 'recovery_delay_hours', 'max_recovery_attempts', 'recovery_gap_hours']) {
    const v = cur[k];
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) cur[k] = Number(v);
  }
  return { ...d, ...cur };
}

export const CART_ROUTES: V2Route[] = [
  // MSG-0 §5: cart recovery is the Retain app's (MSG-4 `apps/retain/core/src/api/carts.rs`, reconciled by ADMIN-MSG-2).
  // Until deployed these answer 404 and the page's own error state shows.
  // Send: body `{channel?, step?}`; answer `{cart_id, ok, step_key, channels: [{channel, sent, error}], reason}` →
  // the `{data: {ok, channel, reason}}` the cart screens read (they read `res.data`).
  {
    m: 'POST', from: '/carts/:id/send-recovery', row: 'retain carts.rs — POST /carts/{cart_id}/send-recovery (MSG-4)', to: '/api/v2/retain/carts/{id}/send-recovery',
    body: (c) => ({ ...(c.body?.channel ? { channel: c.body.channel } : {}), ...(c.body?.step ? { step: c.body.step } : {}) }),
    reply: (d: any, c) => {
      const chans: any[] = Array.isArray(d?.channels) ? d.channels : [];
      const failed = chans.find((x) => x && x.sent === false);
      const sent = chans.find((x) => x && x.sent);
      return {
        ...d,
        data: {
          ok: !!d?.ok,
          channel: c.body?.channel ?? sent?.channel ?? chans[0]?.channel ?? '',
          step: d?.step_key ?? null,
          reason: d?.ok ? undefined : (d?.reason || failed?.error || 'Nothing was sent.'),
        },
      };
    },
  },
  { m: 'PUT', from: '/carts/admin/:id/charges', row: 'commerce carts.ts:633', method: 'POST', to: '/api/v2/commerce/carts/{id}/charges', bs: {'cod_waived':'b','shipping_waived':'b'} },
  { m: 'POST', from: '/carts/admin/:id/clear', row: 'commerce carts.ts:1066', to: '/api/v2/commerce/carts/{id}/clear', bs: {'reason':'s'} },
  { m: 'POST', from: '/carts/admin/:id/discount', row: 'commerce carts.ts:979', to: '/api/v2/commerce/carts/{id}/discount', bs: {'coupon_code':'s','expires_in_days':'i','max_discount':'i','mode':'s','type':'s','value':'i'} },
  { m: 'DELETE', from: '/carts/admin/:id/discount', row: 'commerce carts.ts:1037', method: 'POST', to: '/api/v2/commerce/carts/{id}/discount/remove', bs: 'j' },
  { m: 'GET', from: '/carts/admin/:id/links', row: 'commerce carts.ts:849', to: '/api/v2/commerce/carts/{id}/links' },
  { m: 'POST', from: '/carts/admin/:id/notes', row: 'commerce carts.ts:923', to: '/api/v2/commerce/carts/{id}/notes', bs: {'text':'s'} },
  { m: 'GET', from: '/carts/admin/:id/recovery-log', row: 'commerce carts.ts:899', to: '/api/v2/commerce/carts/{id}/recovery-log' },
  { m: 'GET', from: '/carts/admin/:id/schedule', row: 'commerce carts.ts:706', to: '/api/v2/commerce/carts/{id}/schedule' },
  { m: 'GET', from: '/carts/admin/:id/team', row: 'commerce carts.ts:801', to: '/api/v2/commerce/carts/{id}/team' },
  { m: 'GET', from: '/carts/admin/export', row: 'commerce carts.ts:373', to: '/api/v2/commerce/carts/export', qs: ['include_guests'], reply: cartList }, // CartDeskView rows (commerce views/shoppers.rs:765); the CSV reads cartId / user.{name,phoneNumber,email}
  { m: 'GET', from: '/carts/admin/:id', row: 'commerce carts.ts:456', to: '/api/v2/commerce/carts/{id}', reply: cartRow },
  { m: 'GET', from: '/carts/admin/recovery-steps', row: 'retain carts.rs — GET /carts/recovery-steps (MSG-4)', to: '/api/v2/retain/carts/recovery-steps' },
  { m: 'GET', from: '/carts/admin/whatsapp-templates', row: 'retain carts.rs — GET /carts/whatsapp-templates (MSG-4)', to: '/api/v2/retain/carts/whatsapp-templates', reply: recoveryTemplates },
  { m: 'PUT', from: '/carts/admin/recovery-steps', row: 'retain carts.rs — PUT /carts/recovery-steps (MSG-4)', to: '/api/v2/retain/carts/recovery-steps', body: (c) => ({ steps: c.body?.steps ?? [] }) },
  { m: 'GET', from: '/carts/admin/settings', row: 'commerce carts.ts:209', to: '/api/v2/commerce/cart-settings', reply: (d) => cartSettings(d) },
  { m: 'PUT', from: '/carts/admin/settings', row: 'commerce carts.ts:216', method: 'PATCH', to: '/api/v2/commerce/cart-settings', bs: {'abandonment_minutes':'i','max_recovery_attempts':'i','recovery_automation_enabled':'b','recovery_delay_hours':'i','recovery_gap_hours':'i'}, reply: (d) => cartSettings(d) },
  // There is NO `/carts/whatsapp-templates/{id}` route in Retain (MSG-4): the one template is derived from the list.
  {
    m: 'GET', from: '/carts/admin/whatsapp-templates/:id', row: 'retain carts.rs — derived from GET /carts/whatsapp-templates (no /{id} route)',
    run: async (c) => {
      const all = recoveryTemplates(await v2call('GET', '/api/v2/retain/carts/whatsapp-templates'));
      const hit = all.find((t) => t.id === c.params.id || t.name === c.params.id);
      if (!hit) {
        const err: any = new Error('That WhatsApp template is not (or no longer) an approved template of this store.');
        err.isAxiosError = true;
        err.response = { status: 404, data: { code: 'comms.not_found', message: err.message } };
        throw err;
      }
      return hit;
    },
  },
];
