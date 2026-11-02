/**
 * Documents (books ROUTE_MAP `documents.ts`, `ar.ts`; commerce `documentLibrary.ts`): sales documents (invoices, credit notes, proformas) with issue/paid/send/convert/PDF, quotations, recurring invoices, receipts and allocations, challans, document templates, the order invoice and its configuration, and the file library.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { asList, mapList } from '../http';
import { majorToMinor } from '../money';
import { pageAs } from '../shape';
import type { Spec } from '../shape';
import { respelt, paiseMoney } from './payments';


/** A credit/debit note carries its number as `number` in v2; the notes desk reads `cn_number` / `dn_number`.
 *  SalesNoteView (books views/sales.rs:21) keeps the GST split only inside `tax_json` {cgst, sgst, igst} (rupees,
 *  books db/sales_docs.rs:88-131); the note card reads `cgst` / `sgst` / `igst` flat (SalesDocuments.tsx NotePanel). */
const withNumber = (field: string) => (d: any) => {
  const tj = (x: any) => (x?.tax_json && typeof x.tax_json === 'object' ? x.tax_json : null);
  const gst = (x: any, k: string) => x[k] ?? (tj(x) && tj(x)[k] !== undefined && tj(x)[k] !== null ? Number(tj(x)[k]) || 0 : undefined);
  const f = (x: any) => (x && typeof x === 'object' ? { ...x, [field]: x[field] ?? x.number, cgst: gst(x, 'cgst'), sgst: gst(x, 'sgst'), igst: gst(x, 'igst') } : x);
  return Array.isArray(d) ? mapList(d, f) : f(d);
};

/**
 * The document kernel's screens (DocumentDetail, DocumentComposer, ProformaInvoices) read every figure as paise
 * (`total_minor`, `taxable_minor`, a line's `unit_price_minor` …, services/api.ts "DOCUMENT KERNEL"). v2 sends them as
 * Money under the plain name (books `row_view` `total: minor @ "total_minor"`; openapi books.json), turned into rupees
 * by the envelope normaliser — the paise twins are put back beside them.
 */
const DOC_MONEY = ['subtotal', 'discount', 'taxable', 'tax', 'cgst', 'sgst', 'igst', 'round_off', 'total', 'amount_due', 'gross', 'order_discount_amount', 'unit_price', 'amount'];
const minorTwins = (x: any, currency?: string | null) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  const out: any = { ...x };
  for (const k of DOC_MONEY) if (typeof x[k] === 'number' && x[`${k}_minor`] === undefined) out[`${k}_minor`] = majorToMinor(x[k], currency);
  return out;
};
const docRow = (x: any) => {
  const out = minorTwins(x, x?.currency);
  if (out && Array.isArray(x.lines)) out.lines = x.lines.map((l: any) => minorTwins(l, x.currency));
  return out;
};
const docReply = (d: any) => (Array.isArray(d) ? mapList(d, docRow) : docRow(d));

/** The old routes took the order as `order` (id or number); books `NoteIn` / `ChallanIn` name it `order_id` (books
 *  api/sales_documents.rs:244-246, :490). SalesDocuments.tsx sends `{order}` for notes and challans. */
const orderIdIn = (spec: Spec) => respelt(spec, (b) => {
  if (b.order_id === undefined && b.orderId === undefined && (typeof b.order === 'string' || typeof b.order === 'number')) b.order_id = String(b.order);
  delete b.order;
});
/** `AllocationIn {order_id, amount: Money}` (books api/receipts.rs:155); PaymentsReceived sends `{orderId, allocatedRupees}`. */
const allocationsIn = (b: Record<string, any>) => {
  if (Array.isArray(b.allocations)) b.allocations = b.allocations.map((a: any) => (a && typeof a === 'object' ? { order_id: a.order_id ?? a.orderId, amount: a.amount ?? a.allocatedRupees ?? a.allocated_rupees } : a));
};
/** Books receipts send every figure as Money (books views/receivables.rs:218-270: `amount: minor @ "amount_minor"` …); the
 *  Payments Received screen reads the paise names, the list as `{rows, total, summary}` and open orders as `{rows}` keyed `order_id`. */
const RECEIPT_MONEY = ['amount', 'allocated', 'unallocated', 'order_total', 'total', 'outstanding'];
const receiptRow = (r: any) => {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
  const out: any = { ...r };
  for (const k of RECEIPT_MONEY) if (typeof r[k] === 'number' && r[`${k}_minor`] === undefined) out[`${k}_minor`] = majorToMinor(r[k]);
  if (Array.isArray(r.allocations)) out.allocations = r.allocations.map(receiptRow);
  return out;
};

