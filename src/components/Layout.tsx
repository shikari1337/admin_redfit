import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import PageTransitionLoader from './PageTransitionLoader';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import StoreSwitcher from './StoreSwitcher';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, ShoppingCart, Truck, Warehouse, Users,
  Megaphone, Ticket, Star, HelpCircle, Palette, FileText, Settings,
  UserCheck, Images, Package2, LineChart, Building2, ShieldCheck,
  BookOpen, RotateCcw, Store, Plug,
  Rss, PackageSearch, Scale, FileSpreadsheet, ArrowLeftRight, Wallet, Boxes, Hammer, Bell,
  Handshake, SlidersHorizontal, Undo2, Network, CalendarClock, Coins, Mail,
  FolderArchive, Repeat,
} from 'lucide-react';
import { SetupBanner } from './SetupBanner';
import RouteGuard from './RouteGuard';
import AccessNotice from './AccessNotice';
import { WORKSPACES, WorkspaceKey, workspaceFromPath } from '../lib/rbac';

const Layout: React.FC = () => {
  const { user, canAccess, hasPerm, workspaces, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Sticky workspace: /panel/* paths pin their workspace; other paths keep the
  // last one (sessionStorage) so leaving a panel page doesn't bounce the tabs.
  const [stickyWorkspace, setStickyWorkspace] = useState<WorkspaceKey>(() => {
    const fromPath = workspaceFromPath(window.location.pathname);
    if (window.location.pathname.startsWith('/panel/')) return fromPath;
    return (sessionStorage.getItem('active_workspace') as WorkspaceKey) || fromPath;
  });
  useEffect(() => {
    if (location.pathname.startsWith('/panel/')) {
      const w = workspaceFromPath(location.pathname);
      setStickyWorkspace(w);
      sessionStorage.setItem('active_workspace', w);
    }
  }, [location.pathname]);
  const selectWorkspace = (w: WorkspaceKey) => {
    setStickyWorkspace(w);
    sessionStorage.setItem('active_workspace', w);
    navigate(WORKSPACES[w]?.home ?? '/dashboard');
  };
  const activeWorkspace: WorkspaceKey = stickyWorkspace;

  // Redirect to login if auth is lost mid-session (token expired etc.)
  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userPerms = {
    role: user?.role,
    permissions: user?.permissions ?? [],
    name: user?.name,
    email: user?.email,
  };

  // ── Panel switching lives in the TOP HEADER as tabs (one click, always
  // visible) — the old sidebar "Panels" group was easy to miss. A panel tab
  // shows only when the role has the workspace AND its module is enabled.
  const moduleForWorkspace: Record<WorkspaceKey, string | null> = {
    commerce: null, orders: 'orders', inventory: 'inventory', purchasing: 'purchasing',
    accounting: 'accounting', marketing: 'marketing',
  };
  const headerTabs = (workspaces as WorkspaceKey[])
    .filter((w) => WORKSPACES[w])
    .filter((w) => {
      const mod = moduleForWorkspace[w];
      return !mod || canAccess(mod);
    })
    .map((w) => ({ key: w, title: WORKSPACES[w].title, home: WORKSPACES[w].home }));
  const switcherGroup: { title: string; items: any[] }[] = [];

  const accountingMenu = [
    {
      title: 'Accounting',
      // Two independent gates: module bought (canAccess) AND user permitted
      // (hasPerm). canAccess is module-only now — it is not an authz check.
      items: !canAccess('accounting') || !hasPerm('accounting.read') ? [] : [
        { title: 'Dashboard', url: '/panel/accounting', icon: Home },
        { title: 'Chart of Accounts', url: '/panel/accounting/chart-of-accounts', icon: BookOpen },
        { title: 'Opening Balances', url: '/panel/accounting/opening-balances', icon: Scale },
        { title: 'Trial Balance', url: '/panel/accounting/trial-balance', icon: Scale },
        { title: 'Journals', url: '/panel/accounting/journals', icon: BookOpen },
        { title: 'Financial Statements', url: '/panel/accounting/statements', icon: Scale },
        { title: 'General Ledger', url: '/panel/accounting/general-ledger', icon: BookOpen },
        { title: 'GSTR-1 Draft', url: '/panel/accounting/gstr1', icon: FileSpreadsheet },
        { title: 'GSTR-3B Summary', url: '/panel/accounting/gstr3b', icon: FileSpreadsheet },
        { title: 'HSN Summary (Table 12)', url: '/panel/accounting/hsn-summary', icon: FileSpreadsheet },
        { title: 'GSTR-9 (Annual)', url: '/panel/accounting/gstr9', icon: FileSpreadsheet },
        { title: 'ITC / GSTR-2B', url: '/panel/accounting/itc', icon: FileSpreadsheet },
        { title: 'Vendor Bills (AP)', url: '/panel/accounting/bills', icon: FileText },
        { title: 'Payables (AP)', url: '/panel/accounting/payables', icon: FileText },
        { title: 'Receivables (AR)', url: '/panel/accounting/receivables', icon: FileText },
        { title: 'Payments Received', url: '/panel/accounting/payments-received', icon: Wallet },
        ...(canAccess('subscriptions') ? [{ title: 'Recurring Invoices', url: '/panel/accounting/recurring-invoices', icon: Repeat }] : []),
        { title: 'Payment Reminders', url: '/panel/accounting/dunning', icon: Bell },
        ...(hasPerm('accounting.read') ? [{ title: 'Marketplace Payouts', url: '/panel/accounting/settlements', icon: Store }] : []),
        { title: 'Expenses & Bank Book', url: '/panel/accounting/expenses', icon: Wallet },
        { title: 'Fixed Assets', url: '/panel/accounting/assets', icon: Building2 },
        { title: 'TDS (26Q / 27Q)', url: '/panel/accounting/tds', icon: ShieldCheck },
        { title: 'TCS (27EQ · s.206C)', url: '/panel/accounting/tcs', icon: ShieldCheck },
        { title: 'Scheduled Jobs', url: '/panel/accounting/scheduled-jobs', icon: CalendarClock },
        { title: 'Scheduled Reports', url: '/panel/accounting/report-schedules', icon: Mail },
        { title: 'Bank Accounts', url: '/panel/accounting/bank-accounts', icon: Wallet },
        { title: 'Bank Reconciliation', url: '/panel/accounting/bank-recon', icon: ArrowLeftRight },
        { title: 'Bank Rules', url: '/panel/accounting/bank-rules', icon: ArrowLeftRight },
        { title: 'GST Rate Check', url: '/panel/accounting/rate-check', icon: ShieldCheck },
        { title: 'Statutory Rate Codes', url: '/panel/accounting/rate-codes', icon: ShieldCheck },
        { title: 'Currencies & FX', url: '/panel/accounting/fx', icon: Coins },
        { title: 'Reconciliation', url: '/panel/accounting/reconciliation', icon: Scale },
        ...(canAccess('einvoicing') && hasPerm('gst.read') ? [{ title: 'E-invoicing (IRN)', url: '/panel/accounting/einvoicing', icon: FileSpreadsheet }] : []),
        { title: 'Number Series & Gaps', url: '/panel/accounting/series-gaps', icon: FileSpreadsheet },
        ...(hasPerm('audit.read') ? [{ title: 'Audit Trail', url: '/panel/accounting/audit', icon: ShieldCheck }] : []),
        ...(hasPerm('content.read') ? [{ title: 'Document Library', url: '/panel/accounting/documents', icon: FolderArchive }] : []),
        ...(hasPerm('settings.manage') ? [{ title: 'Document Templates', url: '/panel/settings/templates', icon: FileText }] : []),
        ...(hasPerm('settings.manage') ? [{ title: 'Custom Fields', url: '/panel/settings/custom-fields', icon: SlidersHorizontal }] : []),
        { title: 'Settings', url: '/panel/accounting/settings', icon: Settings },
      ],
    },
    ...switcherGroup,
  ];

  const marketingMenu = [
    {
      title: 'Marketing',
      // Module toggle wins: marketing off → panel empty (APIs 403 anyway)
      items: !canAccess('marketing') || !hasPerm('marketing.read') ? [] : [
        { title: 'Dashboard', url: '/panel/marketing', icon: Home },
        { title: 'Performance (CMO)', url: '/panel/marketing/performance', icon: LineChart },
        { title: 'Growth & Funnel', url: '/panel/marketing/growth', icon: LineChart },
        { title: 'Campaigns', url: '/panel/marketing/campaigns', icon: Megaphone },
        { title: 'Templates', url: '/panel/marketing/templates', icon: FileText },
        { title: 'Audiences & Lists', url: '/panel/marketing/audiences', icon: Users },
        { title: 'Automation', url: '/panel/marketing/automation', icon: ArrowLeftRight },
        ...(canAccess('crm') && hasPerm('marketing.read') ? [{ title: 'Leads (CRM)', url: '/leads', icon: UserCheck }] : []),
        ...(canAccess('coupons') && hasPerm('marketing.read') ? [{ title: 'Coupons', url: '/coupons', icon: Ticket }] : []),
        ...(canAccess('ads_management') && hasPerm('ads.read') ? [
          { title: 'Ads Manager', url: '/panel/marketing/ads', icon: LineChart },
          { title: 'Custom Audiences', url: '/panel/marketing/ads/audiences', icon: Users },
        ] : []),
        { title: 'Analytics', url: '/panel/marketing/analytics', icon: LineChart },
        { title: 'Compliance & Consent', url: '/panel/marketing/compliance', icon: ShieldCheck },
        ...(hasPerm('marketing.manage') ? [{ title: 'Settings', url: '/panel/marketing/settings', icon: Settings }] : []),
      ],
    },
    ...switcherGroup,
  ];

  const purchasingMenu = [
    {
      title: 'Purchasing',
      items: !canAccess('purchasing') || !hasPerm('purchasing.read') ? [] : [
        { title: 'Purchase Orders & GRNs', url: '/panel/purchasing', icon: Store },
        ...(hasPerm('purchasing.read') ? [{ title: 'Vendor Scorecard', url: '/panel/purchasing/scorecard', icon: LineChart }] : []),
        ...(hasPerm('products.read') ? [{ title: 'Vendors', url: '/vendors', icon: Building2 }] : []),
        ...(hasPerm('accounting.read') ? [{ title: 'Vendor Bills (3-way match)', url: '/panel/accounting/bills', icon: FileText }] : []),
        { title: 'Batches & Expiry', url: '/panel/inventory/batches', icon: PackageSearch },
        ...(canAccess('wms') && hasPerm('inventory.read') ? [{ title: 'Barcodes & Labels', url: '/panel/inventory/labels', icon: FileText }] : []),
      ],
    },
    ...switcherGroup,
  ];

  const inventoryMenu = [
    {
      title: 'Inventory',
      items: [
        { title: 'Dashboard', url: '/panel/inventory', icon: Home },
        { title: 'Stock Levels', url: '/inventory', icon: PackageSearch },
        ...(hasPerm('purchasing.read') && canAccess('purchasing') ? [{ title: 'Purchasing', url: '/panel/inventory/purchasing', icon: Store }] : []),
        ...(hasPerm('purchasing.read') && canAccess('purchasing') ? [{ title: 'Vendor Scorecard', url: '/panel/purchasing/scorecard', icon: LineChart }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Reorder', url: '/panel/inventory/reorder', icon: PackageSearch }] : []),
        { title: 'Batches & Expiry', url: '/panel/inventory/batches', icon: PackageSearch },
        ...(canAccess('wms') && hasPerm('inventory.read') ? [{ title: 'Warehouse Layout', url: '/panel/inventory/wms', icon: Warehouse }] : []),
        ...(canAccess('wms') && hasPerm('inventory.adjust') ? [{ title: 'Pick Lists', url: '/panel/inventory/pick-lists', icon: PackageSearch }] : []),
        ...(canAccess('wms') && hasPerm('inventory.adjust') ? [{ title: 'Cycle Counts', url: '/panel/inventory/counts', icon: Scale }] : []),
        ...(canAccess('wms') && hasPerm('inventory.read') ? [{ title: 'Barcodes & Labels', url: '/panel/inventory/labels', icon: FileText }] : []),
        ...(canAccess('reports') && hasPerm('reports.read') ? [{ title: 'Reports', url: '/panel/inventory/reports', icon: FileSpreadsheet }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Outlets & Transfers', url: '/panel/inventory/outlets', icon: Store }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Stock Transfers', url: '/panel/inventory/transfers', icon: ArrowLeftRight }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Consignment', url: '/panel/inventory/consignment', icon: Handshake }] : []),
        // Distributor tiers + royalty/marketing-fund invoicing (migration 082).
        // Needs the B2B module (a level is a wholesale price) and `products.read`
        // to see the ladder — the page explains itself if either is missing.
        ...(canAccess('b2b') && hasPerm('products.read') ? [{ title: 'Distributor Network', url: '/panel/inventory/network', icon: Network }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Approvals', url: '/panel/inventory/approvals', icon: ShieldCheck }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Units of Measure', url: '/panel/inventory/uom', icon: Boxes }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Kits & Assembly', url: '/panel/inventory/bom', icon: Hammer }] : []),
        ...(hasPerm('inventory.read') ? [{ title: 'Work Orders', url: '/panel/inventory/work-orders', icon: Hammer }] : []),
        ...(canAccess('wms') && hasPerm('inventory.adjust') ? [{ title: 'Scanner', url: '/scan', icon: PackageSearch }] : []),
        { title: 'Warehouses', url: '/warehouses', icon: Warehouse },
        ...(hasPerm('shipments.read') ? [{ title: 'Shipments', url: '/shipments', icon: Truck }] : []),
      ],
    },
    ...switcherGroup,
  ];

  const ordersMenu = [
    {
      title: 'Orders & Fulfilment',
      items: [
        { title: 'Dashboard', url: '/panel/orders', icon: Home },
        { title: 'Orders', url: '/orders', icon: ShoppingCart },
        ...(hasPerm('orders.read') ? [{ title: 'Quotations', url: '/panel/orders/quotations', icon: FileText }] : []),
        ...(hasPerm('orders.read') ? [{ title: 'Credit/Debit Notes & Challans', url: '/panel/orders/documents', icon: FileText }] : []),
        ...(hasPerm('orders.manage') ? [{ title: 'POS (New Sale)', url: '/pos', icon: Store }] : []),
        { title: 'Abandoned Carts', url: '/orders/abandoned-carts', icon: ShoppingCart },
        ...(hasPerm('shipments.read') ? [{ title: 'Shipments', url: '/shipments', icon: Truck }] : []),
        ...(hasPerm('shipments.read') ? [{ title: 'e-Way Bills', url: '/panel/orders/ewb', icon: FileText }] : []),
        ...(hasPerm('returns.read') ? [{ title: 'Returns', url: '/returns', icon: RotateCcw }] : []),
        ...(hasPerm('returns.read') ? [{ title: 'Returns → Stock (RTO)', url: '/panel/orders/rto', icon: RotateCcw }] : []),
        ...(hasPerm('shipments.read') ? [{ title: 'COD Payouts', url: '/panel/orders/cod-recon', icon: Wallet }] : []),
        // Managed refund pipeline (081): request → approve → send the money → confirmed
        ...(hasPerm('orders.read') ? [{ title: 'Refunds', url: '/panel/orders/refunds', icon: Undo2 }] : []),
        // "Did the courier over-bill my parcel's weight?" (migration 078)
        ...(hasPerm('shipments.read') ? [{ title: 'Weight Disputes', url: '/panel/orders/weight-disputes', icon: Scale }] : []),
        // Generic workflow rules engine (spec §13) — "when X happens, do Y".
        ...(hasPerm('orders.read') ? [{ title: 'Automation Rules', url: '/panel/orders/automation-rules', icon: Plug }] : []),
        ...(hasPerm('customers.read') ? [{ title: 'Customers', url: '/customers', icon: Users }] : []),
      ],
    },
    ...switcherGroup,
  ];

  const commerceMenu = [
    {
      title: 'Overview',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: Home },
        ...(canAccess('analytics') && hasPerm('reports.read') ? [{
          title: 'Analytics', url: '/analytics/dashboard', icon: LineChart, items: [
            { title: 'Dashboard',  url: '/analytics/dashboard' },
            { title: 'Store',      url: '/analytics/store' },
            { title: 'Marketing',  url: '/analytics/marketing' },
            { title: 'Users',      url: '/analytics/users' },
            { title: 'Realtime',   url: '/analytics/realtime' },
            { title: 'Custom',     url: '/analytics/custom' },
          ],
        }] : []),
      ],
    },
    {
      title: 'Orders',
      items: [
        ...(canAccess('orders') && hasPerm('orders.read') ? [{ title: 'Orders',     url: '/orders',    icon: ShoppingCart }] : []),
        ...(canAccess('orders') && hasPerm('orders.read') ? [{ title: 'Abandoned Carts', url: '/orders/abandoned-carts', icon: ShoppingCart }] : []),
        ...(canAccess('returns') && hasPerm('returns.read') ? [{ title: 'Returns',   url: '/returns',   icon: RotateCcw }] : []),
        ...(canAccess('shipping') && hasPerm('shipments.read') ? [{ title: 'Shipments', url: '/shipments', icon: Truck }] : []),
      ],
    },
    {
      title: 'Catalog',
      items: [
        ...(canAccess('products') && hasPerm('products.read') ? [{
          title: 'Products', url: '/products', icon: Package2, items: [
            { title: 'All Products',        url: '/products' },
            { title: 'Create Product',      url: '/products/new' },
            { title: 'Import / Export',     url: '/products/import-export' },
            ...(canAccess('bundles') && hasPerm('products.read') ? [{ title: 'Bundles',             url: '/products/bundles' }] : []),
            { title: 'Categories',          url: '/products/categories' },
            { title: 'Brands',              url: '/products/brands' },
            { title: 'Attributes',          url: '/products/attributes' },
            { title: 'Tags',                url: '/products/tags' },
            ...(canAccess('size_charts') && hasPerm('products.read') ? [{ title: 'Size Charts',         url: '/products/size-charts' }] : []),
            { title: 'Specifications',      url: '/products/specifications' },
            { title: 'Variant Link Groups', url: '/products/variant-link-groups' },
          ],
        }] : []),
        ...(canAccess('inventory') && hasPerm('inventory.read') ? [{ title: 'Inventory',  url: '/inventory',  icon: Warehouse }] : []),
        ...(canAccess('inventory') && hasPerm('inventory.read') ? [{ title: 'Warehouses', url: '/warehouses', icon: PackageSearch }] : []),
        ...(canAccess('vendors') && hasPerm('purchasing.read') ? [{ title: 'Vendors', url: '/vendors', icon: Store }] : []),
        ...(canAccess('gallery') && hasPerm('content.read') ? [{ title: 'Gallery',    url: '/gallery',    icon: Images }] : []),
      ],
    },
    {
      title: 'Marketing',
      items: [
        ...(canAccess('marketing') && hasPerm('marketing.read') ? [{ title: 'Marketing',        url: '/marketing',                icon: Megaphone }] : []),
        ...(canAccess('channel_sync') && hasPerm('channels.read') ? [{
          title: 'Multi-Channel Sync', url: '/channels', icon: Plug, items: [
            { title: 'Channels', url: '/channels' },
            { title: 'Excel Import', url: '/channels/import' },
            { title: 'Mapping',  url: '/channels/mapping' },
            { title: 'Allocation',  url: '/channels/allocation' },
          ],
        }] : []),
        ...(canAccess('coupons') && hasPerm('marketing.read') ? [{ title: 'Coupons',          url: '/coupons',                  icon: Ticket }] : []),
      ],
    },
    {
      // ──────────────────────────────────────────────────────────────────────
      // CUSTOMERS — store customers (end-users who buy from the storefront)
      //   These are NOT admin/staff accounts. These are shoppers.
      //   Managed separately from staff. Staff cannot manage other staff here.
      // ──────────────────────────────────────────────────────────────────────
      title: 'Store Customers',
      items: [
        ...(canAccess('customers') && hasPerm('customers.read') ? [{ title: 'All Customers',  url: '/customers',  icon: Users }] : []),
        ...(canAccess('crm') && hasPerm('marketing.read') ? [{ title: 'Leads (CRM)',    url: '/leads',  icon: UserCheck }] : []),
        // Single entry — B2B covers accounts, quotes and price lists together (was duplicated under Catalog before).
        ...(canAccess('b2b')        ? [{ title: 'B2B',            url: '/b2b',    icon: Building2 }] : []),
        ...(hasPerm('customers.read') ? [{ title: 'Credit Control', url: '/panel/customers/credit', icon: ShieldCheck }] : []),
      ],
    },
    {
      title: 'Content',
      items: [
        ...(canAccess('appearance') && hasPerm('content.manage') ? [{
          title: 'Appearance', url: '/appearance/pages', icon: Palette, items: [
            { title: 'Pages',   url: '/appearance/pages' },
            { title: 'Themes',  url: '/appearance/themes' },
            { title: 'Banners', url: '/appearance/banners' },
            { title: 'Menus',   url: '/appearance/menus' },
            { title: 'Style',   url: '/appearance/style' },
            { title: 'Products', url: '/appearance/products' },
            { title: 'Trust Badges', url: '/appearance/trust-badges' },
          ],
        }] : []),
        ...(canAccess('faqs') && hasPerm('content.read') ? [{ title: 'FAQs',        url: '/faqs',    icon: HelpCircle }] : []),
        ...(canAccess('reviews') && hasPerm('content.read') ? [{ title: 'Reviews',     url: '/reviews', icon: Star }] : []),
        ...(canAccess('blog') && hasPerm('content.read') ? [{ title: 'Blog Posts',   url: '/blogs',   icon: BookOpen }] : []),
        { title: 'SEO', url: '/seo', icon: Rss },
      ],
    },
    {
      // ──────────────────────────────────────────────────────────────────────
      // SYSTEM — store settings + staff/access management
      //   "Staff & Access" is ONLY visible to admins (not to staff members).
      //   This is where admins manage who can log in and what they can do.
      //   Completely separate from "Store Customers" above.
      // ──────────────────────────────────────────────────────────────────────
      title: 'System',
      items: [
        ...(canAccess('settings') && hasPerm('settings.read') ? [{
          title: 'Settings', url: '/settings', icon: Settings, items: [
            { title: 'General',            url: '/settings' },
            { title: 'Store Configuration', url: '/settings/store-config' },
            { title: 'API Integrations',   url: '/settings/api-integrations' },
            { title: 'Contact Submissions', url: '/settings/contact' },
            { title: 'Payment & Discount', url: '/settings/payment-discount' },
            { title: 'Payment Gateways',   url: '/settings/payment-gateways' },
            { title: 'SMS / WhatsApp Templates', url: '/settings/sms-templates' },
            { title: 'GST Display',        url: '/settings/gst' },
            ...(canAccess('gst_tax') && hasPerm('settings.manage') ? [{ title: 'Tax Rules',        url: '/settings/tax-rules' }] : []),
            { title: 'Invoice',            url: '/settings/invoice' },
            { title: 'Order Numbering',    url: '/settings/order-numbering' },
            { title: 'Shipping',           url: '/settings/shipping' },
            { title: 'Packages',           url: '/settings/packages' },
            { title: 'Wallet',             url: '/settings/wallet' },
            { title: 'Modules',            url: '/settings/modules' },
            { title: 'Billing',            url: '/settings/billing' },
            ...(canAccess('returns') && hasPerm('settings.manage') ? [{ title: 'Return Policies',  url: '/settings/return-policies' }] : []),
            ...(canAccess('manufacturers') && hasPerm('products.manage') ? [{ title: 'Manufacturers',    url: '/settings/manufacturers' }] : []),
          ],
        }] : []),
        // Staff & Access — admin only (role check, not permission check)
        ...(user?.role === 'admin' ? [{
          title: 'Staff & Access', url: '/settings/staff', icon: ShieldCheck,
        }] : []),
        { title: 'Setup Guide', url: '/setup-guide', icon: HelpCircle },
        ...(canAccess('logs') && hasPerm('audit.read') ? [{ title: 'Logs', url: '/logs', icon: FileText }] : []),
      ],
    },
    ...switcherGroup,
  ];

  const menuGroups = (
    activeWorkspace === 'accounting' ? accountingMenu
    : activeWorkspace === 'inventory' ? inventoryMenu
    : activeWorkspace === 'purchasing' ? purchasingMenu
    : activeWorkspace === 'orders' ? ordersMenu
    : activeWorkspace === 'marketing' ? marketingMenu
    : commerceMenu
  ).filter(group => group.items.length > 0);

  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <SidebarProvider>
      <PageTransitionLoader />
      <AppSidebar userPerms={userPerms} onLogout={handleLogout} menuGroups={menuGroups} />

      <main className="flex flex-1 flex-col min-h-screen bg-gray-50">
        <header className="sticky top-0 z-10 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-14 items-center justify-between gap-2 px-4 md:px-6">
            {/* Left: sidebar trigger + PANEL TABS (the top-level areas) */}
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1 shrink-0 text-gray-500" />
              <nav className="flex items-center gap-1 overflow-x-auto">
                {headerTabs.map((t) => {
                  const active = t.key === activeWorkspace;
                  return (
                    <button
                      key={t.key}
                      onClick={() => selectWorkspace(t.key)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-gray-900 text-white shadow-sm'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      {t.title}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: notifications + store switcher */}
            <div className="flex shrink-0 items-center gap-3">
              <NotificationBell />
              <StoreSwitcher />
            </div>
          </div>
          {/* Breadcrumb row (kept, moved below the tabs) */}
          <div className="hidden border-t border-gray-100 px-4 py-1.5 text-xs capitalize text-gray-400 md:flex md:flex-row md:items-center md:space-x-1.5 md:px-6">
            {pathSegments.map((segment, index) => (
              <React.Fragment key={`${segment}-${index}`}>
                {index > 0 && <span className="opacity-40">/</span>}
                <span className={index === pathSegments.length - 1 ? 'font-medium text-gray-700' : ''}>
                  {segment.replace(/-/g, ' ')}
                </span>
              </React.Fragment>
            ))}
          </div>
        </header>

        <SetupBanner />

        <div className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          {/* Authorization gate — see components/RouteGuard.tsx. Single
              integration point so every Layout child route is covered. */}
          <RouteGuard>
            <Outlet />
          </RouteGuard>
        </div>
        {/* Surfaces API-side access refusals (view-only plan, module off,
            missing permission) that only appear when an action is attempted. */}
        <AccessNotice />
      </main>
    </SidebarProvider>
  );
};

export default Layout;
