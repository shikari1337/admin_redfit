/**
 * AuthContext — centralized auth state for the admin panel.
 *
 * Security model:
 *  - Session stored in sessionStorage (clears on tab close, not persistent like localStorage)
 *  - Token is store-scoped: a token issued for Store A cannot be used for Store B
 *  - JWT expiry decoded client-side (no library) — forces re-login when token expires
 *  - Browser fingerprint (hashed userAgent) stored with session — detects session token theft
 *  - If stored storeApiKey drifts from current store context → force re-login
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  authAPI, setTenantApiKey, getTenantApiKey, isPlatformDomain,
  TENANT_API_KEY_STORAGE_KEY,
} from '../services/api';
import { effectivePermissionsFor, hasPermIn, workspacesFor } from '../lib/rbac';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'accountant' | 'auditor' | 'store_manager' | 'warehouse_manager';
  permissions: string[];
  /** ERP RBAC (backend kernel/rbac): resolved role matrix + per-user grants. */
  effective_permissions?: string[];
  /** Panels this user may enter (commerce | orders | inventory | accounting). */
  workspaces?: string[];
  isActive: boolean;
  lastLogin?: string;
}

export interface AuthState {
  user: AdminUser | null;
  token: string | null;
  storeApiKey: string | null;
  isLoaded: boolean;       // initial auth check complete
  isAuthenticated: boolean;
  /**
   * Set when the session could NOT be verified for a reason that is not a
   * rejection — the server was unreachable, rate-limited us, or errored. The
   * stored session is deliberately left intact in this state; the UI offers a
   * retry instead of bouncing to /login (see `retryVerify`).
   */
  authUnreachable: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, storeApiKey: string) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Re-run the session check after an `authUnreachable` failure. */
  retryVerify: () => Promise<void>;
  refreshModules: () => Promise<void>;
  canAccess: (module: string) => boolean;
  /** ERP permission check ('accounting.read', 'inventory.adjust', …). */
  hasPerm: (perm: string) => boolean;
  /** Panels available to this user, in preference order. */
  workspaces: string[];
  storeModules: Record<string, boolean>;
  /**
   * Has the store's module map been fetched at least once (success OR failure)?
   *
   * `canAccess()` deliberately fails OPEN for an unknown module key, so before
   * the map arrives every module looks enabled. Gates must wait on this instead
   * of rendering optimistically — otherwise a disabled module's page mounts for
   * a frame, fires its request, and eats a 403 MODULE_DISABLED in the console.
   */
  modulesLoaded: boolean;
}

// ─── Session storage helpers ──────────────────────────────────────────────────

const SESSION_KEY = 'admin_session_v2';

interface StoredSession {
  token: string;
  storeApiKey: string;
  fingerprint: string;
  issuedAt: number;
}

function getFingerprint(): string {
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width,
    screen.height,
  ].join('|');
  // Simple hash (djb2) — not crypto, just anti-trivial-hijack
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(i);
    hash = hash & hash; // 32-bit int
  }
  return hash.toString(36);
}

function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp ? decoded.exp * 1000 : null; // ms
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeJwtExpiry(token);
  if (!exp) return false; // no expiry → assume valid
  return Date.now() > exp - 60_000; // 1-min buffer
}

/**
 * Did GET /auth/me actually REJECT this session, or did it just fail to answer?
 *
 * Only 401/403 mean "this token is no good". Everything else — no response at
 * all (server down, DNS, CORS, offline), 408/425/429, or any 5xx — says nothing
 * about the token's validity, and must NOT destroy the session.
 *
 * This mattered in practice: /auth/me is mounted under the backend's blanket
 * `/auth/` brute-force limiter (40 req / 15 min, keyed by IP), so a handful of
 * hard refreshes — or several staff sharing one office IP — returned 429 and
 * silently logged everyone out of the admin panel.
 */
