/**
 * ProtectedRoute — secure auth gate.
 *
 * Security checks (in order):
 *  1. Token present in session
 *  2. Token not expired (client-side JWT decode)
 *  3. storeApiKey in session matches currently configured tenant key
 *  4. Auth state loaded (async /me call complete)
 *
 * A REJECTED session (401/403) → clear session + redirect to /login.
 * A session we merely couldn't VERIFY (server down, 5xx, or a 429 from the auth
 * rate limiter) is not a rejection: the session is kept and a retry is offered,
 * because silently dumping the admin on /login for a transient blip loses their
 * work and reads as a random logout.
 * No unauthenticated data is rendered — loading spinner shown until check completes.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, WifiOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { isLoaded, isAuthenticated, authUnreachable, retryVerify, logout } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (authUnreachable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4 max-w-sm">
          <WifiOff className="h-8 w-8 text-muted-foreground mx-auto" />
          <div className="space-y-1">
            <p className="font-medium">Couldn’t verify your session</p>
            <p className="text-sm text-muted-foreground">
              The server didn’t respond. You are still signed in — this is not a
              sign-out.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => { void retryVerify(); }}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              Retry
            </button>
            <button
              onClick={() => { void logout(); }}
              className="px-4 py-2 text-sm rounded-md border hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
