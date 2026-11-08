/**
 * Where each Facebook and Instagram screen and each Ads screen lives (the redesigned Marketing menu, META-MASTER
 * section 1). One list, so a moved page is re-pointed here and nowhere else; `lib/menu.ts` names the same paths.
 */
import { metaMockOn } from '@/lib/v2/areas/meta';
import type { MetaTab } from './useMetaCtx';

export const META_ROUTES = {
  setup: '/panel/marketing/meta',
  catalog: '/panel/marketing/meta/catalog',
  instagram: '/panel/marketing/meta/instagram',
  /** Events health (META-15B): what Meta received per day and event, match quality, test events. */
  events: '/panel/marketing/meta/events',
} as const;

/** Social and inbox pages (lane META-15B): the Publisher, comments, social insights, the inbox and its settings. */
export const SOCIAL_ROUTES = {
  publisher: '/panel/marketing/social/publisher',
  comments: '/panel/marketing/social/comments',
  insights: '/panel/marketing/social/insights',
  inbox: '/panel/marketing/inbox',
  messengerSettings: '/panel/marketing/inbox/settings',
} as const;

export const ADS_ROUTES = {
  manager: '/panel/marketing/ads/manager',
  create: '/panel/marketing/ads/create',
  audiences: '/panel/marketing/ads/audiences',
  library: '/panel/marketing/ads/library',
  rules: '/panel/marketing/ads/rules',
  analytics: '/panel/marketing/ads/analytics',
  /** Lead forms and the leads they brought (META-15B). */
  leads: '/panel/marketing/ads/leads',
} as const;

/** The old tabbed page's tabs, and the page each one became. */
export const TAB_ROUTE: Record<MetaTab, string> = {
  setup: META_ROUTES.setup,
  catalog: META_ROUTES.catalog,
  instagram: META_ROUTES.instagram,
  campaigns: ADS_ROUTES.manager,
  events: META_ROUTES.events,
};

/**
 * A path plus `extra` query, keeping the development mock flags when the mock is on (so moving between sample
 * screens stays on sample data). In a production build `metaMockOn()` is false and nothing is added.
 */
export function metaHref(path: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra);
  if (metaMockOn()) {
    try {
      const cur = new URLSearchParams(window.location.search);
      for (const k of ['mock', 'mockvariant']) { const v = cur.get(k); if (v) q.set(k, v); }
    } catch { /* no window */ }
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
