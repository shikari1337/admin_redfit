/**
 * The ERP app on the Rust API (`/api/v2/erp`) — typed calls and the few helpers the
 * ERP screens share. Shapes are copied from the generated client
 * (`growcord-rs/ui/packages/api/src/erp.ts`), plus the stock-apply contract of
 * ERP-STOCK-1 (`growcord-rs/docs/briefs/ERP-STOCK-1.md` §5) and the branch / stock-by-branch
 * routes of ERP-WH-1 (`growcord-rs/docs/briefs/ERP-WH-1.md`, "Routes").
 *
 * Every call goes through `v2call`, so a Page reply (`{items, total, limit, offset}`)
 * arrives as an array carrying `total`/`limit`/`offset` as hidden properties —
 * `paged()` turns it back into a plain page object.
 *
 * Permissions (the server decides; screens only choose what to offer):
 * `settings.read` to look, `settings.manage` to change anything.
 */
import { v2call, listMeta } from './http';
import { formatDateTime, formatDay, todayIso } from '../../utils/date';
import { fmtNumber } from '../money';
import { isMoney, minorToMajor } from './money';
import { INVENTORY_LOCKED_CODE, inventoryLockSnapshot, lockedMessage, noteInventoryLockedRefusal } from './inventoryLock';

/* ── shapes ─────────────────────────────────────────────────────────────── */

export interface ErpConfigField {
  key: string;
  label: string;
  help: string;
  required: boolean;
  secret: boolean;
  default?: string | null;
}

export interface ErpConnectorFeed {
  key: string;
  label: string;
  description: string;
  entity: string;
  cursor: string;
  backfill_from: string;
  resumable: boolean;
}

export interface ErpConnector {
  key: string;
  label: string;
  description: string;
  family: string;
  default_currency: string;
  config_fields: ErpConfigField[];
  feeds: ErpConnectorFeed[];
}

export interface ErpConnectionFeed {
  key: string;
  label: string;
  entity: string;
  enabled: boolean;
  backfill_done: boolean;
  cursor?: string | null;
  last_run_status?: string | null;
  last_run_us?: number | null;
  mapping_saved: boolean;
  mapping_set_us?: number | null;
  records_held: number;
}

/**
 * What one fetch / backfill / remap did (the server's `SyncView`). Since the background-run
 * change a started run is answered at once with `status: 'running'` and its counters still
 * growing; `id` / `started_us` / `finished_us` are read when the server sends them.
 */
export interface ErpRunOutcome {
  id?: string;
  started_us?: number;
  finished_us?: number | null;
  /** When the run's task last said it was alive (epoch µs; every 15 s while running). Null = not sent / older server. */
  heartbeat_us?: number | null;
  /** While running: the size of the last successful answer of the same kind, for "x of ~y MB". Null = not known. */
  expected_bytes?: number | null;
  /** A staff member stopped it (`status` is `failed`; `message` says when and who). */
  stopped?: boolean;
  feed: string;
  status: string;
  message?: string | null;
  bytes_received: number;
  rows_fetched: number;
  rows_unkeyed: number;
  records_written: number;
  records_changed: number;
  cursor_from?: string | null;
  cursor_to?: string | null;
}

export type StockApplyStatus = 'ok' | 'partial' | 'failed' | 'skipped';

/** One "set store stock from the ERP" run (ERP-STOCK-1). Instants are epoch MICROseconds. */
export interface StockApplyView {
  id: string;
  connection_id: string;
  trigger: 'schedule' | 'manual' | string;
  status: StockApplyStatus | string;
  erp_items: number;
  matched: number;
  changed: number;
  unchanged: number;
  unmatched: number;
  fractional: number;
  units_up: number;
  units_down: number;
  unmatched_codes: string[];
  fetch: ErpRunOutcome | null;
  message: string | null;
  started_us: number;
  finished_us: number | null;
  /** When the apply's task last said it was alive (epoch µs; every 15 s while running). Null = not sent / older server. */
  heartbeat_us?: number | null;
  /** A staff member stopped it (`status` is `failed`; `message` says when and who). */
  stopped?: boolean;
  /** ERP-LOTS-1: lots holding units left out because they are inside their order window. 0 on an older server. */
  held_lots?: number;
  /** ERP-LOTS-1: their whole units. */
  held_units?: number;
}

/**
 * Where the store's stock update is (`GET …/stock/status`). `downloading` = the ERP's stock
 * is being read (`fetch.bytes_received` grows); `saving` = it is written to the ERP copy
 * (`fetch.records_written` of `fetch.rows_fetched`); `applying` = SKUs are matched and stock is
 * set (`apply.matched` / `changed` …). `idle` = nothing has run since the server started.
 * `interrupted` = the apply is still marked running but its task has been silent for 2 minutes
 * (the server restarted mid-run): nothing more will happen to it, and starting again closes it.
 * `stopped` = a staff member stopped it (`POST …/stock/applies/{id}/cancel`).
 */
export type ErpStockPhase = 'idle' | 'downloading' | 'saving' | 'applying' | 'done' | 'failed' | 'interrupted' | 'stopped';

export interface ErpStockStatus {
  phase: ErpStockPhase;
  apply: StockApplyView | null;
  fetch: ErpRunOutcome | null;
  /** An instant (RFC 3339) or null. */
  started_at: string | null;
  elapsed_secs: number | null;
}

/**
 * What pressing "update stock" answered. New servers: `{apply, already_running}` at once, the
 * work going on in the background. Older servers answered the FINISHED apply itself, after
 * all the work (`legacy`).
 */
export interface ErpStockStart {
  apply: StockApplyView | null;
  already_running: boolean;
  legacy: boolean;
}

/** What stopping a stock update answered: the apply as it stands, and whether it had already finished by itself. */
export interface ErpStockCancel {
  apply: StockApplyView | null;
  already_finished: boolean;
}

/** What stopping a fetch / backfill / remap answered. */
export interface ErpRunCancel {
  run: ErpRunOutcome | null;
  already_finished: boolean;
}

/** What starting a fetch / backfill / remap answered (`{run, already_running}`; older servers: the finished run). */
export interface ErpRunStart {
  run: ErpRunOutcome;
  already_running: boolean;
}

export interface ErpConnection {
  id: string;
  label: string;
  connector: string;
  currency: string;
  timezone: string;
  enabled: boolean;
  configured: string[];
  missing: string[];
  feeds: ErpConnectionFeed[];
  last_probe_ok?: boolean | null;
  last_probe_note?: string | null;
  last_probe_us?: number | null;
  /** ERP-STOCK-1. `undefined` = this server does not report it yet; `null` = never applied. */
  last_stock_apply?: StockApplyView | null;
  /** INV-LOCK-1 (DEC-069): the store's inventory lock as this connection sees it. */
  inventory_lock?: { locked: boolean; by_name?: string | null; since_us?: number | null; reason?: string | null } | null;
  /** ERP-ORDER-1: where sending orders stands. `null` = this connector cannot place orders; `undefined` = an older server. */
  order_push?: ErpOrderPushSettings | null;
}

