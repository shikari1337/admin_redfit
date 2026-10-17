/**
 * Auth + the store's module map (identity ROUTE_MAP §D/§E, platform S1–S2).
 *
 * The staff password sign-in (`POST /auth/login`, `/auth/admin-login`) and the
 * legacy staff sessions (`/auth/logout`, `/auth/logout-all`) are DROPPED in v2
 * (DEC-028): the Login screen starts the Growcord ID sign-in (`session.ts`) and
 * sign-out is RP-initiated logout at the issuer. Their rows below answer the
 * screen without a server call and say so.
 */
import type { V2Route } from '../routes';
import { v2call, backendGap } from '../http';
import { sessionClaims } from '../session';
import { tenantNow } from '../tenant';

const PLATFORM_ORG = 'growcord';

/** The staff/me port gap, remembered for this tab (an hour) so it is asked once, not per page. */
const GAP_KEY = 'gc_v2_gap:identity_staff_me';
const GAP = new Error('identity staff/me port not wired');
function gapKnown(): boolean {
  try { const at = Number(sessionStorage.getItem(GAP_KEY)); return at > 0 && Date.now() - at < 3_600_000; } catch { return false; }
}
function rememberGap(): void {
  try { sessionStorage.setItem(GAP_KEY, String(Date.now())); } catch { /* asked again next time */ }
}

/** The legacy `AdminUser` the auth context and every gate read. */
function adminUser(src: {
  id?: string; name?: string; email?: string; role?: string; permissions?: string[];
  effective_permissions?: string[]; workspaces?: string[]; site_url?: string | null; is_active?: boolean;
}) {
  const permissions = Array.isArray(src.permissions) ? src.permissions : [];
  return {
    _id: src.id ?? '',
    id: src.id ?? '',
    name: src.name ?? src.email ?? '',
    email: src.email ?? '',
    role: src.role ?? 'staff',
    permissions,
    effective_permissions: Array.isArray(src.effective_permissions) && src.effective_permissions.length ? src.effective_permissions : permissions,
    workspaces: Array.isArray(src.workspaces) && src.workspaces.length ? src.workspaces : undefined,
    site_url: src.site_url ?? null,
    isActive: src.is_active !== false,
  };
}

export const AUTH_ROUTES: V2Route[] = [
  {
    m: 'GET', from: '/auth/me', row: 'identity D7 — GET /api/v2/identity/staff/me',
    raw: true,
    run: async () => {
      try {
        if (gapKnown()) throw GAP;
        const me = await v2call<Record<string, any>>('GET', '/api/v2/identity/staff/me');
        return adminUser(me);
      } catch (e: any) {
        // BACKEND GAP (ADMIN-V2-1): staff/me answers 503 `identity.port_not_wired` while
        // its store_site_url port (HOST-3) is unwired. Until then the same facts come from
        // the person's membership of the store's organisation (`GET /api/v2/identity/me`):
        // role + resolved permissions, which is what every gate reads. A 401/403 is a
        // real refusal and propagates (it ends / explains the session).
        const code = e?.response?.data?.code;
        if (e !== GAP && (e?.response?.status !== 503 || !String(code || '').endsWith('port_not_wired'))) throw e;
        rememberGap();
        const account = await v2call<{ person?: any; memberships?: any[] }>('GET', '/api/v2/identity/me');
        const person = account.person ?? {};
        const ms = (account.memberships ?? []).filter((m) => m.status === 'active');
        const tenant = tenantNow();
        const pick = ms.find((m) => tenant?.slug && String(m.organisation || '').startsWith(tenant.slug))
          ?? ms.find((m) => m.organisation !== PLATFORM_ORG)
          ?? ms[0];
        if (!pick) {
          const err: any = new Error('This Growcord ID account is not a member of this store.');
          err.response = { status: 403, data: { success: false, code: 'access.forbidden_kind', message: err.message } };
          throw err;
        }
        const claims = sessionClaims();
        return adminUser({
          id: person.id ?? claims?.sub,
          name: person.name ?? claims?.name,
          email: person.email ?? claims?.email,
          role: (pick.roles ?? [])[0],
          permissions: pick.permissions ?? [],
          effective_permissions: pick.permissions ?? [],
        });
      }
    },
  },
  // D12/D13 dropped: the legacy sessions are gone; sign-out is the issuer's /logout (session.signOut).
  { m: 'POST', from: '/auth/logout', row: 'identity D12 (dropped → A28)', run: async () => ({ success: true, message: 'Signed out through Growcord ID' }) },
  { m: 'POST', from: '/auth/logout-all', row: 'identity D13 (dropped → A32)', to: '/api/v2/identity/me/sessions/revoke-all', method: 'POST', body: () => ({}) },
  { m: 'GET', from: '/auth/sessions', row: 'identity D14 (dropped → A31)', to: '/api/v2/identity/me/sessions' },

  // Dropped by DEC-028 (identity D2/E2/D15): the v2 Login never calls them; a stray caller is told why.
  { m: 'POST', from: '/auth/login', row: 'identity D2 (dropped)', run: async () => backendGap('Staff password sign-in (POST /auth/login) is gone; use "Continue with Growcord ID" (identity D2)') },
  { m: 'POST', from: '/auth/admin-login', row: 'identity E2 (dropped)', run: async () => backendGap('Central password sign-in (POST /auth/admin-login) is gone; use "Continue with Growcord ID" (identity E2)') },
  { m: 'DELETE', from: '/auth/sessions/:id', row: 'identity D15 (dropped; only revoke-all, A32)', run: async () => backendGap('Revoking one legacy session is gone; Growcord ID revokes every session at once (identity A32)') },

  // The store's module map — every gate (`canAccess`) reads it — and its switches (platform S3–S8).
  { m: 'GET', from: '/modules', row: 'platform S1', to: '/api/v2/platform/modules' },
  { m: 'GET', from: '/modules/registry', row: 'platform S2', to: '/api/v2/platform/modules/registry' },
  { m: 'GET', from: '/modules/public', row: 'platform P14', to: '/api/v2/platform/public/modules' },
  { m: 'PUT', from: '/modules/:key', row: 'platform S3', method: 'PATCH', to: '/api/v2/platform/modules/{key}', body: (c) => ({ enabled: c.body?.enabled ?? null, config: c.body?.config ?? null }) },
  { m: 'POST', from: '/modules/bulk', row: 'platform S4', to: '/api/v2/platform/modules/bulk', body: (c) => ({ modules: (c.body?.modules ?? []).map((x: any) => ({ key: x.key, enabled: x.enabled ?? null })) }) },
  { m: 'POST', from: '/modules/initialize', row: 'platform S5', to: '/api/v2/platform/modules/initialize', body: () => ({}) },
  { m: 'GET', from: '/modules/store-types', row: 'platform S7', to: '/api/v2/platform/store-types' },
  { m: 'POST', from: '/modules/apply-store-type', row: 'platform S8', to: '/api/v2/platform/store-types/apply' },
];
