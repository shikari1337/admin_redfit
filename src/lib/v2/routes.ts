/**
 * The admin's URL table: every legacy `/api/v1` call the admin makes that has a
 * v2 home, one row per ROUTE_MAP row (`growcord-rs/apps/<app>/docs/ROUTE_MAP.md`).
 * A row names the legacy method + path pattern, the v2 method + path, and the
 * shape adapters that keep the screen's view of the answer unchanged. Rows live
 * per area in `areas/*.ts`; this file only types and matches them.
 *
 * A legacy route the ROUTE_MAP DROPPED or MERGED either gets a row that adapts
 * the call to the surviving route, or a `run` that answers what the screen needs
 * and says why in a comment — never a silent 404.
 */
import { AUTH_ROUTES } from './areas/auth';
import { DASHBOARD_ROUTES } from './areas/dashboard';
import { PRODUCT_ROUTES } from './areas/products';
import { ORDER_ROUTES } from './areas/orders';
import { CUSTOMER_ROUTES } from './areas/customers';
import { SETTINGS_ROUTES } from './areas/settings';
import { EXTRA_ROUTES } from './areas';
import type { ReplySpec, Spec } from './shape';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface V2Ctx {
  /** The legacy method and path (no `/api/v1`, no query). */
  method: string;
  path: string;
  /** Path parameters of the legacy pattern (`:id` → params.id). */
  params: Record<string, string>;
  /** The legacy query: the URL's own `?…` merged with axios `params`. */
  query: Record<string, any>;
  /** The legacy body (parsed JSON, or FormData as sent). */
  body: any;
}

export interface V2Route {
  /** Legacy method. */
  m: HttpMethod;
  /** Legacy path pattern, `:name` for a segment. */
  from: string;
  /** v2 path (`{name}` filled from the legacy params) or a function of the call. */
  to?: string | ((ctx: V2Ctx) => string);
  /** v2 method when it differs (PUT → PATCH, DELETE → POST …/delete). */
  method?: HttpMethod;
  /** The v2 query (default: none — a legacy query is never forwarded blind). */
  query?: (ctx: V2Ctx) => Record<string, unknown> | undefined;
  /** The v2 body (default: the legacy body as is). */
  body?: (ctx: V2Ctx) => unknown;
  /** The normalised answer → the shape the screen reads. */
  reply?: (data: any, ctx: V2Ctx) => any;
  /** A composite answer built from several v2 calls (or none, with the reason in a comment). */
  run?: (ctx: V2Ctx) => Promise<any>;
  /** Skip the legacy `_id`/camelCase aliases. */
  raw?: boolean;
  /** The handler's declared query fields (binary); the generic query shaper applies when `query` is absent. */
  qs?: readonly string[];
  /** The route's typed body (compact spec from the binary); the generic body shaper applies when `body` is absent. */
  bs?: Spec | 'multipart' | null;
  /** The reply's milli-percent / minor-integer leaves, rescaled before `reply`. */
  rs?: ReplySpec | null;
  /**
   * A NAMED refusal: the ROUTE_MAP row exists but the running backend does not serve it (not mounted, or
   * its port answers `port_not_wired`). Refused locally as `v2.backend_gap` with this text, so the screen's
   * own error state shows "not available on this backend yet" — never a blank screen, never a 404 probe.
   */
  gap?: string;
  /** ROUTE_MAP reference (`commerce products.ts:39`, `identity D7` …). */
  row: string;
}

interface Compiled { route: V2Route; re: RegExp; names: string[]; literal: number; length: number }

let compiled: Compiled[] | null = null;

function compile(r: V2Route): Compiled {
  const names: string[] = [];
  const segs = r.from.split('/').filter(Boolean);
  let literal = 0;
  const pattern = segs.map((s) => {
    if (s.startsWith(':')) { names.push(s.slice(1)); return '([^/]+)'; }
    literal += 1;
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { route: r, re: new RegExp(`^/${pattern}$`), names, literal, length: segs.length };
}

/** Every row, most specific first (more literal segments win at equal length). */
export function allRoutes(): V2Route[] {
  return [...AUTH_ROUTES, ...DASHBOARD_ROUTES, ...PRODUCT_ROUTES, ...ORDER_ROUTES, ...CUSTOMER_ROUTES, ...SETTINGS_ROUTES, ...EXTRA_ROUTES];
}

export function matchRoute(method: string, path: string): { route: V2Route; params: Record<string, string> } | null {
  if (!compiled) {
    compiled = allRoutes().map(compile).sort((a, b) => b.literal - a.literal);
  }
  for (const c of compiled) {
    if (c.route.m !== method) continue;
    const m = c.re.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    c.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { route: c.route, params };
  }
  return null;
}
