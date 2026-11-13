/**
 * Catalogue extras (commerce ROUTE_MAP): attributes and their values, tags, specifications, size charts, manufacturers, companies, FAQs and FAQ groups, variant groups, product bundles and quantity offers, custom fields, units of measure, product AI and duplicates, search.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Ctx, V2Route } from '../routes';
import { v2call, asList } from '../http';
import { shapeBody } from '../shape';
import type { Spec } from '../shape';


// a pack: `price` (the pack's total) OR `discount_percent` (off each unit); `at_least` = N or more; `variation_id` = one variation (growcord-rs api/catalog_mgmt/product_bundles.rs OfferBody)
const QTY_OFFERS: Spec = { offers: [{ at_least: 'b', description: 's', discount_percent: 'd', price: 'm', quantity: 'i', title: 's', variation_id: 's' }] };
const BUNDLE: Spec = { compare_at_price: 'm', currency: 's', description: 'j', images: 'j', is_active: 'b', name: 's', price: 'm', slug: 'j' };
const BUNDLE_ITEMS: Spec = { items: [{ product_id: 's', quantity: 'i', discount_percent: 'd' }] };
const BUNDLE_ID = /^[0-9a-f-]{36}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One catalogue record for its editor (MENU-1 taxonomy): an id goes to the staff Resource read, any state
 * (the public read answers active rows only, so an inactive tag or attribute could not be opened); a slug
 * keeps the public read.
 */
const staffOrPublic = (resource: string) => (c: V2Ctx): string => {
  const key = encodeURIComponent(c.params.id ?? '');
  return UUID_RE.test(c.params.id ?? '') ? `/api/v2/commerce/${resource}/${key}` : `/api/v2/commerce/public/${resource}/${key}`;
};

/** The legacy list query (`active`, `search`) → the resource's filters; every bundle on one page. */
function bundleListQuery(c: V2Ctx): Record<string, unknown> {
  const q = c.query || {};
  const out: Record<string, unknown> = { limit: 200 };
  const active = q.active ?? q.is_active ?? q.isActive;
  if (active !== undefined && active !== '') out.is_active = String(active) === 'true';
  const search = String(q.search ?? q.q ?? '').trim();
  if (search) out.q = search;
  return out;
}

/**
 * A bundle saved as the old route saved it (fields and items in one request): the resource write,
 * then its items replaced when the screen sent them, answering the bundle with its items.
 */
async function saveBundle(c: V2Ctx, id: string | null): Promise<unknown> {
  const body = (c.body ?? {}) as Record<string, unknown>;
  const fields = shapeBody(BUNDLE)({ ...c, body: { ...body, items: undefined } }) as Record<string, unknown>;
  const saved = id
    ? await v2call<Record<string, unknown>>('PATCH', `/api/v2/commerce/bundles/${encodeURIComponent(id)}`, { data: fields })
    : await v2call<Record<string, unknown>>('POST', '/api/v2/commerce/bundles', { data: fields });
  const bundleId = String(id ?? saved?.id ?? '');
  if (!bundleId) return saved;
  if (!Array.isArray(body.items)) return saved;
  const items = shapeBody(BUNDLE_ITEMS)({ ...c, body: { items: body.items } });
  return v2call('PUT', `/api/v2/commerce/bundles/${encodeURIComponent(bundleId)}/items`, { data: items });
}

/* ── specifications: the form's sections and the table's `items` ─────────────────────────────────────
 * `product_specifications.items` is a list of rows `{label, value}` (the sheet import's own shape, commerce
 * domain/catalog_mgmt/workbook.rs parse_spec_items_cell). A row may carry `group`: the section heading the
 * form shows it under and the shop's product page groups it by. The form edits sections; these two
 * functions are the only translation between the two shapes. */

export interface SpecSection { heading: string; items: Array<{ key: string; value: string }> }

const cellText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** The form's sections as the table's rows (blank rows left out). */
export function specItems(sections: unknown): Array<Record<string, string>> {
  if (!Array.isArray(sections)) return [];
  const out: Array<Record<string, string>> = [];
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const heading = cellText((s as any).heading).trim();
    const rows: any[] = Array.isArray((s as any).items) ? (s as any).items : [];
    for (const it of rows) {
      const label = cellText(it?.key ?? it?.label).trim();
      const value = cellText(it?.value).trim();
      if (!label && !value) continue;
      out.push(heading ? { label, value, group: heading } : { label, value });
    }
  }
  return out;
}

