/**
 * The admin sidebar — eight groups, rendered from `lib/menu.ts`.
 *
 * Before: six hand-written menus in `Layout.tsx`, chosen by a "workspace" tab
 * in the header, each listing 20–40 items flat. The same page appeared in up to
 * four of them and nothing told you which one you were in.
 *
 * Now: Home · Sell · Stock · Money · Ship · People · Insights · Settings. Only
 * the group you are in is open. Items you cannot use are absent; items your
 * plan does not include are counted in one line at the end of the group.
 * Hovering an item explains it — the menu itself carries no sentences.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronRight, ChevronsUpDown, LogOut, Search, Lock, X } from 'lucide-react';
import type { MenuItem } from '../lib/menu';
import { visibleMenu, filterMenu, activeItemPath, type VisibleGroup } from './menu/menuAccess';
import { prefetchGroup } from './menu/prefetch';

export interface AppSidebarProps {
  userPerms: { role?: string; permissions?: string[]; name?: string; email?: string };
  onLogout: () => void;
  hasPerm: (perm: string) => boolean;
  canAccess: (module: string) => boolean;
  /** Shown under the product name. */
  storeName?: string;
}

/** One line on hover, on both sides of the sidebar, expanded or collapsed. */
const Hint: React.FC<{ tip: string; children: React.ReactNode }> = ({ tip, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" align="center" className="max-w-xs">{tip}</TooltipContent>
  </Tooltip>
);

const ItemLink: React.FC<{ item: MenuItem; active: boolean }> = ({ item, active }) => (
  <SidebarMenuSubItem>
    <Hint tip={item.tip}>
      <SidebarMenuSubButton asChild isActive={active}>
        {item.external ? (
          <a href={item.to} target="_blank" rel="noreferrer"><span>{item.label}</span></a>
        ) : (
          <Link to={item.to}><span>{item.label}</span></Link>
        )}
      </SidebarMenuSubButton>
    </Hint>
  </SidebarMenuSubItem>
);

export function AppSidebar({ userPerms, onLogout, hasPerm, canAccess, storeName }: AppSidebarProps) {
  const location = useLocation();
  const { isMobile, state } = useSidebar();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => visibleMenu({ hasPerm, canAccess }), [hasPerm, canAccess]);
  const shown = useMemo(() => filterMenu(groups, query), [groups, query]);
  const activePath = useMemo(() => activeItemPath(groups, location.pathname), [groups, location.pathname]);
  const activeGroup = useMemo(() => {
    for (const g of groups) for (const s of g.subs) for (const i of s.items) if (i.to === activePath) return g.id;
    return groups[0]?.id ?? null;
  }, [groups, activePath]);

  // The group you are in is open; the rest are shut until you open one.
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);
  useEffect(() => { if (activeGroup) setOpenGroup(activeGroup); }, [activeGroup]);

  // ⌘K now opens the shell's command palette (ShellChrome.tsx); this box only
  // filters the menu in place.

  const searching = query.trim().length > 0;
  const collapsed = state === 'collapsed' && !isMobile;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
                  G
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight text-sidebar-foreground">
                  <span className="truncate font-semibold">Growcord</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">{storeName || 'Admin'}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-sidebar-foreground/60" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
              placeholder="Filter the menu"
              aria-label="Filter the menu"
              className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-7 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear"
                className="absolute right-3 top-2 rounded p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {shown.map((group) => {
          const open = searching || openGroup === group.id;
          return (
            <SidebarGroup key={group.id} className="py-0.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible
                    open={open}
                    onOpenChange={(v) => setOpenGroup(v ? group.id : null)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          data-menu-group={group.id}
                          tooltip={group.label}
                          isActive={!searching && activeGroup === group.id}
                          onMouseEnter={() => prefetchGroup(group.id)}
                          onFocus={() => prefetchGroup(group.id)}
                        >
                          <group.icon />
                          <span className="font-medium">{group.label}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {group.subs.map((sub) => (
                          <div key={sub.label}>
                            {group.subs.length > 1 && (
                              <SidebarGroupLabel className="mt-1 h-5 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                                {sub.label}
                              </SidebarGroupLabel>
                            )}
                            <SidebarMenuSub className="mr-0 pr-0">
                              {sub.items.map((item) => (
                                <ItemLink key={item.to} item={item} active={item.to === activePath} />
                              ))}
                            </SidebarMenuSub>
                          </div>
                        ))}
                        {group.planLocked > 0 && !searching && (
                          <div className="mx-2 mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-sidebar-foreground/50">
                            <Lock className="size-3 shrink-0" />
                            <span>…and {group.planLocked} more with your plan</span>
                          </div>
                        )}
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {searching && !shown.length && (
          <div className="px-4 py-6 text-center text-xs text-sidebar-foreground/60">
            Nothing here matches “{query}”.
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{userPerms?.name ? userPerms.name.charAt(0) : 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight text-sidebar-foreground">
                    <span className="truncate font-semibold">{userPerms?.name || 'Administrator'}</span>
                    <span className="truncate text-xs">{userPerms?.email || userPerms?.role || ''}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{userPerms?.name ? userPerms.name.charAt(0) : 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight text-foreground">
                      <span className="truncate font-semibold">{userPerms?.name || 'Administrator'}</span>
                      <span className="truncate text-xs">{userPerms?.email || userPerms?.role || ''}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); onLogout(); }} className="cursor-pointer text-bad focus:bg-bad-bg focus:text-bad">
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export type { VisibleGroup };
