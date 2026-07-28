import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, getTenantApiKey, setTenantApiKey } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Eye, EyeOff, Store, AlertCircle, Loader2, ChevronRight, CheckCircle2,
} from 'lucide-react';

// Store entry returned by /auth/admin-login
interface StoreOption {
  storeId: string;
  apiKey: string;
  storeName: string;
  storeSlug?: string;
  role: 'admin' | 'staff';
  permissions: string[];
}

// ─── Step 1 — Credentials ────────────────────────────────────────────────────

interface StepCredentialsProps {
  onSuccess: (token: string, stores: StoreOption[], singleApiKey?: string) => void;
}

const StepCredentials: React.FC<StepCredentialsProps> = ({ onSuccess }) => {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  // "Connect to a specific store" override (for VITE_API_KEY or manual entry)
  const [showKeyField, setShowKeyField]   = useState(false);
  const [manualKey, setManualKey]         = useState('');
  const [showManualKey, setShowManualKey] = useState(false);

  const envKey = getTenantApiKey(); // set via VITE_API_KEY or from a previous session

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      // If a specific store key is provided (env or manual), use per-store login
      const storeKey = (manualKey.trim() || envKey || '').trim();
      if (storeKey) {
        setTenantApiKey(storeKey);
        const res = await authAPI.login(email, password);
        const token = res?.token || res?.data?.token;
        if (!token) { setError('Invalid credentials.'); return; }
        onSuccess(token, [], storeKey);
        return;
      }

      // No API key in env — try per-store login via domain/DEFAULT_STORE_SLUG first.
      // This lets store admins log in from their store's domain without needing an API key.
      let perStoreDone = false;
      try {
        const res = await authAPI.login(email, password);
        const token = res?.token || res?.data?.token;
        if (token) {
          // Use the env API key for session continuity (keeps x-api-key on future requests)
          const sessionKey = getTenantApiKey() || '';
          onSuccess(token, [], sessionKey);
          perStoreDone = true;
        }
      } catch (perStoreErr: any) {
        const status = perStoreErr?.response?.status;
        // Network errors or server errors are fatal — rethrow them
        if (!status || status >= 500) throw perStoreErr;
        // 401/403/404 means this user isn't in the tenant DB or no tenant found —
        // fall through to central admin login
      }

      if (!perStoreDone) {
        // Central admin login fallback (for super-admins managing multiple stores)
        const res = await authAPI.adminLogin(email, password);
        const data = res?.data ?? res;
        const token = data?.token;
        if (!token) { setError('Invalid credentials.'); return; }

        const stores: StoreOption[] = data?.stores ?? [];
        if (stores.length === 0) {
          setError('No stores assigned. Use your store API key to log in directly.');
          return;
        }

        if (stores.length === 1) {
          onSuccess(token, stores, stores[0].apiKey);
        } else {
          onSuccess(token, stores);
        }
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError('Invalid email or password.');
      } else if (err.code === 'ERR_NETWORK') {
        setError('Cannot reach the server. Check if the backend is running.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@yourstore.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
        <div className="relative">
          <input
            id="password"
            type={showPass ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          <button type="button" onClick={() => setShowPass(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : 'Continue'}
      </button>

      {/* Connect to a specific store (env key auto-shown; manual override collapsed) */}
      <div className="pt-3 border-t border-gray-100">
        {envKey && !manualKey ? (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <Store className="h-3 w-3 shrink-0" />
            <span>Store pre-configured — will connect automatically.</span>
            <button type="button" onClick={() => { setShowKeyField(true); }}
              className="ml-auto underline hover:no-underline shrink-0">Change</button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowKeyField(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1">
            <Store className="h-3 w-3" />
            {showKeyField ? 'Cancel' : 'Connect to a specific store'}
          </button>
        )}

        {showKeyField && (
          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Store API Key</label>
            <div className="relative">
              <input
                type={showManualKey ? 'text' : 'password'}
                autoComplete="off"
                placeholder="rf_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={manualKey}
                onChange={e => setManualKey(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
              />
              <button type="button" onClick={() => setShowManualKey(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showManualKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              Bypasses central auth and logs in directly to this store's database.
            </p>
          </div>
        )}
      </div>
    </form>
  );
};

// ─── Step 2 — Store Picker ────────────────────────────────────────────────────

interface StepStorePickerProps {
  stores: StoreOption[];
  centralToken: string;
  onSelect: (store: StoreOption) => void;
}

const StepStorePicker: React.FC<StepStorePickerProps> = ({ stores, onSelect }) => (
  <div className="space-y-3">
    <p className="text-sm text-gray-600">
      Select the store you want to manage:
    </p>
    {stores.map(store => (
      <button
        key={store.apiKey}
        onClick={() => onSelect(store)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors group"
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Store className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{store.storeName}</p>
          <p className="text-xs text-gray-400 capitalize">{store.role}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors shrink-0" />
      </button>
    ))}
  </div>
);

// ─── Main Login Page ──────────────────────────────────────────────────────────

const Login: React.FC = () => {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();

  type Step = 'credentials' | 'pick-store' | 'finalizing';
  const [step, setStep]               = useState<Step>('credentials');
  const [centralToken, setCentralToken] = useState('');
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [finalError, setFinalError]     = useState('');

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
    // Clear any stale store API key so login always starts with central auth.
    // The correct store key is set after the user picks their store.
    else setTenantApiKey(null);
  }, [isAuthenticated, navigate]);

  // Called by StepCredentials when auth succeeds
  const handleCredentialsSuccess = async (
    token: string,
    stores: StoreOption[],
    immediateApiKey?: string,
  ) => {
    if (immediateApiKey) {
      // Single store or per-store direct login — finalize immediately
      await finalize(token, immediateApiKey);
      return;
    }
    // Multiple stores — show picker
    setCentralToken(token);
    setStoreOptions(stores);
    setStep('pick-store');
  };

  const handleStorePicked = async (store: StoreOption) => {
    await finalize(centralToken, store.apiKey);
  };

  const finalize = async (token: string, apiKey: string) => {
    setFinalError('');
    setStep('finalizing');
    try {
      await login(token, apiKey);
      navigate('/', { replace: true });
    } catch {
      setFinalError('Session setup failed. Please try again.');
      setStep('credentials');
    }
  };

  const stepLabel = step === 'pick-store' ? 'Choose a store' : 'Sign in';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary items-center justify-center text-primary-foreground text-2xl font-bold shadow-lg mb-4">
            G
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Growcord Admin</h1>
          <p className="text-sm text-gray-500 mt-1">{stepLabel}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">

          {/* Step indicator */}
          {step === 'pick-store' && (
            <div className="flex items-center gap-2 mb-5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Signed in — now choose a store to manage.
            </div>
          )}

          {step === 'credentials' && (
            <StepCredentials onSuccess={handleCredentialsSuccess} />
          )}

          {step === 'pick-store' && (
            <StepStorePicker
              stores={storeOptions}
              centralToken={centralToken}
              onSelect={handleStorePicked}
            />
          )}

          {step === 'finalizing' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-gray-500">Loading your store…</p>
            </div>
          )}

          {finalError && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {finalError}
            </div>
          )}

          {/* Back link on store picker */}
          {step === 'pick-store' && (
            <button
              onClick={() => setStep('credentials')}
              className="mt-5 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Sign in with a different account
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 px-4">
          Your session is scoped to the selected store. You cannot access other stores' data.
        </p>
      </div>
    </div>
  );
};

export default Login;