/** The table's rows (flat `{label, value, group}`, or already grouped `{heading, items}`) as the form's sections, first-seen order. */
export function specSections(items: unknown): SpecSection[] {
  if (!Array.isArray(items)) return [];
  const out: SpecSection[] = [];
  const section = (heading: string): SpecSection => {
    let s = out.find((x) => x.heading === heading);
    if (!s) { s = { heading, items: [] }; out.push(s); }
    return s;
  };
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, any>;
    if (Array.isArray(r.items)) {
      const s = section(cellText(r.heading).trim());
      for (const x of r.items) s.items.push({ key: cellText(x?.key ?? x?.label ?? x?.name), value: cellText(x?.value) });
      continue;
    }
    section(cellText(r.group ?? r.heading).trim()).items.push({ key: cellText(r.label ?? r.key ?? r.name), value: cellText(r.value) });
  }
  return out;
}

/** A specification row with the form's `sections` beside the stored `items`. */
export function specRow(r: any): any {
  return r && typeof r === 'object' && !Array.isArray(r) ? { ...r, sections: specSections(r.items) } : r;
}

/** The form's body (`name`, `sections` or `items`, `isActive`) as the resource input; `slug` and `productId` have no column. */
function specBody(c: V2Ctx): Record<string, unknown> {
  const b = (c.body ?? {}) as Record<string, any>;
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) out.name = cellText(b.name).trim();
  if (Array.isArray(b.items)) out.items = b.items;
  else if (b.sections !== undefined) out.items = specItems(b.sections);
  const active = b.is_active ?? b.isActive;
  if (active !== undefined) out.is_active = active === true || active === 'true';
  return out;
}

/* ── size charts: the page's measurement table and the table's `headers` + `rows` ────────────────────
 * `size_charts` (tenant schema) keeps `headers` (the column keys, `size` first) and `rows` (one object per
 * size, keyed by those headers). The page edits `measurementKeys` and `entries`; the table has no
 * description or image column, so those two stay on the screen only. */

const SIZE_KEY = 'size';

/** A size chart row with the page's `measurementKeys` and `entries` beside the stored `headers` and `rows`. */
export function sizeChartRow(r: any): any {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
  const headers: string[] = Array.isArray(r.headers) ? r.headers.map(cellText).filter(Boolean) : [];
  const rows: any[] = Array.isArray(r.rows) ? r.rows : [];
  const entries = rows.map((row) => {
    if (Array.isArray(row)) {
      // a positional row: the headers name its cells
      const e: Record<string, string> = {};
      row.forEach((v, i) => { const k = headers[i] ?? `col${i + 1}`; e[k.toLowerCase() === SIZE_KEY ? SIZE_KEY : k] = cellText(v); });
      return e;
    }
    return row && typeof row === 'object' ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cellText(v)])) : { [SIZE_KEY]: cellText(row) };
  });
  const keys = headers.filter((h) => h.toLowerCase() !== SIZE_KEY);
  const measurementKeys = keys.length ? keys : Array.from(new Set(entries.flatMap((e) => Object.keys(e)).filter((k) => k !== SIZE_KEY && k !== 'imageUrl')));
  return { ...r, measurementKeys, entries };
}

/** The page's body (`name`, `measurementKeys`, `entries`) as the resource input. */
function sizeChartBody(c: V2Ctx): Record<string, unknown> {
  const b = (c.body ?? {}) as Record<string, any>;
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) out.name = cellText(b.name).trim();
  const keys: string[] = Array.isArray(b.measurementKeys ?? b.measurement_keys)
    ? (b.measurementKeys ?? b.measurement_keys).map(cellText).map((k: string) => k.trim()).filter((k: string) => k && k !== SIZE_KEY)
    : [];
  if (Array.isArray(b.entries)) {
    const headers = [SIZE_KEY, ...keys];
    out.headers = headers;
    out.rows = b.entries.map((e: any) => {
      const row: Record<string, string> = {};
      for (const k of headers) row[k] = cellText(e?.[k]).trim();
      if (e?.imageUrl) row.imageUrl = cellText(e.imageUrl).trim();
      return row;
    });
  } else {
    if (Array.isArray(b.headers)) out.headers = b.headers;
    if (Array.isArray(b.rows)) out.rows = b.rows;
  }
  const attr = b.attribute_id ?? b.attributeId;
  if (attr !== undefined) out.attribute_id = attr || null;
  const active = b.is_active ?? b.isActive;
  if (active !== undefined) out.is_active = active === true || active === 'true';
  return out;
}

