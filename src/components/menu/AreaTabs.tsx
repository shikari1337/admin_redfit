/**
 * THE tab strip on top of a page (ADMIN-NAV-1), taken from Growcord Ship's own frame (pages/growship/GrowshipLayout.tsx,
 * owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or inner sidebar") so the admin
 * has one strip, not two copies:
 *
 *  - `AreaTabs`: the tabs, the open one marked, the rest under More, scrolling sideways on a phone. Growcord Ship
 *    draws it with its own lists.
 *  - `AreaStrip`: what the shell draws on every page of an area (`menuAccess.areaView`): the area's sections when it
 *    has several (Settings, Marketing home), then the open section's tabs.
 *
 * Only tabs the person may open reach here: the lists come from `visibleMenu`, the same gates the route guard reads.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { MenuItem } from '../../lib/menu';
import { splitTabs, type AreaView } from './menuAccess';

const TAB = 'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors';
const TAB_ON = 'border-gray-900 text-gray-900';
const TAB_OFF = 'border-transparent text-gray-500 hover:text-gray-800';

export const AreaTabs: React.FC<{
  /** Names the strip for a screen reader. */
  label: string;
  tabs: MenuItem[];
  /** Under More. When the open page is one of them, More carries its name. */
  more: MenuItem[];
  /** The open tab's route. */
  activeTo: string | null;
  className?: string;
}> = ({ label, tabs, more, activeTo, className }) => {
  const openInMore = more.find((t) => t.to === activeTo);
  return (
    <nav aria-label={label} className={cn('-mx-1 overflow-x-auto', className)}>
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
            <DropdownMenuTrigger aria-label={`More ${label} pages`} className={cn(TAB, 'flex items-center gap-1', openInMore ? TAB_ON : TAB_OFF)}>
              {openInMore ? openInMore.label : 'More'} <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {more.map((t) => (
                <DropdownMenuItem key={t.to} asChild>
                  <Link to={t.to} title={t.tip} aria-current={t.to === activeTo ? 'page' : undefined} className={t.to === activeTo ? 'font-medium' : undefined}>
                    {t.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
};

/**
 * The shell's strip for the page's area. Its bottom margin is the shell's content padding, so a page that runs
 * edge to edge by cancelling that padding (Settings Center, an order) starts right under the strip.
 */
export const AreaStrip: React.FC<{ view: AreaView }> = ({ view }) => {
  const { inline, more } = splitTabs(view.section.tabs);
  const label = view.section.label ? `${view.label}: ${view.section.label}` : view.label;
  return (
    <div data-area-strip={view.key} className="mb-[var(--content-pad-phone)] space-y-1 md:mb-[var(--content-pad)]">
      {view.sections.length > 1 && (
        <nav aria-label={`${view.label} sections`} className="-mx-1 overflow-x-auto">
          <div className="flex w-max min-w-full items-center gap-1 px-1">
            {view.sections.map((s) => {
              const on = s === view.section;
              return (
                <Link
                  key={s.label ?? s.tabs[0].to}
                  to={s.tabs[0].to}
                  aria-current={on ? 'true' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    on ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <AreaTabs label={label} tabs={inline} more={more} activeTo={view.active?.to ?? null} />
    </div>
  );
};

export default AreaTabs;
