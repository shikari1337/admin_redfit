/**
 * Admin route → required permission.
 *
 * Until now every route in App.tsx sat behind `<ProtectedRoute>` alone, which
 * only proves you are LOGGED IN. Nav items were hidden per-permission, but
 * typing the URL rendered the page — menu-hiding is not access control. The
 * page then fired its API calls and got 403s, so the user saw a broken screen
 * instead of an honest "you don't have access".
 *
 * This is defence in depth, not the enforcement boundary: the API is still the
 * authority (a hostile user can edit their own bundle). The value here is that
 * an ordinary user never lands somewhere they cannot use.
 *
 * Matching is LONGEST-PREFIX-WINS, so `/settings/staff` (staff.manage) beats
 * `/settings` (settings.read). Paths absent from the table need only login —
 * add new privileged routes here.
 */

export const ROUTE_PERMISSIONS: Record<string, string> = {
  // ── Orders & fulfilment ──────────────────────────────────────────────────
  '/orders': 'orders.read',
  '/orders/new': 'orders.manage',
  '/orders/abandoned-carts': 'orders.read',
  '/panel/orders': 'orders.read',
  '/panel/orders/quotations': 'orders.read',
  '/panel/orders/documents': 'orders.read',
  '/panel/orders/refunds': 'orders.manage',
  '/panel/orders/cod-recon': 'orders.read',
  '/panel/orders/rto': 'shipments.read',
  '/panel/orders/ewb': 'shipments.read',
  '/panel/orders/weight-disputes': 'shipments.read',
  '/panel/orders/automation-rules': 'settings.manage',
  '/shipments': 'shipments.read',
  '/returns': 'returns.read',
  '/pos': 'orders.manage',

  // ── Catalog ──────────────────────────────────────────────────────────────
  '/products': 'products.read',
  '/products/new': 'products.manage',
  '/products/import-export': 'products.manage',
  '/products/categories': 'products.read',
  '/products/brands': 'products.read',
  '/products/tags': 'products.read',
  '/products/attributes': 'products.read',
  '/products/specifications': 'products.read',
  '/products/size-charts': 'products.read',
  '/products/bundles': 'products.read',
  '/products/variant-link-groups': 'products.read',

  // ── Storefront content ───────────────────────────────────────────────────
  '/pages': 'content.read',
  '/blogs': 'content.read',
  '/faqs': 'content.read',
  '/reviews': 'content.read',
  '/seo': 'content.read',
  '/gallery': 'content.read',
  '/appearance': 'content.manage',

  // ── Inventory & warehouse ────────────────────────────────────────────────
  '/inventory': 'inventory.read',
  '/warehouses': 'inventory.read',
  '/panel/inventory': 'inventory.read',
  '/panel/inventory/purchasing': 'purchasing.read',
  '/panel/inventory/reports': 'reports.read',
  '/panel/inventory/uom': 'inventory.manage',
  '/panel/inventory/bom': 'inventory.manage',
  '/panel/inventory/work-orders': 'inventory.manage',
  '/panel/inventory/transfers': 'inventory.adjust',
  '/panel/inventory/counts': 'inventory.adjust',
  '/panel/inventory/approvals': 'inventory.manage',
  '/scan': 'inventory.adjust',
  '/putaway': 'inventory.adjust',
  '/pick': 'inventory.adjust',
  '/move': 'inventory.adjust',
  '/count': 'inventory.adjust',

  // ── Purchasing ───────────────────────────────────────────────────────────
  '/panel/purchasing': 'purchasing.read',
  '/panel/purchasing/scorecard': 'purchasing.read',
  '/vendors': 'purchasing.read',

  // ── Accounting (the whole panel is books data) ───────────────────────────
  '/panel/accounting': 'accounting.read',
  '/panel/accounting/journals': 'accounting.post',
  '/panel/accounting/settings': 'settings.manage',
  '/panel/accounting/audit': 'audit.read',
  '/panel/accounting/gstr1': 'gst.read',
  '/panel/accounting/gstr3b': 'gst.read',
  '/panel/accounting/gstr9': 'gst.read',
  '/panel/accounting/hsn-summary': 'gst.read',
  '/panel/accounting/rate-check': 'gst.read',
  '/panel/accounting/rate-codes': 'gst.read',
  '/panel/accounting/itc': 'gst.read',
  '/panel/customers/credit': 'customers.read',

  // ── Marketing ────────────────────────────────────────────────────────────
  '/marketing': 'marketing.read',
  '/coupons': 'marketing.read',
  '/coupons/new': 'marketing.manage',
  '/panel/marketing': 'marketing.read',
  '/panel/marketing/campaigns': 'marketing.read',
  '/panel/marketing/templates': 'marketing.manage',
  '/panel/marketing/audiences': 'marketing.manage',
  '/panel/marketing/automation': 'marketing.manage',
  '/panel/marketing/compliance': 'customers.read',
  '/panel/marketing/settings': 'marketing.manage',
  '/panel/marketing/ads': 'ads.read',
  '/panel/marketing/growth': 'reports.read',
  '/panel/marketing/analytics': 'reports.read',
  '/panel/marketing/performance': 'reports.read',

  // ── Channels ─────────────────────────────────────────────────────────────
  '/channels': 'channels.read',
  '/channels/mapping': 'channels.manage',
  '/channels/import': 'channels.manage',
  '/channels/allocation': 'channels.manage',

  // ── Customers & B2B ──────────────────────────────────────────────────────
  '/customers': 'customers.read',
  '/b2b': 'b2b.read',

  // ── Analytics / reports ──────────────────────────────────────────────────
  '/analytics': 'reports.read',

  // ── Panel users: managing logins is NOT a general settings action ────────
  '/users': 'staff.read',
  '/settings/staff': 'staff.manage',

  // ── Store configuration (credentials, tax, payment, numbering) ───────────
  '/settings': 'settings.read',
  '/settings/general': 'settings.manage',
  '/settings/api-integrations': 'settings.manage',
  '/settings/payment-gateways': 'settings.manage',
  '/settings/payment-discount': 'settings.manage',
  '/settings/gst': 'settings.manage',
  '/settings/tax-rules': 'settings.manage',
  '/settings/shipping': 'settings.manage',
  '/settings/packages': 'settings.manage',
  '/settings/order-numbering': 'settings.manage',
  '/settings/invoice': 'settings.manage',
  '/settings/sms-templates': 'settings.manage',
  '/settings/modules': 'settings.manage',
  '/settings/store-config': 'settings.manage',
  '/settings/contact': 'settings.manage',
  '/settings/manufacturers': 'products.manage',
  '/settings/return-policies': 'settings.manage',
  '/panel/settings/templates': 'settings.manage',
  '/panel/settings/custom-fields': 'settings.manage',
  '/setup-guide': 'settings.read',

  // ── Platform billing (wallet / plan invoices) ───────────────────────────
  '/settings/billing': 'billing.read',
  '/settings/wallet': 'billing.read',

  '/logs': 'audit.read',
};

