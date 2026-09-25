/**
 * The admin shell.
 *
 * It used to build the navigation itself: six `menuGroups` arrays, one per
 * "workspace", 380 of this file's 545 lines, each re-declaring the same routes
 * with their own gating conditions, selected by tabs in the header. The menu now
 * lives in `lib/menu.ts` and renders in `app-sidebar.tsx`; this file is the
 * frame around it — header, banners, breadcrumb, route guard, outlet.
 *
 * The workspace tabs are gone with the arrays. They were a second navigation
 * axis on top of the sidebar: you had to know which of six menus a page lived in
 * before you could look for it, and the same page lived in up to four.
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
import { MENU, OFF_MENU, routeBase } from '../lib/menu';
import { visibleMenu } from './menu/menuAccess';
import { ThemeToggle, Banners, CommandPalette, HotkeySheet, useShellHotkeys, useDocumentTitle } from './menu/ShellChrome';
import { Search } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';

/** "Sell · Orders · Order #SM-9188" — the trail, from the one menu definition. */
function useTrail(pathname: string): Array<{ label: string; to?: string }> {
  let best: { group: string; sub: string; item: string; to: string } | null = null;
  let bestLen = -1;
  // Pages that left the sidebar (Prompt 9) still get a trail: their own name,
  // under "Commerce", rather than a blank header.
  const sources = [...MENU.map((g) => ({ label: g.label, subs: g.subs })), { label: 'Commerce', subs: [{ label: 'Commerce', items: OFF_MENU }] }];
  for (const g of sources) {
    for (const s of g.subs) {
      for (const i of s.items) {
        if (i.external) continue;
        for (const route of [i.to, ...(i.owns ?? [])]) {
          const p = routeBase(route);
          if (!p.startsWith('/')) continue;
          if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) {
            best = { group: g.label, sub: s.label, item: i.label, to: i.to };
            bestLen = p.length;
          }
        }
      }
    }
  }
  if (!best) return [];
  const trail: Array<{ label: string; to?: string }> = [{ label: best.group }];
  if (best.sub !== best.item) trail.push({ label: best.sub });
  trail.push({ label: best.item, to: best.to });
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
  const productName = IS_SUITE ? 'Growcord Commerce' : PRODUCT.name;
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
        {/* T5 inserts `<ProductBar current="commerce" />` HERE, above the header
            (ADMIN_MODIFICATION_PLAN §4.4) — from admin/src/kit-mirror/. */}
        <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="flex h-14 items-center justify-between gap-2 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1 shrink-0 text-ink-mute" />
              {/* Where you are — one line, from the menu definition. */}
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                {trail.map((crumb, i) => (
                  <React.Fragment key={`${crumb.label}-${i}`}>
                    {i > 0 && <span className="text-ink-mute/50">/</span>}
                    {crumb.to && i === trail.length - 1 ? (
                      <span className="truncate font-semibold text-ink">{crumb.label}</span>
                    ) : crumb.to ? (
                      <Link to={crumb.to} className="truncate text-ink-soft hover:text-ink">{crumb.label}</Link>
                    ) : (
                      <span className={`truncate ${i === trail.length - 1 ? 'font-semibold text-ink' : 'text-ink-mute'}`}>
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            </div>

            {/* Right: notifications + store switcher. The switcher is hidden on a
                domain-pinned deployment (admin.<store>.com) — that domain manages
                exactly one store, so switching away from it makes no sense. */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-mute hover:text-ink sm:inline-flex"
                title="Search or jump — ⌘K or /"
                data-open-palette
              >
                <Search className="size-3.5" />
                <span>Search or jump</span>
                <kbd className="rounded border border-line px-1 text-[10px]">⌘K</kbd>
              </button>
              <NotificationBell />
              {!getDomainStore() && <StoreSwitcher />}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <Banners />
        <TestModeBanner />
        <SetupBanner />

        {/* ONE padding token for every page (owner, Prompt 9: 2%) — pages never
            pin a width or cancel it with negative margins. The phone face has a
            floor, because 2% of 390px is 8px (plan §7, gate G10). */}
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} hasPerm={hasPerm} />
      <HotkeySheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* The shadcn Toaster was never mounted, so every `toast()` in the admin
          (15 files, the Settings Center's save confirmations among them) was silent. */}
      <Toaster />
    </SidebarProvider>
  );
};

export default Layout;
