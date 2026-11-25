/**
 * Product services (PSVC-1, owner 25 Nov 2026: "product cost according to proposal, what we give in
 * proposal, so its easy for us and them to see how many products have a+ content, on what they want
 * custom made image, or ai images or ai content or human content").
 *
 * The shapes are the backend's views (growcord-rs apps/platform/core/src/api/product_services.rs:
 * ProductServicesView, ServiceRateView, ServiceTotalView, ServiceItemView, ServiceAskView). Money is
 * paise, before GST. The backend has no route that lists the kinds; KINDS mirrors its closed list,
 * each with the plain words the owner gave.
 */

export interface ServiceRate {
  kind: string;
  /** Paise before GST; null when Growcord has not priced it for this store yet. */
  rate_minor: number | null;
  list_rate_minor: number | null;
  currency: string;
  proposal_ref: string | null;
  effective_from: string | null;
}

export interface ServiceTotal {
  kind: string;
  requested: number;
  in_progress: number;
  delivered: number;
  cancelled: number;
  open_value_minor: number;
  delivered_value_minor: number;
  /** Rows not cancelled that carry no rate yet. */
  unpriced: number;
}

export interface ProductServicesSummary {
  rates: ServiceRate[];
  totals: ServiceTotal[];
  catalogue: { active_products: number; with_a_plus: number };
}

export interface ServiceItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  kind: string;
  status: 'requested' | 'in_progress' | 'delivered' | 'cancelled' | string;
  rate_minor: number | null;
  list_rate_minor: number | null;
  currency: string;
  /** `store` (asked by the store) or `growcord` (recorded by Growcord). */
  source: string;
  note: string | null;
  requested_by: string;
  requested_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface ServiceAskResult {
  created: number;
  skipped: number;
  not_found: number;
  items: ServiceItem[];
}

export const KINDS: ReadonlyArray<{ value: string; label: string; detail?: string; short: string }> = [
  { value: 'catalogue_programme', label: 'Catalogue programme', detail: 'content, pricing, compliance, listing, SEO, translation', short: 'Catalogue' },
  { value: 'a_plus', label: 'A+ content', detail: 'designed graphic set', short: 'A+' },
  { value: 'custom_images', label: 'Custom made images', short: 'Custom images' },
  { value: 'ai_images', label: 'AI images', short: 'AI images' },
  { value: 'ai_content', label: 'AI content', short: 'AI content' },
  { value: 'human_content', label: 'Human written content', short: 'Human content' },
];

export const kindLabel = (k: string | null | undefined): string =>
  KINDS.find((x) => x.value === k)?.label ?? String(k ?? '').replace(/_/g, ' ');
export const kindShort = (k: string | null | undefined): string =>
  KINDS.find((x) => x.value === k)?.short ?? kindLabel(k);

export const SERVICE_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'blue' | 'neutral' }> = {
  requested: { label: 'Asked', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** The request list's status filter: `open` is the server's "asked or in progress". */
export const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'open', label: 'Open (asked or in progress)' },
  { value: 'requested', label: 'Asked' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
];

/** The most products one ask takes (product_services.rs MAX_PRODUCTS). */
export const MAX_ASK_PRODUCTS = 500;

export function asSummary(d: unknown): ProductServicesSummary | null {
  const o = d as Partial<ProductServicesSummary> | null;
  if (!o || typeof o !== 'object') return null;
  return {
    rates: Array.isArray(o.rates) ? o.rates : [],
    totals: Array.isArray(o.totals) ? o.totals : [],
    catalogue: {
      active_products: Number(o.catalogue?.active_products ?? 0) || 0,
      with_a_plus: Number(o.catalogue?.with_a_plus ?? 0) || 0,
    },
  };
}

export const asItems = (d: unknown): ServiceItem[] => (Array.isArray(d) ? (d as ServiceItem[]) : []);
