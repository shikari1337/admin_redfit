import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Search, PackagePlus, ClipboardList, ArrowLeftRight, ListChecks } from 'lucide-react';
import {
  discardAction, listActions, onQueueChange, queueCounts, startQueueAutoSync, syncQueue,
} from './offlineQueue';

/**
 * Full-screen mobile-first shell for the warehouse scanner workspace —
 * no sidebar, large touch targets, back button, bottom tab bar.
 */

const TABS = [
  { path: '/scan', label: 'Lookup', icon: Search, exact: true },
  { path: '/scan/putaway', label: 'Putaway', icon: PackagePlus },
  { path: '/scan/pick', label: 'Pick', icon: ClipboardList },
  { path: '/scan/move', label: 'Move', icon: ArrowLeftRight },
  { path: '/scan/count', label: 'Count', icon: ListChecks },
];

const ScannerShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState(queueCounts());
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    startQueueAutoSync();
    return onQueueChange(() => setCounts(queueCounts()));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-base font-semibold">
          <PackagePlus className="h-5 w-5 text-gray-300" /> Warehouse Scanner
        </span>
        <button onClick={() => navigate('/panel/inventory')} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/10">
          Exit
        </button>
      </header>
      {(counts.queued > 0 || counts.rejected > 0) && (
        <button onClick={() => setShowQueue((v) => !v)}
                className={`px-4 py-2 text-left text-sm ${counts.rejected ? 'bg-red-600 text-white' : 'bg-amber-400 text-gray-900'}`}>
          {counts.queued > 0 && <b>{counts.queued} action(s) queued — will sync when online. </b>}
          {counts.rejected > 0 && <b>{counts.rejected} rejected — tap to review.</b>}
        </button>
      )}
      {showQueue && (
        <div className="max-h-64 overflow-y-auto border-b bg-white px-4 py-2 text-sm">
          <div className="flex justify-end pb-1">
            <button onClick={() => syncQueue()} className="rounded border px-2 py-0.5 text-xs">Sync now</button>
          </div>
          {listActions().map((a) => (
            <div key={a.id} className="flex items-center justify-between border-t py-1.5">
              <span>
                {a.label}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${a.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {a.status}
                </span>
                {a.error && <div className="text-xs text-red-600">{a.error}</div>}
              </span>
              <button onClick={() => { discardAction(a.id); }} className="rounded border px-2 py-0.5 text-xs">discard</button>
            </div>
          ))}
        </div>
      )}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white/95 backdrop-blur">
        {TABS.map((t) => {
          const active = t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path);
          return (
            <Link key={t.path} to={t.path}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <t.icon className={`h-5 w-5 ${active ? 'text-gray-900' : 'text-gray-400'}`} strokeWidth={active ? 2.4 : 2} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default ScannerShell;
