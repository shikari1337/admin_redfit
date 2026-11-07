/**
 * Shipping, shipments, warehouses (facilities), pincode, COD reconciliation, RTO, weight disputes, e-way bills (ship ROUTE_MAP `routes/shipping.ts`, `shipments.ts`, `weightDisputes.ts`; wms facilities). Many ship reads answer 503 `ship.port_not_wired` on this host (the warehouses / carriers ports): the row stays pointed at the real route and the screen shows the typed refusal.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Ctx, V2Route } from '../routes';
import { asList, mapList, v2call, backendGap } from '../http';
import { majorToMinor, minorToMajor } from '../money';
import { shapeBody, shapeValue } from '../shape';
import type { Spec } from '../shape';

/* ── e-way bills (books api/eway_bills.rs): v2 raises them per BOOKS DOCUMENT (`/books/eway-bills/documents/{id}/…`) ── */

const EWB = '/api/v2/books/eway-bills';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `TransportQuery` / `TransportBody` (eway_bills.rs:153, :214); `trans_mode` is NIC's "1".."4". */
const TRANSPORT: Spec = { trans_mode: 's', vehicle_no: 's', transporter_id: 's', transporter_name: 's', distance_km: 'i' };
/** Register row id → its Books document id (null = a bill the OLD register raised on an order: no v2 action takes it). */
const billDoc = new Map<string, string | null>();
/** Document number → id, from the "needs an e-way bill" list (the screen picks a row by its number). */
const docByNumber = new Map<string, string>();
/** The transport typed in the build form, per document: v2 records it with the JSON download or the API generate. */
const typedTransport = new Map<string, Record<string, unknown>>();

/** The Books document an e-way bill action names (a register row id, or the document id a build handed back). */
function ewbDoc(ref: string): string {
  if (billDoc.has(ref)) {
    const doc = billDoc.get(ref);
    if (!doc) backendGap('This e-way bill was raised on an order in the old register; v2 acts on e-way bills of Books documents only');
    return doc as string;
  }
  return ref;
}

/** A document number (or id) the build form names → the Books document id. */
async function ewbDocOf(ref: unknown): Promise<string> {
  const s = String(ref ?? '').trim();
  if (UUID.test(s)) return s;
  const hit = docByNumber.get(s);
  if (hit) return hit;
  const d = await v2call<any>('GET', EWB, { params: { tab: 'to_generate', search: s, limit: 20 } });
  const row = (Array.isArray(d?.rows) ? d.rows : []).find((r: any) => r?.number === s);
  if (!row?.id) backendGap(`No Books document numbered ${s} is waiting for an e-way bill`);
  return String(row.id);
}

/** The build form (`transporterId`, `vehicleNo`, `transMode`, `distanceKm` …) → the v2 transport (a 0 distance = let v2 work it out). */
function transportOf(b: any): Record<string, unknown> {
  const t = shapeValue({ ...b, distance_km: Number(b?.distanceKm ?? b?.distance_km) > 0 ? Number(b?.distanceKm ?? b?.distance_km) : undefined, distanceKm: undefined }, TRANSPORT) as Record<string, unknown>;
  for (const k of Object.keys(t)) if (t[k] === null || t[k] === '') delete t[k];
  return t;
}

/** EwbRegisterView row (books domain/ewb.rs:1621) → the register row the screen reads (old `ewb_documents` names). */
function ewbRow(r: any): any {
  const doc = r?.source_kind === 'document' ? (r?.ref?.id ?? null) : null;
  if (r?.id) billDoc.set(String(r.id), doc);
  // The JSON download re-records the draft from its query: hand it the transport this bill already holds.
  if (doc && !typedTransport.has(doc)) {
    typedTransport.set(doc, transportOf({ trans_mode: r.trans_mode, vehicle_no: r.vehicle_no, transporter_id: r.transporter_id, transporter_name: r.transporter_name, distance_km: r.distance_km }));
  }
  return {
    ...r,
    status: r?.row_status ?? r?.status, ewb_number: r?.number ?? null, valid_until: r?.valid_upto ?? null,
    order_number: r?.ref?.kind === 'order' ? r?.ref?.number : undefined, to_address: r?.to,
    total_value_minor: r?.ref?.total_minor ?? r?.goods_value_minor ?? '0',
  };
}

/** A "needs an e-way bill" document (books db/ewb.rs:600) → the pending row the screen reads (its number stands where the order number stood). */
function pendingRow(r: any): any {
  if (r?.number && r?.id) docByNumber.set(String(r.number), String(r.id));
  return {
    ...r,
    order_number: r?.number, invoice_number: r?.number, total: minorToMajor(r?.total_minor ?? 0),
    created_at: r?.document_date, ship_city: null, ship_state: r?.party_state ?? null,
  };
}

