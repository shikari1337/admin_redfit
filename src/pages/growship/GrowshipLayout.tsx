import React, { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GROWSHIP_MORE, GROWSHIP_TABS } from '../../lib/menu';
import { activeTab, moduleOn, permitted } from '../../components/menu/menuAccess';
import { AreaTabs } from '../../components/menu/AreaTabs';

/**
 * Growcord Ship's own frame (owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or
 * inner sidebar"): one sidebar entry, and the pages as tabs on top, the active one marked, scrolling sideways on a
 * phone. A tab the person cannot open is not shown, by the same gates the route guard reads. The strip is the
 * admin's one tab strip (components/menu/AreaTabs.tsx); the shell draws none of its own here.
 */
const GrowshipLayout: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const { pathname } = useLocation();
  // Each tab by its own gate (lib/menu.ts GROWSHIP_TABS, the list the route gates and the command search read).
  const may = (t: (typeof GROWSHIP_TABS)[number]) => permitted(t, { hasPerm, canAccess }) && moduleOn(t, { hasPerm, canAccess });
  const tabs = GROWSHIP_TABS.filter(may);
  const more = GROWSHIP_MORE.filter(may);
  // /growship lands on the first tab this person may open (the Overview needs shipments.read).
  if (pathname.replace(/\/+$/, '') === '/growship' && !tabs.some((t) => t.to === '/growship') && (tabs[0] || more[0])) {
    return <Navigate to={(tabs[0] ?? more[0]).to} replace />;
  }
  return (
    <div className="space-y-4">
      <AreaTabs label="Growcord Ship" tabs={tabs} more={more} activeTo={activeTab([...tabs, ...more], pathname)?.to ?? null} />
      {/* The tabs stay on screen while a page's code loads. */}
      <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
        <Outlet />
      </Suspense>
    </div>
  );
};

export default GrowshipLayout;
