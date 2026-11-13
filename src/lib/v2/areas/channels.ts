/**
 * Channels and channel allocations (commerce ROUTE_MAP `channels.ts`, `channelAllocations.ts`): connections, mappings, logs, the marketplace file import/export, per-channel availability caps.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2http, mapList } from '../http';
import { majorToMinor, moneyToMajorDeep } from '../money';
import type { Spec } from '../shape';
import { wrapData, shapeBody, pageAs } from '../shape';


const APPLY_PARTS: Spec = { '#mp': 'j', create_orders: 's', dry_run: 's', file: 'f', mapping: 's', mode: 's', purpose: 's' };
const EXPORT_FIELDS: Spec = { format: 's', include_zero: 'b', only_mapped: 'b' };
const BULK_ROWS: Spec = { rows: [{ buffer_qty: 'j', channel_id: 's', external_id: 's', external_sku: 'j', external_title: 'j', is_active: 'b', product_id: 'j', sync_inventory: 'b', sync_listing: 'b', variation_id: 'j' }] };

const rowsOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * An order file's dry run answers the FULL plan (ChannelOrderPlanView, commerce views/channels.rs:649: `lines` an
 * array, `buyer` an object, no counts). ChannelDaily renders the brief plan the preview carries (PlanPreviewView), so
 * the full one is briefed exactly as `PlanPreviewView::of` does it (views/channels.rs:730): 200 orders, 20 items each,
 * 100 problems, 50 unknown SKUs, with the full counts beside them. Money is already rupees (normaliseEnvelope).
 */
function briefPlan(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const problems = rowsOf(p.problems);
  const unmatched = rowsOf(p.unmatched_skus);
  const address = (o: any, k: string) => (o?.address && typeof o.address === 'object' ? textOf(o.address[k]) : null);
  const buyer = (o: any) => (o?.buyer && typeof o.buyer === 'object' ? textOf(o.buyer.name) ?? '' : textOf(o?.buyer) ?? '');
  return {
    register_available: !!p.register_available,
    totals: p.totals,
    problems: problems.slice(0, 100),
    problem_count: problems.length,
    unmatched_skus: unmatched.slice(0, 50),
    unmatched_sku_count: unmatched.length,
    duplicates: rowsOf(p.duplicates).map((o) => ({
      order_ref: o?.order_ref,
      order_number: o?.duplicate_of?.order_number ?? null,
      lines: rowsOf(o?.lines).length,
      total: o?.money?.total ?? 0,
    })),
    orders: rowsOf(p.orders).slice(0, 200).map((o) => {
      const lines = rowsOf(o?.lines);
      return {
        order_ref: o?.order_ref,
        order_date: o?.order_date ?? null,
        lines: lines.length,
        units: lines.reduce((s, l) => s + (Number(l?.quantity) || 0), 0),
        buyer: buyer(o),
        phone: o?.buyer && typeof o.buyer === 'object' ? textOf(o.buyer.phone) : null,
        city: address(o, 'city'),
        state: address(o, 'state'),
        payment_method: o?.payment_method,
        money: o?.money,
        notes: rowsOf(o?.notes),
        items: lines.slice(0, 20).map((l) => ({ sku: l?.sku, name: l?.product_name, quantity: l?.quantity, unit_price: l?.unit_price, line_total: l?.line_total })),
      };
    }),
  };
}

/**
 * ChannelApplyView {kind, order_plan, orders, stock} (commerce views/channels.rs:911) to the member `kind` names, which
 * is what ChannelImport (stock and register files) and ChannelDaily (order plan, orders created) read.
 */
function applyReply(d: any): any {
  if (!d || typeof d !== 'object' || typeof d.kind !== 'string') return d;
  if (d.kind === 'order_plan') return briefPlan(d.order_plan);
  if (d.kind === 'orders') return d.orders ?? d;
  if (d.kind === 'stock') return d.stock ?? d;
  return d;
}

/**
 * A refused or stopped channel file (422 `commerce.channel_import_incomplete` with `details.result`, or
 * `commerce.import_rolled_back` with `details.report`, commerce api/channels/files.rs:278, :464): the result the screen
 * shows, money in rupees. Errors skip the reply path, so the screens call this on the error body.
 */
export function channelFileRefusal(body: any): any | null {
  const raw = body?.details?.result ?? body?.details?.report ?? body?.data ?? null;
  return raw && typeof raw === 'object' ? moneyToMajorDeep(raw) : null;
}

