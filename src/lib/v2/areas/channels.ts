/**
 * Channels and channel allocations (commerce ROUTE_MAP `channels.ts`, `channelAllocations.ts`): connections, mappings, logs, the marketplace file import/export, per-channel availability caps.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2http } from '../http';
import type { Spec } from '../shape';
import { wrapData, shapeBody } from '../shape';


const APPLY_PARTS: Spec = { '#mp': 'j', create_orders: 's', dry_run: 's', file: 'f', mapping: 's', mode: 's', purpose: 's' };
const EXPORT_FIELDS: Spec = { format: 's', include_zero: 'b', only_mapped: 'b' };
const BULK_ROWS: Spec = { rows: [{ buffer_qty: 'j', channel_id: 's', external_id: 's', external_sku: 'j', external_title: 'j', is_active: 'b', product_id: 'j', sync_inventory: 'b', sync_listing: 'b', variation_id: 'j' }] };

export const CHANNEL_ROUTES: V2Route[] = [
  { m: 'GET', from: '/channel-allocations', row: 'commerce channelAllocations.ts:38', to: '/api/v2/commerce/channel-allocations', qs: ['limit','offset','page','sort','q','channel_id','channel_code','variation_id','product_id','active'], reply: wrapData },
  { m: 'POST', from: '/channel-allocations', row: 'commerce channelAllocations.ts:105', to: '/api/v2/commerce/channel-allocations', bs: {'active':'b','cap_pct':'j','cap_units':'j','channel_code':'j','channel_id':'s','notes':'j','product_id':'j','variation_id':'s'}, reply: wrapData },
  { m: 'PUT', from: '/channel-allocations/:id', row: 'commerce channelAllocations.ts:133', method: 'PATCH', to: '/api/v2/commerce/channel-allocations/{id}', bs: {'active':'b','cap_pct':'j','cap_units':'j','channel_code':'j','notes':'j','product_id':'j'}, reply: wrapData },
  { m: 'DELETE', from: '/channel-allocations/:id', row: 'commerce channelAllocations.ts:148', to: '/api/v2/commerce/channel-allocations/{id}' },
  { m: 'GET', from: '/channel-allocations/config', row: 'commerce channelAllocations.ts:25', to: '/api/v2/commerce/channel-allocations/config', reply: wrapData },
  // merged into the Settings Center write (ROUTE_MAP rule 10: one write path); the registry takes the patch itself
  { m: 'PUT', from: '/channel-allocations/config', row: 'commerce channelAllocations.ts:30', method: 'PATCH', to: '/api/v2/commerce/settings/registry/channelAllocationConfig', body: (c) => ({ enabled: !!c.body?.enabled }), reply: wrapData },
  { m: 'GET', from: '/channel-allocations/preview', row: 'commerce channelAllocations.ts:51', to: '/api/v2/commerce/channel-allocations/preview', qs: ['sku','variation_id'], reply: wrapData },
  { m: 'GET', from: '/channels/:id/export/history', row: 'commerce channels.ts:601', to: '/api/v2/commerce/channels/{id}/export-history', qs: ['limit'], reply: wrapData },
  {
    // SPLIT in v2: POST queues a job (503 `commerce.channel_queue_unavailable` without the queue), GET builds the
    // file at once. The caller (responseType arraybuffer) decodes JSON → "queued", else the bytes → a file.
    m: 'POST', from: '/channels/:id/export/inventory', row: 'commerce channels.ts:558 (split)',
    run: async (c) => {
      const id = encodeURIComponent(c.params.id);
      const body = shapeBody(EXPORT_FIELDS)(c) as Record<string, unknown>;
      try {
        const r = await v2http.request({ method: 'POST', url: `/api/v2/commerce/channels/${id}/export-inventory`, data: body, responseType: 'arraybuffer' });
        return { __v2raw: true, data: r.data, status: r.status, headers: r.headers };
      } catch (e: any) {
        if (e?.response?.status !== 503) throw e;
        const r = await v2http.request({ method: 'GET', url: `/api/v2/commerce/channels/${id}/export-inventory/file`, params: body, responseType: 'arraybuffer' });
        return { __v2raw: true, data: r.data, status: r.status, headers: r.headers };
      }
    },
  },
  { m: 'GET', from: '/channels/:id/file-config', row: 'commerce channels.ts:515', to: '/api/v2/commerce/channels/{id}/file-config' },
  {
    // The write mode travels in the legacy query (`?mode=partial`; `mode` in the form is the stock set/adjust switch); v2 takes it as the `write_mode` part.
    m: 'POST', from: '/channels/:id/import/apply', row: 'commerce channels.ts:372', to: '/api/v2/commerce/channels/{id}/import/apply',
    body: (c) => {
      const form = shapeBody(APPLY_PARTS)(c);
      if (c.query.mode === 'partial' && typeof FormData !== 'undefined' && form instanceof FormData) form.append('write_mode', 'partial');
      return form;
    },
  },
  { m: 'GET', from: '/channels/:id/import/history', row: 'commerce channels.ts:497', to: '/api/v2/commerce/channels/{id}/import-history', qs: ['limit'] },
  { m: 'POST', from: '/channels/:id/import/preview', row: 'commerce channels.ts:291', to: '/api/v2/commerce/channels/{id}/import/preview', bs: {'#mp':'j','create_orders':'s','file':'f','purpose':'s'} },
  { m: 'GET', from: '/channels/:id/order-documents', row: 'commerce channels.ts:609', to: '/api/v2/commerce/channels/{id}/order-documents', qs: ['limit'], reply: wrapData },
  { m: 'GET', from: '/channels/:id/orders', row: 'commerce channels.ts:501', to: '/api/v2/commerce/channels/{id}/orders', qs: ['limit'] },
  { m: 'GET', from: '/channels/connections', row: 'commerce channels.ts:86', to: '/api/v2/commerce/channels' },
  { m: 'POST', from: '/channels/connections', row: 'commerce channels.ts:101', to: '/api/v2/commerce/channels', bs: {'display_name':'s','fields':'j','inventory_buffer_pct':'i','platform_code':'s','pull_schedule':'s','push_schedule':'s','sync_inventory':'b','sync_listings':'b','sync_orders':'b'}, reply: wrapData },
  { m: 'GET', from: '/channels/connections/:id', row: 'commerce channels.ts:93', to: '/api/v2/commerce/channels/{id}', reply: wrapData },
  { m: 'PUT', from: '/channels/connections/:id', row: 'commerce channels.ts:123', method: 'PATCH', to: '/api/v2/commerce/channels/{id}', bs: {'config':'j','display_name':'s','fields':'j','inventory_buffer_pct':'i','is_active':'b','pull_schedule':'s','push_schedule':'s','sync_inventory':'b','sync_listings':'b','sync_orders':'b'}, reply: wrapData },
  { m: 'DELETE', from: '/channels/connections/:id', row: 'commerce channels.ts:151', method: 'POST', to: '/api/v2/commerce/channels/{id}/remove', bs: 'j' },
  { m: 'POST', from: '/channels/connections/:id/auto-map', row: 'commerce channels.ts:247', to: '/api/v2/commerce/channels/{id}/auto-map', bs: 'j' },
  { m: 'POST', from: '/channels/connections/:id/feed-token', row: 'commerce channels.ts:184', to: '/api/v2/commerce/channels/{id}/feed-token', bs: 'j', reply: wrapData },
  { m: 'POST', from: '/channels/connections/:id/sync', row: 'commerce channels.ts:174', to: '/api/v2/commerce/channels/{id}/sync', bs: 'j', reply: wrapData },
  { m: 'POST', from: '/channels/connections/:id/test', row: 'commerce channels.ts:159', to: '/api/v2/commerce/channels/{id}/test', bs: 'j', reply: wrapData },
  { m: 'POST', from: '/channels/custom', row: 'commerce channels.ts:269', to: '/api/v2/commerce/channels/custom', bs: {'name':'s','notes':'s'} },
  { m: 'GET', from: '/channels/logs', row: 'commerce channels.ts:257', to: '/api/v2/commerce/channel-logs', qs: ['channel_id','limit'] },
  { m: 'GET', from: '/channels/mappings', row: 'commerce channels.ts:199', to: '/api/v2/commerce/channel-mappings', qs: ['limit','offset','page','sort','q','channel_id','product_id','variation_id','external_id','sync_inventory','sync_listing','is_active'], reply: wrapData },
  { m: 'POST', from: '/channels/mappings', row: 'commerce channels.ts:213', to: '/api/v2/commerce/channel-mappings', bs: {'buffer_qty':'j','channel_id':'s','external_id':'s','external_sku':'j','external_title':'j','is_active':'b','product_id':'j','sync_inventory':'b','sync_listing':'b','variation_id':'j'}, reply: wrapData },
  { m: 'PUT', from: '/channels/mappings/:id', row: 'commerce channels.ts:222', method: 'PATCH', to: '/api/v2/commerce/channel-mappings/{id}', bs: {'buffer_qty':'j','external_id':'s','external_sku':'j','external_title':'j','is_active':'b','product_id':'j','sync_inventory':'b','sync_listing':'b','variation_id':'j'}, reply: wrapData },
  { m: 'DELETE', from: '/channels/mappings/:id', row: 'commerce channels.ts:230', to: '/api/v2/commerce/channel-mappings/{id}' },
  { m: 'POST', from: '/channels/mappings/bulk', row: 'commerce channels.ts:235 ({mappings} → {rows})', to: '/api/v2/commerce/channel-mappings/import', body: (c) => shapeBody(BULK_ROWS)({ ...c, body: { rows: c.body?.mappings ?? c.body?.rows ?? [] } }) },
  { m: 'GET', from: '/channels/platforms', row: 'commerce channels.ts:80', to: '/api/v2/commerce/channel-platforms' },
];
