/**
 * SEO (commerce ROUTE_MAP `seo.ts`): store SEO settings, URL redirects (rules, bulk, CSV, test, log, score), slug history, sitemap and robots.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { wrapData } from '../shape';
import { v2call } from '../http';


const text = (d: any) => (typeof d === 'string' ? d : d?.content ?? d?.xml ?? d?.text ?? '');

export const SEO_ROUTES: V2Route[] = [
  { m: 'GET', from: '/seo/redirects', row: 'commerce seo.ts:182', to: '/api/v2/commerce/redirects', qs: ['active','entity_type','limit','offset','search'] },
  { m: 'POST', from: '/seo/redirects', row: 'commerce seo.ts:205', to: '/api/v2/commerce/redirects', bs: {'entity_name':'s','entity_type':'s','is_active':'b','match_type':'s','note':'s','path_prefix':'s','segment_index':'i','source_path':'s','status_code':'i','target_path':'s'} },
  {
    // Delete by SOURCE path (`{from}`): v2 removes by id, so the rule is found by its source first.
    m: 'DELETE', from: '/seo/redirects', row: 'commerce seo.ts:288 (by source → /redirects/{id}/remove)',
    run: async (c) => {
      const from = String(c.body?.from ?? '').trim();
      const list = await v2call<any[]>('GET', '/api/v2/commerce/redirects', { params: { search: from, limit: 50 } });
      const hit = (Array.isArray(list) ? list : []).find((r) => r.source_path === from);
      if (!hit) return { removed: false };
      return v2call('POST', `/api/v2/commerce/redirects/${encodeURIComponent(hit.id)}/remove`, { data: {} });
    },
  },
  { m: 'PUT', from: '/seo/redirects/:id', row: 'commerce seo.ts:240', method: 'PATCH', to: '/api/v2/commerce/redirects/{id}', bs: {'entity_name':'s','entity_type':'s','is_active':'b','match_type':'s','note':'s','path_prefix':'s','segment_index':'i','source_path':'s','status_code':'i','target_path':'s'} },
  { m: 'DELETE', from: '/seo/redirects/:id', row: 'commerce seo.ts:279', method: 'POST', to: '/api/v2/commerce/redirects/{id}/remove', bs: 'j' },
  { m: 'POST', from: '/seo/redirects/bulk', row: 'commerce seo.ts:257', to: '/api/v2/commerce/redirects/bulk', bs: {'action':'s','entity_type':'s','ids':['s']} },
  // binary: GET /redirects/summary carries the switch beside the per-type groups
  { m: 'GET', from: '/seo/redirects/config', row: 'commerce seo.ts:156 (binary /redirects/summary)', to: '/api/v2/commerce/redirects/summary' },
  { m: 'PUT', from: '/seo/redirects/config', row: 'commerce seo.ts:163 (binary PUT)', to: '/api/v2/commerce/redirects/config', body: (c) => ({ enabled: !!c.body?.enabled }) },
  { m: 'GET', from: '/seo/redirects/export.csv', row: 'commerce seo.ts:333', to: '/api/v2/commerce/redirects/export', qs: ['entity_type'], raw: true }, // download (text)
  { m: 'POST', from: '/seo/redirects/import', row: 'commerce seo.ts:350', to: '/api/v2/commerce/redirects/import', bs: {'csv':'s'}, reply: wrapData },
  { m: 'GET', from: '/seo/redirects/log', row: 'commerce seo.ts:298', to: '/api/v2/commerce/redirects/log', qs: ['limit','offset','redirect_id','search'] },
  { m: 'GET', from: '/seo/redirects/score', row: 'commerce seo.ts:320', to: '/api/v2/commerce/redirects/score', qs: ['days'] },
  { m: 'GET', from: '/seo/redirects/template.csv', row: 'commerce seo.ts:341', to: '/api/v2/commerce/redirects/template', raw: true }, // download (text)
  { m: 'GET', from: '/seo/redirects/test', row: 'commerce seo.ts:173', to: '/api/v2/commerce/redirects/test', qs: ['path'] },
  { m: 'GET', from: '/seo/robots.txt', row: 'commerce seo.ts:449 (binary /public/seo/robots)', to: '/api/v2/commerce/public/seo/robots', reply: text, raw: true },
  { m: 'GET', from: '/seo/settings', row: 'commerce seo.ts:32', to: '/api/v2/commerce/seo/settings', reply: (d) => d?.settings ?? d },
  // binary: PUT /seo/settings {settings} (ROUTE_MAP text says PATCH)
  { m: 'PUT', from: '/seo/settings', row: 'commerce seo.ts:40 (binary PUT)', to: '/api/v2/commerce/seo/settings', body: (c) => ({ settings: c.body ?? {} }), reply: (d) => d?.settings ?? d },
  { m: 'GET', from: '/seo/sitemap.xml', row: 'commerce seo.ts:415', to: '/api/v2/commerce/public/seo/sitemap', reply: text, raw: true },
  { m: 'GET', from: '/seo/slug-history', row: 'commerce seo.ts:371', to: '/api/v2/commerce/slug-history', qs: ['entity_id','entity_type','limit','offset','search'] },
  { m: 'POST', from: '/seo/slug-history/reconstruct', row: 'commerce seo.ts:395', to: '/api/v2/commerce/slug-history/reconstruct', bs: {'entity_id':'s','entity_name':'s','entity_type':'s','new_slug':'s','note':'s','old_slug':'s'} },
];
