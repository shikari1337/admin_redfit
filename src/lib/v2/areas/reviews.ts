/**
 * Reviews, product questions and wishlists (reviews ROUTE_MAP rows 1–36; commerce `wishlist.ts`): the moderation queues, bulk actions, replies, reports, import/export, media upload (raw body), and the wishlist demand reports.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import { v2http, normaliseEnvelope } from '../http';

export const REVIEW_ROUTES: V2Route[] = [
  { m: 'DELETE', from: '/product-questions/:id', row: 'reviews :197', to: '/api/v2/reviews/questions/{id}' },
  { m: 'POST', from: '/product-questions/:id/answer', row: 'reviews :140', to: '/api/v2/reviews/questions/{id}/answer', bs: {'answer':'s','publish':'b'} },
  { m: 'PUT', from: '/product-questions/:id/publish', row: 'reviews 33', method: 'POST', to: '/api/v2/reviews/questions/{id}/status', body: (c) => ({ status: c.body?.published === false ? 'pending' : 'published' }) },
  { m: 'PUT', from: '/product-questions/:id/reject', row: 'reviews 34 (merged into 33)', method: 'POST', to: '/api/v2/reviews/questions/{id}/status', body: () => ({ status: 'rejected' }) },
  { m: 'GET', from: '/product-questions/admin', row: 'reviews :113', to: '/api/v2/reviews/moderation/questions', qs: ['limit','offset','product_id','status','unanswered'] },
  { m: 'POST', from: '/product-questions/admin/bulk', row: 'reviews :172', to: '/api/v2/reviews/moderation/questions/bulk', bs: {'action':'s','ids':['s']} },
  { m: 'GET', from: '/reviews/:id', row: 'reviews :755', to: '/api/v2/reviews/reviews/{id}' },
  { m: 'PUT', from: '/reviews/:id', row: 'reviews :706', method: 'PATCH', to: '/api/v2/reviews/reviews/{id}', bs: {'customer_email':'s','customer_image':'s','customer_name':'s','description':'s','display_order':'i','is_featured':'b','is_verified':'b','link':'s','media':[{'bytes':'i','duration':'i','h':'i','mime':'s','thumb':'s','type':'s','url':'s','w':'i'}],'moderation_reason':'s','product_id':'s','rating':'i','review':'s','status':'s','title':'s','variation_id':'s'} },
  { m: 'DELETE', from: '/reviews/:id', row: 'reviews :741', to: '/api/v2/reviews/reviews/{id}' },
  { m: 'POST', from: '/reviews/:id/reply', row: 'reviews :571', to: '/api/v2/reviews/reviews/{id}/reply', bs: {'body':'s','published':'b'} },
  { m: 'GET', from: '/reviews/admin', row: 'reviews :317', to: '/api/v2/reviews/moderation/reviews', qs: ['date_from','date_to','featured','has_media','has_video','limit','offset','product_id','rating','reported','search','sort','source','status','verified'] },
  { m: 'POST', from: '/reviews/admin', row: 'reviews :599', to: '/api/v2/reviews/moderation/reviews', bs: {'customer_email':'s','customer_image':'s','customer_name':'s','description':'s','is_featured':'b','is_verified':'b','link':'s','media':[{'bytes':'i','duration':'i','h':'i','mime':'s','thumb':'s','type':'s','url':'s','w':'i'}],'product_id':'s','rating':'i','review':'s','status':'s','title':'s','variation_id':'s'} },
  { m: 'GET', from: '/reviews/admin/:id/reports', row: 'reviews :360', to: '/api/v2/reviews/reviews/{id}/reports' },
  { m: 'POST', from: '/reviews/admin/:id/resolve-reports', row: 'reviews :587', to: '/api/v2/reviews/reviews/{id}/reports/resolve', bs: {'status':'s'} },
  { m: 'POST', from: '/reviews/admin/bulk-delete', row: 'reviews :561', to: '/api/v2/reviews/moderation/reviews/delete', bs: {'ids':['s']} },
  { m: 'GET', from: '/reviews/admin/export', row: 'reviews :368', to: '/api/v2/reviews/moderation/reviews/export', qs: ['product_id','rating','search','status'] }, // download
  { m: 'POST', from: '/reviews/admin/feature', row: 'reviews :551', to: '/api/v2/reviews/moderation/reviews/feature', bs: {'featured':'b','ids':['s']} },
  { m: 'POST', from: '/reviews/admin/import', row: 'reviews :640', to: '/api/v2/reviews/moderation/reviews/import', bs: {'rows':[{'customer_email':'j','customer_image':'j','customer_name':'j','description':'j','images':'j','link':'j','product_id':'j','rating':'j','review':'j','sku':'j','status':'j','title':'j','verified':'j','video':'j'}]} },
  { m: 'POST', from: '/reviews/admin/moderate', row: 'reviews :527', to: '/api/v2/reviews/moderation/reviews/status', bs: {'ids':['s'],'reason':'s','status':'s'} },
  {
    m: 'POST', from: '/reviews/upload', row: 'reviews 1 (raw body)',
    run: async (c) => {
      const f = typeof FormData !== 'undefined' && c.body instanceof FormData ? (c.body.get('file') as File | null) : (c.body as File | null);
      if (!f) throw new Error('No file was chosen.');
      const r = await v2http.request({ method: 'POST', url: '/api/v2/reviews/media', data: f, headers: { 'content-type': f.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name || 'upload') } });
      return normaliseEnvelope(r.data);
    },
  },
  { m: 'GET', from: '/wishlist/admin/customers', row: 'commerce wishlist.ts:151', to: '/api/v2/commerce/wishlist/customers', qs: ['limit'] },
  { m: 'GET', from: '/wishlist/admin/demand', row: 'commerce wishlist.ts:121', to: '/api/v2/commerce/wishlist/demand', qs: ['days','grain','limit','offset','search','stock'] },
  { m: 'GET', from: '/wishlist/admin/export', row: 'commerce wishlist.ts:184', to: '/api/v2/commerce/wishlist/export', qs: ['days','grain','limit','offset','search','stock'] }, // download
  { m: 'GET', from: '/wishlist/admin/summary', row: 'commerce wishlist.ts:133', to: '/api/v2/commerce/wishlist/summary' },
];
