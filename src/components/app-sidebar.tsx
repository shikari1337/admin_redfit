/**
 * The admin sidebar — the E-commerce menu, rendered from `lib/menu.ts`.
 *
 * The shape the store's staff already knew: uppercase section labels
 * (Overview · Orders · Catalog · Marketing · Store Customers · Content · System),
 * one row per item with its icon, and a chevron on the items that fold their
 * finer options underneath (Products ▸, Settings ▸ …). What a person cannot
 * open is absent; what the store has not switched on is absent too. Hovering
 * an item explains it.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronRight, ChevronsUpDown, LogOut } from 'lucide-react';
import type { MenuItem } from '../lib/menu';
import { visibleMenu, activeItemPath, type VisibleGroup } from './menu/menuAccess';
import { prefetchGroup } from './menu/prefetch';

export interface AppSidebarProps {
  userPerms: { role?: string; permissions?: string[]; name?: string; email?: string };
  onLogout: () => void;
  hasPerm: (perm: string) => boolean;
  canAccess: (module: string) => boolean;
  /** Shown under the product name. */
  storeName?: string;
}

/** Does this item, or one of its children, own the current URL? */
function containsPath(item: MenuItem, activePath: string | null): boolean {
  if (!activePath) return false;
  if (item.to === activePath) return true;
  return (item.children ?? []).some((c) => containsPath(c, activePath));
}

/** An item with children: a chevron row that opens its sub-items. */
const FoldingItem: React.FC<{ item: MenuItem; activePath: string | null }> = ({ item, activePath }) => {
  const childActive = containsPath(item, activePath);
  const [open, setOpen] = useState(childActive);
  // Arriving on a child from elsewhere (a link, a deep URL) opens the fold.
  useEffect(() => { if (childActive) setOpen(true); }, [childActive]);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.tip} isActive={childActive && !open}>
            {item.icon && <item.icon />}
            <span>{item.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {(item.children ?? []).map((child) => (
              <SidebarMenuSubItem key={child.to}>
                <SidebarMenuSubButton asChild isActive={child.to === activePath} title={child.tip}>
                  {child.external ? (
                    <a href={child.to}><span>{child.label}</span></a>
                  ) : (
                    <Link to={child.to}><span>{child.label}</span></Link>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

export function AppSidebar({ userPerms, onLogout, hasPerm, canAccess, storeName }: AppSidebarProps) {
  const location = useLocation();
  const { isMobile } = useSidebar();

  const groups: VisibleGroup[] = useMemo(() => visibleMenu({ hasPerm, canAccess }), [hasPerm, canAccess]);
  const activePath = useMemo(() => activeItemPath(groups, location.pathname), [groups, location.pathname]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    onLogout();
  };

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
                  <span className="truncate font-semibold">Growcord Admin</span>
                  <span className="truncate text-xs text-muted-foreground">{storeName || 'ERP & Commerce'}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => {
          const items = group.subs.flatMap((s) => s.items);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.id} onMouseEnter={() => prefetchGroup(group.id)}>
              <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) =>
                    item.children?.length ? (
                      <FoldingItem key={item.to} item={item} activePath={activePath} />
                    ) : (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild tooltip={item.tip} isActive={item.to === activePath}>
                          {item.external ? (
                            <a href={item.to}>
                              {item.icon && <item.icon />}
                              <span>{item.label}</span>
                            </a>
                          ) : (
                            <Link to={item.to}>
                              {item.icon && <item.icon />}
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ),
                  )}
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
