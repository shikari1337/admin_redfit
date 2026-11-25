import { useEffect, useState } from 'react';
import { themeEngineAPI } from '../../services/themeEngine';

/**
 * Whether this store's website runs on a theme (a live row in Themes), and which one. On such a store the theme
 * draws every page: the home page is the theme's `index` template (edited in the theme editor) and a content page
 * shows its `custom_html` (growcord-rs apps/commerce contracts/storefront.rs page_of), not the page's content
 * blocks or builder canvas. The Pages screens use this to send each edit where it shows.
 * One read per admin visit, shared by every screen that asks.
 */
export interface LiveTheme { loading: boolean; id: string | null; name: string | null }

let cached: Promise<{ id: string | null; name: string | null }> | null = null;

function load() {
  if (!cached) {
    cached = themeEngineAPI.list()
      .then((r) => {
        const live = r.themes.find((t) => t.id === r.activeThemeId) || null;
        return { id: r.activeThemeId, name: live ? live.name : null };
      })
      .catch(() => { cached = null; return { id: null, name: null }; });
  }
  return cached;
}

export function useLiveTheme(): LiveTheme {
  const [state, setState] = useState<LiveTheme>({ loading: true, id: null, name: null });
  useEffect(() => {
    let alive = true;
    load().then((t) => { if (alive) setState({ loading: false, ...t }); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** The theme editor address for one template of the live theme. */
export const themeEditorUrl = (themeId: string, template = 'index') => `/themes/${themeId}/customize?template=${encodeURIComponent(template)}`;