export const CHANNEL_ROUTES: V2Route[] = [
  { m: 'GET', from: '/channel-allocations', row: 'commerce channelAllocations.ts:38', to: '/api/v2/commerce/channel-allocations', qs: ['limit','offset','page','sort','q','channel_id','channel_code','variation_id','product_id','active'], reply: wrapData },
  { m: 'POST', from: '/channel-allocations', row: 'commerce channelAllocations.ts:105', to: '/api/v2/commerce/channel-allocations', bs: {'active':'b','cap_pct':'j','cap_units':'j','channel_code':'j','channel_id':'s','notes':'j','product_id':'j','variation_id':'s'}, reply: wrapData },
  { m: 'PUT', from: '/channel-allocations/:id', row: 'commerce channelAllocations.ts:133', method: 'PATCH', to: '/api/v2/commerce/channel-allocations/{id}', bs: {'active':'b','cap_pct':'j','cap_units':'j','channel_code':'j','notes':'j','product_id':'j'}, reply: wrapData },
  { m: 'DELETE', from: '/channel-allocations/:id', row: 'commerce channelAllocations.ts:148', to: '/api/v2/commerce/channel-allocations/{id}' },
  { m: 'GET', from: '/channel-allocations/config', row: 'commerce channelAllocations.ts:25', to: '/api/v2/commerce/channel-allocations/config', reply: wrapData },
  // merged into the Settings Center write (ROUTE_MAP rule 10: one write path); the registry takes the patch itself
  { m: 'PUT', from: '/channel-allocations/config', row: 'commerce channelAllocations.ts:30', method: 'PATCH', to: '/api/v2/commerce/settings/registry/channelAllocationConfig', body: (c) => ({ enabled: !!c.body?.enabled }),
    // SettingSavedView {center: SettingDefinitionView} (commerce views/catalog_admin.rs:1907); ChannelAllocation reads `.enabled` off the saved value
    reply: (d) => wrapData(d?.center?.value ?? d?.center ?? d) },
  { m: 'GET', from: '/channel-allocations/preview', row: 'commerce channelAllocations.ts:51', to: '/api/v2/commerce/channel-allocations/preview', qs: ['sku','variation_id'], reply: wrapData },
  // ChannelExportHistoryView {items, total, limit, queue_available} (commerce views/channels.rs:400) normalises to an array; channelsAPI.exportHistory reads r.data.data.rows (ChannelDaily "recent files").
  { m: 'GET', from: '/channels/:id/export/history', row: 'commerce channels.ts:601', to: '/api/v2/commerce/channels/{id}/export-history', qs: ['limit'], reply: (d) => wrapData(pageAs('rows')(d)) },
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
  // A one-row sample in the channel's layout (commerce api/channels/files.rs:1000, a file download); the caller asks for a blob.
  { m: 'GET', from: '/channels/:id/export/template', row: 'commerce channels.ts:591', to: '/api/v2/commerce/channels/{id}/export-template' },
  {
    // The write mode travels in the legacy query (`?mode=partial`; `mode` in the form is the stock set/adjust switch); v2 takes it as the `write_mode` part.
    m: 'POST', from: '/channels/:id/import/apply', row: 'commerce channels.ts:372', to: '/api/v2/commerce/channels/{id}/import/apply',
    body: (c) => {
      const form = shapeBody(APPLY_PARTS)(c);
      if (c.query.mode === 'partial' && typeof FormData !== 'undefined' && form instanceof FormData) form.append('write_mode', 'partial');
      return form;
    },
    reply: applyReply,
  },
  { m: 'GET', from: '/channels/:id/import/history', row: 'commerce channels.ts:497', to: '/api/v2/commerce/channels/{id}/import-history', qs: ['limit'] },
  { m: 'POST', from: '/channels/:id/import/preview', row: 'commerce channels.ts:291', to: '/api/v2/commerce/channels/{id}/import/preview', bs: {'#mp':'j','create_orders':'s','file':'f','purpose':'s'} },
  // ChannelOrderDocumentsView {items, total, limit, unavailable, reason} (commerce views/channels.rs:388; a row's `total` is Money, :354); channelsAPI.orderDocuments reads r.data.data.rows and ChannelDaily d.total_minor (paise).
  { m: 'GET', from: '/channels/:id/order-documents', row: 'commerce channels.ts:609', to: '/api/v2/commerce/channels/{id}/order-documents', qs: ['limit'], reply: (d) => wrapData(pageAs('rows')(Array.isArray(d) ? mapList(d, (r: any) => (r && typeof r === 'object' ? { ...r, total_minor: r.total_minor ?? majorToMinor(r.total) } : r)) : d)) },
  { m: 'GET', from: '/channels/:id/orders', row: 'commerce channels.ts:501', to: '/api/v2/commerce/channels/{id}/orders', qs: ['limit'] },
  { m: 'GET', from: '/channels/connections', row: 'commerce channels.ts:86', to: '/api/v2/commerce/channels' },
  { m: 'POST', from: '/channels/connections', row: 'commerce channels.ts:101', to: '/api/v2/commerce/channels', bs: {'display_name':'s','fields':'j','inventory_buffer_pct':'i','platform_code':'s','pull_schedule':'s','push_schedule':'s','sync_inventory':'b','sync_listings':'b','sync_orders':'b'}, reply: wrapData },
  { m: 'GET', from: '/channels/connections/:id', row: 'commerce channels.ts:93', to: '/api/v2/commerce/channels/{id}', reply: wrapData },
  { m: 'PUT', from: '/channels/connections/:id', row: 'commerce channels.ts:123', method: 'PATCH', to: '/api/v2/commerce/channels/{id}', bs: {'config':'j','display_name':'s','fields':'j','inventory_buffer_pct':'i','is_active':'b','pull_schedule':'s','push_schedule':'s','sync_inventory':'b','sync_listings':'b','sync_orders':'b'}, reply: wrapData },
  { m: 'DELETE', from: '/channels/connections/:id', row: 'commerce channels.ts:151', method: 'POST', to: '/api/v2/commerce/channels/{id}/remove', bs: 'j' },
  { m: 'POST', from: '/channels/connections/:id/auto-map', row: 'commerce channels.ts:247', to: '/api/v2/commerce/channels/{id}/auto-map', bs: 'j' },
  { m: 'POST', from: '/channels/connections/:id/feed-token', row: 'commerce channels.ts:184', to: '/api/v2/commerce/channels/{id}/feed-token', bs: 'j', reply: wrapData },
  { m: 'POST', from: '/channels/connections/:id/sync', row: 'commerce channels.ts:174', to: '/api/v2/commerce/channels/{id}/sync', bs: 'j', reply: (d) => wrapData(d && typeof d === 'object' && 'result' in d ? d.result : d) }, // ChannelSyncView {result} (commerce views/channels.rs:144); null result = nothing pushed
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
