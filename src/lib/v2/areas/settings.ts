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
 * saves (`PUT /settings`, `POST /settings/bulk`) go section by section through the
 * registry's own write (settingsRegistryWrite.ts); `PUT /settings/{key}` is refused
 * locally with `v2.backend_gap` naming the call, never sent to a route that does not exist.
 */
import type { V2Route } from '../routes';
import { backendGap } from '../http';
import { saveSettingsThroughRegistry } from './settingsRegistryWrite';

const S = '/api/v2/commerce';

const liftSettings = (d: any) => (d && typeof d === 'object' && d.settings && typeof d.settings === 'object'
  ? { ...d.settings, slug: d.slug, environment: d.environment, timezone: d.timezone }
  : d);

/**
 * NumberingView is flat `{retail, b2b, separate_b2b_series, next_retail, next_b2b, sequences, tokens}`
 * (commerce views/catalog_admin.rs:1736); OrderNumbering reads the old `{config:{retail, b2b,
 * separateB2bSeries}, preview:{retail, b2b}}` — without it the form showed the defaults, not the store's rules.
 */
/** `{settings: [{key, value}]}` (the old bulk body) becomes `{key: value}`, the sections the registry save takes. */
const bulkSections = (body: any): Record<string, unknown> => {
  const rows: any[] = Array.isArray(body?.settings) ? body.settings : [];
  const out: Record<string, unknown> = {};
  for (const r of rows) if (r && typeof r.key === 'string' && r.key) out[r.key] = r.value;
  return out;
};

const numberingReply =(d: any) => (d && typeof d === 'object' && !Array.isArray(d) && !d.config && (d.retail || d.b2b)
  ? { ...d, config: { retail: d.retail, b2b: d.b2b, separateB2bSeries: d.separate_b2b_series }, preview: d.preview ?? { retail: d.next_retail ?? '', b2b: d.next_b2b ?? '' } }
  : d);

export const SETTINGS_ROUTES: V2Route[] = [
  { m: 'GET', from: '/settings/admin', row: 'commerce settings.ts:160 — GET /settings (staff)', to: `${S}/settings`, reply: liftSettings },
  { m: 'GET', from: '/settings', row: 'commerce settings.ts:92 — GET /public/settings', to: `${S}/public/settings` },
  { m: 'GET', from: '/settings/product-config', row: 'commerce settings.ts:73', to: `${S}/public/settings/product-config`, reply: (d) => d?.config ?? d },
  // v2 answers both inside `center` (SettingsCenterView / SettingSavedView); the Settings Center reads
  // `groups` / the saved definition at the top level, so lift it out (`[...undefined.groups]` crashed the page)
  { m: 'GET', from: '/settings/registry', row: 'commerce settings.ts:351', to: `${S}/settings/registry`, reply: (d) => d?.center ?? d },
  { m: 'PUT', from: '/settings/registry/:key', row: 'commerce settings.ts:364', method: 'PATCH', to: `${S}/settings/registry/{key}`, reply: (d) => d?.center ?? d },
  { m: 'GET', from: '/settings/order-numbering', row: 'commerce settings.ts:213', to: `${S}/settings/order-numbering`, reply: numberingReply },
  {
    m: 'PUT', from: '/settings/order-numbering', row: 'commerce settings.ts:234 (binary: PUT)', to: `${S}/settings/order-numbering`,
    body: (c) => ({ retail: c.body?.retail ?? null, b2b: c.body?.b2b ?? null, separate_b2b_series: c.body?.separateB2bSeries ?? c.body?.separate_b2b_series ?? null }),
    reply: numberingReply,
  },
  { m: 'POST', from: '/settings/order-numbering/preview', row: 'commerce settings.ts:246', to: `${S}/settings/order-numbering/preview` },
  { m: 'GET', from: '/settings/group/:group', row: 'commerce settings.ts:195 (staff GET /settings/groups/{group})', to: `${S}/settings/groups/{group}`, reply: (d) => d?.settings ?? d },

  // ROUTE_MAP rows not mounted in the binary (BACKEND GAP, see the header).
  // MSG-0 §5 (ADMIN-MSG-1): PATCH /settings is not mounted, so the flat save goes section by section through the
  // registry's own write (`PATCH /settings/registry/{key}`) — API Integrations, Shipping and the other `PUT /settings`
  // callers save again; a section this server has no setting for is named, never dropped silently.
  { m: 'PUT', from: '/settings', row: 'commerce settings.ts:445 → PATCH /settings/registry/{key} per section (settings.ts:364)', run: async (c) => saveSettingsThroughRegistry(c.body) },
  // MENU-1 settings-core: the bulk save (`{settings: [{key, value, grp, is_public}]}`, Store Configuration and the
  // Setup wizard) is the same flat save in a list: each row becomes its section, written through the registry.
  // `grp` and `is_public` are the definition's own on v2, so they are not sent.
  { m: 'POST', from: '/settings/bulk', row: 'commerce settings.ts:424, written as PATCH /settings/registry/{key} per row (settings.ts:364)', run: async (c) => saveSettingsThroughRegistry(bulkSections(c.body)) },
  { m: 'PUT', from: '/settings/:key', row: 'commerce settings.ts:388 PATCH /settings/{key} — NOT MOUNTED', run: async (c) => backendGap(`PATCH /api/v2/commerce/settings/${c.params.key} (settings.ts:388)`) },

  // The shell's product bar (platform P1).
  { m: 'GET', from: '/platform/products', row: 'platform P1 — GET /api/v2/platform/public/products', to: '/api/v2/platform/public/products' },
];
