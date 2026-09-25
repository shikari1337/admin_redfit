/**
 * THE admin menu — and therefore THE admin gating table.
 *
 * ONE definition. The sidebar renders from `MENU`; `routePermissions.ts` is
 * DERIVED from `MENU` + `OFF_MENU` + `EXTRA_ROUTES`, so a link that exists is a
 * link the guard agrees with, and a page with no menu entry still has a gate.
 * (Before 2026-09-25 there were three hand-kept answers to "may this user open
 * this page" and they disagreed — L5 §1.)
 *
 * SHAPE (owner, 2026-09-25 afternoon): the admin is the E-COMMERCE panel, and
 * its sidebar is the one the store's staff already knew — Overview · Orders ·
 * Catalog · Marketing · Store Customers · Content · System — with the finer
 * options folded under a collapsible item (Products ▸, Settings ▸, …) or into
 * tabs and cards on the page itself, never as more sidebar rows. Accounting,
 * the warehouse floor, purchasing, shipping operations, HR and analytics are
 * OTHER Growcord products; the tab strip in the header links to them
 * (`components/ProductTabs.tsx`). Pages this admin still serves for those
 * products stay reachable and gated through `OFF_MENU`.
 *
 * Rules the entries obey:
 *  · `label` is a NAME, at most three words. Never a sentence.
 *  · `tip` is the one line shown on hover.
 *  · `perm` is the backend permission the page's own API needs (`<area>.<action>`,
 *    `kernel/rbac/roles.ts`). An ARRAY means any ONE is enough. `modules` are the
 *    store features it needs, ALL of them.
 *  · `owns` lists child routes (a `/new`, an `/:id/edit`, a callback) that are not
 *    listed but inherit the item's gate.
 *  · `children` are the collapsible sub-items under an item — each is a full
 *    MenuItem with its own gate, so a child a person cannot open is absent.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Home, ShoppingCart, Package2, Wallet, Truck, Users, LineChart, Settings,
  RotateCcw, FileText, Store, Megaphone, Ticket, Plug, Palette, Star,
  BookOpen, HelpCircle, Heart, MessageCircleQuestion, Images, Rss, Building2,
  PackageSearch, Warehouse, Scale, ArrowLeftRight, Boxes, Hammer,
  ShieldCheck, FileSpreadsheet, Coins, CalendarClock, Mail, Repeat,
  Bell, SlidersHorizontal, FolderArchive, UserCheck, Sparkles, Gauge, Bot,
} from 'lucide-react';

export interface MenuItem {
  /** Plain name. */
  label: string;
  /** Route, or an absolute https:// address for another Growcord panel. */
  to: string;
  /** One line, shown on hover. */
  tip: string;
  /**
   * Backend permission this page needs. Absent = login is enough. An ARRAY
   * means any ONE of them is enough — the warehouse routes deliberately accept
   * `warehouse.operate` OR the older `inventory.adjust` while both are in use.
   */
  perm?: string | string[];
  /** Store modules this page needs — ALL of them. */
  modules?: string[];
  icon?: LucideIcon;
  /** Unlisted child routes that inherit this item's gate. */
  owns?: string[];
  /** Opens in the same tab on another gc.mw host. */
  external?: boolean;
  /** Collapsible sub-items (rendered with a chevron, as the admin always did). */
  children?: MenuItem[];
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

/* ───────────────────── sibling products (link targets) ───────────────────── */

