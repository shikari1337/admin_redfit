/**
 * THE admin menu — and therefore THE admin gating table.
 *
 * Until now there were three answers to "may this user open this page", written
 * in three files that disagreed with each other (L5 §1):
 *   1. six hand-written menu arrays inside `components/Layout.tsx` (545 lines),
 *      one per "workspace", each re-declaring the same routes with their own
 *      `canAccess(...) && hasPerm(...)` conditions — `/vendors` appeared in four;
 *   2. `lib/routePermissions.ts`, a second hand-kept table read by `RouteGuard`,
 *      which simply had no row for most `/panel/*` pages;
 *   3. `<ProtectedModuleRoute module="...">` wrappers in `App.tsx`, a third
 *      module check that contradicted (2) on `/panel/marketing/ads`,
 *      `/panel/marketing/connections` and `/panel/marketing/google-reviews`.
 *
 * This file is the only one. The sidebar renders from `MENU`; `routePermissions.ts`
 * is DERIVED from `MENU` + `EXTRA_ROUTES`, so a link that exists is a link the
 * guard agrees with, and a page with no menu entry still has a gate.
 *
 * Rules the entries obey:
 *  · `label` is a NAME, at most two words. Never a sentence, never a verb phrase.
 *  · `tip` is the one line shown on hover — where the explanation goes.
 *  · `perm` is the backend permission the page's own API needs (`<area>.<action>`,
 *    `kernel/rbac/roles.ts`). `modules` are the store features it needs, ALL of
 *    them — the marketing ads pages genuinely need `marketing` AND
 *    `ads_management`, which is why one string was never enough.
 *  · `owns` lists child routes (a `/new`, an `/:id/edit`, a callback) that are not
 *    listed in the menu but inherit the item's gate.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Home, ShoppingCart, Package2, Wallet, Truck, Users, LineChart, Settings,
  RotateCcw, Undo2, FileText, Store, Megaphone, Ticket, Plug, Palette, Star,
  BookOpen, HelpCircle, Heart, MessageCircleQuestion, Images, Rss, Building2,
  PackageSearch, Warehouse, Scale, ArrowLeftRight, Boxes, Hammer, Handshake,
  Network, ShieldCheck, FileSpreadsheet, Coins, CalendarClock, Mail, Repeat,
  Bell, SlidersHorizontal, FolderArchive, UserCheck, Sparkles, Gauge, Bot, KeyRound, ExternalLink,
} from 'lucide-react';

export interface MenuItem {
  /** Plain name, ≤ 2 words. */
  label: string;
  /** Route, or an absolute https:// address for another Growcord panel. */
  to: string;
  /** One line, shown on hover. The menu itself carries no sentences. */
  tip: string;
  /**
   * Backend permission this page needs. Absent = login is enough. An ARRAY
   * means any ONE of them is enough — the warehouse routes deliberately accept
   * `warehouse.operate` OR the older `inventory.adjust` while both are in use
   * (WS-C's dual-accept window), and one string could not say that.
   */
  perm?: string | string[];
  /** Store modules this page needs — ALL of them. */
  modules?: string[];
  icon?: LucideIcon;
  /** Unlisted child routes that inherit this item's gate. */
  owns?: string[];
  /** Opens in a new tab (another panel on gc.mw). */
  external?: boolean;
}

export interface MenuSubGroup {
  label: string;
  items: MenuItem[];
}

export interface MenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Where clicking the group itself lands (the first thing it can open). */
  home: string;
  subs: MenuSubGroup[];
}

/* ───────────────────── sibling products (link items) ───────────────────── */

/** Dev ports — `suite/scripts/scaffold.mjs` APPS, the one list of them. */
const DEV_PORTS: Record<string, number> = {
  books: 5201, ship: 5202, comms: 5203, insights: 5204, make: 5205, wms: 5206,
  trade: 5207, retail: 5208, reach: 5209, people: 5210, links: 5211, crm: 5212, finance: 5213,
};

/** This console's own label — the one swapped out to address a sibling. */
const SELF = 'admin';

/**
 * The address of another Growcord product, derived from THIS console's hostname.
 * The rule is `suite/apps/hub/src/catalog.ts siblingOrigin`, copied, not invented:
 *   admin.gc.mw          → books.gc.mw
 *   admin-acme.gc.mw     → books-acme.gc.mw
 *   admin.homeomed.in    → books.homeomed.in
 *   localhost:5324       → localhost:5201 (the dev port map)
 * Never a hand-typed host.
 *
 * T5 replaces this with kit productLinks.urlFor
 */
export function productUrl(product: string, path = ''): string {
  if (typeof window === 'undefined') return path || '/';
  const { protocol, hostname, port } = window.location;
  const labels = hostname.split('.');
  let origin = '';
  if (labels.length >= 2) {
    const first = labels[0];
    let swapped: string | null = null;
    if (first === SELF) swapped = product;
    else if (first.startsWith(SELF + '-')) swapped = `${product}-${first.slice(SELF.length + 1)}`;
    if (swapped) origin = `${protocol}//${[swapped, ...labels.slice(1)].join('.')}${port ? `:${port}` : ''}`;
  }
  if (!origin && DEV_PORTS[product]) origin = `${protocol}//${hostname}:${DEV_PORTS[product]}`;
  return origin + path;
}

/* ─────────────────── the registry's areas, as menu items ─────────────────── */

