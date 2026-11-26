/**
 * THE admin menu, and therefore THE admin gating table.
 *
 * ONE definition. The sidebar renders from `MENU`; `routePermissions.ts` is DERIVED from `MENU` + `OFF_MENU` +
 * `EXTRA_ROUTES`, so a link that exists is a link the guard agrees with, and a page with no menu entry still has a
 * gate. (Before 2026-09-25 there were three hand-kept answers to "may this user open this page" and they disagreed:
 * L5 section 1.)
 *
 * SHAPE (owner, 2026-09-25): the admin is the E-COMMERCE panel, and its sidebar keeps the groups the store's staff
 * know: Overview, Orders, Catalog, Marketing, Messaging, Store Customers, Content, System. Accounting, the warehouse
 * floor, purchasing, HR and the other products live in their own products, linked from the tab strip in the header
 * (`components/ProductTabs.tsx`); the pages this admin still serves for them stay reachable and gated in `OFF_MENU`.
 *
 * AREAS (ADMIN-NAV-1, owner 26 Nov 2026: "make admin sidebar menu compact ... tabs and interal ui ... everything
 * acceassbile at easy with proper security and need to know basis", after "instead of 5 options in sidebar create
 * options on top as tabs or inner sidebar" for Growcord Ship): a sidebar row with `children` is an AREA. Its pages
 * are tabs on top of every page in it (`components/menu/AreaTabs.tsx`, placed by the shell), and a flyout on the row
 * lists them. Plan: docs/ADMIN-NAV-1.md.
 *
 * Rules the entries obey:
 *  - `label` is a NAME, at most three words. Never a sentence.
 *  - `tip` is the one line shown on hover.
 *  - `perm` is the backend permission the page's own API needs (`<area>.<action>`, `kernel/rbac/roles.ts`). An
 *    ARRAY means any ONE is enough. `modules` are the store features it needs, ALL of them.
 *  - `owns` lists child routes (a `/new`, an `/:id/edit`, a callback) that are not listed but inherit the gate.
 *  - `children` are an area's tabs. Each is a full MenuItem with its own gate, so a tab a person cannot open is
 *    absent, and an area none of whose tabs a person may open is absent too.
 *  - An area is built with `area()`: the row takes the route and gate of its FIRST tab, so the derived route table
 *    is the same as if the row were not there.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Home, ShoppingCart, Package2, Wallet, Truck, Users, LineChart, Settings,
  FileText, Megaphone, Palette, BookOpen, Building2, PackageSearch, Warehouse, Scale, ArrowLeftRight, Boxes,
  Hammer, ShieldCheck, FileSpreadsheet, Coins, CalendarClock, Mail, Repeat, Bell, SlidersHorizontal,
  FolderArchive, Gauge, Bot, Store, MessagesSquare, Target, Share2, Send, BadgePercent, LifeBuoy, Ship, Newspaper,
} from 'lucide-react';

export interface MenuItem {
  /** Plain name. */
  label: string;
  /** Route, or an absolute https:// address for another Growcord panel. */
  to: string;
  /** One line, shown on hover. */
  tip: string;
  /**
   * Backend permission this page needs. Absent = login is enough. An ARRAY means any ONE of them is enough: the
   * warehouse routes deliberately accept `warehouse.operate` OR the older `inventory.adjust` while both are in use.
   */
  perm?: string | string[];
  /** Store modules this page needs, ALL of them. */
  modules?: string[];
  icon?: LucideIcon;
  /** Unlisted child routes that inherit this item's gate. */
  owns?: string[];
  /** Opens in the same tab on another gc.mw host. */
  external?: boolean;
  /** An AREA's tabs (drawn on top of its pages, listed in its flyout and in the command search). */
  children?: MenuItem[];
  /**
   * Pages inside this item that draw their own tabs (Growcord Ship): listed in the row's flyout and found by name in
   * the command search. Each keeps its own gate, and a person sees only those they may open.
   */
  palette?: MenuItem[];
  /** The tab group this page sits in inside its area (Settings: Store, Selling and so on). */
  section?: string;
  /** Sits under More in its area's tabs: a rarely used page, or one that opens full screen. */
  more?: boolean;
  /** OFF_MENU only: the Growcord product that owns this page, named in the command search and the breadcrumb. */
  product?: string;
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

/* sibling products (link targets) */

/** Dev ports: `suite/scripts/scaffold.mjs` APPS, the one list of them. */
const DEV_PORTS: Record<string, number> = {
  hub: 5200, books: 5201, ship: 5202, comms: 5203, insights: 5204, make: 5205, wms: 5206,
  trade: 5207, retail: 5208, reach: 5209, people: 5210, links: 5211, crm: 5212, finance: 5213,
};

/** This console's own label, the one swapped out to address a sibling. */
const SELF = 'admin';

/**
 * The address of another Growcord product, derived from THIS console's hostname. The rule is
 * `suite/apps/hub/src/catalog.ts siblingOrigin`, copied, not invented:
 *   admin.gc.mw becomes books.gc.mw
 *   admin-acme.gc.mw becomes books-acme.gc.mw
 *   admin.homeomed.in becomes books.homeomed.in
 *   localhost:5324 becomes localhost:5201 (the dev port map)
 * Never a hand-typed host.
 *
 * Lane T5 lifts this into the kit as `productLinks.urlFor` and mirrors it back.
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

/* the registry's areas (Settings Center) */

/**
 * `SETTINGS_GROUPS` in backend/src/config/settingsRegistry.ts, by number. A MIRROR, the way `lib/rbac.ts` mirrors
 * `kernel/rbac/roles.ts`: the Settings Center compares the two against the live registry and says so on screen when a
 * group exists on one side only. Read by the command search.
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

/* the menu */

/**
 * GROWCORD SHIP's pages, as tabs on top of its one sidebar entry (pages/growship/GrowshipLayout.tsx), each with its
 * own gate (EXTRA_ROUTES below) and found by name in the command search. Billing and charges opens with either
 * shipments.read (its gate before the tabs) or billing.read; the Wallet needs billing.read.
 */
export const GROWSHIP_TABS: MenuItem[] = [
  { label: 'Overview', to: '/growship', perm: 'shipments.read', modules: ['shipping'], tip: 'Growcord Ship at a glance: wallet, account, latest parcels, COD and weight disputes.' },
  { label: 'Shipments', to: '/growship/shipments', perm: 'shipments.read', modules: ['shipping'], tip: 'Every Growcord Ship parcel by status, with its charges and courier events.' },
  { label: 'Bulk shipment', to: '/growship/bulk', perm: 'shipments.manage', modules: ['shipping'], tip: 'Book many ready orders at once, or upload a sheet of parcels.' },
  { label: 'Wallet', to: '/growship/wallet', perm: 'billing.read', modules: ['shipping'], tip: 'Balance, add money, and the freight taken and refunded for each parcel.' },
  { label: 'Billing and charges', to: '/growship/billing', perm: ['shipments.read', 'billing.read'], modules: ['shipping'], tip: 'What each parcel cost: freight, COD fee, return charges, GST and the final amount.' },
  { label: 'Rate calculator', to: '/growship/rates', perm: 'shipments.read', modules: ['shipping'], tip: 'Price a parcel between two pincodes, courier by courier.' },
];

