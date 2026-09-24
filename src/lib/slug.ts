/**
 * Slugify — shared by the admin forms that derive a URL-safe slug from a name
 * client-side (the backend re-derives its own on save; this is only for the
 * live preview / default-before-first-edit). One canonical body instead of
 * two near-identical inline copies (`pages/BundleForm.tsx`,
 * `components/product/ProductAttributes.tsx`).
 */
export const slugify = (s: unknown, maxLength?: number): string => {
  const out = String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return typeof maxLength === 'number' ? out.slice(0, maxLength) : out;
};