/**
 * `SETTINGS_GROUPS` in backend/src/config/settingsRegistry.ts, by number.
 * Kept in this shape so the Settings group reads like the catalog
 * (`docs/SETTINGS_CATALOG.md`) a store owner is quoted numbers from. It is a
 * MIRROR, the way `lib/rbac.ts` mirrors `kernel/rbac/roles.ts` — the Settings
 * Center compares the two against the live registry and says so on screen when
 * a group exists on one side only.
 */
export const SETTINGS_AREA_LIST: Array<{ no: number; id: string; label: string }> = [
  { no: 1, id: 'store', label: 'Store & identity' },
  { no: 2, id: 'checkout', label: 'Checkout & payments' },
  { no: 3, id: 'shipping', label: 'Shipping & delivery' },
  { no: 4, id: 'tax', label: 'Tax & GST' },
  { no: 5, id: 'orders', label: 'Orders & returns' },
  { no: 6, id: 'catalog', label: 'Catalog & products' },
  { no: 7, id: 'customers', label: 'Customers & login' },
  { no: 8, id: 'communication', label: 'WhatsApp, SMS & email' },
  { no: 9, id: 'marketing', label: 'Marketing & consent' },
  { no: 10, id: 'integrations', label: 'Integrations & keys' },
  { no: 11, id: 'appearance', label: 'Appearance' },
  { no: 12, id: 'seo', label: 'SEO & tracking' },
  { no: 13, id: 'accounting', label: 'Accounting & books' },
  { no: 14, id: 'inventory', label: 'Inventory & warehouse' },
  { no: 15, id: 'pos', label: 'POS counter' },
  { no: 16, id: 'access', label: 'Staff & access' },
  { no: 17, id: 'modules', label: 'Modules & plan' },
  { no: 18, id: 'platform', label: 'Set by platform' },
  { no: 19, id: 'developer', label: 'Developer' },
];

const SETTINGS_AREA_ITEMS: MenuItem[] = SETTINGS_AREA_LIST.map((g) => ({
  label: `${g.no}. ${g.label}`,
  to: `/settings?group=${g.id}`,
  tip: `Settings area ${g.no} — ${g.label.toLowerCase()}.`,
  perm: 'settings.read',
}));

/* ───────────────────────────── the menu ───────────────────────────── */

