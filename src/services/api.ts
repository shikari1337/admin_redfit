import axios from 'axios';

// API Configuration
// All requests go to the platform API domain for consistent tenant identification
// The backend identifies tenant from the Host header or x-api-key (store API key)
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';
const API_KEY = import.meta.env.VITE_API_KEY;

/** localStorage key for runtime-configured store API key (tenant validation) */
export const TENANT_API_KEY_STORAGE_KEY = 'admin_tenant_api_key';

/** Get the API key to use for tenant/store validation: runtime (localStorage) first, then env */
export function getTenantApiKey(): string | undefined {
  try {
    const fromStorage = localStorage.getItem(TENANT_API_KEY_STORAGE_KEY);
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
    // On the CENTRAL console (app.growcord.com) the build-time VITE_API_KEY must
    // NOT apply — it would silently pin every visitor to whichever store was
    // baked into the bundle. Until the user picks a store there is no tenant.
    if (localStorage.getItem(PLATFORM_DOMAIN_KEY) === window.location.hostname.toLowerCase()) return undefined;
  } catch (_) {}
  return API_KEY;
}

/** Set the store API key for tenant validation (e.g. from Settings). Persists in localStorage. */
export function setTenantApiKey(apiKey: string | null): void {
  if (apiKey === null || apiKey === '') {
    localStorage.removeItem(TENANT_API_KEY_STORAGE_KEY);
  } else {
    localStorage.setItem(TENANT_API_KEY_STORAGE_KEY, apiKey.trim());
  }
}

// ─── Domain-based tenant resolution ─────────────────────────────────────────
// ONE deployed admin panel serves every store. On boot we resolve the domain
// the panel is being served on (e.g. admin.ziptronbags.com) against the
// super-admin-configured store domains (admin_domain / domain / subdomain) and
// adopt that store's tenant key — the env VITE_API_KEY is only the fallback
// for localhost/dev or unregistered domains.

const RESOLVED_DOMAIN_KEY = 'admin_tenant_resolved_domain';
/** Store identity resolved from the serving domain (for Login-page branding). */
export const RESOLVED_STORE_KEY = 'admin_tenant_resolved_store';
/** Set to the host when THIS domain is the central console (not a store's admin). */
const PLATFORM_DOMAIN_KEY = 'admin_tenant_platform_domain';

/** True on the central console (app.growcord.com): no store pin, picker shown. */
export function isPlatformDomain(): boolean {
  try { return localStorage.getItem(PLATFORM_DOMAIN_KEY) === window.location.hostname.toLowerCase(); }
  catch { return false; }
}

export interface DomainStore { slug: string; name: string; apiKey: string; }

/**
 * The store THIS domain belongs to, or null when the panel is served from an
 * unregistered domain / localhost (then the env key + store picker apply).
 * When set, login is PINNED to this store: the panel never manages another
 * tenant from this domain.
 */
export function getDomainStore(): DomainStore | null {
  try {
    const raw = localStorage.getItem(RESOLVED_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only trust it for the host it was resolved on.
    if (localStorage.getItem(RESOLVED_DOMAIN_KEY) !== window.location.hostname.toLowerCase()) return null;
    return parsed?.apiKey ? parsed as DomainStore : null;
  } catch { return null; }
}

/**
 * Resolve the serving domain → tenant key. Awaited in main.tsx BEFORE the app
 * renders so every subsequent request carries the right x-api-key.
 * Fail-open: any error keeps the existing (localStorage/env) behaviour.
 */
export async function resolveTenantFromDomain(): Promise<void> {
  try {
    const host = window.location.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1') return;

    // Central console already identified for THIS host → nothing to pin. Leave
    // any session key untouched (clearing it would log the user out on reload).
    if (localStorage.getItem(PLATFORM_DOMAIN_KEY) === host) return;

    // Already resolved for THIS host → re-assert the pinned key offline and skip
    // the round-trip. Re-asserting (rather than just keeping whatever is in
    // localStorage) is what makes the domain authoritative: a key left behind by
    // a store switch or another tab can never be used on a store's own domain.
    const cached = localStorage.getItem(RESOLVED_STORE_KEY);
    if (localStorage.getItem(RESOLVED_DOMAIN_KEY) === host && cached) {
      try {
        const store = JSON.parse(cached);
        if (store?.apiKey) { setTenantApiKey(store.apiKey); return; }
      } catch { /* malformed → re-resolve below */ }
    }

    const res = await axios.get(`${API_URL}/auth/resolve-store`, { params: { domain: host }, timeout: 10000 });
    const store = res.data?.data ?? null;

    if (store?.platform) {
      // Central console: no store pin, no env-key fallback (see getTenantApiKey),
      // store picker + switcher available. An existing session survives.
      localStorage.setItem(PLATFORM_DOMAIN_KEY, host);
      localStorage.removeItem(RESOLVED_DOMAIN_KEY);
      localStorage.removeItem(RESOLVED_STORE_KEY);
      console.log(`🌐 Central admin console: ${host} — sign in to choose your store`);
      return;
    }
    localStorage.removeItem(PLATFORM_DOMAIN_KEY);

    if (store?.apiKey) {
      const prev = localStorage.getItem(TENANT_API_KEY_STORAGE_KEY);
      if (prev && prev !== store.apiKey) {
        // Different store than the previous session on this browser — drop the
        // old session so the user logs into THIS store (loadSession would
        // reject the key mismatch anyway; this just makes it clean).
        sessionStorage.clear();
        localStorage.removeItem('admin_token');
      }
      setTenantApiKey(store.apiKey);
      localStorage.setItem(RESOLVED_DOMAIN_KEY, host);
      localStorage.setItem(RESOLVED_STORE_KEY, JSON.stringify({ slug: store.slug, name: store.name, apiKey: store.apiKey }));
      console.log(`🌐 Tenant resolved from domain: ${host} → ${store.slug}`);
    } else {
      // Domain not registered to any store → fall back to env/localStorage.
      // Clear a stale marker from a previously-resolved different host.
      if (localStorage.getItem(RESOLVED_DOMAIN_KEY) && localStorage.getItem(RESOLVED_DOMAIN_KEY) !== host) {
        localStorage.removeItem(RESOLVED_DOMAIN_KEY);
        localStorage.removeItem(RESOLVED_STORE_KEY);
      }
    }
  } catch {
    // Backend unreachable or endpoint missing — existing behaviour applies.
  }
}

/**
 * localStorage key for a runtime API-server-URL override. It WINS over the
 * build-time VITE_API_SERVER_URL, so a bad/misspelled deploy value can be fixed
 * from the browser WITHOUT a rebuild:
 *   localStorage.setItem('admin_api_server_url','https://api.homeomead.us'); location.reload()
 */
export const API_SERVER_URL_STORAGE_KEY = 'admin_api_server_url';

/** Persist (or clear) the runtime API-server-URL override. */
export function setApiServerUrl(url: string | null): void {
  try {
    if (!url || !url.trim()) localStorage.removeItem(API_SERVER_URL_STORAGE_KEY);
    else localStorage.setItem(API_SERVER_URL_STORAGE_KEY, url.trim());
  } catch (_) {}
}

function resolveApiServerUrl(): string {
  try {
    const override = localStorage.getItem(API_SERVER_URL_STORAGE_KEY);
    if (override && override.trim()) return override.trim();
  } catch (_) {}
  return import.meta.env.VITE_API_SERVER_URL;
}

// Get API base URL: runtime override (localStorage) → build-time env → production default
let rawBaseUrl = resolveApiServerUrl();

// If not set, use production API URL
if (!rawBaseUrl || rawBaseUrl.trim() === '') {
  // Production default (set VITE_API_SERVER_URL to override)
  rawBaseUrl = 'https://api.growcord.in';
} else {
  // Remove trailing /api if it exists (handle cases where user includes it)
  if (rawBaseUrl.endsWith('/api')) {
    rawBaseUrl = rawBaseUrl.slice(0, -4);
  }
  // Remove trailing slashes
  rawBaseUrl = rawBaseUrl.replace(/\/+$/, '');
}

const API_BASE_URL = rawBaseUrl;
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

console.log('🔧 Admin API Configuration:', {
  VITE_API_SERVER_URL: import.meta.env.VITE_API_SERVER_URL,
  VITE_API_KEY: API_KEY ? 'Present (Hidden)' : 'Missing',
  VITE_API_VERSION: import.meta.env.VITE_API_VERSION,
  PROD: import.meta.env.PROD,
  MODE: import.meta.env.MODE,
  API_BASE_URL,
  API_VERSION,
  API_URL,
  currentOrigin: window.location.origin,
  currentHostname: window.location.hostname,
  protocol: window.location.protocol,
  NOTE: 'All requests go to the platform API domain for consistent tenant identification'
});

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Saving a product that has many variations (a consolidated multi-brand remedy
  // can have 80+) re-processes the whole array against a remote DB, which used to
  // blow the old 30s cap — the row DID save but the client showed a bogus
  // "Network Error", so B2B/field edits looked like they failed. 120s is the
  // safety net; VariationEditPage additionally saves just the one variation.
  timeout: 120000,
});

/**
 * Keys whose VALUES are opaque JSON payloads that either round-trip back to the
 * backend verbatim (product/page editors) or carry their own meaningful key
 * shape. We do NOT descend into these — injecting camelCase aliases inside them
 * would bloat what gets saved and corrupt stored JSONB. The key itself still
 * gets an alias; only its children are left untouched.
 */
const OPAQUE_VALUE_KEYS = new Set([
  'seo', 'page_sections', 'pagesections', 'aplus_content', 'apluscontent',
  'custom_data', 'customdata', 'specifications', 'offers', 'wash_care_instructions',
  'attributes', 'conditions', 'meta', 'metadata', 'config', 'schema_markup',
  'items', 'blocks', 'sections', 'settings', 'shipping_providers', 'store_access',
  'permissions', 'gst', 'status_history', 'timeline', 'b2b_pricing', 'b2bpricing',
  'variation_attributes', 'children', 'size_chart', 'sizechart', 'filters',
  'product_ids', 'category_ids', 'schema', 'value', 'data', 'raw',
]);

const snakeToCamel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/**
 * Normalize PostgreSQL responses for the MongoDB-era admin:
 *  1. add `_id` alias for `id`
 *  2. add camelCase aliases for every snake_case key (non-destructive — originals
 *     are kept, so both `is_active` and `isActive` read correctly)
 * Opaque JSON values (see above) are passed through untouched so editors that
 * save the object back don't persist alias junk into JSONB columns.
 */
const normalizeIds = (data: any): any => {
  if (Array.isArray(data)) return data.map(normalizeIds);
  if (data && typeof data === 'object'
      && !(data instanceof Date) && !(data instanceof Blob)
      && !(typeof File !== 'undefined' && data instanceof File)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = OPAQUE_VALUE_KEYS.has(k.toLowerCase()) ? v : normalizeIds(v);
    }
    // camelCase aliases (added after, so they point at normalized values)
    for (const k of Object.keys(data)) {
      if (!k.includes('_') || k.startsWith('_')) continue;
      const camel = snakeToCamel(k);
      if (camel !== k && out[camel] === undefined) out[camel] = out[k];
    }
    if (out.id !== undefined && out._id === undefined) out._id = out.id;
    return out;
  }
  return data;
};

/**
 * Normalize API response to ensure consistent format
 * Backend returns: { success: true, data: ... }
 * This function extracts the data field if present, otherwise returns the full response
 */
const normalizeResponse = (response: any): any => {
  if (!response || typeof response !== 'object') {
    return response;
  }

  // If response has success and data fields, extract data
  if (response.success !== undefined && response.data !== undefined) {
    const extracted = normalizeIds(response.data);
    // Preserve pagination metadata (total, count) as non-enumerable properties
    // so Array.isArray() stays true and existing callers are unaffected.
    if (Array.isArray(extracted)) {
      if (response.total !== undefined) {
        Object.defineProperty(extracted, 'total', { value: response.total, writable: true, enumerable: false, configurable: true });
      }
      if (response.count !== undefined) {
        Object.defineProperty(extracted, 'count', { value: response.count, writable: true, enumerable: false, configurable: true });
      }
      // Preserve sibling metadata (e.g. b2b applications' status `counts`) that
      // would otherwise be dropped when the envelope is unwrapped to its array.
      if (response.counts !== undefined) {
        Object.defineProperty(extracted, 'counts', { value: response.counts, writable: true, enumerable: false, configurable: true });
      }
    }
    return extracted;
  }

  // If response.data exists and has success/data structure, extract nested data
  if (response.data && typeof response.data === 'object' && response.data.success !== undefined && response.data.data !== undefined) {
    return normalizeIds(response.data.data);
  }

  // Return as-is if no standard structure found
  return normalizeIds(response);
};

// Add auth token, tenant API key, and security headers to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Store/tenant validation: send API key when available (env or Settings).
  // Skip if the request explicitly set x-api-key (even to empty string) — this
  // lets admin-login and similar central-DB calls opt out of tenant resolution.
  const tenantApiKey = getTenantApiKey();
  if (tenantApiKey && config.headers['x-api-key'] === undefined) {
    config.headers['x-api-key'] = tenantApiKey;
  }


  // Security: validate stored storeApiKey hasn't drifted from session
  // (If someone manually edited localStorage to another store's key, force logout)
  try {
    const sessionRaw = sessionStorage.getItem('admin_session_v2');
    if (sessionRaw && token) {
      const session = JSON.parse(sessionRaw);
      const lsKey = localStorage.getItem('admin_tenant_api_key');
      if (lsKey && session.storeApiKey && lsKey !== session.storeApiKey) {
        // Store key tampering detected — abort and force re-login
        console.warn('⚠️ Store API key mismatch detected — possible cross-store access attempt. Forcing logout.');
        localStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_session_v2');
        window.location.href = '/login';
        return Promise.reject(new Error('Store mismatch: re-authentication required'));
      }
    }
  } catch { /* non-critical */ }

  console.log('📤 Request:', {
    method: config.method?.toUpperCase(),
    url: config.url,
    hasToken: !!token,
    storeKey: tenantApiKey ? 'present' : 'missing',
  });
  return config;
});

