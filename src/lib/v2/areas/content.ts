/**
 * Content (commerce ROUTE_MAP `pages.ts`, `menus.ts`, `banners.ts`, `trustBadges.ts`, `blogPosts.ts`, `upload.ts`; platform plugins): CMS pages and their blocks, menus, banners, trust badges, blog posts, the media library and uploads.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2call } from '../http';

export const CONTENT_ROUTES: V2Route[] = [
  { m: 'GET', from: '/banners', row: 'commerce banners.ts:27', to: '/api/v2/commerce/banners', qs: ['limit','offset','page','sort','q','position','is_active'] },
  { m: 'POST', from: '/banners', row: 'commerce banners.ts:50', to: '/api/v2/commerce/banners', bs: {'display_order':'i','image_url':'j','is_active':'b','link_url':'j','metadata':'j','mobile_image_url':'j','position':'j','subtitle':'j','title':'j','valid_from':'j','valid_until':'j'} },
  { m: 'GET', from: '/banners/:id', row: 'commerce banners.ts:42', to: '/api/v2/commerce/public/banners/{id}' },
  { m: 'PUT', from: '/banners/:id', row: 'commerce banners.ts:66', method: 'PATCH', to: '/api/v2/commerce/banners/{id}', bs: {'display_order':'i','image_url':'j','is_active':'b','link_url':'j','metadata':'j','mobile_image_url':'j','position':'j','subtitle':'j','title':'j','valid_from':'j','valid_until':'j'} },
  { m: 'DELETE', from: '/banners/:id', row: 'commerce banners.ts:74', to: '/api/v2/commerce/banners/{id}' },
  { m: 'POST', from: '/blog-posts', row: 'commerce blogPosts.ts:93', to: '/api/v2/commerce/blog-posts', bs: {'author_name':'s','content':'s','cover_image':'s','excerpt':'s','published_at':'s','read_time_min':'i','seo':'j','slug':'s','status':'s','tags':['s'],'title':'s'} },
  { m: 'GET', from: '/blog-posts', row: 'commerce blogPosts.ts:16', to: '/api/v2/commerce/public/blog-posts', qs: ['limit','offset','search','status'] },
  { m: 'GET', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:81', to: '/api/v2/commerce/blog-posts/{id}' },
  { m: 'PUT', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:113', method: 'PATCH', to: '/api/v2/commerce/blog-posts/{id}', bs: {'author_name':'s','content':'s','cover_image':'s','excerpt':'s','published_at':'s','read_time_min':'i','seo':'j','slug':'s','status':'s','tags':['s'],'title':'s'} },
  { m: 'DELETE', from: '/blog-posts/:id', row: 'commerce blogPosts.ts:152', method: 'POST', to: '/api/v2/commerce/blog-posts/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/menus', row: 'commerce menus.ts:145', to: '/api/v2/commerce/public/menus' },
  { m: 'POST', from: '/menus', row: 'commerce menus.ts:183', to: '/api/v2/commerce/menus', bs: {'is_active':'b','items':'j','location':'j','name':'s','slug':'s'} },
  { m: 'PUT', from: '/menus/:id', row: 'commerce menus.ts:198', method: 'PATCH', to: '/api/v2/commerce/menus/{id}', bs: {'is_active':'b','items':'j','location':'j','name':'s','slug':'s'} },
  { m: 'DELETE', from: '/menus/:id', row: 'commerce menus.ts:206', to: '/api/v2/commerce/menus/{id}' },
  { m: 'GET', from: '/menus/location/:location', row: 'commerce menus.ts:166', to: '/api/v2/commerce/public/menus/location/{location}' },
  { m: 'POST', from: '/pages', row: 'commerce pages.ts:252', to: '/api/v2/commerce/pages', bs: {'custom_css':'s','custom_html':'s','is_active':'b','published_at':'s','sections':['j'],'seo':'j','slug':'s','template_id':'s','title':'s','type':'s'} },
  { m: 'PUT', from: '/pages/:id', row: 'commerce pages.ts:259', method: 'PATCH', to: '/api/v2/commerce/pages/{id}', bs: {'custom_css':'s','custom_html':'s','is_active':'b','published_at':'s','sections':['j'],'seo':'j','slug':'s','template_id':'s','title':'s','type':'s'} },
  { m: 'DELETE', from: '/pages/:id', row: 'commerce pages.ts:275', method: 'POST', to: '/api/v2/commerce/pages/{id}/remove', bs: 'j' },
  { m: 'GET', from: '/pages/admin/:id', row: 'commerce pages.ts:76', to: '/api/v2/commerce/pages/{id}' },
  { m: 'GET', from: '/pages/admin/all', row: 'commerce pages.ts:60', to: '/api/v2/commerce/pages' },
  { m: 'GET', from: '/pages/block-types', row: 'commerce pages.ts:55', to: '/api/v2/commerce/public/page-block-types' },
  { m: 'POST', from: '/pages/generate-block-content', row: 'commerce pages.ts:137', gap: 'AI block content for pages is not mounted in this binary (ROUTE_MAP names POST /pages/block-content)' },
  { m: 'GET', from: '/pages/templates', row: 'commerce pages.ts:43', to: '/api/v2/commerce/public/page-templates' },
  { m: 'GET', from: '/plugins', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'POST', from: '/plugins', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'DELETE', from: '/plugins/:p1', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'PUT', from: '/plugins/:p1/config', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'PUT', from: '/plugins/:p1/toggle', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/plugins/available', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/plugins/installed', row: 'platform plugins.ts (dropped)', gap: 'plugins are not served by v2 (platform ROUTE_MAP: dead — nothing installed plugins; no plugin store exists)' },
  { m: 'GET', from: '/trust-badges', row: 'commerce trustBadges.ts:7', to: '/api/v2/commerce/public/trust-badges' },
  { m: 'POST', from: '/trust-badges', row: 'commerce trustBadges.ts:23', to: '/api/v2/commerce/trust-badges', bs: {'description':'j','display_order':'i','image_url':'j','is_active':'b','title':'s'} },
  { m: 'PUT', from: '/trust-badges/:id', row: 'commerce trustBadges.ts:36', method: 'PATCH', to: '/api/v2/commerce/trust-badges/{id}', bs: {'description':'j','display_order':'i','image_url':'j','is_active':'b','title':'s'} },
  { m: 'DELETE', from: '/trust-badges/:id', row: 'commerce trustBadges.ts:44', to: '/api/v2/commerce/trust-badges/{id}' },
  { m: 'POST', from: '/upload', row: 'commerce upload.ts:53', to: '/api/v2/commerce/media', bs: {'#mp':'j','folder':'s','image':'f'} },
  { m: 'DELETE', from: '/upload/:key', row: 'commerce upload.ts:348 (key → body)', method: 'POST', to: '/api/v2/commerce/media/remove', body: (c) => ({ key: c.params.key }) },
  { m: 'GET', from: '/upload/browse', row: 'commerce upload.ts:210', to: '/api/v2/commerce/media/browse', qs: ['cursor','limit','prefix','search'] },
  { m: 'GET', from: '/upload/files', row: 'commerce upload.ts:182 (binary /media/files)', to: '/api/v2/commerce/media/files' },
  {
    // no remove-many in the binary: each key is removed through the one remove route, reported together
    m: 'DELETE', from: '/upload/files', row: 'commerce upload.ts:261 (each key → /media/remove)',
    run: async (c) => {
      const keys: string[] = Array.isArray(c.body?.keys) ? c.body.keys : Array.isArray(c.body?.files) ? c.body.files : [];
      const results = [];
      for (const key of keys) results.push(await v2call('POST', '/api/v2/commerce/media/remove', { data: { key } }));
      return { removed: results.length, results };
    },
  },
  { m: 'POST', from: '/upload/multiple', row: 'commerce upload.ts:135', to: '/api/v2/commerce/media/batch', bs: {'#mp':'j','folder':'s','images':['f']} },
  { m: 'POST', from: '/upload/optimize-all', row: 'commerce upload.ts:292 (binary /media/optimize-all)', to: '/api/v2/commerce/media/optimize-all', body: () => ({}) },
];
