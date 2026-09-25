/**
 * Who sees what in the menu.
 *
 * Two different reasons an item is not shown, and they are NOT the same fact:
 *
 *  · **permission** — this person's role cannot use the page. It is simply
 *    absent. Listing what a colleague may do and you may not is noise on every
 *    screen, every day, for something the reader cannot act on.
 *  · **module** — the store has not got the feature. That IS worth one line,
 *    because it is a thing the owner can change: each group ends with
 *    "…and N more with your plan".
 *
 * Both answers come from `lib/menu.ts`, the same definition the route guard is
 * generated from, so a link that appears is a link that opens.
 */
import { MENU, routeBase, type MenuGroup, type MenuItem } from '../../lib/menu';

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

interface Access {
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

/**
 * The menu this user actually gets. `home` follows the first item that survived,
 * so clicking a group never lands on a page the same user cannot open.
 */
export function visibleMenu(a: Access): VisibleGroup[] {
  const out: VisibleGroup[] = [];
  for (const group of MENU) {
    let planLocked = 0;
    const subs: VisibleSubGroup[] = [];
    for (const sub of group.subs) {
      const items: MenuItem[] = [];
      for (const item of sub.items) {
        if (!permitted(item, a)) continue;      // silent: not this person's job
        if (!moduleOn(item, a)) { planLocked += 1; continue; }  // counted: an upsell
        items.push(item);
      }
      if (items.length) subs.push({ label: sub.label, items });
    }
    if (!subs.length) continue;   // nothing at all → the group itself is gone
    out.push({
      id: group.id,
      label: group.label,
      icon: group.icon,
      // A group lands on its first page IN this app — never on an external link.
      home: subs.flatMap((x) => x.items).find((i) => !i.external)?.to ?? group.home,
      subs,
      planLocked,
    });
  }
  return out;
}

/** Filter a visible menu by a typed query, keeping group and sub-group shape. */
export function filterMenu(groups: VisibleGroup[], query: string): VisibleGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const hit = (s: string) => s.toLowerCase().includes(q);
  return groups
    .map((g) => ({
      ...g,
      subs: g.subs
        .map((s) => ({
          ...s,
          items: s.items.filter((i) => hit(i.label) || hit(i.tip) || hit(i.to) || hit(s.label) || hit(g.label)),
        }))
        .filter((s) => s.items.length),
    }))
    .filter((g) => g.subs.length);
}

/**
 * Which ONE item the current URL belongs to.
 *
 * Longest prefix over each item's own route and the routes it owns, so
 * `/orders/9188` lights up Orders, `/orders/abandoned-carts/x` lights up
 * Abandoned carts (the longer match), and both cannot be lit at once — which is
 * what a plain `startsWith` did before.
 */
export function activeItemPath(groups: VisibleGroup[], pathname: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const s of g.subs) {
      for (const item of s.items) {
        if (item.external) continue;
        for (const route of [item.to, ...(item.owns ?? [])]) {
          const p = routeBase(route);
          if (!p.startsWith('/')) continue;
          if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) {
            best = item.to;
            bestLen = p.length;
          }
        }
      }
    }
  }
  return best;
}
