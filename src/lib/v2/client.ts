/**
 * The v2 client — ONE request path and ONE response normaliser for the admin on
 * the Rust API. It plugs into the existing axios instance (`services/api.ts`
 * `api`) so every caller — the API layer AND the screens that call `api.get`
 * directly — keeps its props, its paths and its return shapes:
 *
 *   request   the legacy `/api/v1` call is matched against the route table
 *             (`routes.ts`, one row per ROUTE_MAP row); a match runs the v2 call
 *             through a per-request axios adapter, a miss is refused LOCALLY with
 *             `v2.not_migrated` (never sent anywhere — no silent 404, and a v2
 *             build can never fall back to a Node host)
 *   headers   `X-Store-Key` (the resolved store's public key) +
 *             `Authorization: Bearer <Growcord ID access token>`
 *   reply     Envelope `{success, data}` → data; `Page {items,total,limit}` → the
 *             array-with-`total` the old interceptor produced; every `Money`
 *             → rupees (money.ts); then the row's own shape adapter; then the
 *             legacy `_id`/camelCase aliases the screens read
 *   errors    `{success:false, code, message, details{errors[]}}` → the shape
 *             `safeError` / `errorText` already read; 401 ends the session,
 *             403 NEVER does (DEC-057) — it raises the existing access notice
 */
import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { V2_API_URL } from './config';
import { endLocal } from './session';
import { v2http, normaliseEnvelope } from './http';
import { matchRoute } from './routes';
import type { V2Ctx, V2Route } from './routes';

/* ── errors ──────────────────────────────────────────────────────────────── */

interface V2ErrorBody { success?: boolean; code?: string; message?: string; details?: { errors?: Array<{ field?: string; code?: string; message?: string }> } & Record<string, unknown> }

/** The v2 error body in the shape `safeError` / `errorText` read (`message`, `code`, `errors[0].msg`). */
function legacyErrorBody(b: V2ErrorBody | undefined, status: number): Record<string, unknown> {
  const errors = (b?.details?.errors ?? []).map((e) => ({ msg: e.message, field: e.field, code: e.code }));
  const message = b?.message || (status >= 500 ? 'The server could not complete the request.' : 'The request was refused.');
  return { success: false, code: b?.code, message, error: { code: b?.code, message }, errors, details: b?.details };
}

const ACCESS_NOTICE: Record<string, string> = {
  'access.permission_denied': 'PERMISSION_DENIED',
  'access.module_disabled': 'MODULE_DISABLED',
  'access.module_not_in_plan': 'MODULE_NOT_IN_PLAN',
  'access.module_view_only': 'MODULE_VIEW_ONLY',
};

/** The legacy instance's error interceptor in v2 mode. */
export function v2OnError(error: AxiosError): Promise<never> {
  const status = error.response?.status;
  const data = (error.response?.data ?? {}) as Record<string, unknown>;
  const code = String(data.code ?? '');
  if (error.code === 'V2_BACKEND_GAP') {
    console.warn('🧩 v2 backend gap:', (data.message as string) || error.message);
    return Promise.reject(error);
  }
  if (error.code === 'V2_NOT_MIGRATED') {
    // Visible, honest, and not a fault of the server: the call has no v2 row yet.
    console.warn('⏳ v2: not migrated —', (data.message as string) || error.message);
    return Promise.reject(error);
  }
  if (status === 401) {
    // DEC-057: only 401 ends the session.
    endLocal();
    if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/auth/callback')) {
      setTimeout(() => { location.href = '/login'; }, 50);
    }
  } else if (status === 403) {
    // 403 never ends a session: it is the gate working. The access notice explains it.
    if (ACCESS_NOTICE[code]) {
      window.dispatchEvent(new CustomEvent('admin:access-denied', { detail: { code: ACCESS_NOTICE[code], message: data.message, upgrade: code === 'access.module_not_in_plan' } }));
      console.debug('🔒 Access refused (expected):', { url: error.config?.url, code });
      return Promise.reject(error);
    }
  }
  if (code.endsWith('.port_not_wired') || (status === 503 && code.endsWith('_unavailable'))) {
    // A BACKEND GAP, not a client fault: the host has not wired that port yet. Named, not red.
    console.warn('🧩 v2 backend gap (port not wired):', { url: error.config?.url, code, message: data.message });
    return Promise.reject(error);
  }
  if (!error.response) console.error('❌ v2: no response from the API', { url: error.config?.url, message: error.message });
  else console.error('❌ v2 response error', { status, url: error.config?.url, code, message: data.message });
  return Promise.reject(error);
}

/* ── the request path ────────────────────────────────────────────────────── */

type Aliases = (data: any) => any;
let legacyAliases: Aliases = (d) => d;

/** Apply `fn` to a list without losing the non-enumerable list metadata (`total`, `channels` …). */
function withMeta(data: unknown, fn: Aliases): unknown {
  if (!Array.isArray(data)) return fn(data);
  const meta: Record<string, unknown> = {};
  for (const k of Object.getOwnPropertyNames(data)) {
    if (k === 'length' || /^\d+$/.test(k)) continue;
    meta[k] = (data as unknown as Record<string, unknown>)[k];
  }
  const out = fn(data);
  if (Array.isArray(out)) {
    for (const [k, v] of Object.entries(meta)) Object.defineProperty(out, k, { value: v, writable: true, enumerable: false, configurable: true });
  }
  return out;
}