/** Under More: the board's failed delivery tab, and pages that live elsewhere in the admin (redirects, App.tsx). */
export const GROWSHIP_MORE: MenuItem[] = [
  { label: 'Failed delivery', to: '/growship/failed-delivery', perm: 'shipments.read', modules: ['shipping'], more: true, tip: 'Parcels the courier could not deliver: answer before they come back.' },
  { label: 'RTO', to: '/growship/rto', perm: 'shipments.read', modules: ['shipping'], more: true, tip: 'Parcels coming back, and putting them away.' },
  { label: 'Weight disputes', to: '/growship/weight-disputes', perm: 'shipments.read', modules: ['shipping'], more: true, tip: 'Where the courier billed more than the parcel weighs.' },
  { label: 'COD payouts', to: '/growship/cod-payouts', perm: 'orders.read', modules: ['shipping'], more: true, tip: 'Cash collected on delivery: what is still owed, and each payout.' },
  { label: 'Settings', to: '/growship/settings', perm: 'settings.manage', modules: ['shipping'], more: true, tip: 'Switch Growcord Ship on or off, and the store\'s shipping fees.' },
  { label: 'Pickup locations', to: '/growship/pickup-locations', perm: 'inventory.read', modules: ['shipping', 'inventory'], more: true, tip: 'The warehouses couriers collect from.' },
];

/** A group with ONE section: the sidebar shows the group label only. */
const one = (id: string, label: string, icon: LucideIcon, home: string, items: MenuItem[]): MenuGroup => ({
  id, label, icon, home, subs: [{ label, items }],
});

/**
 * An AREA: one sidebar row whose pages are `tabs`. The row takes the route and gate of its first tab, so the route
 * table derived from this file reads exactly as it would without the row; `owns` are record routes of the whole area
 * (an order, a product editor) and take that same gate. Who SEES the row is decided by its tabs (menuAccess.ts).
 */
function area(label: string, icon: LucideIcon, tip: string, tabs: MenuItem[], owns?: string[]): MenuItem {
  const first = tabs[0];
  return { label, icon, tip, to: first.to, perm: first.perm, modules: first.modules, ...(owns ? { owns } : {}), children: tabs };
}

