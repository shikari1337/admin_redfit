/**
 * ProtectedModuleRoute — permission gate using cached AuthContext.
 *
 * Unlike the old version that made an API call on every render,
 * this reads from the AuthContext (populated once at login/mount).
 * Result: instant permission checks, no loading flicker, no N API calls.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  module: string;
}

export const ProtectedModuleRoute: React.FC<Props> = ({ children, module }) => {
  const { isLoaded, canAccess } = useAuth();

  // While auth state is loading show nothing (parent ProtectedRoute shows spinner)
  if (!isLoaded) return null;

  if (!canAccess(module)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <ShieldX className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Access Denied</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          You don't have permission to access this module. Contact your store administrator to request access.
        </p>
        <Link to="/dashboard" className="text-sm text-primary hover:underline font-medium">
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
