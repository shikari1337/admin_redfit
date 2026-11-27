/**
 * The admin sidebar: the E-commerce menu, rendered from `lib/menu.ts` (ADMIN-NAV-1, docs/ADMIN-NAV-1.md).
 *
 * Top: Search (the command search), then the person's Pinned and Recent pages. Then the groups the store's staff
 * know (Overview, Orders, Catalog, Marketing, Messaging, Store Customers, Content, System), one compact row per
 * area or page. An area row opens the area (on its last tab); on a desktop it also has a flyout, on hover or from
 * its arrow button, listing the area's pages by section so a deep page is one move away. On a phone a row opens
 * the area and the sheet closes; the tabs on the page scroll sideways.
 *
 * What a person cannot open is absent; what the store has not switched on is absent too. Everything shown comes
 * from `visibleMenu` and `navEntries` (the route guard's gates), handed in by the shell.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuAction, SidebarMenuButton,
  SidebarMenuItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronsUpDown, LogOut, Search, X } from 'lucide-react';
import { whereIs, type MenuItem } from '../lib/menu';
import { areaKey, entryHint, tabSections, type NavEntry, type VisibleGroup } from './menu/menuAccess';
import { prefetchGroup } from './menu/prefetch';

export interface AppSidebarProps {
  userPerms: { role?: string; permissions?: string[]; name?: string; email?: string };
  onLogout: () => void;
  /** Shown under the product name. */
  storeName?: string;
  /** The menu this person gets (`visibleMenu`). */
  groups: VisibleGroup[];
  /** Saved pages already turned back into entries this person may open (`keepOpenable`). */
  pinned: NavEntry[];
  recent: NavEntry[];
  onUnpin: (to: string) => void;
  /** Where an area row lands: its remembered tab, else its first. */
  landingOf: (key: string, row: MenuItem) => string;
  /** Opens the command search. */
  onSearch: () => void;
}

const GROUP_LABEL = 'h-6 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 group-data-[collapsible=icon]:-mt-6';
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** One flyout open at a time: opening one closes the one before. */
let closeOpenFlyout: (() => void) | null = null;

