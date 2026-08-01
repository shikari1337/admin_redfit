/**
 * Product targeting (ADR-002 — modular sellable-per-product suite).
 *
 * ONE admin codebase ships as many SELLABLE products. A product is selected at
 * BUILD time via `VITE_PRODUCT` and deployed at its own domain (e.g. Books at
 * `books.growcord.*` with VITE_PRODUCT=books). The build scopes the UI to that
 * product's workspace(s) + branding + default landing; the backend module
 * registry already meters/bills the matching modules, so the two line up.
 *
 * VITE_PRODUCT unset (or 'suite') = the full multi-workspace admin (today's app).
 * Add a product here + deploy with its VITE_PRODUCT to mint a new sellable app.
 */
import type { WorkspaceKey } from './rbac';

export type ProductKey = 'suite' | 'books' | 'commerce' | 'marketing' | 'inventory' | 'seo';

interface ProductDef {
  key: ProductKey;
  /** Shown on the login card + shell header. */
  name: string;
  /** Logo glyph. */
  short: string;
  /** Workspaces this product exposes; `null` = all (the full suite admin). */
  workspaces: WorkspaceKey[] | null;
  /** Default landing route after login. */
  home: string;
}

const PRODUCTS: Record<ProductKey, ProductDef> = {
  suite:     { key: 'suite',     name: 'Growcord Admin',     short: 'G', workspaces: null,                                  home: '/dashboard' },
  books:     { key: 'books',     name: 'Growcord Books',     short: 'B', workspaces: ['accounting'],                       home: '/panel/accounting' },
  commerce:  { key: 'commerce',  name: 'Growcord Commerce',  short: 'C', workspaces: ['commerce', 'orders', 'inventory'],  home: '/dashboard' },
  marketing: { key: 'marketing', name: 'Growcord Marketing', short: 'M', workspaces: ['marketing'],                        home: '/panel/marketing' },
  inventory: { key: 'inventory', name: 'Growcord Inventory', short: 'I', workspaces: ['inventory', 'purchasing'],          home: '/panel/inventory' },
  seo:       { key: 'seo',       name: 'Growcord SEO',       short: 'S', workspaces: ['commerce'],                         home: '/seo' },
};

function resolveProduct(): ProductDef {
  const raw = ((import.meta as any).env?.VITE_PRODUCT || 'suite') as ProductKey;
  return PRODUCTS[raw] ?? PRODUCTS.suite;
}

/** The product this build targets. */
export const PRODUCT: ProductDef = resolveProduct();

/** True for the full multi-workspace admin (no single-product scoping). */
export const IS_SUITE = PRODUCT.workspaces === null;

/** Whether the current product exposes a given workspace. */
export function productAllowsWorkspace(w: WorkspaceKey): boolean {
  return PRODUCT.workspaces === null || PRODUCT.workspaces.includes(w);
}
