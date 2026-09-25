/**
 * GROWCORD ID — the OIDC client (authorization code + PKCE) for the STORE
 * ADMIN. Provider: `backend/src/routes/identity.ts` · plan:
 * `docs/GROWCORD_ID_PLAN.md` §3-§5 · design: `docs/UI_PLAN.md` §6.
 *
 * ── A VERBATIM COPY, ON PURPOSE ───────────────────────────────────────────
 * Everything between the SHARED BODY markers below is byte-identical to
 * `suite/packages/kit/src/growcordId.ts` and to
 * `super-admin/src/utils/growcordId.ts`. These are three separate
 * repositories with no dependency on one another, and the alternative to a
 * copy is three slightly different OIDC clients — the kind of divergence
 * nobody notices until a token is accepted in one product and refused in
 * another. The suite's own test (`packages/kit/test/growcordId.test.mjs`)
 * asserts the regions match whenever the sibling checkouts are present, the
 * same discipline as `services/urlRedirectMatch.ts` ↔
 * `storefront/src/lib/urlRedirects.ts` (COMMON_MISTAKES #228).
 * CHANGE ONE, CHANGE ALL THREE — `node tools/growcord-id/sync.mjs` does it.
 *
 * ── DUAL RUN ──────────────────────────────────────────────────────────────
 * Inert unless `VITE_GROWCORD_ID_ISSUER` is set at build time: no button
 * renders, no silent check is made, and the password login is untouched. The
 * admin's client id is `admin` (registered with redirect
 * `https://admin.gc.mw/auth/callback` and one per store hostname), which is
 * why `suiteClientId()` carries it as an exception rather than deriving
 * `suite-admin`.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * It does not become the admin's session. Every endpoint is guarded by
 * `middleware/auth.ts`, which understands one credential: the store-scoped
 * staff JWT this panel already stores through `AuthContext.login()`. So the
 * last step is the DUAL-RUN BRIDGE, which proves the ID token server-side,
 * re-reads the membership and mints exactly that token plus the store's own
 * tenant key. The ID token is kept only as an `id_token_hint` for sign-out.
 */

/* SHARED BODY START */

/* ── configuration ────────────────────────────────────────────────────────── */

/** The path every seeded client registers as its redirect. Exact match, no wildcards. */
export const GROWCORD_ID_CALLBACK_PATH = '/auth/callback';

/**
 * Identity scopes only. `offline_access` is NOT asked for: a panel trades the
 * ID token for a staff session immediately and has no use for a refresh token,
 * and a credential nobody needs is a credential nobody has to protect.
 */
export const GROWCORD_ID_SCOPE = 'openid profile email org';

/**
 * Per-tab, and it dies with the tab. The pending request is deliberately not in
 * localStorage, where a second tab could consume another tab's state.
 */
const REQUEST_KEY = 'gc_id_auth_request';

const ENDPOINTS = {
  authorize: (issuer: string) => `${issuer}/authorize`,
  token: (issuer: string) => `${issuer}/token`,
  jwks: (issuer: string) => `${issuer}/.well-known/jwks.json`,
  bridge: (issuer: string) => `${issuer}/bridge/session`,
  logout: (issuer: string) => `${issuer}/logout`,
};

/**
 * Product label → registered `client_id`. The DEFAULT is `suite-<label>`; this
 * map is every seeded client that is NOT that.
 *
 * The seeder (`backend/src/scripts/identity_seed_clients.ts`, already run
 * against production) registers the suite panels as `suite-<code>`, and TWO
 * codes are not their host label: `insights` and `links` are ALSO the names of
 * two federated products (seo.gc.mw and gc.mw), which hold the bare client ids.
 * One client id cannot mean two things, so the panels carry `-panel`. The
 * platform console and the store admin are not suite panels at all and are
 * registered under bare ids. Getting this wrong is not a subtle failure —
 * `/authorize` answers "that application is not registered with Growcord ID".
 */
const CLIENT_ID_EXCEPTIONS: Record<string, string> = {
  insights: 'suite-insights-panel',
  links: 'suite-links-panel',
  'super-admin': 'super-admin',
  admin: 'admin',
};

/** The registered client id for a product label (`config.product`, 'hub', 'super-admin'). */
export function suiteClientId(product: string): string {
  const key = String(product || '').toLowerCase();
  return CLIENT_ID_EXCEPTIONS[key] ?? `suite-${key}`;
}

/**
 * The product label this hostname serves, read off the hostname itself.
 *
 * The deployment scheme is exactly this (`suite/DEPLOYMENT.md` §3a,
 * `docs/HOSTS_GCMW.md`): `books.gc.mw` is the platform-scope panel and
 * `books-acme.gc.mw` is the same panel bound to one store, so the first label
 * up to its first hyphen IS the product. It exists because the session check
 * runs in `auth.tsx`, which is handed a tenant binding but not the panel's
 * config — and a hostname the panel is already trusted to resolve its TENANT
 * from is a safe thing to read its own NAME from. A caller that knows its
 * label passes it and this is never consulted.
 */
export function productFromHostname(hostname?: string): string {
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  const first = host.split('.')[0] ?? '';
  const label = first.split('-')[0] ?? '';
  return label;
}