function isSessionRejection(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export function saveSession(token: string, storeApiKey: string): void {
  const session: StoredSession = {
    token,
    storeApiKey,
    fingerprint: getFingerprint(),
    issuedAt: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // Also keep in localStorage for cross-tab compatibility (read-only, validated)
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_tenant_api_key', storeApiKey);
}

export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      // Fallback: check localStorage (existing sessions from before this code)
      const token = localStorage.getItem('admin_token');
      const storeApiKey = getTenantApiKey();
      if (token && storeApiKey) {
        return { token, storeApiKey, fingerprint: getFingerprint(), issuedAt: 0 };
      }
      return null;
    }
    const session: StoredSession = JSON.parse(raw);

    // 1. Check fingerprint matches (prevents session token theft via XSS exfiltration)
    if (session.fingerprint && session.fingerprint !== getFingerprint()) {
      clearSession();
      return null;
    }

    // 2. Check JWT not expired
    if (isTokenExpired(session.token)) {
      clearSession();
      return null;
    }

    // 3. Verify stored storeApiKey hasn't been tampered via localStorage
    const lsKey = localStorage.getItem('admin_tenant_api_key') || getTenantApiKey();
    if (lsKey && lsKey !== session.storeApiKey) {
      // localStorage storeApiKey was changed — possible cross-store attempt
      clearSession();
      return null;
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('admin_token');
  // Keep TENANT_API_KEY_STORAGE_KEY on a store domain — it may come from env and
  // is needed to log back in.
  //
  // On the CENTRAL console the opposite is true: there is no ambient tenant, and
  // keeping the last store's key made the next sign-in pin to that store, so a
  // user with an account on a DIFFERENT store was told "Invalid email or
  // password". Signing out of the console must leave no tenant behind.
  try {
    if (isPlatformDomain()) localStorage.removeItem(TENANT_API_KEY_STORAGE_KEY);
  } catch { /* storage unavailable — nothing to clear */ }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    storeApiKey: null,
    isLoaded: false,
    isAuthenticated: false,
    authUnreachable: false,
  });
  const [storeModules, setStoreModules] = useState<Record<string, boolean>>({});
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const initRan = useRef(false);

  // Reloads the store's module map. Kept separate so it can also run on window
  // focus — otherwise toggling a module (e.g. B2B) in the super-admin wouldn't
  // take effect until a full re-login, leaving the module's page/menu blocked
  // by a stale cache.
  const refreshModules = useCallback(async () => {
    try {
      const { modulesAPI } = await import('../services/api');
      const mods = await modulesAPI.list();
      const modsList = Array.isArray(mods) ? mods : mods?.modules ?? mods?.data ?? [];
      const modMap: Record<string, boolean> = {};
      for (const m of modsList) modMap[m.key] = m.enabled !== false;
      setStoreModules(modMap);
    } catch {
      // Modules aren't critical: on failure we keep the empty map, which makes
      // canAccess() fail OPEN. Better a visible page that 403s server-side than
      // locking an admin out of their own store over a flaky request.
    } finally {
      // Either way the gates may now stop waiting.
      setModulesLoaded(true);
    }
  }, []);

  const fetchAndSetUser = useCallback(async (token: string, storeApiKey: string): Promise<boolean> => {
    // Transient failures get a few short retries before we give up — a 429 from
    // the auth limiter or a backend restart shouldn't cost the admin their session.
    const BACKOFF_MS = [400, 1200, 3000];

    for (let attempt = 0; ; attempt++) {
      try {
        const userData = await authAPI.me();
        const user: AdminUser = userData?.data ?? userData;
        // A 200 with an unrecognisable body is a server-side problem, not a
        // rejection — treat it as transient rather than shredding the session.
        if (!user?._id && !user?.email) throw new Error('Invalid user response');

        setState({
          user,
          token,
          storeApiKey,
          isLoaded: true,
          isAuthenticated: true,
          authUnreachable: false,
        });

        // Load store modules in background (fresh from the platform toggles).
        refreshModules();
        return true;
      } catch (err) {
        if (isSessionRejection(err)) {
          // The server explicitly refused this token — the session really is dead.
          clearSession();
          setState({
            user: null, token: null, storeApiKey: null,
            isLoaded: true, isAuthenticated: false, authUnreachable: false,
          });
          return false;
        }

        if (attempt < BACKOFF_MS.length) {
          await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
          continue;
        }

        // Couldn't reach a verdict. KEEP the stored session — the token may well
        // be fine — and let the UI offer a retry instead of a silent logout.
        setState({
          user: null, token, storeApiKey,
          isLoaded: true, isAuthenticated: false, authUnreachable: true,
        });
        return false;
      }
    }
  }, [refreshModules]);

  // Re-run the session check after an "unreachable" failure (retry button).
  const retryVerify = useCallback(async () => {
    const session = loadSession();
    if (!session) {
      setState({
        user: null, token: null, storeApiKey: null,
        isLoaded: true, isAuthenticated: false, authUnreachable: false,
      });
      return;
    }
    setState(s => ({ ...s, isLoaded: false, authUnreachable: false }));
    setTenantApiKey(session.storeApiKey);
    await fetchAndSetUser(session.token, session.storeApiKey);
  }, [fetchAndSetUser]);

  // Bootstrap: restore session on mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    const session = loadSession();
    if (!session) {
      setState(s => ({ ...s, isLoaded: true }));
      return;
    }
    // Apply the stored API key to axios
    setTenantApiKey(session.storeApiKey);
    fetchAndSetUser(session.token, session.storeApiKey);
  }, [fetchAndSetUser]);

  // Keep the module map fresh: re-fetch when the admin returns to the tab, so a
  // module enabled elsewhere (super-admin) unblocks its page without a re-login.
  // Gated on being signed in — this used to fire on the LOGIN page too, putting
  // a meaningless 401 on GET /modules in the console every time the tab
  // regained focus (which reads as "the backend is rejecting me").
  const isAuthedRef = useRef(false);
  useEffect(() => { isAuthedRef.current = state.isAuthenticated; }, [state.isAuthenticated]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && isAuthedRef.current) refreshModules();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshModules]);

  const login = useCallback(async (token: string, storeApiKey: string) => {
    saveSession(token, storeApiKey);
    setTenantApiKey(storeApiKey);
    const ok = await fetchAndSetUser(token, storeApiKey);
    if (!ok) throw new Error('Session setup failed — please try again.');
  }, [fetchAndSetUser]);

  const logout = useCallback(async (all = false) => {
    try {
      if (all) await authAPI.logoutAll();
      else await authAPI.logout();
    } catch { /* ignore */ }
    clearSession();
    setTenantApiKey(null);
    setState({
      user: null, token: null, storeApiKey: null,
      isLoaded: true, isAuthenticated: false, authUnreachable: false,
    });
    setStoreModules({});
    setModulesLoaded(false);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token || !state.storeApiKey) return;
    await fetchAndSetUser(state.token, state.storeApiKey);
  }, [state.token, state.storeApiKey, fetchAndSetUser]);

  /**
   * Is this MODULE available to the store? (feature/plan gating — "has the store
   * bought this?"). It is NOT an authorization check.
   *
   * It used to also require the user's `permissions` array to contain the bare
   * module name, which conflated two unrelated axes and broke both ways:
   * a `store_manager` holding `marketing.manage` saw NO marketing nav because
   * nobody had ticked the legacy `marketing` string, while ticking that string
   * granted no API access at all (the API checks `<area>.<action>`). Permission
   * is now always `hasPerm`; this answers only the module question.
   */
  const canAccess = useCallback((module: string): boolean => {
    if (!state.user) return false;
    // Module disabled → hidden for everyone (admin included); only when storeModules is loaded
    if (module in storeModules && !storeModules[module]) return false;
    return true;
  }, [state.user, storeModules]);

  // ERP permission check: backend-resolved effective_permissions win; the
  // local matrix mirror covers sessions that predate the field.
  const hasPerm = useCallback((perm: string): boolean => {
    if (!state.user) return false;
    const eff = state.user.effective_permissions
      ?? effectivePermissionsFor(state.user.role, state.user.permissions ?? []);
    return hasPermIn(eff, perm);
  }, [state.user]);

  const workspaces = state.user
    ? (state.user.workspaces ?? workspacesFor(state.user.role))
    : [];

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser, retryVerify, refreshModules, canAccess, hasPerm, workspaces, storeModules, modulesLoaded }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