// Handle auth errors and normalize responses
api.interceptors.response.use(
  (response) => {
    // Skip normalization for blob/arraybuffer responses (PDF downloads etc.)
    const responseType = response.config?.responseType;
    if (responseType === 'blob' || responseType === 'arraybuffer') {
      console.log('📥 Response (binary):', {
        status: response.status,
        url: response.config.url,
        type: responseType,
        size: response.data?.size || response.data?.byteLength || 'unknown',
      });
      return response;
    }

    // Normalize response data to ensure consistent format
    if (response.data) {
      // Debug: log raw data before normalization for shipments endpoint
      const url = response.config?.url || '';
      if (url.includes('/shipments') && !url.includes('pending-orders')) {
        console.log('📥 [SHIPMENTS DEBUG] Raw response.data BEFORE normalization:', JSON.stringify(response.data).substring(0, 2000));
      }
      response.data = normalizeResponse(response.data);
      if (url.includes('/shipments') && !url.includes('pending-orders')) {
        console.log('📥 [SHIPMENTS DEBUG] response.data AFTER normalization:', JSON.stringify(response.data).substring(0, 2000));
        // Log first shipment details if present
        const shipments = response.data?.shipments || response.data;
        if (Array.isArray(shipments) && shipments.length > 0) {
          console.log('📥 [SHIPMENTS DEBUG] First shipment object keys:', Object.keys(shipments[0]));
          console.log('📥 [SHIPMENTS DEBUG] First shipment:', JSON.stringify(shipments[0]).substring(0, 1000));
        }
      }
    }
    console.log('📥 Response:', {
      status: response.status,
      url: response.config.url,
    });
    return response;
  },
  (error) => {
    // Network errors (no response from server)
    if (!error.response) {
      const fullURL = error.config?.baseURL + error.config?.url;

      console.error('❌ Network Error (No Response):', {
        message: error.message,
        code: error.code,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: fullURL,
        timeout: error.config?.timeout,
        method: error.config?.method?.toUpperCase()
      });

      // Provide specific error messages
      if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message?.includes('Connection refused')) {
        // No alert(): a single flaky request must not throw a blocking modal in
        // the operator's face — it interrupts whatever they were doing and says
        // nothing they can act on. Callers surface their own inline error state.
        console.error(
          `❌ Cannot reach the API at ${error.config?.baseURL} — check the backend is running and NEXT/VITE API URL is correct.`
        );
      } else if (error.code === 'ETIMEDOUT') {
        console.error('❌ Connection timeout - Server did not respond in time');
      } else if (error.code === 'ENOTFOUND') {
        console.error('❌ DNS lookup failed - Hostname not found:', error.config?.baseURL);
      }
    } else {
      /**
       * Access refusals carry an actionable payload the UI must not swallow.
       * The backend returns { error: { code, message, moduleKey, upgrade } } for
       * module/plan gating and { code: 'PERMISSION_DENIED', message } for RBAC.
       * Without this the user just saw a page that silently failed to save.
       * `AccessNotice` listens for this event and renders the explanation.
       */
      let isExpectedAccessRefusal = false;
      if (error.response?.status === 403) {
        const d: any = error.response?.data ?? {};
        const code = d?.error?.code ?? d?.code;
        if (['MODULE_DISABLED', 'MODULE_NOT_IN_PLAN', 'MODULE_VIEW_ONLY', 'PERMISSION_DENIED'].includes(code)) {
          isExpectedAccessRefusal = true;
          window.dispatchEvent(new CustomEvent('admin:access-denied', {
            detail: {
              code,
              message: d?.error?.message ?? d?.message,
              moduleLabel: d?.error?.moduleLabel,
              upgrade: d?.error?.upgrade === true,
            },
          }));
        }
      }

      // HTTP errors (server responded with error status)
      const errorData = error.response?.data;

      /**
       * A module/permission refusal is the system WORKING, not a fault: the
       * store simply doesn't have that module. It's already reported in-UI by
       * `AccessNotice`, so logging it as ❌ only trained everyone to ignore a
       * console full of red. Keep it at debug level; log real failures loudly.
       */
      if (isExpectedAccessRefusal) {
        console.debug('🔒 Access refused (expected):', {
          url: error.config?.url,
          code: errorData?.error?.code ?? errorData?.code,
          message: errorData?.error?.message ?? errorData?.message,
        });
      } else {
        console.error('❌ Response Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          fullURL: error.config?.baseURL + error.config?.url,
          data: errorData,
          errorCode: errorData?.code,
          errorMessage: errorData?.message,
          message: error.message,
          authorizationHeader: error.config?.headers?.Authorization ? 'Present' : 'Missing'
        });

        // Log full error data for 401 errors to help debug
        if (error.response?.status === 401) {
          console.error('❌ 401 Full Error Details:', JSON.stringify(errorData, null, 2));
        }
      }
    }

    if (error.response?.status === 401) {
      console.log('🔒 Unauthorized response received');

      // Check if this is a session-related error
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      const errorMessage = errorData?.message || '';
      const requiresLogin = errorData?.requiresLogin !== false; // Default to true if not specified

      console.log('🔒 401 Error details:', {
        code: errorCode,
        message: errorMessage,
        requiresLogin,
        url: error.config?.url,
        data: errorData
      });

      // Session-specific error codes from backend that definitely require re-login
      const sessionErrorCodes = [
        'SESSION_EXPIRED',
        'SESSION_INVALID',
        'SESSION_MISMATCH',
        'TOKEN_EXPIRED',
        'TOKEN_INVALID',
        'AUTH_ERROR',
        'AUTH_REQUIRED',
        'NO_TOKEN',
        'USER_NOT_FOUND',
        'ACCOUNT_DISABLED',
      ];

      // Auth endpoint paths — 401 from these always means the session is dead
      const isAuthPath = (error.config?.url || '').includes('/auth/me') ||
        (error.config?.url || '').includes('/auth/profile') ||
        (error.config?.url || '').includes('/auth/login');

      // Use explicit error CODE (not message text) to decide on logout.
      // Message-text matching caused false positives: e.g. a DB error about
      // "column session_id does not exist" contained the word "session" and
      // triggered a spurious logout. Only fall back to text-match for auth paths.
      const isSessionError =
        sessionErrorCodes.includes(errorCode) ||
        isAuthPath ||
        (requiresLogin === true && sessionErrorCodes.includes(errorCode));

      if (isSessionError) {
        console.log('🔒 Session/token error detected, clearing session and redirecting to login');
        localStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_session_v2'); // clear new secure session
        // Use setTimeout to avoid navigation during render
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      } else {
        // Generic 401 - might be permission issue, don't clear token
        // Let the component handle the error
        console.warn('🔒 401 error (likely permission issue, not session):', {
          code: errorCode,
          message: errorMessage,
          url: error.config?.url
        });
        // Don't clear token or redirect - let the app handle it
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const fullUrl = `${API_URL}/auth/login`;
    console.log('📤 API Request:', {
      method: 'POST',
      url: fullUrl,
      baseURL: API_URL,
      endpoint: '/auth/login',
      data: { email, password: '***' }
    });

    try {
      const response = await api.post('/auth/login', { email, password });
      console.log('📥 API Response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers
      });
      return response.data;
    } catch (error: any) {
      // Network error (no response)
      if (!error.response) {
        console.error('❌ Network Error - Server not reachable:', {
          message: error.message,
          code: error.code,
          fullURL: fullUrl,
          baseURL: API_URL,
          suggestion: 'Check if backend server is running and accessible'
        });
      } else {
        // HTTP error (server responded)
        console.error('❌ API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            baseURL: error.config?.baseURL,
            fullURL: fullUrl,
            headers: error.config?.headers
          }
        });
      }
      throw error;
    }
  },
  /**
   * Central-platform login — no x-api-key sent.
   * Returns { user, token, stores[] } from the main DB.
   * Use when the admin panel is shared across all stores.
   */
  adminLogin: async (email: string, password: string) => {
    // Make a raw axios call WITHOUT the x-api-key interceptor influencing tenant resolution.
    // We explicitly omit the header so the backend uses the main/platform DB.
    const response = await api.post(
      '/auth/admin-login',
      { email, password },
      { headers: { 'x-api-key': '' } },   // empty string overrides the interceptor default
    );
    return response.data;
  },
  logout: async () => {
    try {
      const response = await api.post('/auth/logout');
      return response.data;
    } catch (error: any) {
      // Even if logout fails on server, clear local token
      console.warn('Logout request failed, clearing local token anyway:', error);
      // Don't throw error - we still want to clear local storage
      return { success: true, message: 'Logged out locally' };
    }
  },
  logoutAll: async () => {
    try {
      const response = await api.post('/auth/logout-all');
      return response.data;
    } catch (error: any) {
      console.warn('Logout all request failed, clearing local token anyway:', error);
      return { success: true, message: 'Logged out locally' };
    }
  },
  getSessions: async () => {
    const response = await api.get('/auth/sessions');
    return response.data;
  },
  deleteSession: async (sessionId: string) => {
    const response = await api.delete(`/auth/sessions/${sessionId}`);
    return response.data;
  },
  me: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// Leads API (CRM module - requires leads_manager permission)
export const leadsAPI = {
  getAll: async (params?: { page?: number; limit?: number; offset?: number; status?: string; source?: string }) => {
    const response = await api.get('/leads', { params });
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data?.data) return data.data;
    return [];
  },
  getStats: async () => {
    const response = await api.get('/leads/stats');
    return response.data?.data ?? response.data ?? null;
  },
  getById: async (id: string) => {
    const response = await api.get(`/leads/${id}`);
    return response.data?.data ?? response.data;
  },
  create: async (data: Record<string, unknown>) => {
    const response = await api.post('/leads', data);
    return response.data?.data ?? response.data;
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    const response = await api.put(`/leads/${id}`, updates);
    return response.data?.data ?? response.data;
  },
  convert: async (id: string, customer_id: string) => {
    const response = await api.post(`/leads/${id}/convert`, { customer_id });
    return response.data?.data ?? response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/leads/${id}`);
    return response.data;
  },
};

// Staff API (Admin only - manage staff permissions)
export const staffAPI = {
  list: async () => {
    const response = await api.get('/staff');
    return response.data?.data ?? response.data ?? [];
  },
  /**
   * The grantable permission catalogue + each role's baseline, straight from
   * the backend's RBAC grammar — so the picker can never drift from what the
   * API enforces.
   */
  getPermissionCatalog: async () => {
    const response = await api.get('/staff/permissions');
    return response.data?.data ?? response.data;
  },
  update: async (id: string, data: { permissions?: string[]; isActive?: boolean; name?: string; role?: string }) => {
    const response = await api.put(`/staff/${id}`, data);
    return response.data?.data ?? response.data;
  },
  create: async (data: { email: string; password: string; name: string; role?: string; permissions?: string[] }) => {
    const response = await api.post('/staff', data);
    return response.data?.data ?? response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/staff/${id}`);
  },
};

// AI API (Page Editor module - requires page_editor permission)
export const aiAPI = {
  generateImage: async (prompt: string, context?: Record<string, unknown>) => {
    const response = await api.post('/ai/generate-image', { prompt, context });
    const data = response.data;
    if (data?.success && data.url) return data.url;
    return data?.url;
  },
};

