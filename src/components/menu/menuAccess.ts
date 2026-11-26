/**
 * Who sees what in the menu.
 *
 * Two different reasons an item is not shown, and they are NOT the same fact:
 *
 *  - **permission**: this person's role cannot use the page. It is simply absent. Listing what a colleague may do
 *    and you may not is noise on every screen, every day, for something the reader cannot act on.
 *  - **module**: the store has not got the feature. Counted per group (`planLocked`) so a screen can say "and N
 *    more with your plan" if it wants to.
 *
 * Both answers come from `lib/menu.ts`, the same definition the route guard is generated from, so a link that
 * appears is a link that opens.
 *
 * AREAS (ADMIN-NAV-1): a row with `children` is an area. Each tab is shown by its OWN gate, and the area row is
 * shown when at least one of its tabs is, landing on the first of them (or the tab the person last used, while
 * they may still open it). Every entry this file hands out (rows, tabs, flyout lines, command search results, pins,
 * recent pages) also passes `canOpenPath`, the route guard's own table.
 */
import type { LucideIcon } from 'lucide-react';
import { MENU, OFF_MENU, routeBase, whereIs, type MenuGroup, type MenuItem, type MenuPlace } from '../../lib/menu';
import { canOpenPath } from '../../lib/routePermissions';

export interface VisibleSubGroup {
  label: string;
  items: MenuItem[];
}

export interface VisibleGroup {
  id: string;
  label: string;
  icon: MenuGroup['icon'];
  home: string;
  subs: VisibleSubGroup[];
  /** Items hidden because the store has not got the module. */
  planLocked: number;
}

export interface Access {
  hasPerm: (perm: string) => boolean;
  canAccess: (module: string) => boolean;
}

/** Any ONE of the item's permissions is enough; ALL of its modules are needed. */
export function permitted(item: MenuItem, a: Access): boolean {
  if (!item.perm) return true;
  const perms = Array.isArray(item.perm) ? item.perm : [item.perm];
  return perms.some((p) => a.hasPerm(p));
}

export function moduleOn(item: MenuItem, a: Access): boolean {
  return (item.modules ?? []).every((m) => a.canAccess(m));
}

/** A page this person may open: its own gate, and the route guard's table for its route. */
function opens(item: MenuItem, a: Access): boolean {
  return permitted(item, a) && moduleOn(item, a) && (!!item.external || canOpenPath(item.to, a.hasPerm, a.canAccess));
}

/**
 * One item through the rules. An area is kept when one of its tabs is (its own gate is its first tab's and is not
 * asked on its own); any other item by its own gate, its Growcord Ship pages likewise. `locked` counts every page
 * hidden by a missing module.
 */
function visibleItem(item: MenuItem, a: Access, locked: { n: number }): MenuItem | null {
  if (item.children?.length) {
    const children = item.children
      .map((c) => visibleItem(c, a, locked))
      .filter((c): c is MenuItem => !!c);
    return children.length ? { ...item, children } : null;
  }
  if (!permitted(item, a)) return null;          // silent: not this person's job
  if (!moduleOn(item, a)) { locked.n += 1; return null; }  // counted: an upsell
  if (!opens(item, a)) return null;
  // Its own pages (Growcord Ship's tabs): only those this person may open.
  if (item.palette?.length) item = { ...item, palette: item.palette.filter((p) => opens(p, a)) };
  return item;
}

/**
 * The menu this user actually gets. `home` follows the first row that survived, so clicking a group never lands on
 * a page the same user cannot open.
 */
export function visibleMenu(a: Access): VisibleGroup[] {
  const out: VisibleGroup[] = [];
  for (const group of MENU) {
    const locked = { n: 0 };
    const subs: VisibleSubGroup[] = [];
    for (const sub of group.subs) {
      const items: MenuItem[] = [];
      for (const item of sub.items) {
        const shown = visibleItem(item, a, locked);
        if (shown) items.push(shown);
      }
      if (items.length) subs.push({ label: sub.label, items });
    }
    if (!subs.length) continue;   // nothing at all: the group itself is gone
    const first = subs.flatMap((x) => x.items).find((i) => !i.external);
    out.push({
      id: group.id,
      label: group.label,
      icon: group.icon,
      // A group lands on its first page IN this app, never on an external link.
      home: first ? areaLanding(first, null) : group.home,
      subs,
      planLocked: locked.n,
    });
  }
  return out;
}

/** Filter a visible menu by a typed query, keeping group and sub-group shape. */
export function filterMenu(groups: VisibleGroup[], query: string): VisibleGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const hit = (s: string) => s.toLowerCase().includes(q);
  const itemHit = (i: MenuItem): boolean =>
    hit(i.label) || hit(i.tip) || hit(i.to) || (i.children ?? []).some(itemHit);
  return groups
    .map((g) => ({
      ...g,
      subs: g.subs
        .map((s) => ({
          ...s,
          items: s.items.filter((i) => itemHit(i) || hit(s.label) || hit(g.label)),
        }))
        .filter((s) => s.items.length),
    }))
    .filter((g) => g.subs.length);
}

