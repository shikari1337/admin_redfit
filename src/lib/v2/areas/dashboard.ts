/**
 * Dashboard: the analytics panels (insights ROUTE_MAP rows 28–40) and the
 * "Needs your attention" board's sources (`components/home/useHomeFeed.ts`).
 *
 * v2 answers a panel as `{panel, range, bucket, figures:{…}}`; the screens read the
 * figures at the top level (`data.summary`, `data.timeseries`), so the reply
 * lifts `figures` up and keeps `range`/`bucket` beside them.
 */
import type { V2Ctx, V2Route } from '../routes';

const SERIES = new Set(['commerce', 'orders', 'inventory', 'accounting', 'marketing', 'shipping', 'fulfilment', 'custom-report', 'sales-team']);

/** Only the keys the panel route declares (it refuses unknown fields). */
function panelQuery(ctx: V2Ctx, panel: string): Record<string, unknown> {
  const q: Record<string, unknown> = { from: ctx.query.from, to: ctx.query.to };
  if (SERIES.has(panel)) q.granularity = ctx.query.granularity;
  if (panel === 'custom-report') { q.dimension = ctx.query.dimension; q.metric = ctx.query.metric; }
  return q;
}

const lift = (d: any) => (d && typeof d === 'object' && d.figures && typeof d.figures === 'object'
  ? { ...d.figures, panel: d.panel, range: d.range, bucket: d.bucket }
  : d);

/** The old spelling `fulfillment` is `fulfilment` in v2 (insights row 35). */
const panelName = (p: string) => (p === 'fulfillment' ? 'fulfilment' : p);

export const DASHBOARD_ROUTES: V2Route[] = [
  {
    m: 'GET', from: '/analytics/panels/:panel', row: 'insights 28–40 — GET /api/v2/insights/panels/{panel}',
    to: (c) => `/api/v2/insights/panels/${panelName(c.params.panel)}`,
    query: (c) => panelQuery(c, panelName(c.params.panel)),
    reply: lift,
  },
  {
    m: 'GET', from: '/analytics/panels/inventory/intelligence', row: 'insights 31',
    to: '/api/v2/insights/panels/inventory/intelligence', query: (c) => panelQuery(c, 'inventory/intelligence'), reply: lift,
  },
  {
    m: 'GET', from: '/analytics/panels/custom-report/dimensions', row: 'insights 33',
    to: '/api/v2/insights/panels/custom-report/dimensions',
  },
  {
    m: 'GET', from: '/analytics/panels/sales-team/agents/:id', row: 'insights sales-team',
    to: '/api/v2/insights/panels/sales-team/agents/{id}', query: (c) => panelQuery(c, 'sales-team'), reply: lift,
  },

  // The attention board's sources.
  { m: 'GET', from: '/refunds/summary', row: 'commerce refunds.ts:69', to: '/api/v2/commerce/refunds/summary', reply: (d) => d?.summary ?? d },
  {
    m: 'GET', from: '/carts/admin', row: 'commerce carts.ts:224 — GET /carts', to: '/api/v2/commerce/carts',
    query: (c) => ({ status: c.query.status, q: c.query.search, limit: c.query.limit, offset: c.query.offset ?? offsetOf(c) }),
  },
  { m: 'GET', from: '/contact/stats', row: 'crm — GET /api/v2/crm/inbox/stats', to: '/api/v2/crm/inbox/stats' },
  { m: 'GET', from: '/reviews/admin/counts', row: 'reviews 10', to: '/api/v2/reviews/moderation/reviews/counts' },
  { m: 'GET', from: '/product-questions/admin/counts', row: 'reviews 31', to: '/api/v2/reviews/moderation/questions/counts' },
  // `?excludeImported` has no v2 parameter: the receivables report answers live money only.
  { m: 'GET', from: '/ar/outstanding', row: 'books — GET /api/v2/books/receivables', to: '/api/v2/books/receivables' },
  { m: 'GET', from: '/billing/overview', row: 'platform S16', to: '/api/v2/platform/billing/overview' },
  { m: 'GET', from: '/wms/floor/today', row: 'wms — GET /api/v2/wms/floor/today', to: '/api/v2/wms/floor/today' },
  { m: 'GET', from: '/b2b/applications', row: 'trade — GET /api/v2/trade/applications', to: '/api/v2/trade/applications', query: (c) => ({ status: c.query.status }) },
];

/** A legacy `page` (1-based) + `limit` → the v2 `offset`. */
export function offsetOf(c: V2Ctx): number | undefined {
  const page = Number(c.query.page);
  const limit = Number(c.query.limit) || 20;
  if (c.query.skip !== undefined) return Number(c.query.skip) || 0;
  return Number.isFinite(page) && page > 0 ? (page - 1) * limit : undefined;
}
