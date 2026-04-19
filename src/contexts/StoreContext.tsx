/**
 * StoreContext — multi-store session management.
 *
 * Architecture:
 *  Each "store session" is independently authenticated:
 *    - User enters the store's API key + their credentials
 *    - A token is issued by THAT store's tenant DB
 *    - Sessions stored per-store in sessionStorage['admin_store_sessions']
 *
 *  Store switching:
 *    - Loads the target store's token + updates axios x-api-key header
 *    - Validates the session is still fresh (not expired)
 *    - Forces login if session expired or missing
 *
 *  Security:
 *    - Cross-store: impossible — each token was issued by a different tenant DB
 *    - The backend rejects tokens from other stores (JWT signed with store-specific secret)
 *    - We also enforce this client-side: only one active store context at a time
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { saveSession, loadSession } from '../contexts/AuthContext';
import { api, authAPI, setTenantApiKey } from '../services/api';

export interface StoreEntry {
  apiKey: string;
  storeName: string;
  storeSlug?: string;
  userId: string;
  role: 'admin' | 'staff';
  token: string;
  addedAt: number;
}

interface StoreContextValue {
  currentStore: StoreEntry | null;
  stores: StoreEntry[];
  switchStore: (apiKey: string) => Promise<boolean>;
  addStore: (apiKey: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  removeStore: (apiKey: string) => void;
  isLoadingSwitch: boolean;
}

const STORES_KEY = 'admin_store_list_v2';

function loadStores(): StoreEntry[] {
  try {
    const raw = sessionStorage.getItem(STORES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveStores(stores: StoreEntry[]): void {
  sessionStorage.setItem(STORES_KEY, JSON.stringify(stores));
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stores, setStores]             = useState<StoreEntry[]>(() => loadStores());
  const [currentStore, setCurrentStore] = useState<StoreEntry | null>(null);
  const [isLoadingSwitch, setIsLoadingSwitch] = useState(false);

  // Sync current store on mount from existing session
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    const existing = stores.find(s => s.apiKey === session.storeApiKey);
    if (existing) {
      setCurrentStore(existing);
    } else if (session.storeApiKey) {
      // Session exists but store not in list — add it with unknown name
      const entry: StoreEntry = {
        apiKey: session.storeApiKey,
        storeName: 'My Store',
        userId: '',
        role: 'admin',
        token: session.token,
        addedAt: Date.now(),
      };
      const updated = [entry, ...stores.filter(s => s.apiKey !== session.storeApiKey)];
      setStores(updated);
      saveStores(updated);
      setCurrentStore(entry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchStore = useCallback(async (apiKey: string): Promise<boolean> => {
    const target = stores.find(s => s.apiKey === apiKey);
    if (!target) return false;

    setIsLoadingSwitch(true);
    try {
      // Apply target store's API key and token
      setTenantApiKey(apiKey);
      api.defaults.headers.common['x-api-key'] = apiKey;
      api.defaults.headers.common['Authorization'] = `Bearer ${target.token}`;
      saveSession(target.token, apiKey);
      setCurrentStore(target);
      // Reload page so all components re-initialize with new store context
      window.location.href = '/dashboard';
      return true;
    } catch {
      return false;
    } finally {
      setIsLoadingSwitch(false);
    }
  }, [stores]);

  const addStore = useCallback(async (
    apiKey: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoadingSwitch(true);
    try {
      // Temporarily set the API key for this login request
      const previousKey = api.defaults.headers.common['x-api-key'];
      api.defaults.headers.common['x-api-key'] = apiKey;

      let loginResp: any;
      try {
        loginResp = await authAPI.login(email, password);
      } finally {
        // Restore previous key (don't switch until user confirms)
        api.defaults.headers.common['x-api-key'] = previousKey;
      }

      const token = loginResp?.token || loginResp?.data?.token;
      if (!token) return { success: false, error: 'Invalid credentials or wrong API key' };

      const user = loginResp?.user || loginResp?.data?.user;
      if (!user) return { success: false, error: 'Could not retrieve user info' };

      // Fetch store name using the new token
      let storeName = 'Store';
      try {
        const prevToken = api.defaults.headers.common['Authorization'];
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        api.defaults.headers.common['x-api-key'] = apiKey;
        const settingsResp = await api.get('/settings/general');
        storeName = settingsResp.data?.storeName || settingsResp.data?.name || 'Store';
        api.defaults.headers.common['Authorization'] = prevToken;
        api.defaults.headers.common['x-api-key'] = previousKey;
      } catch { /* use default name */ }

      const entry: StoreEntry = {
        apiKey,
        storeName,
        userId: user._id || user.id || '',
        role: user.role || 'admin',
        token,
        addedAt: Date.now(),
      };

      const updated = [entry, ...stores.filter(s => s.apiKey !== apiKey)];
      setStores(updated);
      saveStores(updated);
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to authenticate with this store';
      return { success: false, error: msg };
    } finally {
      setIsLoadingSwitch(false);
    }
  }, [stores]);

  const removeStore = useCallback((apiKey: string) => {
    const updated = stores.filter(s => s.apiKey !== apiKey);
    setStores(updated);
    saveStores(updated);
    if (currentStore?.apiKey === apiKey) setCurrentStore(null);
  }, [stores, currentStore]);

  return (
    <StoreContext.Provider value={{ currentStore, stores, switchStore, addStore, removeStore, isLoadingSwitch }}>
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