/** EwbDocumentView (eway_bills.rs:478) → the build preview `{meta, validations}` (NIC's own key names, as before). */
function ewbPreview(d: any): any {
  const p = d?.prefill ?? {};
  return {
    meta: {
      fromGstin: p.from?.gstin, fromAddress: p.from, fromStateCode: p.from?.stateCode ?? p.act_from_state_code,
      toGstin: p.to?.gstin, toAddress: p.to, docNumber: d?.document?.number, docDate: d?.document?.document_date,
      totInvValue: p.tot_inv_value, hsnLines: p.items ?? [],
    },
    validations: Array.isArray(d?.validations) ? d.validations : [],
    document: d?.document, api: d?.api, can_generate: d?.can_generate,
  };
}

/** The e-way bill API account's state, as the settings drawer reads it. Credentials are never read back. */
function ewbConnection(api: any): any {
  const a = api ?? {};
  return {
    configured: !!a.configured, source: a.source ?? null, missing: Array.isArray(a.missing) ? a.missing : [],
    environment: a.environment ?? '', provider: '', gstin: '', username: '', baseUrl: '', pathPrefix: '',
    passwordSet: false, clientSecretSet: false, publicKeySet: false, enabled: !!a.configured, note: a.note ?? null,
  };
}

const EWB_CREDENTIALS_GAP = 'saving or testing the e-way bill API credentials has no v2 route (the account is set up by Growcord; its state shows here)';


/** A wms facility → the warehouse the Warehouses screen reads (`address{…}`, `contact{…}`, `shippingProviders`). */
export function facilityRow(f: any): any {
  if (!f || typeof f !== 'object') return f;
  return {
    ...f,
    address: { line1: f.addr_line1 ?? '', line2: f.addr_line2 ?? '', city: f.city ?? '', state: f.state ?? '', pincode: f.pincode ?? '', country: f.country ?? '' },
    contact: { name: f.contact_name ?? '', phone: f.contact_phone ?? '', email: f.contact_email ?? '' },
    shipping_providers: f.shipping_providers ?? {},
  };
}
const facilities = (d: any) => (Array.isArray(d) ? mapList(d, facilityRow) : facilityRow(d));
const FACILITY: Spec = { addr_line1: 's', addr_line2: 'j', city: 's', code: 's', contact_email: 'j', contact_name: 's', contact_phone: 's', country: 's', gstin: 'j', is_active: 'b', kind: 's', name: 's', pincode: 's', priority: 'i', shipping_providers: 'j', state: 's' };
/** The legacy warehouse form (`address{…}`, `contact{…}`) → the facility's flat typed input. */
const facilityBody = (c: any) => {
  const b = c.body ?? {};
  const a = b.address ?? {}; const k = b.contact ?? {};
  return shapeBody(FACILITY)({ ...c, body: {
    ...b, address: undefined, contact: undefined, shippingProviders: undefined,
    addr_line1: a.line1 ?? b.addr_line1, addr_line2: a.line2 ?? b.addr_line2, city: a.city ?? b.city, state: a.state ?? b.state,
    pincode: a.pincode ?? b.pincode, country: a.country ?? b.country,
    contact_name: k.name ?? b.contact_name, contact_phone: k.phone ?? b.contact_phone, contact_email: k.email ?? b.contact_email,
    shipping_providers: b.shippingProviders ?? b.shipping_providers,
  } });
};

/* ── reply reshapers: the v2 ship views → the names the screens read ── */

/** A list's rows mapped (its `total` … kept) with more non-enumerable metadata beside them. */
function listPlus(list: any[], fn: (r: any) => any, extra: Record<string, unknown>): any[] {
  const out = mapList(list, fn) as any;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) Object.defineProperty(out, k, { value: v, writable: true, enumerable: false, configurable: true });
  return out;
}
/** The old board's `pagination {page, limit, total, pages}` from a v2 page's `{total, limit, offset}`. */
function pagination(d: any): Record<string, number> {
  const total = Number(d?.total ?? 0); const limit = Number(d?.limit) || 20; const offset = Number(d?.offset ?? 0);
  return { page: Math.floor(offset / limit) + 1, limit, total, pages: Math.max(Math.ceil(total / limit), 1) };
}
/** Every named Money field (already rupees, http.ts) ALSO as `x_minor` paise at any depth: the screens divide those by 100. */
const paise = (...keys: string[]) => {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return mapList(v, walk);
    if (!v || typeof v !== 'object') return v;
    const out: any = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x);
    for (const k of keys) if (typeof v[k] === 'number' && v[`${k}_minor`] === undefined) out[`${k}_minor`] = majorToMinor(v[k]);
    return out;
  };
  return walk;
};
/** A CarrierAnswer `{provider, data}` (ship views/store.rs:696) → the carrier's own answer. */
const carrierData = (d: any) => (d && typeof d === 'object' && !Array.isArray(d) && 'provider' in d && 'data' in d ? d.data : d);

