/**
 * Products, variations, categories, brands, inventory (commerce ROUTE_MAP
 * `products/products.ts`, `categories.ts`, `brands.ts`, `inventory.ts`). Paths
 * follow the RUNNING binary where it differs from the ROUTE_MAP text (`…/remove`,
 * `PUT /brands/{id}/products/order`).
 *
 * Shapes:
 *  - the v2 editor read nests a product's (and each variation's) prices under
 *    `price {mrp, selling_price, sale_price, …}`; the form reads them flat (and reads
 *    a bare `price` as the selling price), so the reply lifts them up and drops the
 *    object;
 *  - writes are typed snake_case inputs that REFUSE unknown fields; the form posts
 *    camelCase, so the body adapter renames the declared fields, turns rupee
 *    amounts into Money and drops what v2 does not take (`sizeChart`, the duplicate
 *    description keys);
 *  - categories/brands: there is NO staff list in v2 (BACKEND GAP — the ROUTE_MAP
 *    names a Resource list that is not mounted); the screens read the public list,
 *    which returns active, public rows only.
 */
import type { V2Ctx, V2Route } from '../routes';
import { mapList, v2call, asList, backendGap } from '../http';
import { toMoney } from '../money';

const P = '/api/v2/commerce';

/* ── reads ──────────────────────────────────────────────────────────────── */

const PRICE_KEYS = ['mrp', 'selling_price', 'sale_price', 'sale_starts_at', 'sale_ends_at', 'final_price', 'savings', 'is_on_sale', 'discount_pct'] as const;

/** `price {…}` → the flat price fields the form and tables read. */
function liftPrice<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const pr = row.price;
  if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return row;
  const out: Record<string, any> = { ...row };
  delete out.price;
  for (const k of PRICE_KEYS) if (pr[k] !== undefined && out[k] === undefined) out[k] = pr[k];
  return out as T;
}

export function productDetail(d: any): any {
  if (!d || typeof d !== 'object') return d;
  const p = liftPrice(d);
  return {
    ...p,
    variations: Array.isArray(p.variations) ? p.variations.map((v: any) => liftPrice(v)) : p.variations,
  };
}

function categoryRow(c: any): any {
  if (!c || typeof c !== 'object') return c;
  // Only active, public categories are listed by the surviving route.
  return { ...c, parent: c.parent ?? c.parent_id ?? null, is_active: c.is_active ?? true, is_public: c.is_public ?? true };
}

function brandRow(b: any): any {
  if (!b || typeof b !== 'object') return b;
  return { ...b, is_active: b.is_active ?? true };
}

/** The legacy listing query (camelCase, page/skip) → v2's snake_case names, offset. */
function productQuery(c: V2Ctx): Record<string, unknown> {
  const q = c.query;
  const limit = Number(q.limit) || 20;
  let offset: number | undefined;
  if (q.offset !== undefined) offset = Number(q.offset) || 0;
  else if (q.skip !== undefined) offset = Number(q.skip) || 0;
  else if (q.page !== undefined) offset = ((Number(q.page) || 1) - 1) * limit;
  const attributes = q.attributes && typeof q.attributes === 'object' ? JSON.stringify(q.attributes) : q.attributes;
  return {
    category: q.category,
    category_slug: q.categorySlug ?? q.category_slug,
    health_concern_slug: q.healthConcernSlug,
    brand: q.brand,
    brands: q.brands,
    featured: q.featured,
    in_stock: q.inStock ?? q.in_stock,
    missing: q.missing,
    has_bundles: q.hasBundles,
    tag: q.tag,
    search: q.search,
    letter: q.letter,
    price_min: q.priceMin ?? q.minPrice,
    price_max: q.priceMax ?? q.maxPrice,
    attributes,
    filter_attr: q.filterAttr,
    filter_value: q.filterValue,
    slugs: q.slugs,
    sort: q.sort,
    collection: q.collection,
    expand: q.expand,
    group: q.group,
    with_qty_breaks: q.withQtyBreaks,
    var_summary: q.varSummary,
    active: q.active,
    limit: q.limit,
    offset,
  };
}

