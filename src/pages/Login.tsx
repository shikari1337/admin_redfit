import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, getTenantApiKey, setTenantApiKey } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Store, AlertCircle, Loader2 } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [apiKey, setApiKey]       = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const { isAuthenticated, login } = useAuth();
  const navigate                   = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Pre-fill API key from env/localStorage
  useEffect(() => {
    const existing = getTenantApiKey();
    if (existing) setApiKey(existing);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    const key = apiKey.trim();
    if (!key) {
      setError('Store API key is required. Contact your Redfit account manager if you do not have one.');
      return;
    }

    setLoading(true);
    try {
      // Apply the API key so the login request hits the right tenant
      setTenantApiKey(key);

      const response = await authAPI.login(email, password);
      const token = response?.token || response?.data?.token;

      if (!token) {
        setError('Invalid credentials. Please try again.');
        setLoading(false);
        return;
      }

      // Register this store in the multi-store list
      // (addStore will also authenticate; here we already have the token so we just record it)
      // Use AuthContext.login which sets session + fetches user
      await login(token, key);

      // Also register in StoreContext so the switcher shows it
      // We do a lightweight add that skips re-auth since token is already fresh
      // (addStore makes its own login call; skip it here — just update the store list directly)

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError('Invalid email or password.');
      } else if (err.code === 'ERR_NETWORK') {
        setError('Cannot reach the server. Check if the backend is running.');
      } else if (status === 404) {
        setError('Store not found. Please verify the API key.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary items-center justify-center text-primary-foreground text-2xl font-bold shadow-lg mb-4">
            R
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Redfit Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to manage your store</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">

            {/* Store API Key */}
            <div className="space-y-1.5">
              <label htmlFor="api-key" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5 text-muted-foreground" /> Store API Key
              </label>
              <div className="relative">
                <input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  required
                  placeholder="rf_xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">Your store's unique API key — identifies which store you're managing.</p>
            </div>

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
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                : 'Sign in'
              }
            </button>
          </form>
        </div>

        {/* Security note */}
        <p className="text-center text-xs text-gray-400 px-4">
          Your session is scoped to this store only. You cannot access data from other stores with these credentials.
        </p>
      </div>
    </div>
  );
};

export default Login;