/* areas */

/** How many tabs a strip shows before the rest go under More. */
export const MAX_INLINE_TABS = 7;

export interface TabSection {
  /** Absent when the area names no sections. */
  label?: string;
  tabs: MenuItem[];
}

/** An area's tabs by section, in the order the sections first appear. */
export function tabSections(tabs: MenuItem[]): TabSection[] {
  const out: TabSection[] = [];
  for (const t of tabs) {
    const s = out.find((x) => x.label === t.section);
    if (s) s.tabs.push(t);
    else out.push({ label: t.section, tabs: [t] });
  }
  return out;
}

/**
 * The tabs a strip shows inline, and those under More: the ones marked `more`, then any beyond the first seven. A
 * person who may open only a few of the tabs (three or fewer), or only `more` ones, gets them all inline.
 */
export function splitTabs(tabs: MenuItem[]): { inline: MenuItem[]; more: MenuItem[] } {
  const usual = tabs.filter((t) => !t.more);
  const inline = tabs.length <= 3 || !usual.length ? tabs.slice(0, MAX_INLINE_TABS) : usual.slice(0, MAX_INLINE_TABS);
  return { inline, more: tabs.filter((t) => !inline.includes(t)) };
}

/** A stable name for an area, for its remembered tab. */
export function areaKey(groupId: string, row: MenuItem): string {
  return `${groupId}/${row.label}`;
}

/**
 * Where a VISIBLE row lands: an area on the remembered tab while it is still one of the tabs this person may open,
 * else on the first of them; any other row on its own route.
 */
export function areaLanding(row: MenuItem, last: string | null | undefined): string {
  const tabs = row.children ?? [];
  if (!tabs.length) return row.to;
  return last && tabs.some((t) => t.to === last) ? last : tabs[0].to;
}

/** The visible copy of a definition row (visibleMenu copies an area to filter its tabs). */
function visibleRow(groups: VisibleGroup[], place: MenuPlace): MenuItem | null {
  const g = groups.find((x) => x.id === place.group?.id);
  return g?.subs.flatMap((s) => s.items).find((i) => i.label === place.row?.label && i.to === place.row?.to) ?? null;
}

export interface AreaView {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** The tabs this person may open, in order. */
  tabs: MenuItem[];
  sections: TabSection[];
  /** The tab of the page that is open; null when that page is not one this person may open. */
  active: MenuItem | null;
  /** The section whose tabs the strip shows. */
  section: TabSection;
}

/**
 * The tab strip for a pathname, or null: when the page is not in an area (a row of its own, Growcord Ship's own
 * layout, another product's page) or when the person may open only one of the area's tabs.
 */
export function areaView(groups: VisibleGroup[], pathname: string): AreaView | null {
  const place = whereIs(pathname);
  if (!place?.row?.children?.length || !place.group) return null;
  const row = visibleRow(groups, place);
  const tabs = row?.children ?? [];
  if (tabs.length < 2) return null;
  const activeTo = place.node === place.row ? place.row.to : place.node.to;
  const active = tabs.find((t) => t.to === activeTo) ?? null;
  const sections = tabSections(tabs);
  return {
    key: areaKey(place.group.id, place.row),
    label: place.row.label,
    icon: place.row.icon,
    tabs,
    sections,
    active,
    section: sections.find((s) => !!active && s.tabs.includes(active)) ?? sections[0],
  };
}

/* every entry, for the command search, pins and recent pages */

export interface NavEntry {
  to: string;
  label: string;
  tip: string;
  icon?: LucideIcon;
  /** row: a sidebar row; area: an area row (lands on its first tab); tab: an area's tab; page: a Growcord Ship page; other: another product's page. */
  kind: 'row' | 'area' | 'tab' | 'page' | 'other';
  /** The sidebar group, or for `other` the product. */
  group: string;
  /** The row a tab or page sits under. */
  row?: string;
  section?: string;
  /** Under More in its strip. */
  more?: boolean;
  /** `other`: the product that owns the page. */
  product?: string;
  external?: boolean;
  /** The area's key, for `area` and `tab`. */
  areaKey?: string;
}

/**
 * Everything this person may open from the menu, flat: rows, areas, area tabs, Growcord Ship's pages and the other
 * products' pages this admin serves (OFF_MENU, labelled with their product). Each path once, MENU first; the
 * visible groups are already filtered, and OFF_MENU pages pass their own gate and the route table here.
 */