/* ── writes ─────────────────────────────────────────────────────────────── */

const blankToNull = (v: unknown) => (v === '' ? null : v);
const decimalText = (v: unknown) => (v === undefined ? undefined : v === null || v === '' ? null : String(v));

/** One variation as the form holds it → the v2 typed variation input. */
function variationInput(v: any): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: typeof v.id === 'string' && !v.id.startsWith('var-') ? v.id : (v._id ?? null),
    sku: v.sku ?? undefined,
    name: v.name ?? undefined,
    slug: v.slug ?? undefined,
    attributes: v.attributes ?? undefined,
    images: v.images ?? undefined,
    videos: v.videos ?? undefined,
    stock: v.stock !== undefined && v.stock !== null && v.stock !== '' ? Math.trunc(Number(v.stock)) : undefined,
    is_active: v.isActive ?? v.is_active ?? undefined,
    is_default: v.isDefault ?? v.is_default ?? undefined,
    primary_brand_id: blankToNull(v.brandId ?? v.primary_brand_id),
    tax_rule_id: blankToNull(v.taxRuleId ?? v.tax_rule_id),
    hsn_code: v.hsnCode ?? v.hsn_code ?? undefined,
    short_desc: v.shortDesc ?? v.short_desc ?? undefined,
    description: v.description ?? undefined,
    dosage: v.dosage ?? undefined,
    important_info: v.importantInfo ?? v.important_info ?? undefined,
    weight: decimalText(v.weight), length: decimalText(v.length), breadth: decimalText(v.breadth), height: decimalText(v.height),
    sale_starts_at: blankToNull(v.saleStartsAt ?? v.sale_starts_at),
    sale_ends_at: blankToNull(v.saleEndsAt ?? v.sale_ends_at),
    categories: v.categories ?? undefined,
    seo: v.seo ?? undefined,
    offers: v.offers ?? undefined,
    faqs: v.faqs ?? undefined,
    specifications: v.specifications ?? undefined,
    aplus_content: v.aplusContent ?? v.aplus_content ?? undefined,
  };
  const sell = v.price ?? v.sellingPrice ?? v.selling_price;
  const mrp = v.originalPrice ?? v.mrp;
  const sale = v.salePrice ?? v.sale_price;
  if (sell !== undefined) out.selling_price = sell === null || sell === '' ? null : toMoney(sell);
  if (mrp !== undefined) out.mrp = mrp === null || mrp === '' ? null : toMoney(mrp);
  if (sale !== undefined) out.sale_price = sale === null || sale === '' ? null : toMoney(sale);
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

