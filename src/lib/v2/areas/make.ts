/**
 * Purchasing and manufacturing (make ROUTE_MAP): vendors and their terms/portal, purchase orders, receipts (GRN), vendor bills, purchase returns, batches and serials, reorder suggestions, bills of material, work orders, vendor scorecards.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { isPage, mapList, v2http } from '../http';
import { majorToMinor, toMoney } from '../money';
import { pageAs, shapeBody, snake } from '../shape';
import { portalLegacy } from './trade';

/**
 * A make view answers Money `x` (make views/wire.rs `wire_value`: a stored `x_minor` becomes Money `x`), already rupees
 * here (http.ts); the screens read the old paise `x_minor` and divide by 100. `paise('x', …)` adds `x_minor` beside
 * every named rupee field at any depth (the legacy aliases add `xMinor`).
 */
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
/** A bare v2 list → the `{rows, total}` object the page reads, its rows given their paise twins. */
const rowsPaise = (...keys: string[]) => { const p = paise(...keys); return (d: any) => pageAs('rows')(p(d)); };

/**
 * VendorDetailView nests the terms (`terms {payment_mode, payment_due_days, credit_limit …}`, make views/vendors.rs:23,
 * composed from the vendor columns at domain/terms.rs:432-452); VendorForm.tsx:116-131 reads them flat under those
 * column names, money as paise.
 */
function vendorDetail(v: any): any {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const t = v.terms && typeof v.terms === 'object' ? v.terms : {};
  const minor = (x: unknown) => (typeof x === 'number' ? majorToMinor(x) : null);
  return {
    ...v,
    payment_terms_mode: v.payment_terms_mode ?? t.payment_mode ?? null, payment_terms_days: v.payment_terms_days ?? t.payment_due_days ?? null,
    credit_limit_minor: v.credit_limit_minor ?? minor(t.credit_limit), payment_notes: v.payment_notes ?? t.payment_notes ?? null,
    delivery_lead_days: v.delivery_lead_days ?? t.delivery_lead_days ?? null, freight_terms: v.freight_terms ?? t.freight_terms ?? null,
    incoterm: v.incoterm ?? t.incoterm ?? null, default_transporter: v.default_transporter ?? t.transporter ?? null,
    min_order_value_minor: v.min_order_value_minor ?? minor(t.min_order_value), delivery_notes: v.delivery_notes ?? t.delivery_notes ?? null,
    default_currency: v.default_currency ?? t.currency ?? null, gst_treatment: v.gst_treatment ?? t.gst_treatment ?? null,
  };
}

/** `<x>Rupees` / `<x>_rupees` → `<x>` (snake_case) at any depth, unless the body already names `<x>`. */
function unRupee(v: any): any {
  if (Array.isArray(v)) return v.map(unRupee);
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) return v;
  const out: any = {};
  for (const [k, x] of Object.entries(v)) {
    const base = /.(_r|R)upees$/.test(k) ? snake(k.replace(/_?[Rr]upees$/, '')) : null;
    if (!base) out[k] = unRupee(x);
    else if (v[base] === undefined && out[base] === undefined) out[base] = x;
  }
  return out;
}
/**
 * The screens name a Money input `<x>Rupees` (rupees: `unitCostRupees`, `amountRupees`, `cgstRupees` …) where the typed
 * body takes Money `<x>` (`unit_cost: Option<Money>` …, deny_unknown_fields): the shaper drops the old name, so the row
 * gets a body that re-spells it first and then runs the row's own `bs` (its 'm' leaves turn the rupees into Money).
 */
const rupeesBody = (r: V2Route): V2Route => ({ ...r, body: (c) => shapeBody(r.bs ?? null)({ ...c, body: unRupee(c.body) }) });