// Products API
export const productsAPI = {
  getAll: async (params?: { active?: boolean; search?: string; category?: string; categorySlug?: string; attributes?: string | object; page?: number; limit?: number }) => {
    // Handle attributes parameter - if it's an object, stringify it
    const queryParams: any = { ...params };
    if (queryParams.attributes && typeof queryParams.attributes === 'object') {
      queryParams.attributes = JSON.stringify(queryParams.attributes);
    }
    // Backend uses skip-based pagination (not page-based).
    // Convert page → skip so that navigating pages actually works.
    if (queryParams.page !== undefined) {
      const pageNum = parseInt(queryParams.page, 10) || 1;
      const limitNum = parseInt(queryParams.limit, 10) || 20;
      queryParams.skip = (pageNum - 1) * limitNum;
      delete queryParams.page;
    }
    const response = await api.get('/products', { params: queryParams });
    // Backend returns: { success: true, data: products[], count: number }
    // count = number of items on this page (not total). Return as-is.
    return response.data;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/products/:id
    const response = await api.get(`/products/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  /**
   * SKU-level search — one row per VARIATION (the sellable pack), through the
   * shared variation listing (`?expand=variations`), so it resolves exactly what
   * the storefront catalogue does: brand, potency, size, half-words and the
   * store's own SKU, with the exact-SKU match ranked first.
   *
   * Use this wherever an order LINE is being built. `searchAPI.query('product')`
   * resolves the parent product, which for a homeopathy remedy is a family of up
   * to 50+ packs — a line bound to it carries the short family name and the
   * generated `P-…` placeholder SKU instead of what the store stocks and ships.
   *
   * Rows carry `product_id` + `variation_id`, the FULL pack name, the real SKU,
   * prices and stock — everything an order line needs, in one call.
   */
  searchVariations: async (q: string, limit = 10) => {
    if (!q || q.trim().length < 3) return [];
    const response = await api.get('/products', {
      params: { expand: 'variations', group: 'none', search: q.trim(), limit },
    });
    // The interceptor unwraps {success,data} → response.data IS the array.
    const d: any = response.data;
    const rows = Array.isArray(d) ? d : (d?.data ?? []);
    return Array.isArray(rows) ? rows : [];
  },
  getBySlug: async (slug: string) => {
    // Backend route: GET /api/v1/products/slug/:slug
    const response = await api.get(`/products/slug/${slug}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  create: async (data: any) => {
    const response = await api.post('/products', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/products/${id}`, data);
    return response.data;
  },
  // Update ONE variation without re-sending (and re-processing/deleting) the whole
  // variations array — the product-level PUT deletes any variation not in the body,
  // so editing one variant otherwise means posting all 80+, which timed out.
  updateVariation: async (productId: string, variationId: string, data: any) => {
    const response = await api.put(`/products/${productId}/variations/${variationId}`, data);
    return response.data?.data ?? response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },
  duplicate: async (id: string) => {
    // Backend route: GET /api/v1/products/:id/duplicate
    // Get prefilled data for duplication (doesn't create product)
    const response = await api.get(`/products/${id}/duplicate`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  /**
   * POST /api/v1/products/:id/duplicate — CREATES an inactive standalone copy
   * (columns + categories + tags + attribute links + product-level B2B slabs,
   * NO variation rows). Optional body: { name?, sku?, joinGroupId?,
   * attributeValue? } — with joinGroupId the copy is inserted into that
   * variant group with the given attributeValue. Returns the created product
   * (interceptor already unwrapped {success,data}).
   */
  duplicateAsVariant: async (id: string, body?: { name?: string; sku?: string; joinGroupId?: string; attributeValue?: string }) => {
    const response = await api.post(`/products/${id}/duplicate`, body || {});
    const d = response.data;
    return d?.data && d?.success ? d.data : (d?.data ?? d);
  },
  generateContent: async (id: string, sectionId: string, prompt?: string) => {
    // Backend route: POST /api/v1/products/:id/generate-content
    // Body: { sectionId: string, prompt?: string }
    const response = await api.post(`/products/${id}/generate-content`, {
      sectionId,
      ...(prompt && { prompt }),
    });
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  generateField: async (
    id: string,
    sectionId: string,
    fieldType: 'text' | 'image',
    fieldPath: string,
    options?: {
      contextProductId?: string;
      contextSectionId?: string;
      customPrompt?: string;
    }
  ) => {
    const response = await api.post(`/products/${id}/generate-field`, {
      sectionId,
      fieldType,
      fieldPath,
      ...options,
    });
    return response.data;
  },
  getAllSkus: async (): Promise<Array<{ _id: string; sku: string }>> => {
    const response = await api.get('/products/skus');
    const data = response.data;
    const list = data?.data || data || [];
    return (Array.isArray(list) ? list : []).map((p: any) => ({
      _id: String(p._id || p.id || ''),
      sku: String(p.sku || ''),
    })).filter(p => p._id && p.sku);
  },
  exportAll: async (): Promise<void> => {
    // Use native fetch + ReadableStream so the browser pipes the response
    // directly to disk without ever holding the full CSV in JS heap.
    const token = localStorage.getItem('admin_token');
    const tenantApiKey = getTenantApiKey();
    const url = `${API_URL}/products/export`;

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantApiKey) headers['x-api-key'] = tenantApiKey;

    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Export failed: ${resp.status} ${resp.statusText}`);

    // Stream the response body into a Blob without reading it all at once in JS
    const reader = resp.body!.getReader();
    const chunks: ArrayBuffer[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
    }

    const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
    const date = new Date().toISOString().split('T')[0];
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `products-all-${date}.csv`;
    a.click();
    URL.revokeObjectURL(objUrl);
  },

  // ── Multi-sheet linked workbook (Products/Variations/A+/Specs/Brands/…) ──
  // `entity` chooses the file: 'catalog' = Products + Variations (+A+/Content Boxes)
  // as ONE file; 'brands' | 'categories' | 'attributes' | 'tags' | 'specgroups'
  // each export their own schema separately; 'all' = one combined workbook.
  downloadWorkbook: async (
    kind: 'export' | 'template' = 'export',
    entity: 'all' | 'catalog' | 'brands' | 'categories' | 'attributes' | 'tags' | 'specgroups' = 'all'
  ): Promise<void> => {
    const path = kind === 'template'
      ? '/products/workbook/template'
      : `/products/workbook/export?entity=${encodeURIComponent(entity)}`;
    const response = await api.get(path, { responseType: 'blob' });
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const date = new Date().toISOString().split('T')[0];
    const stem: Record<string, string> = {
      all: 'catalog', catalog: 'products-and-variations', brands: 'brands',
      categories: 'categories', attributes: 'attributes', tags: 'tags', specgroups: 'spec-groups',
    };
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = kind === 'template' ? 'catalog-import-template.xlsx' : `${stem[entity] ?? 'catalog'}-${date}.xlsx`;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  previewWorkbook: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/products/workbook/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data?.data ?? response.data;
  },
  importWorkbook: async (
    file: File,
    options?: { mapping?: Record<string, any>; mode?: 'upsert' | 'create_only'; dryRun?: boolean }
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (options) form.append('options', JSON.stringify(options));
    const response = await api.post('/products/workbook/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000, // large catalogs can take a while
    });
    return response.data?.data ?? response.data;
  },
};

// Categories API
const safeError = (error: any) => {
  if (!error || !error.response) {
    throw error;
  }
  const { status, data } = error.response;

  // `data.error` is a STRING on some endpoints but a structured object
  // ({ code, message, moduleKey, … }) on module/permission refusals. Using it
  // blindly stringified the object, so users were shown the literal text
  // "[object Object]" instead of the reason. Unwrap the object form first.
  const structured = data?.error && typeof data.error === 'object' ? data.error : null;
  const message =
    data?.message ||
    structured?.message ||
    (typeof data?.error === 'string' ? data.error : null) ||
    data?.errors?.[0]?.msg ||
    'Something went wrong. Please try again.';
  const code = data?.code || structured?.code || data?.errorCode;

  const wrapped = new Error(message) as Error & { status?: number; code?: string };
  wrapped.status = status;
  if (code) {
    wrapped.code = code;
  }
  throw wrapped;
};

export const categoriesAPI = {
  list: async () => {
    try {
      const response = await api.get('/categories');
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: any) => {
    try {
      const response = await api.post('/categories', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: any) => {
    try {
      const response = await api.put(`/categories/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/categories/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Brands API
export const brandsAPI = {
  list: async (params?: { active?: boolean; featured?: boolean }) => {
    try {
      const response = await api.get('/brands', { params });
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getBySlug: async (slug: string) => {
    try {
      const response = await api.get(`/brands/slug/${slug}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getById: async (id: string) => {
    try {
      const response = await api.get(`/brands/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: any) => {
    try {
      const response = await api.post('/brands', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: any) => {
    try {
      const response = await api.put(`/brands/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/brands/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Size Charts API
export const sizeChartsAPI = {
  list: async (params?: { search?: string }) => {
    try {
      const response = await api.get('/size-charts', { params });
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getById: async (id: string | any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.get(`/size-charts/${normalizedId}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: any) => {
    try {
      const response = await api.post('/size-charts', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string | any, data: any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.put(`/size-charts/${normalizedId}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string | any) => {
    try {
      const normalizedId = typeof id === 'string' ? id.trim() : (id?.toString?.() || String(id));
      const response = await api.delete(`/size-charts/${normalizedId}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

export const attributesAPI = {
  list: async (params?: { isActive?: boolean }) => {
    try {
      const response = await api.get('/attributes', { params });
      // Response format: { success: true, data: [...] } or array
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) {
        return data.data;
      }
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error: any) {
      console.error('Failed to fetch attributes:', error);
      safeError(error);
      return [];
    }
  },
  getBySlug: async (slug: string) => {
    try {
      // Backend route: GET /api/v1/attributes/:slug
      const response = await api.get(`/attributes/${slug}`);
      // Response format: { success: true, data: {...} }
      const data = response.data;
      if (data?.success && data.data) {
        return data.data;
      }
      return data?.data || data;
    } catch (error: any) {
      safeError(error);
    }
  },
  getById: async (id: string) => {
    try {
      // Backend route: GET /api/v1/attributes/:id (using ID, not slug)
      const response = await api.get(`/attributes/${id}`);
      // Response format: { success: true, data: {...} }
      const data = response.data;
      if (data?.success && data.data) {
        return data.data;
      }
      return data?.data || data;
    } catch (error: any) {
      safeError(error);
    }
  },
  create: async (data: {
    name: string;
    slug?: string;
    type: 'text' | 'color' | 'image' | 'select';
    chartType?: 'none' | 'size' | 'color' | 'measurement' | 'table';
    description?: string;
    imageUrl?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      const response = await api.post('/attributes', data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (id: string, data: {
    name?: string;
    slug?: string;
    type?: 'text' | 'color' | 'image' | 'select';
    chartType?: 'none' | 'size' | 'color' | 'measurement' | 'table';
    description?: string;
    imageUrl?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      const response = await api.put(`/attributes/${id}`, data);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/attributes/${id}`);
      return response.data;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Attribute Values API - Uses existing backend routes: /attributes/:id/values
export const attributeValuesAPI = {
  // Get values by attribute slug (public endpoint)
  // Backend route: GET /api/v1/attributes/:slug/values
  getByAttributeSlug: async (attributeSlug: string, params?: { isActive?: boolean }) => {
    try {
      const queryParams: any = {};
      if (params?.isActive !== undefined) {
        queryParams.isActive = params.isActive;
      }
      const response = await api.get(`/attributes/${attributeSlug}/values`, { params: queryParams });
      // Response format: { success: true, data: [...] } or array
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) {
        return data.data;
      }
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error: any) {
      console.error('Failed to fetch attribute values:', error);
      safeError(error);
      return [];
    }
  },
  // Get values by attribute ID (for admin - needs to find attribute first)
  getAll: async (params?: { attributeId?: string | any; isActive?: boolean }) => {
    try {
      // Backend doesn't have direct /attribute-values endpoint
      // We need to get attribute slug first, then use getByAttributeSlug
      if (!params?.attributeId) {
        throw new Error('attributeId is required');
      }

      // Normalize attributeId to string (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      if (typeof params.attributeId === 'string') {
        normalizedAttributeId = params.attributeId.trim();
      } else if (params.attributeId && typeof params.attributeId === 'object') {
        // Handle MongoDB ObjectId objects (buffer or object with toString)
        if (params.attributeId.toString && typeof params.attributeId.toString === 'function') {
          normalizedAttributeId = params.attributeId.toString();
        } else if (params.attributeId._id) {
          normalizedAttributeId = String(params.attributeId._id);
        } else if (params.attributeId.id) {
          normalizedAttributeId = String(params.attributeId.id);
        } else {
          throw new Error('Invalid attributeId format');
        }
      } else {
        normalizedAttributeId = String(params.attributeId);
      }

      if (!normalizedAttributeId) {
        throw new Error('Invalid attributeId');
      }

      // Get attribute to find its slug
      const attrResponse = await attributesAPI.getById(normalizedAttributeId);
      const attribute = attrResponse?.data || attrResponse;
      if (!attribute || !attribute.slug) {
        throw new Error('Attribute not found or missing slug');
      }

      // Use the slug-based endpoint
      return await attributeValuesAPI.getByAttributeSlug(attribute.slug, { isActive: params.isActive });
    } catch (error: any) {
      console.error('Failed to fetch attribute values:', error);
      safeError(error);
      return [];
    }
  },
  create: async (attributeId: string | any, data: {
    name: string;
    slug?: string;
    value?: string;
    description?: string;
    imageUrl?: string;
    sizeChart?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      // Normalize attributeId to string (handles MongoDB ObjectId buffers/objects)
      let normalizedId: string;
      if (typeof attributeId === 'string') {
        normalizedId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedId = String(attributeId.id);
        } else {
          normalizedId = String(attributeId);
        }
      } else {
        normalizedId = String(attributeId);
      }

      // Backend route: POST /api/v1/attributes/:id/values
      const response = await api.post(`/attributes/${normalizedId}/values`, data);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
    } catch (error: any) {
      safeError(error);
    }
  },
  update: async (attributeId: string | any, valueId: string | any, data: {
    name?: string;
    slug?: string;
    value?: string;
    description?: string;
    imageUrl?: string;
    sizeChart?: string;
    isActive?: boolean;
    order?: number;
  }) => {
    try {
      // Normalize IDs to strings (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      let normalizedValueId: string;

      // Normalize attributeId
      if (typeof attributeId === 'string') {
        normalizedAttributeId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedAttributeId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedAttributeId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedAttributeId = String(attributeId.id);
        } else {
          normalizedAttributeId = String(attributeId);
        }
      } else {
        normalizedAttributeId = String(attributeId);
      }

      // Normalize valueId
      if (typeof valueId === 'string') {
        normalizedValueId = valueId.trim();
      } else if (valueId && typeof valueId === 'object') {
        if (valueId.toString && typeof valueId.toString === 'function') {
          normalizedValueId = valueId.toString();
        } else if (valueId._id) {
          normalizedValueId = String(valueId._id);
        } else if (valueId.id) {
          normalizedValueId = String(valueId.id);
        } else {
          normalizedValueId = String(valueId);
        }
      } else {
        normalizedValueId = String(valueId);
      }

      // Backend route: PUT /api/v1/attributes/:id/values/:valueId
      const response = await api.put(`/attributes/${normalizedAttributeId}/values/${normalizedValueId}`, data);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
    } catch (error: any) {
      safeError(error);
    }
  },
  delete: async (attributeId: string | any, valueId: string | any) => {
    try {
      // Normalize IDs to strings (handles MongoDB ObjectId buffers/objects)
      let normalizedAttributeId: string;
      let normalizedValueId: string;

      // Normalize attributeId
      if (typeof attributeId === 'string') {
        normalizedAttributeId = attributeId.trim();
      } else if (attributeId && typeof attributeId === 'object') {
        if (attributeId.toString && typeof attributeId.toString === 'function') {
          normalizedAttributeId = attributeId.toString();
        } else if (attributeId._id) {
          normalizedAttributeId = String(attributeId._id);
        } else if (attributeId.id) {
          normalizedAttributeId = String(attributeId.id);
        } else {
          normalizedAttributeId = String(attributeId);
        }
      } else {
        normalizedAttributeId = String(attributeId);
      }

      // Normalize valueId
      if (typeof valueId === 'string') {
        normalizedValueId = valueId.trim();
      } else if (valueId && typeof valueId === 'object') {
        if (valueId.toString && typeof valueId.toString === 'function') {
          normalizedValueId = valueId.toString();
        } else if (valueId._id) {
          normalizedValueId = String(valueId._id);
        } else if (valueId.id) {
          normalizedValueId = String(valueId.id);
        } else {
          normalizedValueId = String(valueId);
        }
      } else {
        normalizedValueId = String(valueId);
      }

      // Backend route: DELETE /api/v1/attributes/:id/values/:valueId
      const response = await api.delete(`/attributes/${normalizedAttributeId}/values/${normalizedValueId}`);
      // Response format: { success: true, message: "...", data: {...} }
      const responseData = response.data;
      if (responseData?.success && responseData.data) {
        return responseData.data;
      }
      return responseData?.data || responseData;
    } catch (error: any) {
      safeError(error);
    }
  },
};

// Vendors API
export const vendorsAPI = {
  list: async (params?: { status?: string; is_active?: boolean; search?: string }) => {
    try {
      const response = await api.get('/vendors', { params });
      const data = response.data;
      if (data?.success && Array.isArray(data.data)) return data.data;
      return Array.isArray(data) ? data : (data?.data || []);
    } catch (error: any) { safeError(error); return []; }
  },
  getById: async (id: string) => {
    try {
      const response = await api.get(`/vendors/${id}`);
      const data = response.data;
      return data?.data || data;
    } catch (error: any) { safeError(error); }
  },
  create: async (data: {
    business_name: string; slug: string; gst_number?: string; pan_number?: string;
    bank_details?: Record<string, any>; commission_pct?: number; logo_url?: string;
    is_active?: boolean; customer_id?: string;
  }) => {
    try {
      const response = await api.post('/vendors', data);
      return response.data?.data || response.data;
    } catch (error: any) { safeError(error); }
  },
  update: async (id: string, data: Partial<{
    business_name: string; slug: string; gst_number: string; pan_number: string;
    bank_details: Record<string, any>; commission_pct: number; logo_url: string;
    is_active: boolean;
  }>) => {
    try {
      const response = await api.put(`/vendors/${id}`, data);
      return response.data?.data || response.data;
    } catch (error: any) { safeError(error); }
  },
  updateStatus: async (id: string, status: 'pending' | 'approved' | 'suspended' | 'rejected') => {
    try {
      const response = await api.put(`/vendors/${id}/status`, { status });
      return response.data?.data || response.data;
    } catch (error: any) { safeError(error); }
  },
  delete: async (id: string) => {
    try {
      const response = await api.delete(`/vendors/${id}`);
      return response.data;
    } catch (error: any) { safeError(error); }
  },
  // Mint a vendor-portal share link (no login for the supplier). Returns { token, path }.
  mintPortalToken: async (id: string, opts?: { label?: string; expiresAt?: string | null }) => {
    const response = await api.post(`/vendors/${id}/portal-token`, opts || {});
    return response.data?.data || response.data;
  },
};

// Orders API
export const ordersAPI = {
  /** CSV export — all filtered orders, or just `ids` when a selection was made. */
  exportCsv: async (params?: { ids?: string[]; status?: string; from?: string; to?: string }) => {
    const response = await api.get('/orders/export/csv', {
      params: { ...params, ids: params?.ids?.length ? params.ids.join(',') : undefined },
      responseType: 'blob',
    });
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  /** Manually create a sales order (prices resolve server-side; B2B applies when customerId given). */
  createManual: async (data: {
    items: Array<{ productId: string; variationId?: string; sku?: string; quantity: number; unitPrice?: number; discountPercent?: number }>;
    shippingAddress: Record<string, any>;
    billingAddress?: Record<string, any>;
    customerId?: string;
    paymentMethod: 'cod' | 'prepaid';
    shippingCost?: number;
    discount?: number;
    discountReason?: string;
    gstin?: string;
    notes?: string;
    hold?: boolean;
  }) => {
    const response = await api.post('/orders/manual', data);
    return response.data;
  },
  /** Replace order lines while payment is pending (repriced server-side). */
  updateItems: async (id: string, data: {
    items: Array<{ productId: string; variationId?: string; sku?: string; quantity: number; unitPrice?: number; discountPercent?: number }>;
    discount?: number; discountReason?: string; shippingCost?: number;
  }) => {
    const response = await api.put(`/orders/${id}/items`, data);
    return response.data;
  },
  /**
   * Patch order columns directly (`PUT /orders/:id`). The server whitelists
   * real columns, so send SNAKE_CASE column names — `shipping_address`,
   * `billing_address`. Used by the order address editor.
   */
  update: async (id: string, data: Record<string, any>) => {
    const response = await api.put(`/orders/${id}`, data);
    return response.data;
  },
  /** Shareable review-and-pay link for the order (Shopify-style). */
  getPayLink: async (id: string) => {
    const response = await api.get(`/orders/${id}/pay-link`);
    return response.data;
  },
  getAll: async (params?: {
    orderId?: string;
    mobileNumber?: string;
    status?: string;
    order_type?: 'retail' | 'b2b';
    limit?: number;
    page?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => {
    const response = await api.get('/orders', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },
  // "Confirmed" and "Completed" are just status transitions handled by /status
  // below — there never was a dedicated /confirm or /complete route.
  updateStatus: async (id: string, status: string, notes?: string) => {
    const response = await api.put(`/orders/${id}/status`, { status, notes });
    return response.data;
  },
  /** Confirm a pending order (shorthand for the pending → confirmed transition). */
  confirmOrder: async (id: string, notes?: string) => {
    const response = await api.put(`/orders/${id}/status`, { status: 'confirmed', notes });
    return response.data;
  },
  /** Park an order that needs attention without cancelling it. */
  holdOrder: async (id: string, reason?: string) => {
    const response = await api.put(`/orders/${id}/status`, { status: 'on_hold', notes: reason });
    return response.data;
  },
  /** Mark/clear "needs attention" — independent of order status. */
  setFlag: async (id: string, flagged: boolean, reason?: string) => {
    const response = await api.put(`/orders/${id}/flag`, { flagged, reason });
    return response.data;
  },
  // Timestamped, append-only notes log — replaces the old single-overwrite
  // updateNotes, which called a PUT /:id/notes route that never existed.
  addNote: async (id: string, text: string) => {
    const response = await api.post(`/orders/${id}/notes`, { text });
    return response.data;
  },
  sendEmail: async (id: string, type: 'confirmation' | 'update' | 'invoice', options?: { subject?: string; content?: string }) => {
    const payload: any = { type };
    if (options?.subject) payload.subject = options.subject;
    if (options?.content) payload.content = options.content;
    const response = await api.post(`/orders/${id}/send-email`, payload);
    return response.data;
  },
  getTimeline: async (id: string) => {
    const response = await api.get(`/orders/${id}/timeline`);
    return response.data;
  },
  cancelOrder: async (id: string, reason?: string) => {
    const response = await api.post(`/orders/${id}/cancel`, { reason });
    return response.data;
  },
  exportOrders: async (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const response = await api.get('/orders/export', { params, responseType: 'blob' });
    return response.data;
  },
};

// Payments API
export const paymentsAPI = {
  verifyRazorpay: async (orderId: string, paymentId: string) => {
    const response = await api.post('/payments/razorpay/verify-admin', { orderId, paymentId });
    return response.data;
  },
  verifyUPI: async (orderId: string, upiPaymentId: string, notes?: string) => {
    const response = await api.post('/payments/upi/verify', { orderId, upiPaymentId, notes });
    return response.data;
  },
  verifyManual: async (orderId: string, notes?: string) => {
    const response = await api.post('/payments/manual/verify', { orderId, notes });
    return response.data;
  },
};

// Upload API (tenant-specific, images optimized server-side)
export const uploadAPI = {
  listFiles: async () => {
    const response = await api.get('/upload/files');
    return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
  },
  deleteFile: async (key: string) => {
    await api.delete('/upload/files', { data: { key } });
  },
  optimizeAll: async () => {
    const response = await api.post('/upload/optimize-all');
    return response.data;
  },
  uploadSingle: async (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('image', file);
    if (folder) {
      formData.append('folder', folder);
    }
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  uploadMultiple: async (files: File[], folder?: string) => {
    const formData = new FormData();
    files.forEach((file) => {
      // Use 'images' field name for both images and videos (backend accepts both)
      // The backend middleware accepts 'images' field for all file types
      formData.append('images', file);
    });
    if (folder) {
      formData.append('folder', folder);
    }
    const response = await api.post('/upload/multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  delete: async (key: string) => {
    const response = await api.delete(`/upload/${encodeURIComponent(key)}`);
    return response.data;
  },
};

// Pages API
export const pagesAPI = {
  getAll: async () => {
    const response = await api.get('/pages/admin/all');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/pages/admin/${id}`);
    return response.data;
  },
  create: async (pageData: any) => {
    const response = await api.post('/pages', pageData);
    return response.data;
  },
  update: async (id: string, pageData: any) => {
    const response = await api.put(`/pages/${id}`, pageData);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/pages/${id}`);
    return response.data;
  },
  getTemplates: async () => {
    const response = await api.get('/pages/templates');
    return response.data;
  },
  getBlockTypes: async () => {
    const response = await api.get('/pages/block-types');
    return response.data;
  },
  generateBlockContent: async (blockType: string, pageTitle?: string, pageDescription?: string, customPrompt?: string, existingData?: any) => {
    const response = await api.post('/pages/generate-block-content', {
      blockType,
      pageTitle,
      pageDescription,
      customPrompt,
      existingData,
    });
    return response.data;
  },
};

export const menusAPI = {
  list: async (params?: { active?: boolean; location?: string }) => {
    const response = await api.get('/menus', { params });
    return response.data?.data || response.data || [];
  },
  getByLocation: async (location: string) => {
    try {
      const response = await api.get(`/menus/location/${location}`);
      return response.data?.data || response.data || null;
    } catch {
      return null;
    }
  },
  create: async (data: any) => {
    const response = await api.post('/menus', data);
    return response.data?.data || response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/menus/${id}`, data);
    return response.data?.data || response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/menus/${id}`);
    return response.data;
  },
};

// ── Reviews API ──────────────────────────────────────────────────────────────
/**
 * Talks to the rebuilt reviews surface (backend/src/routes/reviews.ts).
 *
 * What the previous version got wrong, so it is not reintroduced:
 *   • `approve` called PUT /reviews/:id/approve — the route is POST, so every
 *     approval from the panel 404'd.
 *   • `create` posted multipart/form-data to a JSON endpoint.
 *   • `getProducts` pulled an unpaginated /products for a <select> of a
 *     44k-SKU catalog; product linking is a variation-level typeahead now.
 *   • `generateProfileImage` called a route that does not exist.
 *
 * Reads use `r.data?.data ?? r.data` because this axios instance UNWRAPS
 * `{success,data}` (COMMON_MISTAKES #30/#40) — never write `r.data.data` alone.
 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'spam' | 'hidden';

export interface ReviewMedia {
  type: 'image' | 'video';
  url: string;
  thumb?: string;
  mime?: string;
  bytes?: number;
  duration?: number;
}

export interface AdminReview {
  id: string;
  product_id: string;
  variation_id?: string | null;
  product_name?: string;
  product_slug?: string;
  product_sku?: string;
  product_image?: string;
  variation_name?: string;
  rating: number;
  title?: string | null;
  review: string;
  description?: string | null;
  link?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_email_masked?: string | null;
  customer_image?: string | null;
  has_customer_account?: boolean;
  media: ReviewMedia[];
  media_count: number;
  images?: string[];
  status: ReviewStatus;
  moderation_reason?: string | null;
  moderated_at?: string | null;
  auto_flags?: string[];
  source?: string;
  is_verified: boolean;
  is_featured: boolean;
  helpful_count: number;
  not_helpful_count: number;
  reported_count: number;
  reply_body?: string | null;
  reply_by?: string | null;
  reply_at?: string | null;
  reply_published?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ReviewListParams {
  status?: string;
  rating?: string;
  productId?: string;
  search?: string;
  source?: string;
  hasMedia?: boolean;
  hasVideo?: boolean;
  verified?: boolean;
  featured?: boolean;
  reported?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewCounts {
  pending: number; approved: number; rejected: number; spam: number; hidden: number;
  reported: number; with_media: number; total: number; avg_rating: number;
}

const rows = <T = any>(r: any): T[] => {
  const d = r?.data?.data ?? r?.data;
  return Array.isArray(d) ? d : [];
};

export const reviewsAPI = {
  /** Moderation queue — returns rows AND an accurate total for real pagination. */
  list: async (params: ReviewListParams = {}): Promise<{ rows: AdminReview[]; total: number }> => {
    const r = await api.get('/reviews/admin', { params });
    return { rows: rows<AdminReview>(r), total: Number(r.data?.total ?? r.data?.pagination?.total ?? 0) };
  },

  counts: async (): Promise<ReviewCounts> => {
    const r = await api.get('/reviews/admin/counts');
    return (r.data?.data ?? r.data ?? {}) as ReviewCounts;
  },

  getById: async (id: string): Promise<AdminReview> => {
    const r = await api.get(`/reviews/${id}`);
    return (r.data?.data ?? r.data) as AdminReview;
  },

  reports: async (id: string) => {
    const r = await api.get(`/reviews/admin/${id}/reports`);
    return rows(r);
  },

  /** Admin-authored review (seeding / testimonials / migrating a platform). */
  create: async (data: Record<string, any>): Promise<AdminReview> => {
    const r = await api.post('/reviews/admin', data);
    return (r.data?.data ?? r.data) as AdminReview;
  },

  update: async (id: string, data: Record<string, any>): Promise<AdminReview> => {
    const r = await api.put(`/reviews/${id}`, data);
    return (r.data?.data ?? r.data) as AdminReview;
  },

  delete: async (id: string) => (await api.delete(`/reviews/${id}`)).data,

  /** Bulk moderation — the queue's primary action. One request for N reviews. */
  moderate: async (ids: string[], status: ReviewStatus, reason?: string) => {
    const r = await api.post('/reviews/admin/moderate', { ids, status, reason });
    return r.data;
  },

  feature: async (ids: string[], featured: boolean) =>
    (await api.post('/reviews/admin/feature', { ids, featured })).data,

  bulkDelete: async (ids: string[]) =>
    (await api.post('/reviews/admin/bulk-delete', { ids })).data,

  reply: async (id: string, body: string | null, published = true) =>
    (await api.post(`/reviews/${id}/reply`, { body, published })).data,

  resolveReports: async (id: string, status: 'reviewed' | 'dismissed' = 'reviewed') =>
    (await api.post(`/reviews/admin/${id}/resolve-reports`, { status })).data,

  /** Server-side import: ONE request for the whole file, with per-row results. */
  import: async (importRows: Record<string, any>[]) => {
    const r = await api.post('/reviews/admin/import', { rows: importRows });
    return (r.data?.data ?? r.data) as {
      imported: number; failed: number; errors: Array<{ row: number; reason: string }>;
    };
  },

  /** Full CSV export honouring the current filters — not just the visible page. */
  exportCsv: async (params: ReviewListParams = {}) => {
    const r = await api.get('/reviews/admin/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([r.data as any], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Upload one review image or video; returns the stored asset descriptor. */
  uploadMedia: async (file: File): Promise<ReviewMedia> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post('/reviews/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return (r.data?.data ?? r.data) as ReviewMedia;
  },
};

// ─── Product Q&A ─────────────────────────────────────────────────────────────
// Backend: routes/productQuestions.ts (module `product_qa`). Reading the inbox
// needs content.read, acting needs content.manage, deleting content.delete.

export type QuestionStatus = 'pending' | 'published' | 'rejected';

export interface AdminQuestion {
  id: string;
  product_id: string;
  variation_id?: string | null;
  customer_id?: string | null;
  asker_name: string;
  asker_email?: string | null;
  question: string;
  answer?: string | null;
  answered_by?: string | null;
  answered_at?: string | null;
  status: QuestionStatus;
  is_published: boolean;
  auto_flags?: string[];
  helpful_count: number;
  verified_buyer?: boolean;
  product_name?: string;
  product_slug?: string;
  variation_name?: string | null;
  variation_sku?: string | null;
  created_at: string;
}

export interface QuestionCounts {
  total: number; pending: number; published: number; rejected: number; unanswered: number;
}

export interface QuestionListParams {
  status?: QuestionStatus;
  product_id?: string;
  unanswered?: boolean;
  limit?: number;
  offset?: number;
}

export const productQuestionsAPI = {
  /** Moderation inbox — rows + an accurate total for real pagination. */
  list: async (params: QuestionListParams = {}): Promise<{ rows: AdminQuestion[]; total: number }> => {
    const r = await api.get('/product-questions/admin', {
      // The API reads `unanswered=true` as a string flag; sending false would
      // still be truthy server-side, so omit it entirely when off.
      params: { ...params, unanswered: params.unanswered ? 'true' : undefined },
    });
    return { rows: rows<AdminQuestion>(r), total: Number(r.data?.total ?? 0) };
  },

  counts: async (): Promise<QuestionCounts> => {
    const r = await api.get('/product-questions/admin/counts');
    return (r.data?.data ?? r.data ?? {}) as QuestionCounts;
  },

  /** Answer publishes by default — answering IS the moderation act. */
  answer: async (id: string, answer: string, opts: { answeredBy?: string; publish?: boolean } = {}) =>
    (await api.post(`/product-questions/${id}/answer`, {
      answer, answered_by: opts.answeredBy, publish: opts.publish !== false,
    })).data,

  publish: async (id: string, published = true) =>
    (await api.put(`/product-questions/${id}/publish`, { published })).data,

  reject: async (id: string) => (await api.put(`/product-questions/${id}/reject`, {})).data,

  /** Bulk moderation: one request for N questions. */
  bulk: async (ids: string[], action: 'publish' | 'reject' | 'pending' | 'delete') =>
    (await api.post('/product-questions/admin/bulk', { ids, action })).data,

  delete: async (id: string) => (await api.delete(`/product-questions/${id}`)).data,
};

// ─── Wishlist (merchandising) ────────────────────────────────────────────────
// Backend: routes/wishlist.ts /admin/* (module `wishlist`, permission reports.read).
// A wishlist is the CUSTOMER's own list — the panel reads demand, it never edits
// someone's saved items.

export interface WishlistSummary {
  saves: number; customers: number; products: number; skus: number;
  saves_7d: number; saves_30d: number; out_of_stock_saves: number;
}

export interface WishlistDemandRow {
  product_id: string;
  variation_id: string | null;
  name: string;
  sku: string | null;
  image?: string | null;
  stock: number;
  selling_price: number | null;
  mrp: number | null;
  product_name: string;
  product_slug: string;
  wish_count: number;
  customers: number;
  first_added: string;
  last_added: string;
}

export interface WishlistSaverRow {
  customer_id: string;
  items: number;
  products: number;
  saved_value: number;
  out_of_stock: number;
  first_added: string;
  last_added: string;
  /** Attached only when the caller ALSO holds customers.read — see the route. */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface WishlistDemandParams {
  grain?: 'sku' | 'product';
  stock?: 'all' | 'out' | 'low' | 'in';
  days?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export const wishlistAdminAPI = {
  summary: async (): Promise<WishlistSummary> => {
    const r = await api.get('/wishlist/admin/summary');
    return (r.data?.data ?? r.data ?? {}) as WishlistSummary;
  },

  demand: async (params: WishlistDemandParams = {}): Promise<{ rows: WishlistDemandRow[]; total: number }> => {
    const r = await api.get('/wishlist/admin/demand', { params });
    return { rows: rows<WishlistDemandRow>(r), total: Number(r.data?.total ?? 0) };
  },

  savers: async (limit = 25): Promise<WishlistSaverRow[]> => {
    const r = await api.get('/wishlist/admin/customers', { params: { limit } });
    return rows<WishlistSaverRow>(r);
  },

  /** The CURRENT filter as CSV — a restock or win-back list, not just this page. */
  exportCsv: async (params: WishlistDemandParams = {}) => {
    const r = await api.get('/wishlist/admin/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([r.data as any], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `wishlist-demand-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Shipping API
/** Truthful config state for one courier account. */
export interface ShippingProviderStatus {
  provider: string;
  label: string;
  configured: boolean;
  source: 'store' | 'platform' | 'env' | 'none';
  account_name: string | null;
  missing: string[];
  applies_markup: boolean;
  bills_wallet: boolean;
  details: Record<string, string | undefined>;
}

export const shippingAPI = {
  /** Which carriers are actually configured, and whose account is in effect. */
  getProviderStatus: async (): Promise<ShippingProviderStatus[]> => {
    const response = await api.get('/shipping/providers/status');
    const raw = response.data;
    return Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  },
  /** Live credential check against the carrier. */
  testConnection: async (provider: string): Promise<{ ok: boolean; message: string; source?: string }> => {
    const response = await api.post(`/shipping/${provider}/test-connection`);
    const raw = response.data;
    return raw?.data ?? raw ?? { ok: false, message: 'No response' };
  },
  /**
   * Issue the AWB for a Shiprocket order that was created but never dispatched
   * (empty carrier wallet, courier outage). Re-running the full booking would
   * create a SECOND order at Shiprocket — this finishes the existing one.
   */
  assignAwb: async (shipmentId: string, courierId?: number): Promise<{ awbCode?: string; courierName?: string }> => {
    const response = await api.post('/shipping/shiprocket/assign-awb', { shipmentId, courierId });
    const raw = response.data;
    return raw?.data ?? raw ?? {};
  },
  /** The store's own courier credentials (secrets never returned). */
  getProviderCredentials: async (): Promise<{
    shiprocket: { isEnabled: boolean; email: string; apiUrl: string; pickupLocation: string; channelId: string; passwordSet: boolean; webhookTokenSet: boolean; requireSignedWebhook: boolean };
    delhivery: { isEnabled: boolean; apiUrl: string; apiTokenSet: boolean };
    slug?: string | null;
  }> => {
    const response = await api.get('/shipping/providers/credentials');
    const raw = response.data;
    return raw?.data ?? raw;
  },
  /** Save the store's own courier credentials. Blank secret = keep existing. */
  saveProviderCredentials: async (data: {
    shiprocket?: { isEnabled?: boolean; email?: string; password?: string; apiUrl?: string; pickupLocation?: string; channelId?: string; requireSignedWebhook?: boolean };
    delhivery?: { isEnabled?: boolean; apiToken?: string; apiUrl?: string };
  }) => {
    const response = await api.put('/shipping/providers/credentials', data);
    return response.data?.data ?? response.data;
  },
  /**
   * Generate (or rotate) the Shiprocket webhook secret. The full token is returned
   * ONCE — show it, let the owner copy it into Shiprocket, then it's only "set".
   */
  generateWebhookSecret: async (): Promise<{ webhookToken: string }> => {
    const response = await api.post('/shipping/providers/shiprocket/webhook-secret');
    return response.data?.data ?? response.data;
  },
  /** Shiprocket sales channels — orders are filed under one of these. */
  getShiprocketChannels: async (): Promise<{
    configured: boolean;
    selected: string | null;
    selected_valid: boolean | null;
    channels: Array<{ id: string; name: string; type?: string; status?: string }>;
    message?: string;
  }> => {
    const response = await api.get('/shipping/shiprocket/channels');
    const raw = response.data;
    const d = raw?.data ?? raw;
    return {
      configured: !!d?.configured,
      selected: d?.selected ?? null,
      selected_valid: d?.selected_valid ?? null,
      channels: Array.isArray(d?.channels) ? d.channels : [],
      message: d?.message,
    };
  },
  /** Pickup locations registered on the carrier account, for warehouse mapping. */
  getPickupLocations: async (provider: string): Promise<{
    configured: boolean; supported: boolean; source?: string;
    locations: Array<{ code: string; name: string; address?: string; city?: string; state?: string; pincode?: string; phone?: string }>;
    message?: string;
  }> => {
    const response = await api.get(`/shipping/${provider}/pickup-locations`);
    const raw = response.data;
    const d = raw?.data ?? raw;
    return {
      configured: !!d?.configured,
      supported: d?.supported !== false,
      source: d?.source,
      locations: Array.isArray(d?.locations) ? d.locations : [],
      message: d?.message,
    };
  },
  createShipment: async (orderId: string, options?: {
    warehouseId?: string;
    shippingProvider?: 'shiprocket' | 'delhivery' | 'manual';
    trackingId?: string;
    carrierName?: string;
    trackingUrl?: string;
    storeId?: string;
  }) => {
    // Clean up the payload - remove undefined/null/empty string values
    const payload: any = { orderId };
    if (options) {
      Object.keys(options).forEach(key => {
        const value = (options as any)[key];
        if (value !== undefined && value !== null && value !== '') {
          payload[key] = value;
        }
      });
    }
    const response = await api.post('/shipping/create-shipment', payload);
    return response.data;
  },
  checkServiceability: async (pincode: string, weight?: number, cod?: boolean) => {
    const response = await api.post('/shipping/shiprocket/check-serviceability', {
      pincode,
      weight,
      cod,
    });
    return response.data;
  },
  trackShipment: async (trackingId: string, provider?: 'shiprocket' | 'delhivery') => {
    const response = await api.get(`/shipping/track/${trackingId}${provider ? `?provider=${provider}` : ''}`);
    return response.data;
  },
  getProviders: async () => {
    const response = await api.get('/shipping/providers');
    return response.data;
  },
  getWarehouses: async () => {
    const response = await api.get('/shipping/warehouses');
    return response.data;
  },
  getCourierRates: async (
    orderId: string,
    warehouseId?: string,
    options?: { weight?: number; length?: number; breadth?: number; height?: number }
  ) => {
    const params = new URLSearchParams({ orderId });
    if (warehouseId) {
      const warehouseIdStr = typeof warehouseId === 'object'
        ? (warehouseId as any)?._id || String(warehouseId)
        : String(warehouseId);
      if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
        params.append('warehouseId', warehouseIdStr);
      }
    }
    if (options?.weight && options.weight > 0) params.append('weight', String(options.weight));
    if (options?.length && options.length > 0) params.append('length', String(options.length));
    if (options?.breadth && options.breadth > 0) params.append('breadth', String(options.breadth));
    if (options?.height && options.height > 0) params.append('height', String(options.height));
    const response = await api.get(`/shipping/shiprocket/rates?${params.toString()}`);
    return response.data;
  },
  getDelhiveryRates: async (
    orderId: string,
    warehouseId?: string,
    serviceType?: 'express' | 'surface',
    options?: { weight?: number; length?: number; breadth?: number; height?: number }
  ) => {
    const params = new URLSearchParams({ orderId });
    if (warehouseId) {
      const warehouseIdStr = typeof warehouseId === 'object'
        ? (warehouseId as any)?._id || String(warehouseId)
        : String(warehouseId);
      if (warehouseIdStr && warehouseIdStr !== 'undefined' && warehouseIdStr !== '[object Object]') {
        params.append('warehouseId', warehouseIdStr);
      }
    }
    if (serviceType) params.append('serviceType', serviceType);
    if (options?.weight && options.weight > 0) params.append('weight', String(options.weight));
    if (options?.length && options.length > 0) params.append('length', String(options.length));
    if (options?.breadth && options.breadth > 0) params.append('breadth', String(options.breadth));
    if (options?.height && options.height > 0) params.append('height', String(options.height));
    const response = await api.get(`/shipping/delhivery/rates?${params.toString()}`);
    return response.data;
  },
};

// Shipments API
export const shipmentsAPI = {
  getAll: async (params?: {
    status?: string;
    tab?: string;
    warehouseId?: string;
    shippingProvider?: 'shiprocket' | 'delhivery' | 'manual';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/shipments', { params });
    return response.data;
  },
  getPendingOrders: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get('/shipments/pending-orders', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/shipments/${id}`);
    return response.data;
  },
  create: async (data: {
    orderIds: string[];
    warehouseId: string;
    shippingProvider: 'shiprocket' | 'delhivery' | 'manual';
    notes?: string;
    weight?: number;
    length?: number;
    breadth?: number;
    height?: number;
    courierCompanyId?: number;
    delhiveryServiceType?: 'express' | 'surface';
    manualTrackingId?: string;
    manualCarrierName?: string;
    manualTrackingUrl?: string;
  }) => {
    const response = await api.post('/shipments', data);
    return response.data;
  },
  addOrders: async (id: string, orderIds: string[]) => {
    const response = await api.post(`/shipments/${id}/add-orders`, { orderIds });
    return response.data;
  },
  schedulePickup: async (id: string, data: {
    scheduledDate: string;
    pickupTimeSlot?: string;
    notes?: string;
  }) => {
    const response = await api.post(`/shipments/${id}/schedule-pickup`, data);
    return response.data;
  },
  generateAWB: async (id: string) => {
    const response = await api.post(`/shipments/${id}/generate-awb`);
    return response.data;
  },
  updateStatus: async (id: string, status: string, notes?: string) => {
    const response = await api.put(`/shipments/${id}/status`, { status, notes });
    return response.data;
  },
  fetchStatusUpdates: async () => {
    const response = await api.post('/shipments/fetch-status-updates');
    return response.data;
  },
  ndrReattempt: async (id: string) => {
    const response = await api.post(`/shipments/${id}/ndr-reattempt`);
    return response.data;
  },
  ndrUpdatePhone: async (id: string, phone: string) => {
    const response = await api.post(`/shipments/${id}/ndr-update-phone`, { phone });
    return response.data;
  },
  downloadLabel: async (id: string, pdfSize: '4R' | 'A4' = '4R') => {
    try {
      const response = await api.get(`/shipments/${id}/download-label`, {
        params: { pdf_size: pdfSize },
        responseType: 'blob',
        headers: { 'Accept': 'application/pdf' },
      });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `label-${id}-${pdfSize}.pdf`
        : `label-${id}-${pdfSize}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download label error:', error);
      throw error;
    }
  },
  downloadPickupReceipt: async (id: string) => {
    try {
      const response = await api.get(`/shipments/${id}/download-pickup-receipt`, {
        responseType: 'blob',
        headers: { 'Accept': 'application/pdf' },
      });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `pickup-receipt-${id}.pdf`
        : `pickup-receipt-${id}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download pickup receipt error:', error);
      throw error;
    }
  },
  downloadManifest: async (id: string) => {
    try {
      const response = await api.get(`/shipments/${id}/download-manifest`, {
        responseType: 'blob',
        headers: { 'Accept': 'application/pdf' },
      });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || `manifest-${id}.pdf`
        : `manifest-${id}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download manifest error:', error);
      throw error;
    }
  },
  syncStatusAll: async () => {
    const response = await api.post('/shipments/fetch-status-updates');
    return response.data;
  },
};

// Warehouses API
export const warehousesAPI = {
  getAll: async () => {
    const response = await api.get('/warehouses');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/warehouses/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/warehouses', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/warehouses/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/warehouses/${id}`);
    return response.data;
  },
  linkStores: async (id: string, storeIndices: number[]) => {
    const response = await api.post(`/warehouses/${id}/link-stores`, { storeIndices });
    return response.data;
  },
  createFromStore: async (storeIndex: number, options?: { code?: string; contact?: { name?: string; phone?: string; email?: string } }) => {
    const response = await api.post('/warehouses/create-from-store', {
      storeIndex,
      ...options,
    });
    return response.data;
  },
  syncWithStore: async (id: string, options?: { storeIndex?: number; syncAddress?: boolean; syncContact?: boolean }) => {
    const response = await api.post(`/warehouses/${id}/sync-with-store`, options || {});
    return response.data;
  },
};

export const couponsAPI = {
  getAll: async () => {
    // Admin route - get all coupons (including inactive)
    const response = await api.get('/coupons/admin');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/coupons/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/coupons', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/coupons/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/coupons/${id}`);
    return response.data;
  },
};

export const smsTemplatesAPI = {
  list: async (channel: 'sms' | 'whatsapp' = 'sms') => {
    const response = await api.get('/sms-templates', { params: { channel } });
    return response.data;
  },
  catalog: async () => {
    const response = await api.get('/sms-templates/catalog');
    return response.data;
  },
  update: async (
    event: string,
    data: {
      content: string;
      templateId?: string;
      isEnabled?: boolean;
      variablesHint?: string[];
      channel?: 'sms' | 'whatsapp';
    }
  ) => {
    const response = await api.put(`/sms-templates/${event}`, data);
    return response.data;
  },
};

export const smsConfigAPI = {
  get: async () => {
    const response = await api.get('/sms-config');
    return response.data;
  },
  update: async (data: {
    baseUrl?: string;
    route?: string;
    senderId?: string;
    isEnabled?: boolean;
    apiKey?: string;
  }) => {
    const response = await api.put('/sms-config', data);
    return response.data;
  },
  /** Verify the saved key against the provider; returns balance/credits. */
  test: async () => {
    try {
      const response = await api.post('/sms-config/test', {});
      return { ok: true, ...(response.data?.data ?? response.data ?? {}) };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || 'Connection test failed' };
    }
  },
  /** DLT-approved templates registered on the provider account. */
  getProviderTemplates: async () => {
    try {
      const response = await api.get('/sms-config/provider-templates');
      const raw = response.data;
      return { ok: true, templates: Array.isArray(raw) ? raw : (raw?.data ?? []) };
    } catch (e: any) {
      return { ok: false, templates: [], message: e?.response?.data?.message || 'Could not load provider templates' };
    }
  },
  sendTest: async (data: { phoneNumber: string; message?: string; event?: string }) => {
    try {
      const response = await api.post('/sms-config/test-sms', data);
      return { ok: true, ...(response.data?.data ?? {}), message: response.data?.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || 'Test SMS failed' };
    }
  },
  /** Preview which registered DLT template would back each action. */
  previewAutoMap: async () => {
    try {
      const response = await api.get('/sms-config/auto-map');
      const raw = response.data;
      return { ok: true, proposals: Array.isArray(raw) ? raw : (raw?.data ?? []) };
    } catch (e: any) {
      return { ok: false, proposals: [], message: e?.response?.data?.message || 'Auto-map failed' };
    }
  },
  /** Apply the mapping so real sends use the DLT-approved wording. */
  applyAutoMap: async (events?: string[]) => {
    try {
      const response = await api.post('/sms-config/auto-map', events?.length ? { events } : {});
      return { ok: true, message: response.data?.message, ...(response.data?.data ?? {}) };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || 'Auto-map failed' };
    }
  },
};

// ─── ORDER NUMBERING (serialized order numbers: retail/bulk + B2B) ───────────
export interface OrderNumberingScope {
  prefix: string;
  suffix: string;
  padding: number;
  start: number;
  reset: 'never' | 'yearly' | 'monthly' | 'daily';
  format: string;
  enabled: boolean;
}

// ─── INVOICES (config/customiser, PDF, multi-channel send) ───────────────────
export const invoicesAPI = {
  /** Config + which required legal fields are still blank. */
  getConfig: async () => {
    const response = await api.get('/invoices/config');
    return response.data;
  },
  updateConfig: async (config: any) => {
    const response = await api.put('/invoices/config', config);
    return response.data;
  },
  /** Live PDF preview of UNSAVED settings (consumes no invoice number). */
  preview: async (config: any) => {
    const response = await api.post('/invoices/preview', { config }, { responseType: 'blob' });
    return response.data as Blob;
  },
  /** What the invoice will contain — for review before sending. */
  getForOrder: async (orderId: string) => {
    const response = await api.get(`/invoices/order/${orderId}`);
    return response.data;
  },
  downloadPdf: async (orderId: string) => {
    const response = await api.get(`/invoices/order/${orderId}/pdf`, { responseType: 'blob' });
    return response.data as Blob;
  },
  /** Send on one or more channels: email (PDF attached), whatsapp, sms. */
  send: async (orderId: string, opts: {
    channels: Array<'email' | 'whatsapp' | 'sms'>;
    email?: string; phone?: string; subject?: string; message?: string;
    invoiceUrl?: string; force?: boolean;
  }) => {
    const response = await api.post(`/invoices/order/${orderId}/send`, opts);
    return response.data;
  },

  /**
   * Record the billing details the store produced OUTSIDE this software: the
   * invoice number its own accounting package issued, the invoice date, and who
   * sold the order. Sending `invoiceNumber: ''` clears it and hands numbering
   * back to the system series.
   */
  saveDetails: async (orderId: string, body: { invoiceNumber?: string; invoiceDate?: string; salesperson?: string }) => {
    const response = await api.put(`/invoices/order/${orderId}/details`, body);
    return response.data;
  },

  /** Upload the store's OWN invoice PDF — it replaces the generated one. */
  uploadManual: async (orderId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const response = await api.post(`/invoices/order/${orderId}/manual`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** Remove the uploaded PDF; the generated invoice applies again. */
  removeManual: async (orderId: string) => {
    const response = await api.delete(`/invoices/order/${orderId}/manual`);
    return response.data;
  },
};

export const orderNumberingAPI = {
  get: async () => {
    const response = await api.get('/settings/order-numbering');
    return response.data;
  },
  update: async (config: { retail: OrderNumberingScope; b2b: OrderNumberingScope; separateB2bSeries?: boolean }) => {
    const response = await api.put('/settings/order-numbering', config);
    return response.data;
  },
  /** Live preview for unsaved form values. */
  preview: async (scope: 'retail' | 'b2b', config: OrderNumberingScope) => {
    const response = await api.post('/settings/order-numbering/preview', { scope, config });
    return response.data;
  },
};

export const gstSettingsAPI = {
  get: async () => {
    const response = await api.get('/settings/gst');
    return response.data;
  },
  update: async (data: {
    showPriceIncludingGst?: boolean;
    showGstOnCheckout?: boolean;
  }) => {
    const response = await api.put('/settings/gst', data);
    return response.data;
  },
};

export const bundlesAPI = {
  list: async (params?: { active?: boolean; search?: string }) => {
    const response = await api.get('/product-bundles', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/product-bundles/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/product-bundles', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/product-bundles/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/product-bundles/${id}`);
    return response.data;
  },
};

// Product Quantity-Based Bundles API (managed via product-bundles endpoint)
export const productQuantityBundlesAPI = {
  get: async (productId: string) => {
    const response = await api.get(`/product-bundles/product/${productId}/quantity`);
    return response.data;
  },
  update: async (productId: string, bundles: any[]) => {
    const response = await api.put(`/product-bundles/product/${productId}/quantity`, { bundles });
    return response.data;
  },
  delete: async (productId: string) => {
    const response = await api.delete(`/product-bundles/product/${productId}/quantity`);
    return response.data;
  },
};

export const cartsAPI = {
  /** Store-configurable cart timings (abandonment threshold, nudge cadence). */
  getSettings: async () => {
    const response = await api.get('/carts/admin/settings');
    return response.data?.data ?? response.data;
  },
  updateSettings: async (data: {
    abandonmentMinutes?: number; recoveryDelayHours?: number;
    maxRecoveryAttempts?: number; recoveryGapHours?: number;
  }) => {
    const response = await api.put('/carts/admin/settings', data);
    return response.data?.data ?? response.data;
  },
  listAdmin: async (params?: { status?: string; search?: string }) => {
    const response = await api.get('/carts/admin', { params });
    return response.data;
  },
  exportAdmin: async () => {
    const response = await api.get('/carts/admin/export');
    return response.data;
  },
  getDetail: async (cartId: string) => {
    const response = await api.get(`/carts/admin/${cartId}`);
    return response.data;
  },
  sendRecovery: async (cartId: string) => {
    const response = await api.post(`/carts/${cartId}/send-recovery`);
    return response.data;
  },
  addNote: async (cartId: string, text: string) => {
    const response = await api.post(`/carts/admin/${cartId}/notes`, { text });
    return response.data;
  },
  /** Attach an existing active coupon, or mint a one-off `RECOVER-XXXXXX` code. */
  applyDiscount: async (
    cartId: string,
    body:
      | { mode: 'existing'; couponCode: string }
      | { mode: 'generate'; type: 'percentage' | 'fixed'; value: number; maxDiscount?: number; expiresInDays?: number }
  ) => {
    const response = await api.post(`/carts/admin/${cartId}/discount`, body);
    return response.data;
  },
  removeDiscount: async (cartId: string) => {
    const response = await api.delete(`/carts/admin/${cartId}/discount`);
    return response.data;
  },
};

// Cross-store customer journey/behaviour (public.customer_activity, store-scoped
// reads) — powers the journey timeline on cart-recovery and order pages.
export const journeyAPI = {
  customerJourney: async (customerId: string, limit = 100) => {
    const response = await api.get(`/analytics/customers/${customerId}/journey`, { params: { limit } });
    return response.data;
  },
  customerBehavior: async (customerId: string) => {
    const response = await api.get(`/analytics/customers/${customerId}/behavior`);
    return response.data;
  },
};

// Store Customers API — the shoppers who registered/ordered on THIS store.
// (Distinct from usersAPI, which is admin/staff accounts.)
export const customersAPI = {
  getAll: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/customers', { params });
    return response.data;
  },
  getById: async (customerId: string) => {
    const response = await api.get(`/customers/${customerId}`);
    return response.data?.data ?? response.data;
  },
  // Mint a customer-portal share link (no login for the B2B buyer). Returns { token, path }.
  mintPortalToken: async (customerId: string, opts?: { label?: string; expiresAt?: string | null }) => {
    const response = await api.post(`/customers/${customerId}/portal-token`, opts || {});
    return response.data?.data || response.data;
  },
};

// Users API
export const usersAPI = {
  getAll: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }) => {
    const response = await api.get('/users', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },
  // NOTE: /users is the STAFF collection (backend guards it with
  // staff.read/manage/delete) and exposes only list/get/create/update/delete.
  // The `/users/:id/orders`, `/addresses`, `/browsed-products` and
  // `/reset-password` methods that used to live here called routes that have
  // never existed — every one 404'd. Customer-shaped data comes from
  // `customersAPI.getById`, which returns profile + orders + addresses + totals
  // in a single request.
};

// Logs API
export const logsAPI = {
  getLogs: async (params?: {
    type?: 'error' | 'combined' | 'exceptions' | 'rejections';
    date?: string;
    limit?: number;
    level?: 'error' | 'warn' | 'info' | 'http' | 'debug';
  }) => {
    const response = await api.get('/logs', { params });
    // Backend returns: { success: true, data: { logs: [], total: number, file: string, exists: boolean, filters: {} } }
    // Return as-is, let frontend handle normalization
    return response.data;
  },
  getLogFiles: async () => {
    const response = await api.get('/logs/files');
    // Backend returns: { success: true, data: { files: [], filesByType: {}, total: number } }
    // Return as-is, let frontend handle normalization
    return response.data;
  },
};

// FAQs API
export const faqsAPI = {
  getAll: async (params?: { category?: string; categories?: string; active?: boolean }) => {
    const response = await api.get('/faqs', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/faqs/${id}`);
    return response.data;
  },
  create: async (data: {
    question: string;
    answer: string;
    category: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => {
    const response = await api.post('/faqs', data);
    return response.data;
  },
  update: async (id: string, data: {
    question?: string;
    answer?: string;
    category?: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/faqs/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/faqs/${id}`);
    return response.data;
  },
};

export const faqGroupsAPI = {
  getAll: async (params?: { active?: boolean }) => {
    const response = await api.get('/faq-groups', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/faq-groups/${id}`);
    return response.data;
  },
  create: async (data: {
    name: string;
    description?: string;
    items?: { question: string; answer: string; order?: number }[];
    isActive?: boolean;
  }) => {
    const response = await api.post('/faq-groups', data);
    return response.data;
  },
  update: async (id: string, data: {
    name?: string;
    description?: string;
    items?: { question: string; answer: string; order?: number }[];
    isActive?: boolean;
  }) => {
    const response = await api.put(`/faq-groups/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/faq-groups/${id}`);
    return response.data;
  },
};

// Specifications API
export const specificationsAPI = {
  getAll: async (params?: { productId?: string; shared?: boolean; active?: boolean }) => {
    // Backend route: GET /api/v1/specifications
    const response = await api.get('/specifications', { params });
    // Response format: { success: true, data: [...], count: number }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/specifications/:id
    const response = await api.get(`/specifications/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getByProductId: async (productId: string) => {
    // Backend route: GET /api/v1/specifications/product/:productId
    const response = await api.get(`/specifications/product/${productId}`);
    // Response format: { success: true, data: { type: "inline"|"linked", sections: [...] } }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  create: async (data: {
    name: string;
    slug?: string;
    productId?: string;
    sections: Array<{
      heading: string;
      items: Array<{ key: string; value: string }>;
    }>;
    isActive?: boolean;
  }) => {
    // Backend route: POST /api/v1/specifications
    const response = await api.post('/specifications', data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  update: async (id: string, data: {
    name?: string;
    slug?: string;
    sections?: Array<{
      heading: string;
      items: Array<{ key: string; value: string }>;
    }>;
    isActive?: boolean;
  }) => {
    // Backend route: PUT /api/v1/specifications/:id
    const response = await api.put(`/specifications/${id}`, data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  delete: async (id: string) => {
    // Backend route: DELETE /api/v1/specifications/:id
    const response = await api.delete(`/specifications/${id}`);
    // Response format: { success: true, message: "..." }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  assignToProduct: async (id: string, productId: string) => {
    // Backend route: POST /api/v1/specifications/:id/assign-to-product
    const response = await api.post(`/specifications/${id}/assign-to-product`, { productId });
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
};

// Tags API
export const tagsAPI = {
  getAll: async (params?: { active?: boolean; search?: string; limit?: number }) => {
    // Backend route: GET /api/v1/tags
    const response = await api.get('/tags', { params });
    // Response format: { success: true, data: [...], count: number }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getById: async (id: string) => {
    // Backend route: GET /api/v1/tags/:id
    const response = await api.get(`/tags/${id}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  getBySlug: async (slug: string) => {
    // Backend route: GET /api/v1/tags/slug/:slug
    const response = await api.get(`/tags/slug/${slug}`);
    // Response format: { success: true, data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  create: async (data: {
    name: string;
    slug?: string;
    description?: string;
    isActive?: boolean;
  }) => {
    // Backend route: POST /api/v1/tags
    const response = await api.post('/tags', data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  bulkCreate: async (names: string[]) => {
    // Backend route: POST /api/v1/tags/bulk-create
    const response = await api.post('/tags/bulk-create', { names });
    // Response format: { success: true, message: "...", data: [...] }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  update: async (id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }) => {
    // Backend route: PUT /api/v1/tags/:id
    const response = await api.put(`/tags/${id}`, data);
    // Response format: { success: true, message: "...", data: {...} }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
  delete: async (id: string) => {
    // Backend route: DELETE /api/v1/tags/:id
    const response = await api.delete(`/tags/${id}`);
    // Response format: { success: true, message: "..." }
    const responseData = response.data;
    if (responseData?.success && responseData.data) {
      return responseData.data;
    }
    return responseData?.data || responseData;
  },
};

// ─── MODULES API ────────────────────────────────────────────────────────────
export const modulesAPI = {
  list: async () => {
    const response = await api.get('/modules');
    return response.data;
  },
  getRegistry: async () => {
    const response = await api.get('/modules/registry');
    return response.data;
  },
  toggle: async (key: string, enabled: boolean) => {
    const response = await api.put(`/modules/${key}`, { enabled });
    return response.data;
  },
  updateConfig: async (key: string, enabled: boolean, config: any) => {
    const response = await api.put(`/modules/${key}`, { enabled, config });
    return response.data;
  },
  bulkUpdate: async (modules: Array<{ key: string; enabled: boolean }>) => {
    const response = await api.post('/modules/bulk', { modules });
    return response.data;
  },
  initialize: async () => {
    const response = await api.post('/modules/initialize');
    return response.data;
  },
  storeTypes: async () => {
    const response = await api.get('/modules/store-types');
    return response.data;
  },
  applyStoreType: async (type: string) => {
    const response = await api.post('/modules/apply-store-type', { type });
    return response.data;
  },
};

// ─── BILLING API ─────────────────────────────────────────────────────────────
export const billingAPI = {
  getInvoices: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get('/billing/invoices', { params });
    return response.data;
  },
  getInvoiceById: async (id: string) => {
    const response = await api.get(`/billing/invoices/${id}`);
    return response.data;
  },
  getUsage: async (params?: { period?: 'current' | 'last' }) => {
    const response = await api.get('/billing/usage', { params });
    return response.data;
  },
  initiatePayment: async (invoiceId: string) => {
    const response = await api.post(`/billing/pay/${invoiceId}/initiate`);
    return response.data;
  },
  verifyPayment: async (invoiceId: string, data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
    const response = await api.post(`/billing/pay/${invoiceId}/verify`, data);
    return response.data;
  },
};

// ─── B2B API ──────────────────────────────────────────────────────────────────
export const b2bAPI = {
  // ── Applications inbox (storefront /b2b-register lands here) ──
  getApplications: async (status?: 'pending' | 'approved' | 'rejected') => {
    const response = await api.get('/b2b/applications', { params: status ? { status } : {} });
    return response.data;
  },
  approveApplication: async (id: string, data: { tier?: string; credit_limit?: number; credit_days?: number; note?: string }) => {
    const response = await api.post(`/b2b/applications/${id}/approve`, data);
    return response.data;
  },
  rejectApplication: async (id: string, note?: string) => {
    const response = await api.post(`/b2b/applications/${id}/reject`, { note });
    return response.data;
  },
  // ── Store B2B settings — tiers/plans + default discount (pricing P4/P5) ──
  getSettings: async () => {
    const response = await api.get('/b2b/settings');
    return response.data;
  },
  updateSettings: async (data: any) => {
    const response = await api.put('/b2b/settings', data);
    return response.data;
  },
  // ── Bulk / quantity slabs (pricing P2/P3) ──
  getSlabs: async (productId?: string) => {
    const response = await api.get('/b2b/slabs', { params: productId ? { product_id: productId } : {} });
    return response.data;
  },
  createSlab: async (data: any) => {
    const response = await api.post('/b2b/slabs', data);
    return response.data;
  },
  updateSlab: async (id: string, data: any) => {
    const response = await api.put(`/b2b/slabs/${id}`, data);
    return response.data;
  },
  deleteSlab: async (id: string) => {
    const response = await api.delete(`/b2b/slabs/${id}`);
    return response.data;
  },
  // ── B2B customers = approved applicants (these are the real "accounts") ──
  getB2BCustomers: async () => {
    const response = await api.get('/b2b/customers');
    return response.data;
  },
  getCustomer: async (customerId: string) => {
    const response = await api.get(`/b2b/customers/${customerId}`);
    return response.data;
  },
  updateCustomer: async (customerId: string, data: {
    is_b2b?: boolean; b2b_tier?: string | null; gstin?: string | null;
    credit_limit?: number; credit_days?: number; price_list_id?: string | null;
  }) => {
    const response = await api.put(`/b2b/customers/${customerId}`, data);
    return response.data;
  },
  // Staff-initiated onboarding — no storefront application needed. Either
  // promotes an existing customer (customerId, or found by phone) or creates a
  // brand-new one for a phone-order lead. See POST /b2b/customers.
  createCustomer: async (data: {
    customerId?: string;
    phone?: string; dialCode?: string; email?: string; name?: string;
    companyName?: string; gstin?: string;
    tier?: string; credit_limit?: number; credit_days?: number; price_list_id?: string;
  }) => {
    const response = await api.post('/b2b/customers', data);
    return response.data;
  },
  // ── Negotiated per-account contracts (pricing P1 — highest) ──
  getProductContracts: async (productId: string) => {
    const response = await api.get(`/b2b/contracts/product/${productId}`);
    return response.data;
  },
  // Contracts negotiated for ONE customer, across products.
  getContracts: async (customerId: string) => {
    const response = await api.get(`/b2b/contracts/${customerId}`);
    return response.data;
  },
  createContract: async (data: {
    customer_id: string; product_id: string; variation_id?: string | null;
    unit_price: number; valid_from?: string | null; valid_until?: string | null;
  }) => {
    const response = await api.post('/b2b/contracts', data);
    return response.data;
  },
  deleteContract: async (id: string) => {
    const response = await api.delete(`/b2b/contracts/${id}`);
    return response.data;
  },
  // Price Lists
  getPriceLists: async () => {
    const response = await api.get('/b2b/price-lists');
    return response.data;
  },
  createPriceList: async (data: any) => {
    const response = await api.post('/b2b/price-lists', data);
    return response.data;
  },
  updatePriceList: async (id: string, data: any) => {
    const response = await api.put(`/b2b/price-lists/${id}`, data);
    return response.data;
  },
  deletePriceList: async (id: string) => {
    const response = await api.delete(`/b2b/price-lists/${id}`);
    return response.data;
  },
  // Price Rules
  getPriceRules: async (priceListId: string) => {
    const response = await api.get(`/b2b/price-lists/${priceListId}/rules`);
    return response.data;
  },
  createPriceRule: async (priceListId: string, data: any) => {
    const response = await api.post(`/b2b/price-lists/${priceListId}/rules`, data);
    return response.data;
  },
  updatePriceRule: async (priceListId: string, ruleId: string, data: any) => {
    const response = await api.put(`/b2b/price-lists/${priceListId}/rules/${ruleId}`, data);
    return response.data;
  },
  deletePriceRule: async (priceListId: string, ruleId: string) => {
    const response = await api.delete(`/b2b/price-lists/${priceListId}/rules/${ruleId}`);
    return response.data;
  },
  // MOQ Rules
  getMOQRules: async (priceListId: string) => {
    const response = await api.get(`/b2b/price-lists/${priceListId}/moq`);
    return response.data;
  },
  createMOQRule: async (priceListId: string, data: any) => {
    const response = await api.post(`/b2b/price-lists/${priceListId}/moq`, data);
    return response.data;
  },
  updateMOQRule: async (priceListId: string, ruleId: string, data: any) => {
    const response = await api.put(`/b2b/price-lists/${priceListId}/moq/${ruleId}`, data);
    return response.data;
  },
  deleteMOQRule: async (priceListId: string, ruleId: string) => {
    const response = await api.delete(`/b2b/price-lists/${priceListId}/moq/${ruleId}`);
    return response.data;
  },
};

// ─── MARKETING API ────────────────────────────────────────────────────────────
export const marketingAPI = {
  getCampaigns: async (params?: { page?: number; limit?: number; status?: string; channel?: string }) => {
    const response = await api.get('/marketing/campaigns', { params });
    return response.data;
  },
  getCampaignById: async (id: string) => {
    const response = await api.get(`/marketing/campaigns/${id}`);
    return response.data;
  },
  createCampaign: async (data: any) => {
    const response = await api.post('/marketing/campaigns', data);
    return response.data;
  },
  updateCampaign: async (id: string, data: any) => {
    const response = await api.put(`/marketing/campaigns/${id}`, data);
    return response.data;
  },
  deleteCampaign: async (id: string) => {
    const response = await api.delete(`/marketing/campaigns/${id}`);
    return response.data;
  },
  sendCampaign: async (id: string) => {
    const response = await api.post(`/marketing/campaigns/${id}/send`);
    return response.data;
  },
  getAbandonedCarts: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get('/marketing/abandoned-carts', { params });
    return response.data;
  },
  recoverAbandonedCart: async (id: string, channel: 'whatsapp' | 'sms' | 'email') => {
    const response = await api.post(`/marketing/abandoned-carts/recover/${id}`, { channel });
    return response.data;
  },
};

// ─── CRM API ──────────────────────────────────────────────────────────────────
export const crmAPI = {
  getContacts: async (params?: { page?: number; limit?: number; search?: string; tag?: string }) => {
    const response = await api.get('/crm/contacts', { params });
    return response.data;
  },
  getContactById: async (id: string) => {
    const response = await api.get(`/crm/contacts/${id}`);
    return response.data;
  },
  createContact: async (data: any) => {
    const response = await api.post('/crm/contacts', data);
    return response.data;
  },
  updateContact: async (id: string, data: any) => {
    const response = await api.put(`/crm/contacts/${id}`, data);
    return response.data;
  },
  deleteContact: async (id: string) => {
    const response = await api.delete(`/crm/contacts/${id}`);
    return response.data;
  },
  getInteractions: async (contactId: string) => {
    const response = await api.get(`/crm/contacts/${contactId}/interactions`);
    return response.data;
  },
  addInteraction: async (contactId: string, data: any) => {
    const response = await api.post(`/crm/contacts/${contactId}/interactions`, data);
    return response.data;
  },
};

// ─── PACKAGE BOXES API ────────────────────────────────────────────────────────
export const packageBoxesAPI = {
  getAll: async () => {
    const response = await api.get('/packages');
    return response.data;
  },
  create: async (data: { name: string; length: number; breadth: number; height: number; weight?: number; description?: string }) => {
    const response = await api.post('/packages', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/packages/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/packages/${id}`);
    return response.data;
  },
};

// ─── INVENTORY API ────────────────────────────────────────────────────────────
export const inventoryAPI = {
  list: async (params?: { page?: number; limit?: number; search?: string; lowStock?: boolean; outOfStock?: boolean }) => {
    const response = await api.get('/inventory', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/inventory/${id}`);
    return response.data;
  },
  updateStock: async (id: string, data: { stock?: number; variationIndex?: number; variationStock?: number; reason?: string }) => {
    const response = await api.put(`/inventory/${id}`, data);
    return response.data;
  },
  bulkUpdate: async (updates: Array<{ productId: string; stock: number }>) => {
    const response = await api.post('/inventory/bulk-update', { updates });
    return response.data;
  },
  getLowStock: async (threshold?: number) => {
    const response = await api.get('/inventory/low-stock', { params: { threshold } });
    return response.data;
  },
  getHistory: async (productId: string) => {
    const response = await api.get(`/inventory/${productId}/history`);
    return response.data;
  },
  getValuation: async () => {
    const response = await api.get('/inventory/valuation');
    return response.data;
  },
  exportExcel: async (search?: string) => {
    const response = await api.get('/inventory/export', { params: search ? { search } : {}, responseType: 'blob' });
    return response.data as Blob;
  },
  downloadTemplate: async () => {
    const response = await api.get('/inventory/template', { responseType: 'blob' });
    return response.data as Blob;
  },
  importExcel: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/inventory/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return response.data;
  },
};

// ─── TAX RULES API ────────────────────────────────────────────────────────────
export const taxRulesAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/tax');
      const raw = response.data;
      const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      // Normalise PG `id` (UUID) and Mongo `_id` to both fields so consumers work regardless
      return list.map((r: any) => ({
        ...r,
        _id: r._id || r.id || '',
        id:  r.id  || r._id || '',
      }));
    } catch {
      return [];
    }
  },
  create: async (data: any) => {
    const response = await api.post('/tax', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/tax/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/tax/${id}`);
    return response.data;
  },
};

// ─── MANUFACTURERS API ───────────────────────────────────────────────────────
export const manufacturersAPI = {
  getAll: async (params?: { active?: boolean }) => {
    try {
      const response = await api.get('/manufacturers', { params });
      const raw = response.data;
      const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return list.map((r: any) => ({ ...r, _id: r._id || r.id || '', id: r.id || r._id || '' }));
    } catch { return []; }
  },
  create: async (data: any) => {
    const response = await api.post('/manufacturers', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/manufacturers/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/manufacturers/${id}`);
    return response.data;
  },
};

// ─── RETURN POLICIES API ─────────────────────────────────────────────────────
export const returnPoliciesAPI = {
  // Return policies CRUD is nested under the tax router: /api/v1/tax/return-policies
  getAll: async (params?: { active?: boolean }) => {
    try {
      const response = await api.get('/tax/return-policies', { params });
      const raw = response.data;
      const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return list.map((r: any) => ({ ...r, _id: r._id || r.id || '', id: r.id || r._id || '' }));
    } catch { return []; }
  },
  create: async (data: any) => {
    const response = await api.post('/tax/return-policies', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/tax/return-policies/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/tax/return-policies/${id}`);
    return response.data;
  },
};

// ─── UNIFIED SEARCH API ──────────────────────────────────────────────────────
// The ONE way to search entities server-side (product, category, attribute,
// variation, brand, tag, blog_post, manufacturer…). Min 3 chars. Extend backend
// db/queries/search.ts to add entity types.
export interface SearchResult { id: string; label: string; sublabel?: string; type: string }
export const searchAPI = {
  MIN_LENGTH: 3,
  query: async (type: string, q: string, limit = 10): Promise<SearchResult[]> => {
    if (!q || q.trim().length < 3) return [];
    try {
      const response = await api.get('/search', { params: { type, q: q.trim(), limit } });
      // The response interceptor unwraps {success,data} → response.data IS the
      // array; `response.data.data` was always undefined and search came back
      // empty everywhere it was used.
      const d: any = response.data;
      const data = Array.isArray(d) ? d : d?.data;
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  },
  queryMany: async (types: string[], q: string, limit = 10): Promise<Record<string, SearchResult[]>> => {
    if (!q || q.trim().length < 3) return {};
    try {
      const response = await api.get('/search', { params: { type: types.join(','), q: q.trim(), limit } });
      const d: any = response.data;
      return (d && !Array.isArray(d) && typeof d === 'object' && !('success' in d) ? d : d?.data) || {};
    } catch { return {}; }
  },
};

// ─── PRODUCT CONFIG API (store-vertical compliance sections) ─────────────────
export const productConfigAPI = {
  get: async () => {
    try {
      const response = await api.get('/settings/product-config');
      return response.data?.data || null;
    } catch { return null; }
  },
};

// ─── PAYMENT RULES API ───────────────────────────────────────────────────────
export const paymentRulesAPI = {
  getAll: async () => {
    const response = await api.get('/payment/rules');
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/payment/rules', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/payment/rules/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/payment/rules/${id}`);
    return response.data;
  },
};

// ─── SHIPPING ZONES API ──────────────────────────────────────────────────────
export const shippingZonesAPI = {
  // Admin always sees everything (active + inactive) so it can manage both.
  getAll: async () => {
    const response = await api.get('/shipping/zones', { params: { active: 'false' } });
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/shipping/zones', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/shipping/zones/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/shipping/zones/${id}`);
    return response.data;
  },
};

// ─── PINCODE ZONES API ───────────────────────────────────────────────────────
export const pincodeZonesAPI = {
  getAll: async (params?: { page?: number; per_page?: number }) => {
    const response = await api.get('/shipping/pincode-zones', { params });
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/shipping/pincode-zones', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/shipping/pincode-zones/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/shipping/pincode-zones/${id}`);
    return response.data;
  },
};

// ─── VARIANT GROUPS API ──────────────────────────────────────────────────────
export const variantGroupsAPI = {
  getAll: async () => {
    const response = await api.get('/variant-groups');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/variant-groups/${id}`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/variant-groups', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/variant-groups/${id}`, data);
    return response.data;
  },
  /** POST /variant-groups/:id/members — { productId, attributeValue?, isDefault? } */
  addMember: async (id: string, data: { productId: string; attributeValue?: string; isDefault?: boolean }) => {
    const response = await api.post(`/variant-groups/${id}/members`, data);
    return response.data;
  },
  /** DELETE /variant-groups/:id/members/:productId — removes the membership only. */
  removeMember: async (id: string, productId: string) => {
    const response = await api.delete(`/variant-groups/${id}/members/${productId}`);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/variant-groups/${id}`);
    return response.data;
  },
};

// ─── SEO API ─────────────────────────────────────────────────────────────────
export const seoAPI = {
  get: async () => {
    const response = await api.get('/seo/settings');
    return response.data;
  },
  update: async (data: any) => {
    const response = await api.put('/seo/settings', data);
    return response.data;
  },
  getRedirects: async () => {
    const response = await api.get('/seo/redirects');
    return response.data;
  },
  createRedirect: async (data: { from: string; to: string }) => {
    const response = await api.post('/seo/redirects', data);
    return response.data;
  },
  // The backend keys redirects by their `from` path, not an id.
  deleteRedirect: async (from: string) => {
    const response = await api.delete('/seo/redirects', { data: { from } });
    return response.data;
  },
  // Fetched (not linked directly) so the tenant's x-api-key header resolves the
  // correct store — a bare <a href> would hit the platform API with no tenant context.
  getSitemap: async () => {
    const response = await api.get('/seo/sitemap.xml', { responseType: 'text', transformResponse: (d) => d });
    return response.data as string;
  },
  getRobots: async () => {
    const response = await api.get('/seo/robots.txt', { responseType: 'text', transformResponse: (d) => d });
    return response.data as string;
  },
};

// ─── PLUGINS API ─────────────────────────────────────────────────────────────
export const pluginsAPI = {
  getAll: async () => {
    const response = await api.get('/plugins');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/plugins/${id}`);
    return response.data;
  },
  install: async (data: { name: string; source?: string }) => {
    const response = await api.post('/plugins', data);
    return response.data;
  },
  toggle: async (id: string, enabled: boolean) => {
    const response = await api.put(`/plugins/${id}/toggle`, { enabled });
    return response.data;
  },
  configure: async (id: string, config: Record<string, any>) => {
    const response = await api.put(`/plugins/${id}/config`, { config });
    return response.data;
  },
  uninstall: async (id: string) => {
    const response = await api.delete(`/plugins/${id}`);
    return response.data;
  },
};

// ─── CONTACTS API (contact-form submissions inbox) ───────────────────────────
export const contactsAPI = {
  getAll: async (params?: { status?: string; is_read?: boolean; limit?: number; offset?: number }) => {
    const response = await api.get('/contact', { params });
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/contact/stats');
    return response.data?.data ?? response.data ?? null;
  },
  getById: async (id: string) => {
    const response = await api.get(`/contact/${id}`);
    return response.data;
  },
  reply: async (id: string, reply_message: string) => {
    const response = await api.put(`/contact/${id}/reply`, { reply_message });
    return response.data;
  },
  updateStatus: async (id: string, status: 'new' | 'read' | 'replied' | 'closed') => {
    const response = await api.put(`/contact/${id}/status`, { status });
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/contact/${id}`);
    return response.data;
  },
};

// ─── TRUST BADGES API ────────────────────────────────────────────────────────
export const trustBadgesAPI = {
  // Admin always sees everything (active + inactive) so it can manage both.
  getAll: async () => {
    const response = await api.get('/trust-badges', { params: { active: 'false' } });
    return response.data;
  },
  create: async (data: { title: string; description?: string; image_url?: string; display_order?: number; is_active?: boolean }) => {
    const response = await api.post('/trust-badges', data);
    return response.data;
  },
  update: async (id: string, data: Partial<{ title: string; description: string; image_url: string; display_order: number; is_active: boolean }>) => {
    const response = await api.put(`/trust-badges/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/trust-badges/${id}`);
    return response.data;
  },
};

// ─── WALLET API ──────────────────────────────────────────────────────────────
// Store's own prepaid wallet — funds metered services (SMS/WhatsApp/email/
// shipping/AI). Recharging by hand is intentionally not exposed here; only a
// Razorpay top-up. See backend/src/routes/wallet.ts.
export const walletAPI = {
  get: async () => {
    const response = await api.get('/wallet');
    return response.data;
  },
  getTransactions: async (params?: { page?: number; limit?: number; category?: string; direction?: 'credit' | 'debit' }) => {
    const response = await api.get('/wallet/transactions', { params });
    return response.data;
  },
  getPricing: async () => {
    const response = await api.get('/wallet/pricing');
    return response.data;
  },
  createRechargeOrder: async (amount: number) => {
    const response = await api.post('/wallet/recharge/create-order', { amount });
    return response.data;
  },
  verifyRecharge: async (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
    const response = await api.post('/wallet/recharge/verify', payload);
    return response.data;
  },
  getRecharges: async () => {
    const response = await api.get('/wallet/recharges');
    return response.data;
  },
};

export const packagesAPI = {
  getAll: async () => {
    const response = await api.get('/packages');
    return response.data;
  },
};

export const bannersAPI = {
  getAll: async (params?: { active?: boolean; location?: string }) => {
    const response = await api.get('/banners', { params });
    return response.data?.data || response.data || [];
  },
  getById: async (id: string) => {
    const response = await api.get(`/banners/${id}`);
    return response.data?.data || response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/banners', data);
    return response.data?.data || response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/banners/${id}`, data);
    return response.data?.data || response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/banners/${id}`);
    return response.data;
  },
};

// ── Multi-Channel Sync (marketplaces + catalog feeds) ─────────────────────────
export const channelsAPI = {
  // Platforms the super admin has enabled for this store
  getPlatforms: async () => {
    try { const r = await api.get('/channels/platforms'); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  // Connections
  getConnections: async () => {
    try { const r = await api.get('/channels/connections'); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  getConnection: async (id: string) => {
    const r = await api.get(`/channels/connections/${id}`); return r.data?.data;
  },
  createConnection: async (payload: any) => {
    const r = await api.post('/channels/connections', payload); return r.data?.data;
  },
  updateConnection: async (id: string, payload: any) => {
    const r = await api.put(`/channels/connections/${id}`, payload); return r.data?.data;
  },
  deleteConnection: async (id: string) => {
    const r = await api.delete(`/channels/connections/${id}`); return r.data;
  },
  testConnection: async (id: string) => {
    const r = await api.post(`/channels/connections/${id}/test`); return r.data?.data;
  },
  syncNow: async (id: string) => {
    const r = await api.post(`/channels/connections/${id}/sync`); return r.data?.data;
  },
  rotateFeedToken: async (id: string) => {
    const r = await api.post(`/channels/connections/${id}/feed-token`); return r.data?.data;
  },
  autoMap: async (connectionId: string) => {
    const r = await api.post(`/channels/connections/${connectionId}/auto-map`); return r.data;
  },
  // Mappings
  getMappings: async (params?: { channelId?: string; productId?: string; variationId?: string }) => {
    try { const r = await api.get('/channels/mappings', { params }); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  createMapping: async (payload: any) => {
    const r = await api.post('/channels/mappings', payload); return r.data?.data;
  },
  updateMapping: async (id: string, payload: any) => {
    const r = await api.put(`/channels/mappings/${id}`, payload); return r.data?.data;
  },
  deleteMapping: async (id: string) => {
    const r = await api.delete(`/channels/mappings/${id}`); return r.data;
  },
  bulkMappings: async (mappings: any[]) => {
    const r = await api.post('/channels/mappings/bulk', { mappings }); return r.data;
  },
  // Logs
  getLogs: async (params?: { channelId?: string; limit?: number }) => {
    try { const r = await api.get('/channels/logs', { params }); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  // ── Custom channels + Excel import ─────────────────────────────────────────
  createCustomChannel: async (name: string, notes?: string) => {
    const r = await api.post('/channels/custom', { name, notes }); return r.data?.data ?? r.data;
  },
  // Step 1: read columns + sample rows + auto-guess + saved match
  importPreview: async (channelId: string, file: File, purpose: 'inventory' | 'orders') => {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    const r = await api.post(`/channels/${channelId}/import/preview`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data?.data ?? r.data;
  },
  // Step 2: apply (dryRun=true → preview counts only; false → writes + saves match)
  importApply: async (
    channelId: string, file: File,
    opts: {
      purpose: 'inventory' | 'orders'; mapping: Record<string, string>; mode: 'set' | 'adjust'; dryRun: boolean;
      /** Default 'atomic' = all-or-nothing (server rejects the file with 422). */
      writeMode?: 'atomic' | 'partial';
    },
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', opts.purpose);
    form.append('mode', opts.mode);
    form.append('dryRun', String(opts.dryRun));
    form.append('mapping', JSON.stringify(opts.mapping));
    // `mode` in the body is the inventory set/adjust switch, so the write mode
    // travels in the query string.
    const qs = opts.writeMode === 'partial' ? '?mode=partial' : '';
    const r = await api.post(`/channels/${channelId}/import/apply${qs}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data?.data ?? r.data;
  },
  importHistory: async (channelId: string) => {
    try { const r = await api.get(`/channels/${channelId}/import/history`); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  channelOrders: async (channelId: string) => {
    try { const r = await api.get(`/channels/${channelId}/orders`); return r.data?.data ?? r.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
};

// ── Per-channel availability allocation ("virtual bins", migration 090) ───────
export const channelAllocationAPI = {
  getConfig: async () => {
    try { const r = await api.get('/channel-allocations/config'); return r.data?.data ?? { enabled: false }; }
    catch (e: any) { safeError(e); return { enabled: false }; }
  },
  setEnabled: async (enabled: boolean) => {
    const r = await api.put('/channel-allocations/config', { enabled }); return r.data?.data;
  },
  list: async (params?: { channelId?: string; variationId?: string; activeOnly?: boolean }) => {
    try { const r = await api.get('/channel-allocations', { params }); return r.data?.data ?? []; }
    catch (e: any) { safeError(e); return []; }
  },
  // Live "who gets what" for one SKU (accepts a SKU string or a variation id).
  preview: async (skuOrId: string) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skuOrId);
    const r = await api.get('/channel-allocations/preview', { params: isUuid ? { variationId: skuOrId } : { sku: skuOrId } });
    return r.data?.data;
  },
  save: async (payload: { channel_id: string; variation_id: string; cap_units?: number | null; cap_pct?: number | null; priority?: number; active?: boolean; notes?: string }) => {
    const r = await api.post('/channel-allocations', payload); return r.data?.data;
  },
  update: async (id: string, payload: Record<string, any>) => {
    const r = await api.put(`/channel-allocations/${id}`, payload); return r.data?.data;
  },
  remove: async (id: string) => {
    const r = await api.delete(`/channel-allocations/${id}`); return r.data;
  },
};

export default api;