/**
 * The connection setting a full read ("Read whole history again", the first run) starts from
 * (`YYYY-MM-DD`; `connector/mod.rs` `BACKFILL_FROM`). Unset, the feed's own `backfill_from`
 * applies. The connection view says only whether it is set, never its value.
 */
export const ERP_BACKFILL_FROM_KEY = 'backfill_from';

/* ── orders to the ERP (ERP-ORDER-1) ────────────────────────────────────── */

/** The connection settings the order push reads (`order_push.rs`, LiveConnect `CONFIG`). */
export const ORDER_PUSH_KEYS = {
  send: 'send_orders',
  from: 'send_orders_from',
  customer: 'order_customer_code',
  adminCustomer: 'order_admin_customer_code',
} as const;

/** A connection's order-push settings, as the server shows them (`OrderPushSettingsView`; no secret among them). */
export interface ErpOrderPushSettings {
  /** The connection's own `send_orders` switch. */
  on: boolean;
  /** False = this deployment never sends, whatever the switch says (`deployment_note` says why). */
  deployment_allows: boolean;
  deployment_note?: string | null;
  /** The first instant whose orders are sent (epoch µs). */
  send_from_us?: number | null;
  /** The ERP customer B2C (website) orders are booked to. */
  customer_code?: string | null;
  /** The ERP customer staff-created orders are booked to; null = the website one. */
  admin_customer_code?: string | null;
  invoice_number_form: string;
  /** Settings still missing before it can send, while it is on. */
  missing: string[];
}

/** One row of a connection's push ledger (`OrderPushView`). Only what the screens read. */
export interface ErpOrderPushRow {
  id: string;
  connection_id: string;
  order_id: string;
  order_number: string;
  state: string;
  last_error?: string | null;
  invoice_number?: string | null;
  retryable: boolean;
}

/** Where one order stands with the ERP (`GET /erp/orders/{order_id}/push`). */
export type OrderPushState = 'off' | 'not_sent' | 'waiting_customer_code' | 'queued' | 'sent' | 'failed' | 'refused' | 'unknown';

export interface OrderErpPush {
  order_id: string;
  b2b: boolean;
  /** An `OrderPushState`; a word this admin does not know yet arrives as itself. */
  state: OrderPushState | string;
  customer_code: string | null;
  invoice_number: string | null;
  push_id: string | null;
  error: string | null;
}

export interface ErpCanonicalField {
  key: string;
  label: string;
  description: string;
  kind: string;
  repeated: boolean;
  required: boolean;
}

export interface ErpTransformArg { key: string; label: string; help: string; kind: string }
export interface ErpTransformSpec { op: string; label: string; description: string; args: ErpTransformArg[] }

export interface ErpMappingState {
  feed: string;
  entity: string;
  source: string;
  available: string[];
  canonical: ErpCanonicalField[];
  transforms: ErpTransformSpec[];
  fields: unknown;
  missing_required: string[];
  sample: unknown[];
}

export interface ErpPreviewRow { mapped: unknown; natural_key?: string | null; raw: unknown; rejected: string[] }
export interface ErpPreview { feed: string; rejected: unknown; rows: ErpPreviewRow[]; unkeyed: number }

export interface ErpProbe {
  endpoint: string;
  message?: string | null;
  paths: string[];
  reachable: boolean;
  /**
   * ERP-EMPTY-1 (`ProbeView.warning`): it answered (`reachable` true) but with nothing in it — how
   * it answers a provider word or customer code it does not know. The server then records the
   * test as `last_probe_ok: false` with this as `last_probe_note`. Absent on older servers.
   */
  warning?: string | null;
  sample: unknown[];
  took_ms: number;
}

export interface ErpRun extends ErpRunOutcome {
  id: string;
  trigger: string;
  started_us: number;
  finished_us?: number | null;
  rows_stated?: number | null;
  rejected: unknown;
}

export interface ErpRecord { natural_key: string; raw: unknown; record: unknown }

export interface Paged<T> { items: T[]; total: number; limit: number; offset: number }

/* ── branches as warehouses (ERP-WH-1) ──────────────────────────────────── */

/**
 * One ERP branch code seen in the stock mirror (or mapped earlier and no longer seen).
 * The ERP's only warehouse information is that code on each stock row; the label and the
 * WMS facility it stands for are this store's own. `counted` mirrors `stock_branches`.
 */
export interface ErpBranch {
  code: string;
  label: string | null;
  facility_id: string | null;
  counted: boolean;
  seen: boolean;
  skus: number;
  batches: number;
  /** Sum of quantity, as a decimal string. */
  units: string;
  expired_batches: number;
  expiring_30d_batches: number;
  last_change_us: number | null;
}

export interface ErpBranchPatch { label?: string | null; facility_id?: string | null; counted?: boolean }

export interface ErpStockItemBranch { code: string; units: string; batches: number; nearest_expiry: string | null }

/** One ERP item across its branches. Units are decimal strings. */
export interface ErpStockItem {
  item_code: string;
  sku_matched: boolean;
  variation_id: string | null;
  total_units: string;
  counted_units: string;
  branches: ErpStockItemBranch[];
}

/** A price: the wire's `{minor, currency}`, turned into a major-unit number by `normaliseEnvelope` (`http.ts`). */
export type ErpPrice = number | string | { minor: number | string; currency: string } | null;

/** One batch of one item at one branch. */
export interface ErpBatch {
  branch_code: string;
  branch_label: string | null;
  facility_id: string | null;
  batch_no: string | null;
  quantity: string | null;
  mrp: ErpPrice;
  ptr: ErpPrice;
  pts: ErpPrice;
  /** Civil date `YYYY-MM-DD`. */
  expires_on: string | null;
  modified_us: number | null;
  /** Read when the server sends it; otherwise worked out from the branch list. */
  counted?: boolean;
  /** Sent by `by-sku` (across connections); absent on one connection's item read. */
  connection_id?: string;
  connection_label?: string;
  /** ERP-LOTS-1: the exact lot (item code, batch as kept, branch) — what the order-window route takes. */
  lot_key?: string;
  /** ERP-LOTS-1: this lot's own "stop selling N days before expiry", or null (the store's applies). */
  own_stop_days?: number | null;
  /** ERP-LOTS-1: the window that applies (its own, else the store's). */
  stop_days?: number;
  /** ERP-LOTS-1: the last day it is on sale (`YYYY-MM-DD`); null with no expiry. */
  on_sale_until?: string | null;
  /** ERP-LOTS-1: inside its window today — left out of the stock the storefront sells. */
  held?: boolean;
  window_set_by?: string | null;
  window_set_us?: number | null;
}

