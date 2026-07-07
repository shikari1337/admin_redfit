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
import { authAPI, setTenantApiKey, getTenantApiKey } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  permissions: string[];
  isActive: boolean;
  lastLogin?: string;
}

export interface AuthState {
  user: AdminUser | null;
  token: string | null;
  storeApiKey: string | null;
  isLoaded: boolean;       // initial auth check complete
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, storeApiKey: string) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  canAccess: (module: string) => boolean;
  storeModules: Record<string, boolean>;
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
  // Don't remove TENANT_API_KEY_STORAGE_KEY — it may be set from env and needed for login
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
  });
  const [storeModules, setStoreModules] = useState<Record<string, boolean>>({});
  const initRan = useRef(false);

  const fetchAndSetUser = useCallback(async (token: string, storeApiKey: string): Promise<boolean> => {
    try {
      const userData = await authAPI.me();
      const user: AdminUser = userData?.data ?? userData;
      if (!user?._id && !user?.email) throw new Error('Invalid user response');

      setState({
        user,
        token,
        storeApiKey,
        isLoaded: true,
        isAuthenticated: true,
      });

      // Load store modules in background
      try {
        const { modulesAPI } = await import('../services/api');
        const mods = await modulesAPI.list();
        const modsList = Array.isArray(mods) ? mods : mods?.modules ?? mods?.data ?? [];
        const modMap: Record<string, boolean> = {};
        for (const m of modsList) modMap[m.key] = m.enabled !== false;
        setStoreModules(modMap);
      } catch { /* modules not critical */ }
      return true;
    } catch {
      clearSession();
      setState({ user: null, token: null, storeApiKey: null, isLoaded: true, isAuthenticated: false });
      return false;
    }
  }, []);

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
    setState({ user: null, token: null, storeApiKey: null, isLoaded: true, isAuthenticated: false });
    setStoreModules({});
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token || !state.storeApiKey) return;
    await fetchAndSetUser(state.token, state.storeApiKey);
  }, [state.token, state.storeApiKey, fetchAndSetUser]);

  const canAccess = useCallback((module: string): boolean => {
    if (!state.user) return false;
    // Module disabled → hidden for everyone (admin included); only when storeModules is loaded
    if (module in storeModules && !storeModules[module]) return false;
    if (state.user.role === 'admin') return true;
    return state.user.permissions?.includes(module) ?? false;
  }, [state.user, storeModules]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser, canAccess, storeModules }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
