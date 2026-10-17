/**
 * Catalogue extras (commerce ROUTE_MAP): attributes and their values, tags, specifications, size charts, manufacturers, companies, FAQs and FAQ groups, variant groups, product bundles and quantity offers, custom fields, units of measure, product AI and duplicates, search.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { shapeBody } from '../shape';
import type { Spec } from '../shape';


const ATTR_VALUE: Spec = { attribute_id: 's', description: 'j', display_order: 'i', image_url: 'j', is_active: 'b', name: 's', size_chart: 'j', slug: 's', swatch_color: 'j', value: 'j' };

export const CATALOG_ROUTES: V2Route[] = [
  { m: 'POST', from: '/attributes', row: 'commerce attributes.ts:48', to: '/api/v2/commerce/attributes', bs: {'chart_type':'j','description':'j','display_order':'i','icon':'j','image_url':'j','is_active':'b','name':'s','show_as_product':'b','slug':'s','type':'s'} },
  { m: 'GET', from: '/attributes/:id', row: 'commerce attributes.ts:31', to: '/api/v2/commerce/public/attributes/{id}' },
  { m: 'PUT', from: '/attributes/:id', row: 'commerce attributes.ts:59', method: 'PATCH', to: '/api/v2/commerce/attributes/{id}', bs: {'chart_type':'j','description':'j','display_order':'i','icon':'j','image_url':'j','is_active':'b','name':'s','show_as_product':'b','slug':'s','type':'s'} },
  { m: 'DELETE', from: '/attributes/:id', row: 'commerce attributes.ts:67', to: '/api/v2/commerce/attributes/{id}' },
  { m: 'POST', from: '/attributes/:id/values', row: 'commerce attributes.ts:76 (attribute → body)', to: '/api/v2/commerce/attribute-values', body: (c) => shapeBody(ATTR_VALUE)({ ...c, body: { ...(c.body ?? {}), attribute_id: c.params.id } }) },
  { m: 'PUT', from: '/attributes/:attr/values/:valueId', row: 'commerce attributes.ts (value update → PATCH /attribute-values/{id})', method: 'PATCH', to: '/api/v2/commerce/attribute-values/{valueId}', body: (c) => { const b = shapeBody(ATTR_VALUE)(c) as Record<string, unknown>; delete b.attribute_id; return b; } },
  { m: 'DELETE', from: '/attributes/:id/values/:valueId', row: 'commerce attributes.ts:93', to: '/api/v2/commerce/attribute-values/{valueId}' },
  { m: 'GET', from: '/companies', row: 'commerce companies.ts:37', to: '/api/v2/commerce/companies', qs: ['limit','offset','role','search'] },
  { m: 'POST', from: '/companies', row: 'commerce companies.ts:69', to: '/api/v2/commerce/companies', bs: {'authorised_signatory':'s','cin':'s','display_name':'s','email':'s','entity_type':'s','gstin':'s','incorporation_date':'s','is_verified':'b','legal_name':'s','llpin':'s','logo_url':'s','notes':'s','pan':'s','phone':'s','registered_address':'j','registry_status':'s','roc_code':'s','roles':['s'],'tan':'s','website':'s'} },
  { m: 'GET', from: '/companies/:id', row: 'commerce companies.ts:55', to: '/api/v2/commerce/companies/{id}' },
  { m: 'PUT', from: '/companies/:id', row: 'commerce companies.ts:83', method: 'PATCH', to: '/api/v2/commerce/companies/{id}', bs: {'authorised_signatory':'s','cin':'s','display_name':'s','email':'s','entity_type':'s','gstin':'s','incorporation_date':'s','is_verified':'b','legal_name':'s','llpin':'s','logo_url':'s','notes':'s','pan':'s','phone':'s','registered_address':'j','registry_status':'s','roc_code':'s','roles':['s'],'tan':'s','website':'s'} },
  { m: 'DELETE', from: '/companies/:id', row: 'commerce companies.ts:94 (binary archive)', method: 'POST', to: '/api/v2/commerce/companies/{id}/archive', body: () => ({}) },
  { m: 'GET', from: '/custom-fields/defs', row: 'commerce customFields.ts:122', to: '/api/v2/commerce/custom-fields', qs: ['include_inactive'] },
  { m: 'POST', from: '/custom-fields/defs', row: 'commerce customFields.ts:131', to: '/api/v2/commerce/custom-fields', bs: {'active':'b','entity_type':'s','field_key':'s','field_type':'s','help_text':'s','label':'s','options':['j'],'required':'b','show_in_list':'b','sort_order':'i'} },
  { m: 'PUT', from: '/custom-fields/defs/:id', row: 'commerce customFields.ts:148', method: 'PATCH', to: '/api/v2/commerce/custom-fields/{id}', bs: {'active':'b','entity_type':'s','field_key':'s','field_type':'s','help_text':'s','label':'s','options':['j'],'required':'b','show_in_list':'b','sort_order':'i'} },
  { m: 'DELETE', from: '/custom-fields/defs/:id', row: 'commerce customFields.ts:171', method: 'POST', to: '/api/v2/commerce/custom-fields/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/custom-fields/defs/all', row: 'commerce customFields.ts:110', to: '/api/v2/commerce/custom-fields', qs: ['include_inactive'] },
  { m: 'GET', from: '/custom-fields/meta', row: 'commerce customFields.ts:97', to: '/api/v2/commerce/custom-fields/meta' },
  { m: 'GET', from: '/custom-fields/values/:entityType/:entityId', row: 'commerce customFields.ts:187', to: '/api/v2/commerce/custom-field-values/{entityType}/{entityId}' },
  { m: 'PUT', from: '/custom-fields/values/:entityType/:entityId', row: 'commerce customFields.ts:200', method: 'PATCH', to: '/api/v2/commerce/custom-field-values/{entityType}/{entityId}', body: (c) => ({ values: c.body?.values ?? c.body ?? {} }) },
  { m: 'POST', from: '/faq-groups', row: 'commerce faqGroups.ts:23', to: '/api/v2/commerce/faq-groups', bs: {'description':'j','display_order':'i','is_active':'b','name':'s'} },
  { m: 'GET', from: '/faq-groups/:id', row: 'commerce faqGroups.ts:15', to: '/api/v2/commerce/public/faq-groups/{id}' },
  { m: 'PUT', from: '/faq-groups/:id', row: 'commerce faqGroups.ts:34', method: 'PATCH', to: '/api/v2/commerce/faq-groups/{id}', bs: {'description':'j','display_order':'i','is_active':'b','name':'s'} },
  { m: 'DELETE', from: '/faq-groups/:id', row: 'commerce faqGroups.ts:42', to: '/api/v2/commerce/faq-groups/{id}' },
  { m: 'GET', from: '/faqs', row: 'commerce faqs.ts:7', to: '/api/v2/commerce/public/faqs', qs: ['group_id'] },
  { m: 'POST', from: '/faqs', row: 'commerce faqs.ts:26', to: '/api/v2/commerce/faqs', bs: {'answer':'s','display_order':'i','faq_group_id':'j','is_active':'b','question':'s'} },
  { m: 'GET', from: '/faqs/:id', row: 'commerce faqs.ts:18', to: '/api/v2/commerce/public/faqs/{id}' },
  { m: 'PUT', from: '/faqs/:id', row: 'commerce faqs.ts:39', method: 'PATCH', to: '/api/v2/commerce/faqs/{id}', bs: {'answer':'s','display_order':'i','faq_group_id':'j','is_active':'b','question':'s'} },
  { m: 'DELETE', from: '/faqs/:id', row: 'commerce faqs.ts:47', to: '/api/v2/commerce/faqs/{id}' },
  { m: 'POST', from: '/inventory/sheets/:sheet/import', row: 'commerce inventory.ts:1757', to: '/api/v2/commerce/inventory/sheets/{sheet}/import', bs: {'#mp':'j','country':'s','currency':'s','file':'f','market':'s'} },
  { m: 'GET', from: '/inventory/sheets/:sheet/template', row: 'commerce inventory.ts:1674', to: '/api/v2/commerce/inventory/sheets/{sheet}/template', qs: ['warehouse_code'] }, // download
  { m: 'POST', from: '/manufacturers', row: 'commerce manufacturers.ts:53', to: '/api/v2/commerce/manufacturers', bs: {'address':'j','country':'j','email':'j','is_active':'b','license_no':'j','logo_url':'j','name':'s','party_id':'j','phone':'j','slug':'s','website':'j'} },
  { m: 'PUT', from: '/manufacturers/:id', row: 'commerce manufacturers.ts:70', method: 'PATCH', to: '/api/v2/commerce/manufacturers/{id}', bs: {'address':'j','country':'j','email':'j','is_active':'b','license_no':'j','logo_url':'j','name':'s','party_id':'j','phone':'j','slug':'s','website':'j'} },
  { m: 'DELETE', from: '/manufacturers/:id', row: 'commerce manufacturers.ts:99', to: '/api/v2/commerce/manufacturers/{id}' },
  { m: 'GET', from: '/product-bundles', row: 'commerce productBundles.ts:8', to: '/api/v2/commerce/public/bundles' },
  { m: 'POST', from: '/product-bundles', row: 'commerce productBundles.ts:145', to: '/api/v2/commerce/bundles', bs: {'compare_at_price':'j','currency':'s','description':'j','images':'j','is_active':'j','name':'s','price':'m','slug':'j'} },
  { m: 'GET', from: '/product-bundles/:slug', row: 'commerce productBundles.ts:126', to: '/api/v2/commerce/public/bundles/{slug}' },
  { m: 'PUT', from: '/product-bundles/:id', row: 'commerce productBundles.ts:169', method: 'PATCH', to: '/api/v2/commerce/bundles/{id}', bs: {'compare_at_price':'j','currency':'s','description':'j','images':'j','is_active':'j','name':'s','price':'m','slug':'j'} },
  { m: 'DELETE', from: '/product-bundles/:id', row: 'commerce productBundles.ts:196', to: '/api/v2/commerce/bundles/{id}' },
  { m: 'GET', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:89 (binary quantity-offers)', to: '/api/v2/commerce/public/products/{productId}/quantity-offers' },
  { m: 'PUT', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:99', to: '/api/v2/commerce/products/{productId}/quantity-offers', bs: {'offers':[{'description':'s','price':'m','quantity':'i','title':'s'}]} },
  { m: 'DELETE', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:115', method: 'PUT', to: '/api/v2/commerce/products/{productId}/quantity-offers', bs: {'offers':[{'description':'s','price':'m','quantity':'i','title':'s'}]} },
  { m: 'GET', from: '/products/:id/duplicate', row: 'commerce — not in this binary', gap: 'the duplicate preview is not mounted in this binary (ROUTE_MAP: GET /products/{id}/duplicate-preview); duplicating itself works' },
  { m: 'POST', from: '/products/:id/generate-content', row: 'commerce — not in this binary', gap: 'whole-product AI content is not mounted in this binary (ROUTE_MAP: POST /products/{id}/ai/content); per-section and per-field AI are' },
  { m: 'POST', from: '/products/:id/generate-field', row: 'commerce products/products.ts:53', to: '/api/v2/commerce/products/{id}/ai/field', bs: {'custom_prompt':'s','field_path':'s','field_type':'s','section_id':'s'} },
  { m: 'POST', from: '/products/workbook/exports', row: 'commerce — not in this binary', gap: 'queued workbook exports have no v2 route (commerce ROUTE_MAP: no row); the direct workbook export works' },
  { m: 'GET', from: '/products/workbook/exports/:p1', row: 'commerce — not in this binary', gap: 'queued workbook exports have no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'POST', from: '/products/workbook/exports/:p1/share-link', row: 'commerce — not in this binary', gap: 'workbook export share links have no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'GET', from: '/search', row: 'commerce search.ts:16', to: '/api/v2/commerce/public/search', qs: ['kinds','limit','q'] },
  { m: 'POST', from: '/size-charts', row: 'commerce sizeCharts.ts:26', to: '/api/v2/commerce/size-charts', bs: {'attribute_id':'j','headers':'j','is_active':'b','name':'s','rows':'j'} },
  { m: 'GET', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:18', to: '/api/v2/commerce/public/size-charts/{id}' },
  { m: 'PUT', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:39', method: 'PATCH', to: '/api/v2/commerce/size-charts/{id}', bs: {'attribute_id':'j','headers':'j','is_active':'b','name':'s','rows':'j'} },
  { m: 'DELETE', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:47', to: '/api/v2/commerce/size-charts/{id}' },
  { m: 'POST', from: '/specifications', row: 'commerce specifications.ts:28', to: '/api/v2/commerce/specifications', bs: {'is_active':'b','items':'j','name':'s'} },
  { m: 'GET', from: '/specifications/:id', row: 'commerce specifications.ts:20', to: '/api/v2/commerce/public/specifications/{id}' },
  { m: 'PUT', from: '/specifications/:id', row: 'commerce specifications.ts:40', method: 'PATCH', to: '/api/v2/commerce/specifications/{id}', bs: {'is_active':'b','items':'j','name':'s'} },
  { m: 'DELETE', from: '/specifications/:id', row: 'commerce specifications.ts:56', to: '/api/v2/commerce/specifications/{id}' },
  { m: 'POST', from: '/specifications/:p1/assign-to-product', row: 'commerce — not in this binary', gap: 'assigning a specification set to a product has no v2 route (commerce ROUTE_MAP: no row; specifications are a Resource)' },
  { m: 'GET', from: '/specifications/product/:p1', row: 'commerce — not in this binary', gap: 'a product’s specification sets have no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'POST', from: '/tags', row: 'commerce tags.ts:31', to: '/api/v2/commerce/tags', bs: {'description':'j','is_active':'b','name':'s','slug':'s'} },
  { m: 'GET', from: '/tags/:id', row: 'commerce tags.ts:23', to: '/api/v2/commerce/public/tags/{id}' },
  { m: 'PUT', from: '/tags/:id', row: 'commerce tags.ts:66', method: 'PATCH', to: '/api/v2/commerce/tags/{id}', bs: {'description':'j','is_active':'b','name':'s','slug':'s'} },
  { m: 'DELETE', from: '/tags/:id', row: 'commerce tags.ts:74', to: '/api/v2/commerce/tags/{id}' },
  { m: 'POST', from: '/tags/bulk-create', row: 'commerce tags.ts:50', to: '/api/v2/commerce/tags/import', bs: {'rows':[{'description':'j','is_active':'b','name':'s','slug':'s'}]} },
  { m: 'GET', from: '/tags/slug/:slug', row: 'commerce tags.ts:15', to: '/api/v2/commerce/public/tags/slug/{slug}' },
  { m: 'POST', from: '/uom/conversions', row: 'commerce uom.ts:68 (binary per variation)', method: 'PUT', to: (c) => `/api/v2/commerce/uom/variations/${encodeURIComponent(String(c.body?.variationId ?? c.body?.variation_id ?? ''))}/conversions/${encodeURIComponent(String(c.body?.uomId ?? c.body?.uom_id ?? ''))}`, body: (c) => ({ to_base_factor: String(c.body?.toBaseFactor ?? c.body?.to_base_factor ?? '') }) },
  { m: 'POST', from: '/uom/defaults', row: 'commerce uom.ts:94 (binary per variation)', method: 'PUT', to: (c) => `/api/v2/commerce/uom/variations/${encodeURIComponent(String(c.body?.variationId ?? c.body?.variation_id ?? ''))}/defaults`, body: (c) => ({ purchase_uom_id: c.body?.purchaseUomId ?? c.body?.purchase_uom_id ?? null, sales_uom_id: c.body?.salesUomId ?? c.body?.sales_uom_id ?? null }) },
  { m: 'GET', from: '/uom/uoms', row: 'commerce uom.ts:30', to: '/api/v2/commerce/uom/units' },
  { m: 'GET', from: '/uom/variation/:variationId', row: 'commerce uom.ts:36', to: '/api/v2/commerce/uom/variations/{variationId}' },
  { m: 'GET', from: '/variant-groups', row: 'commerce variantGroups.ts:37', to: '/api/v2/commerce/variant-groups', qs: ['limit','offset','page','sort','q','name','is_active'] },
  { m: 'POST', from: '/variant-groups', row: 'commerce variantGroups.ts:51', to: '/api/v2/commerce/variant-groups', bs: {'display_attribute_slug':'j','is_active':'b','name':'s'} },
  { m: 'GET', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:43', to: '/api/v2/commerce/variant-groups/{id}' },
  { m: 'PUT', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:65', method: 'PATCH', to: '/api/v2/commerce/variant-groups/{id}', bs: {'display_attribute_slug':'j','is_active':'b','name':'s'} },
  { m: 'DELETE', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:101', to: '/api/v2/commerce/variant-groups/{id}' },
  { m: 'POST', from: '/variant-groups/:id/members', row: 'commerce variantGroups.ts:80', to: '/api/v2/commerce/variant-groups/{id}/members', bs: {'attribute_value':'s','is_default':'b','product_id':'s','sort_order':'i'} },
  { m: 'DELETE', from: '/variant-groups/:id/members/:productId', row: 'commerce variantGroups.ts:93', method: 'POST', to: '/api/v2/commerce/variant-groups/{id}/members/{productId}/remove', bs: 'j' },
];
