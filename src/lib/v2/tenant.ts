/**
 * Which store this admin serves, learned from its OWN hostname through the
 * Identity app's public resolve route
 * (`GET /api/v2/identity/public/stores/resolve?domain=` — ROUTE_MAP identity E1,
 * the old `/auth/resolve-store`). The answer carries the store's PUBLIC store
 * key, sent as `X-Store-Key` on every call (an identification, never an
 * authorisation). One request per page load, cached 6 h per host.
 *
 *   kind 'store'     this host serves one store (pinned; no picker)
 *   kind 'platform'  the central console host: the signed-in person picks a store
 *                    (`listPlatformStores`, then the pick is resolved to its key)
 *   kind 'none'      unbound host
 *
 * A loopback dev host is bound by `VITE_STORE_KEY` (public key) or by resolving
 * `VITE_STORE_DOMAIN` instead of `localhost`.
 */
import axios from 'axios';
import { V2_API_URL, V2_DEV_STORE_DOMAIN, V2_DEV_STORE_KEY } from './config';

export interface TenantBinding {
  kind: 'store' | 'platform' | 'none';
  slug?: string;
  name?: string;
  storeKey?: string;
  host: string;
}

export interface PlatformStore { id: string; slug: string; name: string; domain?: string | null }

const TTL_MS = 6 * 3_600_000;
const PICK_KEY = 'gc_v2_picked_store';
let current: TenantBinding | null = null;
let inflight: Promise<TenantBinding> | null = null;

const cacheKey = (host: string) => `gc_v2_tenant:${host}`;

function readCache(host: string): TenantBinding | null {
  try {
    const raw = localStorage.getItem(cacheKey(host));
    if (!raw) return null;
    const c = JSON.parse(raw) as { at: number; binding: TenantBinding };
    return Date.now() - c.at < TTL_MS ? c.binding : null;
  } catch {
    return null;
  }
}

function writeCache(host: string, binding: TenantBinding): void {
  try { localStorage.setItem(cacheKey(host), JSON.stringify({ at: Date.now(), binding })); } catch { /* a miss next time */ }
}

const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

/** The public resolve call (no store key, no bearer). */
async function resolveDomain(domain: string): Promise<{ kind: string; slug?: string | null; name?: string | null; store_key?: string | null }> {
  const r = await axios.get(`${V2_API_URL}/api/v2/identity/public/stores/resolve`, { params: { domain }, timeout: 10000, headers: { accept: 'application/json' } });
  return (r.data?.data ?? {}) as { kind: string; slug?: string | null; name?: string | null; store_key?: string | null };
}

export async function resolveTenant(host = location.hostname.toLowerCase()): Promise<TenantBinding> {
  if (current) return current;
  if (inflight) return inflight;
  inflight = (async () => {
    if (isLoopback(host) && V2_DEV_STORE_KEY) {
      current = { kind: 'store', storeKey: V2_DEV_STORE_KEY, host };
      return current;
    }
    const domain = isLoopback(host) && V2_DEV_STORE_DOMAIN ? V2_DEV_STORE_DOMAIN : host;
    const cached = readCache(domain);
    if (cached) { current = withPick(cached); return current; }
    try {
      const d = await resolveDomain(domain);
      const kind = d.kind === 'store' || d.kind === 'platform' ? d.kind : 'none';
      const binding: TenantBinding = { kind, slug: d.slug ?? undefined, name: d.name ?? undefined, storeKey: d.store_key ?? undefined, host };
      writeCache(domain, binding);
      current = withPick(binding);
      return current;
    } catch {
      // Unreachable or refused (429): not "none" and not cached; the sign-in screen says the store could not be found.
      current = { kind: 'none', host };
      return current;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** On the platform host the picked store (per tab) supplies the key. */
function withPick(b: TenantBinding): TenantBinding {
  if (b.kind !== 'platform') return b;
  try {
    const raw = sessionStorage.getItem(PICK_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { slug: string; name: string; storeKey: string };
      return { ...b, slug: p.slug, name: p.name, storeKey: p.storeKey };
    }
  } catch { /* no pick yet */ }
  return b;
}

export function tenantNow(): TenantBinding | null {
  return current;
}

export function storeKeyNow(): string | undefined {
  return current?.storeKey;
}

/** Platform host: the stores a platform member may open (`GET /api/v2/platform/console/stores`). */
export async function listPlatformStores(bearer: string): Promise<PlatformStore[]> {
  const r = await axios.get(`${V2_API_URL}/api/v2/platform/console/stores`, { params: { limit: 200 }, headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' } });
  const items = (r.data?.data?.items ?? []) as Array<Record<string, unknown>>;
  return items.map((s) => ({ id: String(s.id), slug: String(s.slug ?? ''), name: String(s.name ?? s.slug ?? ''), domain: (s.domain as string | null) ?? null }));
}

/** Platform host: adopt a store — its public key comes from the same resolve route, by its domain. */
export async function pickPlatformStore(store: PlatformStore): Promise<TenantBinding> {
  if (!store.domain) throw new Error(`${store.name} has no domain, so its store key cannot be resolved.`);
  const d = await resolveDomain(store.domain);
  if (d.kind !== 'store' || !d.store_key) throw new Error(`${store.name} could not be resolved to a store.`);
  const pick = { slug: d.slug ?? store.slug, name: d.name ?? store.name, storeKey: d.store_key };
  try { sessionStorage.setItem(PICK_KEY, JSON.stringify(pick)); } catch { /* per page load */ }
  current = { ...(current ?? { kind: 'platform', host: location.hostname }), ...pick };
  return current;
}

export function clearPlatformPick(): void {
  try { sessionStorage.removeItem(PICK_KEY); } catch { /* nothing */ }
  if (current?.kind === 'platform') current = { kind: 'platform', host: current.host };
}
