import React, { Suspense } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GROWSHIP_FAILED_DELIVERY, GROWSHIP_MORE_GROUPS, GROWSHIP_TABS, type MenuItem } from '../../lib/menu';
import { moduleOn, permitted } from '../../components/menu/menuAccess';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TAB = 'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors';
const TAB_ON = 'border-gray-900 text-gray-900';
const TAB_OFF = 'border-transparent text-gray-500 hover:text-gray-800';

/** Where a page opens: Failed delivery is the board on one of its tabs (lib/menu.ts GROWSHIP_FAILED_DELIVERY). */
const opensAt = (t: MenuItem) => (t.to === GROWSHIP_FAILED_DELIVERY.to ? GROWSHIP_FAILED_DELIVERY.opens : t.to);

/**
 * The open page among the tabs and More: the longest route that holds the address (the Overview only on its own
 * address), and a page that opens one tab of the board wins over the board while that tab is on screen.
 */
function activeOf(items: MenuItem[], pathname: string, search: string): string | null {
  const here = pathname.replace(/\/+$/, '') || '/';
  const now = new URLSearchParams(search);
  let best: string | null = null;
  let bestScore = -1;
  for (const t of items) {
    const [path, query] = opensAt(t).split('?');
    const wants = [...new URLSearchParams(query ?? '')];
    if (!wants.every(([k, v]) => now.get(k) === v)) continue;
    if (!(here === path || (path !== '/growship' && here.startsWith(`${path}/`)))) continue;
    const score = path.length + wants.length * 1000;
    if (score > bestScore) { best = t.to; bestScore = score; }
  }
  return best;
}

/**
 * Growcord Ship's own frame (owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or
 * inner sidebar"): one sidebar entry, and the pages as tabs on top in the order of the day's work, the rest under
 * More in small groups (owner 27 Nov 2026: "improvise menu option in panel"). The open page is marked, under More
 * too, where the More button then carries its name; the strip scrolls sideways on a phone. A page the person cannot
 * open is not shown, by the same gates the route guard reads.
 */
const GrowshipLayout: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const { pathname, search } = useLocation();
  // Each page by its own gate (lib/menu.ts GROWSHIP_TABS and GROWSHIP_MORE_GROUPS, the lists the route gates and the
  // command search read).
  const may = (t: MenuItem) => permitted(t, { hasPerm, canAccess }) && moduleOn(t, { hasPerm, canAccess });
  const tabs = GROWSHIP_TABS.filter(may);
  const groups = GROWSHIP_MORE_GROUPS.map((g) => ({ label: g.label, items: g.items.filter(may) })).filter((g) => g.items.length > 0);
  const more = groups.flatMap((g) => g.items);
  // /growship lands on the first tab this person may open (the Overview needs shipments.read).
  if (pathname.replace(/\/+$/, '') === '/growship' && !tabs.some((t) => t.to === '/growship') && (tabs[0] || more[0])) {
    return <Navigate to={(tabs[0] ?? more[0]).to} replace />;
  }
  const activeTo = activeOf([...tabs, ...more], pathname, search);
  const openInMore = more.find((t) => t.to === activeTo);
  return (
    <div className="space-y-4">
      <nav aria-label="Growcord Ship" className="-mx-1 overflow-x-auto">
        <div className="flex w-max min-w-full items-end gap-1 border-b border-gray-200 px-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              title={t.tip}
              aria-current={t.to === activeTo ? 'page' : undefined}
              className={cn(TAB, t.to === activeTo ? TAB_ON : TAB_OFF)}
            >
              {t.label}
            </Link>
          ))}
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="More Growcord Ship pages" className={cn(TAB, 'flex items-center gap-1', openInMore ? TAB_ON : TAB_OFF)}>
                {openInMore ? openInMore.label : 'More'} <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {groups.map((g, i) => (
                  <React.Fragment key={g.label}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.label}</DropdownMenuLabel>
                    {g.items.map((t) => (
                      <DropdownMenuItem key={t.to} asChild>
                        <Link
                          to={t.to}
                          title={t.tip}
                          aria-current={t.to === activeTo ? 'page' : undefined}
                          className={t.to === activeTo ? 'font-semibold text-gray-900' : undefined}
                        >
                          {t.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </React.Fragment>
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
