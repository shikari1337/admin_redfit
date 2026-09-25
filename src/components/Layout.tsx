/**
 * The admin shell — the E-commerce panel's frame.
 *
 * Header: the sidebar trigger, then the TAB STRIP the admin always had at the
 * top — but each tab is now another Growcord product (Books, Ship, WMS, Make,
 * CRM, Comms, Reach, …) and links there; E-commerce is this app and stays the
 * active tab (`ProductTabs.tsx`, owner 2026-09-25). Right: notifications and
 * the store switcher. Under it the muted breadcrumb row, as before.
 *
 * The menu lives in `lib/menu.ts` and renders in `app-sidebar.tsx`; the route
 * guard reads the same definition. This file is only the frame: header,
 * banners, breadcrumb, guard, outlet, and the hotkey-only command palette.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import PageTransitionLoader from './PageTransitionLoader';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import StoreSwitcher from './StoreSwitcher';
import { getDomainStore } from '../services/api';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import { SetupBanner } from './SetupBanner';
import { TestModeBanner } from './TestModeBanner';
import RouteGuard from './RouteGuard';
import AccessNotice from './AccessNotice';
import { PRODUCT, IS_SUITE } from '../lib/product';
import { MENU, OFF_MENU, routeBase, withChildren } from '../lib/menu';
import { visibleMenu } from './menu/menuAccess';
import { Banners, CommandPalette, HotkeySheet, useShellHotkeys, useDocumentTitle } from './menu/ShellChrome';
import { ProductTabs } from './ProductTabs';
import { Toaster } from '@/components/ui/toaster';

/** "Orders · Abandoned Carts · SM-9188" — the trail, from the one menu definition. */
function useTrail(pathname: string): Array<{ label: string; to?: string }> {
  let best: { group: string; item: string; to: string } | null = null;
  let bestLen = -1;
  // Pages with no sidebar row (another product's, or reached from a button)
  // still get a trail: their own name under "E-commerce".
  const sources = [
    ...MENU.map((g) => ({ label: g.label, items: g.subs.flatMap((s) => s.items.flatMap(withChildren)) })),
    { label: 'E-commerce', items: OFF_MENU.flatMap(withChildren) },
  ];
  for (const g of sources) {
    for (const i of g.items) {
      if (i.external) continue;
      for (const route of [i.to, ...(i.owns ?? [])]) {
        const p = routeBase(route);
        if (!p.startsWith('/')) continue;
        // `>=`: a child listed after its parent at the same route ("All Orders"
        // under "Orders") wins the tie, so the trail never repeats a word.
        if ((pathname === p || pathname.startsWith(p + '/')) && p.length >= bestLen) {
          best = { group: g.label, item: i.label, to: i.to };
          bestLen = p.length;
        }
      }
    }
  }
  if (!best) return [];
  const trail: Array<{ label: string; to?: string }> = [{ label: best.group }, { label: best.item, to: best.to }];
  // The last URL segment when we are deeper than the item itself (an order, a
  // product) — the page's own header names the record; this just shows depth.
  const itemBase = routeBase(best.to);
  if (pathname.length > itemBase.length) {
    const tail = pathname.slice(itemBase.length).split('/').filter(Boolean);
    for (const seg of tail) trail.push({ label: seg.replace(/-/g, ' ') });
  }
  return trail;
}

const Layout: React.FC = () => {
  const { user, canAccess, hasPerm, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect to login if auth is lost mid-session (token expired etc.)
  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  // The admin is light (owner: "keep the earlier theme"). A dark choice made
  // through the short-lived toggle would otherwise outlive the toggle itself.
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === 'dark') root.removeAttribute('data-theme');
    try { localStorage.removeItem('gc_theme'); } catch { /* private mode */ }
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userPerms = {
    role: user?.role,
    permissions: user?.permissions ?? [],
    name: user?.name,
    email: user?.email,
  };

  const trail = useTrail(location.pathname);
  const productName = IS_SUITE ? 'Growcord Admin' : PRODUCT.name;
  useDocumentTitle(productName, trail);

  const groups = useMemo(() => visibleMenu({ hasPerm, canAccess }), [hasPerm, canAccess]);
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
        hasPerm={hasPerm}
        canAccess={canAccess}
        storeName={IS_SUITE ? undefined : PRODUCT.name}
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
          {/* Breadcrumb row, below the tabs, as before. */}
          {trail.length > 0 && (
            <nav aria-label="Breadcrumb" className="hidden border-t border-line/70 px-4 py-1.5 text-xs text-ink-mute md:flex md:items-center md:gap-1.5 md:px-6">
              {trail.map((crumb, i) => (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && <span className="opacity-40">/</span>}
                  {crumb.to && i < trail.length - 1 ? (
                    <Link to={crumb.to} className="capitalize hover:text-ink">{crumb.label}</Link>
                  ) : (
                    <span className={`capitalize ${i === trail.length - 1 ? 'font-medium text-ink-soft' : ''}`}>{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
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
      {/* Keyboard only (⌘K / `/`): pages, "New …" actions and record search. */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} hasPerm={hasPerm} />
      <HotkeySheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* The shadcn Toaster was never mounted, so every `toast()` in the admin
          (15 files, the Settings Center's save confirmations among them) was silent. */}
      <Toaster />
    </SidebarProvider>
  );
};

export default Layout;