/** VendorForm.tsx:204-221 sends the terms flat, under the vendor columns' names; VendorBody takes them as `terms {…}` (TermsIn, make api/vendors.rs:126, :262). */
const TERM_KEYS: Record<string, string[]> = {
  payment_mode: ['payment_terms_mode', 'paymentTermsMode'], payment_due_days: ['payment_terms_days', 'paymentTermsDays'],
  credit_limit: ['creditLimit', 'credit_limit'], payment_notes: ['payment_notes', 'paymentNotes'],
  delivery_lead_days: ['delivery_lead_days', 'deliveryLeadDays'], freight_terms: ['freight_terms', 'freightTerms'],
  incoterm: ['incoterm'], transporter: ['default_transporter', 'defaultTransporter'],
  min_order_value: ['minOrderValue', 'min_order_value'], delivery_notes: ['delivery_notes', 'deliveryNotes'],
  currency: ['default_currency', 'defaultCurrency'], gst_treatment: ['gst_treatment', 'gstTreatment'],
};
/** …and `credit_limit` / `min_order_value` (rupees on the form) are Money in the terms' own `currency` (vendors.rs:122). */
const vendorTermsBody = (r: V2Route): V2Route => ({
  ...r,
  body: (c) => {
    const b: any = c.body && typeof c.body === 'object' && !Array.isArray(c.body) ? { ...c.body } : c.body;
    if (b && typeof b === 'object') {
      const terms: Record<string, any> = b.terms && typeof b.terms === 'object' ? { ...b.terms } : {};
      let moved = false;
      for (const [to, from] of Object.entries(TERM_KEYS)) {
        for (const k of from) if (k in b) { if (terms[to] === undefined) terms[to] = b[k]; delete b[k]; moved = true; }
      }
      if (moved || b.terms) {
        const cur = typeof terms.currency === 'string' && terms.currency.trim() ? terms.currency.trim().toUpperCase() : undefined;
        for (const k of ['credit_limit', 'min_order_value']) {
          if (typeof terms[k] === 'number' || (typeof terms[k] === 'string' && terms[k].trim() !== '')) terms[k] = toMoney(terms[k], cur);
        }
        b.terms = terms;
      }
    }
    return shapeBody(r.bs ?? null)({ ...c, body: b });
  },
});

