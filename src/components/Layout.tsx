import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import PageTransitionLoader from './PageTransitionLoader';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import StoreSwitcher from './StoreSwitcher';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, ShoppingCart, Truck, Warehouse, Users, Factory,
  Megaphone, Ticket, Star, HelpCircle, Palette, FileText, Settings,
  UserCheck, Images, Package2, LineChart, Building2, ShieldCheck,
  BookOpen, RotateCcw, Receipt, RefreshCw, Building,
} from 'lucide-react';

const Layout: React.FC = () => {
  const { user, canAccess, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: Home },
        ...(canAccess('analytics') ? [{
          title: 'Analytics', url: '/analytics/dashboard', icon: LineChart, items: [
            { title: 'Dashboard',  url: '/analytics/dashboard' },
            { title: 'Store',      url: '/analytics/store' },
            { title: 'Users',      url: '/analytics/users' },
            { title: 'Realtime',   url: '/analytics/realtime' },
            { title: 'Custom',     url: '/analytics/custom' },
          ],
        }] : []),
      ],
    },
    {
      title: 'Catalog',
      items: [
        ...(canAccess('products') ? [{
          title: 'Products', url: '/products', icon: Package2, items: [
            { title: 'All Products',        url: '/products' },
            { title: 'Create Product',      url: '/products/new' },
            { title: 'Bundles',             url: '/products/bundles' },
            { title: 'Categories',          url: '/products/categories' },
            { title: 'Brands',              url: '/products/brands' },
            { title: 'Attributes',          url: '/products/attributes' },
            { title: 'Tags',                url: '/products/tags' },
            { title: 'Size Charts',         url: '/products/size-charts' },
            { title: 'Specifications',      url: '/products/specifications' },
            { title: 'Variant Link Groups', url: '/products/variant-link-groups' },
          ],
        }] : []),
        ...(canAccess('inventory')  ? [{ title: 'Inventory',  url: '/inventory',  icon: Warehouse }] : []),
        ...(canAccess('b2b')        ? [{ title: 'B2B',        url: '/b2b',        icon: Factory }] : []),
        ...(canAccess('gallery')    ? [{ title: 'Gallery',    url: '/gallery',    icon: Images }] : []),
      ],
    },
    {
      title: 'Orders',
      items: [
        ...(canAccess('orders')     ? [{ title: 'Orders',     url: '/orders',     icon: ShoppingCart }] : []),
        ...(canAccess('orders')     ? [{ title: 'Returns',    url: '/returns',    icon: RotateCcw }] : []),
        ...(canAccess('shipments')  ? [{ title: 'Shipments',  url: '/shipments',  icon: Truck }] : []),
        ...(canAccess('warehouses') ? [{ title: 'Warehouses', url: '/warehouses', icon: Warehouse }] : []),
      ],
    },
    {
      title: 'Marketing',
      items: [
        ...(canAccess('marketing')     ? [{ title: 'Marketing',        url: '/marketing',                icon: Megaphone }] : []),
        ...(canAccess('coupons')       ? [{ title: 'Coupons',          url: '/coupons',                  icon: Ticket }] : []),
        ...(canAccess('abandoned_cart')? [{ title: 'Abandoned Carts',  url: '/orders/abandoned-carts',   icon: ShoppingCart }] : []),
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
        ...(canAccess('users')          ? [{ title: 'All Customers',  url: '/users',  icon: Users }] : []),
        ...(canAccess('leads_manager')  ? [{ title: 'Leads (CRM)',    url: '/leads',  icon: UserCheck }] : []),
        ...(canAccess('b2b')            ? [{ title: 'B2B Customers',  url: '/b2b',    icon: Building2 }] : []),
      ],
    },
    {
      title: 'Content',
      items: [
        ...(canAccess('appearance') ? [{
          title: 'Appearance', url: '/appearance/pages', icon: Palette, items: [
            { title: 'Pages',   url: '/appearance/pages' },
            { title: 'Banners', url: '/appearance/banners' },
            { title: 'Menus',   url: '/appearance/menus' },
            { title: 'Style',   url: '/appearance/style' },
          ],
        }] : []),
        ...(canAccess('faqs')    ? [{ title: 'FAQs',        url: '/faqs',    icon: HelpCircle }] : []),
        ...(canAccess('reviews') ? [{ title: 'Reviews',     url: '/reviews', icon: Star }] : []),
        { title: 'Blog Posts',   url: '/blogs',   icon: BookOpen },
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
        ...(canAccess('settings') ? [{
          title: 'Settings', url: '/settings', icon: Settings, items: [
            { title: 'General',          url: '/settings' },
            { title: 'API Integrations', url: '/settings/api-integrations' },
            { title: 'Contact',          url: '/settings/contact' },
            { title: 'Payment & Discount', url: '/settings/payment-discount' },
            { title: 'Payment Gateways', url: '/settings/payment-gateways' },
            { title: 'SMS Templates',    url: '/settings/sms-templates' },
            { title: 'GST',              url: '/settings/gst' },
            { title: 'Shipping',         url: '/settings/shipping' },
            { title: 'Modules',          url: '/settings/modules' },
            { title: 'Billing',          url: '/settings/billing' },
            { title: 'Tax Rules',        url: '/settings/tax-rules' },
            { title: 'Return Policies',  url: '/settings/return-policies' },
            { title: 'Manufacturers',    url: '/settings/manufacturers' },
          ],
        }] : []),
        // Staff & Access — admin only (role check, not permission check)
        ...(user?.role === 'admin' ? [{
          title: 'Staff & Access', url: '/settings/staff', icon: ShieldCheck,
        }] : []),
        ...(canAccess('logs') ? [{ title: 'Logs', url: '/logs', icon: FileText }] : []),
      ],
    },
  ].filter(group => group.items.length > 0);

  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <SidebarProvider>
      <PageTransitionLoader />
      <AppSidebar userPerms={userPerms} onLogout={handleLogout} menuGroups={menuGroups} />

      <main className="flex flex-1 flex-col min-h-screen bg-gray-50/50">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 shadow-sm md:px-6">
          {/* Left: sidebar trigger + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="-ml-1 shrink-0" />
            <div className="hidden md:flex flex-row items-center space-x-1.5 text-sm text-muted-foreground capitalize truncate">
              {pathSegments.map((segment, index) => (
                <React.Fragment key={segment}>
                  {index > 0 && <span className="opacity-40">/</span>}
                  <span className={index === pathSegments.length - 1 ? 'font-medium text-foreground' : ''}>
                    {segment.replace(/-/g, ' ')}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right: store switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <StoreSwitcher />
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};

export default Layout;
