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
      console.log('🔐 Login attempt:', { email });
      
      // Use authAPI.login which already uses the configured API URL
      // All requests go through api.redfit.in for consistent tenant identification
      const response = await authAPI.login(email, password);
      console.log('✅ Login response:', response);
      console.log('✅ Login response type:', typeof response);
      console.log('✅ Login response keys:', response ? Object.keys(response) : 'null');
      
      // Handle different response formats:
      // 1. {success: true, data: {user, token}} - normalized to {user, token}
      // 2. {user, token} - direct format
      // 3. {success: true, data: {token}} - normalized to {token}
      const token = response?.token || response?.data?.token;
      
      console.log('🔑 Extracted token:', token ? `${token.substring(0, 20)}...` : 'NOT FOUND');
      console.log('🔑 Token exists:', !!token);
      console.log('🔑 Full response structure:', JSON.stringify(response, null, 2));
      
      if (token) {
        // Store token
        localStorage.setItem('admin_token', token);
        
        // Verify token was stored
        const storedToken = localStorage.getItem('admin_token');
        console.log('✅ Token stored in localStorage:', storedToken ? `${storedToken.substring(0, 20)}...` : 'NOT FOUND');
        console.log('✅ Token verification - stored matches:', storedToken === token);
        
        if (!storedToken || storedToken !== token) {
          console.error('❌ Token storage failed!');
          setError('Failed to store authentication token. Please try again.');
          setLoading(false);
          return;
        }
        
        // Small delay to ensure localStorage is written (browser optimization)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify again after delay
        const verifyToken = localStorage.getItem('admin_token');
        console.log('✅ Token verification after delay:', verifyToken ? `${verifyToken.substring(0, 20)}...` : 'NOT FOUND');
        
        if (verifyToken) {
          console.log('✅ Token confirmed, navigating to dashboard');
          navigate('/dashboard', { replace: true });
        } else {
          console.error('❌ Token disappeared from localStorage!');
          setError('Authentication failed. Please try again.');
        }
      } else {
        console.error('❌ Invalid response - no token found:', response);
        setError('Invalid credentials or server error');
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