export interface ErpItemBatches {
  item_code: string;
  batches: ErpBatch[];
  /** ERP-LOTS-1: the store's order window (days) and whether it is on. */
  store_stop_days?: number;
  stop_selling?: boolean;
  today?: string;
}

/** `GET /erp/stock/by-sku/{sku}` → `{ sku, batches, counted_units, total_units }`, across the store's enabled connections. */
export interface ErpSkuStock {
  sku?: string;
  batches: ErpBatch[];
  /** Decimal strings. Optional only so a reply without them still renders (summed here). */
  counted_units?: string;
  total_units?: string;
  /** ERP-LOTS-1: counted batches still on sale (what the stock update sets) and the held ones. */
  sellable_units?: string;
  held_units?: string;
  store_stop_days?: number;
  stop_selling?: boolean;
}

/** ERP-LOTS-1: the restart's dry run (nothing written). */
export interface StockRestartPreview {
  connection_id: string;
  keep_unlisted: boolean;
  locked: boolean;
  lots: number;
  lot_units: number;
  lots_to_zero: number;
  lot_units_to_zero: number;
  skus_stocked: number;
  sku_units: number;
  skus_listed: number;
  skus_unlisted: number;
  unlisted_units: number;
  skus_to_zero: number;
  erp_items: number;
  erp_matched: number;
  erp_units: number;
  held_lots: number;
  held_units: number;
  stop_days: number;
  stop_selling: boolean;
  blockers: string[];
  confirm_word: string;
}

export type StockRestartPhase = 'fetching' | 'zeroing_lots' | 'zeroing_skus' | 'applying' | 'done';

/** ERP-LOTS-1: one restart of the store's stock from the ERP (its log row). */
export interface StockRestartView {
  id: string;
  connection_id: string;
  status: 'running' | 'ok' | 'partial' | 'failed' | string;
  phase: StockRestartPhase | string;
  keep_unlisted: boolean;
  actor_id: string;
  preview: StockRestartPreview | null;
  lots_zeroed: number;
  lot_units_zeroed: number;
  lots_kept: number;
  skus_zeroed: number;
  sku_units_zeroed: number;
  skus_kept: number;
  failed: number;
  failures: string[];
  fetch_run_id: string | null;
  apply: StockApplyView | null;
  message: string | null;
  started_us: number;
  finished_us: number | null;
  heartbeat_us: number | null;
}

/** `unmatched: true` = only ERP codes no store SKU matches (filtered by the server before paging). */
export interface ErpStockQuery { branch?: string; q?: string; expiring_days?: number; unmatched?: boolean; limit: number; offset: number }

/** A WMS facility, as much of it as the ERP screens need (`/api/v2/wms/facilities`). */
export interface ErpFacility { id: string; name: string; code: string | null; is_active: boolean }

/** A conversion: its `op` plus whatever arguments that op declares. */
export type ErpTransform = { op: string } & Record<string, unknown>;
/** One line of a mapping, as the API carries it. */
export interface ErpFieldMap { target: string; source: string; transforms: ErpTransform[] }

/* ── calls ──────────────────────────────────────────────────────────────── */

const BASE = '/api/v2/erp';
const enc = encodeURIComponent;
const conn = (id: string) => `${BASE}/connections/${enc(id)}`;
const feedPath = (id: string, feed: string) => `${conn(id)}/feeds/${enc(feed)}`;

/** A normalised page (array + hidden meta) or a raw page object → `Paged`. */
export function paged<T>(value: unknown): Paged<T> {
  if (Array.isArray(value)) {
    const m = listMeta(value);
    return { items: value as T[], total: Number(m.total ?? value.length), limit: Number(m.limit ?? value.length), offset: Number(m.offset ?? 0) };
  }
  const o = (value ?? {}) as Partial<Paged<T>>;
  const items = Array.isArray(o.items) ? o.items : [];
  return { items, total: Number(o.total ?? items.length), limit: Number(o.limit ?? items.length), offset: Number(o.offset ?? 0) };
}

