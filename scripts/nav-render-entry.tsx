/**
 * ADMIN-NAV-1 render check (read by scripts/nav-proof.mjs, section 4): the real sidebar and the real area strip
 * rendered to HTML for one person on one page, with the saved pins, recent pages and last tabs given, exactly as
 * the shell (components/Layout.tsx) wires them. No browser and no screenshot: the proof reads the links in the HTML.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '../src/components/ui/sidebar';
import { AppSidebar } from '../src/components/app-sidebar';
import { AreaStrip } from '../src/components/menu/AreaTabs';
import type { MenuItem } from '../src/lib/menu';
import {
  areaLanding, areaView, entryAt, keepOpenable, navEntries, trailFor, visibleMenu, type Access,
} from '../src/components/menu/menuAccess';

export interface Saved { pins: string[]; recent: string[]; last: Record<string, string> }

export function renderNav(a: Access, pathname: string, saved: Saved) {
  const groups = visibleMenu(a);
  const entries = navEntries(groups, a);
  const pinned = keepOpenable(saved.pins, entries, a);
  const recent = keepOpenable(saved.recent, entries, a).filter((e) => !pinned.includes(e)).slice(0, 5);
  const landingOf = (key: string, row: MenuItem) => areaLanding(row, saved.last[key]);
  const view = areaView(groups, pathname);
  const sidebar = renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <AppSidebar
          userPerms={{ name: 'Check' }}
          onLogout={() => undefined}
          groups={groups}
          pinned={pinned}
          recent={recent}
          onUnpin={() => undefined}
          landingOf={landingOf}
          onSearch={() => undefined}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );
  const strip = view ? renderToStaticMarkup(<MemoryRouter initialEntries={[pathname]}><AreaStrip view={view} /></MemoryRouter>) : '';
  return {
    sidebar,
    strip,
    pinned: pinned.map((e) => e.to),
    recent: recent.map((e) => e.to),
    here: entryAt(entries, pathname)?.to ?? null,
    trail: trailFor(groups, pathname, landingOf).map((c) => c.label).join(' / '),
    view: view && { key: view.key, active: view.active?.to ?? null, section: view.section.label ?? null, tabs: view.tabs.map((t) => t.to) },
  };
}
