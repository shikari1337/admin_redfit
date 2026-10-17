/**
 * Documents (books ROUTE_MAP `documents.ts`, `ar.ts`; commerce `documentLibrary.ts`): sales documents (invoices, credit notes, proformas) with issue/paid/send/convert/PDF, quotations, recurring invoices, receipts and allocations, challans, document templates, the order invoice and its configuration, and the file library.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { mapList } from '../http';


/** A credit/debit note carries its number as `number` in v2; the notes desk reads `cn_number` / `dn_number`. */
const withNumber = (field: string) => (d: any) => {
  const f = (x: any) => (x && typeof x === 'object' ? { ...x, [field]: x[field] ?? x.number } : x);
  return Array.isArray(d) ? mapList(d, f) : f(d);
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
  { m: 'GET', from: '/documents', row: 'books documents.ts', to: '/api/v2/books/documents', qs: ['as_of','from','kind','limit','offset','overdue','party_gstin','party_ref','search','sort','status','to'], rs: {'items':[{'lines':[{'tax_rate':'r'}]}]} },
  { m: 'POST', from: '/documents', row: 'books documents.ts', to: '/api/v2/books/documents', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'GET', from: '/documents/:id', row: 'books documents.ts', to: '/api/v2/books/documents/{id}', rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'PUT', from: '/documents/:id', row: 'books documents.ts', method: 'PATCH', to: '/api/v2/books/documents/{id}', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'POST', from: '/documents/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/cancel', bs: {'reason':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'POST', from: '/documents/:id/convert', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/convert', bs: {'document_date':'s','issue':'b'}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'POST', from: '/documents/:id/credit-note', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/credit-note', bs: {'document_date':'s','lines':[{'line_id':'s','quantity':'s'}],'notes':'s','reason':'s','settle':{'auto_apply':'b','mode':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'GET', from: '/documents/:id/dispatches', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/dispatches' },
  { m: 'POST', from: '/documents/:id/issue', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/issue', bs: {'acknowledge_duplicate':'b','date':'s','number':'s','settle':{'auto_apply':'b','mode':'s','refund':{'amount':'m','bank_account_id':'s','mode':'s','note':'s','reference':'s','refunded_on':'s'}}}, rs: {'lines':[{'tax_rate':'r'}]} },
  { m: 'POST', from: '/documents/:id/paid', row: 'books documents.ts', to: '/api/v2/books/documents/{id}/paid', bs: {'deductor_tan':'s','paid_at':'s','reference':'s','tds':'m','tds_section':'s'}, rs: {'lines':[{'tax_rate':'r'}]} },
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
  { m: 'GET', from: '/documents/last-rates', row: 'books documents.ts', to: '/api/v2/books/documents/last-rates', qs: ['limit','party_ref'], rs: [{'tax_rate':'r'}] },
  { m: 'GET', from: '/documents/next-number', row: 'books documents.ts', to: '/api/v2/books/documents/next-number', qs: ['date','kind'] },
  { m: 'POST', from: '/documents/preview', row: 'books documents.ts', to: '/api/v2/books/documents/preview', bs: {'channel_id':'s','document_date':'s','due_date':'s','kind':'s','lines':[{'batch_number':'s','description':'s','detail':'s','discount':'m','discount_percent':'s','expiry_date':'s','item_kind':'s','item_ref':'s','period_from':'s','period_to':'s','quantity':'s','tax_code':'s','tax_rate':'r','unit':'s','unit_price':'m'}],'meta':{'number_plan':'j','payment_terms':'j','reference':'s','salesperson':'s','subject':'s','supply':'j','supply_date':'s','withholding':'j'},'notes':'s','order_discount':{'amount':'m','percent':'s'},'party':{'address':'j','company':'s','email':'s','gstin':'s','name':'s','phone':'s'},'party_kind':'s','party_ref':'s','place_of_supply':'s','reason':'s','seller_registration_id':'s','source':'s','source_ref':'s','status':'s','supply':'j','tax_inclusive':'b','terms':'j'}, rs: {'default_tax_rate':'r','lines':[{'tax_rate':'r'}]} },
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
  { m: 'GET', from: '/receipts', row: 'books ar.ts', to: '/api/v2/books/receipts', qs: ['advances_only','customer_id','from','limit','mode','offset','status','to'] },
  { m: 'POST', from: '/receipts', row: 'books ar.ts', to: '/api/v2/books/receipts', bs: {'allocations':[{'amount':'m','order_id':'s'}],'amount':'m','bank_account_code':'s','customer_id':'s','customer_name':'s','mode':'s','notes':'s','receipt_date':'s','reference':'s'} },
  { m: 'GET', from: '/receipts/:id', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}' },
  { m: 'POST', from: '/receipts/:id/allocate', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}/allocate', bs: {'allocations':[{'amount':'m','order_id':'s'}]} },
  { m: 'POST', from: '/receipts/:id/void', row: 'books ar.ts', to: '/api/v2/books/receipts/{id}/void', bs: {'void_date':'s'} },
  { m: 'GET', from: '/receipts/open-orders', row: 'books ar.ts', to: '/api/v2/books/receipts/open-orders', qs: ['customer_id'] },
  { m: 'GET', from: '/recurring-invoices', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices', qs: ['status'] },
  { m: 'POST', from: '/recurring-invoices', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices', bs: {'autosend':'b','billing_address':'j','customer_gstin':'s','customer_id':'s','customer_name':'s','day_of_period':'i','end_date':'s','frequency':'s','interval_count':'i','items':[{'description':'s','discount_percent':'s','product_id':'s','quantity':'s','sku':'s','tax_rule_id':'s','unit_price':'m','variation_id':'s'}],'max_occurrences':'i','notes':'s','payment_method':'s','payment_terms_days':'i','shipping_address':'j','shipping_cost':'m','start_date':'s','title':'s'} },
  { m: 'GET', from: '/recurring-invoices/:id', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}' },
  { m: 'DELETE', from: '/recurring-invoices/:id', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}' },
  { m: 'POST', from: '/recurring-invoices/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/cancel', bs: 'j' },
  { m: 'POST', from: '/recurring-invoices/:id/generate', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/generate', bs: {'as_of':'s'} },
  { m: 'POST', from: '/recurring-invoices/:id/pause', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/pause', bs: 'j' },
  { m: 'POST', from: '/recurring-invoices/:id/resume', row: 'books documents.ts', to: '/api/v2/books/recurring-invoices/{id}/resume', bs: 'j' },
  { m: 'GET', from: '/sales-docs/challans', row: 'books documents.ts', to: '/api/v2/books/challans', qs: ['limit','offset','order_id'] },
  { m: 'POST', from: '/sales-docs/challans', row: 'books documents.ts', to: '/api/v2/books/challans', bs: {'notes':'s','order_id':'s','type':'s'} },
  { m: 'GET', from: '/sales-docs/challans/:id', row: 'books documents.ts', to: '/api/v2/books/challans/{id}' },
  { m: 'GET', from: '/sales-docs/challans/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/challans/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/credit-notes', row: 'books documents.ts', to: '/api/v2/books/credit-notes', qs: ['limit','offset','order_id','status'], rs: {'items':[{'items':[{'tax_rate':'r'}]}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes', row: 'books documents.ts', to: '/api/v2/books/credit-notes', bs: {'customer_email':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','items':[{'attributes':'j','product_id':'s','quantity':'s','sku':'s','variation_id':'s'}],'notes':'s','order_id':'s','place_of_supply':'s','reason':'s','restock':'b','settlement':'j'}, rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'GET', from: '/sales-docs/credit-notes/:id', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/cancel', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'POST', from: '/sales-docs/credit-notes/:id/issue', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/issue', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('cn_number') },
  { m: 'GET', from: '/sales-docs/credit-notes/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/credit-notes/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/debit-notes', row: 'books documents.ts', to: '/api/v2/books/debit-notes', qs: ['limit','offset','order_id','status'], rs: {'items':[{'items':[{'tax_rate':'r'}]}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes', row: 'books documents.ts', to: '/api/v2/books/debit-notes', bs: {'customer_email':'s','customer_id':'s','customer_name':'s','customer_phone':'s','gstin':'s','items':[{'attributes':'j','product_id':'s','quantity':'s','sku':'s','variation_id':'s'}],'notes':'s','order_id':'s','place_of_supply':'s','reason':'s','restock':'b','settlement':'j'}, rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'GET', from: '/sales-docs/debit-notes/:id', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes/:id/cancel', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/cancel', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'POST', from: '/sales-docs/debit-notes/:id/issue', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/issue', bs: 'j', rs: {'items':[{'tax_rate':'r'}]}, reply: withNumber('dn_number') },
  { m: 'GET', from: '/sales-docs/debit-notes/:id/pdf', row: 'books documents.ts', to: '/api/v2/books/debit-notes/{id}/pdf' }, // download
  { m: 'GET', from: '/sales-docs/packing-slip/:orderId/pdf', row: 'books documents.ts', to: '/api/v2/books/orders/{orderId}/packing-slip' }, // download
];