export interface GrowcordIdConfig {
  /** No trailing slash. */
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

function env(): Record<string, string | undefined> {
  // `import.meta.env` exists under Vite and is undefined under plain Node (the
  // tests), so this must never assume it.
  return ((import.meta as never as { env?: Record<string, string> }).env) || {};
}

/**
 * The configuration for this panel, or NULL when Growcord ID is not deployed
 * here. Null is the honest answer and the caller renders nothing — a button
 * that leads nowhere is worse than no button (blueprint law 6).
 *
 * `product` is the panel label (`config.product`); `VITE_GROWCORD_ID_CLIENT_ID`
 * overrides the derived id, which is what a one-off or store-scoped host needs.
 */
export function growcordIdConfig(product: string, origin?: string): GrowcordIdConfig | null {
  const e = env();
  const issuer = (e.VITE_GROWCORD_ID_ISSUER || '').trim().replace(/\/+$/, '');
  if (!issuer) return null;
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return {
    issuer,
    clientId: (e.VITE_GROWCORD_ID_CLIENT_ID || '').trim() || suiteClientId(product),
    redirectUri: `${base}${GROWCORD_ID_CALLBACK_PATH}`,
    scope: (e.VITE_GROWCORD_ID_SCOPE || '').trim() || GROWCORD_ID_SCOPE,
  };
}

/** Is Growcord ID available in this build at all? */
export function growcordIdEnabled(): boolean {
  return !!(env().VITE_GROWCORD_ID_ISSUER || '').trim();
}

/** Is the browser currently on the callback route? */
export function isGrowcordIdCallbackPath(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return p.replace(/\/+$/, '') === GROWCORD_ID_CALLBACK_PATH;
}

/* ── errors ───────────────────────────────────────────────────────────────── */

export type GrowcordIdErrorCode =
  | 'not_configured'
  | 'provider_error'
  | 'no_code'
  | 'state_missing'
  | 'state_mismatch'
  | 'token_exchange_failed'
  | 'id_token_missing'
  | 'jwks_unavailable'
  | 'unknown_key'
  | 'bad_signature'
  | 'malformed_token'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'expired'
  | 'not_yet_valid'
  | 'nonce_mismatch'
  | 'bridge_refused'
  | 'bridge_unreachable'
  | 'org_mismatch'
  | 'storage_unavailable'
  /* ── silent re-authentication (`prompt=none`) ───────────────────────────
   * `login_required` is the ONLY one of these that means "this person is not
   * signed in". `silent_unavailable` (wrong site, no config, no DOM),
   * `silent_timeout` and `silent_blocked` all mean "the check could not be
   * made" — a failed session CHECK is not a failed session (COMMON_MISTAKES
   * #82), and no caller may clear a local token on them. */
  | 'login_required'
  | 'silent_unavailable'
  | 'silent_timeout'
  | 'silent_blocked';

/** Every failure in this file is one of these — the UI prints `message` as-is. */
export class GrowcordIdError extends Error {
  code: GrowcordIdErrorCode;
  /** The provider's own words, when it had any. Never a token. */
  detail?: string;
  constructor(code: GrowcordIdErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'GrowcordIdError';
    this.code = code;
    this.detail = detail;
  }
}

/* ── PKCE ─────────────────────────────────────────────────────────────────── */

type Bytes = Uint8Array | ArrayBuffer;

export function base64UrlEncode(input: Bytes): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  // Backed by an explicit ArrayBuffer, not the ambient `ArrayBufferLike`, so it
  // is accepted as a `BufferSource` by WebCrypto under TypeScript 5.7+.
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** URL-safe random. 32 bytes → 43 characters, the RFC 7636 minimum verifier length. */
export function randomUrlSafe(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * S256 ONLY, matching the provider, which refuses `plain` even when the values
 * match: with `plain` the challenge IS the verifier, so anything that can read
 * the authorization request can complete it — the attack PKCE exists to stop.
 */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(48); // 64 chars, inside the 43..128 window
  return { verifier, challenge: await codeChallengeS256(verifier) };
}

/* ── the pending authorization request ────────────────────────────────────── */

export interface AuthRequestRecord {
  state: string;
  verifier: string;
  nonce: string;
  clientId: string;
  issuer: string;
  redirectUri: string;
  /** Where to land after the bridge. Same-origin path only. */
  returnTo: string;
  /** The org this panel asked for, so the callback can check what came back. */
  org?: string | null;
  createdAt: number;
}

export interface StateStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): StateStore | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function saveAuthRequest(record: AuthRequestRecord, store?: StateStore | null): void {
  const s = store ?? defaultStore();
  if (!s) {
    throw new GrowcordIdError('storage_unavailable', 'This browser blocked session storage, so a sign-in cannot be started safely.');
  }
  s.setItem(REQUEST_KEY, JSON.stringify(record));
}

/**
 * Read the pending request AND delete it in the same breath.
 *
 * Single use is the point: a callback URL that is reloaded, shared or replayed
 * finds nothing and fails as `state_missing`, rather than attempting a second
 * exchange of a code the provider has already burned.
 */