/** An area row (or Growcord Ship): opens its landing; a flyout lists its pages on a desktop. */
const AreaRow: React.FC<{
  item: MenuItem;
  href: string;
  active: boolean;
  activePath: string;
  onNavigate: () => void;
}> = ({ item, href, active, activePath, onNavigate }) => {
  const { isMobile } = useSidebar();
  const pages = item.children ?? item.palette ?? [];
  const sections = item.children ? tabSections(pages) : [{ label: undefined, tabs: pages }];
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const [left, setLeft] = useState(0);
  const rowRef = useRef<HTMLLIElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const focusFirst = useRef(false);
  const close = useRef(() => setOpen(false)).current;

  const show = useCallback((withFocus: boolean) => {
    const r = rowRef.current?.getBoundingClientRect();
    if (!r) return;
    setLeft(r.right + 6);
    setTop(Math.max(8, Math.min(r.top - 4, window.innerHeight - 160)));
    if (closeOpenFlyout && closeOpenFlyout !== close) closeOpenFlyout();
    closeOpenFlyout = close;
    focusFirst.current = withFocus;
    setOpen(true);
  }, [close]);

  const enter = () => {
    if (isMobile || pages.length < 2) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => show(false), 180);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(close, 180);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Escape or a click elsewhere closes it; arrow keys move between its pages.
  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) panelRef.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); rowRef.current?.querySelector<HTMLElement>('button')?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const links = [...(panelRef.current?.querySelectorAll<HTMLElement>('a') ?? [])];
      const at = links.indexOf(document.activeElement as HTMLElement);
      if (at === -1) return;
      e.preventDefault();
      links[(at + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length]?.focus();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rowRef.current?.contains(t) && !panelRef.current?.contains(t)) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      if (closeOpenFlyout === close) closeOpenFlyout = null;
    };
  }, [open, close]);

  const go = () => { close(); onNavigate(); };

  return (
    <SidebarMenuItem ref={rowRef} onMouseEnter={enter} onMouseLeave={leave}>
      {/* No flyout for a single page: the collapsed sidebar's usual hover tip names it instead. */}
      <SidebarMenuButton asChild isActive={active} tooltip={pages.length < 2 ? item.tip : undefined}>
        <Link to={href} onClick={go}>
          {item.icon && <item.icon />}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {!isMobile && pages.length > 1 && (
        <SidebarMenuAction
          showOnHover
          aria-label={`${item.label} pages`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : show(true))}
        >
          <ChevronRight />
        </SidebarMenuAction>
      )}
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={item.label}
          data-area-flyout={item.label}
          style={{ left, top, maxHeight: `calc(100vh - ${top + 8}px)` }}
          className="fixed z-50 w-64 overflow-y-auto rounded-lg border border-line bg-surface-raised p-1 text-sm shadow-xl"
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={leave}
        >
          <div className="px-2 pb-1 pt-1.5">
            <div className="font-semibold text-ink">{item.label}</div>
            <div className="text-xs text-ink-mute">{item.tip}</div>
          </div>
          {sections.map((s) => (
            <div key={s.label ?? 'all'} className="py-0.5">
              {sections.length > 1 && (
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-mute">{s.label}</div>
              )}
              {s.tabs.map((t) => (
                <Link
                  key={t.to}
                  role="menuitem"
                  to={t.to}
                  title={t.tip}
                  onClick={go}
                  aria-current={t.to === activePath ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-md px-2 py-1.5 text-ink-soft outline-none hover:bg-surface-2 hover:text-ink focus:bg-surface-2 focus:text-ink',
                    t.to === activePath && 'font-medium text-ink',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </SidebarMenuItem>
  );
};

/** A pinned or recent page: its name, its area or row on hover. */
const QuickRow: React.FC<{ e: NavEntry; active: boolean; onNavigate: () => void; onUnpin?: () => void }> = ({ e, active, onNavigate, onUnpin }) => (
  <SidebarMenuItem>
    <SidebarMenuButton asChild size="sm" isActive={active}>
      <Link to={e.to} onClick={onNavigate} title={`${entryHint(e)}: ${e.tip}`}>
        {e.icon && <e.icon />}
        <span>{e.label}</span>
      </Link>
    </SidebarMenuButton>
    {onUnpin && (
      <SidebarMenuAction showOnHover aria-label={`Unpin ${e.label}`} title="Unpin" onClick={onUnpin}>
        <X />
      </SidebarMenuAction>
    )}
  </SidebarMenuItem>
);

export function AppSidebar({ userPerms, onLogout, storeName, groups, pinned, recent, onUnpin, landingOf, onSearch }: AppSidebarProps) {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const place = whereIs(location.pathname);
  // On a phone the sheet closes once a page is chosen.
  const onNavigate = () => { if (isMobile) setOpenMobile(false); };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    onLogout();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              {/* The Growcord wordmark from growcord.in (public/brand, ADMIN-BRAND-1); folded to the icon
                  rail, its orange W mark alone. */}
              <Link to="/dashboard" onClick={onNavigate} aria-label="Growcord Admin, go to the dashboard">
                <img
                  src="/brand/growcord-mark.png"
                  alt=""
                  aria-hidden="true"
                  className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
                />
                <div className="grid flex-1 gap-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <img src="/brand/growcord-logo.png" alt="Growcord" className="h-[21px] w-auto justify-self-start object-contain dark:hidden" />
                  <img src="/brand/growcord-logo-white.png" alt="Growcord" className="hidden h-[21px] w-auto justify-self-start object-contain dark:block" />
                  <span className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
                    {storeName ? `Admin, ${storeName}` : 'Admin, ERP and Commerce'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`Search pages (${IS_MAC ? '⌘K' : 'Ctrl K'})`}
              onClick={() => { onNavigate(); onSearch(); }}
              className="border border-sidebar-border text-muted-foreground"
              data-sidebar-search
            >
              <Search />
              <span>Search</span>
              <kbd className="ml-auto rounded border border-sidebar-border px-1 font-sans text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                {IS_MAC ? '⌘K' : 'Ctrl K'}
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {pinned.length > 0 && (
          <SidebarGroup className="py-1 group-data-[collapsible=icon]:hidden" data-sidebar-pinned>
            <SidebarGroupLabel className={GROUP_LABEL}>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {pinned.map((e) => <QuickRow key={e.to} e={e} active={e.to === path} onNavigate={onNavigate} onUnpin={() => onUnpin(e.to)} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {recent.length > 0 && (
          <SidebarGroup className="py-1 group-data-[collapsible=icon]:hidden" data-sidebar-recent>
            <SidebarGroupLabel className={GROUP_LABEL}>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {recent.map((e) => <QuickRow key={e.to} e={e} active={e.to === path} onNavigate={onNavigate} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {groups.map((group) => {
          const items = group.subs.flatMap((s) => s.items);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.id} className="py-1" onMouseEnter={() => prefetchGroup(group.id)}>
              <SidebarGroupLabel className={GROUP_LABEL}>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const active = place?.group?.id === group.id && place.row?.label === item.label && place.row?.to === item.to;
                    if (item.children?.length || item.palette?.length) {
                      return (
                        <AreaRow
                          key={item.label}
                          item={item}
                          href={item.children?.length ? landingOf(areaKey(group.id, item), item) : item.to}
                          active={active}
                          activePath={path}
                          onNavigate={onNavigate}
                        />
                      );
                    }
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton asChild tooltip={item.tip} isActive={active}>
                          {item.external ? (
                            <a href={item.to}>
                              {item.icon && <item.icon />}
                              <span>{item.label}</span>
                            </a>
                          ) : (
                            <Link to={item.to} onClick={onNavigate}>
                              {item.icon && <item.icon />}
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
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
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-bad focus:bg-bad-bg focus:text-bad">
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
