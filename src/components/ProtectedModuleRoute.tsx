import React, { useEffect, useState } from 'react';
import { authAPI } from '../services/api';

interface ProtectedModuleRouteProps {
  children: React.ReactNode;
  module: string;
}

export const ProtectedModuleRoute: React.FC<ProtectedModuleRouteProps> = ({ children, module }) => {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        // First check user permissions for staff access to this module
        const user = await authAPI.me();
        const data = user?.data ?? user;
        const role = data?.role;
        const permissions: string[] = data?.permissions || [];

        let userGranted = false;
        if (role === 'admin') {
          userGranted = true;
        } else {
          userGranted = permissions.includes(module);
        }

        if (!userGranted) {
          setHasAccess(false);
          return;
        }

        // Second, check global store modules if it's a known store module
        try {
          const { modulesAPI } = await import('../services/api');
          const mods = await modulesAPI.list();
          const modsList = Array.isArray(mods) ? mods : mods?.modules ?? mods?.data ?? [];
          const modDef = modsList.find((m: any) => m.key === module);
          
          if (modDef && modDef.enabled === false) {
            setHasAccess(false);
            return;
          }
        } catch (e) {
          console.warn('Could not verify store module status', e);
        }

        setHasAccess(true);
      } catch {
        setHasAccess(false);
      }
    };
    check();
  }, [module]);

  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <p className="text-lg font-medium mb-2">Access Denied</p>
        <p className="text-sm">You do not have permission to access this module.</p>
        <a href="/dashboard" className="mt-4 text-red-600 hover:text-red-700 font-medium">
          Return to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