export function takeAuthRequest(store?: StateStore | null): AuthRequestRecord | null {
  const s = store ?? defaultStore();
  if (!s) return null;
  const raw = s.getItem(REQUEST_KEY);
  s.removeItem(REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthRequestRecord;
    return parsed && typeof parsed.state === 'string' && typeof parsed.verifier === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearAuthRequest(store?: StateStore | null): void {
  const s = store ?? defaultStore();
  try {
    s?.removeItem(REQUEST_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* ── step 1: leave for the provider ───────────────────────────────────────── */

export interface StartSignInOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  /**
   * Pre-select the organisation, so the hosted page shows no chooser and
   * refuses cleanly if this person is not a member of THIS panel's store.
   */
  org?: string | null;
  /** 'login' forces re-authentication; 'none' is a silent check. */
  prompt?: 'login' | 'none' | 'consent';
  /** Same-origin path to return to after sign-in. Defaults to '/'. */
  returnTo?: string;
  store?: StateStore | null;
  /** Injectable for tests; defaults to a real navigation. */
  navigate?: (url: string) => void;
}

export function buildAuthorizeUrl(
  opts: StartSignInOptions & { state: string; nonce: string; challenge: string },
): string {
  const u = new URL(ENDPOINTS.authorize(opts.issuer));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', opts.clientId);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('scope', opts.scope || GROWCORD_ID_SCOPE);
  u.searchParams.set('state', opts.state);
  u.searchParams.set('nonce', opts.nonce);
  u.searchParams.set('code_challenge', opts.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (opts.org) u.searchParams.set('org', opts.org);
  if (opts.prompt) u.searchParams.set('prompt', opts.prompt);
  return u.toString();
}

/** Generate the request, remember what only this browser knows, and leave. */
export async function startSignIn(opts: StartSignInOptions): Promise<string> {
  if (!opts.issuer || !opts.clientId) {
    throw new GrowcordIdError('not_configured', 'Growcord ID is not configured in this build.');
  }
  const { verifier, challenge } = await createPkcePair();
  const state = randomUrlSafe(16);
  const nonce = randomUrlSafe(16);
  const returnTo = opts.returnTo && opts.returnTo.startsWith('/') ? opts.returnTo : '/';
  saveAuthRequest(
    {
      state,
      verifier,
      nonce,
      clientId: opts.clientId,
      issuer: opts.issuer,
      redirectUri: opts.redirectUri,
      returnTo,
      org: opts.org ?? null,
      createdAt: Date.now(),
    },
    opts.store,
  );
  const url = buildAuthorizeUrl({ ...opts, state, nonce, challenge });
  (opts.navigate ?? ((href: string) => { window.location.assign(href); }))(url);
  return url;
}

/* ── step 2: come back with a code ────────────────────────────────────────── */

export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export function readCallbackParams(search?: string): CallbackParams {
  const q = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
  return {
    code: q.get('code') || undefined,
    state: q.get('state') || undefined,
    error: q.get('error') || undefined,
    errorDescription: q.get('error_description') || undefined,
  };
}

export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface CompleteSignInResult {
  tokens: TokenSet;
  request: AuthRequestRecord;
}

export interface CompleteSignInOptions {
  search?: string;
  store?: StateStore | null;
  fetchImpl?: typeof fetch;
}

/**
 * Exchange an authorization code for tokens. PUBLIC CLIENT: no secret is sent,
 * and none exists — PKCE is what proves this is the same browser that started.
 * The body is form-encoded because that is what OAuth specifies, and because a
 * "simple" content type costs no CORS preflight.
 *
 * ONE implementation, two callers: the redirect flow (`completeSignIn`, which
 * reads the code off the URL and the verifier out of session storage) and the
 * silent flow (`silentSignIn`, whose verifier never leaves the closure because
 * no navigation ever happened). A second copy of this is how one path ends up
 * sending `code_verifier` and the other forgetting to.
 */
export async function exchangeAuthorizationCode(opts: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.verifier,
  });
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ENDPOINTS.token(opts.issuer), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
  } catch (e) {
    throw new GrowcordIdError(
      'token_exchange_failed',
      'Could not reach Growcord ID to complete the sign-in.',
      e instanceof Error ? e.message : String(e),
    );
  }
  const payload = (await res.json().catch(() => null)) as
    | (TokenSet & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !payload) {
    // The provider speaks OAuth's own error shape, and its words are the honest
    // ones ("That code is expired, already used, or not valid" / "PKCE
    // verification failed").
    throw new GrowcordIdError(
      'token_exchange_failed',
      payload?.error_description || `Growcord ID rejected the sign-in (${res.status}).`,
      payload?.error,
    );
  }
  if (!payload.id_token) {
    throw new GrowcordIdError('id_token_missing', 'Growcord ID returned no ID token, so there is nothing to sign in with.');
  }
  return payload as TokenSet;
}

/** The redirect flow's half: read the callback, check the state, exchange. */
export async function completeSignIn(opts: CompleteSignInOptions = {}): Promise<CompleteSignInResult> {
  const params = readCallbackParams(opts.search);
  const request = takeAuthRequest(opts.store);

  if (params.error) {
    throw new GrowcordIdError(
      'provider_error',
      params.errorDescription || `Growcord ID refused the sign-in (${params.error}).`,
      params.error,
    );
  }
  if (!request) {
    throw new GrowcordIdError('state_missing', 'This sign-in link has already been used, or it was opened in a different tab. Start again.');
  }
  if (!params.state || params.state !== request.state) {
    throw new GrowcordIdError('state_mismatch', 'That sign-in did not come from this tab. For safety it was refused — start again.');
  }
  if (!params.code) {
    throw new GrowcordIdError('no_code', 'Growcord ID came back without an authorization code.');
  }

  const tokens = await exchangeAuthorizationCode({
    issuer: request.issuer,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    code: params.code,
    verifier: request.verifier,
    fetchImpl: opts.fetchImpl,
  });
  return { tokens, request };
}

/* ── step 3: prove the ID token ───────────────────────────────────────────── */

export interface GrowcordIdClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  sid?: string;
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  /** The organisation this session acts for, as a SLUG. A claim, never an authority. */
  org?: string | null;
  org_id?: string | null;
  roles?: string[];
  amr?: string[];
  acr?: string;
  prof?: string | null;
  pk?: string | null;
}

interface Jwk {
  kty: string;
  n?: string;
  e?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(jwksUri: string, doFetch: typeof fetch, force = false): Promise<Jwk[]> {
  const hit = jwksCache.get(jwksUri);
  if (!force && hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
  let res: Response;
  try {
    res = await doFetch(jwksUri, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new GrowcordIdError('jwks_unavailable', 'Could not fetch the Growcord ID signing keys.', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new GrowcordIdError('jwks_unavailable', `Growcord ID did not publish its signing keys (${res.status}).`);
  const doc = (await res.json().catch(() => null)) as { keys?: Jwk[] } | null;
  const keys = Array.isArray(doc?.keys) ? (doc as { keys: Jwk[] }).keys : [];
  if (!keys.length) throw new GrowcordIdError('jwks_unavailable', 'Growcord ID published an empty key set.');
  jwksCache.set(jwksUri, { at: Date.now(), keys });
  return keys;
}

/** Test/diagnostic hook — forget cached key sets. */
export function __resetJwksCache(): void {
  jwksCache.clear();
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as Record<string, unknown>;
}

export interface VerifyIdTokenOptions {
  issuer: string;
  clientId: string;
  nonce?: string | null;
  fetchImpl?: typeof fetch;
  /** Seconds of tolerance for clock skew. */
  clockToleranceSeconds?: number;
  nowSeconds?: number;
  jwksUri?: string;
}

/**
 * Verify an ID token the way any OIDC client does: RS256 over the published
 * JWKS, then iss / aud / exp / nonce.
 *
 * The BRIDGE is still the authority — it re-verifies server-side and re-reads
 * the membership, and a client-side check can never be a security boundary.
 * This exists so a token that is not ours is refused HERE, in words a person
 * can act on, instead of becoming a 403 from an endpoint three hops away, and
 * so the `org` claim can be checked against this panel's own store before
 * anything is installed.
 */
export async function verifyIdToken(idToken: string, opts: VerifyIdTokenOptions): Promise<GrowcordIdClaims> {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new GrowcordIdError('malformed_token', 'That is not a well-formed ID token.');
  let header: Record<string, unknown>;
  let claims: GrowcordIdClaims;
  try {
    header = decodeSegment(parts[0]);
    claims = decodeSegment(parts[1]) as unknown as GrowcordIdClaims;
  } catch {
    throw new GrowcordIdError('malformed_token', 'That ID token could not be read.');
  }
  if (header.alg !== 'RS256') {
    // `alg: none` and HMAC confusion are the classic JWT attacks. The provider
    // signs RS256 and nothing else, so anything else is refused outright rather
    // than looked up.
    throw new GrowcordIdError('bad_signature', `Growcord ID tokens are RS256; this one claims "${String(header.alg)}".`);
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const jwksUri = opts.jwksUri ?? ENDPOINTS.jwks(opts.issuer);
  const kid = typeof header.kid === 'string' ? header.kid : undefined;

  // An unknown kid means the provider rotated its key: refetch ONCE, bypassing
  // the cache, before calling it unknown. That is what publishing a kid is for,
  // and rotation with overlap is in the plan (§5.5).
  let keys = await fetchJwks(jwksUri, doFetch);
  let jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
  if (!jwk && kid) {
    keys = await fetchJwks(jwksUri, doFetch, true);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new GrowcordIdError('unknown_key', 'That token was signed with a key Growcord ID does not publish.');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(parts[2]), signed);
  if (!ok) throw new GrowcordIdError('bad_signature', 'That ID token failed signature verification.');

  const skew = opts.clockToleranceSeconds ?? 60;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== opts.issuer) {
    throw new GrowcordIdError('issuer_mismatch', `That token was issued by ${claims.iss || 'nobody'}, not by ${opts.issuer}.`);
  }
  const audiences: string[] = Array.isArray(claims.aud) ? (claims.aud as unknown as string[]) : [claims.aud];
  if (!audiences.includes(opts.clientId)) {
    throw new GrowcordIdError(
      'audience_mismatch',
      `That token was issued for "${audiences.join(', ')}", not for this application ("${opts.clientId}").`,
    );
  }
  if (typeof claims.exp !== 'number' || claims.exp + skew <= now) {
    throw new GrowcordIdError('expired', 'That sign-in has expired. Please sign in again.');
  }
  if (typeof claims.iat === 'number' && claims.iat - skew > now) {
    throw new GrowcordIdError('not_yet_valid', 'That token is dated in the future — check this device clock.');
  }
  if (opts.nonce && claims.nonce !== opts.nonce) {
    throw new GrowcordIdError('nonce_mismatch', 'That token belongs to a different sign-in attempt.');
  }
  return claims;
}

/* ── step 4: the dual-run bridge ──────────────────────────────────────────── */

export interface BridgedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface BridgedStore {
  slug: string;
  name: string;
  /**
   * The store's tenant key — what goes in `x-api-key`, the same public
   * identifier that ships in that store's storefront bundle.
   *
   * The field is `tenant_key` and NOT `api_key` because the platform's
   * `sanitizeResponse` middleware DELETES any field whose name normalises to
   * `apikey`. Renaming it here silently empties it (COMMON_MISTAKES #130/#260).
   */
  tenant_key: string;
}

export interface BridgedSession {
  kind: 'staff' | 'super_admin';
  token: string;
  user: BridgedUser;
  store: BridgedStore | null;
}

/**
 * Trade a proven ID token for the session today's middlewares accept.
 *
 * The server re-verifies the token, re-reads the membership (the `roles` claim
 * is used for NOTHING) and mints either a staff JWT + tenant key, or a
 * super-admin JWT for a member of the platform organisation. `client_id` is
 * sent so the provider can check the token was minted for THIS panel: a token
 * for another client is refused.
 */
export async function bridgeSession(
  idToken: string,
  opts: { issuer: string; clientId: string; fetchImpl?: typeof fetch },
): Promise<BridgedSession> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ENDPOINTS.bridge(opts.issuer), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id_token: idToken, client_id: opts.clientId }),
    });
  } catch (e) {
    throw new GrowcordIdError(
      'bridge_unreachable',
      'Signed in with Growcord ID, but this panel could not reach the API to open a session.',
      e instanceof Error ? e.message : String(e),
    );
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: string; message?: string; data?: BridgedSession }
    | null;
  if (!res.ok || !json?.success || !json.data?.token) {
    // The bridge's refusals are written to be read by a person, and each names
    // its fix ("no staff record in …: invite them from Settings ▸ Staff").
    throw new GrowcordIdError('bridge_refused', json?.message || `The API refused this sign-in (${res.status}).`, json?.error);
  }
  return json.data;
}