/** Dev ports — `suite/scripts/scaffold.mjs` APPS, the one list of them. */
const DEV_PORTS: Record<string, number> = {
  hub: 5200, books: 5201, ship: 5202, comms: 5203, insights: 5204, make: 5205, wms: 5206,
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

/* ─────────────────── the registry's areas (Settings Center) ─────────────────── */

/**
 * `SETTINGS_GROUPS` in backend/src/config/settingsRegistry.ts, by number.
 * A MIRROR, the way `lib/rbac.ts` mirrors `kernel/rbac/roles.ts` — the Settings
 * Center compares the two against the live registry and says so on screen when
 * a group exists on one side only. Read by the ⌘K palette.
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

/* ───────────────────────────── the menu ───────────────────────────── */

/** A group with ONE section: the sidebar shows the group label only. */
const one = (id: string, label: string, icon: LucideIcon, home: string, items: MenuItem[]): MenuGroup => ({
  id, label, icon, home, subs: [{ label, items }],
});

export const MENU: MenuGroup[] = [
  one('overview', 'Overview', Home, '/dashboard', [
    { label: 'Dashboard', to: '/dashboard', icon: Home, tip: 'What needs you today, then the numbers.' },
    {
      label: 'Analytics', to: '/analytics/dashboard', icon: LineChart, perm: 'reports.read', modules: ['analytics'],
      tip: 'Sales, orders and customers over a period.',
      children: [
        { label: 'Dashboard', to: '/analytics/dashboard', perm: 'reports.read', modules: ['analytics'], tip: 'Sales, orders and customers over a period.' },
        { label: 'Store', to: '/analytics/store', perm: 'reports.read', modules: ['analytics'], tip: 'Products, categories and the checkout funnel.' },
        { label: 'Marketing', to: '/analytics/marketing', perm: 'reports.read', modules: ['analytics'], tip: 'Which channel brought the order.' },
        { label: 'Users', to: '/analytics/users', perm: 'reports.read', modules: ['analytics'], tip: 'Who is visiting, on what, and from where.' },
        { label: 'Realtime', to: '/analytics/realtime', perm: 'reports.read', modules: ['analytics'], tip: 'What is happening on the shop right now.' },
        { label: 'Custom', to: '/analytics/custom', perm: 'reports.read', modules: ['analytics'], tip: 'Build the report you actually want.' },
      ],
    },
  ]),

  one('orders', 'Orders', ShoppingCart, '/orders', [
    {
      label: 'Orders', to: '/orders', icon: ShoppingCart, perm: 'orders.read', tip: 'Every order, from every channel.',
      owns: ['/orders/:id'],
      children: [
        { label: 'All Orders', to: '/orders', perm: 'orders.read', tip: 'Every order, from every channel.' },
        { label: 'Create Order', to: '/orders/new', perm: 'orders.manage', tip: 'Key in an order on a customer’s behalf.' },
        { label: 'Abandoned Carts', to: '/orders/abandoned-carts', perm: 'orders.read', tip: 'Carts that were filled but never paid for.', owns: ['/orders/abandoned-carts/:id'] },
        { label: 'Quotations', to: '/panel/orders/quotations', perm: 'orders.read', tip: 'Prices offered to a buyer before an order exists.' },
        { label: 'Credit Notes & Challans', to: '/panel/orders/documents', perm: 'orders.read', tip: 'Credit notes, debit notes and delivery challans.' },
        { label: 'Refunds', to: '/panel/orders/refunds', perm: 'orders.manage', tip: 'Money to send back: requested, approved, paid.' },
        { label: 'Sales & Team', to: '/panel/orders/sales-team', perm: 'reports.read', tip: 'Who sold what, and who is handling it now.' },
      ],
    },
    { label: 'Returns', to: '/returns', icon: RotateCcw, perm: 'returns.read', modules: ['returns'], tip: 'What a customer sent back, and where it is.' },
    { label: 'Shipments', to: '/shipments', icon: Truck, perm: 'shipments.read', modules: ['shipping'], tip: 'Every parcel: booked, picked up, delivered.' },
    { label: 'POS (New Sale)', to: '/pos', icon: Store, perm: 'orders.manage', modules: ['pos'], tip: 'Sell over the counter and take payment now.' },
  ]),

  one('catalog', 'Catalog', Package2, '/products', [
    {
      label: 'Products', to: '/products', icon: Package2, perm: 'products.read', tip: 'The catalog, every SKU.',
      owns: ['/products/:id/edit', '/products/:id/sections', '/products/:productSlug/variations/:variationKey/edit'],
      children: [
        { label: 'All Products', to: '/products', perm: 'products.read', tip: 'The catalog, every SKU.' },
        { label: 'Create Product', to: '/products/new', perm: 'products.manage', tip: 'Add one product by hand.' },
        { label: 'Import / Export', to: '/products/import-export', perm: 'products.manage', tip: 'Bulk create and update from a sheet.' },
        { label: 'Bundles', to: '/products/bundles', perm: 'products.read', modules: ['bundles'], tip: 'Buy-more-save-more and fixed packs.', owns: ['/products/bundles/new', '/products/bundles/:id/edit'] },
        { label: 'Categories', to: '/products/categories', perm: 'products.read', tip: 'The tree shoppers browse.' },
        { label: 'Brands', to: '/products/brands', perm: 'products.read', tip: 'Brands, their pages and who owns them.' },
        { label: 'Companies', to: '/products/companies', perm: 'products.read', tip: 'The legal companies behind the brands.' },
        { label: 'Attributes', to: '/products/attributes', perm: 'products.read', tip: 'Potency, size and the other axes of a variation.' },
        { label: 'Tags', to: '/products/tags', perm: 'products.read', tip: 'Free labels for grouping and filtering.', owns: ['/products/tags/new', '/products/tags/:id/edit'] },
        { label: 'Size Charts', to: '/products/size-charts', perm: 'products.read', modules: ['size_charts'], tip: 'Measurement tables shown on a product page.' },
        { label: 'Specifications', to: '/products/specifications', perm: 'products.read', tip: 'Reusable spec tables for a product page.', owns: ['/products/specifications/new', '/products/specifications/:id/edit'] },
        { label: 'Variant Link Groups', to: '/products/variant-link-groups', perm: 'products.read', tip: 'Products that are each other’s variants.' },
      ],
    },
    {
      label: 'Inventory', to: '/inventory', icon: Warehouse, perm: 'inventory.read', modules: ['inventory'],
      tip: 'How many of each SKU you actually have.',
      children: [
        { label: 'Stock Levels', to: '/inventory', perm: 'inventory.read', modules: ['inventory'], tip: 'How many of each SKU you actually have.' },
        { label: 'Batches & Expiry', to: '/panel/inventory/batches', perm: 'inventory.read', tip: 'Lots, their MRP and their expiry.' },
        { label: 'Reorder', to: '/panel/inventory/reorder', perm: 'inventory.read', tip: 'What to buy, how much, and from whom.' },
        { label: 'Approvals', to: '/panel/inventory/approvals', perm: 'inventory.manage', tip: 'Stock changes waiting for a second pair of eyes.' },
        { label: 'Outlets & Transfers', to: '/panel/inventory/outlets', perm: 'inventory.read', tip: 'Shops that hold their own stock.' },
        { label: 'Consignment', to: '/panel/inventory/consignment', perm: 'inventory.read', tip: 'Stock sitting with a partner, still yours.' },
        { label: 'Distributor Network', to: '/panel/inventory/network', perm: 'products.read', modules: ['b2b'], tip: 'Distributor tiers and the royalty they pay.' },
      ],
    },
    { label: 'Warehouses', to: '/warehouses', icon: PackageSearch, perm: 'inventory.read', modules: ['inventory'], tip: 'The buildings stock is kept in.' },
    { label: 'Vendors', to: '/vendors', icon: Store, perm: 'purchasing.read', tip: 'Who you buy from, and on what terms.', owns: ['/vendors/new', '/vendors/:id/edit'] },
    { label: 'Gallery', to: '/gallery', icon: Images, perm: 'content.read', tip: 'Every image this store has uploaded.' },
  ]),

  one('marketing', 'Marketing', Megaphone, '/panel/marketing', [
    {
      label: 'Marketing', to: '/panel/marketing', icon: Megaphone, perm: 'marketing.read', modules: ['marketing'],
      tip: 'What is running and what it is bringing in.',
      children: [
        { label: 'Overview', to: '/panel/marketing', perm: 'marketing.read', modules: ['marketing'], tip: 'What is running and what it is bringing in.' },
        { label: 'Campaigns', to: '/panel/marketing/campaigns', perm: 'marketing.read', modules: ['marketing'], tip: 'One panel per channel: SMS, WhatsApp, email, push.', owns: ['/panel/marketing/campaigns/:channel'] },
        { label: 'Audiences & Lists', to: '/panel/marketing/audiences', perm: 'marketing.manage', modules: ['marketing'], tip: 'Saved lists of people to send to.' },
        { label: 'Ads Manager', to: '/panel/marketing/ads', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Google and Meta campaigns, spend and results.', owns: ['/panel/marketing/ads/oauth/callback'] },
        { label: 'AI Ads Studio', to: '/panel/marketing/ads/ai-studio', perm: 'ads.read', modules: ['marketing', 'ads_management', 'connectors'], tip: 'AI drafts a campaign; you review before anything runs.' },
        { label: 'Custom Audiences', to: '/panel/marketing/ads/audiences', perm: 'ads.read', modules: ['marketing', 'ads_management'], tip: 'Custom audiences pushed to Google and Meta.' },
        { label: 'Platform Connections', to: '/panel/marketing/connections', perm: 'marketing.read', modules: ['connectors'], tip: 'Sign in to Google and Meta once; every service follows.', owns: ['/panel/marketing/connections/callback'] },
        { label: 'Search & Analytics', to: '/panel/marketing/connections/insights', perm: 'marketing.read', modules: ['connectors'], tip: 'What people searched for before they found you.' },
        { label: 'Google Reviews', to: '/panel/marketing/google-reviews', perm: 'content.read', modules: ['connectors'], tip: 'Your Business Profile reviews — reply and publish.' },
        { label: 'Messaging', to: '/marketing', perm: 'marketing.read', modules: ['marketing'], tip: 'The single-screen sender, with its history.' },
      ],
    },
    {
      label: 'Multi-Channel Sync', to: '/channels', icon: Plug, perm: 'channels.read', modules: ['channel_sync'],
      tip: 'Marketplaces and feeds this catalog is sold on.',
      children: [
        { label: 'Channels', to: '/channels', perm: 'channels.read', modules: ['channel_sync'], tip: 'Marketplaces and feeds this catalog is sold on.' },
        { label: 'Daily file', to: '/channels/daily', perm: 'channels.read', modules: ['channel_sync'], tip: 'The manual upload/download for marketplaces with no API.' },
        { label: 'Excel Import', to: '/channels/import', perm: 'channels.manage', modules: ['channel_sync'], tip: 'Bring a marketplace’s orders in from their sheet.' },
        { label: 'Mapping', to: '/channels/mapping', perm: 'channels.manage', modules: ['channel_sync'], tip: 'Which of their columns is which of your fields.' },
        { label: 'Allocation', to: '/channels/allocation', perm: 'channels.manage', modules: ['channel_sync'], tip: 'How much stock each channel may sell.' },
      ],
    },
    { label: 'Coupons', to: '/coupons', icon: Ticket, perm: 'marketing.read', modules: ['coupons'], tip: 'Discount codes and who may use them.', owns: ['/coupons/new', '/coupons/:id/edit'] },
  ]),

  one('customers', 'Store Customers', Users, '/customers', [
    { label: 'All Customers', to: '/customers', icon: Users, perm: 'customers.read', tip: 'Everyone who has bought or signed up.', owns: ['/customers/:id', '/customers/duplicates', '/users', '/users/:id'] },
    { label: 'CRM', to: '/leads', icon: UserCheck, perm: 'marketing.read', modules: ['crm'], tip: 'Enquiries and the people behind them.' },
    { label: 'B2B', to: '/b2b', icon: Building2, perm: 'b2b.read', modules: ['b2b'], tip: 'Trade accounts, their tier and their price list.' },
    { label: 'Credit Control', to: '/panel/customers/credit', icon: ShieldCheck, perm: 'customers.read', tip: 'Who owes money and who is over their limit.' },
  ]),

  one('content', 'Content', Palette, '/appearance/pages', [
    {
      label: 'Appearance', to: '/appearance/pages', icon: Palette, perm: 'content.manage', tip: 'The shop’s pages, theme and look.',
      children: [
        { label: 'Pages', to: '/appearance/pages', perm: 'content.manage', tip: 'Home, policies and every other page on the shop.', owns: ['/pages/new', '/pages/:id/edit', '/pages/:id/builder'] },
        { label: 'Themes', to: '/appearance/themes', perm: 'content.manage', tip: 'The storefront theme and its live editor.', owns: ['/themes/:id/customize'] },
        { label: 'Banners', to: '/appearance/banners', perm: 'content.manage', tip: 'The sliders and strips on the home page.' },
        { label: 'Menus', to: '/appearance/menus', perm: 'content.manage', tip: 'The shop’s navigation, drag and drop.' },
        { label: 'Style', to: '/appearance/style', perm: 'content.manage', tip: 'Logo, colours, fonts and the notice popup.' },
        { label: 'Products', to: '/appearance/products', perm: 'content.manage', tip: 'What a product page shows, and in what order.' },
        { label: 'Trust Badges', to: '/appearance/trust-badges', perm: 'content.manage', tip: 'The reassurance strip under the buy button.' },
      ],
    },
    { label: 'FAQs', to: '/faqs', icon: HelpCircle, perm: 'content.read', tip: 'Answers reused across the shop.' },
    { label: 'Reviews', to: '/reviews', icon: Star, perm: 'content.read', modules: ['reviews'], tip: 'Customer reviews waiting to be approved.' },
    { label: 'Questions & Answers', to: '/questions', icon: MessageCircleQuestion, perm: 'content.read', modules: ['product_qa'], tip: 'Questions asked on a product page.' },
    { label: 'Wishlists', to: '/wishlists', icon: Heart, perm: 'reports.read', modules: ['wishlist'], tip: 'What shoppers saved but have not bought.' },
    { label: 'Blog Posts', to: '/blogs', icon: BookOpen, perm: 'content.read', modules: ['blog'], tip: 'Articles on the shop.', owns: ['/blogs/new', '/blogs/:id/edit'] },
    { label: 'SEO', to: '/seo', icon: Rss, perm: 'content.read', tip: 'Tracking tags, redirects, robots and the sitemap.' },
  ]),

  one('system', 'System', Settings, '/settings', [
    {
      label: 'Settings', to: '/settings', icon: Settings, perm: 'settings.read', tip: 'Every setting in one place — type a name or a number.',
      children: [
        { label: 'Settings Center', to: '/settings', perm: 'settings.read', tip: 'Every setting in one place — type a name or a number.' },
        { label: 'All settings pages', to: '/settings/directory', perm: 'settings.read', tip: 'Every dedicated settings page, listed.' },
        { label: 'Store Configuration', to: '/settings/store-config', perm: 'settings.manage', tip: 'Name, address, contact, hours and social links.' },
        { label: 'API Integrations', to: '/settings/api-integrations', perm: 'settings.manage', tip: 'Keys for WhatsApp, email, payments and analytics.' },
        { label: 'Contact Submissions', to: '/settings/contact', perm: 'settings.manage', tip: 'What people sent through the contact form.' },
        { label: 'Payment Methods & Discounts', to: '/settings/payment-discount', perm: 'settings.manage', tip: 'When COD is allowed, and prepaid discounts.' },
        { label: 'Payment Gateways', to: '/settings/payment-gateways', perm: 'settings.manage', tip: 'Razorpay, UPI and bank transfer.' },
        { label: 'SMS / WhatsApp Templates', to: '/settings/sms-templates', perm: 'settings.manage', tip: 'The SMS and WhatsApp bodies the store sends.' },
        { label: 'Cart Recovery Automation', to: '/settings/cart-recovery-automation', perm: 'settings.manage', tip: 'The messages sent when a cart is left behind.' },
        { label: 'GST Display', to: '/settings/gst', perm: 'settings.manage', tip: 'Whether prices include tax, and how it is shown.' },
        { label: 'Markets', to: '/settings/markets', perm: 'settings.read', tip: 'The countries you sell to and how they are priced.' },
        { label: 'Tax Rules', to: '/settings/tax-rules', perm: 'settings.manage', modules: ['gst_tax'], tip: 'HSN code to rate, with effective dates.' },
        { label: 'Invoice', to: '/settings/invoice', perm: 'settings.manage', tip: 'Legal name, GSTIN, licences, bank and the layout.' },
        { label: 'Order Numbering', to: '/settings/order-numbering', perm: 'settings.manage', tip: 'The prefix and counter new orders take.' },
        { label: 'Shipping', to: '/settings/shipping', perm: 'settings.manage', tip: 'Fees, free-shipping threshold, zones and couriers.' },
        { label: 'Packages', to: '/settings/packages', perm: 'settings.manage', tip: 'The cartons you pack into, and their size.' },
        { label: 'Wallet', to: '/settings/wallet', perm: 'billing.read', tip: 'The balance shipping and messaging are paid from.' },
        { label: 'Modules', to: '/settings/modules', perm: 'settings.manage', tip: 'Which features are switched on for this store.' },
        { label: 'Billing', to: '/settings/billing', perm: 'billing.read', tip: 'Your plan, commission and Growcord’s invoices to you.' },
        { label: 'Return Policies', to: '/settings/return-policies', perm: 'settings.manage', modules: ['returns'], tip: 'How long a customer has, and what comes back.' },
        { label: 'Manufacturers', to: '/settings/manufacturers', perm: 'products.manage', modules: ['manufacturers'], tip: 'The makers named on a product and its invoice.' },
      ],
    },
    { label: 'Staff & Access', to: '/settings/staff', icon: ShieldCheck, perm: 'staff.manage', tip: 'Who can sign in, and what each of them may do.' },
    { label: 'Setup Guide', to: '/setup-guide', icon: HelpCircle, perm: 'settings.read', tip: 'The steps left before this store is ready to sell.' },
    { label: 'Logs', to: '/logs', icon: FileText, perm: 'audit.read', tip: 'What happened in this admin, and who did it.' },
  ]),
];

/**
 * Pages this admin still serves but does NOT list in the sidebar — their home
 * is another Growcord product (reached from the tab strip), or a button on a
 * page reaches them. The gate is kept here verbatim, so leaving the menu never
 * loosened a route. `routePermissions.ts` reads this list exactly as it reads MENU.
 */
export const OFF_MENU: MenuItem[] = [
  // Orders desk extras — reached from the Orders pages and the Ship panel.
  { label: 'Order desk', to: '/panel/orders', icon: Gauge, perm: 'orders.read', tip: 'The day at a glance: to confirm, to pack, to chase.' },
  { label: 'COD payouts', to: '/panel/orders/cod-recon', icon: Wallet, perm: 'orders.read', tip: 'Cash the courier collected and owes you.' },
  { label: 'Automation', to: '/panel/orders/automation-rules', icon: Bot, perm: 'settings.manage', tip: 'When this happens on an order, do that.' },
  { label: 'Returns in', to: '/panel/orders/rto', icon: RotateCcw, perm: 'shipments.read', tip: 'Parcels coming back, and putting them away.' },
  { label: 'E-way bills', to: '/panel/orders/ewb', icon: FileText, perm: 'shipments.read', tip: 'The document a consignment needs to travel.' },
  { label: 'Weight claims', to: '/panel/orders/weight-disputes', icon: Scale, perm: 'shipments.read', tip: 'Where the courier billed more than the parcel weighs.' },
  // Marketing hub extras — Comms / CRM / Insights own these now.
  { label: 'Templates', to: '/panel/marketing/templates', icon: FileText, perm: 'marketing.manage', modules: ['marketing'], tip: 'The message bodies a campaign sends.' },
  { label: 'Follow-ups', to: '/panel/marketing/automation', icon: Bot, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sequences that run themselves after an event.' },
  { label: 'Performance', to: '/panel/marketing/performance', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Spend against revenue, channel by channel.' },
  { label: 'Growth', to: '/panel/marketing/growth', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Cohorts, lifetime value and the funnel.' },
  { label: 'Reports', to: '/panel/marketing/analytics', icon: LineChart, perm: 'reports.read', modules: ['marketing'], tip: 'Campaign and audience numbers over time.' },
  { label: 'Consent', to: '/panel/marketing/compliance', icon: ShieldCheck, perm: 'customers.read', modules: ['marketing'], tip: 'Who may be messaged, and when they may not.' },
  { label: 'Preferences', to: '/panel/marketing/settings', icon: Settings, perm: 'marketing.manage', modules: ['marketing'], tip: 'Sender names, quiet hours and sending limits.' },
  // Inventory floor and purchasing — WMS and Make own these.
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
  // Accounting — Books owns these; the admin's copies stay until lane U's parity is signed off.
  { label: 'Books', to: '/panel/accounting', icon: Gauge, perm: 'accounting.read', modules: ['accounting'], tip: 'Cash, receivables and what is due this week.' },
  { label: 'Proformas & invoices', to: '/panel/accounting/proforma', icon: FileText, perm: 'accounting.read', modules: ['billing'], tip: 'Proforma, tax invoices and credit notes on the document kernel.' },
  { label: 'Statements', to: '/panel/accounting/statements', icon: LineChart, perm: 'accounting.read', modules: ['accounting'], tip: 'Profit and loss, balance sheet, cash flow.' },
  { label: 'Receivables', to: '/panel/accounting/receivables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Who owes you, and for how long.' },
  { label: 'Receipts', to: '/panel/accounting/payments-received', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Money that has come in, matched to invoices.' },
  { label: 'Recurring', to: '/panel/accounting/recurring-invoices', icon: Repeat, perm: 'accounting.read', modules: ['accounting', 'subscriptions'], tip: 'Invoices that raise themselves on a schedule.' },
  { label: 'Reminders', to: '/panel/accounting/dunning', icon: Bell, perm: 'accounting.read', modules: ['accounting'], tip: 'Chasing an overdue invoice, politely and on time.' },
  { label: 'Payouts', to: '/panel/accounting/settlements', icon: Store, perm: 'accounting.read', modules: ['accounting'], tip: 'What each marketplace paid out, and what it kept.' },
  { label: 'Bills', to: '/panel/accounting/bills', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Supplier invoices, matched to the PO and the delivery.' },
  { label: 'Payables', to: '/panel/accounting/payables', icon: FileText, perm: 'accounting.read', modules: ['accounting'], tip: 'Who you owe, and by when.' },
  { label: 'Expenses', to: '/panel/accounting/expenses', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Day-to-day spending and the cash book.' },
  { label: 'Accounts', to: '/panel/accounting/bank-accounts', icon: Wallet, perm: 'accounting.read', modules: ['accounting'], tip: 'Every bank and cash account you hold.' },
  { label: 'Reconcile', to: '/panel/accounting/bank-recon', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], tip: 'Match the statement against the books.' },
  { label: 'Bank rules', to: '/panel/accounting/bank-rules', icon: ArrowLeftRight, perm: 'accounting.read', modules: ['accounting'], tip: 'Label a recurring statement line automatically.' },
  { label: 'Currencies', to: '/panel/accounting/fx', icon: Coins, perm: 'accounting.read', modules: ['accounting'], tip: 'Exchange rates and the gain or loss they cause.' },
  { label: 'GSTR-1', to: '/panel/accounting/gstr1', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'Outward supplies, ready to file.' },
  { label: 'GSTR-3B', to: '/panel/accounting/gstr3b', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'The monthly summary return.' },
  { label: 'GSTR-9', to: '/panel/accounting/gstr9', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'The annual return.' },
  { label: 'HSN summary', to: '/panel/accounting/hsn-summary', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'Sales grouped by HSN code and rate.' },
  { label: 'Input credit', to: '/panel/accounting/itc', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting'], tip: 'GSTR-2B against the bills you recorded.' },
  { label: 'Rate check', to: '/panel/accounting/rate-check', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], tip: 'Products whose rate looks wrong for their HSN.' },
  { label: 'Rate codes', to: '/panel/accounting/rate-codes', icon: ShieldCheck, perm: 'gst.read', modules: ['accounting'], tip: 'The statutory rates, with the date each took effect.' },
  { label: 'E-invoicing', to: '/panel/accounting/einvoicing', icon: FileSpreadsheet, perm: 'gst.read', modules: ['accounting', 'einvoicing'], tip: 'IRN and QR for every invoice that needs one.' },
  { label: 'TDS', to: '/panel/accounting/tds', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], tip: 'Tax deducted on what you pay out.' },
  { label: 'TCS', to: '/panel/accounting/tcs', icon: ShieldCheck, perm: 'accounting.read', modules: ['accounting'], tip: 'Tax collected on what you sell.' },
  { label: 'Chart of accounts', to: '/panel/accounting/chart-of-accounts', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], tip: 'The chart of accounts.' },
  { label: 'Journals', to: '/panel/accounting/journals', icon: BookOpen, perm: 'accounting.post', modules: ['accounting'], tip: 'Entries posted by hand.' },
  { label: 'Opening', to: '/panel/accounting/opening-balances', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'What each account held on day one.' },
  { label: 'Trial balance', to: '/panel/accounting/trial-balance', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'Every account’s balance, debits against credits.' },
  { label: 'General ledger', to: '/panel/accounting/general-ledger', icon: BookOpen, perm: 'accounting.read', modules: ['accounting'], tip: 'Every entry against one account.' },
  { label: 'Assets', to: '/panel/accounting/assets', icon: Building2, perm: 'accounting.read', modules: ['accounting'], tip: 'Things you own that lose value over time.' },
  { label: 'Reconciliation', to: '/panel/accounting/reconciliation', icon: Scale, perm: 'accounting.read', modules: ['accounting'], tip: 'Where the books and the operations disagree.' },
  { label: 'Number series', to: '/panel/accounting/series-gaps', icon: FileSpreadsheet, perm: 'accounting.read', modules: ['accounting'], tip: 'Gaps in a document number series.' },
  { label: 'Audit trail', to: '/panel/accounting/audit', icon: ShieldCheck, perm: 'audit.read', modules: ['accounting'], tip: 'Who changed what, in order, unalterable.' },
  { label: 'Documents', to: '/panel/accounting/documents', icon: FolderArchive, perm: 'accounting.read', modules: ['accounting'], tip: 'Files attached to the books.' },
  { label: 'Jobs', to: '/panel/accounting/scheduled-jobs', icon: CalendarClock, perm: 'accounting.read', modules: ['accounting'], tip: 'Background runs and whether they succeeded.' },
  { label: 'Report mail', to: '/panel/accounting/report-schedules', icon: Mail, perm: 'accounting.read', modules: ['accounting'], tip: 'Reports emailed out on a schedule.' },
  // Settings pages reached from inside Settings, not from the sidebar.
  { label: 'Setup wizard', to: '/setup', icon: Sparkles, perm: 'settings.manage', tip: 'Walk the guided setup again.' },
  { label: 'Doc templates', to: '/panel/settings/templates', icon: FileText, perm: 'settings.manage', tip: 'How an invoice or a challan is laid out.' },
  { label: 'Custom fields', to: '/panel/settings/custom-fields', icon: SlidersHorizontal, perm: 'settings.manage', tip: 'Extra fields on your own records.' },
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

/** An item and, recursively, its children — flat, in menu order. */
export function withChildren(item: MenuItem): MenuItem[] {
  return [item, ...(item.children ?? []).flatMap(withChildren)];
}

/** Every item in the menu (children included), flat, in menu order. */
export function allMenuItems(): MenuItem[] {
  return MENU.flatMap((g) => g.subs.flatMap((s) => s.items.flatMap(withChildren)));
}

/** The group a pathname belongs to (drives which group is expanded). */
export function groupForPath(pathname: string): string | null {
  let bestId: string | null = null;
  let bestLen = -1;
  for (const g of MENU) {
    for (const sub of g.subs) {
      for (const item of sub.items.flatMap(withChildren)) {
        if (item.external) continue;
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