export function navEntries(groups: VisibleGroup[], a: Access): NavEntry[] {
  const out: NavEntry[] = [];
  const seen = new Set<string>();
  const add = (e: NavEntry) => {
    if (e.kind !== 'area') { if (seen.has(e.to)) return; seen.add(e.to); }
    out.push(e);
  };
  for (const g of groups) {
    for (const s of g.subs) {
      for (const i of s.items) {
        if (i.children?.length) {
          const key = areaKey(g.id, i);
          add({ kind: 'area', to: areaLanding(i, null), label: i.label, tip: i.tip, icon: i.icon, group: g.label, areaKey: key });
          for (const sec of tabSections(i.children)) {
            const { more } = splitTabs(sec.tabs);
            for (const t of sec.tabs) {
              add({
                kind: 'tab', to: t.to, label: t.label, tip: t.tip, icon: t.icon ?? i.icon, group: g.label, row: i.label,
                section: sec.label, more: more.includes(t), areaKey: key, external: t.external,
              });
            }
          }
          continue;
        }
        add({ kind: 'row', to: i.to, label: i.label, tip: i.tip, icon: i.icon, group: g.label, external: i.external });
        for (const p of i.palette ?? []) {
          add({ kind: 'page', to: p.to, label: p.label, tip: p.tip, icon: p.icon ?? i.icon, group: g.label, row: i.label, more: !!p.more });
        }
      }
    }
  }
  for (const o of OFF_MENU) {
    if (o.external || !opens(o, a)) continue;
    const product = o.product ?? 'E-commerce';
    add({ kind: 'other', to: o.to, label: o.label, tip: o.tip, icon: o.icon, group: product, product });
  }
  return out;
}

/** The short hint the command search prints beside a result. */
export function entryHint(e: NavEntry): string {
  if (e.kind === 'tab') return e.section ? `${e.row}, ${e.section}` : e.row ?? e.group;
  if (e.kind === 'page') return e.row ?? e.group;
  return e.group;
}

/**
 * Saved paths (pins, recent pages) as entries this person may open NOW: a path that is not a menu page, or that
 * the person may no longer open, is left out. Areas are never pinned by themselves (their first tab is).
 */
export function keepOpenable(paths: string[], entries: NavEntry[], a: Access): NavEntry[] {
  const byPath = new Map<string, NavEntry>();
  for (const e of entries) if (e.kind !== 'area' && !e.external && !byPath.has(e.to)) byPath.set(e.to, e);
  const out: NavEntry[] = [];
  for (const p of paths) {
    const e = byPath.get(p);
    if (e && !out.includes(e) && canOpenPath(p, a.hasPerm, a.canAccess)) out.push(e);
  }
  return out;
}

/** How many recent pages the sidebar shows. */
export const RECENT_SHOWN = 5;

/**
 * The sidebar's Pinned and Recent pages from what was saved (`navMemory`): each an entry this person may open now;
 * Recent leaves out what is pinned and the page that is open, and shows at most five.
 */
export function savedPages(
  saved: { pins: string[]; recent: string[] },
  entries: NavEntry[],
  a: Access,
  openPath: string | null,
): { pinned: NavEntry[]; recent: NavEntry[] } {
  const pinned = keepOpenable(saved.pins, entries, a);
  const recent = keepOpenable(saved.recent, entries, a)
    .filter((e) => !pinned.includes(e) && e.to !== openPath)
    .slice(0, RECENT_SHOWN);
  return { pinned, recent };
}

/** The entry a pathname IS (not merely under), for pinning and the recent list. */
export function entryAt(entries: NavEntry[], pathname: string): NavEntry | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return entries.find((e) => e.kind !== 'area' && !e.external && e.to === path) ?? null;
}

/* the breadcrumb */

export interface Crumb { label: string; to?: string }

/**
 * Area, then tab, then the record's own segments: "Orders / All Orders / SM-9188". A row of its own reads
 * "Group / Row"; a Growcord Ship page "Growcord Ship / Page"; another product's page "Books / Trial balance".
 * `landingOf` gives an area's landing (its remembered tab) for the first crumb's link.
 */
export function trailFor(groups: VisibleGroup[], pathname: string, landingOf: (key: string, row: MenuItem) => string | null): Crumb[] {
  const place = whereIs(pathname);
  if (!place) return [];
  const { node, row, group } = place;
  let trail: Crumb[];
  if (row?.children?.length && group) {
    const shown = visibleRow(groups, place);
    const tab = node === row ? row.children.find((c) => c.to === row.to) ?? node : node;
    trail = [{ label: row.label, to: shown ? landingOf(areaKey(group.id, row), shown) ?? undefined : undefined }, { label: tab.label, to: tab.to }];
  } else if (row && group && node !== row) {
    trail = [{ label: row.label, to: row.to }, { label: node.label, to: node.to }];
  } else if (row && group) {
    trail = [{ label: group.label }, { label: row.label, to: row.to }];
  } else {
    trail = [{ label: place.product ?? 'E-commerce' }, { label: node.label, to: node.to }];
  }
  // The record's own segments, when the page is deeper than the entry (an order, a product): the page's own header
  // names the record; this just shows depth.
  // Counted from the entry's own route, or from the owned route that matched (Pricing owns /pricing, its tabs below).
  const path = pathname.replace(/\/+$/, '');
  const own = routeBase(trail[trail.length - 1].to ?? place.matched);
  const base = path.startsWith(own + '/') ? own : place.matched;
  if (path.startsWith(base + '/')) {
    for (const seg of path.slice(base.length).split('/').filter(Boolean)) trail.push({ label: seg.replace(/-/g, ' ') });
  }
  return trail;
}