/**
 * Route → the store MODULE it needs. Orthogonal to permission: this asks
 * "has the store got this feature?" (super-admin toggle / plan), not "may this
 * user do it?". Both must pass. Same longest-prefix matching.
 */
export const ROUTE_MODULES: Record<string, string> = {
  '/panel/accounting': 'accounting',
  '/panel/purchasing': 'purchasing',
  '/panel/inventory/purchasing': 'purchasing',
  '/panel/inventory/wms': 'wms',
  '/panel/inventory/pick-lists': 'wms',
  '/panel/inventory/counts': 'wms',
  '/panel/inventory/labels': 'wms',
  '/panel/inventory/reports': 'reports',
  '/scan': 'wms',
  '/pos': 'pos',
  '/panel/marketing': 'marketing',
  '/marketing': 'marketing',
  '/coupons': 'coupons',
  '/leads': 'crm',
  '/channels': 'channel_sync',
  '/b2b': 'b2b',
  '/blogs': 'blog',
  '/reviews': 'reviews',
  '/shipments': 'shipping',
  '/returns': 'returns',
  '/inventory': 'inventory',
  '/warehouses': 'inventory',
  '/analytics': 'analytics',
  '/products/bundles': 'bundles',
  '/products/size-charts': 'size_charts',
  '/pages': 'page_builder',
  '/panel/accounting/einvoicing': 'einvoicing',
  '/settings/manufacturers': 'manufacturers',
};

function longestPrefixMatch(table: Record<string, string>, pathname: string): string | null {
  const p = ('/' + pathname.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  let best: string | null = null;
  let bestLen = -1;
  for (const [route, value] of Object.entries(table)) {
    if ((p === route || p.startsWith(route + '/')) && route.length > bestLen) {
      best = value;
      bestLen = route.length;
    }
  }
  return best;
}

/**
 * The permission a pathname requires, or null when login alone is enough.
 * Longest matching prefix wins so a specific child overrides its parent.
 */
export function permissionForPath(pathname: string): string | null {
  return longestPrefixMatch(ROUTE_PERMISSIONS, pathname);
}

/** The store module a pathname requires, or null when it is always available. */
export function moduleForPath(pathname: string): string | null {
  return longestPrefixMatch(ROUTE_MODULES, pathname);
}