export const MENU: MenuGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    home: '/dashboard',
    subs: [
      {
        label: 'Today',
        items: [
          { label: 'Home', to: '/dashboard', icon: Home, tip: 'What needs you today, then the numbers.' },
          { label: 'Setup', to: '/setup-guide', icon: HelpCircle, perm: 'settings.read', tip: 'The steps left before this store is ready to sell.' },
        ],
      },
    ],
  },

  {
    id: 'sell',
    label: 'Sell',
    icon: ShoppingCart,
    home: '/orders',
    subs: [
      {
        label: 'Orders',
        items: [
          { label: 'Orders', to: '/orders', icon: ShoppingCart, perm: 'orders.read', tip: 'Every order, from every channel.', owns: ['/orders/:id'] },
          { label: 'Order desk', to: '/panel/orders', icon: Gauge, perm: 'orders.read', tip: 'The day at a glance: to confirm, to pack, to chase.' },
          { label: 'New order', to: '/orders/new', icon: ShoppingCart, perm: 'orders.manage', tip: 'Key in an order on a customer’s behalf.' },
          { label: 'Counter', to: '/pos', icon: Store, perm: 'orders.manage', modules: ['pos'], tip: 'Sell over the counter and take payment now.' },
          { label: 'Abandoned carts', to: '/orders/abandoned-carts', icon: ShoppingCart, perm: 'orders.read', tip: 'Carts that were filled but never paid for.', owns: ['/orders/abandoned-carts/:id'] },
          { label: 'Quotations', to: '/panel/orders/quotations', icon: FileText, perm: 'orders.read', tip: 'Prices offered to a buyer before an order exists.' },
          { label: 'Documents', to: '/panel/orders/documents', icon: FileText, perm: 'orders.read', tip: 'Credit notes, debit notes and delivery challans.' },
          { label: 'Returns', to: '/returns', icon: RotateCcw, perm: 'returns.read', modules: ['returns'], tip: 'What a customer sent back, and where it is.' },
          { label: 'Refunds', to: '/panel/orders/refunds', icon: Undo2, perm: 'orders.manage', tip: 'Money to send back: requested, approved, paid.' },
          { label: 'Sales team', to: '/panel/orders/sales-team', icon: UserCheck, perm: 'reports.read', tip: 'Who sold what, and who is handling it now.' },
          { label: 'Ship ↗', to: productUrl('ship', ''), external: true, icon: ExternalLink, perm: 'orders.read', tip: 'Opens Growcord Ship in this tab — parcels, pickups and COD payouts.' },
          { label: 'CRM ↗', to: productUrl('crm', '/playbooks'), external: true, icon: ExternalLink, perm: 'marketing.read', modules: ['crm'], tip: 'Opens Growcord CRM in this tab — follow-up playbooks.' },
        ],
      },
      {
        label: 'Customers',
        items: [
          { label: 'Customers', to: '/customers', icon: Users, perm: 'customers.read', tip: 'Everyone who has bought or signed up.', owns: ['/customers/:id', '/users', '/users/:id'] },
          { label: 'Duplicates', to: '/customers/duplicates', icon: Users, perm: 'customers.read', tip: 'One person on two records — merge them.' },
          { label: 'Wholesale', to: '/b2b', icon: Building2, perm: 'b2b.read', modules: ['b2b'], tip: 'Trade accounts, their tier and their price list.' },
          { label: 'Credit', to: '/panel/customers/credit', icon: ShieldCheck, perm: 'customers.read', tip: 'Who owes money and who is over their limit.' },
          { label: 'CRM ↗', to: productUrl('crm', '/contacts'), external: true, icon: ExternalLink, perm: 'marketing.read', modules: ['crm'], tip: 'Opens Growcord CRM in this tab — enquiries and contacts.' },
        ],
      },
      {
        label: 'Marketing',
        items: [
          { label: 'Overview', to: '/panel/marketing', icon: Megaphone, perm: 'marketing.read', modules: ['marketing'], tip: 'What is running and what it is bringing in.' },
          { label: 'Campaigns', to: '/panel/marketing/campaigns', icon: Megaphone, perm: 'marketing.read', modules: ['marketing'], tip: 'One panel per channel: SMS, WhatsApp, email, push.', owns: ['/panel/marketing/campaigns/:channel'] },
          { label: 'Audiences', to: '/panel/marketing/audiences', icon: Users, perm: 'marketing.manage', modules: ['marketing'], tip: 'Saved lists of people to send to.' },
          { label: 'Coupons', to: '/coupons', icon: Ticket, perm: 'marketing.read', modules: ['coupons'], tip: 'Discount codes and who may use them.', owns: ['/coupons/new', '/coupons/:id/edit'] },
          { label: 'Ads', to: '/panel/marketing/ads', icon: LineChart, perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Google and Meta campaigns, spend and results.', owns: ['/panel/marketing/ads/oauth/callback'] },
          { label: 'Ad studio', to: '/panel/marketing/ads/ai-studio', icon: Sparkles, perm: 'ads.read', modules: ['marketing', 'ads_management', 'connectors'], tip: 'AI drafts a campaign; you review before anything runs.' },
          { label: 'Ad audiences', to: '/panel/marketing/ads/audiences', icon: Users, perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Custom audiences pushed to Google and Meta.' },
          { label: 'Connections', to: '/panel/marketing/connections', icon: Plug, perm: 'marketing.read', modules: ['connectors'], tip: 'Sign in to Google and Meta once; every service follows.', owns: ['/panel/marketing/connections/callback'] },
          { label: 'Search traffic', to: '/panel/marketing/connections/insights', icon: LineChart, perm: 'marketing.read', modules: ['connectors'], tip: 'What people searched for before they found you.' },
          { label: 'Google reviews', to: '/panel/marketing/google-reviews', icon: Star, perm: 'content.read', modules: ['connectors'], tip: 'Your Business Profile reviews — reply and publish.' },
          { label: 'Comms ↗', to: productUrl('comms', '/templates'), external: true, icon: ExternalLink, perm: 'marketing.read', tip: 'Opens Growcord Comms in this tab — templates and consent.' },
          { label: 'CRM ↗', to: productUrl('crm', '/playbooks'), external: true, icon: ExternalLink, perm: 'marketing.read', modules: ['crm'], tip: 'Opens Growcord CRM in this tab — automated follow-ups.' },
          { label: 'Insights ↗', to: productUrl('insights', '/marketing'), external: true, icon: ExternalLink, perm: 'reports.read', tip: 'Opens Growcord Insights in this tab — performance and growth.' },
        ],
      },
      {
        label: 'Website',
        items: [
          { label: 'Pages', to: '/appearance/pages', icon: FileText, perm: 'content.manage', tip: 'Home, policies and every other page on the shop.', owns: ['/pages/new', '/pages/:id/edit', '/pages/:id/builder'] },
          { label: 'Blog', to: '/blogs', icon: BookOpen, perm: 'content.read', modules: ['blog'], tip: 'Articles on the shop.', owns: ['/blogs/new', '/blogs/:id/edit'] },
          { label: 'Menus', to: '/appearance/menus', icon: Network, perm: 'content.manage', tip: 'The shop’s navigation, drag and drop.' },
          { label: 'Banners', to: '/appearance/banners', icon: Images, perm: 'content.manage', tip: 'The sliders and strips on the home page.' },
          { label: 'Style', to: '/appearance/style', icon: Palette, perm: 'content.manage', tip: 'Logo, colours, fonts and the notice popup.' },
          { label: 'Themes', to: '/appearance/themes', icon: Palette, perm: 'content.manage', tip: 'The storefront theme and its live editor.', owns: ['/themes/:id/customize'] },
          { label: 'Product page', to: '/appearance/products', icon: Package2, perm: 'content.manage', tip: 'What a product page shows, and in what order.' },
          { label: 'Trust badges', to: '/appearance/trust-badges', icon: ShieldCheck, perm: 'content.manage', tip: 'The reassurance strip under the buy button.' },
          { label: 'Reviews', to: '/reviews', icon: Star, perm: 'content.read', modules: ['reviews'], tip: 'Customer reviews waiting to be approved.' },
          { label: 'Questions', to: '/questions', icon: MessageCircleQuestion, perm: 'content.read', modules: ['product_qa'], tip: 'Questions asked on a product page.' },
          { label: 'FAQs', to: '/faqs', icon: HelpCircle, perm: 'content.read', tip: 'Answers reused across the shop.' },
          { label: 'Wishlists', to: '/wishlists', icon: Heart, perm: 'reports.read', modules: ['wishlist'], tip: 'What shoppers saved but have not bought.' },
          { label: 'Media', to: '/gallery', icon: Images, perm: 'content.read', tip: 'Every image this store has uploaded.' },
          { label: 'SEO', to: '/seo', icon: Rss, perm: 'content.read', tip: 'Tracking tags, redirects, robots and the sitemap.' },
        ],
      },
      {
        label: 'Channels',
        items: [
          { label: 'Channels', to: '/channels', icon: Plug, perm: 'channels.read', modules: ['channel_sync'], tip: 'Marketplaces and feeds this catalog is sold on.' },
          { label: 'Daily file', to: '/channels/daily', icon: FileSpreadsheet, perm: 'channels.read', modules: ['channel_sync'], tip: 'The manual upload/download for marketplaces with no API.' },
          { label: 'Import', to: '/channels/import', icon: FileSpreadsheet, perm: 'channels.manage', modules: ['channel_sync'], tip: 'Bring a marketplace’s orders in from their sheet.' },
          { label: 'Mapping', to: '/channels/mapping', icon: ArrowLeftRight, perm: 'channels.manage', modules: ['channel_sync'], tip: 'Which of their columns is which of your fields.' },
          { label: 'Allocation', to: '/channels/allocation', icon: Boxes, perm: 'channels.manage', modules: ['channel_sync'], tip: 'How much stock each channel may sell.' },
        ],
      },
    ],
  },

  {
    id: 'stock',
    label: 'Stock',
    icon: Package2,
    home: '/products',
    subs: [
      {
        label: 'Products',
        items: [
          { label: 'Products', to: '/products', icon: Package2, perm: 'products.read', tip: 'The catalog, every SKU.', owns: ['/products/new', '/products/:id/edit', '/products/:id/sections', '/products/:productSlug/variations/:variationKey/edit'] },
          { label: 'Categories', to: '/products/categories', icon: Boxes, perm: 'products.read', tip: 'The tree shoppers browse.' },
          { label: 'Brands', to: '/products/brands', icon: Star, perm: 'products.read', tip: 'Brands, their pages and who owns them.' },
          { label: 'Companies', to: '/products/companies', icon: Building2, perm: 'products.read', tip: 'The legal companies behind the brands.' },
          { label: 'Attributes', to: '/products/attributes', icon: SlidersHorizontal, perm: 'products.read', tip: 'Potency, size and the other axes of a variation.' },
          { label: 'Tags', to: '/products/tags', icon: Ticket, perm: 'products.read', tip: 'Free labels for grouping and filtering.', owns: ['/products/tags/new', '/products/tags/:id/edit'] },
          { label: 'Specifications', to: '/products/specifications', icon: FileText, perm: 'products.read', tip: 'Reusable spec tables for a product page.', owns: ['/products/specifications/new', '/products/specifications/:id/edit'] },
          { label: 'Size charts', to: '/products/size-charts', icon: Scale, perm: 'products.read', modules: ['size_charts'], tip: 'Measurement tables shown on a product page.' },
          { label: 'Bundles', to: '/products/bundles', icon: Boxes, perm: 'products.read', modules: ['bundles'], tip: 'Buy-more-save-more and fixed packs.', owns: ['/products/bundles/new', '/products/bundles/:id/edit'] },
          { label: 'Variant groups', to: '/products/variant-link-groups', icon: Network, perm: 'products.read', tip: 'Products that are each other’s variants.' },
          { label: 'Import', to: '/products/import-export', icon: FileSpreadsheet, perm: 'products.manage', tip: 'Bulk create and update from a sheet.' },
        ],
      },
      {
        label: 'Inventory',
        items: [
          { label: 'Stock', to: '/inventory', icon: PackageSearch, perm: 'inventory.read', modules: ['inventory'], tip: 'How many of each SKU you actually have.' },
          { label: 'Batches', to: '/panel/inventory/batches', icon: PackageSearch, perm: 'inventory.read', tip: 'Lots, their MRP and their expiry.' },
          { label: 'Reorder', to: '/panel/inventory/reorder', icon: Repeat, perm: 'inventory.read', tip: 'What to buy, how much, and from whom.' },
          { label: 'Approvals', to: '/panel/inventory/approvals', icon: ShieldCheck, perm: 'inventory.manage', tip: 'Stock changes waiting for a second pair of eyes.' },
          { label: 'Outlets', to: '/panel/inventory/outlets', icon: Store, perm: 'inventory.read', tip: 'Shops that hold their own stock.' },
          { label: 'Consignment', to: '/panel/inventory/consignment', icon: Handshake, perm: 'inventory.read', tip: 'Stock sitting with a partner, still yours.' },
          { label: 'Distributors', to: '/panel/inventory/network', icon: Network, perm: 'products.read', modules: ['b2b'], tip: 'Distributor tiers and the royalty they pay.' },
          { label: 'WMS ↗', to: productUrl('wms', '/transfer-lane'), external: true, icon: ExternalLink, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], tip: 'Opens Growcord WMS in this tab — transfers and counts.' },
          { label: 'Make ↗', to: productUrl('make', '/work-orders'), external: true, icon: ExternalLink, perm: 'inventory.read', tip: 'Opens Growcord Make in this tab — units, kits and work orders.' },
          { label: 'Insights ↗', to: productUrl('insights', '/inventory'), external: true, icon: ExternalLink, perm: 'reports.read', tip: 'Opens Growcord Insights in this tab — stock reports.' },
        ],
      },
      {
        label: 'Warehouse',
        items: [
          { label: 'Warehouses', to: '/warehouses', icon: Warehouse, perm: 'inventory.read', modules: ['inventory'], tip: 'The buildings stock is kept in.' },
          { label: 'WMS ↗', to: productUrl('wms', '/floor'), external: true, icon: ExternalLink, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], tip: 'Opens Growcord WMS in this tab — layout, picking, goods in, labels, scanner.' },
        ],
      },
      {
        label: 'Purchasing',
        items: [
          { label: 'Vendors', to: '/vendors', icon: Building2, perm: 'purchasing.read', tip: 'Who you buy from, and on what terms.', owns: ['/vendors/new', '/vendors/:id/edit'] },
          { label: 'Make ↗', to: productUrl('make', '/purchase-orders'), external: true, icon: ExternalLink, perm: 'purchasing.read', tip: 'Opens Growcord Make in this tab — purchase orders and vendor scorecard.' },
        ],
      },
    ],
  },

  {
    id: 'money',
    label: 'Money',
    icon: Wallet,
    home: '/panel/accounting/general-ledger',
    subs: [
      {
        label: 'Books',
        items: [
          { label: 'Open Books ↗', to: productUrl('books', ''), external: true, icon: ExternalLink, perm: 'accounting.read', modules: ['accounting'], tip: 'Opens Growcord Books in this tab — invoices, bills, banking, GST and the ledger.' },
          { label: 'Proformas & invoices', to: '/panel/accounting/proforma', icon: FileText, perm: 'accounting.read', modules: ['billing'], tip: 'Proforma, tax invoices and credit notes on the document kernel.' },
        ],
      },
      {
        label: 'Money in',
        items: [
          { label: 'Receipts', to: '/panel/accounting/payments-received', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Money that has come in, matched to invoices.' },
          { label: 'Recurring', to: '/panel/accounting/recurring-invoices', icon: Repeat, perm: 'accounting.read', modules: ['accounting', 'subscriptions'], tip: 'Invoices that raise themselves on a schedule.' },
          { label: 'Payouts', to: '/panel/accounting/settlements', icon: Store, perm: 'accounting.read', modules: ['accounting'], tip: 'What each marketplace paid out, and what it kept.' },
        ],
      },
      {
        label: 'Money out',
        items: [
          { label: 'Payables', to: '/panel/accounting/payables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Who you owe, and by when.' },
        ],
      },
      {
        label: 'Banking',
        items: [
          { label: 'Currencies', to: '/panel/accounting/fx', icon: Coins, perm: 'accounting.read', modules: ['accounting'], tip: 'Exchange rates and the gain or loss they cause.' },
        ],
      },
      {
        label: 'GST & tax',
        items: [
          { label: 'E-invoicing', to: '/panel/accounting/einvoicing', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting', 'einvoicing'], tip: 'IRN and QR for every invoice that needs one.' },
          { label: 'TDS', to: '/panel/accounting/tds', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], tip: 'Tax deducted on what you pay out.' },
          { label: 'TCS', to: '/panel/accounting/tcs', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], tip: 'Tax collected on what you sell.' },
        ],
      },
      {
        label: 'Ledger',
        items: [
          { label: 'Opening', to: '/panel/accounting/opening-balances', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'What each account held on day one.' },
          { label: 'General ledger', to: '/panel/accounting/general-ledger', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], tip: 'Every entry against one account.' },
          { label: 'Assets', to: '/panel/accounting/assets', icon: Building2, perm: 'accounting.read', modules: ['accounting'], tip: 'Things you own that lose value over time.' },
          { label: 'Reconciliation', to: '/panel/accounting/reconciliation', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'Where the books and the operations disagree.' },
          { label: 'Number series', to: '/panel/accounting/series-gaps', icon: FileSpreadsheet, perm: 'accounting.read', modules: ['accounting'], tip: 'Gaps in a document number series.' },
          { label: 'Audit trail', to: '/panel/accounting/audit', icon: ShieldCheck, perm: 'audit.read', modules: ['accounting'], tip: 'Who changed what, in order, unalterable.' },
          { label: 'Documents', to: '/panel/accounting/documents', icon: FolderArchive, perm: 'accounting.read', modules: ['accounting'], tip: 'Files attached to the books.' },
          { label: 'Jobs', to: '/panel/accounting/scheduled-jobs', icon: CalendarClock, perm: 'accounting.read', modules: ['accounting'], tip: 'Background runs and whether they succeeded.' },
          { label: 'Report mail', to: '/panel/accounting/report-schedules', icon: Mail, perm: 'accounting.read', modules: ['accounting'], tip: 'Reports emailed out on a schedule.' },
        ],
      },
    ],
  },



  {
    id: 'insights',
    label: 'Insights',
    icon: LineChart,
    home: '/analytics/dashboard',
    subs: [
      {
        label: 'Analytics',
        items: [
          { label: 'Overview', to: '/analytics/dashboard', icon: LineChart, perm: 'reports.read', modules: ['analytics'], tip: 'Sales, orders and customers over a period.' },
          { label: 'Store', to: '/analytics/store', icon: Store, perm: 'reports.read', modules: ['analytics'], tip: 'Products, categories and the checkout funnel.' },
          { label: 'Shoppers', to: '/analytics/users', icon: Users, perm: 'reports.read', modules: ['analytics'], tip: 'Who is visiting, on what, and from where.' },
          { label: 'Live', to: '/analytics/realtime', icon: Gauge, perm: 'reports.read', modules: ['analytics'], tip: 'What is happening on the shop right now.' },
          { label: 'Marketing', to: '/analytics/marketing', icon: Megaphone, perm: 'reports.read', modules: ['analytics'], tip: 'Which channel brought the order.' },
          { label: 'Custom', to: '/analytics/custom', icon: SlidersHorizontal, perm: 'reports.read', modules: ['analytics'], tip: 'Build the report you actually want.' },
        ],
      },
    ],
  },

  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    home: '/settings',
    subs: [
      {
        label: 'All settings',
        items: [
          { label: 'Search settings', to: '/settings', icon: Settings, perm: 'settings.read', tip: 'Every setting in one place — type a name or a number.' },
        ],
      },
      { label: 'By area', items: SETTINGS_AREA_ITEMS },
      {
        label: 'Store setup',
        items: [
          { label: 'Store details', to: '/settings/store-config', icon: Store, perm: 'settings.manage', tip: 'Name, address, contact, hours and social links.' },
          { label: 'Modules', to: '/settings/modules', icon: Boxes, perm: 'settings.manage', tip: 'Which features are switched on for this store.' },
          { label: 'Markets', to: '/settings/markets', icon: Network, perm: 'settings.read', tip: 'The countries you sell to and how they are priced.' },
          { label: 'Integrations', to: '/settings/api-integrations', icon: Plug, perm: 'settings.manage', tip: 'Keys for WhatsApp, email, payments and analytics.' },
          { label: 'Setup wizard', to: '/setup', icon: Sparkles, perm: 'settings.manage', tip: 'Walk the guided setup again.' },
        ],
      },
      {
        label: 'Selling rules',
        items: [
          { label: 'Payments', to: '/settings/payment-gateways', icon: Wallet, perm: 'settings.manage', tip: 'Razorpay, UPI and bank transfer.' },
          { label: 'Payment rules', to: '/settings/payment-discount', icon: Ticket, perm: 'settings.manage', tip: 'When COD is allowed, and prepaid discounts.' },
          { label: 'Order numbers', to: '/settings/order-numbering', icon: FileSpreadsheet, perm: 'settings.manage', tip: 'The prefix and counter new orders take.' },
          { label: 'Returns policy', to: '/settings/return-policies', icon: RotateCcw, perm: 'settings.manage', modules: ['returns'], tip: 'How long a customer has, and what comes back.' },
          { label: 'Cart recovery', to: '/settings/cart-recovery-automation', icon: Bot, perm: 'settings.manage', tip: 'The messages sent when a cart is left behind.' },
        ],
      },
      {
        label: 'Tax & invoice',
        items: [
          { label: 'GST', to: '/settings/gst', icon: FileSpreadsheet, perm: 'settings.manage', tip: 'Whether prices include tax, and how it is shown.' },
          { label: 'Tax rules', to: '/settings/tax-rules', icon: FileSpreadsheet, perm: 'settings.manage', modules: ['gst_tax'], tip: 'HSN code to rate, with effective dates.' },
          { label: 'Invoice', to: '/settings/invoice', icon: FileText, perm: 'settings.manage', tip: 'Legal name, GSTIN, licences, bank and the layout.' },
          { label: 'Manufacturers', to: '/settings/manufacturers', icon: Building2, perm: 'products.manage', modules: ['manufacturers'], tip: 'The makers named on a product and its invoice.' },
        ],
      },
      {
        label: 'Shipping',
        items: [
          { label: 'Delivery', to: '/settings/shipping', icon: Truck, perm: 'settings.manage', tip: 'Fees, free-shipping threshold, zones and couriers.' },
          { label: 'Boxes', to: '/settings/packages', icon: Boxes, perm: 'settings.manage', tip: 'The cartons you pack into, and their size.' },
        ],
      },
      {
        label: 'Access',
        items: [
          { label: 'Staff', to: '/settings/staff', icon: ShieldCheck, perm: 'staff.manage', tip: 'Who can sign in, and what each of them may do.' },
          { label: 'Audit', to: '/logs', icon: FileText, perm: 'audit.read', tip: 'What happened in this admin, and who did it.' },
        ],
      },
      {
        label: 'Plan',
        items: [
          { label: 'Plan', to: '/settings/billing', icon: Wallet, perm: 'billing.read', tip: 'Your plan, commission and Growcord’s invoices to you.' },
          { label: 'Wallet', to: '/settings/wallet', icon: Coins, perm: 'billing.read', tip: 'The balance shipping and messaging are paid from.' },
        ],
      },
      {
        label: 'Messages & forms',
        items: [
          { label: 'Templates', to: '/settings/sms-templates', icon: Mail, perm: 'settings.manage', tip: 'The SMS and WhatsApp bodies the store sends.' },
          { label: 'Enquiries', to: '/settings/contact', icon: Mail, perm: 'settings.manage', tip: 'What people sent through the contact form.' },
        ],
      },
      {
        label: 'Advanced',
        items: [
          { label: 'Doc templates', to: '/panel/settings/templates', icon: FileText, perm: 'settings.manage', tip: 'How an invoice or a challan is laid out.' },
          { label: 'Custom fields', to: '/panel/settings/custom-fields', icon: SlidersHorizontal, perm: 'settings.manage', tip: 'Extra fields on your own records.' },
          { label: 'Tools', to: '/settings/directory', icon: KeyRound, perm: 'settings.read', tip: 'Refresh the website’s cache; set this browser’s store key.' },
        ],
      },
    ],
  },
];

