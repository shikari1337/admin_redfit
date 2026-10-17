/**
 * v2 — the admin on the Rust API (`/api/v2/<app>/…`). ONE switch: a build that
 * carries `VITE_API_URL` talks to the v2 backend through `src/lib/v2` only; a
 * build without it is the Node admin exactly as before (main keeps deploying).
 *
 *   VITE_API_URL              the API origin, e.g. https://api-v2.gc.mw (no path)
 *   VITE_GROWCORD_ID_ISSUER   the Growcord ID issuer root (default = VITE_API_URL:
 *                             the Rust host mounts the issuer at its root)
 *   VITE_GROWCORD_ID_CLIENT_ID  the registered OIDC client (default `admin`)
 *   VITE_STORE_KEY            dev only: the store's PUBLIC key for a loopback host
 *   VITE_STORE_DOMAIN         dev only: resolve this domain instead of the loopback host
 */

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
}

const trimUrl = (v: string | undefined): string => (v || '').trim().replace(/\/+$/, '');

export const V2_API_URL: string = trimUrl(env().VITE_API_URL);

/** True when this build runs on the Rust API. */
export const V2_ENABLED: boolean = V2_API_URL.length > 0;

export const V2_ISSUER: string = trimUrl(env().VITE_GROWCORD_ID_ISSUER) || V2_API_URL;

export const V2_CLIENT_ID: string = (env().VITE_GROWCORD_ID_CLIENT_ID || '').trim() || 'admin';

export const V2_DEV_STORE_KEY: string | undefined = (env().VITE_STORE_KEY || '').trim() || undefined;

export const V2_DEV_STORE_DOMAIN: string | undefined = (env().VITE_STORE_DOMAIN || '').trim().toLowerCase() || undefined;

export const V2_CALLBACK_PATH = '/auth/callback';
