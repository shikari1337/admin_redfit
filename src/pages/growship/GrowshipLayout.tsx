import React, { Suspense } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GROWSHIP_MORE, GROWSHIP_TABS } from '../../lib/menu';
import { moduleOn, permitted } from '../../components/menu/menuAccess';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TAB = 'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors';

/**
 * Growcord Ship's own frame (owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or
 * inner sidebar"): one sidebar entry, and the pages as tabs on top, the active one marked, scrolling sideways on a
 * phone. A tab the person cannot open is not shown, by the same gates the route guard reads.
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
      <nav aria-label="Growcord Ship" className="-mx-1 overflow-x-auto">
        <div className="flex w-max min-w-full items-end gap-1 border-b border-gray-200 px-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/growship'}
              className={({ isActive }) => cn(TAB, isActive ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800')}
            >
              {t.label}
            </NavLink>
          ))}
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(TAB, 'flex items-center gap-1 border-transparent text-gray-500 hover:text-gray-800')}>
                More <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {more.map((t) => (
                  <DropdownMenuItem key={t.to} asChild>
                    <Link to={t.to}>{t.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>
      {/* The tabs stay on screen while a page's code loads. */}
      <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
        <Outlet />
      </Suspense>
    </div>
  );
};

export default GrowshipLayout;
