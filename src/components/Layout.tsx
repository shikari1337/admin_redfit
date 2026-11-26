/**
 * The admin shell: the E-commerce panel's frame.
 *
 * Header: the sidebar trigger, then the TAB STRIP the admin always had at the top, each tab now another Growcord
 * product (Books, Ship, WMS, Make, CRM, Comms, Reach and others) linking there; E-commerce is this app and stays the
 * active tab (`ProductTabs.tsx`, owner 2026-09-25). Right: notifications and the store switcher. Under it the muted
 * breadcrumb row (Area, then Tab, then the record) with the Pin button.
 *
 * The menu lives in `lib/menu.ts`; this file works out once what this person gets (`menuAccess.visibleMenu` and
 * `navEntries`) and hands it to the sidebar (`app-sidebar.tsx`), the area's tab strip (`menu/AreaTabs.tsx`), the
 * breadcrumb and the command search. The route guard reads the same definition. Pins, recent pages and each area's
 * last tab are `menu/navMemory.ts` (ADMIN-NAV-1, docs/ADMIN-NAV-1.md).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Pin, PinOff } from 'lucide-react';
import PageTransitionLoader from './PageTransitionLoader';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import StoreSwitcher from './StoreSwitcher';
import { getDomainStore } from '../services/api';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import { isSigningOut } from '../lib/v2/session';
import { SetupBanner } from './SetupBanner';
import { TestModeBanner } from './TestModeBanner';
import RouteGuard from './RouteGuard';
import AccessNotice from './AccessNotice';
import { PRODUCT, IS_SUITE } from '../lib/product';
import type { MenuItem } from '../lib/menu';
import {
  areaLanding, areaView, entryAt, navEntries, savedPages, trailFor, visibleMenu, type Access,
} from './menu/menuAccess';
import { AreaStrip } from './menu/AreaTabs';
import { useNavMemory } from './menu/navMemory';
import { Banners, CommandPalette, HotkeySheet, useShellHotkeys, useDocumentTitle } from './menu/ShellChrome';
import { ProductTabs } from './ProductTabs';
import { Toaster } from '@/components/ui/toaster';

const Layout: React.FC = () => {
  const { user, canAccess, hasPerm, isAuthenticated, logout, modulesLoaded } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect to login if auth is lost mid-session (token expired etc.)
  useEffect(() => {
    if (!isAuthenticated && !isSigningOut()) navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  // The admin is light (owner: "make theme light color"). The theme's dark
  // palette applies to an <html> with NO data-theme on a dark OS, so the
  // attribute must be PRESENT, not merely not-dark.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('gc_theme', 'light'); } catch { /* private mode */ }
  }, []);

  const handleLogout = async () => {
    await logout();
    // A v2 sign-out is leaving for the issuer's /logout: going to /login now would cancel that navigation.
    if (!isSigningOut()) navigate('/login', { replace: true });
  };

  const userPerms = {
    role: user?.role,
    permissions: user?.permissions ?? [],
    name: user?.name,
    email: user?.email,
  };

  // THE menu this person gets, worked out once for the sidebar, the area tabs, the breadcrumb and the command
  // search (ADMIN-NAV-1). Until the store's module list has loaded, a page that needs a module is left out (the
  // route guard waits the same way), so a page of a module that is off never flashes into the menu.
  const canAccessNav = useCallback((m: string) => modulesLoaded && canAccess(m), [modulesLoaded, canAccess]);
  const access: Access = useMemo(() => ({ hasPerm, canAccess: canAccessNav }), [hasPerm, canAccessNav]);
  const groups = useMemo(() => visibleMenu(access), [access]);
  const entries = useMemo(() => navEntries(groups, access), [groups, access]);
  const memory = useNavMemory(user?._id || user?.email);
  const landingOf = useCallback((key: string, row: MenuItem) => areaLanding(row, memory.last[key]), [memory.last]);
  const area = useMemo(() => areaView(groups, location.pathname), [groups, location.pathname]);
  const here = useMemo(() => entryAt(entries, location.pathname), [entries, location.pathname]);
  const { pinned, recent } = useMemo(
    () => savedPages(memory, entries, access, here?.to ?? null),
    [memory, entries, access, here?.to],
  );
  const { visit } = memory;
  useEffect(() => {
    visit(here?.to ?? null, area?.active ? { key: area.key, tab: area.active.to } : undefined);
  }, [visit, here?.to, area?.key, area?.active?.to]);

  const trail = useMemo(() => trailFor(groups, location.pathname, landingOf), [groups, location.pathname, landingOf]);
  const productName = IS_SUITE ? 'Growcord Admin' : PRODUCT.name;
  useDocumentTitle(productName, trail);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useShellHotkeys({
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    newOrder: hasPerm('orders.manage') ? () => navigate('/orders/new') : null,
  });

  return (
    <SidebarProvider>
      <PageTransitionLoader />
      <AppSidebar
        userPerms={userPerms}
        onLogout={handleLogout}
        storeName={IS_SUITE ? undefined : PRODUCT.name}
        groups={groups}
        pinned={pinned}
        recent={recent}
        onUnpin={memory.unpin}
        landingOf={landingOf}
        onSearch={() => setPaletteOpen(true)}
      />

      {/* `min-w-0`: as a flex item this defaults to `min-width:auto`, i.e. its own
          min-content — so any single wide child (a table, a nowrap toolbar) grew
          the whole page sideways. The clip below hides the overflow visually but
          only `min-w-0` stops it being claimed as width in the first place. */}
      <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-bg">
        <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="flex h-14 items-center justify-between gap-2 px-4 md:px-6">
            {/* Left: sidebar trigger + the product tabs (E-commerce active, the rest link out) */}
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1 shrink-0 text-ink-mute" />
              {IS_SUITE ? (
                <ProductTabs />
              ) : (
                // Single-product build: the product name, not a lone tab.
                <span className="whitespace-nowrap px-2 text-sm font-semibold text-ink">{PRODUCT.name}</span>
              )}
            </div>

            {/* Right: notifications + store switcher. The switcher is hidden on a
                domain-pinned deployment (admin.<store>.com) — that domain manages
                exactly one store, so switching away from it makes no sense. */}
            <div className="flex shrink-0 items-center gap-3">
              <NotificationBell />
              {!getDomainStore() && <StoreSwitcher />}
            </div>
          </div>
          {/* Breadcrumb row, below the tabs, as before: Area, then Tab, then the record. Pin keeps a menu page at the
              top of the sidebar. */}
          {trail.length > 0 && (
            <div className="hidden border-t border-line/70 px-4 py-1.5 text-xs text-ink-mute md:flex md:items-center md:gap-3 md:px-6">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
                {trail.map((crumb, i) => (
                  <React.Fragment key={`${crumb.label}-${i}`}>
                    {i > 0 && <span className="opacity-40">/</span>}
                    {crumb.to && i < trail.length - 1 ? (
                      <Link to={crumb.to} className="capitalize hover:text-ink">{crumb.label}</Link>
                    ) : (
                      <span className={`truncate capitalize ${i === trail.length - 1 ? 'font-medium text-ink-soft' : ''}`}>{crumb.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
              {here && (
                <button
                  type="button"
                  onClick={() => memory.togglePin(here.to)}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-ink"
                  title={memory.isPinned(here.to) ? 'Take this page off the top of the sidebar' : 'Keep this page at the top of the sidebar'}
                  aria-pressed={memory.isPinned(here.to)}
                  data-pin-page
                >
                  {memory.isPinned(here.to) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  {memory.isPinned(here.to) ? 'Unpin' : 'Pin page'}
                </button>
              )}
            </div>
          )}
        </header>

        <Banners />
        <TestModeBanner />
        <SetupBanner />

        {/* ONE padding token for every page (owner, Prompt 9: 2%) — pages never
            pin a width or cancel it with negative margins. The phone face has a
            floor, because 2% of 390px is 8px. */}
        <div className="flex-1 overflow-x-clip p-[var(--content-pad-phone)] md:p-[var(--content-pad)]" data-content>
          {/* Authorization gate — see components/RouteGuard.tsx. Single
              integration point so every Layout child route is covered. */}
          {/* The area's tabs (ADMIN-NAV-1): the pages of the area this one belongs to, those this person may open. */}
          {area && <AreaStrip view={area} />}
          <RouteGuard>
            <React.Suspense
              fallback={
                <div className="flex h-96 items-center justify-center" role="status" aria-label="Loading">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              <Outlet />
            </React.Suspense>
          </RouteGuard>
        </div>
        {/* Surfaces API-side access refusals (view-only plan, module off,
            missing permission) that only appear when an action is attempted. */}
        <AccessNotice />
      </main>
      {/* Cmd K, "/" or the sidebar's Search: pages, "New" actions and record search. */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={entries} pinned={pinned} recent={recent} hasPerm={hasPerm} />
      <HotkeySheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* The shadcn Toaster was never mounted, so every `toast()` in the admin
          (15 files, the Settings Center's save confirmations among them) was silent. */}
      <Toaster />
    </SidebarProvider>
  );
};

export default Layout;
