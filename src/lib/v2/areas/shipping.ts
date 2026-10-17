/**
 * Shipping, shipments, warehouses (facilities), pincode, COD reconciliation, RTO, weight disputes, e-way bills (ship ROUTE_MAP `routes/shipping.ts`, `shipments.ts`, `weightDisputes.ts`; wms facilities). Many ship reads answer 503 `ship.port_not_wired` on this host (the warehouses / carriers ports): the row stays pointed at the real route and the screen shows the typed refusal.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { mapList } from '../http';
import { shapeBody } from '../shape';
import type { Spec } from '../shape';


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

export const SHIPPING_ROUTES: V2Route[] = [
  { m: 'GET', from: '/ewb', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/:p1/cancel', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/:p1/entered', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/:p1/generate-api', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'GET', from: '/ewb/:p1/json', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/build', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'GET', from: '/ewb/pending-orders', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/preview', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'GET', from: '/ewb/settings/connection', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'PUT', from: '/ewb/settings/credentials', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'POST', from: '/ewb/settings/test-connection', row: 'gst — not ported', gap: 'e-way bills are not served by this backend yet (apps/gst has generated stubs only, no mounted route)' },
  { m: 'GET', from: '/logistics/cod-remittances', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances', qs: ['limit','offset','status'] },
  { m: 'POST', from: '/logistics/cod-remittances', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances', bs: {'courier':'s','lines':[{'awb':'s','cod_amount':'m','order_number':'s'}],'note':'s','reference':'s','remitted_amount':'m','remitted_on':'s'} },
  { m: 'GET', from: '/logistics/cod-remittances/:id', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/cancel', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/match', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/match', bs: 'j' },
  { m: 'POST', from: '/logistics/cod-remittances/:id/reconcile', row: 'ship routes/logistics.ts', to: '/api/v2/ship/cod-remittances/{id}/reconcile', bs: 'j' },
  { m: 'GET', from: '/logistics/rto', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts', qs: ['limit','offset','status'] },
  { m: 'POST', from: '/logistics/rto', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts', bs: {'awb':'s','courier':'s','expected_at':'s','lines':[{'name':'s','product_id':'s','qty_expected':'i','sku':'s','variation_id':'s'}],'order_id':'s','order_number':'s','reason':'s','shipment_id':'s'} },
  { m: 'GET', from: '/logistics/rto/:id', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}' },
  { m: 'POST', from: '/logistics/rto/:id/cancel', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/logistics/rto/:id/receive', row: 'ship routes/logistics.ts', to: '/api/v2/ship/rto-receipts/{id}/receive', bs: {'lines':[{'item_id':'s','qty_damaged':'i','qty_good':'i'}]} },
  { m: 'GET', from: '/pincode/:pincode', row: 'commerce pincode.ts:13', to: '/api/v2/commerce/public/pincodes/{pincode}' },
  { m: 'GET', from: '/shipments', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments', qs: ['end_date','limit','offset','page','shipping_provider','start_date','status','tab','warehouse_id'] },
  { m: 'POST', from: '/shipments', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments', bs: {'breadth':'s','courier_company_id':'s','customs':'j','delhivery_service_type':'s','height':'s','item_selections':[{'quantity':'i','sku':'s'}],'item_skus':['s'],'length':'s','manual_carrier_name':'s','manual_tracking_id':'s','manual_tracking_url':'s','order_ids':['s'],'service_mode':'s','shipping_provider':'s','warehouse_id':'s','weight':'s'} },
  { m: 'GET', from: '/shipments/:id', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}' },
  { m: 'POST', from: '/shipments/:p1/add-orders', row: 'ship — no row', gap: 'adding orders to an existing shipment has no v2 route (ship ROUTE_MAP: no row; the binary serves none)' },
  { m: 'GET', from: '/shipments/:id/download-label', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/label', qs: ['pdf_size'] }, // download
  { m: 'GET', from: '/shipments/:id/download-manifest', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/manifest' }, // download
  { m: 'GET', from: '/shipments/:id/download-pickup-receipt', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/pickup-receipt' }, // download
  { m: 'POST', from: '/shipments/:p1/generate-awb', row: 'ship — no row', gap: 'generating an AWB for a booked shipment has no v2 route (ship ROUTE_MAP: no row; booking is POST /ship/shipments/book)' },
  { m: 'POST', from: '/shipments/:id/ndr-reattempt', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/reattempt', bs: 'j' },
  { m: 'POST', from: '/shipments/:id/ndr-request-rto', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/rto', bs: {'remarks':'s'} },
  { m: 'POST', from: '/shipments/:id/ndr-update-phone', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/ndr/phone', bs: {'phone':'s'} },
  { m: 'POST', from: '/shipments/:id/schedule-pickup', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/{id}/pickup', bs: {'notes':'s','pickup_time_slot':'s','scheduled_date':'s'} },
  { m: 'PUT', from: '/shipments/:id/status', row: 'ship routes/shipments.ts', method: 'POST', to: '/api/v2/ship/shipments/{id}/status', bs: {'notes':'s','status':'s','tracking_number':'s'} },
  { m: 'POST', from: '/shipments/attach-awb', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/attach-awb', bs: {'awb':'s','order_id':'s','provider':'s'} },
  { m: 'POST', from: '/shipments/documents/labels', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/labels', bs: {'pdf_size':'s','shipment_ids':['s']} },
  { m: 'POST', from: '/shipments/documents/manifests', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/manifests', bs: {'pdf_size':'s','shipment_ids':['s']} },
  { m: 'POST', from: '/shipments/fetch-status-updates', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/status-sync', bs: 'j' },
  { m: 'GET', from: '/shipments/order/:orderId/customs', row: 'ship routes/shipments.ts', to: '/api/v2/ship/orders/{orderId}/customs' },
  { m: 'PUT', from: '/shipments/order/:orderId/customs', row: 'ship routes/shipments.ts', method: 'PATCH', to: '/api/v2/ship/orders/{orderId}/customs', bs: {'ad_code':'s','commercial_invoice_ref':'s','contains_dg':'b','csb_type':'s','declared_currency':'s','declared_value':'m','dg_declaration_ref':'s','duty':'m','duty_paid_by':'s','export_reason':'s','iec':'s','import_kyc_ref':'s','incoterm':'s','leo_at':'s','lut_no':'s','notes':'s','packing_list_ref':'s','port_code':'s','shipping_bill_date':'s','shipping_bill_no':'s','status':'s'} },
  { m: 'GET', from: '/shipments/pending-orders', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/pending-orders', qs: ['limit','page'] },
  { m: 'POST', from: '/shipments/reconcile', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/reconcile', bs: {'days':'i','provider':'s'} },
  { m: 'POST', from: '/shipments/schedule-pickup-bulk', row: 'ship routes/shipments.ts', to: '/api/v2/ship/shipments/pickup-bulk', bs: {'notes':'s','pickup_time_slot':'s','scheduled_date':'s','shipment_ids':['s']} },
  { m: 'GET', from: '/shipping/:provider/pickup-locations', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/pickup-locations' },
  { m: 'POST', from: '/shipping/:provider/test-connection', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/test-connection', bs: 'j' },
  { m: 'POST', from: '/shipping/create-shipment', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shipments/book', bs: {'carrier_name':'s','courier_code':'s','delhivery_service_type':'s','dimensions':{'breadth':'s','height':'s','length':'s','weight':'s'},'item_skus':['s'],'order_id':'s','shipping_provider':'s','tracking_id':'s','tracking_url':'s','warehouse_id':'s'} },
  { m: 'GET', from: '/shipping/pincode-zones', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones', qs: ['limit','offset','page','sort','q','pincode','zone','state','city','is_serviceable'] },
  { m: 'POST', from: '/shipping/pincode-zones', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones', bs: {'city':'j','is_serviceable':'b','pincode':'s','state':'j','zone':'s'} },
  { m: 'PUT', from: '/shipping/pincode-zones/:id', row: 'ship routes/pincodeZones.ts', method: 'PATCH', to: '/api/v2/ship/pincode-zones/{id}', bs: {'city':'j','is_serviceable':'b','pincode':'s','state':'j','zone':'s'} },
  { m: 'DELETE', from: '/shipping/pincode-zones/:id', row: 'ship routes/pincodeZones.ts', to: '/api/v2/ship/pincode-zones/{id}' },
  { m: 'GET', from: '/shipping/providers/credentials', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/credentials' },
  { m: 'PUT', from: '/shipping/providers/credentials', row: 'ship routes/shipping.ts', method: 'PATCH', to: '/api/v2/ship/providers/credentials', bs: {'delhivery':{'api_token':'s','api_url':'s','is_enabled':'b'},'shiprocket':{'api_url':'s','channel_id':'s','email':'s','is_enabled':'b','password':'s','pickup_location':'s','require_signed_webhook':'b'}} },
  { m: 'POST', from: '/shipping/providers/shiprocket/webhook-secret', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/webhook-secret', bs: 'j' },
  { m: 'GET', from: '/shipping/providers/status', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/status' },
  { m: 'POST', from: '/shipping/shiprocket/assign-awb', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/assign-awb', bs: {'courier_id':'i','shipment_id':'s'} },
  { m: 'GET', from: '/shipping/shiprocket/channels', row: 'ship routes/shipping.ts', to: '/api/v2/ship/shiprocket/channels' },
  { m: 'POST', from: '/shipping/:provider/check-serviceability', row: 'ship routes/shipping.ts (public serviceability)', to: '/api/v2/ship/public/providers/{provider}/serviceability', bs: {'cod':'b','pickup_pincode':'s','pincode':'s','weight':'s'} },
  { m: 'GET', from: '/shipping/:provider/rates', row: 'ship routes/shipping.ts', to: '/api/v2/ship/providers/{provider}/rates', qs: ['breadth','height','length','order_id','pickup_pincode','service_type','warehouse_id','weight'] },
  { m: 'GET', from: '/shipping/track/:p${provider ', row: 'ship modules/ship/routes/public.ts', to: '/api/v2/ship/public/shipments/{p${provider }/track', qs: ['provider'] },
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
  { m: 'GET', from: '/weight-disputes', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes', qs: ['awb','courier','from','limit','offset','status','to'] },
  { m: 'POST', from: '/weight-disputes', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes', bs: {'awb':'s','billed_cost':'m','billed_on':'s','billed_weight_g':'i','breadth_cm':'s','courier':'s','courier_ref':'s','declared_cost':'m','declared_weight_g':'i','divisor':'i','height_cm':'s','length_cm':'s','note':'s','order_number':'s','shipment_id':'s','status':'s'} },
  { m: 'GET', from: '/weight-disputes/:id', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}' },
  { m: 'POST', from: '/weight-disputes/:id/evidence', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}/evidence', bs: {'evidence':[{'kind':'s','text':'s','url':'s'}],'text':'s','url':'s'} },
  { m: 'POST', from: '/weight-disputes/:id/transition', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/{id}/transition', bs: {'courier_ref':'s','evidence':[{'kind':'s','text':'s','url':'s'}],'note':'s','refund_expected':'m','to':'s'} },
  { m: 'GET', from: '/weight-disputes/config', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/config' },
  { m: 'POST', from: '/weight-disputes/import', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/import', bs: {'#mp':'j','courier':'s','file':'f','weight_unit':'s'} },
  { m: 'GET', from: '/weight-disputes/summary', row: 'ship routes/weightDisputes.ts', to: '/api/v2/ship/weight-disputes/summary', qs: ['from','to'] },
];