/** ShipmentView (ship views/store.rs:423) names its warehouse `warehouse` ({id, name, code} on the board, else the id); ShipmentTable.tsx:183 and ShipmentDetailDrawer.tsx:88 read the old `warehouseId`. */
const shipmentRow = (s: any) => (s && typeof s === 'object' && !Array.isArray(s) ? { ...s, warehouse_id: s.warehouse_id ?? s.warehouse ?? null } : s);
/** BoardView {items, total, limit, offset, status_counts} (ship views/store.rs:486) → rows + the `statusCounts` / `pagination` Shipments.tsx:182-189 reads. */
const shipmentBoard = (d: any) => (Array.isArray(d) ? listPlus(d, shipmentRow, { statusCounts: (d as any).status_counts, pagination: pagination(d) }) : d);

/** BookingsView {created[], failed[]} (ship views/store.rs:551) → the booked facts Shipments.tsx:455 and OrderDetail.tsx:721 read; BookedView carries no shipment number. */
const bookingReply = (d: any) => {
  const c = Array.isArray(d?.created) ? d.created[0] : null;
  return c ? { ...d, shipment_id: c.shipment_id ?? null, awb_code: c.awb ?? null, courier_name: c.courier ?? null, shipping_provider: c.provider ?? null, provider: c.provider ?? null, tracking_url: c.tracking_url ?? null } : d;
};
/** PickupOneView {shipment, already_scheduled, scheduled_for, pickup_id} (ship views/store.rs:579) → the old `{pickup, meta.alreadyScheduled}` Shipments.tsx:253 reads. */
const pickupReply = (d: any) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
  const pk = d.shipment?.pickup && typeof d.shipment.pickup === 'object' ? d.shipment.pickup : {};
  return { ...d, pickup: { ...pk, pickupId: pk.pickupId ?? d.pickup_id ?? null, scheduledFor: pk.scheduledFor ?? d.scheduled_for ?? null }, meta: { alreadyScheduled: !!d.already_scheduled } };
};
/** CarrierAnswer {provider, data: {account_source, rates[]}} (ship api/shipping.rs:1050) → the bare rate list ShipmentCreationModal.tsx:261/:339 reads, with the old ETA names (`delivery_days`/`etd`, carriers/shiprocket/adapter.rs:146). */
const ratesReply = (d: any) => {
  const inner = carrierData(d);
  const rates = Array.isArray(inner) ? inner : Array.isArray(inner?.rates) ? inner.rates : null;
  if (!rates) return d;
  return asList(rates.map((r: any) => ({ ...r, estimated_delivery_days: r?.estimated_delivery_days ?? r?.delivery_days ?? undefined, estimated_delivery_date: r?.estimated_delivery_date ?? r?.etd ?? undefined })), { provider: d?.provider, account_source: inner?.account_source });
};
/** PincodeView {pincode, found, post_offices[]} (commerce views/storefront.rs:295) → India Post's own `[{Status, PostOffice[{District, State …}]}]` usePincodeLookup.ts:42 reads. */
const indiaPost = (d: any) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
  const offices = (Array.isArray(d.post_offices) ? d.post_offices : []).map((p: any) => ({
    ...p, Name: p?.name, BranchType: p?.branch_type, DeliveryStatus: p?.delivery_status, Block: p?.block, District: p?.district,
    Division: p?.division, Region: p?.region, Circle: p?.circle, State: p?.state, Country: p?.country,
  }));
  return [{ ...d, Status: d.found && offices.length ? 'Success' : 'Error', PostOffice: offices }];
};
/** RtoView `refund_amount` Money (ship views/store.rs:170) → also the paise ReturnsRto.tsx:144/:216 reads. */
const rtoPaise = paise('refund_amount');
/** DisputeView Money fields (ship views/store.rs:288-291) → also the paise WeightDisputes.tsx:367/:474 reads. */
const disputePaise = paise('declared_cost', 'billed_cost', 'excess', 'refund_expected');
/** DisputeTotalsView (ship views/store.rs:346): Money → also paise (`atStakeMinor` …); its `dec` percents are TEXT, and WeightDisputes.tsx:503 calls `.toFixed` on them. */
const totalsPaise = paise('at_stake', 'recovered', 'written_off', 'avg_excess');
const pctNum = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const disputeTotals = (t: any) => (t && typeof t === 'object' ? { ...t, win_rate_pct: pctNum(t.win_rate_pct), avg_excess_pct: pctNum(t.avg_excess_pct) } : t);
const disputeSummary = (d: any) => {
  const x = totalsPaise(d);
  return x && typeof x === 'object' ? { ...x, totals: disputeTotals(x.totals), by_courier: Array.isArray(x.by_courier) ? mapList(x.by_courier, disputeTotals) : x.by_courier } : x;
};

