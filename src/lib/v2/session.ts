/**
 * The admin's v2 session: Growcord ID, OIDC authorization code + PKCE (S256),
 * against the issuer root (`/authorize`, `/token`, `/logout`,
 * `/.well-known/jwks.json`). The ACCESS TOKEN is the session — every v2 call
 * carries it as `Authorization: Bearer`; there is no legacy staff JWT and no
 * bridge (DEC-028). Logic copied from the platform kit
 * (`growcord-rs/ui/packages/session/src/oidc.ts`), not imported.
 *
 * Storage: the token set lives in sessionStorage for THIS tab (the admin's
 * existing model — closes with the tab), the pending request (state, nonce,
 * verifier) likewise and is consumed once. Refresh rotation is single-flight;
 * only the issuer's `invalid_grant` ends the session, a network failure never.
 */
import { V2_CALLBACK_PATH, V2_CLIENT_ID, V2_ISSUER } from './config';

export const V2_SCOPE = 'openid profile email org offline_access';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface IdClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nonce?: string;
  email?: string;
  name?: string;
  org_id?: string;
  [k: string]: unknown;
}

export type V2SessionErrorCode =
  | 'not_configured' | 'no_pending_request' | 'state_mismatch' | 'provider_error'
  | 'token_exchange_failed' | 'id_token_invalid' | 'refresh_failed';

export class V2SessionError extends Error {
  readonly code: V2SessionErrorCode;
  readonly providerError?: string;
  constructor(code: V2SessionErrorCode, message: string, providerError?: string) {
    super(message);
    this.name = 'V2SessionError';
    this.code = code;
    this.providerError = providerError;
  }
}

const REQUEST_KEY = 'gc_v2_oidc_request';
const TOKENS_KEY = 'gc_v2_tokens';
const ENDED_KEY = 'gc_v2_session_ended';

