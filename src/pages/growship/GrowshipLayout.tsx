import React, { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { canOpenPath } from '../../lib/routePermissions';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** The pages of Growcord Ship, as tabs. Each keeps its own address; the gates are lib/menu.ts EXTRA_ROUTES. */
const TABS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/growship', label: 'Overview', end: true },
  { to: '/growship/shipments', label: 'Shipments' },
  { to: '/growship/bulk', label: 'Bulk shipment' },
  { to: '/growship/wallet', label: 'Wallet' },
  { to: '/growship/billing', label: 'Billing and charges' },
  { to: '/growship/rates', label: 'Rate calculator' },
];

/** Under More: the failed delivery tab of the board, and pages that live elsewhere in the admin. */
const MORE: Array<{ to: string; label: string }> = [
  { to: '/growship/failed-delivery', label: 'Failed delivery' },
  { to: '/growship/rto', label: 'RTO' },
  { to: '/growship/weight-disputes', label: 'Weight disputes' },
  { to: '/growship/cod-payouts', label: 'COD payouts' },
  { to: '/growship/settings', label: 'Settings' },
  { to: '/growship/pickup-locations', label: 'Pickup locations' },
];

const TAB = 'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors';

/**
 * Growcord Ship's own frame (owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or
 * inner sidebar"): one sidebar entry, and the pages as tabs on top, the active one marked, scrolling sideways on a
 * phone. A tab the person cannot open is not shown, by the same gates the route guard reads.
 */
const GrowshipLayout: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const open = (to: string) => canOpenPath(to, hasPerm, canAccess);
  const tabs = TABS.filter((t) => open(t.to));
  const more = MORE.filter((t) => open(t.to));
  return (
    <div className="space-y-4">
      <nav aria-label="Growcord Ship" className="-mx-1 overflow-x-auto">
        <div className="flex w-max min-w-full items-end gap-1 border-b border-gray-200 px-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
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
