/**
 * Admin route → required permission and store module — DERIVED, not written.
 *
 * This used to be a hand-kept table, and it was the second of three answers to
 * "may this user open this page" (see the header of `lib/menu.ts`). It had no
 * row for most `/panel/*` pages, so typing their URL rendered them for anybody
 * logged in; and where it did have a row it contradicted `App.tsx`'s
 * `ProtectedModuleRoute` wrappers on the three marketing routes.
 *
 * Both tables are now generated from `MENU` (items AND their children) +
 * `OFF_MENU` + `EXTRA_ROUTES`. Adding a page to the menu gates it; there is
 * nowhere else to forget.
 *
 * Matching stays LONGEST-PREFIX-WINS, so `/settings/staff` (staff.manage) beats
 * `/settings` (settings.read), and a route absent from both tables needs only
 * login. This is defence in depth, not the boundary: the API is the authority
 * (a hostile user can edit their own bundle). The value is that an ordinary
 * user never lands somewhere they cannot use.
 */
import { MENU, OFF_MENU, EXTRA_ROUTES, routeBase, withChildren } from './menu';

function build(): { perms: Record<string, string[]>; modules: Record<string, string[]> } {
  const perms: Record<string, string[]> = {};
  const modules: Record<string, string[]> = {};

  const put = (route: string, perm?: string | string[], mods?: string[]) => {
    const p = routeBase(route);
    if (!p.startsWith('/') || p === '/') return;
    // First writer wins: a menu item states the gate for the routes it owns,
    // and a more specific item later in the menu must not loosen it.
    const any = perm === undefined ? [] : Array.isArray(perm) ? perm : [perm];
    if (any.length && !(p in perms)) perms[p] = any;
    if (mods?.length && !(p in modules)) modules[p] = mods;
  };

  for (const group of MENU) {
    for (const sub of group.subs) {
      for (const item of sub.items.flatMap(withChildren)) {
        if (item.external) continue;
        put(item.to, item.perm, item.modules);
        for (const owned of item.owns ?? []) put(owned, item.perm, item.modules);
      }
    }
  }
  // Pages that left the sidebar keep exactly the gate they had.
  for (const item of OFF_MENU.flatMap(withChildren)) {
    put(item.to, item.perm, item.modules);
    for (const owned of item.owns ?? []) put(owned, item.perm, item.modules);
  }
  for (const extra of EXTRA_ROUTES) put(extra.path, extra.perm, extra.modules);

  return { perms, modules };
}

const TABLES = build();

/**
 * Route → the permissions that open it, ANY ONE of which is enough.
 * Generated; do not edit.
 */
export const ROUTE_PERMISSIONS_ANY: Record<string, string[]> = TABLES.perms;

/** The same table with one name per route, for display and for old callers. */
export const ROUTE_PERMISSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(TABLES.perms).map(([route, perms]) => [route, perms[0]]),
);

/** Route → the store modules it needs, ALL of them. Generated; do not edit. */
export const ROUTE_MODULES_ALL: Record<string, string[]> = TABLES.modules;

/**
 * Kept for callers that only want one module name. A page can genuinely need
 * two (the marketing ads pages need `marketing` AND `ads_management`) — use
 * `modulesForPath` where the answer matters.
 */
export const ROUTE_MODULES: Record<string, string> = Object.fromEntries(
  Object.entries(TABLES.modules).map(([route, mods]) => [route, mods[0]]),
);

function longestPrefixMatch<T>(table: Record<string, T>, pathname: string): T | null {
  const p = ('/' + pathname.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  let best: T | null = null;
  let bestLen = -1;
  for (const [route, value] of Object.entries(table)) {
    if ((p === route || p.startsWith(route + '/')) && route.length > bestLen) {
      best = value;
      bestLen = route.length;
    }
  }
  return best;
}

/**
 * The permission a pathname requires, or null when login alone is enough.
 * Longest matching prefix wins so a specific child overrides its parent.
 */
export function permissionsForPath(pathname: string): string[] {
  return longestPrefixMatch(ROUTE_PERMISSIONS_ANY, pathname) ?? [];
}

/** The first of them — for a message, never for the decision. */
export function permissionForPath(pathname: string): string | null {
  return permissionsForPath(pathname)[0] ?? null;
}

/** Every store module a pathname requires (empty when it is always available). */
export function modulesForPath(pathname: string): string[] {
  return longestPrefixMatch(ROUTE_MODULES_ALL, pathname) ?? [];
}

/** The first store module a pathname requires, or null. */
export function moduleForPath(pathname: string): string | null {
  return modulesForPath(pathname)[0] ?? null;
}