/**
 * Pages that LEFT the sidebar under the Prompt 9 ruling (docs/ADMIN_MODIFICATION_PLAN.md §3):
 * their home is now another Growcord product, reached by the `external` link in the
 * sub-group they came from. The admin still serves them (old bookmarks, role landings such as
 * `/scan`, deep links from an order) and their gate is kept here verbatim, so leaving the menu
 * never loosened a route. `routePermissions.ts` reads this list exactly as it reads MENU.
 */
export const OFF_MENU: MenuItem[] = [
  { label: 'COD payouts', to: '/panel/orders/cod-recon', icon: Wallet, perm: 'orders.read', tip: 'Cash the courier collected and owes you.' },
  { label: 'Automation', to: '/panel/orders/automation-rules', icon: Bot, perm: 'settings.manage', tip: 'When this happens on an order, do that.' },
  { label: 'Contacts', to: '/leads', icon: UserCheck, perm: 'marketing.read', modules: ['crm'], tip: 'Enquiries and the people behind them.' },
  { label: 'Templates', to: '/panel/marketing/templates', icon: FileText, perm: 'marketing.manage', modules: ['marketing'], tip: 'The message bodies a campaign sends.' },
  { label: 'Follow-ups', to: '/panel/marketing/automation', icon: Bot, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sequences that run themselves after an event.' },
  { label: 'Performance', to: '/panel/marketing/performance', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Spend against revenue, channel by channel.' },
  { label: 'Growth', to: '/panel/marketing/growth', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Cohorts, lifetime value and the funnel.' },
  { label: 'Reports', to: '/panel/marketing/analytics', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Campaign and audience numbers over time.' },
  { label: 'Consent', to: '/panel/marketing/compliance', icon: ShieldCheck, perm: 'customers.read', modules: ['marketing'], tip: 'Who may be messaged, and when they may not.' },
  { label: 'Preferences', to: '/panel/marketing/settings', icon: Settings, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sender names, quiet hours and sending limits.' },
  { label: 'Messaging', to: '/marketing', icon: Megaphone, perm: 'marketing.read', modules: ['marketing'], tip: 'The older single-screen sender, kept for its history.' },
  { label: 'Stock desk', to: '/panel/inventory', icon: Gauge, perm: 'inventory.read', tip: 'Low stock, expiring lots and what to reorder.' },
  { label: 'Transfers', to: '/panel/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.adjust', tip: 'Move stock between warehouses and outlets.' },
  { label: 'Counts', to: '/panel/inventory/counts', icon: Scale, perm: ['inventory.adjust', 'warehouse.count_approve'], modules: ['wms'], tip: 'Count a shelf and post what you actually found.' },
  { label: 'Units', to: '/panel/inventory/uom', icon: Boxes, perm: 'inventory.manage', tip: 'Pieces, boxes, cases — and how they convert.' },
  { label: 'Kits', to: '/panel/inventory/bom', icon: Hammer, perm: 'inventory.manage', tip: 'What a made-up item is built from.' },
  { label: 'Work orders', to: '/panel/inventory/work-orders', icon: Hammer, perm: 'inventory.manage', tip: 'Assembling kits: planned, in progress, done.' },
  { label: 'Reports', to: '/panel/inventory/reports', icon: FileSpreadsheet, perm: 'reports.read', modules: ['reports'], tip: 'Movements, valuation, ageing and expiry.' },
  { label: 'Layout', to: '/panel/inventory/wms', icon: Warehouse, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], tip: 'Racks, shelves and bins as you would walk them.' },
  { label: 'Pick lists', to: '/panel/inventory/pick-lists', icon: PackageSearch, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], tip: 'What the floor is picking right now.' },
  { label: 'Goods in', to: '/panel/inventory/goods-in', icon: Boxes, perm: ['inventory.read', 'warehouse.operate'], modules: ['wms'], tip: 'Book in a delivery and sticker every piece.' },
  { label: 'Labels', to: '/panel/inventory/labels', icon: FileText, perm: 'inventory.read', modules: ['wms'], tip: 'Barcodes and shelf labels to print.' },
  { label: 'Scanner', to: '/scan', icon: PackageSearch, perm: ['warehouse.operate', 'inventory.adjust'], modules: ['wms'], tip: 'The phone screen for putaway, picking and counting.', owns: ['/scan/putaway', '/scan/pick', '/scan/move', '/scan/count', '/putaway', '/pick', '/move', '/count'] },
  { label: 'Purchase orders', to: '/panel/purchasing', icon: Store, perm: 'purchasing.read', modules: ['purchasing'], tip: 'Orders to your suppliers, and what arrived.', owns: ['/panel/inventory/purchasing'] },
  { label: 'Scorecard', to: '/panel/purchasing/scorecard', icon: LineChart, perm: 'purchasing.read', modules: ['purchasing'], tip: 'Which supplier delivers on time and in full.' },
  { label: 'Books', to: '/panel/accounting', icon: Gauge, perm: 'accounting.read', modules: ['accounting'], tip: 'Cash, receivables and what is due this week.' },
  { label: 'Statements', to: '/panel/accounting/statements', icon: LineChart, perm: 'accounting.read', modules: ['accounting'], tip: 'Profit and loss, balance sheet, cash flow.' },
  { label: 'Receivables', to: '/panel/accounting/receivables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Who owes you, and for how long.' },
  { label: 'Reminders', to: '/panel/accounting/dunning', icon: Bell, perm: 'accounting.read', modules: ['accounting'], tip: 'Chasing an overdue invoice, politely and on time.' },
  { label: 'Bills', to: '/panel/accounting/bills', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Supplier invoices, matched to the PO and the delivery.' },
  { label: 'Expenses', to: '/panel/accounting/expenses', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Day-to-day spending and the cash book.' },
  { label: 'Accounts', to: '/panel/accounting/bank-accounts', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Every bank and cash account you hold.' },
  { label: 'Reconcile', to: '/panel/accounting/bank-recon', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], tip: 'Match the statement against the books.' },
  { label: 'Bank rules', to: '/panel/accounting/bank-rules', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], tip: 'Label a recurring statement line automatically.' },
  { label: 'GSTR-1', to: '/panel/accounting/gstr1', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'Outward supplies, ready to file.' },
  { label: 'GSTR-3B', to: '/panel/accounting/gstr3b', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'The monthly summary return.' },
  { label: 'GSTR-9', to: '/panel/accounting/gstr9', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'The annual return.' },
  { label: 'HSN summary', to: '/panel/accounting/hsn-summary', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'Sales grouped by HSN code and rate.' },
  { label: 'Input credit', to: '/panel/accounting/itc', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'GSTR-2B against the bills you recorded.' },
  { label: 'Rate check', to: '/panel/accounting/rate-check', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], tip: 'Products whose rate looks wrong for their HSN.' },
  { label: 'Rate codes', to: '/panel/accounting/rate-codes', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], tip: 'The statutory rates, with the date each took effect.' },
  { label: 'Accounts', to: '/panel/accounting/chart-of-accounts', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], tip: 'The chart of accounts.' },
  { label: 'Journals', to: '/panel/accounting/journals', icon: BookOpen, perm: 'accounting.post', modules: ['accounting'], tip: 'Entries posted by hand.' },
  { label: 'Trial balance', to: '/panel/accounting/trial-balance', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'Every account’s balance, debits against credits.' },
  { label: 'Shipments', to: '/shipments', icon: Truck, perm: 'shipments.read', modules: ['shipping'], tip: 'Every parcel: booked, picked up, delivered.' },
  { label: 'Returns in', to: '/panel/orders/rto', icon: RotateCcw, perm: 'shipments.read', tip: 'Parcels coming back, and putting them away.' },
  { label: 'E-way bills', to: '/panel/orders/ewb', icon: FileText, perm: 'shipments.read', tip: 'The document a consignment needs to travel.' },
  { label: 'Weight claims', to: '/panel/orders/weight-disputes', icon: Scale, perm: 'shipments.read', tip: 'Where the courier billed more than the parcel weighs.' },
];

/* ───────────────── routes with no menu entry, and their gate ───────────────── */

/**
 * Pages reached from a button, a deep link or a redirect. They are NOT menu
 * items, but they still need a gate — this is the half `routePermissions.ts`
 * used to carry separately and was the reason `/panel/*` children were
 * ungated (L5 §1, mechanism 2).
 */
export const EXTRA_ROUTES: Array<{ path: string; perm?: string; modules?: string[] }> = [
  // A redirect target, kept because old bookmarks point at it.
  { path: '/settings/general', perm: 'settings.manage' },
  { path: '/appearance', perm: 'content.manage' },
  // `/pages/new`, `/pages/:id/edit` and `/pages/:id/builder`. The prefix matcher
  // cannot see past the `:id`, so the visual builder's `page_builder` module is
  // stated here for the whole prefix — exactly as the old table did. The Pages
  // LIST (`/appearance/pages`) is deliberately not module-gated: a store's
  // policy pages are core, not a builder feature (COMMON_MISTAKES #250).
  { path: '/pages', perm: 'content.manage', modules: ['page_builder'] },
  { path: '/analytics', perm: 'reports.read', modules: ['analytics'] },
];

/* ────────────────────────────── helpers ────────────────────────────── */

/** Every item in the menu, flat, in menu order. */
export function allMenuItems(): MenuItem[] {
  return MENU.flatMap((g) => g.subs.flatMap((s) => s.items));
}

/** The group a pathname belongs to (drives which group is expanded). */
export function groupForPath(pathname: string): string | null {
  let bestId: string | null = null;
  let bestLen = -1;
  for (const g of MENU) {
    for (const sub of g.subs) {
      for (const item of sub.items) {
        for (const route of [item.to, ...(item.owns ?? [])]) {
          const p = routeBase(route);
          if (!p.startsWith('/')) continue;
          if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) {
            bestId = g.id;
            bestLen = p.length;
          }
        }
      }
    }
  }
  return bestId;
}

/** `/products/:id/edit` → `/products` — the part a prefix match can use. */
export function routeBase(route: string): string {
  const noQuery = route.split('?')[0];
  const cut = noQuery.indexOf('/:');
  return cut === -1 ? noQuery : noQuery.slice(0, cut);
}