function arr<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const items = (value as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

export const erpApi = {
  connectors: async () => arr<ErpConnector>(await v2call('GET', `${BASE}/connectors`)),
  connections: async () => arr<ErpConnection>(await v2call('GET', `${BASE}/connections`)),
  connection: (id: string) => v2call<ErpConnection>('GET', conn(id)),
  create: (body: { connector: string; label?: string; currency?: string; timezone?: string; enabled?: boolean; config?: Record<string, string> }) =>
    v2call<ErpConnection>('POST', `${BASE}/connections`, { data: body }),
  update: (id: string, body: { label?: string; currency?: string; timezone?: string; enabled?: boolean; config?: Record<string, string> }) =>
    v2call<ErpConnection>('PATCH', conn(id), { data: body }),
  archive: (id: string) => v2call<{ done: string }>('POST', `${conn(id)}/archive`, { data: {} }),
  test: (id: string, feed?: string) => v2call<ErpProbe>('POST', `${conn(id)}/test`, { data: feed ? { feed } : {} }),
  setFeed: (id: string, feed: string, enabled: boolean) => v2call<{ done: string }>('PATCH', feedPath(id, feed), { data: { enabled } }),
  mapping: (id: string, feed: string) => v2call<ErpMappingState>('GET', `${feedPath(id, feed)}/mapping`),
  saveMapping: (id: string, feed: string, fields: ErpFieldMap[]) =>
    v2call<{ done: string }>('PUT', `${feedPath(id, feed)}/mapping`, { data: { fields } }),
  preview: (id: string, feed: string, fields: ErpFieldMap[], sample: unknown[] | null) =>
    v2call<ErpPreview>('POST', `${feedPath(id, feed)}/preview`, { data: { fields, sample } }),
  sync: async (id: string, feed: string) => readRunStart(await v2call<unknown>('POST', `${feedPath(id, feed)}/sync`, { data: {} })),
  backfill: async (id: string, feed: string) => readRunStart(await v2call<unknown>('POST', `${feedPath(id, feed)}/backfill`, { data: {} })),
  remap: async (id: string, feed: string) => readRunStart(await v2call<unknown>('POST', `${feedPath(id, feed)}/remap`, { data: {} })),
  runs: async (id: string, limit = 50) => paged<ErpRun>(await v2call('GET', `${conn(id)}/runs`, { params: { limit } })),
  /** One run, while it is going and after (`GET …/runs/{run_id}` → SyncView). */
  run: async (id: string, runId: string) => readRunOutcome(await v2call<unknown>('GET', `${conn(id)}/runs/${enc(runId)}`)),
  records: async (id: string, entity: string, limit: number, offset: number) =>
    paged<ErpRecord>(await v2call('GET', `${conn(id)}/records/${enc(entity)}`, { params: { limit, offset } })),
  /**
   * ERP-STOCK-1: set the store's stock from the ERP now (optionally fetching the stock feed
   * first). Answers at once on a current server; follow it with `stockStatus`.
   */
  startStockApply: async (id: string, fetch = true) =>
    readStockStart(await v2call<unknown>('POST', `${conn(id)}/stock/apply`, { data: { fetch } })),
  /** Stop a running stock update (staff only). SKUs already set keep their new stock. */
  cancelStockApply: async (id: string, applyId: string): Promise<ErpStockCancel> => {
    const o: unknown = await v2call<unknown>('POST', `${conn(id)}/stock/applies/${enc(applyId)}/cancel`, { data: {} });
    const r = isRow(o) ? o : {};
    return { apply: isRow(r.apply) ? readApplyView(r.apply) : null, already_finished: r.already_finished === true };
  },
  /** Stop a running fetch / backfill / remap (staff only). */
  cancelRun: async (id: string, runId: string): Promise<ErpRunCancel> => {
    const o: unknown = await v2call<unknown>('POST', `${conn(id)}/runs/${enc(runId)}/cancel`, { data: {} });
    const r = isRow(o) ? o : {};
    return { run: isRow(r.run) ? readRunOutcome(r.run) : null, already_finished: r.already_finished === true };
  },
  /** Where the stock update is now (`GET …/stock/status`). */
  stockStatus: async (id: string) => readStockStatus(await v2call<unknown>('GET', `${conn(id)}/stock/status`)),
  /** ERP-STOCK-1: the history of stock applies, newest first. */
  stockApplies: async (id: string, limit = 20, offset = 0) =>
    paged<StockApplyView>(await v2call('GET', `${conn(id)}/stock/applies`, { params: { limit, offset } })),
  /** ERP-WH-1: the branches seen in the stock mirror, with this store's label / warehouse / counted. */
  branches: async (id: string) => arr<ErpBranch>(await v2call('GET', `${conn(id)}/branches`)),
  /** ERP-WH-1: label a branch, map it to a warehouse, or switch whether it counts (`settings.manage`). */
  setBranch: (id: string, code: string, body: ErpBranchPatch) =>
    v2call<ErpBranch>('PUT', `${conn(id)}/branches/${enc(code)}`, { data: body }),
  /** ERP-WH-1: ERP items with their per-branch units. Blank filters are not sent. */
  stockItems: async (id: string, query: ErpStockQuery) => {
    const params: Record<string, unknown> = { limit: query.limit, offset: query.offset };
    if (query.branch) params.branch = query.branch;
    if (query.q?.trim()) params.q = query.q.trim();
    if (typeof query.expiring_days === 'number' && Number.isFinite(query.expiring_days)) params.expiring_days = query.expiring_days;
    if (query.unmatched) params.unmatched = true;
    return paged<ErpStockItem>(await v2call('GET', `${conn(id)}/stock/items`, { params }));
  },
  /** ERP-WH-1: one item's batches, by branch then expiry. */
  stockItem: async (id: string, code: string) => {
    const r = await v2call<Partial<ErpItemBatches>>('GET', `${conn(id)}/stock/items/${enc(code)}`);
    return { ...(r ?? {}), item_code: String(r?.item_code ?? code), batches: arr<ErpBatch>(r?.batches) } as ErpItemBatches;
  },
  /**
   * ERP-LOTS-1: set (days) or clear (null) one ERP lot's own order window (`inventory.adjust`).
   * Kept under the exact lot, so every re-sync keeps it; the next stock update applies it.
   */
  setLotWindow: (id: string, lotKey: string, stopDays: number | null, note?: string) =>
    v2call<ErpBatch>('PUT', `${conn(id)}/stock/lots/window`, { data: { lot_key: lotKey, stop_days: stopDays, ...(note ? { note } : {}) } }),
  /** ERP-LOTS-1: what "Restart stock from ERP" would zero and set (`inventory.delete`; writes nothing). */
  restartPreview: async (id: string, keepUnlisted: boolean) =>
    readRestartPreview(await v2call<unknown>('POST', `${conn(id)}/stock/restart/preview`, { data: { keep_unlisted: keepUnlisted } })),
  /** ERP-LOTS-1: start the restart (typed confirmation `RESTART`); answers the running restart. */
  restart: async (id: string, keepUnlisted: boolean, confirm: string) =>
    readRestart(await v2call<unknown>('POST', `${conn(id)}/stock/restart`, { data: { keep_unlisted: keepUnlisted, confirm } })),
  /** ERP-LOTS-1: one restart, polled while it runs. */
  restartOne: async (id: string, restartId: string) =>
    readRestart(await v2call<unknown>('GET', `${conn(id)}/stock/restarts/${enc(restartId)}`)),
  /** ERP-LOTS-1: the connection's restarts, newest first. */
  restarts: async (id: string, limit = 10) => {
    const p = paged<unknown>(await v2call('GET', `${conn(id)}/stock/restarts`, { params: { limit } }));
    return { ...p, items: p.items.map(readRestart) } as Paged<StockRestartView>;
  },
  /** ERP-WH-1: one store SKU's batches at the ERP (`inventory.read`). */
  stockBySku: async (sku: string) => {
    const r = await v2call<unknown>('GET', `${BASE}/stock/by-sku/${enc(sku.trim())}`);
    if (Array.isArray(r)) return { batches: r as ErpBatch[] } as ErpSkuStock;
    const o = (r ?? {}) as Partial<ErpSkuStock> & { items?: unknown };
    return { ...o, batches: arr<ErpBatch>(o.batches ?? o.items) } as ErpSkuStock;
  },
  /** ERP-ORDER-1: one row of a connection's order push ledger. */
  orderPushRow: (id: string, pushId: string) => v2call<ErpOrderPushRow>('GET', `${conn(id)}/orders/${enc(pushId)}`),
  /** ERP-ORDER-1: make a failed push due again (`settings.manage`; refused `erp.not_retryable` otherwise). */
  retryOrderPush: (id: string, pushId: string) => v2call<ErpOrderPushRow>('POST', `${conn(id)}/orders/${enc(pushId)}/retry`, { data: {} }),
  /** Where one order (its uuid `id`) stands with the ERP. */
  orderPush: async (orderId: string) => readOrderPush(await v2call<unknown>('GET', `${BASE}/orders/${enc(orderId)}/push`), orderId),
  /** A B2B order: the buyer's own ERP customer code, which lets it go to the ERP. */
  setOrderCustomerCode: (orderId: string, code: string) =>
    v2call<unknown>('PUT', `${BASE}/orders/${enc(orderId)}/customer-code`, { data: { customer_code: code } }),
  /** The store's warehouses (WMS facilities) — the picker a branch is mapped from. */
  facilities: async (): Promise<ErpFacility[]> => {
    const rows = arr<Record<string, unknown>>(await v2call('GET', '/api/v2/wms/facilities', { params: { limit: 200 } }));
    return rows
      .map((f) => ({
        id: String(f.id ?? f._id ?? ''),
        name: String(f.name ?? f.code ?? ''),
        code: typeof f.code === 'string' && f.code ? f.code : null,
        is_active: f.is_active !== false && f.isActive !== false,
      }))
      .filter((f) => f.id);
  },
};

/**
 * Every enabled connection that keeps stock, with its branches — for screens outside the
 * ERP section (Warehouses, the Inventory drawer). `branches` is null when this server does
 * not serve them or this person may not read them.
 */
export interface StockBranchEntry { connection: ErpConnection; branches: ErpBranch[] | null }

export async function stockBranchIndex(): Promise<StockBranchEntry[]> {
  const list = (await erpApi.connections()).filter((c) => c.enabled && !!stockFeed(c));
  return Promise.all(list.map(async (connection) => {
    try {
      return { connection, branches: await erpApi.branches(connection.id) };
    } catch {
      return { connection, branches: null };
    }
  }));
}

/**
 * Retry one failed push when only its id is known (the order's push view carries no connection
 * id): the connections that can place orders are asked, the one switched on first, which holds
 * that push; it is retried there. The lookups are GETs; only the one retry writes.
 */
export async function retryOrderPushById(pushId: string): Promise<ErpOrderPushRow> {
  // `null` = cannot place orders; `undefined` = an older server that does not say, so it is asked.
  const list = (await erpApi.connections()).filter((c) => c.order_push !== null);
  list.sort((a, b) => Number(!!b.order_push?.on) - Number(!!a.order_push?.on));
  let lastErr: unknown = null;
  for (const c of list) {
    try {
      await erpApi.orderPushRow(c.id, pushId);
    } catch (e) {
      if (errorCode(e) === 'erp.not_found') { lastErr = e; continue; }
      throw e;
    }
    return erpApi.retryOrderPush(c.id, pushId);
  }
  if (lastErr) throw lastErr;
  // Shaped like the server's refusal so `errorText` says it as it is (not "could not reach the server").
  throw Object.assign(new Error('No ERP connection of this store sends orders.'), {
    response: { status: 404, data: { code: 'erp.not_found', message: 'No ERP connection of this store sends orders.' } },
  });
}

/** The order's push view, narrowed (a missing field reads as null, an unknown state as itself). */
export function readOrderPush(value: unknown, orderId: string): OrderErpPush {
  const o = isRow(value) ? value : {};
  return {
    order_id: strOrNull(o.order_id) ?? orderId,
    b2b: o.b2b === true,
    state: strOrNull(o.state) ?? 'unknown',
    customer_code: strOrNull(o.customer_code),
    invoice_number: strOrNull(o.invoice_number),
    push_id: strOrNull(o.push_id),
    error: strOrNull(o.error),
  };
}

/** One page of stock items, asked again after a short wait when a request fails, so one bad reply does not end a long read. */
async function stockPageRetrying(id: string, query: ErpStockQuery, tries = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await erpApi.stockItems(id, query);
    } catch (e) {
      if (attempt >= tries) throw e;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

/** Read every page of a stock-items filter (CSV export, the browser-side "no matching SKU" filter). */
export async function allStockItems(
  id: string,
  query: Omit<ErpStockQuery, 'limit' | 'offset'>,
  cap = 5000,
  onProgress?: (done: number, total: number) => void,
): Promise<{ items: ErpStockItem[]; total: number; capped: boolean }> {
  const size = 200;
  const items: ErpStockItem[] = [];
  let total = 0;
  for (let offset = 0; offset < cap; offset += size) {
    const page = await stockPageRetrying(id, { ...query, limit: size, offset });
    total = page.total;
    items.push(...page.items);
    onProgress?.(items.length, total);
    if (page.items.length < size || items.length >= total) break;
  }
  return { items: items.slice(0, cap), total, capped: total > cap };
}

/* ── background runs: reading the answers ───────────────────────────────── */

const PHASES: readonly ErpStockPhase[] = ['idle', 'downloading', 'saving', 'applying', 'done', 'failed', 'interrupted', 'stopped'];
const numOr = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** A SyncView, narrowed (counters default to 0 so a half-filled running view still renders). */
export function readRunOutcome(value: unknown): ErpRunOutcome {
  const o = isRow(value) ? value : {};
  return {
    id: typeof o.id === 'string' && o.id ? o.id : undefined,
    started_us: typeof o.started_us === 'number' ? o.started_us : undefined,
    finished_us: typeof o.finished_us === 'number' ? o.finished_us : null,
    heartbeat_us: numOrNull(o.heartbeat_us),
    expected_bytes: numOrNull(o.expected_bytes),
    stopped: o.stopped === true,
    feed: String(o.feed ?? ''),
    status: String(o.status ?? ''),
    message: strOrNull(o.message),
    bytes_received: numOr(o.bytes_received),
    rows_fetched: numOr(o.rows_fetched),
    rows_unkeyed: numOr(o.rows_unkeyed),
    records_written: numOr(o.records_written),
    records_changed: numOr(o.records_changed),
    cursor_from: strOrNull(o.cursor_from),
    cursor_to: strOrNull(o.cursor_to),
  };
}

/** A StockApplyView, narrowed. */
export function readApplyView(value: unknown): StockApplyView {
  const o = isRow(value) ? value : {};
  return {
    id: String(o.id ?? ''),
    connection_id: String(o.connection_id ?? ''),
    trigger: String(o.trigger ?? ''),
    status: String(o.status ?? ''),
    erp_items: numOr(o.erp_items),
    matched: numOr(o.matched),
    changed: numOr(o.changed),
    unchanged: numOr(o.unchanged),
    unmatched: numOr(o.unmatched),
    fractional: numOr(o.fractional),
    units_up: numOr(o.units_up),
    units_down: numOr(o.units_down),
    unmatched_codes: Array.isArray(o.unmatched_codes) ? o.unmatched_codes.filter((c): c is string => typeof c === 'string') : [],
    fetch: isRow(o.fetch) ? readRunOutcome(o.fetch) : null,
    message: strOrNull(o.message),
    started_us: numOr(o.started_us),
    finished_us: typeof o.finished_us === 'number' ? o.finished_us : null,
    heartbeat_us: numOrNull(o.heartbeat_us),
    stopped: o.stopped === true,
    held_lots: numOr(o.held_lots),
    held_units: numOr(o.held_units),
  };
}

/** A StockRestartPreviewView, narrowed. */
export function readRestartPreview(value: unknown): StockRestartPreview {
  const o = isRow(value) ? value : {};
  return {
    connection_id: String(o.connection_id ?? ''),
    keep_unlisted: o.keep_unlisted === true,
    locked: o.locked === true,
    lots: numOr(o.lots),
    lot_units: numOr(o.lot_units),
    lots_to_zero: numOr(o.lots_to_zero),
    lot_units_to_zero: numOr(o.lot_units_to_zero),
    skus_stocked: numOr(o.skus_stocked),
    sku_units: numOr(o.sku_units),
    skus_listed: numOr(o.skus_listed),
    skus_unlisted: numOr(o.skus_unlisted),
    unlisted_units: numOr(o.unlisted_units),
    skus_to_zero: numOr(o.skus_to_zero),
    erp_items: numOr(o.erp_items),
    erp_matched: numOr(o.erp_matched),
    erp_units: numOr(o.erp_units),
    held_lots: numOr(o.held_lots),
    held_units: numOr(o.held_units),
    stop_days: numOr(o.stop_days),
    stop_selling: o.stop_selling === true,
    blockers: Array.isArray(o.blockers) ? o.blockers.filter((b): b is string => typeof b === 'string') : [],
    confirm_word: typeof o.confirm_word === 'string' && o.confirm_word ? o.confirm_word : 'RESTART',
  };
}

/** A StockRestartView, narrowed. */
export function readRestart(value: unknown): StockRestartView {
  const o = isRow(value) ? value : {};
  const preview = isRow(o.preview) && 'lots' in o.preview ? readRestartPreview(o.preview) : null;
  return {
    id: String(o.id ?? ''),
    connection_id: String(o.connection_id ?? ''),
    status: String(o.status ?? ''),
    phase: String(o.phase ?? ''),
    keep_unlisted: o.keep_unlisted === true,
    actor_id: String(o.actor_id ?? ''),
    preview,
    lots_zeroed: numOr(o.lots_zeroed),
    lot_units_zeroed: numOr(o.lot_units_zeroed),
    lots_kept: numOr(o.lots_kept),
    skus_zeroed: numOr(o.skus_zeroed),
    sku_units_zeroed: numOr(o.sku_units_zeroed),
    skus_kept: numOr(o.skus_kept),
    failed: numOr(o.failed),
    failures: Array.isArray(o.failures) ? o.failures.filter((f): f is string => typeof f === 'string') : [],
    fetch_run_id: strOrNull(o.fetch_run_id),
    apply: isRow(o.apply) ? readApplyView(o.apply) : null,
    message: strOrNull(o.message),
    started_us: numOr(o.started_us),
    finished_us: numOrNull(o.finished_us),
    heartbeat_us: numOrNull(o.heartbeat_us),
  };
}

/** `{apply, already_running}` (current) or the finished StockApplyView itself (older servers). */
export function readStockStart(value: unknown): ErpStockStart {
  const o = isRow(value) ? value : {};
  if ('apply' in o || 'already_running' in o) {
    return { apply: isRow(o.apply) ? readApplyView(o.apply) : null, already_running: o.already_running === true, legacy: false };
  }
  return { apply: readApplyView(o), already_running: false, legacy: true };
}

/** `{run, already_running}` (current) or the finished run itself (older servers). */
export function readRunStart(value: unknown): ErpRunStart {
  const o = isRow(value) ? value : {};
  if (isRow(o.run)) return { run: readRunOutcome(o.run), already_running: o.already_running === true };
  return { run: readRunOutcome(o), already_running: o.already_running === true };
}

export function readStockStatus(value: unknown): ErpStockStatus {
  const o = isRow(value) ? value : {};
  const phase = PHASES.find((p) => p === o.phase) ?? 'idle';
  return {
    phase,
    apply: isRow(o.apply) ? readApplyView(o.apply) : null,
    fetch: isRow(o.fetch) ? readRunOutcome(o.fetch) : null,
    started_at: strOrNull(o.started_at),
    elapsed_secs: typeof o.elapsed_secs === 'number' && Number.isFinite(o.elapsed_secs) ? o.elapsed_secs : null,
  };
}

/* ── errors ─────────────────────────────────────────────────────────────── */

/** The error code a refusal carried (`erp.already_running` …), or ''. */
export function errorCode(err: unknown): string {
  return errBody(err).code;
}

/** True when the call gave up waiting (the admin's 2-minute limit), not when the server said no. */
export function isTimeout(err: unknown): boolean {
  const e = err as { code?: string; response?: unknown } | null;
  return !!e && !e.response && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT');
}

function errBody(err: unknown): { status?: number; code: string; message?: string; details?: Record<string, unknown> } {
  const e = err as { code?: string; message?: string; response?: { status?: number; data?: { code?: string; message?: string; details?: Record<string, unknown> } } };
  const data = e?.response?.data ?? {};
  return { status: e?.response?.status, code: String(data.code ?? (e?.code === 'V2_BACKEND_GAP' ? 'v2.backend_gap' : '')), message: data.message ?? e?.message, details: data.details };
}

/**
 * An app's own answer code (`erp.not_found`, `retain.port_not_wired`, `commerce.not_found`):
 * lower case `<app>.<name>`. The host's fallback for a route it does not mount answers
 * `RESOURCE_NOT_FOUND` (growcord-rs `hosts/api/src/serve.rs` `not_found`), never a dotted code.
 */
const APP_CODE = /^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/;

/**
 * The host's fallback words for a route it does not mount, 404 and 405 alike (growcord-rs
 * `hosts/api/src/serve.rs` `not_found`, also `method_not_allowed_fallback`). The kernel's record
 * layer answers the same `RESOURCE_NOT_FOUND` code for a missing record, with "<Entity> not found"
 * (`lib/kernel/resource/src/resource/ops.rs`), which is a real answer.
 */
const NO_SUCH_ROUTE = 'no such route';

/**
 * True when THIS server does not serve the route at all (an older build, or a route mounted
 * only behind a switch that is off): a 404/405/501 that is not one of an app's own answers
 * (`erp.not_found` for an unknown connection, `retain.port_not_wired` for a port not bound
 * yet, `RESOURCE_NOT_FOUND` naming a missing record are real answers), or the admin's own
 * `v2.backend_gap`.
 */
export function isNotServed(err: unknown): boolean {
  const { status, code, message } = errBody(err);
  if (code === 'v2.backend_gap' || code === 'v2.not_migrated') return true;
  if (status === 404 || status === 405 || status === 501) {
    if (code === 'RESOURCE_NOT_FOUND') {
      const said = (message ?? '').trim().toLowerCase();
      return !said || said === NO_SUCH_ROUTE || said.startsWith('request failed with status');
    }
    return !APP_CODE.test(code) || code.startsWith('v2.');
  }
  return false;
}

/**
 * The problems a refusal listed (`details.problems`, `details.reasons`, `details.issues`), each
 * in the server's words, with the field it named (`details.field`) first when there is one.
 */
export function errorProblems(err: unknown): string[] {
  const { details } = errBody(err);
  if (!details) return [];
  const out: string[] = [];
  for (const k of ['problems', 'reasons', 'issues'] as const) {
    const list = details[k];
    if (Array.isArray(list)) for (const p of list) if (typeof p === 'string' && p.trim()) out.push(p.trim());
  }
  return out;
}

/** The field a refusal named (`details.field`), or ''. */
export function errorField(err: unknown): string {
  const f = errBody(err).details?.field;
  return typeof f === 'string' ? f : '';
}

/** The sentence to show for a refused or failed call. */
export function errorText(err: unknown, fallback = 'Something went wrong.'): string {
  const { status, code, message, details } = errBody(err);
  if (isNotServed(err)) return 'Not available on this server yet.';
  if (status === 403 && code === 'access.module_disabled') {
    return `${message || 'This feature is switched off for this store.'} Turn it on in Settings, Modules, or ask Growcord.`;
  }
  // A refusal that is not about the role (a key or agent where a person must act, the builder
  // approving their own batch) keeps the server's own words.
  if (status === 403 && message && code && code !== 'access.permission_denied' && code !== 'FORBIDDEN') return message;
  if (status === 403) return 'You do not have permission to do this. Ask an owner to add it to your role.';
  if (!status && !code) return message ? `Could not reach the server: ${message}` : 'Could not reach the server.';
  const said = typeof details?.source_message === 'string' && details.source_message ? ` The ERP said: “${details.source_message}”.` : '';
  if (code === INVENTORY_LOCKED_CODE) {
    noteInventoryLockedRefusal();
    return `${lockedMessage(inventoryLockSnapshot().erpLabel)} An admin can unlock it on the Inventory page.`;
  }
  if (code === 'erp.already_running') return `${message || 'This is already running.'} Wait for it to finish, then try again.`;
  const field = typeof details?.field === 'string' && details.field && !(message ?? '').includes(details.field) ? ` (${details.field})` : '';
  return `${message || fallback}${field}${said}`;
}

/* ── formatting ─────────────────────────────────────────────────────────── */

/** Epoch microseconds → Date (the API's instants), or null. */
export function fromMicros(us: number | null | undefined): Date | null {
  if (typeof us !== 'number' || !Number.isFinite(us)) return null;
  const d = new Date(us / 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An instant, in the STORE's zone (the admin's one date module), or `never`. */
export function whenText(us: number | null | undefined, never = 'never'): string {
  const d = fromMicros(us);
  return d ? formatDateTime(d, never) : never;
}

/** A byte count as people read it: "812 KB", "58.6 MB". */
export function bytesText(b: number | null | undefined): string {
  const x = typeof b === 'number' && Number.isFinite(b) && b > 0 ? b : 0;
  if (x < 1024) return `${fmtNumber(x)} bytes`;
  if (x < 1024 * 1024) return `${(x / 1024).toLocaleString('en-IN', { maximumFractionDigits: 0 })} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MB`;
  return `${(x / (1024 * 1024 * 1024)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} GB`;
}

/**
 * Download progress: "12.4 of ~59 MB" when the size of the last answer of the same kind is
 * known (and not already passed), else "12.4 MB so far".
 */
export function downloadText(received: number, expected: number | null | undefined): string {
  const MB = 1024 * 1024;
  const mb = (x: number, digits: number) => (x / MB).toLocaleString('en-IN', { maximumFractionDigits: digits });
  if (typeof expected === 'number' && Number.isFinite(expected) && expected > 0 && received <= expected) {
    return expected >= MB ? `${mb(received, 1)} of ~${mb(expected, 0)} MB` : `${bytesText(received)} of ~${bytesText(expected)}`;
  }
  return `${bytesText(received)} so far`;
}

/** Whole seconds since an epoch-µs instant, as of `nowMs` (never negative), or null. */
export function secsSince(us: number | null | undefined, nowMs: number): number | null {
  if (typeof us !== 'number' || !Number.isFinite(us) || us <= 0) return null;
  return Math.max(0, Math.round((nowMs - us / 1000) / 1000));
}

/** A duration in seconds: "40 s", "3 min", "1 h 05 min". */
export function durationText(secs: number | null | undefined): string {
  if (typeof secs !== 'number' || !Number.isFinite(secs) || secs < 0) return '—';
  const s = Math.floor(secs);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** How long an apply took (finished − started), or null while it runs. */
export function applySecs(a: Pick<StockApplyView, 'started_us' | 'finished_us'>): number | null {
  if (typeof a.finished_us !== 'number' || !a.started_us) return null;
  return Math.max(0, (a.finished_us - a.started_us) / 1_000_000);
}

/** en-IN grouping. */
export const n = (v: number | null | undefined) => fmtNumber(v ?? 0);

/** A decimal string (units) → en-IN, keeping up to 3 decimals; blank → "—". */
export function unitsText(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : String(v);
}

/** A decimal string → number (0 when blank / unreadable), for sums only. */
export const unitsNum = (v: string | number | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** A price in the connection's currency, en-IN grouping; blank → "—". */
export function priceText(v: ErpPrice | undefined, currency = 'INR'): string {
  if (v === null || v === undefined || v === '') return '—';
  // A Money the normaliser did not convert (it always should): read it here rather than print NaN.
  if (typeof v === 'object') {
    if (!isMoney(v)) return '—';
    return priceText(minorToMajor(v.minor, v.currency), v.currency);
  }
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  try {
    return x.toLocaleString('en-IN', { style: 'currency', currency: currency || 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return `${currency} ${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** A civil date (`YYYY-MM-DD`, no zone) → "12 Mar 2026" through the admin's date module. */
export function dayText(iso: string | null | undefined, never = '—'): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || never;
  // Noon UTC is the same calendar day in every zone a store can be in.
  return formatDay(`${iso.slice(0, 10)}T12:00:00Z`, never);
}

/** Whole days from the store's today to a civil date (negative = past), or null. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayIso().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

/** Expiry colour: expired red, within 30 days amber. */
export function expiryTone(iso: string | null | undefined): 'red' | 'amber' | 'neutral' {
  const d = daysUntil(iso);
  if (d === null) return 'neutral';
  if (d < 0) return 'red';
  return d <= 30 ? 'amber' : 'neutral';
}

/**
 * ERP-LOTS-1: the last day a lot is on sale with a window of `stopDays` (expiry − days − 1), as
 * `YYYY-MM-DD`; null without an expiry. The server's rule: sold only while expiry − days > today.
 */
export function lastDayOnSale(expiry: string | null | undefined, stopDays: number | null | undefined): string | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return null;
  const [y, m, d] = expiry.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - ((stopDays ?? 0) + 1) * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** ERP-LOTS-1: "On sale until 12 Mar 2026" / "Held — expires 30 Jun 2026" / "On sale" (no expiry). */
export function saleWindowText(expiry: string | null | undefined, onSaleUntil: string | null | undefined, held: boolean | undefined): { text: string; held: boolean } {
  if (held) return { text: `Held — expires ${dayText(expiry)}`, held: true };
  if (!expiry) return { text: 'On sale', held: false };
  return { text: onSaleUntil ? `On sale until ${dayText(onSaleUntil)}` : 'On sale', held: false };
}

/** ERP-LOTS-1: the restart's phase in words. */
export function restartPhaseText(phase: string): string {
  switch (phase) {
    case 'fetching': return 'Fetching all stock from the ERP';
    case 'zeroing_lots': return 'Zeroing the store’s old batches';
    case 'zeroing_skus': return 'Zeroing every SKU’s stock';
    case 'applying': return 'Setting stock from the ERP';
    case 'done': return 'Finished';
    default: return phase || '—';
  }
}

/** "12 Mar 2026 (in 20 days)" / "(expired 3 days ago)". */
export function expiryText(iso: string | null | undefined): string {
  const d = daysUntil(iso);
  if (d === null) return iso ? iso : 'no expiry';
  const rel = d < 0 ? `expired ${plural(-d, 'day')} ago` : d === 0 ? 'expires today' : `in ${plural(d, 'day')}`;
  return `${dayText(iso)} (${rel})`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

/** A short line of what a fetch / backfill / remap did. */
export function outcomeText(o: ErpRunOutcome): string {
  const parts = [`${plural(o.rows_fetched, 'row')} read`, `${n(o.records_changed)} changed`];
  if (o.rows_unkeyed > 0) parts.push(`${n(o.rows_unkeyed)} could not be identified`);
  if (o.cursor_to) parts.push(`now up to ${o.cursor_to}`);
  return parts.join(' · ');
}

/** The sentence a stock apply earns — what really happened to the store's stock. */
export function applyText(a: StockApplyView, label: string): string {
  if (a.status === 'skipped') return `Stock was not updated from ${label}${a.message ? `: ${a.message}` : '.'}`;
  if (a.status === 'failed') return `Stock was not updated from ${label}${a.message ? `: ${a.message}` : '.'}`;
  let s = `Stock updated from ${label}: ${plural(a.changed, 'SKU')} changed (↑${n(a.units_up)} ↓${n(a.units_down)} units), ${n(a.unchanged)} unchanged`;
  s += a.unmatched > 0 ? `, ${plural(a.unmatched, 'ERP code')} ${a.unmatched === 1 ? 'has' : 'have'} no matching SKU.` : '.';
  if (a.status === 'partial' && a.message) s += ` Not everything went through: ${a.message}`;
  return s;
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export function statusTone(status: string | null | undefined): Tone {
  if (status === 'ok') return 'green';
  if (status === 'running' || status === 'partial') return 'amber';
  if (status === 'failed') return 'red';
  return 'neutral';
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* ── which connection keeps this store's stock ──────────────────────────── */

/** The feed that fills `stock` records, if this connection has one. */
export function stockFeed(c: ErpConnection): ErpConnectionFeed | null {
  return c.feeds.find((f) => f.entity === 'stock') ?? c.feeds.find((f) => f.key === 'inventory') ?? null;
}

/** The store's stock connection: the first enabled one with a stock feed, else any with one. */
export function pickStockConnection(list: ErpConnection[]): ErpConnection | null {
  return list.find((c) => c.enabled && !!stockFeed(c)) ?? list.find((c) => !!stockFeed(c)) ?? null;
}

/* ── shapes the API publishes as open JSON ──────────────────────────────── */

const isRow = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A saved mapping arrives as open JSON. Narrow it, never cast. */
export function readFieldMaps(value: unknown): ErpFieldMap[] {
  if (!Array.isArray(value)) return [];
  const out: ErpFieldMap[] = [];
  for (const item of value) {
    if (!isRow(item) || typeof item.target !== 'string') continue;
    const transforms: ErpTransform[] = [];
    if (Array.isArray(item.transforms)) {
      for (const t of item.transforms) if (isRow(t) && typeof t.op === 'string') transforms.push({ ...t, op: t.op });
    }
    out.push({ target: item.target, source: typeof item.source === 'string' ? item.source : '', transforms });
  }
  return out;
}

/** The counts a run reports of rows it could not convert, keyed by field. */
export function readRejected(value: unknown): [string, number][] {
  if (!isRow(value)) return [];
  const out: [string, number][] = [];
  for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && v > 0) out.push([k, v]);
  return out.sort((a, b) => b[1] - a[1]);
}

/**
 * The value a source path picks out of one raw row — for the editor's "what does this
 * look like?" column only (`a.b`, `a[0].b`, `a[].b`). The server's Preview decides.
 */
export function readPath(row: unknown, path: string): unknown {
  if (!path) return undefined;
  let cursor: unknown = row;
  for (const part of path.split('.')) {
    const open = part.indexOf('[');
    const name = open === -1 ? part : part.slice(0, open);
    if (name) {
      if (!isRow(cursor)) return undefined;
      cursor = cursor[name];
    }
    let rest = open === -1 ? '' : part.slice(open);
    while (rest.startsWith('[')) {
      const close = rest.indexOf(']');
      if (close === -1) return undefined;
      const inside = rest.slice(1, close);
      if (!Array.isArray(cursor)) return undefined;
      cursor = inside === '' ? cursor.slice() : cursor[Number(inside)];
      rest = rest.slice(close + 1);
    }
  }
  return cursor;
}

/** Where the ERP section lives in this admin. */
export const ERP_HOME = '/panel/inventory/erp';
export const erpConnUrl = (id: string, tab = '') => `${ERP_HOME}/c/${enc(id)}${tab ? `/${tab}` : ''}`;