/* ── the product workbook through the download queue ─────────────────────────────────────────────────
 * The queue (commerce api/catalog_mgmt/data_jobs.rs, dataset `product_workbook`, svc/downloads.rs:83) builds
 * the file in the background and keeps it for the dataset's retention; a download is a two-minute signed
 * ticket (POST /exports/{id}/download-link), so the screen asks for a fresh one on every click. */
const workbookExportBody = (c: V2Ctx) => ({ dataset: 'product_workbook', params: { entity: cellText(c.body?.entity).trim() || 'catalog' } });

const ATTR_VALUE: Spec = { attribute_id: 's', description: 'j', display_order: 'i', image_url: 'j', is_active: 'b', name: 's', size_chart: 'j', slug: 's', swatch_color: 'j', value: 'j' };

const VARIANT_GROUP: Spec = { display_attribute_slug: 'j', is_active: 'b', name: 's' };
const VARIANT_MEMBERS: Spec = { members: [{ product_id: 's', attribute_value: 's', sort_order: 'i', is_default: 'b' }] };

/**
 * A variant group saved as the old route saved it (fields and `members[]` in one request, variantGroups.ts:51-78):
 * the resource write takes only the fields, so the members go to PUT /variant-groups/{id}/members (the whole set;
 * commerce api/catalog_mgmt/variant_groups.rs:45, ReplaceBody :141). Answers the hydrated group with its members.
 */
async function saveVariantGroup(c: V2Ctx, id: string | null): Promise<unknown> {
  const body = (c.body ?? {}) as Record<string, unknown>;
  const fields = shapeBody(VARIANT_GROUP)({ ...c, body: { ...body, members: undefined } }) as Record<string, unknown>;
  const saved = id
    ? await v2call<Record<string, unknown>>('PATCH', `/api/v2/commerce/variant-groups/${encodeURIComponent(id)}`, { data: fields })
    : await v2call<Record<string, unknown>>('POST', '/api/v2/commerce/variant-groups', { data: fields });
  const groupId = String(id ?? saved?.id ?? '');
  if (!groupId || !Array.isArray(body.members)) return saved;
  const members = shapeBody(VARIANT_MEMBERS)({ ...c, body: { members: body.members } });
  return v2call('PUT', `/api/v2/commerce/variant-groups/${encodeURIComponent(groupId)}/members`, { data: members });
}

/** The legacy `?type=` (one kind, or a comma list) is v2's `kinds`. */
function searchQuery(c: V2Ctx): Record<string, unknown> {
  const q = c.query || {};
  return { q: q.q ?? q.search, kinds: q.kinds ?? q.type, limit: q.limit };
}

/**
 * SearchView `{kinds: [{kind, items: [{id, kind, title, subtitle, slug, thumbnail}], total, limit}]}` (commerce
 * views/storefront.rs:306-335); searchAPI reads `{id, label, sublabel, type}` rows: one kind asked → its rows,
 * several → a map by kind (services/api.ts searchAPI.query / queryMany).
 */