export const DOCUMENT_ROUTES: V2Route[] = [
  { m: 'GET', from: '/document-templates', row: 'books documents.ts', to: '/api/v2/books/document-templates', qs: ['doc_type'] },
  { m: 'POST', from: '/document-templates', row: 'books documents.ts', to: '/api/v2/books/document-templates', bs: {'config':'j','doc_type':'s','name':'s'} },
  { m: 'PUT', from: '/document-templates/:id', row: 'books documents.ts', method: 'PATCH', to: '/api/v2/books/document-templates/{id}', bs: {'active':'b','config':'j','name':'s'} },
  { m: 'DELETE', from: '/document-templates/:id', row: 'books documents.ts', to: '/api/v2/books/document-templates/{id}' },
  { m: 'POST', from: '/document-templates/:id/publish', row: 'books documents.ts', to: '/api/v2/books/document-templates/{id}/publish', bs: 'j' },
  { m: 'POST', from: '/document-templates/:id/rollback', row: 'books documents.ts', to: '/api/v2/books/document-templates/{id}/rollback', bs: 'j' },
  { m: 'POST', from: '/document-templates/:id/set-default', row: 'books documents.ts', to: '/api/v2/books/document-templates/{id}/set-default', bs: 'j' },
  { m: 'GET', from: '/document-templates/meta', row: 'books documents.ts', to: '/api/v2/books/document-templates/meta' },
  { m: 'POST', from: '/document-templates/preview', row: 'books documents.ts', to: '/api/v2/books/document-templates/preview', bs: {'config':'j','context':'j','doc_type':'s'} },
  { m: 'GET', from: '/documents', row: 'books documents.ts', to: '/api/v2/books/documents', qs: ['as_of','from','kind','limit','offset','overdue','party_gstin','party_ref','search','sort','status','to'], rs: {'items':[{'lines':[{'tax_rate':'r'}]}]}, reply: docReply },
  { m: 'POST', from: '/documents', row: 'books documents.ts', to: '/api/v2/books/documents', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'GET', from: '/documents/:id', row: 'books documents.ts', to: '/api/v2/books/documents/{id}', rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'PUT', from: '/documents/:id', row: 'books documents.ts', method: 'PATCH', to: '/api/v2/books/documents/{id}', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'POST', from: '/documents/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/cancel', bs: {'reason':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'POST', from: '/documents/:id/convert', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/convert', bs: {'document_date':'s','issue':'b'}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'POST', from: '/documents/:id/credit-note', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/credit-note', bs: {'document_date':'s','lines':[{'line_id':'s','quantity':'s'}],'notes':'s','reason':'s','settle':{'auto_apply':'b','mode':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'GET', from: '/documents/:id/dispatches', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/dispatches',
    // DocumentDispatchesView {rows, total, sends} (books views/documents.rs:452); documentsAPI.dispatches wants the row array
    reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.rows) ? asList(d.rows, { total: d.total, sends: d.sends }) : d) },
  { m: 'POST', from: '/documents/:id/issue', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/issue', bs: {'acknowledge_duplicate':'b','date':'s','number':'s','settle':{'auto_apply':'b','mode':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'POST', from: '/documents/:id/paid', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/paid', bs: {'deductor_tan':'s','paid_at':'s','reference':'s','tds':'m','tds_section':'s'}, rs: {'lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'GET', from: '/documents/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/pdf', qs: ['download'] }, // download
  { m: 'POST', from: '/documents/:id/send', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/send', bs: {'channel':'s','to':'s'} },
  { m: 'GET', from: '/documents/:id/send-options', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/send-options' },
  { m: 'GET', from: '/documents/files', row: 'commerce documentLibrary.ts:129', to: '/api/v2/commerce/document-files', qs: ['folder_id'] },
  { m: 'POST', from: '/documents/files', row: 'commerce documentLibrary.ts:142', to: '/api/v2/commerce/document-files', bs: {'#mp':'j','file':'f','folder_id':'s','notes':'s'} },
  { m: 'DELETE', from: '/documents/files/:id', row: 'commerce documentLibrary.ts:186', method: 'POST', to: '/api/v2/commerce/document-files/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/documents/files/:id/url', row: 'commerce documentLibrary.ts:173', to: '/api/v2/commerce/document-files/{id}/url' },
  { m: 'GET', from: '/documents/folders', row: 'commerce documentLibrary.ts:58', to: '/api/v2/commerce/document-folders', qs: ['limit','offset','page','sort','q','parent_id'] },
  { m: 'POST', from: '/documents/folders', row: 'commerce documentLibrary.ts:69', to: '/api/v2/commerce/document-folders', bs: {'name':'s','parent_id':'j'} },
  { m: 'PUT', from: '/documents/folders/:id', row: 'commerce documentLibrary.ts:88', method: 'PATCH', to: '/api/v2/commerce/document-folders/{id}', bs: {'name':'s','parent_id':'j'} },
  { m: 'DELETE', from: '/documents/folders/:id', row: 'commerce documentLibrary.ts:115 (binary DELETE)', to: '/api/v2/commerce/document-folders/{id}' },
  { m: 'GET', from: '/documents/kinds', row: 'books documents.ts', to: '/api/v2/books/documents/kinds' },
  { m: 'GET', from: '/documents/last-rates', row: 'books documents.ts', to: '/api/v2/books/documents/last-rates', qs: ['limit','party_ref'], rs: [{'tax_rate':'r'}], reply: docReply },
  { m: 'GET', from: '/documents/next-number', row: 'books documents.ts', to: '/api/v2/books/documents/next-number', qs: ['date','kind'] },
  { m: 'POST', from: '/documents/preview', row: 'books documents.ts', to: '/api/v2/books/documents/preview', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'default_tax_rate':'r','lines':[{'tax_rate':'r'}]}, reply: docReply },
  { m: 'GET', from: '/invoices/config', row: 'books documents.ts', to: '/api/v2/books/invoice-config' },
  { m: 'PUT', from: '/invoices/config', row: 'books documents.ts', method: 'PATCH', to: '/api/v2/books/invoice-config', bs: {'bank':'j','declaration':'s','default_hsn':'s','document_title':'s','due_days':'i','gst_registrations':['j'],'licence_warning_days':'i','notes':'s','numbering':'j','seller':'j','terms':'s','theme':'j'} },
  { m: 'GET', from: '/invoices/order/:orderId', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}' },
  { m: 'PUT', from: '/invoices/order/:orderId/details', row: 'books documents.ts', method: 'PATCH', to: '/api/v2/books/order-invoices/{orderId}/details', bs: {'invoice_date':'s','invoice_number':'s','salesperson':'s'} },
  { m: 'POST', from: '/invoices/order/:orderId/issue', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}/issue', bs: 'j' },
  { m: 'POST', from: '/invoices/order/:orderId/manual', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}/manual', bs: {'#mp':'j','file':'f'} },
  { m: 'DELETE', from: '/invoices/order/:orderId/manual', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}/manual' },
  { m: 'GET', from: '/invoices/order/:orderId/pdf', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}/pdf', qs: ['inline'] }, // download
  { m: 'POST', from: '/invoices/order/:orderId/send', row: 'books documents.ts', to: '/api/v2/books/order-invoices/{orderId}/send', bs: {'channels':['s'],'email':'s','force':'b','invoice_url':'s','phone':'s','subject':'s'} },
  { m: 'POST', from: '/invoices/preview', row: 'books documents.ts', to: '/api/v2/books/invoice-config/preview', bs: {'config':'j'} }, // download
  { m: 'GET', from: '/quotations', row: 'books documents.ts', to: '/api/v2/books/quotations', qs: ['customer_id','limit','offset','status'] },
  { m: 'POST', from: '/quotations', row: 'books documents.ts', to: '/api/v2/books/quotations', bs: {'billing_address':'j','customer_email':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','items':[{'attributes':'j','product_id':'s','quantity':'s','sku':'s','variation_id':'s'}],'notes':'s','place_of_supply':'s','shipping_address':'j','valid_until':'s'} },
  { m: 'GET', from: '/quotations/:id', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}' },
  { m: 'POST', from: '/quotations/:id/accept', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}/accept', bs: 'j' },
  { m: 'POST', from: '/quotations/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/quotations/:id/convert', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}/convert', bs: 'j' },
  { m: 'GET', from: '/quotations/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}/pdf' }, // download
  { m: 'POST', from: '/quotations/:id/send', row: 'books documents.ts', to: '/api/v2/books/quotations/{id}/send', bs: 'j' },
  { m: 'GET', from: '/receipts', row: 'books ar.ts', to: '/api/v2/books/receipts', qs: ['advances_only','customer_id','from','limit','mode','offset','status','to'], reply: (d) => (Array.isArray(d) ? pageAs('rows')(mapList(d, receiptRow)) : d) }, // ReceiptsView {items, total, limit, summary} (books views/receivables.rs:265)
  { m: 'POST', from: '/receipts', row: 'books ar.ts', to: '/api/v2/books/receipts', body: respelt({'allocations':[{'amount':'m','order_id':'s'}],'amount':'m','bank_account_code':'s','customer_id':'s','customer_name':'s','mode':'s','notes':'s','receipt_date':'s','reference':'s'}, (b) => {
    // NewReceiptIn.amount: Money, required (books api/receipts.rs:197); PaymentsReceived sends amountRupees
    if (b.amount === undefined && b.amountRupees !== undefined) b.amount = b.amountRupees;
    delete b.amountRupees;
    allocationsIn(b);
  }) },
  { m: 'GET', from: '/receipts/:id', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}', reply: receiptRow }, // ReceiptView + allocations (books views/receivables.rs:243,232)
  { m: 'POST', from: '/receipts/:id/allocate', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}/allocate', body: respelt({'allocations':[{'amount':'m','order_id':'s'}]}, allocationsIn) },
  { m: 'POST', from: '/receipts/:id/void', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}/void', bs: {'void_date':'s'} },
  { m: 'GET', from: '/receipts/open-orders', row: 'books ar.ts', to: '/api/v2/books/receipts/open-orders', qs: ['customer_id'], reply: (d) => (Array.isArray(d) ? pageAs('rows')(mapList(d, (r: any) => ({ ...receiptRow(r), order_id: r?.order_id ?? r?.id }))) : d) }, // OpenOrderView {id, total, outstanding …} (books views/receivables.rs:218); the allocate panel reads payload.rows[].order_id / *_minor
  { m: 'GET', from: '/recurring-invoices', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices', qs: ['status'] },
  { m: 'POST', from: '/recurring-invoices', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices', body: respelt({'autosend':'b','billing_address':'j','customer_gstin':'s','customer_id':'s','customer_name':'s','day_of_period':'i','end_date':'s','frequency':'s','interval_count':'i','items':[{'description':'s','discount_percent':'s','product_id':'s','quantity':'s','sku':'s','tax_rule_id':'s','unit_price':'m','variation_id':'s'}],'max_occurrences':'i','notes':'s','payment_method':'s','payment_terms_days':'i','shipping_address':'j','shipping_cost':'m','start_date':'s','title':'s'}, (b) => {
    // ProfileItemIn.unit_price: Option<Money> (books api/recurring_invoices.rs:144); RecurringInvoices.tsx sends a line's unitPriceMinor (paise)
    if (Array.isArray(b.items)) b.items = b.items.map((it: any) => { if (!it || typeof it !== 'object') return it; const { unitPriceMinor, unit_price_minor, ...rest } = it; const m = unitPriceMinor ?? unit_price_minor; return rest.unit_price === undefined && rest.unitPrice === undefined && m !== undefined ? { ...rest, unit_price: paiseMoney(m) } : rest; });
  }) },
  { m: 'GET', from: '/recurring-invoices/:id', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}' },
  { m: 'DELETE', from: '/recurring-invoices/:id', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}' },
  { m: 'POST', from: '/recurring-invoices/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/recurring-invoices/:id/generate', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/generate', bs: {'as_of':'s'} },
  { m: 'POST', from: '/recurring-invoices/:id/pause', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/pause', bs: 'j' },
  { m: 'POST', from: '/recurring-invoices/:id/resume', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/resume', bs: 'j' },
  { m: 'GET', from: '/sales-docs/challans', row: 'books documents.ts', to: '/api/v2/books/challans', qs: ['limit','offset','order_id'] },
  { m: 'POST', from: '/sales-docs/challans', row: 'books documents.ts', to: '/api/v2/books/challans', body: orderIdIn({'notes':'s','order_id':'s','type':'s'}) },
  { m: 'GET', from: '/sales-docs/challans/:id', row: 'books documents.ts', to: '/api/v2/books/challans/{id}' },
  { m: 'GET', from: '/sales-docs/challans/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/challans/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/credit-notes', row: 'books documents.ts', to: '/api/v2/books/credit-notes', qs: ['limit','offset','order_id','status'], rs: {'items':[{'items':[{'tax_rate':'r'}]}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes', row: 'books documents.ts', to: '/api/v2/books/credit-notes', body: orderIdIn({'customer_email':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','items':[{'attributes':'j','product_id':'s','quantity':'s','sku':'s','variation_id':'s'}],'notes':'s','order_id':'s','place_of_supply':'s','reason':'s','restock':'b','settlement':'j'}), rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'GET', from: '/sales-docs/credit-notes/:id', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/cancel', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes/:id/issue', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/issue', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'GET', from: '/sales-docs/credit-notes/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/debit-notes', row: 'books documents.ts', to: '/api/v2/books/debit-notes', qs: ['limit','offset','order_id','status'], rs: {'items':[{'items':[{'tax_rate':'r'}]}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes', row: 'books documents.ts', to: '/api/v2/books/debit-notes', body: orderIdIn({'customer_email':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','items':[{'attributes':'j','product_id':'s','quantity':'s','sku':'s','variation_id':'s'}],'notes':'s','order_id':'s','place_of_supply':'s','reason':'s','restock':'b','settlement':'j'}), rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'GET', from: '/sales-docs/debit-notes/:id', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/cancel', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes/:id/issue', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/issue', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'GET', from: '/sales-docs/debit-notes/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/packing-slip/:orderId/pdf', row: 'books documents.ts', to: '/api/v2/books/orders/{orderId}/packing-slip' }, // download
];
