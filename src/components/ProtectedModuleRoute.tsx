/**
 * ProtectedModuleRoute — permission gate using cached AuthContext.
 *
 * Reads the module map from AuthContext (populated at login/mount + on tab
 * focus). If access looks denied, it re-fetches the module map ONCE before
 * showing the gate — so a module enabled elsewhere (super-admin) doesn't stay
 * blocked by a stale cache until a full re-login.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  module: string;
}

export const ProtectedModuleRoute: React.FC<Props> = ({ children, module }) => {
  const { isLoaded, canAccess, refreshModules } = useAuth();
  const [rechecking, setRechecking] = useState(false);
  const recheckedFor = useRef<string | null>(null);

  const allowed = canAccess(module);

  // Self-heal a stale cache: if it looks denied, refresh the module map once.
  useEffect(() => {
    if (!isLoaded || allowed) return;
    if (recheckedFor.current === module) return; // only one recheck per module
    recheckedFor.current = module;
    setRechecking(true);
    refreshModules().finally(() => setRechecking(false));
  }, [isLoaded, allowed, module, refreshModules]);

  // While auth state is loading show nothing (parent ProtectedRoute shows spinner)
  if (!isLoaded) return null;

  if (allowed) return <>{children}</>;

  if (rechecking) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

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
};