function searchReply(d: any, c: V2Ctx): any {
  if (!d || typeof d !== 'object' || !Array.isArray(d.kinds)) return d;
  const hit = (h: any) => (h && typeof h === 'object' ? { ...h, label: h.title, sublabel: h.subtitle ?? undefined, type: h.kind } : h);
  const byKind: Record<string, unknown> = {};
  for (const k of d.kinds) {
    if (k && typeof k === 'object') byKind[String(k.kind)] = asList((Array.isArray(k.items) ? k.items : []).map(hit), { total: k.total, limit: k.limit });
  }
  const asked = String(c.query?.kinds ?? c.query?.type ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (asked.length > 1) return byKind;
  const one = d.kinds[0];
  return one && typeof one === 'object' ? byKind[String(one.kind)] : asList([], { total: 0 });
}

export const CATALOG_ROUTES: V2Route[] = [
  { m: 'POST', from: '/attributes', row: 'commerce attributes.ts:48', to: '/api/v2/commerce/attributes', bs: {'chart_type':'j','description':'j','display_order':'i','icon':'j','image_url':'j','is_active':'b','name':'s','show_as_product':'b','slug':'s','type':'s'} },
  { m: 'GET', from: '/attributes/:id', row: 'commerce attributes.ts:31 (staff read by id, any state)', to: staffOrPublic('attributes') },
  { m: 'PUT', from: '/attributes/:id', row: 'commerce attributes.ts:59', method: 'PATCH', to: '/api/v2/commerce/attributes/{id}', bs: {'chart_type':'j','description':'j','display_order':'i','icon':'j','image_url':'j','is_active':'b','name':'s','show_as_product':'b','slug':'s','type':'s'} },
  { m: 'DELETE', from: '/attributes/:id', row: 'commerce attributes.ts:67', to: '/api/v2/commerce/attributes/{id}' },
  // ATTR-ORDER: the store's attribute order (product page selectors, listing filters); answers {items:[{id, slug, display_order}]}.
  { m: 'PUT', from: '/attributes/order', row: 'commerce new: PUT /attributes/order (ATTR-ORDER)', to: '/api/v2/commerce/attributes/order', bs: { ids: ['s'] } },
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
  // The editor opens from the full record (the list leaves `address` out; MENU-1 taxonomy).
  { m: 'GET', from: '/manufacturers/:id', row: 'commerce manufacturers.ts:41 R:Manufacturer.read', to: '/api/v2/commerce/manufacturers/{id}' },
  // Combo bundles: the bundle's own fields are the `Bundle` resource; its items are their own route
  // (PUT /bundles/{id}/items), so a save is two calls. The staff reads (`/bundles`, `/bundles/{id}/items`)
  // answer paused bundles too; the public reads answer active ones only.
  { m: 'GET', from: '/product-bundles', row: 'commerce productBundles.ts:8 (staff list: every status, item_count)', to: '/api/v2/commerce/bundles', query: bundleListQuery },
  { m: 'POST', from: '/product-bundles', row: 'commerce productBundles.ts:145 (bundle, then its items)', run: (c) => saveBundle(c, null) },
  { m: 'GET', from: '/product-bundles/:slug', row: 'commerce productBundles.ts:126 (id → staff read, any status; slug → public)', to: (c) => (BUNDLE_ID.test(c.params.slug) ? `/api/v2/commerce/bundles/${encodeURIComponent(c.params.slug)}/items` : `/api/v2/commerce/public/bundles/${encodeURIComponent(c.params.slug)}`) },
  { m: 'PUT', from: '/product-bundles/:id', row: 'commerce productBundles.ts:169 (bundle, then its items)', run: (c) => saveBundle(c, c.params.id) },
  { m: 'DELETE', from: '/product-bundles/:id', row: 'commerce productBundles.ts:196', to: '/api/v2/commerce/bundles/{id}' },
  // Quantity offers: the screen sends `{bundles}` (the old body); v2 takes `{offers}`.
  { m: 'GET', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:89 (binary quantity-offers)', to: '/api/v2/commerce/public/products/{productId}/quantity-offers' },
  { m: 'PUT', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:99', to: '/api/v2/commerce/products/{productId}/quantity-offers', body: (c) => shapeBody(QTY_OFFERS)({ ...c, body: { offers: c.body?.offers ?? c.body?.bundles ?? [] } }) },
  { m: 'DELETE', from: '/product-bundles/product/:productId/quantity', row: 'commerce productBundles.ts:115 (an empty list removes them)', method: 'PUT', to: '/api/v2/commerce/products/{productId}/quantity-offers', body: () => ({ offers: [] }) },
  { m: 'GET', from: '/products/:id/duplicate', row: 'commerce — not in this binary', gap: 'the duplicate preview is not mounted in this binary (ROUTE_MAP: GET /products/{id}/duplicate-preview); duplicating itself works' },
  { m: 'POST', from: '/products/:id/generate-content', row: 'commerce — not in this binary', gap: 'whole-product AI content is not mounted in this binary (ROUTE_MAP: POST /products/{id}/ai/content); per-section and per-field AI are' },
  { m: 'POST', from: '/products/:id/generate-field', row: 'commerce products/products.ts:53', to: '/api/v2/commerce/products/{id}/ai/field', bs: {'custom_prompt':'s','field_path':'s','field_type':'s','section_id':'s'} },
  // MENU-1 products: the product workbook is the download queue's `product_workbook` dataset (see workbookExportBody).
  { m: 'POST', from: '/products/workbook/exports', row: 'commerce dataJobs.ts:68 (dataset product_workbook)', to: '/api/v2/commerce/exports', body: workbookExportBody },
  { m: 'GET', from: '/products/workbook/exports/:p1', row: 'commerce dataJobs.ts:121', to: '/api/v2/commerce/exports/{p1}' },
  { m: 'POST', from: '/products/workbook/exports/:p1/share-link', row: 'commerce dataJobs.ts:204 (a two-minute signed link)', to: '/api/v2/commerce/exports/{p1}/download-link', body: () => ({}) },
  // raw: a map by kind must not grow camelCase twins (`attribute_value` → `attributeValue`); the readers take id/label/sublabel/type.
  { m: 'GET', from: '/search', row: 'commerce search.ts:16', to: '/api/v2/commerce/public/search', qs: ['kinds','limit','q'], query: searchQuery, reply: searchReply, raw: true },
  // MENU-1 products: the page's `entries`/`measurementKeys` and the form's `sections` were dropped by the typed
  // body (only `name` saved, every chart and set came back empty); sizeChartBody/specBody translate both ways.
  { m: 'POST', from: '/size-charts', row: 'commerce sizeCharts.ts:26', to: '/api/v2/commerce/size-charts', body: sizeChartBody, reply: sizeChartRow },
  { m: 'GET', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:18 (staff read: paused charts too)', to: '/api/v2/commerce/size-charts/{id}', reply: sizeChartRow },
  { m: 'PUT', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:39', method: 'PATCH', to: '/api/v2/commerce/size-charts/{id}', body: sizeChartBody, reply: sizeChartRow },
  { m: 'DELETE', from: '/size-charts/:id', row: 'commerce sizeCharts.ts:47', to: '/api/v2/commerce/size-charts/{id}' },
  { m: 'POST', from: '/specifications', row: 'commerce specifications.ts:28', to: '/api/v2/commerce/specifications', body: specBody, reply: specRow },
  { m: 'GET', from: '/specifications/:id', row: 'commerce specifications.ts:20 (staff read: paused sets too)', to: '/api/v2/commerce/specifications/{id}', reply: specRow },
  { m: 'PUT', from: '/specifications/:id', row: 'commerce specifications.ts:40', method: 'PATCH', to: '/api/v2/commerce/specifications/{id}', body: specBody, reply: specRow },
  { m: 'DELETE', from: '/specifications/:id', row: 'commerce specifications.ts:56', to: '/api/v2/commerce/specifications/{id}' },
  { m: 'POST', from: '/specifications/:p1/assign-to-product', row: 'commerce — not in this binary', gap: 'assigning a specification set to a product has no v2 route (commerce ROUTE_MAP: no row; specifications are a Resource)' },
  { m: 'GET', from: '/specifications/product/:p1', row: 'commerce — not in this binary', gap: 'a product’s specification sets have no v2 route (commerce ROUTE_MAP: no row)' },
  { m: 'POST', from: '/tags', row: 'commerce tags.ts:31', to: '/api/v2/commerce/tags', bs: {'description':'j','is_active':'b','name':'s','slug':'s'} },
  { m: 'GET', from: '/tags/:id', row: 'commerce tags.ts:23 (staff read by id, any state)', to: staffOrPublic('tags') },
  { m: 'PUT', from: '/tags/:id', row: 'commerce tags.ts:66', method: 'PATCH', to: '/api/v2/commerce/tags/{id}', bs: {'description':'j','is_active':'b','name':'s','slug':'s'} },
  { m: 'DELETE', from: '/tags/:id', row: 'commerce tags.ts:74', to: '/api/v2/commerce/tags/{id}' },
  { m: 'POST', from: '/tags/bulk-create', row: 'commerce tags.ts:50', to: '/api/v2/commerce/tags/import', bs: {'rows':[{'description':'j','is_active':'b','name':'s','slug':'s'}]} },
  { m: 'GET', from: '/tags/slug/:slug', row: 'commerce tags.ts:15', to: '/api/v2/commerce/public/tags/slug/{slug}' },
  { m: 'POST', from: '/uom/conversions', row: 'commerce uom.ts:68 (binary per variation)', method: 'PUT', to: (c) => `/api/v2/commerce/uom/variations/${encodeURIComponent(String(c.body?.variationId ?? c.body?.variation_id ?? ''))}/conversions/${encodeURIComponent(String(c.body?.uomId ?? c.body?.uom_id ?? ''))}`, body: (c) => ({ to_base_factor: String(c.body?.toBaseFactor ?? c.body?.to_base_factor ?? '') }) },
  { m: 'POST', from: '/uom/defaults', row: 'commerce uom.ts:94 (binary per variation)', method: 'PUT', to: (c) => `/api/v2/commerce/uom/variations/${encodeURIComponent(String(c.body?.variationId ?? c.body?.variation_id ?? ''))}/defaults`, body: (c) => ({ purchase_uom_id: c.body?.purchaseUomId ?? c.body?.purchase_uom_id ?? null, sales_uom_id: c.body?.salesUomId ?? c.body?.sales_uom_id ?? null }) },
  { m: 'GET', from: '/uom/uoms', row: 'commerce uom.ts:30', to: '/api/v2/commerce/uom/units' },
  { m: 'GET', from: '/uom/variation/:variationId', row: 'commerce uom.ts:36', to: '/api/v2/commerce/uom/variations/{variationId}', reply: (d) => (d && typeof d === 'object' && !Array.isArray(d) && !d.variation ? { ...d, variation: { id: d.id, sku: d.sku ?? null, name: d.name ?? null, stock: d.stock, purchase_uom_id: d.purchase_uom_id ?? null, sales_uom_id: d.sales_uom_id ?? null } } : d) }, // UomVariationView is flat (commerce views/catalog_admin.rs:1510); UomSettings.tsx:67 / GoodsInLabels.tsx:106 read `variation.{id,purchase_uom_id,…}`
  { m: 'GET', from: '/variant-groups', row: 'commerce variantGroups.ts:37', to: '/api/v2/commerce/variant-groups', qs: ['limit','offset','page','sort','q','name','is_active'] },
  { m: 'POST', from: '/variant-groups', row: 'commerce variantGroups.ts:51 (group, then its members)', run: (c) => saveVariantGroup(c, null) },
  // The resource read has no members; the screens read `members[]` (ProductVariantGroupPanel.tsx:130, VariantLinkGroups.tsx:199).
  // GET /variant-groups/{id}/members IS variantGroups.ts:43: the group with its members (VariantGroupDetailView, commerce views/catalog_admin.rs:358).
  { m: 'GET', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:43 (binary: GET …/{id}/members)', to: '/api/v2/commerce/variant-groups/{id}/members' },
  { m: 'PUT', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:65 (group, then its members)', run: (c) => saveVariantGroup(c, c.params.id) },
  { m: 'DELETE', from: '/variant-groups/:id', row: 'commerce variantGroups.ts:101', to: '/api/v2/commerce/variant-groups/{id}' },
  { m: 'POST', from: '/variant-groups/:id/members', row: 'commerce variantGroups.ts:80', to: '/api/v2/commerce/variant-groups/{id}/members', bs: {'attribute_value':'s','is_default':'b','product_id':'s','sort_order':'i'} },
  { m: 'DELETE', from: '/variant-groups/:id/members/:productId', row: 'commerce variantGroups.ts:93', method: 'POST', to: '/api/v2/commerce/variant-groups/{id}/members/{productId}/remove', bs: 'j' },
];