/** The product form's camelCase payload → the v2 typed product input (create or update). */
export function productInput(b: any): Record<string, unknown> {
  if (!b || typeof b !== 'object') return b;
  const pick = (...keys: string[]) => { for (const k of keys) if (b[k] !== undefined) return b[k]; return undefined; };
  const out: Record<string, unknown> = {
    name: pick('name'), title: pick('title'), slug: pick('slug'), sku: pick('sku'),
    short_desc: pick('shortDescription', 'short_desc'),
    long_desc: pick('longDescription', 'long_desc'),
    rich_desc: pick('richDescription', 'rich_desc'),
    description_image: pick('descriptionImage', 'description_image'),
    images: pick('images'), videos: pick('videos'),
    brand_id: blankToNull(pick('brandId', 'brand_id', 'brand')),
    manufacturer_id: blankToNull(pick('manufacturerId', 'manufacturer_id')),
    return_policy_id: blankToNull(pick('returnPolicyId', 'return_policy_id')),
    shipping_rule_id: blankToNull(pick('shippingRuleId', 'shipping_rule_id')),
    faq_group_id: blankToNull(pick('faqGroupId', 'faq_group_id')),
    tax_rule_id: blankToNull(pick('taxRuleId', 'tax_rule_id')),
    hsn_code: pick('hsnCode', 'hsn_code'),
    weight: decimalText(pick('weight')), length: decimalText(pick('length')),
    breadth: decimalText(pick('breadth')), height: decimalText(pick('height')),
    country_of_origin: pick('countryOfOrigin', 'country_of_origin'),
    model_number: pick('modelNumber', 'model_number'),
    license_number: pick('licenseNumber', 'license_number'),
    expiry_months: pick('expiryMonths', 'expiry_months'),
    pack_size: pick('packSize', 'pack_size'),
    sold_as_pack: pick('soldAsPack', 'sold_as_pack'),
    is_active: pick('isActive', 'is_active'),
    is_featured: pick('isFeatured', 'is_featured'),
    is_digital: pick('isDigital', 'is_digital'),
    requires_prescription: pick('requiresPrescription', 'requires_prescription'),
    disable_variants: pick('disableVariants', 'disable_variants'),
    show_oos_variants: pick('showOutOfStockVariants', 'show_oos_variants'),
    product_type: pick('productType', 'product_type'),
    attribute_ids: pick('attributeIds', 'attribute_ids'),
    selected_attribute_values: pick('selectedAttributeValues', 'selected_attribute_values'),
    categories: pick('categories'),
    featured_category_id: blankToNull(pick('featuredCategory', 'featured_category_id')),
    tags: pick('tags'),
    specification_id: blankToNull(pick('specificationId', 'specification_id')),
    specifications: pick('specifications'),
    wash_care_instructions: pick('washCareInstructions', 'wash_care_instructions'),
    customer_order_images: pick('customerOrderImages', 'customer_order_images'),
    aplus_content: pick('aplusContent', 'aplus_content'),
    page_sections: pick('pageSections', 'page_sections'),
    offers: pick('offers'),
    cross_sell_ids: pick('crossSellIds', 'cross_sell_ids'),
    upsell_ids: pick('upsellIds', 'upsell_ids'),
    fbt_ids: pick('fbtIds', 'fbt_ids'),
    seo: pick('seo'),
    sale_starts_at: blankToNull(pick('saleStartsAt', 'sale_starts_at')),
    sale_ends_at: blankToNull(pick('saleEndsAt', 'sale_ends_at')),
  };
  const stock = pick('stock');
  if (typeof stock === 'number') out.stock = Math.trunc(stock);
  const sell = pick('price', 'sellingPrice', 'selling_price');
  const mrp = pick('originalPrice', 'mrp');
  const sale = pick('salePrice', 'sale_price');
  if (sell !== undefined) out.selling_price = sell === null || sell === '' ? null : toMoney(sell as number);
  if (mrp !== undefined) out.mrp = mrp === null || mrp === '' ? null : toMoney(mrp as number);
  if (sale !== undefined) out.sale_price = sale === null || sale === '' ? null : toMoney(sale as number);
  const variations = pick('variations');
  if (Array.isArray(variations)) out.variations = variations.map(variationInput);
  const b2b = pick('b2bPricing', 'b2b_pricing');
  if (Array.isArray(b2b)) {
    out.b2b_pricing = b2b.map((s: any) => ({
      tier_name: s.tierName ?? s.tier_name ?? null,
      variation_id: s.variationId ?? s.variation_id ?? null,
      min_qty: s.minQty ?? s.min_qty ?? null,
      max_qty: s.maxQty ?? s.max_qty ?? null,
      price_type: s.priceType ?? s.price_type ?? null,
      price_value: s.priceValue !== undefined || s.price_value !== undefined ? String(s.priceValue ?? s.price_value) : null,
      is_active: s.isActive ?? s.is_active ?? null,
    }));
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

/** Category / brand form → v2 typed input (snake_case; unknown keys dropped by the server's refusal otherwise). */
function snakeBody(b: any): Record<string, unknown> {
  if (!b || typeof b !== 'object' || b instanceof FormData) return b;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === '_id' || k === 'id') continue;
    const sk = k === 'parent' ? 'parent_id' : k === 'isActive' ? 'is_active' : k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    out[sk] = v;
  }
  return out;
}