/* ── step 5: SILENT re-authentication (`prompt=none`) ─────────────────────── */

/**
 * ONE SIGN-IN ACROSS gc.mw — AND WHAT MAKES IT SAFE.
 *
 * `id.gc.mw` and `books.gc.mw` are the SAME SITE (eTLD+1 = `gc.mw`), so an
 * iframe from a panel to the provider is a same-site subresource: the
 * provider's `SameSite=Lax` SSO cookie is sent and third-party-cookie
 * partitioning does not apply. The provider already answers
 * `GET /authorize?…&prompt=none` with either a code or `login_required`
 * (`routes/identity.ts`), so a panel can ASK "is this person already signed
 * in?" without showing anything and without a navigation.
 *
 * 🔴 THE THING THIS DELIBERATELY IS NOT: a cookie widened to `domain=.gc.mw`.
 * `*.gc.mw` is also Links & eCards' CUSTOMER-CLAIMABLE name space
 * (`docs/HOSTS_GCMW.md`), so a tenant-claimed hostname would receive the
 * platform's identity cookie. The cookie stays host-only to `id.gc.mw`;
 * `docs/UI_PLAN.md` §6.1 is the full argument.
 *
 * WHY THE PARENT DOES THE EXCHANGE. The framed callback document posts the
 * raw `code` up and does nothing else. The PKCE verifier lives in the parent's
 * closure and never touches storage, so there is no single-use record for a
 * second tab to consume and nothing to replay; and the framed document never
 * installs a session, which is what would otherwise let a page that merely
 * FRAMES a panel cause a sign-in.
 *
 * WHY `postMessage` IS PINNED TO OUR OWN ORIGIN. The callback lands back on the
 * panel's own origin, so `targetOrigin` is exactly `window.location.origin`. A
 * foreign page that frames the callback is a different origin, the browser
 * refuses to deliver, and it gets nothing — while being unable to read the URL
 * cross-origin in the first place. The code alone is worthless without the
 * verifier.
 */

