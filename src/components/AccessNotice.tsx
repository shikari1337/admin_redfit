/**
 * Surfaces access refusals the API sends back.
 *
 * The backend has always returned an actionable 403 payload — module key, label,
 * and an `upgrade` flag distinguishing "your plan doesn't include this" from
 * "your platform admin switched it off" — but nothing in the panel read it. A
 * blocked save just looked like a broken button.
 *
 * Route-level refusals are handled by RouteGuard; this covers the ones that can
 * only be discovered by ATTEMPTING an action — most importantly a `view_only`
 * plan tier, where the page loads fine and only writes are refused.
 */
import React, { useEffect, useState } from 'react';
import { Lock, ShieldAlert, X } from 'lucide-react';

interface Denial {
  code: string;
  message?: string;
  moduleLabel?: string;
  upgrade?: boolean;
}

const TITLES: Record<string, string> = {
  MODULE_DISABLED: 'Feature not enabled',
  MODULE_NOT_IN_PLAN: 'Not included in your plan',
  MODULE_VIEW_ONLY: 'View-only on your plan',
  PERMISSION_DENIED: 'You don’t have permission',
};

export const AccessNotice: React.FC = () => {
  const [denial, setDenial] = useState<Denial | null>(null);

  useEffect(() => {
    const onDenied = (e: Event) => {
      setDenial((e as CustomEvent<Denial>).detail);
      // Auto-dismiss: this is a notification, not a blocking modal.
      window.setTimeout(() => setDenial(null), 8000);
    };
    window.addEventListener('admin:access-denied', onDenied);
    return () => window.removeEventListener('admin:access-denied', onDenied);
  }, []);

  if (!denial) return null;

  const isPerm = denial.code === 'PERMISSION_DENIED';
  const title = TITLES[denial.code] ?? 'Action not allowed';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[100] w-full max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
    >
      <div className="flex gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isPerm ? 'bg-amber-50' : 'bg-slate-100'
          }`}
        >
          {isPerm
            ? <ShieldAlert className="h-5 w-5 text-amber-600" />
            : <Lock className="h-5 w-5 text-slate-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-600">
            {denial.message ?? 'This action was refused.'}
          </p>
          {denial.upgrade && (
            <p className="mt-2 text-xs text-gray-500">
              Contact your platform administrator to upgrade the plan.
            </p>
          )}
          {isPerm && (
            <p className="mt-2 text-xs text-gray-500">
              A store administrator can change your role under Settings → Staff.
            </p>
          )}
        </div>
        <button
          onClick={() => setDenial(null)}
          aria-label="Dismiss"
          className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AccessNotice;