/**
 * WeightDisputes.tsx:155 sends `billedWeight` / `declaredWeight` in its `weightUnit` ('g' there; 'kg' scaled); BilledIn
 * (ship api/weight_disputes.rs:144, deny_unknown_fields) takes whole grams `billed_weight_g` / `declared_weight_g` and no unit.
 * Re-spelled first, then the row's own `bs` shapes the rest (costs in rupees → Money).
 */
const disputeBody = (r: V2Route): V2Route => ({
  ...r,
  body: (c) => {
    const b: any = c.body && typeof c.body === 'object' && !Array.isArray(c.body) ? { ...c.body } : c.body;
    if (b && typeof b === 'object') {
      const f = String(b.weightUnit ?? b.weight_unit ?? 'g').trim().toLowerCase() === 'kg' ? 1000 : 1;
      for (const [to, from] of [['billed_weight_g', ['billedWeight', 'billed_weight']], ['declared_weight_g', ['declaredWeight', 'declared_weight']]] as const) {
        for (const k of from) {
          if (!(k in b)) continue;
          const v = b[k]; delete b[k];
          if (b[to] === undefined) b[to] = v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * f);
        }
      }
      delete b.weightUnit; delete b.weight_unit;
    }
    return shapeBody(r.bs ?? null)({ ...c, body: b });
  },
});