/** The `message.data.type` a framed callback posts to its parent. */
export const SILENT_AUTH_MESSAGE = 'growcord-id:silent-auth';

/** How long the parent waits for that message before giving up. */
export const SILENT_AUTH_TIMEOUT_MS = 5000;

/** One silent check per tab per this long — the budget the plan sets (§6.5). */
export const SILENT_CHECK_TTL_MS = 30 * 60 * 1000;

const SILENT_CHECK_KEY = 'gc_id_silent_check';

export interface SilentAuthMessage {
  type: typeof SILENT_AUTH_MESSAGE;
  state: string | null;
  code: string | null;
  error: string | null;
  error_description: string | null;
}

/**
 * The registrable site of the issuer — the last two labels of its hostname
 * (`id.gc.mw` → `gc.mw`). Deliberately simple: the only question being asked is
 * "is this panel on the same site as the identity host", and every Growcord
 * host is one label under `gc.mw`. A public-suffix list would be the general
 * answer and is not worth shipping to a browser for one comparison; on any
 * hostname where this is wrong the answer is "not same-site", which falls back
 * to the ordinary top-level redirect rather than doing anything unsafe.
 */
export function issuerSite(issuer: string): string | null {
  try {
    const host = new URL(issuer).hostname.toLowerCase();
    // An IP literal has no registrable site at all, and the last-two-labels
    // rule would produce a nonsense one that a same-looking address matches
    // (`127.0.0.1` "ends with" `.0.1`). A console never runs on one.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
    const parts = host.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : null;
  } catch {
    return null;
  }
}

/**
 * May this page attempt a silent check at all?
 *
 * Only when it is on the issuer's own site. A CROSS-SITE hidden iframe would be
 * blocked by third-party-cookie policy, come back `login_required` for a person
 * who IS signed in, and read as "logged out at random" — COMMON_MISTAKES #82's
 * lesson exactly. On `localhost` and on a store's own domain the answer is
 * false and the top-level button is the path.
 */
export function canSilentAuthorize(issuer: string, hostname?: string): boolean {
  const site = issuerSite(issuer);
  if (!site) return false;
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!host) return false;
  return host === site || host.endsWith(`.${site}`);
}

/**
 * THE FRAMED HALF. Call this as early as a bundle can run.
 *
 * When this document is (a) inside a frame, (b) on the callback path and (c)
 * carrying a `code` or an `error`, it belongs to a silent check: post the
 * result up and return true so the caller renders nothing and starts nothing.
 * In every other case it returns false and has done nothing at all — which is
 * every ordinary page load, including the top-level redirect callback.
 */
export function postSilentAuthResultIfFramed(search?: string, pathname?: string): boolean {
  if (typeof window === 'undefined') return false;
  let framed = false;
  try {
    framed = window.parent !== window;
  } catch {
    framed = true; // a cross-origin parent throws on comparison in some engines
  }
  if (!framed) return false;
  if (!isGrowcordIdCallbackPath(pathname)) return false;
  const params = readCallbackParams(search);
  if (!params.code && !params.error) return false;
  const message: SilentAuthMessage = {
    type: SILENT_AUTH_MESSAGE,
    state: params.state ?? null,
    code: params.code ?? null,
    error: params.error ?? null,
    error_description: params.errorDescription ?? null,
  };
  try {
    // Our own origin, exactly. A foreign framer is a different origin and the
    // browser simply does not deliver.
    window.parent.postMessage(message, window.location.origin);
  } catch {
    return false;
  }
  return true;
}

export interface SilentAuthorizeOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  org?: string | null;
  timeoutMs?: number;
  /** Injectable for tests. */
  documentImpl?: Document;
  windowImpl?: Window;
}

/**
 * Ask the provider, in a hidden iframe, whether this browser already holds a
 * Growcord ID session. Resolves with an authorization code, or throws
 * `login_required` / `silent_timeout` / `silent_unavailable`.
 */
export async function silentAuthorize(
  opts: SilentAuthorizeOptions,
): Promise<{ code: string; state: string; verifier: string; nonce: string }> {
  const win = opts.windowImpl ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = opts.documentImpl ?? (typeof document !== 'undefined' ? document : undefined);
  if (!win || !doc || !doc.body) {
    throw new GrowcordIdError('silent_unavailable', 'A silent sign-in check needs a browser document.');
  }
  if (!opts.issuer || !opts.clientId) {
    throw new GrowcordIdError('not_configured', 'Growcord ID is not configured in this build.');
  }
  if (!canSilentAuthorize(opts.issuer, win.location?.hostname)) {
    throw new GrowcordIdError(
      'silent_unavailable',
      'This hostname is not on the Growcord ID site, so a silent check cannot be made here.',
    );
  }

  const { verifier, challenge } = await createPkcePair();
  const state = randomUrlSafe(16);
  const nonce = randomUrlSafe(16);
  const url = buildAuthorizeUrl({
    issuer: opts.issuer,
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scope: opts.scope,
    org: opts.org ?? null,
    prompt: 'none',
    state,
    nonce,
    challenge,
  });

  return new Promise((resolve, reject) => {
    const frame = doc.createElement('iframe');
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      try {
        frame.remove();
      } catch {
        /* already gone */
      }
      fn();
    };

    function onMessage(event: MessageEvent): void {
      // Three independent checks, and all three are load-bearing: the origin
      // (only our own page may speak), the source (only THIS frame, not another
      // one on the page) and the state (only THIS request, so a stale frame
      // from a previous check cannot answer for a new one).
      if (event.origin !== win!.location.origin) return;
      if (frame.contentWindow && event.source !== frame.contentWindow) return;
      const data = event.data as SilentAuthMessage | null;
      if (!data || data.type !== SILENT_AUTH_MESSAGE) return;
      if (data.state !== state) return;
      if (data.error) {
        const code: GrowcordIdErrorCode =
          data.error === 'login_required' ? 'login_required'
            : data.error === 'interaction_required' || data.error === 'consent_required'
              || data.error === 'account_selection_required' ? 'login_required'
              : 'provider_error';
        finish(() => reject(new GrowcordIdError(
          code,
          code === 'login_required'
            ? 'No Growcord ID session on this browser.'
            : data.error_description || `Growcord ID refused the silent check (${data.error}).`,
          data.error ?? undefined,
        )));
        return;
      }
      if (!data.code) {
        finish(() => reject(new GrowcordIdError('no_code', 'The silent check came back without an authorization code.')));
        return;
      }
      const code = data.code;
      finish(() => resolve({ code, state, verifier, nonce }));
    }

    win.addEventListener('message', onMessage);

    /**
     * `allow-scripts allow-same-origin` and nothing else. The framed document
     * is OUR OWN origin, so `allow-same-origin` grants it nothing it did not
     * already have — while everything left out is a real restriction on what
     * the provider (or anything that ends up in there) can do: no top-level
     * navigation, no forms, no popups, no downloads, no modals.
     */
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'Growcord ID session check');
    frame.referrerPolicy = 'no-referrer';
    // Off-screen rather than `display:none`: a zero-sized, hidden frame loads
    // everywhere, and `display:none` has historically been skipped by some
    // engines.
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px;visibility:hidden';
    frame.src = url;
    doc.body.appendChild(frame);

    timer = setTimeout(() => {
      finish(() => reject(new GrowcordIdError(
        'silent_timeout',
        'Growcord ID did not answer the session check in time.',
      )));
    }, opts.timeoutMs ?? SILENT_AUTH_TIMEOUT_MS);
  });
}