interface PendingRequest { state: string; nonce: string; verifier: string; returnTo: string }

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const randomToken = (bytes = 32): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function codeChallengeS256(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

const redirectUri = (): string => `${location.origin}${V2_CALLBACK_PATH}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown): void {
  try {
    if (v === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

/* ── tokens ─────────────────────────────────────────────────────────────── */

let tokens: TokenSet | null = readJson<TokenSet>(TOKENS_KEY);
let refreshing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(reason: 'ended' | 'refreshed') => void>();
/** Set once sign-out has started; the page is leaving for the issuer's /logout (see `signOut`). */
let leaving = false;

/**
 * True from the moment sign-out starts. Until the browser has left for the issuer's /logout nothing in the admin may
 * navigate anywhere else, start a sign-in, send a call or end the session on a 401: any of those would cancel the
 * navigation to /logout and leave the Growcord ID session open (22 Nov 2026, a 401 redirect to /login 50 ms later did).
 */
export function isSigningOut(): boolean {
  return leaving;
}

// Back from the issuer's sign-out page (the browser's Back button, or its "Stay signed in", which is history.back()),
// the browser may restore this page from its back/forward cache with `leaving` still set and no tokens: it would send
// nothing and go nowhere. A fresh load has no tokens and shows the sign-in page, the honest state.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && leaving) location.reload();
  });
}

export function onSessionChange(fn: (reason: 'ended' | 'refreshed') => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setTokens(next: TokenSet | null): void {
  tokens = next;
  writeJson(TOKENS_KEY, next);
  schedule();
}

export function hasSession(): boolean {
  return !!tokens?.accessToken;
}

/** Who the ID token says signed in (unverified read of a token this tab verified at sign-in). */
export function sessionClaims(): IdClaims | null {
  if (!tokens?.idToken) return null;
  try { return decodeClaims(tokens.idToken); } catch { return null; }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!tokens?.refreshToken) return;
  const wait = Math.max(5_000, tokens.expiresAt - Date.now() - 60_000);
  timer = setTimeout(() => { void refresh(); }, wait);
}

/** The bearer for the next call; refreshes first when it is about to lapse. Never throws. */
export async function accessToken(): Promise<string | undefined> {
  if (!tokens) return undefined;
  if (tokens.expiresAt - Date.now() < 30_000) await refresh();
  return tokens?.accessToken;
}

function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  const rt = tokens?.refreshToken;
  if (!rt) return Promise.resolve();
  refreshing = (async () => {
    try {
      const body = await postToken({ grant_type: 'refresh_token', refresh_token: rt }, 'refresh_failed');
      // Signing out meanwhile: the tokens stay cleared.
      if (leaving) return;
      const next = tokenSetOf(body);
      setTokens({ ...next, refreshToken: next.refreshToken ?? rt, idToken: next.idToken ?? tokens?.idToken });
      listeners.forEach((fn) => fn('refreshed'));
    } catch (e) {
      // Only the issuer's refusal ends the session; offline, 5xx and 429 keep it.
      if (!leaving && e instanceof V2SessionError && e.providerError === 'invalid_grant') endLocal();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Drop the credential here (the issuer session is untouched). */
export function endLocal(): void {
  // Signing out already cleared the tokens; nothing may re-render as "session ended" while the page leaves.
  if (leaving) return;
  const had = !!tokens;
  setTokens(null);
  if (had) {
    writeJson(ENDED_KEY, { at: Date.now() });
    listeners.forEach((fn) => fn('ended'));
  }
}

/** True once after a session ended on a 401 / refused refresh (the sign-in screen says why). */
export function consumeEndedNotice(): boolean {
  const v = readJson<{ at: number }>(ENDED_KEY);
  writeJson(ENDED_KEY, null);
  return !!v;
}

/* ── the protocol ───────────────────────────────────────────────────────── */

function tokenSetOf(body: Record<string, unknown>): TokenSet {
  const access = typeof body.access_token === 'string' ? body.access_token : '';
  if (!access) throw new V2SessionError('token_exchange_failed', 'The token answer carried no access token.');
  const seconds = typeof body.expires_in === 'number' ? body.expires_in : 900;
  return {
    accessToken: access,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    idToken: typeof body.id_token === 'string' ? body.id_token : undefined,
    expiresAt: Date.now() + seconds * 1000,
  };
}

async function postToken(form: Record<string, string>, failCode: V2SessionErrorCode): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${V2_ISSUER}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: V2_CLIENT_ID, ...form }).toString(),
      cache: 'no-store',
    });
  } catch {
    throw new V2SessionError(failCode, 'Growcord ID could not be reached.');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const providerError = typeof body.error === 'string' ? body.error : undefined;
    throw new V2SessionError(failCode, typeof body.error_description === 'string' ? body.error_description : 'Growcord ID refused the request.', providerError);
  }
  return body;
}

/** Leaves the page for the issuer's hosted sign-in. */
export async function startSignIn(opts: { returnTo?: string; silent?: boolean } = {}): Promise<void> {
  // No sign-in, silent or not, while this page is leaving for the issuer's /logout.
  if (leaving) return;
  if (!V2_ISSUER) throw new V2SessionError('not_configured', 'VITE_GROWCORD_ID_ISSUER / VITE_API_URL is not set for this build.');
  const verifier = randomToken(48);
  const pending: PendingRequest = {
    state: randomToken(24),
    nonce: randomToken(24),
    verifier,
    returnTo: opts.returnTo ?? '/',
  };
  writeJson(REQUEST_KEY, pending);
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: V2_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: V2_SCOPE,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await codeChallengeS256(verifier),
    code_challenge_method: 'S256',
  });
  // A click on “Continue with Growcord ID” always asks for the email and password.
  // Without prompt=login the issuer reuses the gcid_sso cookie and opens every
  // organisation this browser was last signed in as, with no credential step.
  if (opts.silent) q.set('prompt', 'none');
  else q.set('prompt', 'login');
  location.assign(`${V2_ISSUER}/authorize?${q.toString()}`);
}

export function isCallback(): boolean {
  return location.pathname === V2_CALLBACK_PATH && new URLSearchParams(location.search).has('state');
}

/** Finishes the redirect: state, code exchange with the verifier, the ID token verified. Returns where to go. */
export async function completeSignIn(): Promise<string> {
  const params = new URLSearchParams(location.search);
  const pending = readJson<PendingRequest>(REQUEST_KEY);
  writeJson(REQUEST_KEY, null);
  const err = params.get('error');
  if (err) throw new V2SessionError('provider_error', params.get('error_description') ?? 'Growcord ID declined the sign-in.', err);
  if (!pending) throw new V2SessionError('no_pending_request', 'There is no sign-in in progress in this tab.');
  if (params.get('state') !== pending.state) throw new V2SessionError('state_mismatch', 'The sign-in answer does not match the request.');
  const code = params.get('code');
  if (!code) throw new V2SessionError('provider_error', 'The sign-in answer carried no code.');
  const body = await postToken(
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: pending.verifier },
    'token_exchange_failed',
  );
  const next = tokenSetOf(body);
  if (!next.idToken) throw new V2SessionError('id_token_invalid', 'The token answer carried no ID token.');
  await verifyIdToken(next.idToken, pending.nonce);
  setTokens(next);
  try { sessionStorage.removeItem(ENDED_KEY); } catch { /* nothing to clear */ }
  return pending.returnTo || '/';
}

export function decodeClaims(jwt: string): IdClaims {
  const part = jwt.split('.')[1];
  if (!part) throw new V2SessionError('id_token_invalid', 'Malformed ID token.');
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as IdClaims;
}

interface Jwk extends JsonWebKey { kid?: string }
let jwksCache: { keys: Jwk[]; at: number } | null = null;

async function jwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetch(`${V2_ISSUER}/.well-known/jwks.json`, { headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { keys?: Jwk[] };
  jwksCache = { keys: body.keys ?? [], at: Date.now() };
  return jwksCache.keys;
}

/** RS256 (the issuer's JWKS) + iss (must EQUAL the configured issuer), aud, exp, nonce. */
async function verifyIdToken(jwt: string, nonce: string): Promise<IdClaims> {
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) throw new V2SessionError('id_token_invalid', 'Malformed ID token.');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new V2SessionError('id_token_invalid', 'The ID token is not signed with RS256.');
  let jwk = (await jwks()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await jwks(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new V2SessionError('id_token_invalid', 'The ID token names a signing key the issuer does not publish.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new V2SessionError('id_token_invalid', 'The ID token signature is not valid.');
  const claims = decodeClaims(jwt);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (String(claims.iss || '').replace(/\/+$/, '') !== V2_ISSUER) throw new V2SessionError('id_token_invalid', 'The ID token was issued by someone else.');
  if (!aud.includes(V2_CLIENT_ID)) throw new V2SessionError('id_token_invalid', 'The ID token is for another application.');
  if (claims.exp * 1000 < Date.now() - 60_000) throw new V2SessionError('id_token_invalid', 'The ID token has expired.');
  if (claims.nonce !== nonce) throw new V2SessionError('id_token_invalid', 'The ID token does not belong to this sign-in.');
  return claims;
}

/**
 * RP-initiated logout with `id_token_hint`; leaves the page. The issuer sends the browser back only to an address
 * registered for this client, matched exactly, and the `admin` client registers each host's root (`<origin>/`), not
 * `/login`; the root shows the sign-in page to a signed-out person (ProtectedRoute sends it to /login).
 */
export function signOut(postLogoutPath = '/'): void {
  if (leaving) return;
  // First mark the page as leaving: the v2 client then sends no call and ignores every answer still on its way, so no
  // 401 can end the session again or redirect to /login. Then clear the tokens without telling the listeners (nothing
  // re-renders as signed out), then leave for the issuer.
  leaving = true;
  const idToken = tokens?.idToken;
  setTokens(null);
  const q = new URLSearchParams({
    post_logout_redirect_uri: `${location.origin}${postLogoutPath}`,
    state: randomToken(12),
    client_id: V2_CLIENT_ID,
  });
  if (idToken) q.set('id_token_hint', idToken);
  location.assign(`${V2_ISSUER}/logout?${q.toString()}`);
}
