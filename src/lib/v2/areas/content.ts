/**
 * Content (commerce ROUTE_MAP `pages.ts`, `menus.ts`, `banners.ts`, `trustBadges.ts`, `blogPosts.ts`, `upload.ts`; platform plugins): CMS pages and their blocks, menus, banners, trust badges, blog posts, the media library and uploads.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Ctx, V2Route } from '../routes';
import { v2call, mapList } from '../http';
import { shapeObject, wrapData } from '../shape';
import type { Spec } from '../shape';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const PAGE_BS: { [k: string]: Spec } = {'custom_css':'s','custom_html':'s','is_active':'b','published_at':'s','sections':['j'],'seo':'j','slug':'s','template_id':'s','title':'s','type':'s'};
/** The screen's own field (the edit) and the v2 field it is. */
const PAGE_EDITS: Array<[string, string]> = [['contentBlocks', 'sections'], ['pageType', 'type'], ['isActive', 'is_active'], ['customHtml', 'custom_html'], ['customCss', 'custom_css'], ['publishedAt', 'published_at']];

/**
 * PageForm, PageBuilder and the Pages list edit `contentBlocks`, `pageType` and `isActive` on top of the record they
 * loaded, which also carries `sections`, `type` and `is_active`. The generic shaper lets the snake key win, so every
 * block edit, the builder's canvas and the status toggle were dropped. Here the screen's field is the edit and
 * replaces the loaded one; the rest goes through the generic shaper (PageBody, commerce api/catalog_mgmt/pages_admin.rs).
 */
function pageBody(c: V2Ctx): Record<string, unknown> {
  const src: Record<string, unknown> = { ...(isObj(c.body) ? c.body : {}) };
  for (const [screen, field] of PAGE_EDITS) {
    if (src[screen] !== undefined) { src[field] = src[screen]; delete src[screen]; }
  }
  return shapeObject(src, PAGE_BS);
}

const BANNER_BS: { [k: string]: Spec } = {'display_order':'i','image_url':'j','is_active':'b','link_url':'j','metadata':'j','mobile_image_url':'j','position':'j','subtitle':'j','title':'j','valid_from':'j','valid_until':'j'};

/**
 * Appearance > Banners edits a banner GROUP {name, slug, type, displayLocation, isActive, displayOrder, validFrom,
 * validUntil, items}. The v2 banner is one row (commerce resources/catalog_mgmt.rs BANNERS): the slot is `position`
 * and the group rides in `metadata`, whose `items` the storefront hero shows as slides (storefront
 * lib/v2/routes/catalogue.ts groupBanners). The first slide also fills the row's own image, link and texts so a
 * reader of the flat row still has a banner. A partial edit (the Activate toggle) writes only what it names.
 */
function bannerBody(c: V2Ctx): Record<string, unknown> {
  const b: Record<string, any> = isObj(c.body) ? c.body : {};
  const out: Record<string, unknown> = {};
  if (b.displayLocation !== undefined || b.position !== undefined) out.position = b.displayLocation ?? b.position;
  if (b.isActive !== undefined || b.is_active !== undefined) out.is_active = b.isActive ?? b.is_active;
  if (b.displayOrder !== undefined || b.display_order !== undefined) out.display_order = b.displayOrder ?? b.display_order;
  if (b.validFrom !== undefined) out.valid_from = b.validFrom || null;
  if (b.validUntil !== undefined) out.valid_until = b.validUntil || null;
  if (Array.isArray(b.items) || b.name !== undefined) {
    const items = (Array.isArray(b.items) ? b.items : []).map((it: any, i: number) => ({
      title: it?.title ?? '', subtitle: it?.subtitle ?? '', imageUrl: it?.imageUrl ?? '',
      mobileImageUrl: it?.mobileImageUrl ?? '', targetUrl: it?.targetUrl ?? '', displayOrder: i,
    }));
    const first = items[0];
    out.title = first?.title || null;
    out.subtitle = first?.subtitle || null;
    out.image_url = first?.imageUrl || null;
    out.mobile_image_url = first?.mobileImageUrl || null;
    out.link_url = first?.targetUrl || null;
    out.metadata = { ...(isObj(b.metadata) ? b.metadata : {}), name: b.name ?? '', slug: b.slug ?? '', type: b.type ?? 'carousel', items };
  }
  return shapeObject(out, BANNER_BS);
}

