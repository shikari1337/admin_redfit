import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Normalize API URL (remove trailing slash to avoid double slashes)
      let apiUrl = import.meta.env.VITE_API_SERVER_URL || 'https://api.redfit.in';
      apiUrl = apiUrl.replace(/\/+$/, ''); // Remove trailing slashes
      
      const apiVersion = import.meta.env.VITE_API_VERSION || 'v1';
      const fullUrl = `${apiUrl}/api/${apiVersion}/auth/login`;
      
      console.log('🔐 Login attempt:', { email });
      console.log('📡 API Configuration:', {
        apiUrl,
        apiVersion,
        fullUrl,
        isProduction: import.meta.env.PROD
      });
      
      // Test connection first
      try {
        // Construct health URL properly (avoid double slashes)
        const healthUrl = `${apiUrl}/health`;
        console.log('🔍 Testing health endpoint:', healthUrl);
        
        const healthCheck = await fetch(healthUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!healthCheck.ok) {
          throw new Error(`Health check failed: ${healthCheck.status} ${healthCheck.statusText}`);
        }
        
        const healthData = await healthCheck.json();
        console.log('✅ Health check passed:', healthCheck.status, healthData);
      } catch (healthError: any) {
        console.error('❌ Health check failed:', healthError);
        setError(`Cannot connect to server at ${apiUrl}. Please check if backend is running on port 3000.`);
        setLoading(false);
        return;
      }
      
      const response = await authAPI.login(email, password);
      console.log('✅ Login response:', response);
      
      if (response.success && response.data.token) {
        localStorage.setItem('admin_token', response.data.token);
        console.log('✅ Token stored, navigating to dashboard');
        navigate('/dashboard');
      } else {
        console.error('❌ Invalid response:', response);
        setError('Invalid credentials');
      }
    } catch (err: any) {
      console.error('❌ Login error:', err);
      console.error('❌ Error response:', err.response);
      console.error('❌ Error message:', err.message);
      console.error('❌ Error code:', err.code);
      console.error('❌ Error data:', err.response?.data);
      
      // Handle connection errors
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || err.message?.includes('Connection refused')) {
        setError('Cannot connect to server. Please check if backend is running.');
      } else {
        setError(err.response?.data?.message || err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Redfit Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to manage your store
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

