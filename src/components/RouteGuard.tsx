/**
 * Per-route authorization for the admin panel.
 *
 * `ProtectedRoute` proves you are logged in; this proves you are ALLOWED to be
 * on this page. Without it, hidden nav items were the only thing standing
 * between a warehouse worker and /panel/accounting/journals — and typing the
 * URL rendered it (the page then just failed its API calls with 403s).
 *
 * The API remains the real boundary. This exists so users get an honest,
 * actionable screen rather than a half-broken one.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { permissionForPath, moduleForPath } from '../lib/routePermissions';

const Notice: React.FC<{
  icon: React.ReactNode; tone: string; title: string; children: React.ReactNode;
}> = ({ icon, tone, title, children }) => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 text-sm text-gray-600">{children}</div>
    </div>
  </div>
);

/** Not permitted — a people problem, fixed by changing the user's role. */
const AccessDenied: React.FC<{ perm: string; role?: string }> = ({ perm, role }) => (
  <Notice
    icon={<ShieldAlert className="h-6 w-6 text-amber-600" />}
    tone="bg-amber-50"
    title="You don’t have access to this page"
  >
    <p>
      This page needs the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">{perm}</code> permission.
      {role && <> Your role is <span className="font-medium">{role}</span>.</>}
    </p>
    <p className="mt-4 text-gray-500">
      Ask a store administrator if you need it — they can change your role under Settings → Staff.
    </p>
  </Notice>
);

/** Not enabled — a packaging problem, fixed by the platform admin or a plan change. */
const ModuleOff: React.FC<{ module: string }> = ({ module }) => (
  <Notice
    icon={<Lock className="h-6 w-6 text-slate-500" />}
    tone="bg-slate-100"
    title="This feature isn’t enabled for your store"
  >
    <p>
      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">{module}</code> is
      switched off for this store, so its data and actions are unavailable.
    </p>
    <p className="mt-4 text-gray-500">
      Contact your platform administrator to enable it or upgrade your plan.
    </p>
  </Notice>
);

/**
 * Two independent gates, reported separately because the fixes differ:
 * permission is "ask your store admin for a different role", module is
 * "ask the platform to enable/upgrade". Collapsing them into one message sends
 * people to the wrong person.
 *
 * The API is still the enforcement boundary; this exists so users get an honest
 * screen instead of a page that silently fails all its requests.
 */
export const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { hasPerm, canAccess, user } = useAuth();

  const mod = moduleForPath(pathname);
  if (mod && !canAccess(mod)) return <ModuleOff module={mod} />;

  const required = permissionForPath(pathname);
  if (required && !hasPerm(required)) {
    return <AccessDenied perm={required} role={user?.role} />;
  }
  return <>{children}</>;
};

export default RouteGuard;