export const MAKE_ROUTES: V2Route[] = [
  { m: 'GET', from: '/bom', row: 'make ', to: '/api/v2/make/boms', qs: ['active','limit','offset'] },
  { m: 'POST', from: '/bom', row: 'make ', to: '/api/v2/make/boms', bs: {'components':[{'component_variation_id':'s','qty_per':'i','scrap_pct':'d'}],'finished_variation_id':'s','name':'s','notes':'s','output_qty':'i'} },
  { m: 'GET', from: '/bom/:id', row: 'make ', to: '/api/v2/make/boms/{id}', reply: paise('estimated_cost', 'avg_cost') }, // BomView estimated_cost / components[].avg_cost Money; BillOfMaterials.tsx:298 reads estimated_cost_minor
  { m: 'PUT', from: '/bom/:id', row: 'make ', method: 'PATCH', to: '/api/v2/make/boms/{id}', bs: {'active':'b','components':[{'component_variation_id':'s','qty_per':'i','scrap_pct':'d'}],'name':'s','notes':'s','output_qty':'i'} },
  { m: 'POST', from: '/bom/:id/assemble', row: 'make ', to: '/api/v2/make/boms/{id}/assemble', bs: {'autobuild_subassemblies':'b','note':'s','qty':'i'}, reply: paise('total_cost', 'unit_cost') }, // BillOfMaterials.tsx:180 reads total_cost_minor
  { m: 'POST', from: '/bom/:id/explode', row: 'make ', to: '/api/v2/make/boms/{id}/explode', bs: {'qty':'i'} },
  { m: 'GET', from: '/bom/assemblies', row: 'make ', to: '/api/v2/make/assemblies', qs: ['limit','offset','status'], reply: paise('total_cost', 'unit_cost') }, // BillOfMaterials.tsx:396-397 read total_cost_minor / unit_cost_minor
  { m: 'GET', from: '/bom/assemblies/:aid', row: 'make ', to: '/api/v2/make/assemblies/{aid}' },
  { m: 'POST', from: '/bom/assemblies/:aid/cancel', row: 'make ', to: '/api/v2/make/assemblies/{aid}/cancel', bs: {'reason':'s'} },
  rupeesBody({ m: 'POST', from: '/purchasing/batches', row: 'make ', to: '/api/v2/make/batches', bs: {'b2b_price':'m','batch_number':'s','expiry_date':'s','mfg_date':'s','mode':'s','mrp':'m','purchase_date':'s','purchase_ref':'s','qty':'i','selling_price':'m','supplier_batch_ref':'s','unit_cost':'m','variation_id':'s'} }), // unitCostRupees → unit_cost (make api/purchasing/batches.rs:245 CreateBody)
  { m: 'GET', from: '/purchasing/batches/:id', row: 'make ', to: '/api/v2/make/batches/{id}' },
  { m: 'PATCH', from: '/purchasing/batches/:id', row: 'make ', to: '/api/v2/make/batches/{id}', bs: {'b2b_price':'m','batch_number':'s','expiry_date':'s','mfg_date':'s','mrp':'m','purchase_date':'s','purchase_ref':'s','selling_price':'m','supplier_batch_ref':'s'} },
  { m: 'GET', from: '/purchasing/batches/:id/placement', row: 'make ', to: '/api/v2/make/batches/{id}/placement' },
  { m: 'PUT', from: '/purchasing/batches/:id/quantity', row: 'make ', to: '/api/v2/make/batches/{id}/quantity', bs: {'movement_type':'s','qty':'i','reason':'s'} },
  // ERP-LOTS-1: one lot's own order window — stop selling it N days before expiry (null = the store's window).
  { m: 'PUT', from: '/purchasing/batches/:id/sell-window', row: 'make ERP-LOTS-1', to: '/api/v2/make/batches/{id}/sell-window', bs: {'stop_days':'i'} },
  { m: 'GET', from: '/purchasing/batches/by-product', row: 'make ', to: '/api/v2/make/batches/by-product', qs: ['include_depleted','limit','near_expiry_days','product_id','search','variation_id'] },
  { m: 'GET', from: '/purchasing/bills', row: 'make ', to: '/api/v2/make/bills', qs: ['limit','offset'], reply: rowsPaise('total') }, // VendorBills.tsx reads b.total_minor
  rupeesBody({ m: 'POST', from: '/purchasing/bills', row: 'make ', to: '/api/v2/make/bills', bs: {'bill_date':'s','bill_number':'s','cgst':'m','currency':'s','due_date':'s','fx_rate':'d','igst':'m','lines':[{'description':'s','gst_rate_pct':'d','hsn_sac':'s','itc_blocked_reason':'s','po_item_id':'s','qty':'i','reverse_charge':'b','unit_cost':'m','variation_id':'s'}],'notes':'s','po_id':'s','rcm_category':'s','rcm_section':'s','rcm_tax_type':'s','reverse_charge':'b','sgst':'m','vendor_id':'s'} }), // cgstRupees/sgstRupees/igstRupees, lines[].unitCostRupees → Money (purchasing/bills.rs:201, :215)
  { m: 'GET', from: '/purchasing/bills/:id', row: 'make ', to: '/api/v2/make/bills/{id}' },
  { m: 'POST', from: '/purchasing/bills/:id/approve', row: 'make ', to: '/api/v2/make/bills/{id}/approve', bs: 'j' },
  { m: 'POST', from: '/purchasing/bills/:id/hold', row: 'make ', to: '/api/v2/make/bills/{id}/hold', bs: {'reason':'s'} },
  { m: 'POST', from: '/purchasing/bills/:id/pay', row: 'make ', to: '/api/v2/make/bills/{id}/pay', bs: {'bank_account_id':'s','payment_account_code':'s','payment_date':'s','reference':'s','settlement_rate':'d'} },
  { m: 'POST', from: '/purchasing/bills/:id/release-hold', row: 'make ', to: '/api/v2/make/bills/{id}/release-hold', bs: 'j' },
  { m: 'POST', from: '/purchasing/bills/:id/resolve-variance', row: 'make ', to: '/api/v2/make/bills/{id}/resolve-variance', bs: {'note':'s','post_variance':'b','resolution':'s'} },
  { m: 'PUT', from: '/purchasing/bills/:id/tax-treatment', row: 'make ', to: '/api/v2/make/bills/{id}/tax-treatment', bs: {'lines':[{'gst_rate_pct':'d','hsn_sac':'s','id':'s','itc_blocked_reason':'s','reverse_charge':'b'}],'rcm_category':'s','rcm_section':'s','rcm_tax_type':'s','reverse_charge':'b'} },
  { m: 'GET', from: '/purchasing/bills/exceptions', row: 'make ', to: '/api/v2/make/bills/exceptions', qs: ['limit','offset','unresolved_only'] },
  { m: 'POST', from: '/purchasing/debit-notes', row: 'make ', to: '/api/v2/make/debit-notes', bs: {'amount':'m','bill_id':'s','credit_account_code':'s','reason':'s','vendor_id':'s'} },
  { m: 'POST', from: '/purchasing/grn/:grnId/allocate-landed', row: 'make ', to: '/api/v2/make/receipts/{grnId}/allocate-landed', bs: 'j', reply: paise('total') }, // Purchasing.tsx:330 reads totalMinor
  rupeesBody({ m: 'POST', from: '/purchasing/grn/:grnId/landed-cost', row: 'make ', to: '/api/v2/make/receipts/{grnId}/landed-cost', bs: {'amount':'m','basis':'s','cost_type':'s'} }), // amountRupees → amount (purchasing/batches.rs:397 LandedBody)
  { m: 'GET', from: '/purchasing/grn/:grnId/landed-cost', row: 'make ', to: '/api/v2/make/receipts/{grnId}/landed-cost' },
  { m: 'GET', from: '/purchasing/grn/:grnId/pack-checks', row: 'make ', to: '/api/v2/make/receipts/{grnId}/pack-checks' },
  { m: 'GET', from: '/purchasing/grn/:grnId/three-way', row: 'make ', to: '/api/v2/make/receipts/{grnId}/three-way' },
  { m: 'POST', from: '/purchasing/grn/:grnId/verify', row: 'make ', to: '/api/v2/make/receipts/{grnId}/verify', bs: {'note':'s','override_reason':'s'} },
  { m: 'GET', from: '/purchasing/inbound/chain/:grnId', row: 'make ', to: '/api/v2/make/receipts/{grnId}/chain' },
  { m: 'GET', from: '/purchasing/inbound/meta', row: 'make ', to: '/api/v2/make/inbound/meta' },
  { m: 'POST', from: '/purchasing/inbound/photos', row: 'make ', to: '/api/v2/make/inbound/photos', bs: {'#mp':'j'} },
  { m: 'POST', from: '/purchasing/inbound/photos/:target/:id', row: 'make ', to: '/api/v2/make/inbound/photos/{target}/{id}', bs: {'photos':[{'caption':'s','key':'s','url':'s'}]} },
  { m: 'DELETE', from: '/purchasing/inbound/photos/:target/:id', row: 'make ', to: '/api/v2/make/inbound/photos/{target}/{id}' },
  { m: 'POST', from: '/purchasing/inspections/:id/report', row: 'make ', to: '/api/v2/make/inspections/{id}/report', bs: 'j' },
  { m: 'GET', from: '/purchasing/inspections/:id/report.pdf', row: 'make ', to: '/api/v2/make/inspections/{id}/report.pdf' }, // download
  { m: 'GET', from: '/purchasing/pos', row: 'make ', to: '/api/v2/make/purchase-orders', qs: ['limit','offset'], reply: rowsPaise('subtotal') }, // PoRowView subtotal Money (make views/orders.rs:22); Purchasing.tsx:793 reads subtotal_minor
  rupeesBody({ m: 'POST', from: '/purchasing/pos', row: 'make ', to: '/api/v2/make/purchase-orders', bs: {'expected_date':'s','lines':[{'qty_ordered':'i','unit_cost':'m','variation_id':'s'}],'notes':'s','order_date':'s','ship_to_warehouse_id':'s','terms':{'credit_limit':'m','currency':'s','delivery_lead_days':'i','delivery_notes':'s','freight_terms':'s','gst_treatment':'s','incoterm':'s','min_order_value':'m','payment_due_days':'i','payment_mode':'s','payment_notes':'s','transporter':'s'},'vendor_id':'s'} }), // lines[].unitCostRupees → unit_cost (purchasing/orders.rs:175 PoLineIn)
  { m: 'GET', from: '/purchasing/pos/:id', row: 'make ', to: '/api/v2/make/purchase-orders/{id}', reply: paise('subtotal', 'unit_cost', 'landed_total') }, // PoItemView unit_cost, PoGrnView landed_total (make views/orders.rs:53, :65); Purchasing.tsx:862/:948, VendorBills.tsx:90 read *_minor
  { m: 'PUT', from: '/purchasing/pos/:id', row: 'make ', method: 'POST', to: '/api/v2/make/purchase-orders/{id}/amend', bs: {'add_lines':[{'qty_ordered':'i','unit_cost':'m','variation_id':'s'}],'expected_date':'s','lines':[{'po_item_id':'s','qty_ordered':'i','remove':'b','unit_cost':'m'}],'notes':'s','reason':'s'} },
  { m: 'GET', from: '/purchasing/pos/:id/amendments', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/amendments' },
  { m: 'GET', from: '/purchasing/pos/:id/billable', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/billable' },
  { m: 'POST', from: '/purchasing/pos/:id/cancel', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/cancel', bs: {'reason':'s'} },
  { m: 'POST', from: '/purchasing/pos/:id/close-short', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/close-short', bs: {'reason':'s'} },
  { m: 'POST', from: '/purchasing/pos/:id/issue', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/issue', bs: 'j' },
  { m: 'GET', from: '/purchasing/pos/:id/pdf', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/pdf' }, // download
  { m: 'POST', from: '/purchasing/pos/:id/receive', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/receive', bs: {'lines':[{'batch_number':'s','cartons_received':'i','expiry_date':'s','generate_lot':'b','inners_per_carton':'i','invoice_mrp':'m','invoice_qty':'i','invoice_rate':'m','mfg_date':'s','mfg_month':'s','mrp':'m','pack_qty_inner':'i','po_item_id':'s','qc_note':'s','qc_qty_failed':'i','qc_qty_passed':'i','qty':'i','serials':['s'],'shipment_item_id':'s'}],'notes':'s','staging_location_id':'s','vendor_shipment_id':'s'} },
  { m: 'POST', from: '/purchasing/pos/:id/reopen', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/reopen', bs: {'reason':'s'} },
  { m: 'PUT', from: '/purchasing/pos/:id/terms', row: 'make ', to: '/api/v2/make/purchase-orders/{id}/terms', bs: {'credit_limit':'m','currency':'s','delivery_lead_days':'i','delivery_notes':'s','freight_terms':'s','gst_treatment':'s','incoterm':'s','min_order_value':'m','payment_due_days':'i','payment_mode':'s','payment_notes':'s','transporter':'s'} },
  { m: 'GET', from: '/purchasing/pos/ageing', row: 'make ', to: '/api/v2/make/purchase-orders/ageing', qs: ['as_of','bucket','limit','offset','vendor_id'] },
  { m: 'GET', from: '/purchasing/rejections', row: 'make ', to: '/api/v2/make/rejections', qs: ['limit','offset','outcome','po_id'] },
  { m: 'POST', from: '/purchasing/rejections/:id/resolve', row: 'make ', to: '/api/v2/make/rejections/{id}/resolve', bs: {'note':'s','outcome':'s'} },
  { m: 'GET', from: '/purchasing/returns', row: 'make ', to: '/api/v2/make/purchase-returns', qs: ['limit','offset'], reply: rowsPaise('total') }, // Purchasing.tsx:1143 reads r.total_minor
  rupeesBody({ m: 'POST', from: '/purchasing/returns', row: 'make ', to: '/api/v2/make/purchase-returns', bs: {'grn_id':'s','lines':[{'batch_id':'s','qty':'i','unit_cost':'m','variation_id':'s'}],'reason':'s','vendor_id':'s'} }), // lines[].unitCostRupees → unit_cost (purchasing/orders.rs:233 ReturnLineIn)
  { m: 'GET', from: '/purchasing/returns/:id', row: 'make ', to: '/api/v2/make/purchase-returns/{id}', reply: paise('total', 'unit_cost', 'line_total') }, // Purchasing.tsx:1172-1173 read unit_cost_minor / line_total_minor
  { m: 'POST', from: '/purchasing/returns/:id/post', row: 'make ', to: '/api/v2/make/purchase-returns/{id}/post', bs: 'j' },
  { m: 'PATCH', from: '/purchasing/serial-tracking', row: 'make ', to: '/api/v2/make/serials/tracking', bs: {'enabled':'b','variation_id':'s'} },
  { m: 'GET', from: '/purchasing/serials', row: 'make ', to: '/api/v2/make/serials', qs: ['limit','q','status','variation_id'], reply: pageAs('rows') },
  { m: 'GET', from: '/purchasing/serials/:serialNo', row: 'make ', to: '/api/v2/make/serials/{serialNo}' },
  { m: 'POST', from: '/purchasing/serials/:serialNo/mark', row: 'make ', to: '/api/v2/make/serials/{serialNo}/mark', bs: {'action':'s','notes':'s','order_id':'s','variation_id':'s'} },
  { m: 'GET', from: '/purchasing/shipments', row: 'make ', to: '/api/v2/make/shipments', qs: ['limit','offset','po_id','status','vendor_id'], reply: pageAs('rows') },
  { m: 'POST', from: '/purchasing/shipments', row: 'make ', to: '/api/v2/make/shipments', bs: {'cartons':'i','dispatched_on':'s','eway_bill_no':'s','expected_date':'s','gross_weight_g':'i','invoice_currency':'s','invoice_date':'s','invoice_number':'s','invoice_value':'m','lines':[{'batch_number':'s','cartons':'i','expiry_date':'s','inners_per_carton':'i','invoice_mrp':'m','invoice_rate':'m','mfg_date':'s','mfg_month':'s','note':'s','pack_qty_inner':'i','po_item_id':'s','qty_shipped':'i','variation_id':'s'}],'lr_number':'s','notes':'s','po_id':'s','transporter':'s','vehicle_number':'s','vendor_id':'s'} },
  { m: 'GET', from: '/purchasing/shipments/:id', row: 'make ', to: '/api/v2/make/shipments/{id}' },
  { m: 'PATCH', from: '/purchasing/shipments/:id', row: 'make ', to: '/api/v2/make/shipments/{id}', bs: {'cartons':'i','dispatched_on':'s','eway_bill_no':'s','expected_date':'s','gross_weight_g':'i','invoice_currency':'s','invoice_date':'s','invoice_number':'s','invoice_value':'m','lr_number':'s','notes':'s','transporter':'s','vehicle_number':'s'} },
  { m: 'POST', from: '/purchasing/shipments/:id/cancel', row: 'make ', to: '/api/v2/make/shipments/{id}/cancel', bs: {'reason':'s'} },
  { m: 'GET', from: '/purchasing/shipments/:id/receive-plan', row: 'make ', to: '/api/v2/make/shipments/{id}/receive-plan' },
  { m: 'GET', from: '/purchasing/vendor-credits', row: 'make ', to: '/api/v2/make/vendor-credits', qs: ['limit','offset','status','vendor_id'] },
  { m: 'GET', from: '/purchasing/vendor-credits/:id', row: 'make ', to: '/api/v2/make/vendor-credits/{id}' },
  { m: 'POST', from: '/purchasing/vendor-credits/:id/apply', row: 'make ', to: '/api/v2/make/vendor-credits/{id}/apply', bs: {'amount':'m','bill_id':'s','note':'s'} },
  { m: 'POST', from: '/purchasing/vendor-credits/:id/cancel', row: 'make ', to: '/api/v2/make/vendor-credits/{id}/cancel', bs: {'reason':'s'} },
  { m: 'GET', from: '/purchasing/vendor-credits/summary', row: 'make ', to: '/api/v2/make/vendor-credits/summary', qs: ['vendor_id'] },
  { m: 'GET', from: '/reorder/config', row: 'make ', to: '/api/v2/make/reorder/config', reply: paise('ordering_cost') }, // Reorder.tsx:66 reads orderingCostMinor (also defaults.*)
  rupeesBody({ m: 'PUT', from: '/reorder/config', row: 'make ', to: '/api/v2/make/reorder/config', bs: {'holding_cost_pct_annual':'d','ordering_cost':'m','seasonality_enabled':'b'} }), // orderingCostRupees → ordering_cost (make api/reorder.rs:142 ConfigBody)
  { m: 'DELETE', from: '/reorder/config', row: 'make ', to: '/api/v2/make/reorder/config' },
  { m: 'POST', from: '/reorder/draft-pos', row: 'make ', to: '/api/v2/make/reorder/draft-purchase-orders', bs: {'variation_ids':['s']} },
  { m: 'GET', from: '/reorder/report', row: 'make ', to: '/api/v2/make/reorder/report', reply: rowsPaise('last_purchase_cost', 'unit_cost') }, // a Page with `summary`/`config` beside it: as an object so the aliases reach summary.belowThreshold … (Reorder.tsx), rows' *Minor (:382, :406)
  { m: 'GET', from: '/reorder/settings/:variationId', row: 'make ', to: '/api/v2/make/reorder/settings/{variationId}' },
  { m: 'PUT', from: '/reorder/settings/:variationId', row: 'make ', to: '/api/v2/make/reorder/settings/{variationId}', bs: {'max_stock':'i','reorder_point':'i','reorder_qty':'i','safety_stock':'i'} },
  { m: 'GET', from: '/reorder/vendors', row: 'make ', to: '/api/v2/make/reorder/vendors', qs: ['product_id','variation_id'], reply: paise('last_purchase_cost') }, // Reorder.tsx:481 reads lastPurchaseCostMinor
  rupeesBody({ m: 'POST', from: '/reorder/vendors', row: 'make ', to: '/api/v2/make/reorder/vendors', bs: {'is_preferred':'b','last_purchase_cost':'m','lead_time_days':'i','moq':'i','notes':'s','product_id':'s','variation_id':'s','vendor_id':'s','vendor_sku':'s'} }), // lastPurchaseCostRupees → last_purchase_cost (reorder.rs:169 MappingBody)
  { m: 'DELETE', from: '/reorder/vendors/:id', row: 'make ', to: '/api/v2/make/reorder/vendors/{id}' },
  { m: 'POST', from: '/reorder/vendors/:id/preferred', row: 'make ', to: '/api/v2/make/reorder/vendors/{id}/prefer', bs: 'j' },
  { m: 'GET', from: '/vendor-scorecard', row: 'make ', to: '/api/v2/make/scorecard', qs: ['from','to'] },
  { m: 'GET', from: '/vendor-scorecard/vendors/:id', row: 'make ', to: '/api/v2/make/scorecard/vendors/{id}', qs: ['from','to'] },
  { m: 'GET', from: '/vendor-scorecard/weights', row: 'make ', to: '/api/v2/make/scorecard/weights' },
  { m: 'PUT', from: '/vendor-scorecard/weights', row: 'make ', to: '/api/v2/make/scorecard/weights', bs: {'grade_a':'i','grade_b':'i','grade_c':'i','price_tolerance_pct':'i','w_fill':'i','w_on_time':'i','w_price':'i','w_quality':'i'} },
  { m: 'GET', from: '/vendors', row: 'make ', to: '/api/v2/make/vendors', qs: ['is_active','licence','limit','offset','search','state','status'], rs: {'items':[{'tds_rate_milli_pct':'r'}]} },
  vendorTermsBody({ m: 'POST', from: '/vendors', row: 'make ', to: '/api/v2/make/vendors', bs: {'bank_details':'j','business_name':'s','cin':'s','commission_pct':'d','country':'s','customer_id':'s','gst_number':'s','is_active':'b','is_non_resident':'b','licences':[{'issued_by':'s','label':'s','number':'s','state':'s','type':'s','valid_from':'s','valid_till':'s'}],'logo_url':'s','lower_deduction_cert':'s','msme_classification':'s','pan_number':'s','registered_address':{'city':'s','country':'s','line1':'s','line2':'s','pincode':'s','state':'s'},'slug':'s','tds_rate_milli_pct':'i','tds_section':'s','terms':{'credit_limit':'m','currency':'s','delivery_lead_days':'i','delivery_notes':'s','freight_terms':'s','gst_treatment':'s','incoterm':'s','min_order_value':'m','payment_due_days':'i','payment_mode':'s','payment_notes':'s','transporter':'s'},'udyam_number':'s'}, rs: {'vendor':{'tds_rate_milli_pct':'r'}} }), // flat terms → terms{…}; tds_rate_milli_pct stays the integer milli-percent the form sends (VendorBody Patch<i64>, vendors.rs:223)
  { m: 'GET', from: '/vendors/:id', row: 'make ', to: '/api/v2/make/vendors/{id}', reply: vendorDetail }, // no `rs`: VendorForm.tsx:120 divides tds_rate_milli_pct (RatePctMilli, an integer) by 1000 itself; flat terms for :116-131
  vendorTermsBody({ m: 'PUT', from: '/vendors/:id', row: 'make ', method: 'PATCH', to: '/api/v2/make/vendors/{id}', bs: {'bank_details':'j','business_name':'s','cin':'s','commission_pct':'d','country':'s','customer_id':'s','gst_number':'s','is_active':'b','is_non_resident':'b','licences':[{'issued_by':'s','label':'s','number':'s','state':'s','type':'s','valid_from':'s','valid_till':'s'}],'logo_url':'s','lower_deduction_cert':'s','msme_classification':'s','pan_number':'s','registered_address':{'city':'s','country':'s','line1':'s','line2':'s','pincode':'s','state':'s'},'slug':'s','tds_rate_milli_pct':'i','tds_section':'s','terms':{'credit_limit':'m','currency':'s','delivery_lead_days':'i','delivery_notes':'s','freight_terms':'s','gst_treatment':'s','incoterm':'s','min_order_value':'m','payment_due_days':'i','payment_mode':'s','payment_notes':'s','transporter':'s'},'udyam_number':'s'}, rs: {'vendor':{'tds_rate_milli_pct':'r'}} }), // flat terms → terms{…}; tds_rate_milli_pct stays the integer milli-percent the form sends (VendorBody Patch<i64>, vendors.rs:223)
  { m: 'DELETE', from: '/vendors/:id', row: 'make ', to: '/api/v2/make/vendors/{id}' },
  { m: 'POST', from: '/vendors/:id/portal-token', row: 'make ', to: '/api/v2/make/vendors/{id}/portal-links', bs: {'expires_at':'s','label':'s'} },
  { m: 'GET', from: '/vendors/:id/portal-links', row: 'make ', to: '/api/v2/make/vendors/{id}/portal-links' }, // PortalLinkRowView (MENU-1): never the code, at most its first characters (token_prefix)
  { m: 'POST', from: '/vendors/:id/portal-links/:link_id/revoke', row: 'make ', to: '/api/v2/make/vendors/{id}/portal-links/{link_id}/revoke' }, // MENU-1: the link opens nothing from then on
  { m: 'PUT', from: '/vendors/:id/status', row: 'make ', method: 'POST', to: '/api/v2/make/vendors/{id}/status', bs: {'status':'s'} },
  { m: 'GET', from: '/vendors/terms/meta', row: 'make ', to: '/api/v2/make/vendors/meta' },
  { m: 'GET', from: '/work-orders', row: 'make ', to: '/api/v2/make/work-orders', qs: ['assigned_to','bom_id','limit','offset','open_only','overdue','status'] },
  { m: 'POST', from: '/work-orders', row: 'make ', to: '/api/v2/make/work-orders', bs: {'assigned_to':'s','autobuild_subassemblies':'b','bom_id':'s','due_date':'s','notes':'s','priority':'i','qty_planned':'i','queue':'b'} },
  { m: 'GET', from: '/work-orders/:id', row: 'make ', to: '/api/v2/make/work-orders/{id}' },
  { m: 'PUT', from: '/work-orders/:id', row: 'make ', method: 'PATCH', to: '/api/v2/make/work-orders/{id}', bs: {'assigned_to':'s','autobuild_subassemblies':'b','due_date':'s','notes':'s','priority':'i','qty_planned':'i'} },
  { m: 'POST', from: '/work-orders/:id/cancel', row: 'make ', to: '/api/v2/make/work-orders/{id}/cancel', bs: {'reason':'s'} },
  { m: 'POST', from: '/work-orders/:id/complete', row: 'make ', to: '/api/v2/make/work-orders/{id}/complete', bs: 'j' },
  { m: 'POST', from: '/work-orders/:id/queue', row: 'make ', to: '/api/v2/make/work-orders/{id}/queue', bs: 'j' },
  { m: 'POST', from: '/work-orders/:id/release', row: 'make ', to: '/api/v2/make/work-orders/{id}/release', bs: 'j' },
  { m: 'POST', from: '/work-orders/:id/start', row: 'make ', to: '/api/v2/make/work-orders/{id}/start', bs: {'assigned_to':'s'} },
  { m: 'GET', from: '/work-orders/board', row: 'make ', to: '/api/v2/make/work-orders/board', qs: ['per_column'] },
  { m: 'GET', from: '/work-orders/holds/:variationId', row: 'make ', to: '/api/v2/make/work-orders/holds/{variationId}' },
  { m: 'POST', from: '/work-orders/preview', row: 'make ', to: '/api/v2/make/work-orders/preview', bs: {'autobuild_subassemblies':'b','bom_id':'s','qty':'i'} },
];

/* ── the supplier portal (pages/vendor/VendorPortal.tsx, outside the admin session) ─────────────────────────────── */

/** Old supplier-portal sub-path to v2 (`/api/v2/make/portal/*`, make api/vendor_portal.rs:112-147). */
function vendorPortalPath(path: string): string {
  const ack = /^\/pos\/([^/]+)\/ack$/.exec(path);
  if (ack) return `/purchase-orders/${encodeURIComponent(ack[1])}/ack`;
  return path === '/pos' ? '/purchase-orders' : path; // `/me` and `/bills` keep their names
}

/**
 * One supplier-portal call on v2, answered as the old page's `{ok, status, body}`. THE LINK IS THE AUTH: the access
 * code travels in `X-Portal-Token` (never the path or the query, make api/vendor_portal.rs:3-4); the store is the
 * page's own store key (v2http). A 401 is a dead link, as before. The answer reads as the old one: a Page becomes its
 * rows, every Money `x` also gives `x_minor` and every key a camelCase twin (`subtotalMinor`, `poNumber`), through the
 * partner portal's one converter.
 */
export async function vendorPortalCall(
  token: string, method: 'GET' | 'POST', path: string, payload?: unknown,
): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const res = await v2http.request({
      method, url: `/api/v2/make/portal${vendorPortalPath(path)}`,
      data: method === 'POST' ? (payload ?? {}) : undefined,
      headers: { 'x-portal-token': token },
    });
    const env = (res.data ?? {}) as { data?: unknown };
    const raw = env.data !== undefined ? env.data : env;
    return { ok: true, status: res.status, body: { success: true, data: portalLegacy(isPage(raw) ? raw.items : raw) } };
  } catch (e: any) {
    const r = e?.response;
    return { ok: false, status: r?.status ?? 0, body: r?.data ?? {} };
  }
}
