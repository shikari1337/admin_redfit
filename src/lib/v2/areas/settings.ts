/**
 * Settings (commerce ROUTE_MAP `settings.ts`) and the shell's platform reads.
 *
 * `GET /settings/admin` (staff, masked secrets) is `GET /settings` in v2, answered
 * as `{settings:{…}, slug, environment, timezone}`; every settings screen reads the
 * keys flat (`settings.storeConfig`, `settings.timezone`), so the reply lifts them.
 * `GET /settings` (public) is `GET /public/settings`, named snake_case keys
 * (`store_config` → `storeConfig` through the legacy aliases).
 *
 * BACKEND GAPS (rows the ROUTE_MAP names, NOT mounted in the binary): `PATCH
 * /settings` (settings.ts:445, + the merged `POST /settings/bulk`), `PATCH
 * /settings/{key}` (:388) and the staff `GET /settings/{key}` (:372). The flat
 * settings writes are therefore refused locally with `v2.backend_gap` naming the
 * call — never sent to a route that does not exist. `GET /settings/registry`
 * answers 503 `commerce.port_not_wired` (the settings peers port).
 */
import type { V2Route } from '../routes';
import { backendGap } from '../http';

const S = '/api/v2/commerce';

const liftSettings = (d: any) => (d && typeof d === 'object' && d.settings && typeof d.settings === 'object'
  ? { ...d.settings, slug: d.slug, environment: d.environment, timezone: d.timezone }
  : d);

export const SETTINGS_ROUTES: V2Route[] = [
  { m: 'GET', from: '/settings/admin', row: 'commerce settings.ts:160 — GET /settings (staff)', to: `${S}/settings`, reply: liftSettings },
  { m: 'GET', from: '/settings', row: 'commerce settings.ts:92 — GET /public/settings', to: `${S}/public/settings` },
  { m: 'GET', from: '/settings/product-config', row: 'commerce settings.ts:73', to: `${S}/public/settings/product-config`, reply: (d) => d?.config ?? d },
  { m: 'GET', from: '/settings/registry', row: 'commerce settings.ts:351', to: `${S}/settings/registry` },
  { m: 'PUT', from: '/settings/registry/:key', row: 'commerce settings.ts:364', method: 'PATCH', to: `${S}/settings/registry/{key}` },
  { m: 'GET', from: '/settings/order-numbering', row: 'commerce settings.ts:213', to: `${S}/settings/order-numbering` },
  {
    m: 'PUT', from: '/settings/order-numbering', row: 'commerce settings.ts:234 (binary: PUT)', to: `${S}/settings/order-numbering`,
    body: (c) => ({ retail: c.body?.retail ?? null, b2b: c.body?.b2b ?? null, separate_b2b_series: c.body?.separateB2bSeries ?? c.body?.separate_b2b_series ?? null }),
  },
  { m: 'POST', from: '/settings/order-numbering/preview', row: 'commerce settings.ts:246', to: `${S}/settings/order-numbering/preview` },
  { m: 'GET', from: '/settings/group/:group', row: 'commerce settings.ts:195 (staff GET /settings/groups/{group})', to: `${S}/settings/groups/{group}`, reply: (d) => d?.settings ?? d },

  // ROUTE_MAP rows not mounted in the binary (BACKEND GAP, see the header).
  { m: 'PUT', from: '/settings', row: 'commerce settings.ts:445 PATCH /settings — NOT MOUNTED', run: async () => backendGap('PATCH /api/v2/commerce/settings (settings.ts:445)') },
  { m: 'POST', from: '/settings/bulk', row: 'commerce settings.ts:424 (merged → PATCH /settings) — NOT MOUNTED', run: async () => backendGap('PATCH /api/v2/commerce/settings (settings.ts:424 merged)') },
  { m: 'PUT', from: '/settings/:key', row: 'commerce settings.ts:388 PATCH /settings/{key} — NOT MOUNTED', run: async (c) => backendGap(`PATCH /api/v2/commerce/settings/${c.params.key} (settings.ts:388)`) },

  // The shell's product bar (platform P1).
  { m: 'GET', from: '/platform/products', row: 'platform P1 — GET /api/v2/platform/public/products', to: '/api/v2/platform/public/products' },
];
