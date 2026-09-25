/**
 * Per-route authorization for the admin panel.
 *
 * `ProtectedRoute` proves you are logged in; this proves you are ALLOWED to be
 * on this page. Without it, hidden nav items were the only thing standing
 * between a warehouse worker and /panel/accounting/journals — and typing the
 * URL rendered it (the page then just failed its API calls with 403s).
 *
 * The table it reads is generated from `lib/menu.ts`, so a link the sidebar
 * shows and the gate this applies can no longer disagree. A page may name
 * SEVERAL permissions (any one opens it — the floor accepts `warehouse.operate`
 * or the older `inventory.adjust`) and SEVERAL modules (all must be on — the
 * ads pages need `marketing` and `ads_management`).
 *
 * The API remains the real boundary. This exists so users get an honest,
 * actionable screen rather than a half-broken one.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { permissionsForPath, modulesForPath } from '../lib/routePermissions';

const Notice: React.FC<{
  icon: React.ReactNode; tone: string; title: string; children: React.ReactNode;
}> = ({ icon, tone, title, children }) => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 text-sm text-ink-soft">{children}</div>
    </div>
  </div>
);

const Perm: React.FC<{ name: string }> = ({ name }) => (
  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium">{name}</code>
);

/** Not permitted — a people problem, fixed by changing the user's role. */
const AccessDenied: React.FC<{ perms: string[]; role?: string }> = ({ perms, role }) => (
  <Notice
    icon={<ShieldAlert className="h-6 w-6 text-warn" />}
    tone="bg-warn-bg"
    title="You don’t have access to this page"
  >
    <p>
      {perms.length > 1 ? 'This page needs one of ' : 'This page needs the '}
      {perms.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && ' or '}
          <Perm name={p} />
        </React.Fragment>
      ))}
      {perms.length > 1 ? '.' : ' permission.'}
      {role && <> Your role is <span className="font-medium">{role}</span>.</>}
    </p>
    <p className="mt-4 text-ink-mute">
      Ask a store administrator if you need it — they can change your role under Settings → Staff.
    </p>
  </Notice>
);

/** Not enabled — a packaging problem, fixed by the platform admin or a plan change. */
const ModuleOff: React.FC<{ module: string }> = ({ module }) => (
  <Notice
    icon={<Lock className="h-6 w-6 text-ink-mute" />}
    tone="bg-surface-2"
    title="This feature isn’t enabled for your store"
  >
    <p>
      <Perm name={module} /> is switched off for this store, so its data and actions are unavailable.
    </p>
    <p className="mt-4 text-ink-mute">
      Contact your platform administrator to enable it or upgrade your plan.
    </p>
  </Notice>
);

/**
 * Two independent gates, reported separately because the fixes differ:
 * permission is "ask your store admin for a different role", module is
 * "ask the platform to enable/upgrade". Collapsing them into one message sends
 * people to the wrong person.
 */
export const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { hasPerm, canAccess, user, modulesLoaded } = useAuth();

  // `canAccess` fails OPEN for a module it has not heard of, so deciding before
  // the map lands mounts a disabled page for a frame and eats its 403
  // (COMMON_MISTAKES #83). Wait, the way ProtectedModuleRoute already does.
  const needModules = modulesForPath(pathname);
  if (needModules.length) {
    if (!modulesLoaded) {
      return (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }
    const off = needModules.find((m) => !canAccess(m));
    if (off) return <ModuleOff module={off} />;
  }

  const required = permissionsForPath(pathname);
  if (required.length && !required.some((p) => hasPerm(p))) {
    return <AccessDenied perms={required} role={user?.role} />;
  }
  return <>{children}</>;
};

export default RouteGuard;
