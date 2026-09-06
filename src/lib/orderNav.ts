/**
 * Order-to-order navigation context (Orders list → Order Detail).
 *
 * The Orders list is the only place that knows the CURRENT ordering of orders
 * (its own filters, search and sort), so it publishes the page it just fetched
 * here and Order Detail reads it to offer "← Previous order / Next order →".
 *
 * Why sessionStorage and not a route/state hand-off: staff open an order from
 * the list, act on it, hit browser-Back, open the next one — and also deep-link
 * to an order from an email or WhatsApp. A per-tab store survives all of those
 * without turning the order URL into something unshareable. Nothing here is
 * authoritative: it is a navigation convenience, and every consumer must behave
 * correctly when it is missing, stale, or does not contain the current order.
 */

const KEY = 'admin:orderNav';
/** Older than this and the list has almost certainly moved on — ignore it. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface OrderNavContext {
  /** Order UUIDs, in the exact order the list rendered them. */
  ids: string[];
  /** id → printed order number ("SM-9187"), for the Prev/Next button labels. */
  labels: Record<string, string>;
  /** Offset of `ids[0]` within the whole filtered result set. */
  offset: number;
  /** Page size the list used, so a neighbouring page can be re-fetched identically. */
  limit: number;
  /** Total orders matching the list's filters (for "Order 12 of 1,320"). */
  total: number;
  /** The list's filter/search params, replayed verbatim to fetch a neighbouring page. */
  params: Record<string, unknown>;
  savedAt: number;
}

export function saveOrderNav(ctx: Omit<OrderNavContext, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...ctx, savedAt: Date.now() }));
  } catch {
    /* private mode / quota — navigation buttons simply won't appear. */
  }
}

export function loadOrderNav(): OrderNavContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as OrderNavContext;
    if (!Array.isArray(ctx.ids) || !ctx.ids.length) return null;
    if (!ctx.savedAt || Date.now() - ctx.savedAt > MAX_AGE_MS) return null;
    return { ...ctx, labels: ctx.labels ?? {} };
  } catch {
    return null;
  }
}