function splitUrl(cfg: InternalAxiosRequestConfig): { path: string; query: Record<string, unknown> } {
  let url = cfg.url || '';
  if (/^https?:\/\//i.test(url)) {
    try { const u = new URL(url); url = u.pathname + u.search; } catch { /* keep */ }
  }
  url = url.replace(/^\/api\/v\d+(?=\/)/, '');
  const [p, qs] = url.split('?');
  const query: Record<string, unknown> = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
  if (cfg.params && typeof cfg.params === 'object') {
    for (const [k, v] of Object.entries(cfg.params as Record<string, unknown>)) if (v !== undefined && v !== null && v !== '') query[k] = v;
  }
  return { path: (p || '/').replace(/\/+$/, '') || '/', query };
}

function parseBody(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function cleanQuery(q: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!q) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}

function notMigrated(method: string, path: string): AxiosAdapter {
  return (cfg) => {
    const message = `${method} ${path} is not on the v2 API yet (ADMIN-V2 lane).`;
    const response = { data: { success: false, code: 'v2.not_migrated', message }, status: 501, statusText: 'Not Migrated', headers: {}, config: cfg, request: {} } as AxiosResponse;
    return Promise.reject(new AxiosError(message, 'V2_NOT_MIGRATED', cfg, null, response));
  };
}

function runner(route: V2Route, ctx: V2Ctx): AxiosAdapter {
  return async (cfg) => {
    try {
      let data: unknown;
      let status = 200;
      let headers: Record<string, unknown> = {};
      const binary = cfg.responseType === 'blob' || cfg.responseType === 'arraybuffer';
      if (route.run) {
        data = await route.run(ctx);
      } else {
        const to = typeof route.to === 'function' ? route.to(ctx) : (route.to || '').replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(ctx.params[k] ?? ''));
        const res = await v2http.request({
          method: route.method || ctx.method,
          url: to,
          params: cleanQuery(route.query ? route.query(ctx) : undefined),
          data: route.body ? route.body(ctx) : (ctx.method === 'GET' ? undefined : ctx.body),
          responseType: binary ? cfg.responseType : 'json',
          timeout: cfg.timeout,
          onUploadProgress: cfg.onUploadProgress,
          onDownloadProgress: cfg.onDownloadProgress,
        });
        status = res.status;
        headers = res.headers as Record<string, unknown>;
        if (binary) return { data: res.data, status, statusText: res.statusText, headers: res.headers, config: cfg, request: {} } as AxiosResponse;
        data = normaliseEnvelope(res.data);
      }
      if (route.reply) data = route.reply(data, ctx);
      if (!route.raw) data = withMeta(data, legacyAliases);
      return { data, status, statusText: 'OK', headers, config: cfg, request: {} } as AxiosResponse;
    } catch (e) {
      const err = e as AxiosError;
      if (err?.code === 'V2_NOT_MIGRATED') throw err;
      if (err?.code === 'V2_BACKEND_GAP') {
        throw new AxiosError(err.message, 'V2_BACKEND_GAP', cfg, null, { ...(err.response as AxiosResponse), config: cfg } as AxiosResponse);
      }
      if (err && (err as AxiosError).isAxiosError && err.response) {
        const response = {
          ...err.response,
          data: legacyErrorBody(err.response.data as V2ErrorBody, err.response.status),
          config: cfg,
        } as AxiosResponse;
        throw new AxiosError((response.data as { message: string }).message, err.code, cfg, null, response);
      }
      if (err && (err as AxiosError).isAxiosError) throw new AxiosError(err.message, err.code, cfg, null, undefined);
      throw e;
    }
  };
}

/** The legacy instance's request interceptor in v2 mode: route or refuse, never send to /api/v1. */
export function v2OnRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const method = (config.method || 'get').toUpperCase();
  const { path, query } = splitUrl(config);
  const hit = matchRoute(method, path);
  (config as InternalAxiosRequestConfig & { __v2?: string }).__v2 = hit ? hit.route.from : 'not-migrated';
  if (!hit) {
    config.adapter = notMigrated(method, path);
    return config;
  }
  const ctx: V2Ctx = { method, path, params: hit.params, query, body: parseBody(config.data) };
  config.adapter = runner(hit.route, ctx);
  return config;
}

/** True when the response was produced by the v2 path (the legacy normaliser must not run again). */
export function isV2Response(response: AxiosResponse): boolean {
  return !!(response.config as InternalAxiosRequestConfig & { __v2?: string })?.__v2;
}

/** Wire the v2 path into the legacy axios instance. `aliases` = the legacy `_id`/camelCase decoration. */
export function installV2(api: AxiosInstance, aliases: Aliases): void {
  legacyAliases = aliases;
  // Nothing in a v2 build may ever reach a Node host: the legacy base becomes the v2 origin.
  api.defaults.baseURL = `${V2_API_URL}/api/v1`;
}
