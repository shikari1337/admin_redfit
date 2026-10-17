/**
 * The v2 transport and the ONE response normaliser. `client.ts` plugs these into
 * the legacy axios instance; the route areas use `v2call` for composite rows.
 */
import axios, { AxiosHeaders } from 'axios';
import type { AxiosInstance } from 'axios';
import { V2_API_URL } from './config';
import { moneyToMajorDeep } from './money';
import { accessToken } from './session';
import { storeKeyNow } from './tenant';

export const v2http: AxiosInstance = axios.create({ baseURL: V2_API_URL, timeout: 120000 });

v2http.interceptors.request.use(async (cfg) => {
  const headers = AxiosHeaders.from(cfg.headers);
  headers.set('accept', headers.get('accept') || 'application/json');
  const key = storeKeyNow();
  if (key && !headers.has('x-store-key')) headers.set('x-store-key', key);
  const tok = await accessToken();
  if (tok && !headers.has('authorization')) headers.set('authorization', `Bearer ${tok}`);
  cfg.headers = headers;
  return cfg;
});

export interface ListMeta { total?: number; limit?: number; offset?: number; page?: number; pages?: number; count?: number; [k: string]: unknown }

/** An array carrying list metadata as NON-enumerable properties (what the old interceptor did). */
export function asList<T>(items: T[], meta: ListMeta = {}): T[] & ListMeta {
  const arr = items.slice() as T[] & ListMeta;
  const put = (k: string, v: unknown) => {
    if (v !== undefined) Object.defineProperty(arr, k, { value: v, writable: true, enumerable: false, configurable: true });
  };
  for (const [k, v] of Object.entries(meta)) put(k, v);
  if (meta.count === undefined) put('count', items.length);
  return arr;
}

export function isPage(v: unknown): v is { items: unknown[]; total?: number; limit?: number; offset?: number } {
  // A Page always carries its numeric `limit` beside `items` (`Page {items, total | cursor, limit}`). A DETAIL
  // object that merely has `items` and a money `total` (a cart, an invoice) is NOT a page — testing `total`
  // alone turned a cart into its line array (ADMIN-V2-2).
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as { items?: unknown; limit?: unknown };
  return Array.isArray(o.items) && typeof o.limit === 'number';
}

/** The list metadata of a normalised list (survives `asList`). */
export function listMeta(v: unknown): ListMeta {
  const a = v as ListMeta | undefined;
  return { total: a?.total, limit: a?.limit, offset: a?.offset, page: a?.page, pages: a?.pages };
}

/** Map a list's rows, keeping its non-enumerable metadata (`total` …). */
export function mapList<T, U>(list: T[], fn: (row: T) => U): U[] & ListMeta {
  const meta: ListMeta = {};
  for (const k of Object.getOwnPropertyNames(list)) {
    if (k === 'length' || /^\d+$/.test(k)) continue;
    meta[k] = (list as unknown as Record<string, unknown>)[k];
  }
  return asList(list.map(fn), meta);
}

/** Envelope → data; Money → rupees; a Page → array-with-total. */
export function normaliseEnvelope(body: unknown): unknown {
  let data: unknown = body;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'success' in (body as object) && 'data' in (body as object)) {
    data = (body as { data: unknown }).data;
  }
  data = moneyToMajorDeep(data);
  if (isPage(data)) {
    const { items, ...meta } = data as { items: unknown[] } & ListMeta;
    return asList(items, meta);
  }
  return data;
}

/** A v2 call answering the NORMALISED data (composite routes, session code). Errors propagate as AxiosError. */
export async function v2call<T = any>(
  method: string,
  path: string,
  opts: { params?: Record<string, unknown>; data?: unknown; responseType?: 'json' | 'blob' | 'arraybuffer' } = {},
): Promise<T> {
  const res = await v2http.request({ method, url: path, params: opts.params, data: opts.data, responseType: opts.responseType || 'json' });
  if (opts.responseType === 'blob' || opts.responseType === 'arraybuffer') return res.data as T;
  return normaliseEnvelope(res.data) as T;
}

/**
 * A ROUTE_MAP row the running backend does not serve (not mounted / not wired): refused LOCALLY with a
 * typed `v2.backend_gap` naming the row, so the screen's own error state shows and nothing is sent to a
 * path that would 404. Each such row is listed in docs/PORT_NOTES/ADMIN-V2-1.md ("backend gaps").
 */
export function backendGap(what: string): never {
  const err = new Error(`${what} — not served by this backend yet.`) as Error & { code?: string; response?: unknown; isAxiosError?: boolean };
  err.code = 'V2_BACKEND_GAP';
  err.isAxiosError = true;
  err.response = { status: 501, statusText: 'Backend Gap', headers: {}, data: { success: false, code: 'v2.backend_gap', message: err.message } };
  throw err;
}

/** The same call, but a refusal answers `fallback` (a best-effort section of a composite reply). */
export async function v2try<T = any>(method: string, path: string, fallback: T, opts: Parameters<typeof v2call>[2] = {}): Promise<T> {
  try {
    return await v2call<T>(method, path, opts);
  } catch {
    return fallback;
  }
}
