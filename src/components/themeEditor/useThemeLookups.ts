import { useEffect, useState } from 'react';
import { categoriesAPI, menusAPI, pagesAPI } from '../../services/api';

/**
 * The store's own lists a theme setting can point at, read once per editor visit through the admin's existing
 * reads (categories, menus, pages): no new endpoint, no list typed here. Values are what the theme host reads as
 * handles (growcord-rs apps/commerce contracts/storefront.rs): a collection is a category by its slug, a menu is
 * its location (else its slug), a page is its slug.
 */
export interface LookupItem { value: string; label: string; hint?: string }
export interface ThemeLookups { collections: LookupItem[]; menus: LookupItem[]; pages: LookupItem[]; loading: boolean }

const rowsOf = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  for (const k of ['data', 'items', 'categories', 'menus', 'pages']) {
    const v = res?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') { const inner = rowsOf(v); if (inner.length) return inner; }
  }
  return [];
};

const byLabel = (a: LookupItem, b: LookupItem) => a.label.localeCompare(b.label);

export function useThemeLookups(): ThemeLookups {
  const [state, setState] = useState<ThemeLookups>({ collections: [], menus: [], pages: [], loading: true });
  useEffect(() => {
    let alive = true;
    Promise.allSettled([categoriesAPI.list({ active: 'all' }), menusAPI.list(), pagesAPI.getAll()]).then(([c, m, p]) => {
      if (!alive) return;
      const collections = (c.status === 'fulfilled' ? rowsOf(c.value) : [])
        .filter((r: any) => r?.slug)
        .map((r: any) => ({ value: String(r.slug), label: String(r.name || r.title || r.slug), hint: r.is_active === false || r.isActive === false ? 'hidden' : undefined }))
        .sort(byLabel);
      const menus = (m.status === 'fulfilled' ? rowsOf(m.value) : [])
        .map((r: any) => {
          const loc = typeof r?.location === 'string' && r.location ? r.location : null;
          const handle = loc || r?.slug || r?.handle;
          return handle ? { value: String(handle), label: String(r.name || r.title || handle), hint: String(handle) } : null;
        })
        .filter(Boolean) as LookupItem[];
      const pages = (p.status === 'fulfilled' ? rowsOf(p.value) : [])
        .filter((r: any) => r?.slug && (r.type || r.pageType) !== 'homepage')
        .map((r: any) => ({ value: String(r.slug), label: String(r.title || r.slug) }))
        .sort(byLabel);
      setState({ collections, menus: menus.sort(byLabel), pages, loading: false });
    });
    return () => { alive = false; };
  }, []);
  return state;
}
