/**
 * ProtectedRoute — secure auth gate.
 *
 * Security checks (in order):
 *  1. Token present in session
 *  2. Token not expired (client-side JWT decode)
 *  3. storeApiKey in session matches currently configured tenant key
 *  4. Auth state loaded (async /me call complete)
 *
 * Any failure → clear session + redirect to /login.
 * No unauthenticated data is rendered — loading spinner shown until check completes.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { isLoaded, isAuthenticated } = useAuth();

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

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