export const SHIPPING_ROUTES: V2Route[] = [
  // The register (all tabs) and the "needs an e-way bill" list (tab to_generate) — EwbRegisterView (eway_bills.rs:576).
  { m: 'GET', from: '/ewb', row: 'books eway_bills.rs:49', to: EWB, query: () => ({ tab: 'all', limit: 100 }), reply: (d) => ({ ...d, rows: (Array.isArray(d?.rows) ? d.rows : []).map(ewbRow) }) },
  { m: 'GET', from: '/ewb/pending-orders', row: 'books eway_bills.rs:49 (tab to_generate)', to: EWB, query: () => ({ tab: 'to_generate', limit: 100 }), reply: (d) => ({ ...d, rows: (Array.isArray(d?.rows) ? d.rows : []).map(pendingRow), thresholdInr: d?.threshold_inr ?? null }) },
  // One document's prefill + checks (GET /documents/{id}, eway_bills.rs:51). The build form's transport is checked by the same
  // read and kept for the JSON download / API generate, which record it (nothing is written at "build" on v2).
  { m: 'POST', from: '/ewb/preview', row: 'books eway_bills.rs:51', run: async (c) => ewbPreview(await v2call('GET', `${EWB}/documents/${encodeURIComponent(await ewbDocOf(c.body?.orderId ?? c.body?.documentId))}`)) },
  {
    m: 'POST', from: '/ewb/build', row: 'books eway_bills.rs:51 (+ the JSON download records the draft, :57)',
    run: async (c) => {
      const id = await ewbDocOf(c.body?.orderId ?? c.body?.documentId);
      const transport = transportOf(c.body);
      typedTransport.set(id, transport);
      const d = await v2call<any>('GET', `${EWB}/documents/${encodeURIComponent(id)}`, { params: transport });
      const v = ewbPreview(d);
      return {
        doc: {
          id, doc_number: d?.document?.number, doc_date: d?.document?.document_date, status: 'draft', ewb_number: null,
          total_value_minor: d?.document?.total_minor ?? '0', to_address: d?.prefill?.to ?? null,
          vehicle_no: transport.vehicle_no ?? null, transporter_id: transport.transporter_id ?? null, valid_until: null,
          created_at: null, json_payload: null,
        },
        validations: v.validations,
      };
    },
  },
  { m: 'GET', from: '/ewb/:p1/json', row: 'books eway_bills.rs:57', to: (c: V2Ctx) => `${EWB}/documents/${encodeURIComponent(ewbDoc(c.params.p1))}/json`, query: (c) => typedTransport.get(ewbDoc(c.params.p1)) }, // download; records the draft
  { m: 'POST', from: '/ewb/:p1/generate-api', row: 'books eway_bills.rs:70', to: (c: V2Ctx) => `${EWB}/documents/${encodeURIComponent(ewbDoc(c.params.p1))}/generate`, body: (c) => ({ ...transportOf(c.body), ...(typedTransport.get(ewbDoc(c.params.p1)) ?? {}) }) },
  {
    // ManualIn (eway_bills.rs:1082) REQUIRES `ewb_date` (when the portal generated the bill); the form sends only the number
    // and the validity. A statutory date is never guessed here: without it the call is refused with the reason.
    m: 'POST', from: '/ewb/:p1/entered', row: 'books eway_bills.rs:76', to: (c: V2Ctx) => `${EWB}/documents/${encodeURIComponent(ewbDoc(c.params.p1))}/manual`,
    body: (c) => {
      const b = c.body ?? {};
      const date = b.ewbDate ?? b.ewb_date ?? b.generatedAt;
      if (!date) backendGap('Recording a portal e-way bill on v2 needs the date and time the portal generated it (ewb_date), which this form does not ask for yet');
      return { ewb_number: String(b.ewbNumber ?? b.ewb_number ?? ''), ewb_date: String(date), valid_upto: b.validUntil ?? b.valid_upto ?? null, ...(typedTransport.get(ewbDoc(c.params.p1)) ?? {}) };
    },
  },
  { m: 'POST', from: '/ewb/:p1/cancel', row: 'books eway_bills.rs:82', to: (c: V2Ctx) => `${EWB}/documents/${encodeURIComponent(ewbDoc(c.params.p1))}/cancel`, bs: { reason_code: 'i', remark: 's' } },
  {
    // No route reads the e-way bill API account on its own; every document's read carries it (EwbDocumentView.api, the store's
    // one account). Read from the first document in the register; with none there is nothing to raise a bill on yet.
    m: 'GET', from: '/ewb/settings/connection', row: 'books eway_bills.rs:51 (EwbDocumentView.api)',
    run: async () => {
      const first = async (tab: string) => (await v2call<any>('GET', EWB, { params: { tab, limit: 1 } }))?.rows?.[0];
      const pending = await first('to_generate');
      const billed = pending ? null : await first('all');
      const id = pending?.id ?? (billed?.source_kind === 'document' ? billed?.ref?.id : null);
      if (!id) return { ...ewbConnection(null), note: 'No Books document is in the e-way bill register yet, so the API account was not read.' };
      return ewbConnection((await v2call<any>('GET', `${EWB}/documents/${encodeURIComponent(id)}`))?.api);
    },
  },
  { m: 'PUT', from: '/ewb/settings/credentials', row: 'books — no row', gap: EWB_CREDENTIALS_GAP },
  { m: 'POST', from: '/ewb/settings/test-connection', row: 'books — no row', gap: EWB_CREDENTIALS_GAP },
  { m: 'GET', from: '/logistics/cod-remittances', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances', qs: ['limit','offset','status'] },
  { m: 'POST', from: '/logistics/cod-remittances', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances', bs: {'courier':'s','lines':[{'awb':'s','cod_amount':'m','order_number':'s'}],'note':'s','reference':'s','remitted_amount':'m','remitted_on':'s'} },
  { m: 'GET', from: '/logistics/cod-remittances/:id', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/cancel', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/match', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/match', bs: 'j' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/reconcile', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/reconcile', bs: 'j' },
  { m: 'GET', from: '/logistics/rto', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts', qs: ['limit','offset','status'], reply: rtoPaise }, // RtoView (ship views/store.rs:158): refund_amount_minor
  { m: 'POST', from: '/logistics/rto', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts', bs: {'awb':'s','courier':'s','expected_at':'s','lines':[{'name':'s','product_id':'s','qty_expected':'i','sku':'s','variation_id':'s'}],'order_id':'s','order_number':'s','reason':'s','shipment_id':'s'} },
  { m: 'GET', from: '/logistics/rto/:id', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}', reply: rtoPaise }, // RtoView (ship views/store.rs:158): refund_amount_minor
  { m: 'POST', from: '/logistics/rto/:id/cancel', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/logistics/rto/:id/receive', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}/receive', bs: {'lines':[{'item_id':'s','qty_damaged':'i','qty_good':'i'}]}, reply: (d) => { const x = rtoPaise(d); return x && typeof x === 'object' ? { ...x, result: x } : x; } }, // RtoReceivedView (ship views/store.rs:183) flat; ReturnsRto.tsx:78 reads `result.{refundDue, refundAmountMinor}`
  { m: 'GET', from: '/pincode/:pincode', row: 'commerce pincode.ts:13', to: '/api/v2/commerce/public/pincodes/{pincode}', reply: indiaPost }, // PincodeView (commerce views/storefront.rs:295) → India Post's array
  { m: 'GET', from: '/shipments', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments', qs: ['end_date','limit','offset','page','shipping_provider','start_date','status','tab','warehouse_id'], reply: shipmentBoard }, // BoardView (ship views/store.rs:486): statusCounts, pagination, warehouse_id
  { m: 'POST', from: '/shipments', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments', reply: bookingReply, bs: {'breadth':'s','courier_company_id':'s','customs':'j','delhivery_service_type':'s','height':'s','item_selections':[{'quantity':'i','sku':'s'}],'item_skus':['s'],'length':'s','manual_carrier_name':'s','manual_tracking_id':'s','manual_tracking_url':'s','order_ids':['s'],'service_mode':'s','shipping_provider':'s','warehouse_id':'s','weight':'s'} },
  { m: 'GET', from: '/shipments/:id', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}', reply: shipmentRow }, // ShipmentView (ship views/store.rs:423): warehouse → warehouse_id (here the bare id: get_one joins no name, api/shipments.rs:1260)
  { m: 'POST', from: '/shipments/:p1/add-orders', row: 'ship — no row', gap: 'adding orders to an existing shipment has no v2 route (ship ROUTE_MAP: no row; the binary serves none)' },
  { m: 'GET', from: '/shipments/:id/download-label', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/label', qs: ['pdf_size'] }, // download
  { m: 'GET', from: '/shipments/:id/download-manifest', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/manifest' }, // download
  { m: 'GET', from: '/shipments/:id/download-pickup-receipt', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/pickup-receipt' }, // download
  { m: 'POST', from: '/shipments/:p1/generate-awb', row: 'ship — no row', gap: 'generating an AWB for a booked shipment has no v2 route (ship ROUTE_MAP: no row; booking is POST /ship/shipments/book)' },
  { m: 'POST', from: '/shipments/:id/ndr-reattempt', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/reattempt', bs: 'j' },
  { m: 'POST', from: '/shipments/:id/ndr-request-rto', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/rto', bs: {'remarks':'s'} },
  { m: 'POST', from: '/shipments/:id/ndr-update-phone', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/phone', bs: {'phone':'s'} },
  { m: 'POST', from: '/shipments/:id/schedule-pickup', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/pickup', bs: {'notes':'s','pickup_time_slot':'s','scheduled_date':'s'}, reply: pickupReply }, // PickupOneView → {pickup, meta}
  { m: 'PUT', from: '/shipments/:id/status', row: 'ship routes/shipments.ts', method: 'POST', to: '/api/v2/ship/shipments/{id}/status', bs: {'notes':'s','status':'s','tracking_number':'s'} },
  { m: 'POST', from: '/shipments/:id/cod-rebook', row: 'ship COD-SENT-1', to: '/api/v2/ship/shipments/{id}/cod-rebook', bs: {'note':'s'} }, // CodRebookView (ship views/store.rs)
  { m: 'POST', from: '/shipments/attach-awb', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/attach-awb', bs: {'awb':'s','order_id':'s','provider':'s'} },
  { m: 'POST', from: '/shipments/documents/labels', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/labels', bs: {'pdf_size':'s','shipment_ids':['s']} },
  { m: 'POST', from: '/shipments/documents/manifests', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/manifests', bs: {'pdf_size':'s','shipment_ids':['s']} },
  { m: 'POST', from: '/shipments/fetch-status-updates', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/status-sync', bs: 'j' },
  { m: 'GET', from: '/shipments/order/:orderId/customs', row: 'ship routes/shipments.ts', to: '/api/v2/ship/orders/{orderId}/customs', reply: (d) => (d?.draft && typeof d.draft === 'object' ? { ...d, draft: { ...d.draft, declared_value_minor: d.draft.declared_value_minor ?? majorToMinor(d.draft.declared_value) } } : d) }, // CustomsDocView declared_value Money (ship views/store.rs:637); ShipmentCreationModal.tsx:649 reads declared_value_minor
  { m: 'PUT', from: '/shipments/order/:orderId/customs', row: 'ship routes/shipments.ts', method: 'PATCH', to: '/api/v2/ship/orders/{orderId}/customs', bs: {'ad_code':'s','commercial_invoice_ref':'s','contains_dg':'b','csb_type':'s','declared_currency':'s','declared_value':'m','dg_declaration_ref':'s','duty':'m','duty_paid_by':'s','export_reason':'s','iec':'s','import_kyc_ref':'s','incoterm':'s','leo_at':'s','lut_no':'s','notes':'s','packing_list_ref':'s','port_code':'s','shipping_bill_date':'s','shipping_bill_no':'s','status':'s'} },
  { m: 'GET', from: '/shipments/pending-orders', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/pending-orders', qs: ['limit','page'], reply: (d) => (Array.isArray(d) ? listPlus(d, (r) => r, { pagination: pagination(d) }) : d) }, // PendingOrdersView (ship views/store.rs:516); Shipments.tsx:142 reads `pagination`
  { m: 'POST', from: '/shipments/reconcile', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/reconcile', bs: {'days':'i','provider':'s'} },
  { m: 'POST', from: '/shipments/schedule-pickup-bulk', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/pickup-bulk', bs: {'notes':'s','pickup_time_slot':'s','scheduled_date':'s','shipment_ids':['s']} },
  { m: 'GET', from: '/shipping/:provider/pickup-locations', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/pickup-locations' },
  { m: 'POST', from: '/shipping/:provider/test-connection', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/test-connection', bs: 'j' },
  { m: 'POST', from: '/shipping/create-shipment', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shipments/book', bs: {'carrier_name':'s','courier_code':'s','delhivery_service_type':'s','dimensions':{'breadth':'s','height':'s','length':'s','weight':'s'},'item_skus':['s'],'order_id':'s','shipping_provider':'s','tracking_id':'s','tracking_url':'s','warehouse_id':'s'} },
  { m: 'GET', from: '/shipping/pincode-zones', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones', qs: ['limit','offset','page','sort','q','pincode','zone','state','city','is_serviceable'], reply: (d) => (Array.isArray(d) ? listPlus(d, (r) => r, { meta: { total: (d as any).total, limit: (d as any).limit, offset: (d as any).offset } }) : d) }, // a Page; ShippingSettings.tsx:164 reads `meta.total`
  { m: 'POST', from: '/shipping/pincode-zones', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones', bs: {'city':'j','is_serviceable':'b','pincode':'s','state':'j','zone':'s'} },
  { m: 'PUT', from: '/shipping/pincode-zones/:id', row: 'ship routes/pincodeZones.ts', method: 'PATCH', to: '/api/v2/ship/pincode-zones/{id}', bs: {'city':'j','is_serviceable':'b','pincode':'s','state':'j','zone':'s'} },
  { m: 'DELETE', from: '/shipping/pincode-zones/:id', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones/{id}' },
  { m: 'GET', from: '/shipping/providers/credentials', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/credentials' },
  { m: 'PUT', from: '/shipping/providers/credentials', row: 'ship routes/shipping.ts', method: 'PATCH', to: '/api/v2/ship/providers/credentials', bs: {'delhivery':{'api_token':'s','api_url':'s','is_enabled':'b'},'shiprocket':{'api_url':'s','channel_id':'s','email':'s','is_enabled':'b','password':'s','pickup_location':'s','require_signed_webhook':'b'}} },
  { m: 'POST', from: '/shipping/providers/shiprocket/webhook-secret', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/webhook-secret', bs: 'j' },
  { m: 'GET', from: '/shipping/providers/status', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/status' },
  { m: 'POST', from: '/shipping/shiprocket/assign-awb', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/assign-awb', bs: {'courier_id':'i','shipment_id':'s'}, reply: (d) => { const x = carrierData(d); return x && typeof x === 'object' && !Array.isArray(x) ? { ...x, provider: d?.provider } : d; } }, // CarrierAnswer.data {awb_code, courier_name, order} (ship api/shipping.rs:947); its `data` is opaque to the aliases, OrderDetail.tsx:222 reads awbCode
  { m: 'GET', from: '/shipping/shiprocket/channels', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/channels' },
  { m: 'POST', from: '/shipping/:provider/check-serviceability', row: 'ship routes/shipping.ts (public serviceability)', to: '/api/v2/ship/public/providers/{provider}/serviceability', bs: {'cod':'b','pickup_pincode':'s','pincode':'s','weight':'s'} },
  { m: 'GET', from: '/shipping/:provider/rates', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/rates', qs: ['breadth','height','length','order_id','pickup_pincode','service_type','warehouse_id','weight'], reply: ratesReply }, // CarrierAnswer {provider, data: {rates}} → the rate array
  { m: 'GET', from: '/shipping/track/:trackingId', row: 'ship modules/ship/routes/public.ts', to: '/api/v2/ship/public/shipments/{trackingId}/track', qs: ['provider'] },
  { m: 'GET', from: '/shipping/zones', row: 'ship routes/shippingZones.ts', to: '/api/v2/ship/zones', qs: ['active','kind'] },
  { m: 'POST', from: '/shipping/zones', row: 'ship routes/shippingZones.ts', to: '/api/v2/ship/zones', bs: {'countries':['s'],'country':'s','is_active':'b','kind':'s','name':'s','pincodes':['s'],'sort_order':'i','states':['s'],'zone_type':'s'} },
  { m: 'PUT', from: '/shipping/zones/:id', row: 'ship routes/shippingZones.ts', method: 'PATCH', to: '/api/v2/ship/zones/{id}', bs: {'countries':['s'],'country':'s','is_active':'b','kind':'s','name':'s','pincodes':['s'],'sort_order':'i','states':['s'],'zone_type':'s'} },
  { m: 'DELETE', from: '/shipping/zones/:id', row: 'ship routes/shippingZones.ts', to: '/api/v2/ship/zones/{id}' },
  { m: 'GET', from: '/warehouses', row: 'wms The table', to: '/api/v2/wms/facilities', qs: ['limit','offset','page','sort','q','code','kind','city','state','is_active','operating_mode'], reply: facilities },
  { m: 'POST', from: '/warehouses', row: 'wms facilities (create)', to: '/api/v2/wms/facilities', body: facilityBody, reply: facilities },
  { m: 'GET', from: '/warehouses/:id', row: 'wms The table', to: '/api/v2/wms/facilities/{id}', reply: facilities },
  { m: 'PUT', from: '/warehouses/:id', row: 'wms facilities (update)', method: 'PATCH', to: '/api/v2/wms/facilities/{id}', body: facilityBody, reply: facilities },
  { m: 'DELETE', from: '/warehouses/:id', row: 'wms The table', to: '/api/v2/wms/facilities/{id}' },
  { m: 'POST', from: '/warehouses/:p1/link-stores', row: 'wms — no row', gap: 'linking a facility to stores has no v2 route (wms ROUTE_MAP: no row)' },
  { m: 'POST', from: '/warehouses/:id/sync-with-store', row: 'wms warehouses.ts:133', gap: 'dropped in v2: the old handler synchronised nothing and answered "Sync complete" (wms ROUTE_MAP, L16)' },
  { m: 'POST', from: '/warehouses/create-from-store', row: 'wms — no row', gap: 'creating a facility from the store address has no v2 route (wms ROUTE_MAP: no row; create one with POST /wms/facilities)' },
  { m: 'GET', from: '/weight-disputes', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes', qs: ['awb','courier','from','limit','offset','status','to'], reply: disputePaise }, // DisputeView (ship views/store.rs:272): *_minor
  disputeBody({ m: 'POST', from: '/weight-disputes', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes', bs: {'awb':'s','billed_cost':'m','billed_on':'s','billed_weight_g':'i','breadth_cm':'s','courier':'s','courier_ref':'s','declared_cost':'m','declared_weight_g':'i','divisor':'i','height_cm':'s','length_cm':'s','note':'s','order_number':'s','shipment_id':'s','status':'s'} }), // billedWeight/declaredWeight → *_weight_g (grams)
  { m: 'GET', from: '/weight-disputes/:id', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}', reply: disputePaise }, // DisputeView (ship views/store.rs:272): *_minor
  { m: 'POST', from: '/weight-disputes/:id/evidence', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}/evidence', bs: {'evidence':[{'kind':'s','text':'s','url':'s'}],'text':'s','url':'s'} },
  { m: 'POST', from: '/weight-disputes/:id/transition', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}/transition', bs: {'courier_ref':'s','evidence':[{'kind':'s','text':'s','url':'s'}],'note':'s','refund_expected':'m','to':'s'} },
  { m: 'GET', from: '/weight-disputes/config', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/config' },
  { m: 'POST', from: '/weight-disputes/import', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/import', bs: {'#mp':'j','courier':'s','file':'f','weight_unit':'s'} },
  { m: 'GET', from: '/weight-disputes/summary', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/summary', qs: ['from','to'], reply: disputeSummary }, // DisputeSummaryView (ship views/store.rs:367): *Minor + numeric percents
];
