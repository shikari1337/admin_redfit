/**
 * Warm the chunk a group is about to need, while the pointer is still on it.
 *
 * Every page is `React.lazy` now, so the first click on a group pays for its
 * chunk. Hovering the group heading is ~200 ms of free time; starting the
 * fetch there makes the click feel instant and costs nothing if the user never
 * clicks (the browser keeps the module in its cache either way).
 *
 * One landing page per group, not the whole group — prefetching everything
 * would put the bundle back where it started, one hover at a time. The
 * specifier must be a literal for vite to see it, so it is written here as well
 * as in `App.tsx`; the two resolve to the SAME chunk, which is the point.
 */
const LANDING: Record<string, () => Promise<unknown>> = {
  home: () => import('../../pages/Dashboard'),
  sell: () => import('../../pages/Orders'),
  stock: () => import('../../pages/Products'),
  money: () => import('../../pages/panels/GeneralLedger'),
  insights: () => import('../../pages/analytics/AnalyticsDashboard'),
  settings: () => import('../../pages/SettingsCenter'),
};

const warmed = new Set<string>();

/** Idempotent, never throws — a failed prefetch must not reach the UI. */
export function prefetchGroup(groupId: string): void {
  if (warmed.has(groupId)) return;
  warmed.add(groupId);
  LANDING[groupId]?.().catch(() => { /* the real navigation will report it */ });
}
