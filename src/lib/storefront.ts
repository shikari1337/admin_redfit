/**
 * Links to the store's OWN public website — the one place the admin builds them.
 *
 * The admin is a single build that serves every store (admin.homeomed.in,
 * app.growcord.in, admin.redfit.in …), so the site a link points at cannot be a
 * build setting. It used to be `VITE_STOREFRONT_URL || 'http://localhost:3000'`
 * in five files; production never set the variable, so every "open on the
 * website" link — the product name in an order, the category and page previews —
 * sent staff to localhost.
 *
 * The origin now comes from the SERVER, per store, on `/auth/me` (`site_url`),
 * resolved by the same `store_domains` → `stores.domain` chain every customer
 * email and pay link already uses. When the server cannot resolve one, these
 * return `null` and the caller renders plain text — a link that goes nowhere
 * useful is worse than no link.
 */
import { useAuth } from '../contexts/AuthContext';

const trim = (s: string) => s.replace(/\/+$/, '');

/** This store's website origin, e.g. `https://homeomed.in`, or null. */
export function useStoreSiteUrl(): string | null {
  const { user } = useAuth();
  const raw = user?.site_url;
  return raw && /^https?:\/\//i.test(raw) ? trim(raw) : null;
}

/**
 * A product's page. PLURAL `/products/…` on purpose — it is the one path every
 * storefront on the platform answers (the single-product app routes it natively;
 * the Next storefront permanently redirects it to its own `/product/…` page).
 * Mirrors `productPageUrl` in `backend/src/services/storeUrls.ts`.
 */
export const productPageUrl = (site: string | null, slug?: string | null): string | null =>
  site && slug ? `${site}/products/${encodeURIComponent(slug)}` : null;

export const categoryPageUrl = (site: string | null, slug?: string | null): string | null =>
  site && slug ? `${site}/category/${encodeURIComponent(slug)}` : null;

export const cmsPageUrl = (site: string | null, slug?: string | null): string | null =>
  site && slug ? `${site}/pages/${encodeURIComponent(slug)}` : null;