export const MENU: MenuGroup[] = [
  one('overview', 'Overview', Home, '/dashboard', [
    { label: 'Dashboard', to: '/dashboard', icon: Home, tip: 'What needs you today, then the numbers.' },
    area('Analytics', LineChart, 'Sales, orders and customers over a period.', [
      { label: 'Dashboard', to: '/analytics/dashboard', perm: 'reports.read', modules: ['analytics'], tip: 'Sales, each brand\'s top sellers, the pipeline, search and carts brought back.' },
      { label: 'Sales Insights', to: '/analytics/insights', perm: 'reports.read', modules: ['analytics'], tip: 'Brand, item and campaign sales, what moved, and what to act on.' },
      { label: 'Delivery & RTO', to: '/analytics/outcomes', perm: 'orders.read', modules: ['analytics'], tip: 'Delivered, returned and RTO orders by payment, campaign, source and ads vs organic.' },
      { label: 'Store', to: '/analytics/store', perm: 'reports.read', modules: ['analytics'], tip: 'Products, categories and the checkout funnel.' },
      { label: 'Marketing', to: '/analytics/marketing', perm: 'reports.read', modules: ['analytics'], tip: 'Which channel brought the order.' },
      { label: 'Users', to: '/analytics/users', perm: 'reports.read', modules: ['analytics'], tip: 'Who is visiting, on what, and from where.' },
      { label: 'Realtime', to: '/analytics/realtime', perm: 'reports.read', modules: ['analytics'], tip: 'What is happening on the shop right now.' },
      { label: 'Custom', to: '/analytics/custom', perm: 'reports.read', modules: ['analytics'], more: true, tip: 'Build the report you actually want.' },
      // HMAPP-3 point 7: installs, use, app orders and sales against the website. Read with orders.read, as Delivery & RTO.
      { label: 'App', to: '/analytics/app', perm: 'orders.read', modules: ['analytics'], more: true, tip: 'Installs, devices using the app, and app orders and sales against the website.' },
    ]),
  ]),

  one('orders', 'Orders', ShoppingCart, '/orders', [
    area('Orders', ShoppingCart, 'Every order, from every channel.', [
      { label: 'All Orders', to: '/orders', perm: 'orders.read', tip: 'Every order, from every channel.' },
      // Was OFF_MENU (reached from the Orders pages): its gate is unchanged.
      { label: 'Order desk', to: '/panel/orders', icon: Gauge, perm: 'orders.read', tip: 'The day at a glance: to confirm, to pack, to chase.' },
      { label: 'Create Order', to: '/orders/new', perm: 'orders.manage', tip: 'Key in an order on a customer\'s behalf.' },
      { label: 'Abandoned Carts', to: '/orders/abandoned-carts', perm: 'orders.read', tip: 'Carts that were filled but never paid for.', owns: ['/orders/abandoned-carts/:id'] },
      { label: 'Returns', to: '/returns', perm: 'returns.read', modules: ['returns'], tip: 'What a customer sent back, and where it is.' },
      { label: 'Refunds', to: '/panel/orders/refunds', perm: 'orders.manage', tip: 'Money to send back: requested, approved, paid.' },
      { label: 'Quotations', to: '/panel/orders/quotations', perm: 'orders.read', tip: 'Prices offered to a buyer before an order exists.' },
      { label: 'Credit Notes & Challans', to: '/panel/orders/documents', perm: 'orders.read', more: true, tip: 'Credit notes, debit notes and delivery challans.' },
      { label: 'Sales & Team', to: '/panel/orders/sales-team', perm: 'reports.read', more: true, tip: 'Who sold what, and who is handling it now.' },
      // Was OFF_MENU: its gate is unchanged.
      { label: 'Automation rules', to: '/panel/orders/automation-rules', icon: Bot, perm: 'settings.manage', more: true, tip: 'When this happens on an order, do that.' },
      // Opens the full screen counter.
      { label: 'POS (New Sale)', to: '/pos', icon: Store, perm: 'orders.manage', modules: ['pos'], more: true, tip: 'Sell over the counter and take payment now.' },
    ], ['/orders/:id']),
    // PAY-0 section 5: the store's money in, what each payment cost, and when it reached the bank.
    area('Payments', Wallet, 'Online payments, gateway payouts and the cash couriers collected.', [
      { label: 'Payments', to: '/panel/orders/payments', perm: 'orders.read', tip: 'Every online payment: fee, net, and when it reached your bank.' },
      { label: 'Settlements', to: '/panel/orders/payments/settlements', perm: 'orders.read', tip: 'Each payout from your gateway, with its UTR.', owns: ['/panel/orders/payments/settlements/:settlementId'] },
      // Owner, 23 Nov 2026, looked for the courier's COD payouts beside Settlements: listed here, not off-menu.
      { label: 'COD payouts', to: '/panel/orders/cod-recon', perm: 'orders.read', tip: 'Cash the couriers collected on delivery: what they still hold, and recording each payout.' },
      { label: 'Payment analytics', to: '/panel/orders/payments/analytics', perm: 'orders.read', tip: 'Fees, net and anything not yet in the bank.' },
      { label: 'Payment requests', to: '/panel/orders/payments/requests', perm: 'orders.read', tip: 'What each order asked the payer to pay, and what came in.' },
    ]),
    area('Shipments', Truck, 'Parcels, returns coming back, e-way bills and weight claims.', [
      { label: 'Shipments', to: '/shipments', perm: 'shipments.read', modules: ['shipping'], tip: 'Every parcel: booked, picked up, delivered.' },
      // The three below were OFF_MENU (reached from the Orders pages and Growcord Ship): their gates are unchanged.
      { label: 'Returns in', to: '/panel/orders/rto', icon: Truck, perm: 'shipments.read', tip: 'Parcels coming back, and putting them away.' },
      { label: 'E-way bills', to: '/panel/orders/ewb', icon: FileText, perm: 'shipments.read', tip: 'The document a consignment needs to travel.' },
      { label: 'Weight claims', to: '/panel/orders/weight-disputes', icon: Scale, perm: 'shipments.read', tip: 'Where the courier billed more than the parcel weighs.' },
    ]),
    // GROWCORD SHIP: ONE entry (owner 26 Nov 2026: "instead of 5 options in sidebar create options on top as tabs or
    // inner sidebar"); its pages are tabs inside its own layout (pages/growship/GrowshipLayout.tsx), each gated in
    // EXTRA_ROUTES, so the shell draws no second strip there. Shown to anyone who may open one of its tabs; /growship
    // lands on the first of them.
    {
      label: 'Growcord Ship', to: '/growship', icon: Ship, perm: ['shipments.read', 'billing.read'], modules: ['shipping'],
      tip: 'Book, track and pay for parcels with Growcord Ship: wallet, bulk booking, charges and rates.',
      palette: [...GROWSHIP_TABS, ...GROWSHIP_MORE],
    },
  ]),

  one('catalog', 'Catalog', Package2, '/products', [
    area('Products', Package2, 'The catalog, every SKU, and what it sells for.', [
      { label: 'All Products', to: '/products', perm: 'products.read', tip: 'The catalog, every SKU.' },
      { label: 'Create Product', to: '/products/new', perm: 'products.manage', tip: 'Add one product by hand.' },
      { label: 'Import / Export', to: '/products/import-export', perm: 'products.manage', tip: 'Bulk create and update from a sheet.' },
      { label: 'Categories', to: '/products/categories', perm: 'products.read', tip: 'The tree shoppers browse.' },
      { label: 'Brands', to: '/products/brands', perm: 'products.read', tip: 'Brands, their pages and who owns them.' },
      { label: 'Bundles', to: '/products/bundles', perm: 'products.read', modules: ['bundles'], tip: 'Buy-more-save-more and fixed packs.', owns: ['/products/bundles/new', '/products/bundles/:id/edit'] },
      // PRICING-AUTO (DEC-089): prices against Google and other sellers. /pricing/discovery is the settings registry's
      // page for the key pricingDiscovery; the page's own tabs are owned routes under the same gate (products.read).
      { label: 'Pricing', to: '/pricing/discovery', icon: Coins, perm: 'products.read', tip: 'Prices set against Google and other sellers, every change made, and undo.', owns: ['/pricing', '/pricing/:tab'] },
      { label: 'Companies', to: '/products/companies', perm: 'products.read', more: true, tip: 'The legal companies behind the brands.' },
      { label: 'Attributes', to: '/products/attributes', perm: 'products.read', more: true, tip: 'Potency, size and the other axes of a variation.' },
      { label: 'Tags', to: '/products/tags', perm: 'products.read', more: true, tip: 'Free labels for grouping and filtering.', owns: ['/products/tags/new', '/products/tags/:id/edit'] },
      { label: 'Size Charts', to: '/products/size-charts', perm: 'products.read', modules: ['size_charts'], more: true, tip: 'Measurement tables shown on a product page.' },
      { label: 'Specifications', to: '/products/specifications', perm: 'products.read', more: true, tip: 'Reusable spec tables for a product page.', owns: ['/products/specifications/new', '/products/specifications/:id/edit'] },
      { label: 'Variant Link Groups', to: '/products/variant-link-groups', perm: 'products.read', more: true, tip: 'Products that are each other\'s variants.' },
      { label: 'Gallery', to: '/gallery', perm: 'content.read', more: true, tip: 'Every image this store has uploaded.' },
    ], ['/products/:id/edit', '/products/:id/sections', '/products/:productSlug/variations/:variationKey/edit']),
    area('Inventory', Warehouse, 'How many of each SKU you have, where, and from whom you buy.', [
      { label: 'Stock Levels', to: '/inventory', perm: 'inventory.read', modules: ['inventory'], tip: 'How many of each SKU you actually have.' },
      // Was OFF_MENU: its gate is unchanged.
      { label: 'Stock desk', to: '/panel/inventory', icon: Gauge, perm: 'inventory.read', tip: 'Low stock, expiring lots and what to reorder.' },
      // Gated on the `batches` store module: a store that keeps one plain stock figure per SKU (homeomead,
      // 2026-10-01) has no lots to show, and RouteGuard reads this same table, so the page is unreachable too.
      { label: 'Batches & Expiry', to: '/panel/inventory/batches', perm: 'inventory.read', modules: ['batches'], tip: 'Lots, their MRP and their expiry.' },
      { label: 'Reorder', to: '/panel/inventory/reorder', perm: 'inventory.read', tip: 'What to buy, how much, and from whom.' },
      { label: 'Warehouses', to: '/warehouses', perm: 'inventory.read', modules: ['inventory'], tip: 'The buildings stock is kept in.' },
      { label: 'Vendors', to: '/vendors', perm: 'purchasing.read', tip: 'Who you buy from, and on what terms.', owns: ['/vendors/new', '/vendors/:id/edit'] },
      // DEC-068: the distributor's ERP is the stock master; its connections, mapping and the hourly stock update live here.
      { label: 'ERP Sync', to: '/panel/inventory/erp', perm: 'settings.read', tip: 'Stock set from your distributor\'s ERP, every hour.', owns: ['/panel/inventory/erp/connect', '/panel/inventory/erp/c/:id'] },
      { label: 'Approvals', to: '/panel/inventory/approvals', perm: 'inventory.manage', more: true, tip: 'Stock changes waiting for a second pair of eyes.' },
      { label: 'Outlets & Transfers', to: '/panel/inventory/outlets', perm: 'inventory.read', modules: ['inventory'], more: true, tip: 'Shops that hold their own stock.' },
      { label: 'Consignment', to: '/panel/inventory/consignment', perm: 'inventory.read', modules: ['inventory'], more: true, tip: 'Stock sitting with a partner, still yours.' },
      { label: 'Distributor Network', to: '/panel/inventory/network', perm: 'products.read', modules: ['b2b'], more: true, tip: 'Distributor tiers and the royalty they pay.' },
    ]),
  ]),

  // META-MASTER section 1 (lane META-15A, 8 Nov 2026), made into five areas by ADMIN-NAV-1. Every page keeps the gate
  // it had; the Ads and Meta pages take the ads routes' gate (`ads.read` or `ads.manage`, modules marketing and
  // ads_management) or the Facebook and Instagram page's (`marketing.read`, connectors). Only pages that exist are listed.
  one('marketing', 'Marketing', Megaphone, '/panel/marketing', [
    area('Marketing home', Megaphone, 'What to act on today, what it brings in, and the connections behind it.', [
      { label: 'Marketing home', to: '/panel/marketing', perm: 'marketing.read', modules: ['marketing'], section: 'Insights', tip: 'What to act on today, then what is running and what it brings in.' },
      { label: 'Performance', to: '/panel/marketing/performance', perm: 'marketing.read', modules: ['marketing'], section: 'Insights', tip: 'Campaign performance, attribution and conversions.' },
      { label: 'Marketing reports', to: '/panel/marketing/analytics', perm: 'marketing.read', modules: ['marketing'], section: 'Insights', tip: 'Channel, campaign and customer marketing analytics.' },
      { label: 'Growth', to: '/panel/marketing/growth', perm: 'marketing.read', modules: ['marketing'], section: 'Insights', tip: 'Cohorts, lifetime value and the funnel.' },
      { label: 'Ads analytics', to: '/panel/marketing/ads/analytics', perm: 'ads.read', modules: ['marketing', 'ads_management'], section: 'Insights', tip: 'Meta ad results by day and audience, next to your store orders.' },
      { label: 'Social analytics', to: '/panel/marketing/social/insights', perm: 'marketing.read', modules: ['marketing'], section: 'Insights', tip: 'Views, reach and followers on your Page and Instagram.' },
      { label: 'Search insights', to: '/panel/marketing/connections/insights', perm: 'marketing.read', modules: ['connectors'], section: 'Insights', tip: 'What people searched for before they found you.' },
      { label: 'Connections', to: '/panel/marketing/connections', perm: 'marketing.read', modules: ['connectors'], section: 'Setup', tip: 'Sign in to Google and Meta once; every service follows.', owns: ['/panel/marketing/connections/callback'] },
      { label: 'Events health', to: '/panel/marketing/meta/events', perm: 'marketing.read', modules: ['connectors'], section: 'Setup', tip: 'What Meta received from your pixel and server, and how well it matched.' },
      // CHATGPT-3: ChatGPT pixels, conversion tracking and the ad account, beside the Meta pixel page.
      { label: 'ChatGPT ads', to: '/panel/marketing/chatgpt', perm: 'marketing.read', section: 'Setup', tip: 'ChatGPT pixels, conversion tracking and the ad account Growcord can manage.' },
      { label: 'Compliance', to: '/panel/marketing/compliance', perm: 'marketing.read', modules: ['marketing'], section: 'Setup', tip: 'Consent, suppression and marketing data controls.' },
      { label: 'Settings', to: '/panel/marketing/settings', perm: 'marketing.read', modules: ['marketing'], section: 'Setup', tip: 'Channel readiness and marketing configuration.' },
    ]),
    area('Ads', Target, 'Create and run Meta ads, with audiences, creatives, rules and tests.', [
      { label: 'Ads Manager', to: '/panel/marketing/ads/manager', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Every Meta campaign, ad set and ad, with spend and results.' },
      { label: 'Create ad', to: '/panel/marketing/ads/create', perm: 'ads.manage', modules: ['marketing', 'ads_management'], tip: 'Any objective and format, created paused until you resume it.' },
      { label: 'Audiences', to: '/panel/marketing/ads/audiences', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Website visitors, engaged people, lookalikes and customer lists.' },
      { label: 'Creative library', to: '/panel/marketing/ads/library', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Pictures and videos on your ad account, ready to reuse.' },
      { label: 'Lead forms', to: '/panel/marketing/ads/leads', perm: 'marketing.read', modules: ['marketing'], tip: 'Instant forms on your Page and the leads they brought.' },
      { label: 'Rules and tests', to: '/panel/marketing/ads/rules', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Meta suggestions, automatic rules and split tests.' },
      { label: 'AI Ads Studio', to: '/panel/marketing/ads/ai-studio', perm: 'ads.read', modules: ['marketing', 'ads_management', 'connectors'], tip: 'AI drafts a campaign; you review before anything runs.' },
      { label: 'Ad accounts', to: '/panel/marketing/ads', perm: 'ads.read', modules: ['marketing', 'ads_management'], more: true, tip: 'Google, Meta and Snapchat accounts, and Google campaigns.', owns: ['/panel/marketing/ads/oauth/callback'] },
    ]),
    area('Social', Share2, 'Facebook, Instagram and Google reviews.', [
      { label: 'Facebook and Instagram', to: '/panel/marketing/meta', perm: 'marketing.read', modules: ['connectors'], tip: 'Connect Meta, pick your Page, accounts and pixel, and see what is missing.' },
      { label: 'Publisher', to: '/panel/marketing/social/publisher', perm: 'marketing.read', modules: ['marketing'], tip: 'Plan, schedule and post to your Page, Instagram and Threads.' },
      { label: 'Comments', to: '/panel/marketing/social/comments', perm: 'marketing.read', modules: ['marketing'], tip: 'Answer, hide or message people who commented.' },
      { label: 'Instagram', to: '/panel/marketing/meta/instagram', perm: 'marketing.read', modules: ['connectors', 'marketing'], tip: 'Your posts, product tags and the feed on your store.' },
      { label: 'Google Reviews', to: '/panel/marketing/google-reviews', perm: 'content.read', modules: ['connectors', 'reviews'], tip: 'Your Business Profile reviews: reply and publish.' },
    ]),
    area('Campaigns and inbox', Send, 'Chats in one place, and SMS, WhatsApp, email and push campaigns to your lists.', [
      { label: 'All chats', to: '/panel/marketing/inbox', perm: 'marketing.read', tip: 'WhatsApp, Messenger and Instagram chats, with the customer beside them.' },
      { label: 'Campaigns', to: '/panel/marketing/campaigns', perm: 'marketing.read', modules: ['marketing'], tip: 'One panel per channel: SMS, WhatsApp, email, push.', owns: ['/panel/marketing/campaigns/:channel'] },
      { label: 'Quick send', to: '/marketing', perm: 'marketing.read', modules: ['marketing'], tip: 'The single screen sender, with its history.' },
      { label: 'Templates', to: '/panel/marketing/templates', perm: 'marketing.read', modules: ['marketing'], tip: 'Approve the message designs campaigns may send.' },
      { label: 'Automation', to: '/panel/marketing/automation', perm: 'marketing.read', modules: ['marketing'], tip: 'Triggered journeys and scheduled marketing work.' },
      { label: 'Contact lists', to: '/panel/marketing/audiences', perm: 'marketing.manage', modules: ['marketing'], tip: 'Saved lists of people to send to.' },
      { label: 'Messenger settings', to: '/panel/marketing/inbox/settings', perm: 'marketing.read', tip: 'Greeting, ice breakers and the menu people see in a chat.' },
    ]),
    area('Offers and channels', BadgePercent, 'Coupons, app offers, and the marketplaces and feeds the catalog is sold on.', [
      { label: 'Coupons', to: '/coupons', perm: 'marketing.read', modules: ['coupons'], tip: 'Discount codes and who may use them.', owns: ['/coupons/new', '/coupons/:id/edit'] },
      // HMAPP-3 point 6: discounts only for orders placed in the app (read as coupons are, marketing.read).
      { label: 'App Offers', to: '/app/offers', perm: 'marketing.read', modules: ['coupons'], tip: 'Discounts only for orders placed in the app, shown there as the App price.' },
      { label: 'Meta catalog', to: '/panel/marketing/meta/catalog', perm: 'marketing.read', modules: ['connectors', 'channel_sync'], tip: 'Your products on Facebook, Instagram and WhatsApp, and what Meta refused.' },
      { label: 'Channels', to: '/channels', perm: 'channels.read', modules: ['channel_sync'], tip: 'Marketplaces and feeds this catalog is sold on.' },
      { label: 'Daily file', to: '/channels/daily', perm: 'channels.read', modules: ['channel_sync'], tip: 'The manual upload and download for marketplaces with no API.' },
      { label: 'Excel Import', to: '/channels/import', perm: 'channels.manage', modules: ['channel_sync'], tip: 'Bring a marketplace\'s orders in from their sheet.' },
      { label: 'Mapping', to: '/channels/mapping', perm: 'channels.manage', modules: ['channel_sync'], tip: 'Which of their columns is which of your fields.' },
      { label: 'Allocation', to: '/channels/allocation', perm: 'channels.manage', modules: ['channel_sync'], more: true, tip: 'How much stock each channel may sell.' },
    ]),
  ]),

  // MSG-0 (lane ADMIN-MSG-1): ONE place for every message the store sends and receives. Built beside the old places
  // (Settings: Message templates, API Integrations SMTP and WhatsApp, Cart Recovery Automation); those are removed only
  // after the owner approves. Permissions are the comms routes' own (marketing.read or marketing.manage).
  one('messaging', 'Messaging', MessagesSquare, '/messaging/notifications', [
    area('Messages', MessagesSquare, 'Every message the store sends, by channel: WhatsApp, email and SMS.', [
      { label: 'Notifications', to: '/messaging/notifications', perm: 'marketing.read', tip: 'Every message the store sends, its channels and its on/off switch.' },
      { label: 'WhatsApp', to: '/messaging/whatsapp', perm: 'marketing.read', tip: 'Inbox, number, Meta approval and what was sent.' },
      { label: 'Email', to: '/messaging/email', perm: 'marketing.read', tip: 'Sender, SMTP, branding, what was sent and who unsubscribed.' },
      { label: 'SMS', to: '/messaging/sms', perm: 'marketing.read', tip: 'Provider, DLT mapping and what was sent.' },
      { label: 'Cart recovery', to: '/messaging/cart-recovery', perm: 'marketing.read', tip: 'The reminders sent after a cart is left behind.' },
      { label: 'Retention', to: '/messaging/retention', perm: 'marketing.read', tip: 'Journeys that bring buyers back, reorder timing and back-in-stock sign-ups.' },
    ]),
  ]),

  one('customers', 'Store Customers', Users, '/customers', [
    area('Customers', Users, 'Everyone who bought or signed up, trade accounts, partners and who owes money.', [
      { label: 'All Customers', to: '/customers', perm: 'customers.read', tip: 'Everyone who has bought or signed up.', owns: ['/customers/:id', '/customers/duplicates', '/users', '/users/:id'] },
      { label: 'CRM', to: '/leads', perm: 'marketing.read', modules: ['crm'], tip: 'Enquiries and the people behind them.' },
      { label: 'B2B', to: '/b2b', perm: 'b2b.read', modules: ['b2b'], tip: 'Trade accounts, their tier and their price list.' },
      // HMAPP design 60 AD02 to AD04: the partner programme (Retain), read on the partners intent's mapping `marketing.read`.
      { label: 'Partners', to: '/partners', perm: 'marketing.read', tip: 'People who earn by sharing your shop: applications, commissions, payouts and terms.' },
      { label: 'Credit Control', to: '/panel/customers/credit', perm: 'customers.read', tip: 'Who owes money and who is over their limit.' },
    ]),
  ]),

  one('content', 'Content', Palette, '/appearance/pages', [
    area('Appearance', Palette, 'The shop\'s pages, theme and look.', [
      { label: 'Pages', to: '/appearance/pages', perm: 'content.manage', tip: 'Home, policies and every other page on the shop.', owns: ['/pages/new', '/pages/:id/edit', '/pages/:id/builder'] },
      { label: 'Themes', to: '/appearance/themes', perm: 'content.manage', tip: 'The storefront theme and its live editor.', owns: ['/themes/:id/customize'] },
      { label: 'Banners', to: '/appearance/banners', perm: 'content.manage', tip: 'The sliders and strips on the home page.' },
      { label: 'Menus', to: '/appearance/menus', perm: 'content.manage', tip: 'The shop\'s navigation, drag and drop.' },
      { label: 'Style', to: '/appearance/style', perm: 'content.manage', tip: 'Logo, colours, fonts and the notice popup.' },
      { label: 'Products', to: '/appearance/products', perm: 'content.manage', tip: 'What a product page shows, and in what order.' },
      { label: 'Trust Badges', to: '/appearance/trust-badges', perm: 'content.manage', tip: 'The reassurance badges shown at checkout.' },
    ]),
    area('Store content', Newspaper, 'Answers, reviews, questions, articles, the app feed and SEO.', [
      { label: 'FAQs', to: '/faqs', perm: 'content.read', tip: 'Answers reused across the shop.' },
      { label: 'Reviews', to: '/reviews', perm: 'content.read', modules: ['reviews'], tip: 'Customer reviews waiting to be approved.' },
      { label: 'Questions & Answers', to: '/questions', perm: 'content.read', modules: ['product_qa'], tip: 'Questions asked on a product page.' },
      { label: 'Wishlists', to: '/wishlists', perm: 'reports.read', modules: ['wishlist'], tip: 'What shoppers saved but have not bought.' },
      { label: 'Blog Posts', to: '/blogs', perm: 'content.read', modules: ['blog'], tip: 'Articles on the shop.', owns: ['/blogs/new', '/blogs/:id/edit'] },
      // HMAPP design 60 AD07: a person approves every reel before the app's feed shows it.
      { label: 'App Feed', to: '/app/feed', perm: 'content.read', tip: 'Reels and Instagram posts waiting for a person before the app shows them.' },
      { label: 'SEO', to: '/seo', perm: 'content.read', tip: 'Tracking tags, redirects, robots and the sitemap.' },
    ]),
  ]),

  one('system', 'System', Settings, '/settings', [
    area('Settings', Settings, 'Every setting in one place: type a name or a number.', [
      { label: 'Settings Center', to: '/settings', perm: 'settings.read', section: 'Store', tip: 'Every setting in one place: type a name or a number.' },
      { label: 'All settings pages', to: '/settings/directory', perm: 'settings.read', section: 'Store', tip: 'Every dedicated settings page, listed.' },
      { label: 'Store Configuration', to: '/settings/store-config', perm: 'settings.manage', section: 'Store', tip: 'Name, address, contact, hours and social links.' },
      { label: 'Markets', to: '/settings/markets', perm: 'settings.read', section: 'Store', tip: 'The countries you sell to and how they are priced.' },
      { label: 'Modules', to: '/settings/modules', perm: 'settings.manage', section: 'Store', tip: 'Which features are switched on for this store.' },
      { label: 'Contact Submissions', to: '/settings/contact', perm: 'settings.manage', section: 'Store', tip: 'What people sent through the contact form.' },
      { label: 'Setup Guide', to: '/setup-guide', icon: BookOpen, perm: 'settings.read', section: 'Store', tip: 'The steps left before this store is ready to sell.' },
      // Was OFF_MENU (reached from inside Settings): its gate is unchanged. Opens full screen.
      { label: 'Setup wizard', to: '/setup', icon: SlidersHorizontal, perm: 'settings.manage', section: 'Store', more: true, tip: 'Walk the guided setup again.' },
      { label: 'Payment Methods & Discounts', to: '/settings/payment-discount', perm: 'settings.manage', section: 'Selling', tip: 'When COD is allowed, and prepaid discounts.' },
      { label: 'Payment Gateways', to: '/settings/payment-gateways', perm: 'settings.manage', section: 'Selling', tip: 'Razorpay, UPI and bank transfer.' },
      { label: 'GST Display', to: '/settings/gst', perm: 'settings.manage', section: 'Selling', tip: 'Whether prices include tax, and how it is shown.' },
      { label: 'Tax Rules', to: '/settings/tax-rules', perm: 'settings.manage', modules: ['gst_tax'], section: 'Selling', tip: 'HSN code to rate, with effective dates.' },
      { label: 'Invoice', to: '/settings/invoice', perm: 'settings.manage', section: 'Selling', tip: 'Legal name, GSTIN, licences, bank and the layout.' },
      { label: 'Order Numbering', to: '/settings/order-numbering', perm: 'settings.manage', section: 'Selling', tip: 'The prefix and counter new orders take.' },
      { label: 'Customer Orders', to: '/settings/customer-orders', perm: 'settings.read', section: 'Selling', tip: 'Until when customers may cancel, their reasons, and the words for each order status.' },
      { label: 'Return Policies', to: '/settings/return-policies', perm: 'settings.manage', modules: ['returns'], section: 'Selling', more: true, tip: 'How long a customer has, and what comes back.' },
      { label: 'Manufacturers', to: '/settings/manufacturers', perm: 'products.manage', modules: ['manufacturers'], section: 'Selling', more: true, tip: 'The makers named on a product and its invoice.' },
      // The two below were OFF_MENU (reached from inside Settings): their gates are unchanged.
      { label: 'Doc templates', to: '/panel/settings/templates', icon: FileText, perm: 'settings.manage', section: 'Selling', more: true, tip: 'How an invoice or a challan is laid out.' },
      { label: 'Custom fields', to: '/panel/settings/custom-fields', icon: SlidersHorizontal, perm: 'settings.manage', section: 'Selling', more: true, tip: 'Extra fields on your own records.' },
      { label: 'Shipping', to: '/settings/shipping', perm: 'settings.manage', section: 'Shipping', tip: 'Fees, free-shipping threshold, zones and couriers.' },
      { label: 'Packages', to: '/settings/packages', perm: 'settings.manage', section: 'Shipping', tip: 'The cartons you pack into, and their size.' },
      { label: 'Wallet', to: '/settings/wallet', perm: 'billing.read', section: 'Shipping', tip: 'The balance shipping and messaging are paid from.' },
      { label: 'API Integrations', to: '/settings/api-integrations', perm: 'settings.manage', section: 'Messaging', tip: 'Keys for WhatsApp, email, payments and analytics.' },
      { label: 'Message templates', to: '/settings/sms-templates', perm: 'settings.manage', section: 'Messaging', tip: 'Every message the store sends, per channel: Growcord default or your own.' },
      { label: 'Cart Recovery Automation', to: '/settings/cart-recovery-automation', perm: 'settings.manage', section: 'Messaging', tip: 'The messages sent when a cart is left behind.' },
      // HMAPP design 60 AD05, AD06, AD08 and the app's order words (HMAPP-T4c); HMAPP-3 points 7 to 9: the assistant and
      // scan, and where app events may go beyond our own server (lane BB's destinations route is in Connections).
      { label: 'Mobile App', to: '/settings/app', perm: 'settings.read', section: 'App', tip: 'Versions, switches, banners, support, sign in, legal pages and privacy for the app.' },
      { label: 'App Audience', to: '/settings/app/audience', perm: 'settings.read', section: 'App', tip: 'The who are you and interests lists the app asks, and the answers so far.' },
      { label: 'App Assistant', to: '/settings/app/assistant', perm: 'settings.read', section: 'App', tip: 'Ordering in words and by photo: switches, the daily budget, reply words and usage.' },
      { label: 'App Tracking', to: '/settings/app/tracking', perm: 'settings.read', modules: ['connectors'], section: 'App', tip: 'Which ad platforms may get app events. Off until you turn one on.' },
      { label: 'Staff & Access', to: '/settings/staff', icon: ShieldCheck, perm: 'staff.read', section: 'Team and plan', tip: 'Who can sign in, and what each of them may do.' },
      { label: 'Billing', to: '/settings/billing', perm: 'billing.read', section: 'Team and plan', tip: 'Your plan, commission and Growcord\'s invoices to you.' },
      { label: 'Logs', to: '/logs', icon: FileText, perm: 'audit.read', section: 'Team and plan', tip: 'What happened in this admin, and who did it.' },
    ]),
    // TICKETS-1 (owner 25 Nov 2026): tickets to Growcord; /support/:id is under the same gate.
    { label: 'Help and support', to: '/support', icon: LifeBuoy, perm: 'support.read', tip: 'Ask Growcord for help, and read and answer the replies.' },
  ]),
];

/**
 * Pages this admin still serves but does NOT list in the sidebar: their home is another Growcord product (reached
 * from the tab strip), or a button on a page reaches them. The gate is kept here verbatim, so leaving the menu never
 * loosened a route. `routePermissions.ts` reads this list exactly as it reads MENU. `product` names the product that
 * owns each page; the command search lists them under that name for people who may open them.
 */
const BOOKS = 'Books';
const WMS = 'WMS';
const MAKE = 'Make';
export const OFF_MENU: MenuItem[] = [
  // Marketing hub extras: Comms, CRM and Insights own these now. Each route is listed in MENU first, whose gate wins.
  { label: 'Templates', to: '/panel/marketing/templates', icon: FileText, perm: 'marketing.manage', modules: ['marketing'], tip: 'The message bodies a campaign sends.' },
  { label: 'Follow-ups', to: '/panel/marketing/automation', icon: Bot, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sequences that run themselves after an event.' },
  { label: 'Performance', to: '/panel/marketing/performance', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Spend against revenue, channel by channel.' },
  { label: 'Growth', to: '/panel/marketing/growth', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Cohorts, lifetime value and the funnel.' },
  { label: 'Reports', to: '/panel/marketing/analytics', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Campaign and audience numbers over time.' },
  { label: 'Consent', to: '/panel/marketing/compliance', icon: ShieldCheck, perm: 'customers.read', modules: ['marketing'], tip: 'Who may be messaged, and when they may not.' },
  { label: 'Preferences', to: '/panel/marketing/settings', icon: Settings, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sender names, quiet hours and sending limits.' },
  // Inventory floor and purchasing: WMS and Make own these.
  { label: 'Transfers', to: '/panel/inventory/transfers', icon: ArrowLeftRight, perm: 'inventory.adjust', product: WMS, tip: 'Move stock between warehouses and outlets.' },
  { label: 'Counts', to: '/panel/inventory/counts', icon: Scale, perm: ['inventory.adjust', 'warehouse.count_approve'], modules: ['wms'], product: WMS, tip: 'Count a shelf and post what you actually found.' },
  { label: 'Units', to: '/panel/inventory/uom', icon: Boxes, perm: 'inventory.manage', product: WMS, tip: 'Pieces, boxes, cases, and how they convert.' },
  { label: 'Kits', to: '/panel/inventory/bom', icon: Hammer, perm: 'inventory.manage', product: MAKE, tip: 'What a made-up item is built from.' },
  { label: 'Work orders', to: '/panel/inventory/work-orders', icon: Hammer, perm: 'inventory.manage', product: MAKE, tip: 'Assembling kits: planned, in progress, done.' },
  { label: 'Stock reports', to: '/panel/inventory/reports', icon: FileSpreadsheet, perm: 'reports.read', modules: ['reports'], product: WMS, tip: 'Movements, valuation, ageing and expiry.' },
  { label: 'Layout', to: '/panel/inventory/wms', icon: Warehouse, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], product: WMS, tip: 'Racks, shelves and bins as you would walk them.' },
  { label: 'Pick lists', to: '/panel/inventory/pick-lists', icon: PackageSearch, perm: ['inventory.read', 'warehouse.read'], modules: ['wms'], product: WMS, tip: 'What the floor is picking right now.' },
  { label: 'Goods in', to: '/panel/inventory/goods-in', icon: Boxes, perm: ['inventory.read', 'warehouse.operate'], modules: ['wms'], product: WMS, tip: 'Book in a delivery and sticker every piece.' },
  { label: 'Labels', to: '/panel/inventory/labels', icon: FileText, perm: 'inventory.read', modules: ['wms'], product: WMS, tip: 'Barcodes and shelf labels to print.' },
  { label: 'Scanner', to: '/scan', icon: PackageSearch, perm: ['warehouse.operate', 'inventory.adjust'], modules: ['wms'], product: WMS, tip: 'The phone screen for putaway, picking and counting.', owns: ['/scan/putaway', '/scan/pick', '/scan/move', '/scan/count', '/putaway', '/pick', '/move', '/count'] },
  { label: 'Purchase orders', to: '/panel/purchasing', icon: Store, perm: 'purchasing.read', modules: ['purchasing'], product: MAKE, tip: 'Orders to your suppliers, and what arrived.', owns: ['/panel/inventory/purchasing'] },
  { label: 'Scorecard', to: '/panel/purchasing/scorecard', icon: LineChart, perm: 'purchasing.read', modules: ['purchasing'], product: MAKE, tip: 'Which supplier delivers on time and in full.' },
  // Accounting: Books owns these; the admin's copies stay until lane U's parity is signed off.
  { label: 'Books home', to: '/panel/accounting', icon: Gauge, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Cash, receivables and what is due this week.' },
  { label: 'Proformas & invoices', to: '/panel/accounting/proforma', icon: FileText, perm: 'accounting.read', modules: ['billing'], product: BOOKS, tip: 'Proforma, tax invoices and credit notes on the document kernel.' },
  { label: 'Statements', to: '/panel/accounting/statements', icon: LineChart, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Profit and loss, balance sheet, cash flow.' },
  { label: 'Receivables', to: '/panel/accounting/receivables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Who owes you, and for how long.' },
  { label: 'Receipts', to: '/panel/accounting/payments-received', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Money that has come in, matched to invoices.' },
  { label: 'Recurring', to: '/panel/accounting/recurring-invoices', icon: Repeat, perm: 'accounting.read', modules: ['accounting', 'subscriptions'], product: BOOKS, tip: 'Invoices that raise themselves on a schedule.' },
  { label: 'Reminders', to: '/panel/accounting/dunning', icon: Bell, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Chasing an overdue invoice, politely and on time.' },
  { label: 'Payouts', to: '/panel/accounting/settlements', icon: Store, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'What each marketplace paid out, and what it kept.' },
  { label: 'Bills', to: '/panel/accounting/bills', icon: FileText, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Supplier invoices, matched to the PO and the delivery.' },
  { label: 'Payables', to: '/panel/accounting/payables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Who you owe, and by when.' },
  { label: 'Expenses', to: '/panel/accounting/expenses', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Day-to-day spending and the cash book.' },
  { label: 'Accounts', to: '/panel/accounting/bank-accounts', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Every bank and cash account you hold.' },
  { label: 'Reconcile', to: '/panel/accounting/bank-recon', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Match the statement against the books.' },
  { label: 'Bank rules', to: '/panel/accounting/bank-rules', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Label a recurring statement line automatically.' },
  { label: 'Currencies', to: '/panel/accounting/fx', icon: Coins, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Exchange rates and the gain or loss they cause.' },
  { label: 'GSTR-1', to: '/panel/accounting/gstr1', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'Outward supplies, ready to file.' },
  { label: 'GSTR-3B', to: '/panel/accounting/gstr3b', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'The monthly summary return.' },
  { label: 'GSTR-9', to: '/panel/accounting/gstr9', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'The annual return.' },
  { label: 'HSN summary', to: '/panel/accounting/hsn-summary', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'Sales grouped by HSN code and rate.' },
  { label: 'Input credit', to: '/panel/accounting/itc', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'GSTR-2B against the bills you recorded.' },
  { label: 'Rate check', to: '/panel/accounting/rate-check', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'Products whose rate looks wrong for their HSN.' },
  { label: 'Rate codes', to: '/panel/accounting/rate-codes', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], product: BOOKS, tip: 'The statutory rates, with the date each took effect.' },
  { label: 'E-invoicing', to: '/panel/accounting/einvoicing', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting', 'einvoicing'], product: BOOKS, tip: 'IRN and QR for every invoice that needs one.' },
  { label: 'TDS', to: '/panel/accounting/tds', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Tax deducted on what you pay out.' },
  { label: 'TCS', to: '/panel/accounting/tcs', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Tax collected on what you sell.' },
  { label: 'Chart of accounts', to: '/panel/accounting/chart-of-accounts', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'The chart of accounts.' },
  { label: 'Journals', to: '/panel/accounting/journals', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Entries posted by hand (posting needs accounting.post; the page hides it).' },
  { label: 'Opening', to: '/panel/accounting/opening-balances', icon: Scale, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'What each account held on day one.' },
  { label: 'Trial balance', to: '/panel/accounting/trial-balance', icon: Scale, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Every account\'s balance, debits against credits.' },
  { label: 'General ledger', to: '/panel/accounting/general-ledger', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Every entry against one account.' },
  { label: 'Assets', to: '/panel/accounting/assets', icon: Building2, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Things you own that lose value over time.' },
  { label: 'Reconciliation', to: '/panel/accounting/reconciliation', icon: Scale, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Where the books and the operations disagree.' },
  { label: 'Number series', to: '/panel/accounting/series-gaps', icon: FileSpreadsheet, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Gaps in a document number series.' },
  { label: 'Audit trail', to: '/panel/accounting/audit', icon: ShieldCheck, perm: 'audit.read', modules: ['accounting'], product: BOOKS, tip: 'Who changed what, in order, unalterable.' },
  { label: 'Documents', to: '/panel/accounting/documents', icon: FolderArchive, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Files attached to the books.' },
  { label: 'Jobs', to: '/panel/accounting/scheduled-jobs', icon: CalendarClock, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Background runs and whether they succeeded.' },
  { label: 'Report mail', to: '/panel/accounting/report-schedules', icon: Mail, perm: 'accounting.read', modules: ['accounting'], product: BOOKS, tip: 'Reports emailed out on a schedule.' },
];

/* routes with no menu entry, and their gate */

/**
 * Pages reached from a button, a deep link or a redirect. They are NOT menu items, but they still need a gate: this
 * is the half `routePermissions.ts` used to carry separately and was the reason `/panel/*` children were ungated (L5
 * section 1, mechanism 2).
 */
export const EXTRA_ROUTES: Array<{ path: string; perm?: string | string[]; modules?: string[] }> = [
  // A redirect target, kept because old bookmarks point at it.
  { path: '/settings/general', perm: 'settings.manage' },
  { path: '/appearance', perm: 'content.manage' },
  // `/pages/new`, `/pages/:id/edit` and `/pages/:id/builder`. The prefix matcher cannot see past the `:id`, so the
  // visual builder's `page_builder` module is stated here for the whole prefix, exactly as the old table did. The
  // Pages LIST (`/appearance/pages`) is deliberately not module-gated: a store's policy pages are core, not a builder
  // feature (COMMON_MISTAKES #250).
  { path: '/pages', perm: 'content.manage', modules: ['page_builder'] },
  { path: '/analytics', perm: 'reports.read', modules: ['analytics'] },
  // Growcord Ship's tabs (the sidebar shows only /growship): each page keeps its own gate, from GROWSHIP_TABS and
  // GROWSHIP_MORE, the one list the tabs and the command search read too.
  ...[...GROWSHIP_TABS, ...GROWSHIP_MORE]
    .filter((t) => t.to !== '/growship')
    .map((t) => ({ path: t.to, perm: t.perm, modules: t.modules })),
];

/* helpers */

/** An item and, recursively, its children: flat, in menu order. */
export function withChildren(item: MenuItem): MenuItem[] {
  return [item, ...(item.children ?? []).flatMap(withChildren)];
}

/** Every item in the menu (children included), flat, in menu order. */
export function allMenuItems(): MenuItem[] {
  return MENU.flatMap((g) => g.subs.flatMap((s) => s.items.flatMap(withChildren)));
}

/** Where a pathname sits in this file: the entry that owns it, the sidebar row it is under, and that row's group. */
export interface MenuPlace {
  /** The entry whose route (or an owned route) matched longest: a row, an area's tab, a Growcord Ship page, or an OFF_MENU page. */
  node: MenuItem;
  /** The sidebar row the entry sits under (the area for a tab; the row itself for a row). Absent for OFF_MENU. */
  row?: MenuItem;
  group?: MenuGroup;
  /** OFF_MENU only: the product that owns the page ('E-commerce' when none is named). */
  product?: string;
  /** The route base that matched. */
  matched: string;
}

/**
 * The ONE answer to "which menu entry does this URL belong to", used by the sidebar, the area tabs, the breadcrumb
 * and the settings directory. Longest prefix over every entry's route and the routes it owns; among MENU entries a
 * later one wins a tie (a tab listed after its area at the same route), and an OFF_MENU page wins only with a longer
 * match, so a page listed in both places is placed where MENU lists it. With `menuOnly`, OFF_MENU is left out.
 */
export function whereIs(pathname: string, opts: { menuOnly?: boolean } = {}): MenuPlace | null {
  const path = ('/' + pathname.split('?')[0].replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  let best: MenuPlace | null = null;
  let bestLen = -1;
  const consider = (node: MenuItem, place: Omit<MenuPlace, 'node' | 'matched'>, tieWins: boolean) => {
    if (node.external) return;
    for (const route of [node.to, ...(node.owns ?? [])]) {
      const p = routeBase(route);
      if (!p.startsWith('/')) continue;
      if ((path === p || path.startsWith(p + '/')) && (p.length > bestLen || (tieWins && p.length === bestLen))) {
        best = { ...place, node, matched: p };
        bestLen = p.length;
      }
    }
  };
  for (const group of MENU) {
    for (const sub of group.subs) {
      for (const row of sub.items) {
        consider(row, { row, group }, true);
        for (const child of [...(row.children ?? []), ...(row.palette ?? [])]) consider(child, { row, group }, true);
      }
    }
  }
  if (!opts.menuOnly) for (const page of OFF_MENU) consider(page, { product: page.product ?? 'E-commerce' }, false);
  return best;
}

/** The group a pathname belongs to (the settings directory groups its pages by it). */
export function groupForPath(pathname: string): string | null {
  return whereIs(pathname, { menuOnly: true })?.group?.id ?? null;
}

/** `/products/:id/edit` becomes `/products`: the part a prefix match can use. */
export function routeBase(route: string): string {
  const noQuery = route.split('?')[0];
  const cut = noQuery.indexOf('/:');
  return cut === -1 ? noQuery : noQuery.slice(0, cut);
}