/** A v2 banner row as the group the Banners screen edits (the reverse of bannerBody; a row saved flat is one slide). */
function bannerGroup(b: any): any {
  const meta = isObj(b?.metadata) ? b.metadata : {};
  const items = Array.isArray(meta.items) ? meta.items
    : b?.image_url ? [{ title: b.title ?? '', subtitle: b.subtitle ?? '', imageUrl: b.image_url, mobileImageUrl: b.mobile_image_url ?? '', targetUrl: b.link_url ?? '' }]
    : [];
  return {
    ...b,
    name: meta.name || b?.title || '',
    slug: meta.slug ?? '',
    type: meta.type ?? 'carousel',
    displayLocation: b?.position || 'home_top',
    displayOrder: b?.display_order ?? 0,
    isActive: b?.is_active !== false,
    validFrom: b?.valid_from ?? null,
    validUntil: b?.valid_until ?? null,
    items,
  };
}

export const CONTENT_ROUTES: V2Route[] = [
  { m: 'GET', from: '/banners', row: 'commerce banners.ts:27', to: '/api/v2/commerce/banners', query: () => ({ limit: 200 }), reply: (d) => (Array.isArray(d) ? mapList(d, bannerGroup) : d) }, // the staff list (inactive and scheduled banners too); `metadata` is listed (catalog_mgmt.rs BANNERS) so each row carries its slides
  { m: 'POST', from: '/banners', row: 'commerce banners.ts:50', to: '/api/v2/commerce/banners', body: bannerBody, reply: (d) => (isObj(d) ? bannerGroup(d) : d) },
  { m: 'GET', from: '/banners/:id', row: 'commerce banners.ts:42', to: '/api/v2/commerce/public/banners/{id}', reply: (d) => (isObj(d) ? bannerGroup(d) : d) },
  { m: 'PUT', from: '/banners/:id', row: 'commerce banners.ts:66', method: 'PATCH', to: '/api/v2/commerce/banners/{id}', body: bannerBody, reply: (d) => (isObj(d) ? bannerGroup(d) : d) },
  { m: 'DELETE', from: '/banners/:id', row: 'commerce banners.ts:74', to: '/api/v2/commerce/banners/{id}' },
  { m: 'POST', from: '/blog-posts', row: 'commerce blogPosts.ts:93', to: '/api/v2/commerce/blog-posts', bs: {'author_name':'s','content':'s','cover_image':'s','excerpt':'s','published_at':'s','read_time_min':'i','seo':'j','slug':'s','status':'s','tags':['s'],'title':'s'} },
  { m: 'GET', from: '/blog-posts', row: 'commerce blogPosts.ts:16 (staff list)', to: '/api/v2/commerce/blog-posts', qs: ['limit','offset','search','status'], reply: wrapData }, // the staff list (drafts, status, view_count: commerce api/catalog_mgmt/blog_posts.rs:67), not /public (published only, no status); Blogs reads {data, total} for its pager
  { m: 'GET', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:81', to: '/api/v2/commerce/blog-posts/{id}' },
  { m: 'PUT', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:113', method: 'PATCH', to: '/api/v2/commerce/blog-posts/{id}', bs: {'author_name':'s','content':'s','cover_image':'s','excerpt':'s','published_at':'s','read_time_min':'i','seo':'j','slug':'s','status':'s','tags':['s'],'title':'s'} },
  { m: 'DELETE', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:152', method: 'POST', to: '/api/v2/commerce/blog-posts/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/menus', row: 'commerce menus.ts:145 (staff list)', to: '/api/v2/commerce/menus', query: () => ({ limit: 200 }) }, // the staff Menu resource as stored: inactive menus too, no live brands written into the "Brands" item and no generated default (the public list does all three, and the editor saved them back); `items` is listed (catalog_mgmt.rs MENUS)
  { m: 'POST', from: '/menus', row: 'commerce menus.ts:183', to: '/api/v2/commerce/menus', bs: {'is_active':'b','items':'j','location':'j','name':'s','slug':'s'} },
  { m: 'PUT', from: '/menus/:id', row: 'commerce menus.ts:198', method: 'PATCH', to: '/api/v2/commerce/menus/{id}', bs: {'is_active':'b','items':'j','location':'j','name':'s','slug':'s'} },
  { m: 'DELETE', from: '/menus/:id', row: 'commerce menus.ts:206', to: '/api/v2/commerce/menus/{id}' },
  { m: 'GET', from: '/menus/location/:location', row: 'commerce menus.ts:166', to: '/api/v2/commerce/public/menus/location/{location}' },
  { m: 'POST', from: '/pages', row: 'commerce pages.ts:252', to: '/api/v2/commerce/pages', body: pageBody },
  { m: 'PUT', from: '/pages/:id', row: 'commerce pages.ts:259', method: 'PATCH', to: '/api/v2/commerce/pages/{id}', body: pageBody },
  { m: 'DELETE', from: '/pages/:id', row: 'commerce pages.ts:275', method: 'POST', to: '/api/v2/commerce/pages/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/pages/admin/:id', row: 'commerce pages.ts:76', to: '/api/v2/commerce/pages/{id}' },
  { m: 'GET', from: '/pages/admin/all', row: 'commerce pages.ts:60', to: '/api/v2/commerce/pages', reply: (d) => (Array.isArray(d) ? mapList(d, (p: any) => ({ ...p, contentBlocks: p.contentBlocks ?? (Array.isArray(p.sections) ? p.sections : []), pageType: p.pageType ?? p.type, isVisible: p.isVisible ?? p.is_active })) : d) }, // PageStaffView {type, sections, is_active, template_id} (commerce views/catalog_admin.rs:474, api/catalog_mgmt/pages_admin.rs:363); Pages.tsx reads Node toAdminPage's pageType/contentBlocks/isVisible
  { m: 'GET', from: '/pages/block-types', row: 'commerce pages.ts:55', to: '/api/v2/commerce/public/page-block-types', reply: (d) => d?.types ?? d }, // BlockTypesView {types} (commerce views/storefront.rs:201); PageForm wants the array
  { m: 'POST', from: '/pages/seed', row: 'commerce pages.ts:85', to: '/api/v2/commerce/pages/seed', qs: ['force'], body: () => ({}) }, // PageSeedView {created, updated, skipped, created_slugs}; the route reads no body
  { m: 'POST', from: '/pages/generate-block-content', row: 'commerce pages.ts:137', gap: 'AI block content for pages is not mounted in this binary (ROUTE_MAP names POST /pages/block-content)' },
  { m: 'GET', from: '/pages/templates', row: 'commerce pages.ts:43', to: '/api/v2/commerce/public/page-templates', reply: (d) => (Array.isArray(d) ? mapList(d, (t: any) => (t?.template && typeof t.template === 'object' ? { ...t.template, ...t, name: t.name ?? t.template.name } : t)) : d) }, // PageTemplateView {name, template: {name, displayName, description, defaultBlocks}} (commerce views/storefront.rs:193); PageForm reads them flat
  { m: 'GET', from: '/plugins', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'POST', from: '/plugins', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'DELETE', from: '/plugins/:p1', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'PUT', from: '/plugins/:p1/config', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'PUT', from: '/plugins/:p1/toggle', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/plugins/available', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/plugins/installed', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/trust-badges', row: 'commerce trustBadges.ts:7 (?active=false → the staff list)', to: (c) => (String(c.query?.active) === 'false' ? '/api/v2/commerce/trust-badges' : '/api/v2/commerce/public/trust-badges'), query: (c) => (String(c.query?.active) === 'false' ? { limit: 200, sort: 'display_order' } : undefined) }, // TrustBadges.tsx asks ?active=false (Node: every badge, trustBadges.ts:9); /public answers only active ones without is_active, the staff list (commerce resources/catalog_mgmt.rs trust_badges) carries is_active
  { m: 'POST', from: '/trust-badges', row: 'commerce trustBadges.ts:23', to: '/api/v2/commerce/trust-badges', bs: {'description':'j','display_order':'i','image_url':'j','is_active':'b','title':'s'} },
  { m: 'PUT', from: '/trust-badges/:id', row: 'commerce trustBadges.ts:36', method: 'PATCH', to: '/api/v2/commerce/trust-badges/{id}', bs: {'description':'j','display_order':'i','image_url':'j','is_active':'b','title':'s'} },
  { m: 'DELETE', from: '/trust-badges/:id', row: 'commerce trustBadges.ts:44', to: '/api/v2/commerce/trust-badges/{id}' },
  { m: 'POST', from: '/upload', row: 'commerce upload.ts:53', to: '/api/v2/commerce/media', bs: {'#mp':'j','folder':'s','image':'f'} },
  { m: 'DELETE', from: '/upload/:key', row: 'commerce upload.ts:348 (key → body)', method: 'POST', to: '/api/v2/commerce/media/remove', body: (c) => ({ key: c.params.key }) },
  { m: 'GET', from: '/upload/browse', row: 'commerce upload.ts:210', to: '/api/v2/commerce/media/browse', qs: ['cursor','limit','prefix','search'] },
  { m: 'GET', from: '/upload/files', row: 'commerce upload.ts:182 (binary /media/files)', to: '/api/v2/commerce/media/files' },
  {
    // No remove-many in the binary: each key goes through the one remove route, reported together. The screens send ONE
    // `key` (uploadAPI.deleteFile, as Node's DELETE /files took it); `keys`/`files` stay accepted for a list. `force`
    // passes through: the route refuses a file the catalogue still shows unless staff confirmed it (MENU-1 gallery).
    m: 'DELETE', from: '/upload/files', row: 'commerce upload.ts:261 (each key to /media/remove)',
    run: async (c) => {
      const one = typeof c.body?.key === 'string' && c.body.key.trim() ? [c.body.key.trim()] : [];
      const keys: string[] = Array.isArray(c.body?.keys) ? c.body.keys : Array.isArray(c.body?.files) ? c.body.files : one;
      const force = c.body?.force === true ? { force: true } : {};
      const results = [];
      for (const key of keys) results.push(await v2call('POST', '/api/v2/commerce/media/remove', { data: { key, ...force } }));
      return { removed: results.length, results };
    },
  },
  // Where one file is shown (brands, categories, banners, products, variations), asked before a delete (MENU-1 gallery).
  { m: 'GET', from: '/upload/usage', row: 'commerce new: GET /media/usage (MENU-1 gallery)', to: '/api/v2/commerce/media/usage', qs: ['key'] },
  { m: 'POST', from: '/upload/multiple', row: 'commerce upload.ts:135', to: '/api/v2/commerce/media/batch', bs: {'#mp':'j','folder':'s','images':['f']}, reply: (d: any) => { const files = Array.isArray(d?.files) ? d.files : []; const urls = files.map((f: any) => f?.url).filter(Boolean); return { ...d, files, urls, data: { files, urls } }; } }, // MediaBatchView {files: [{url, key}]} (commerce views/catalog_admin.rs:1153); VariationEditPage:223 and ProductAttributeVariations:602 read res.data.files / res.data.urls, the rest res.files
  { m: 'POST', from: '/upload/optimize-all', row: 'commerce upload.ts:292 (binary /media/optimize-all)', to: '/api/v2/commerce/media/optimize-all', body: () => ({}) },
];