/**
 * The whole silent flow: ask, exchange, verify. Returns the same shape the
 * redirect flow produces, so the caller installs a session exactly once, in one
 * place, whichever way the tokens arrived.
 */
export async function silentSignIn(
  opts: SilentAuthorizeOptions & { fetchImpl?: typeof fetch },
): Promise<{ tokens: TokenSet; claims: GrowcordIdClaims }> {
  const { code, verifier, nonce } = await silentAuthorize(opts);
  const tokens = await exchangeAuthorizationCode({
    issuer: opts.issuer,
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    code,
    verifier,
    fetchImpl: opts.fetchImpl,
  });
  const claims = await verifyIdToken(tokens.id_token, {
    issuer: opts.issuer,
    clientId: opts.clientId,
    nonce,
    fetchImpl: opts.fetchImpl,
  });
  return { tokens, claims };
}

/* ── the per-tab budget ───────────────────────────────────────────────────── */

export interface SilentCheckRecord {
  at: number;
  outcome: 'signed-in' | 'login_required' | 'failed';
}

/**
 * ONE silent check per tab per 30 minutes, whatever the answer.
 *
 * `/authorize` shares an IP bucket with interactive sign-in and an office NAT
 * puts a whole staff behind one address, so an unbudgeted check on every page
 * load would spend somebody else's sign-in allowance (§6.5). `sessionStorage`
 * is the right home: per tab, and gone when the tab is.
 *
 * A FAILED check is recorded too — otherwise a provider that is down would be
 * re-asked on every render — but a failure never means "not signed in" and
 * never clears a token (#82).
 */
