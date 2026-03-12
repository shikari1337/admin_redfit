import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';
import PageTransitionLoader from './PageTransitionLoader';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import {
  Home, ShoppingCart, Truck, Warehouse, Users, Factory,
  Megaphone, Ticket, Star, HelpCircle, Palette, FileText, Settings,
  UserCheck, Edit, Images, Package2, LineChart
} from 'lucide-react';

const Layout: React.FC = () => {
  const [userPerms, setUserPerms] = useState<{ role?: string; permissions?: string[]; name?: string; email?: string }>({});
  const [storeModules, setStoreModules] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.me();
        const data = user?.data ?? user;
        setUserPerms({ role: data?.role, permissions: data?.permissions || [], name: data?.name, email: data?.email });
        
        // Also fetch global store module enabled states
        try {
          const { modulesAPI } = await import('../services/api');
          const mods = await modulesAPI.list();
          const modsList = Array.isArray(mods) ? mods : mods?.modules ?? mods?.data ?? [];
          const modMap: Record<string, boolean> = {};
          for (const m of modsList) {
            modMap[m.key] = m.enabled !== false; // default true if missing
          }
          setStoreModules(modMap);
        } catch (e) {
          console.warn('Could not fetch store modules:', e);
        }
      } catch {
        setUserPerms({});
      }
    };
    loadUser();
  }, []);

  const canAccess = (module: string) => {
    // 1. Is the module globally enabled for this store? (B2B, CRM, etc)
    if (storeModules && module in storeModules && !storeModules[module]) {
      return false; // globally disabled for store
    }
    // 2. Does the staff user have permission?
    if (userPerms.role === 'admin') return true;
    return userPerms.permissions?.includes(module) ?? false;
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.warn('Logout request failed, clearing local token anyway:', error);
    } finally {
      localStorage.removeItem('admin_token');
      navigate('/login', { replace: true });
    }
  };

  const menuGroups = [
    {
      title: "Overview",
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: Home },
        { title: 'Analytics', url: '/analytics', icon: LineChart, items: [
          { title: 'Dashboard', url: '/analytics/dashboard' },
          { title: 'Store', url: '/analytics/store' },
          { title: 'Users', url: '/analytics/users' },
          { title: 'Realtime', url: '/analytics/realtime' },
          { title: 'Custom', url: '/analytics/custom' },
        ]},
      ]
    },
    {
      title: "Sales & CRM",
      items: [
        { title: 'Orders', url: '/orders', icon: ShoppingCart, items: [
          { title: 'All Orders', url: '/orders' },
          { title: 'Abandoned Carts', url: '/orders/abandoned-carts' },
        ]},
        ...(canAccess('leads_manager') ? [{ title: 'Leads (CRM)', url: '/leads', icon: UserCheck }] : []),
        { title: 'Users', url: '/users', icon: Users },
        ...(canAccess('b2b') ? [{ title: 'B2B', url: '/b2b', icon: Factory }] : []),
      ]
    },
    {
      title: "Catalog & Operations",
      items: [
        { title: 'Products', url: '/products', icon: Package2, items: [
          { title: 'All Products', url: '/products' },
          { title: 'Create Product', url: '/products/new' },
          { title: 'Bundles', url: '/products/bundles' },
          { title: 'Categories', url: '/products/categories' },
          { title: 'Attributes', url: '/products/attributes' },
          { title: 'Tags', url: '/products/tags' },
          { title: 'Size Charts', url: '/products/size-charts' },
          { title: 'Specifications', url: '/products/specifications' },
        ]},
        { title: 'Shipments', url: '/shipments', icon: Truck },
        { title: 'Inventory', url: '/inventory', icon: Warehouse },
      ]
    },
    {
      title: "Content & Marketing",
      items: [
        ...(canAccess('page_editor') ? [{ title: 'Content Editor', url: '/content', icon: Edit }] : []),
        { title: 'Gallery', url: '/gallery', icon: Images },
        { title: 'Appearance', url: '/appearance', icon: Palette, items: [
          { title: 'Menus', url: '/appearance/menus' },
          { title: 'Pages', url: '/appearance/pages' },
          { title: 'Style', url: '/appearance/style' },
        ]},
        { title: 'Marketing', url: '/marketing', icon: Megaphone },
        ...(canAccess('coupons') ? [{ title: 'Coupons', url: '/coupons', icon: Ticket }] : []),
        ...(canAccess('reviews') ? [{ title: 'Reviews', url: '/reviews', icon: Star }] : []),
        { title: 'FAQs', url: '/faqs', icon: HelpCircle },
      ]
    },
    {
      title: "System",
      items: [
        { title: 'Settings', url: '/settings', icon: Settings, items: [
          { title: 'General', url: '/settings' },
          { title: 'Staff', url: '/settings/staff' },
          { title: 'Modules', url: '/settings/modules' },
          { title: 'Package Boxes', url: '/settings/packages' },
          { title: 'Billing', url: '/settings/billing' },
          { title: 'API Integrations', url: '/settings/api-integrations' },
          { title: 'Contact', url: '/settings/contact' },
          { title: 'Payment Discount', url: '/settings/payment-discount' },
          { title: 'Payment Gateways', url: '/settings/payment-gateways' },
          { title: 'SMS Templates', url: '/settings/sms-templates' },
          { title: 'GST Settings', url: '/settings/gst' },
          { title: 'Shipping', url: '/settings/shipping' },
        ]},
        { title: 'Logs', url: '/logs', icon: FileText },
      ]
    }
  ];

  // Map flat path segments to breadcrumbs (naive implementation)
  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <SidebarProvider>
      <PageTransitionLoader />
      <AppSidebar userPerms={userPerms} onLogout={handleLogout} menuGroups={menuGroups} />
      <main className="flex flex-1 flex-col min-h-screen bg-gray-50/50">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 shadow-sm md:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <div className="hidden md:flex flex-row items-center space-x-2 text-sm text-muted-foreground capitalize">
              {pathSegments.map((segment, index) => (
                <React.Fragment key={segment}>
                  {index > 0 && <span>/</span>}
                  <span className={index === pathSegments.length - 1 ? 'font-medium text-foreground' : ''}>
                    {segment.replace(/-/g, ' ')}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium hidden sm:inline-block">Admin Panel</span>
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