/** A Resource list's query: the legacy `active`/`isActive`/`search` → `is_active`/`q`, the whole list (≤ 200). */
function resourceQuery(c: V2Ctx, activeKey = 'active'): Record<string, unknown> {
  const active = c.query[activeKey] ?? c.query.active ?? c.query.isActive;
  return { is_active: active === undefined ? undefined : String(active) === 'true', q: c.query.search, limit: c.query.limit ?? 200, offset: c.query.offset };
}

/** `GET /attributes/:slug/values` → the attribute by slug, then its values (an unknown slug = no values). */
async function attributeValuesBySlug(c: V2Ctx): Promise<unknown> {
  const attrs = await v2call<any[]>('GET', `${P}/attributes`, { params: { slug: c.params.slug, limit: 1 } });
  const attr = Array.isArray(attrs) ? attrs[0] : null;
  if (!attr) return asList([], { total: 0 });
  const active = c.query.isActive ?? c.query.active;
  return v2call('GET', `${P}/attribute-values`, { params: { attribute_id: attr.id, limit: 200, ...(active === undefined ? {} : { is_active: String(active) === 'true' }) } });
}

/* ── the table ──────────────────────────────────────────────────────────── */

export const PRODUCT_ROUTES: V2Route[] = [
  // Products
  { m: 'GET', from: '/products', row: 'commerce products.ts:39 (staff table GET /products)', to: `${P}/products`, query: productQuery },
  { m: 'GET', from: '/products/skus', row: 'commerce products.ts:28', to: `${P}/products/skus` },
  { m: 'GET', from: '/products/export', row: 'commerce products.ts:30', to: `${P}/products/export` },
  { m: 'GET', from: '/products/workbook/export', row: 'commerce products.ts:32', to: `${P}/products/workbook/export` },
  { m: 'GET', from: '/products/workbook/template', row: 'commerce products.ts:33', to: `${P}/products/workbook/template` },
  { m: 'GET', from: '/products/workbook/schema', row: 'commerce products.ts:34', to: `${P}/products/workbook/schema` },
  { m: 'POST', from: '/products/workbook/preview', row: 'commerce products.ts:35', to: `${P}/products/workbook/preview` },
  { m: 'POST', from: '/products/workbook/import', row: 'commerce products.ts:36', to: `${P}/products/workbook/import` },
  { m: 'GET', from: '/products/filters', row: 'commerce products.ts:25', to: `${P}/public/products/filters` },
  {
    // The editor opens `/products/<slug>/edit`. The public slug read hides inactive products (FP-6), so the
    // staff editor resolves the slug through the staff table (`?slugs=`) and reads the staff view by id.
    m: 'GET', from: '/products/slug/:slug', row: 'commerce products.ts:40 → staff GET /products?slugs= + GET /products/{id}',
    run: async (c) => {
      const hit = await v2call<any[]>('GET', `${P}/products`, { params: { slugs: c.params.slug, limit: 1 } });
      const id = Array.isArray(hit) && hit[0] ? (hit[0].product_id ?? hit[0].id) : null;
      if (!id) return productDetail(await v2call('GET', `${P}/public/products/slug/${encodeURIComponent(c.params.slug)}`));
      return productDetail(await v2call('GET', `${P}/products/${encodeURIComponent(id)}`));
    },
  },
  { m: 'GET', from: '/products/:id', row: 'commerce products.ts:47 (staff GET /products/{id})', to: `${P}/products/{id}`, reply: productDetail },
  { m: 'POST', from: '/products', row: 'commerce products.ts:50', to: `${P}/products`, body: (c) => productInput(c.body), reply: productDetail },
  { m: 'PUT', from: '/products/:id', row: 'commerce products.ts:57', method: 'PATCH', to: `${P}/products/{id}`, body: (c) => productInput(c.body), reply: productDetail },
  { m: 'POST', from: '/products/bulk', row: 'commerce products.ts:51', to: `${P}/products/bulk`, body: (c) => (Array.isArray(c.body?.products) ? { products: c.body.products.map(productInput) } : c.body) },
  { m: 'PUT', from: '/products/:id/variations/:variationId', row: 'commerce products.ts:59', method: 'PATCH', to: `${P}/products/{id}/variations/{variationId}`, body: (c) => variationInput(c.body ?? {}), reply: (d) => liftPrice(d) },
  { m: 'DELETE', from: '/products/:id/variations/:variationId', row: 'commerce products.ts:63 (binary: …/remove)', method: 'POST', to: `${P}/products/{id}/variations/{variationId}/remove`, body: () => ({}) },
  { m: 'DELETE', from: '/products/bulk', row: 'commerce products.ts:62 (binary: POST /products/bulk/remove)', method: 'POST', to: `${P}/products/bulk/remove`, body: (c) => ({ ids: c.body?.ids ?? c.query.ids }) },
  { m: 'DELETE', from: '/products/:id', row: 'commerce products.ts:64 (binary: …/remove)', method: 'POST', to: `${P}/products/{id}/remove`, body: () => ({}) },
  { m: 'POST', from: '/products/:id/duplicate', row: 'commerce products.ts:46', to: `${P}/products/{id}/duplicate`, body: (c) => ({ name: c.body?.name ?? null, sku: c.body?.sku ?? null, join_group_id: c.body?.joinGroupId ?? null, attribute_value: c.body?.attributeValue ?? null }) },

  // Categories (public list: the staff list is not mounted — BACKEND GAP)
  { m: 'GET', from: '/categories', row: 'commerce categories.ts:19 (staff list missing → GET /public/categories)', to: `${P}/public/categories`, reply: (d) => (Array.isArray(d) ? mapList(d, categoryRow) : d) },
  { m: 'GET', from: '/categories/tree', row: 'commerce categories.ts:41', to: `${P}/public/categories/tree`, reply: (d) => (Array.isArray(d) ? mapList(d, categoryRow) : d) },
  { m: 'GET', from: '/categories/slug/:slug', row: 'commerce categories.ts:48', to: `${P}/public/categories/slug/{slug}`, reply: (d) => categoryRow(d?.category ?? d) },
  { m: 'GET', from: '/categories/:id', row: 'commerce categories.ts:63', to: `${P}/public/categories/{id}`, reply: (d) => categoryRow(d?.category ?? d) },
  { m: 'GET', from: '/categories/:id/children', row: 'commerce categories.ts:74', to: `${P}/public/categories/{id}/children` },
  { m: 'POST', from: '/categories', row: 'commerce categories.ts:81', to: `${P}/categories`, body: (c) => snakeBody(c.body) },
  { m: 'PUT', from: '/categories/:id', row: 'commerce categories.ts:88', method: 'PATCH', to: `${P}/categories/{id}`, body: (c) => snakeBody(c.body) },
  { m: 'DELETE', from: '/categories/:id', row: 'commerce categories.ts:96', method: 'POST', to: `${P}/categories/{id}/remove`, body: () => ({}) },

  // Brands (public list: the staff list is not mounted — BACKEND GAP)
  { m: 'GET', from: '/brands', row: 'commerce brands.ts:49 (staff list missing → GET /public/brands)', to: `${P}/public/brands`, reply: (d) => (Array.isArray(d) ? mapList(d, brandRow) : d) },
  { m: 'GET', from: '/brands/slug/:slug', row: 'commerce brands.ts:58', to: `${P}/public/brands/slug/{slug}`, reply: (d) => brandRow(d?.brand ?? d) },
  { m: 'GET', from: '/brands/:id', row: 'commerce brands.ts:66', to: `${P}/public/brands/{id}`, reply: (d) => brandRow(d?.brand ?? d) },
  { m: 'POST', from: '/brands', row: 'commerce brands.ts:74', to: `${P}/brands`, body: (c) => snakeBody(c.body) },
  { m: 'PUT', from: '/brands/:id', row: 'commerce brands.ts:86', method: 'PATCH', to: `${P}/brands/{id}`, body: (c) => snakeBody(c.body) },
  { m: 'DELETE', from: '/brands/:id', row: 'commerce brands.ts:97', method: 'POST', to: `${P}/brands/{id}/remove`, body: () => ({}) },
  { m: 'GET', from: '/brands/:id/products', row: 'commerce brands.ts:128', to: `${P}/brands/{id}/products` },
  { m: 'PUT', from: '/brands/:id/products/order', row: 'commerce brands.ts:145 (binary: PUT)', to: `${P}/brands/{id}/products/order` },
  { m: 'GET', from: '/brands/:id/products/export', row: 'commerce brands.ts:170', to: `${P}/brands/{id}/products/export` },
  { m: 'POST', from: '/brands/:id/products/import', row: 'commerce brands.ts:231', to: `${P}/brands/{id}/products/import` },
  { m: 'GET', from: '/brands/:id/licenses', row: 'commerce brands.ts:295 — R:BrandLicense.list ?brand_id=', to: `${P}/brand-licenses`, query: (c) => ({ brand_id: c.params.id, limit: 200 }) },
  { m: 'POST', from: '/brands/:id/licenses', row: 'commerce brands.ts:305 — R:BrandLicense.create', to: `${P}/brand-licenses`, body: (c) => ({ ...snakeBody(c.body), brand_id: c.params.id }) },
  { m: 'PUT', from: '/brands/licenses/:id', row: 'commerce brands.ts:317 — R:BrandLicense.update', method: 'PATCH', to: `${P}/brand-licenses/{id}`, body: (c) => snakeBody(c.body) },
  { m: 'DELETE', from: '/brands/licenses/:id', row: 'commerce brands.ts:328 — R:BrandLicense.delete', to: `${P}/brand-licenses/{id}` },

  // The product form's lookups (Resources: list `?is_active=` `?q=`, at most 200 a page).
  { m: 'GET', from: '/attributes', row: 'commerce attributes.ts — R:Attribute.list', to: `${P}/attributes`, query: (c) => resourceQuery(c, 'isActive') },
  { m: 'GET', from: '/attributes/:slug/values', row: 'commerce attributes.ts — R:AttributeValue.list ?attribute_id=', run: async (c) => attributeValuesBySlug(c) },
  { m: 'GET', from: '/attribute-values', row: 'commerce — R:AttributeValue.list', to: `${P}/attribute-values`, query: (c) => ({ ...resourceQuery(c, 'isActive'), attribute_id: c.query.attributeId ?? c.query.attribute_id }) },
  { m: 'GET', from: '/size-charts', row: 'commerce sizeCharts.ts — R:SizeChart.list', to: `${P}/size-charts`, query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/specifications', row: 'commerce specifications.ts — R:Specification.list', to: `${P}/specifications`, query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/tags', row: 'commerce tags.ts — R:Tag.list', to: `${P}/tags`, query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/manufacturers', row: 'commerce manufacturers.ts — R:Manufacturer.list', to: `${P}/manufacturers`, query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/faq-groups', row: 'commerce faqGroups.ts — R:FaqGroup.list', to: `${P}/faq-groups`, query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/tax', row: 'books — R:TaxRule.list (GET /api/v2/books/tax-rules)', to: '/api/v2/books/tax-rules', query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/tax/return-policies', row: 'books — R:ReturnPolicy.list', to: '/api/v2/books/return-policies', query: (c) => resourceQuery(c) },
  { m: 'GET', from: '/ai/status', row: 'commerce aiStudio.ts:107', to: `${P}/ai/status` },
  // B2B (trade ROUTE_MAP) the product form reads.
  { m: 'GET', from: '/b2b/settings', row: 'trade — GET /api/v2/trade/settings', to: '/api/v2/trade/settings', rs: { default_discount_pct: 'r', tiers: [{ discount_pct: 'r' }] } },
  { m: 'GET', from: '/b2b/customers', row: 'trade — GET /api/v2/trade/accounts', to: '/api/v2/trade/accounts', query: (c) => ({ q: c.query.search, limit: c.query.limit, offset: c.query.offset }) },
  { m: 'GET', from: '/b2b/price-lists', row: 'trade — GET /api/v2/trade/price-lists', to: '/api/v2/trade/price-lists' },
  { m: 'GET', from: '/b2b/price-lists/:id/rules', row: 'trade 22 — GET /api/v2/trade/price-lists/{id}/rules', to: '/api/v2/trade/price-lists/{id}/rules', rs: { items: [{ discount_slabs: [{ discount_pct: 'r' }], flat_discount_pct: 'r' }] } },
  { m: 'GET', from: '/upload/image-specs', row: 'commerce upload.ts:244 GET /media/image-specs — NOT MOUNTED', run: async () => backendGap('GET /api/v2/commerce/media/image-specs (upload.ts:244)') },
  { m: 'GET', from: '/b2b/contracts/product/:id', row: 'trade — merged into GET /api/v2/trade/contracts?product=', to: '/api/v2/trade/contracts', query: (c) => ({ product: c.params.id }) },

  // Inventory
  {
    m: 'GET', from: '/inventory', row: 'commerce inventory.ts:189', to: `${P}/inventory`,
    query: (c) => ({ page: c.query.page, limit: c.query.limit, search: c.query.search, low_stock: c.query.lowStock ?? c.query.low_stock, out_of_stock: c.query.outOfStock ?? c.query.out_of_stock, threshold: c.query.threshold, mismatch: c.query.mismatch, expiring_days: c.query.expiringDays ?? c.query.expiring_days, include_lots: c.query.includeLots ?? c.query.include_lots }),
  },
  { m: 'GET', from: '/inventory/health', row: 'commerce inventory.ts:245', to: `${P}/inventory/health` },
  { m: 'GET', from: '/inventory/low-stock', row: 'commerce inventory.ts:296', to: `${P}/inventory/low-stock`, query: (c) => ({ threshold: c.query.threshold }) },
  { m: 'GET', from: '/inventory/valuation', row: 'commerce inventory.ts:305', to: `${P}/inventory/valuation` },
  { m: 'GET', from: '/inventory/export', row: 'commerce inventory.ts:316', to: `${P}/inventory/export`, query: (c) => ({ search: c.query.search }) },
  { m: 'GET', from: '/inventory/template', row: 'commerce inventory.ts:337', to: `${P}/inventory/template` },
  { m: 'POST', from: '/inventory/import', row: 'commerce inventory.ts:564', to: `${P}/inventory/import` },
  { m: 'POST', from: '/inventory/import/any', row: 'commerce inventory.ts:610', to: `${P}/inventory/import/any` },
  { m: 'GET', from: '/inventory/batch-pricing', row: 'commerce inventory.ts:660', to: `${P}/inventory/batch-pricing` },
  { m: 'GET', from: '/inventory/batches/export', row: 'commerce inventory.ts:753', to: `${P}/inventory/batches/export` },
  { m: 'GET', from: '/inventory/batches/template', row: 'commerce inventory.ts:773', to: `${P}/inventory/batches/template` },
  { m: 'POST', from: '/inventory/batches/import', row: 'commerce inventory.ts:1025', to: `${P}/inventory/batches/import` },
  { m: 'POST', from: '/inventory/bulk-update', row: 'commerce inventory.ts:1028', to: `${P}/inventory/bulk-update` },
  {
    m: 'POST', from: '/inventory/adjust', row: 'commerce inventory.ts:1041', to: `${P}/inventory/adjust`,
    body: (c) => ({ product_id: c.body?.productId ?? c.body?.product_id, variation_id: c.body?.variationId ?? c.body?.variation_id, qty_delta: c.body?.qtyDelta ?? c.body?.qty_delta ?? c.body?.delta, movement_type: c.body?.movementType ?? c.body?.movement_type ?? null, reason_type: c.body?.reasonType ?? c.body?.reason_type ?? null, reference: c.body?.reference ?? null, notes: c.body?.notes ?? c.body?.reason ?? null, warehouse_id: c.body?.warehouseId ?? c.body?.warehouse_id ?? null }),
  },
  { m: 'GET', from: '/inventory/movements/:id', row: 'commerce inventory.ts:1073', to: `${P}/inventory/movements/{id}` },
  { m: 'GET', from: '/inventory/ledger-chain/verify', row: 'commerce inventory.ts:1102', to: `${P}/inventory/ledger-chain/verify` },
  { m: 'GET', from: '/inventory/sheets', row: 'commerce inventory.ts:1656', to: `${P}/inventory/sheets` },
  { m: 'GET', from: '/inventory/market-prices/export', row: 'commerce inventory.ts:1292', to: `${P}/inventory/market-prices/export`, query: (c) => ({ market: c.query.market, country: c.query.country, currency: c.query.currency, search: c.query.search }) },
  { m: 'GET', from: '/inventory/market-prices/template', row: 'commerce inventory.ts:1315', to: `${P}/inventory/market-prices/template` },
  { m: 'POST', from: '/inventory/market-prices/import', row: 'commerce inventory.ts:1403', to: `${P}/inventory/market-prices/import` },
  { m: 'GET', from: '/inventory/availability/export', row: 'commerce inventory.ts:1448', to: `${P}/inventory/availability/export`, query: (c) => ({ search: c.query.search }) },
  { m: 'GET', from: '/inventory/availability/template', row: 'commerce inventory.ts:1468', to: `${P}/inventory/availability/template` },
  { m: 'POST', from: '/inventory/availability/import', row: 'commerce inventory.ts:1558', to: `${P}/inventory/availability/import` },
  { m: 'GET', from: '/inventory/dimensions/coverage', row: 'commerce inventory.ts:1763', to: `${P}/inventory/dimensions/coverage` },
  { m: 'GET', from: '/inventory/:id/history', row: 'commerce inventory.ts:1086', to: `${P}/inventory/{id}/history` },
  // The product page's inventory panel (make ROUTE_MAP 99, purchasing incoming; commerce reports.ts:148).
  { m: 'GET', from: '/purchasing/batches', row: 'make 99 — GET /api/v2/make/batches', to: '/api/v2/make/batches', query: (c) => ({ variation_id: c.query.variationId ?? c.query.variation_id, limit: c.query.limit }) },
  { m: 'GET', from: '/purchasing/incoming', row: 'make — GET /api/v2/make/purchase-orders/incoming', to: '/api/v2/make/purchase-orders/incoming', query: (c) => ({ variation_id: c.query.variationId ?? c.query.variation_id }) },
  { m: 'GET', from: '/reports/movements', row: 'commerce reports.ts:148', to: `${P}/reports/movements`, query: (c) => ({ variation_id: c.query.variationId ?? c.query.variation_id, limit: c.query.limit, offset: c.query.offset, from: c.query.from, to: c.query.to }) },
  { m: 'GET', from: '/inventory/:id/detail', row: 'commerce inventory.ts:1122', to: `${P}/inventory/{id}/detail` },
  { m: 'GET', from: '/inventory/:id', row: 'commerce inventory.ts:1212', to: `${P}/inventory/{id}` },
  { m: 'PUT', from: '/inventory/:id', row: 'commerce inventory.ts:1240', method: 'PATCH', to: `${P}/inventory/{id}`, body: (c) => ({ stock: c.body?.stock ?? c.body?.variationStock, reason: c.body?.reason ?? null, reason_type: c.body?.reason_type ?? c.body?.reasonType ?? null }) },
];