export function readSilentCheck(store?: StateStore | null): SilentCheckRecord | null {
  const s = store ?? defaultStore();
  if (!s) return null;
  try {
    const raw = s.getItem(SILENT_CHECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SilentCheckRecord;
    return typeof parsed?.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function shouldTrySilentSignIn(store?: StateStore | null, nowMs?: number): boolean {
  const rec = readSilentCheck(store);
  if (!rec) return true;
  return (nowMs ?? Date.now()) - rec.at >= SILENT_CHECK_TTL_MS;
}

export function markSilentSignInChecked(outcome: SilentCheckRecord['outcome'], store?: StateStore | null): void {
  const s = store ?? defaultStore();
  if (!s) return;
  const record: SilentCheckRecord = { at: Date.now(), outcome };
  try {
    s.setItem(SILENT_CHECK_KEY, JSON.stringify(record));
  } catch {
    /* storage blocked — the check simply runs again, which is the safe way round */
  }
}

/** Sign-out and a fresh sign-in both reset the budget. */
export function clearSilentCheck(store?: StateStore | null): void {
  const s = store ?? defaultStore();
  try {
    s?.removeItem(SILENT_CHECK_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* ── sign out ─────────────────────────────────────────────────────────────── */

/**
 * The ID token, kept for ONE purpose: `id_token_hint` at sign-out.
 *
 * The provider's RP-initiated logout ends the session SILENTLY — no
 * confirmation page — only when the request carries a signed hint AND a
 * registered `post_logout_redirect_uri` (`routes/identity.ts handleLogout`).
 * Without the hint the person is shown a confirmation form; if they close the
 * tab instead of confirming, the SSO session survives and the NEXT panel's
 * silent check signs them straight back in. On a shared machine that is the
 * difference between "signed out" and "looked signed out".
 *
 * The hint authorises nothing — the provider's own comment says so, and it
 * verifies the signature before acting — it only NAMES the session to end. It
 * goes to `sessionStorage` and dies with the tab, like the access token; the
 * refresh token is never requested at all.
 */
const LOGOUT_HINT_KEY = 'gc_id_logout_hint';

export function rememberLogoutHint(idToken: string | null, store?: StateStore | null): void {
  const s = store ?? defaultStore();
  if (!s) return;
  try {
    if (idToken) s.setItem(LOGOUT_HINT_KEY, idToken);
    else s.removeItem(LOGOUT_HINT_KEY);
  } catch {
    /* storage blocked — sign-out falls back to the confirmation page */
  }
}

export function readLogoutHint(store?: StateStore | null): string | null {
  const s = store ?? defaultStore();
  if (!s) return null;
  try {
    return s.getItem(LOGOUT_HINT_KEY);
  } catch {
    return null;
  }
}

/**
 * RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0).
 *
 * The caller clears the LOCAL session first — that is the part that matters for
 * this device and must happen even if the navigation never completes — and this
 * navigation is what ends the session at the identity host, so every OTHER
 * Growcord host's next silent check answers `login_required`. That is what
 * makes "sign out" mean sign out everywhere.
 *
 * `post_logout_redirect_uri` must be EXACTLY one the client registered; the
 * seeder registers `<origin>/`, so that is the default a caller should pass.
 * An unregistered one is refused by the provider and the person gets the
 * confirmation page instead — a refusal, never an open redirect.
 */
export function signOut(opts: {
  issuer: string;
  postLogoutRedirectUri?: string;
  /** The last ID token this browser held. Read from storage when omitted. */
  idTokenHint?: string | null;
  state?: string | null;
  store?: StateStore | null;
  navigate?: (url: string) => void;
}): string {
  const u = new URL(ENDPOINTS.logout(opts.issuer));
  const hint = opts.idTokenHint === undefined ? readLogoutHint(opts.store) : opts.idTokenHint;
  if (hint) u.searchParams.set('id_token_hint', hint);
  if (opts.postLogoutRedirectUri) u.searchParams.set('post_logout_redirect_uri', opts.postLogoutRedirectUri);
  if (opts.state) u.searchParams.set('state', opts.state);
  // Whatever happens next, this browser must not keep the hint or re-use a
  // stale "already signed in" answer.
  rememberLogoutHint(null, opts.store);
  clearSilentCheck(opts.store);
  const url = u.toString();
  (opts.navigate ?? ((href: string) => { window.location.assign(href); }))(url);
  return url;
}

/* SHARED BODY END */

/* ══════════════════════════════════════════════════════════════════════════
   THE ADMIN'S OWN HALF — nothing below here is shared.
   ══════════════════════════════════════════════════════════════════════════ */

/** The admin's registered client id — see `identity_seed_clients.ts`. */
export const ADMIN_PRODUCT = 'admin';

/**
 * What the boot check concluded. Everything except `signed-in` means "show the
 * login form" — and NONE of them means "destroy a stored session", because
 * this only ever runs when there is no stored session to destroy.
 */
export type AdminSilentResult =
  | { status: 'signed-in'; token: string; storeApiKey: string; email?: string; returnTo?: string }
  | { status: 'login-required' }
  | { status: 'unavailable'; reason: string }
  | { status: 'skipped' }
  | { status: 'failed'; code: string; message: string };

/**
 * ── ONE SIGN-IN ACROSS gc.mw, FOR THE ADMIN ───────────────────────────────
 *
 * Called once on boot when there is no local session. Asks Growcord ID, in a
 * hidden same-site iframe, whether this browser already holds a session from
 * another Growcord host (`silentSignIn`), and bridges it for exactly the staff
 * JWT + tenant key a password login would have produced. The person never sees
 * a form.
 *
 * Budgeted to ONE attempt per tab per 30 minutes: `/authorize` shares an IP
 * bucket with interactive sign-in and a whole office shares one address.
 *
 * ⚠️ A FAILURE IS NEVER A LOGOUT. A timeout, a 429, a 5xx or an unreachable
 * bridge all return `failed`, the caller shows the ordinary login form, and
 * nothing is cleared (COMMON_MISTAKES #82 — a failed session CHECK is not a
 * failed session, and that mistake once logged every member of staff out).
 */
export async function trySilentAdminSignIn(): Promise<AdminSilentResult> {
  const config = growcordIdConfig(ADMIN_PRODUCT);
  if (!config) return { status: 'unavailable', reason: 'Growcord ID is not configured in this build.' };
  if (!shouldTrySilentSignIn()) return { status: 'skipped' };
  try {
    const { tokens } = await silentSignIn({
      issuer: config.issuer,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      // No `org`: one admin build serves every store and the HOSTNAME decides
      // which (#211). A person who belongs to exactly one organisation
      // resolves silently; one who belongs to several is answered
      // `account_selection_required`, which falls through to the sign-in form
      // — the honest outcome for a question a hidden frame cannot ask.
    });
    const session = await bridgeSession(tokens.id_token, { issuer: config.issuer, clientId: config.clientId });
    if (!session.store) {
      // A platform-organisation membership bridges to a super-admin session,
      // which no store endpoint accepts. Say so rather than installing a token
      // that would 403 on the first call.
      markSilentSignInChecked('failed');
      return {
        status: 'failed',
        code: 'no_store',
        message: session.kind === 'super_admin'
          ? 'That Growcord ID is a platform operator account. Open the platform console instead.'
          : 'That sign-in returned no store, so there is no tenant to work on.',
      };
    }
    // Kept for `id_token_hint` at sign-out, which is what makes the provider
    // end the shared session silently instead of showing a confirmation page.
    rememberLogoutHint(tokens.id_token ?? null);
    markSilentSignInChecked('signed-in');
    return {
      status: 'signed-in',
      token: session.token,
      storeApiKey: session.store.tenant_key,
      email: session.user?.email,
    };
  } catch (e) {
    const code = e instanceof GrowcordIdError ? e.code : 'error';
    if (code === 'login_required') {
      markSilentSignInChecked('login_required');
      return { status: 'login-required' };
    }
    if (code === 'silent_unavailable' || code === 'not_configured') {
      return { status: 'unavailable', reason: e instanceof Error ? e.message : String(e) };
    }
    markSilentSignInChecked('failed');
    return { status: 'failed', code, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The TOP-LEVEL redirect callback, for the "Continue with Growcord ID" button.
 *
 * The admin has no `/auth/callback` ROUTE of its own — its router belongs to
 * other lanes — and it does not need one: the SPA history fallback serves
 * index.html at that path, `AuthContext` notices the callback path on boot and
 * calls this. So one function completes a sign-in whichever way it started,
 * and the admin's route table is untouched.
 */
export async function completeAdminSignIn(): Promise<AdminSilentResult> {
  const config = growcordIdConfig(ADMIN_PRODUCT);
  if (!config) return { status: 'unavailable', reason: 'This build was not made with Growcord ID enabled.' };
  try {
    // The query string as it ARRIVED, not as it is now — see ARRIVED_SEARCH.
    const { tokens, request } = await completeSignIn({ search: ARRIVED_SEARCH });
    await verifyIdToken(tokens.id_token, {
      issuer: config.issuer,
      clientId: request.clientId,
      nonce: request.nonce,
    });
    const session = await bridgeSession(tokens.id_token, { issuer: config.issuer, clientId: request.clientId });
    if (!session.store) {
      return {
        status: 'failed',
        code: 'no_store',
        message: session.kind === 'super_admin'
          ? 'That Growcord ID is a platform operator account. Open the platform console instead.'
          : 'That sign-in returned no store, so there is no tenant to work on.',
      };
    }
    rememberLogoutHint(tokens.id_token ?? null);
    markSilentSignInChecked('signed-in');
    return {
      status: 'signed-in',
      token: session.token,
      storeApiKey: session.store.tenant_key,
      email: session.user?.email,
      returnTo: request.returnTo || '/',
    };
  } catch (e) {
    if (e instanceof GrowcordIdError) return { status: 'failed', code: e.code, message: e.message };
    return { status: 'failed', code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sign out of Growcord ID as well as the admin — "sign out everywhere".
 *
 * The caller clears the local session FIRST (that must happen whatever the
 * network does); this ends the session at the identity host, so the next
 * silent check on every other gc.mw host answers `login_required` within one
 * page load. It navigates away, so nothing after it runs. Returns false when
 * Growcord ID is not in this build, and the caller finishes its ordinary local
 * sign-out exactly as before.
 */
export function signOutOfGrowcordId(): boolean {
  const config = growcordIdConfig(ADMIN_PRODUCT);
  clearSilentCheck();
  if (!config) return false;
  signOut({
    issuer: config.issuer,
    // Exactly what `identity_seed_clients.ts` registers for this client. An
    // unregistered one is refused and the person sees the confirmation page.
    postLogoutRedirectUri: `${window.location.origin}/`,
  });
  return true;
}

/**
 * ── THE FRAMED CALLBACK, ANSWERED BEFORE REACT EXISTS ─────────────────────
 *
 * A silent check loads `/auth/callback?code=…` inside a hidden iframe. All that
 * document has to do is post the code up to its parent, which holds the PKCE
 * verifier — and the sooner it does, the less of the admin boots inside a frame
 * that is about to be thrown away. `AuthContext.tsx` imports this module, so
 * this runs as the bundle parses: before React mounts and before `/auth/me`.
 *
 * On EVERY ordinary page load — including the top-level redirect callback —
 * this is false, having touched nothing.
 */
export const FRAMED_CALLBACK: boolean = postSilentAuthResultIfFramed();

/**
 * ── THE URL AS IT ARRIVED, CAPTURED AT IMPORT TIME ────────────────────────
 *
 * Not read later, and that is load-bearing. The admin has no `/auth/callback`
 * ROUTE, so React Router renders nothing for it and a redirect somewhere in the
 * tree can replace the URL before `AuthContext`'s effect runs — a child's
 * effect fires before its parent's, and `AuthProvider` is the parent. Reading
 * `window.location` at that point could find `/login` and an empty query, and
 * the sign-in would be silently lost with the code already burned.
 *
 * Module scope runs before React renders at all, so these two are the URL the
 * browser actually arrived on, whatever happens afterwards.
 */
const ARRIVED_ON_CALLBACK: boolean = typeof window !== 'undefined' && isGrowcordIdCallbackPath();
const ARRIVED_SEARCH: string = typeof window !== 'undefined' ? window.location.search : '';

/**
 * Where a failed Growcord ID sign-in leaves its reason, so the sign-in page can
 * say what went wrong. The admin has no callback SCREEN (its router belongs to
 * other lanes), and a person bounced back to a login form with no explanation
 * has nothing to act on.
 */
const LAST_ERROR_KEY = 'gc_id_last_error';

export function takeGrowcordIdError(): string | null {
  try {
    const v = sessionStorage.getItem(LAST_ERROR_KEY);
    if (v) sessionStorage.removeItem(LAST_ERROR_KEY);
    return v;
  } catch {
    return null;
  }
}

function rememberError(message: string): void {
  try {
    sessionStorage.setItem(LAST_ERROR_KEY, message);
  } catch {
    /* storage blocked — the console warning below is then the only record */
  }
}

/**
 * ── THE ONE CALL `AuthContext` MAKES ──────────────────────────────────────
 *
 * Everything Growcord ID does at boot, in one function, so the admin's auth
 * context gains a single line and no OIDC knowledge:
 *
 *   1. Inside a hidden frame → do nothing. The module-scope responder above
 *      already posted the code to the parent and this document is about to be
 *      removed. Deliberately does NOT call `onDone()`: there is no UI here to
 *      unblock, and rendering the admin inside a discarded frame helps nobody.
 *   2. On `/auth/callback` → finish the interactive sign-in (the button's
 *      path), install the session and reload into the app. The reload is what
 *      clears the `?code=` from the address bar AND gets the router off a path
 *      it has no route for; the session is already in storage, so it boots
 *      signed in.
 *   3. Otherwise → the SILENT check. Signed in elsewhere on gc.mw ⇒ signed in
 *      here, with no form.
 *
 * `onDone()` means "stop waiting and show the sign-in form". It is called on
 * every path that does not install a session, including every failure — this
 * function can never leave the admin stuck on a spinner, and it never clears
 * anything (it only runs when there was nothing stored to clear).
 */
export async function adoptGrowcordIdSession(
  login: (token: string, storeApiKey: string) => Promise<void>,
  onDone: () => void,
): Promise<void> {
  if (FRAMED_CALLBACK) return;
  if (!growcordIdEnabled()) {
    onDone();
    return;
  }

  const onCallback = ARRIVED_ON_CALLBACK;
  let result: AdminSilentResult;
  try {
    result = onCallback ? await completeAdminSignIn() : await trySilentAdminSignIn();
  } catch (e) {
    // Defensive: both helpers already return rather than throw.
    console.warn('[Growcord ID] sign-in check failed:', e);
    onDone();
    return;
  }

  if (result.status === 'signed-in') {
    try {
      await login(result.token, result.storeApiKey);
    } catch (e) {
      console.warn('[Growcord ID] session install failed:', e);
      rememberError('Signed in with Growcord ID, but this panel could not open a session. Try the password form.');
      onDone();
      return;
    }
    if (onCallback) {
      const to = result.returnTo && result.returnTo.startsWith('/') ? result.returnTo : '/';
      window.location.replace(to);
    }
    return;
  }

  if (result.status === 'failed') {
    // Inspectable, never silent — and never a logout.
    console.warn(`[Growcord ID] ${result.code}: ${result.message}`);
    rememberError(result.message);
  } else if (result.status === 'unavailable' && onCallback) {
    rememberError(result.reason);
  }

  if (onCallback) {
    // Nothing was installed, and this path has no route. Land on the sign-in
    // form, where the reason above is shown.
    window.location.replace('/');
    return;
  }
  onDone();
}
