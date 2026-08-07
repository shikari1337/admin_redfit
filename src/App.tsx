import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Products from './pages/Products';
import Bundles from './pages/Bundles';
import AbandonedCarts from './pages/AbandonedCarts';
import AbandonedCartDetail from './pages/AbandonedCartDetail';
import Categories from './pages/Categories';
import Brands from './pages/Brands';
import Attributes from './pages/Attributes';
import SizeCharts from './pages/SizeCharts';
import Tags from './pages/Tags';
import TagForm from './pages/TagForm';
import Specifications from './pages/Specifications';
import SpecificationForm from './pages/SpecificationForm';
import Orders from './pages/Orders';
import ProductForm from './pages/ProductForm';
import ProductImportExport from './pages/ProductImportExport';
import BundleForm from './pages/BundleForm';
import OrderDetail from './pages/OrderDetail';
import ManualOrderCreate from './pages/ManualOrderCreate';
import FAQs from './pages/FAQs';
import Reviews from './pages/Reviews';
import ProductQA from './pages/ProductQA';
import Wishlist from './pages/Wishlist';
import Coupons from './pages/Coupons';
import CouponForm from './pages/CouponForm';
import ProductSectionsManager from './pages/ProductSectionsManager';
import ContactSettings from './pages/ContactSettings';
import PaymentDiscountSettings from './pages/PaymentDiscountSettings';
import SmsTemplates from './pages/SmsTemplates';
import ApiIntegrationSettings from './pages/ApiIntegrationSettings';
import PaymentGatewaySettings from './pages/PaymentGatewaySettings';
import GstSettings from './pages/GstSettings';
import OrderNumbering from './pages/OrderNumbering';
import InvoiceSettings from './pages/InvoiceSettings';
import Settings from './pages/Settings';
import ShippingSettings from './pages/ShippingSettings';
import Warehouses from './pages/Warehouses';
import Shipments from './pages/Shipments';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Customers from './pages/Customers';
import Gallery from './pages/Gallery';
import Logs from './pages/Logs';
import Pages from './pages/Pages';
import PageForm from './pages/PageForm';
// Lazy: GrapesJS is ~1 MB gzip and only this route needs it.
const PageBuilder = React.lazy(() => import('./pages/PageBuilder'));
import AppearanceMenus from './pages/AppearanceMenus';
import AppearanceStyle from './pages/AppearanceStyle';
import Themes from './pages/Themes';
import ThemeCustomizer from './pages/ThemeCustomizer';
import AppearanceProducts from './pages/AppearanceProducts';
import TrustBadges from './pages/TrustBadges';
import AppearanceBanners from './pages/AppearanceBanners';
import Leads from './pages/Leads';
import Staff from './pages/Staff';
import Channels from './pages/Channels';
import ChannelAllocation from './pages/panels/ChannelAllocation';
import ChannelMapping from './pages/ChannelMapping';
import ChannelImport from './pages/ChannelImport';
import Layout from './components/Layout';
import { ProtectedModuleRoute } from './components/ProtectedModuleRoute';
import { ProtectedRoute } from './components/ProtectedRoute';

import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard';
import StoreAnalytics from './pages/analytics/StoreAnalytics';
import UserAnalytics from './pages/analytics/UserAnalytics';
import RealtimeAnalytics from './pages/analytics/RealtimeAnalytics';
import CustomAnalytics from './pages/analytics/CustomAnalytics';
import MarketingAnalytics from './pages/analytics/MarketingAnalytics';
import Modules from './pages/Modules';
import PackageBoxes from './pages/PackageBoxes';
import B2B from './pages/B2B';
import Marketing from './pages/Marketing';
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import VariationEditPage from './pages/VariationEditPage';
import Blogs from './pages/Blogs';
import BlogForm from './pages/BlogForm';
import Returns from './pages/Returns';
import TaxRules from './pages/TaxRules';
import ReturnPolicies from './pages/ReturnPolicies';
import Manufacturers from './pages/Manufacturers';
import VariantLinkGroups from './pages/VariantLinkGroups';
import Vendors from './pages/Vendors';
import VendorForm from './pages/VendorForm';
import SetupWizard from './pages/SetupWizard';
import StoreConfiguration from './pages/StoreConfiguration';
import Wallet from './pages/Wallet';
import Seo from './pages/Seo';

// ERP panels (per-role workspaces)
import AccountingDashboard from './pages/panels/AccountingDashboard';
import Expenses from './pages/panels/Expenses';
import RecurringInvoices from './pages/panels/RecurringInvoices';
import FixedAssets from './pages/panels/FixedAssets';
import TrialBalance from './pages/panels/TrialBalance';
import Journals from './pages/panels/Journals';
import ChartOfAccounts from './pages/panels/ChartOfAccounts';
import OpeningBalances from './pages/panels/OpeningBalances';
import Gstr1 from './pages/panels/Gstr1';
import RateCheck from './pages/panels/RateCheck';
import VendorBills from './pages/panels/VendorBills';
import Payables from './pages/panels/Payables';
import Receivables from './pages/panels/Receivables';
import PaymentsReceived from './pages/panels/PaymentsReceived';
import Dunning from './pages/panels/Dunning';
import CreditControl from './pages/panels/CreditControl';
import Tds from './pages/panels/Tds';
import TcsRegister from './pages/panels/TcsRegister';
import ScheduledJobs from './pages/panels/ScheduledJobs';
import ReportSchedules from './pages/panels/ReportSchedules';
import Reconciliation from './pages/panels/Reconciliation';
import BankRecon from './pages/panels/BankRecon';
import BankRules from './pages/panels/BankRules';
import BankAccounts from './pages/panels/BankAccounts';
import Einvoicing from './pages/panels/Einvoicing';
import AuditTrail from './pages/panels/AuditTrail';
import AccountingSettings from './pages/panels/AccountingSettings';
import InventoryPanelDashboard from './pages/panels/InventoryPanelDashboard';
import Purchasing from './pages/panels/Purchasing';
import VendorScorecard from './pages/panels/VendorScorecard';
import OrdersPanelDashboard from './pages/panels/OrdersPanelDashboard';
import Ewb from './pages/panels/Ewb';
import Quotations from './pages/panels/Quotations';
import SalesDocuments from './pages/panels/SalesDocuments';
import Itc2b from './pages/panels/Itc2b';
import Batches from './pages/panels/Batches';
import WarehouseLayout from './pages/panels/WarehouseLayout';
import PickLists from './pages/panels/PickLists';
import CycleCounts from './pages/panels/CycleCounts';
import LabelsBarcodes from './pages/panels/LabelsBarcodes';
import Reports from './pages/panels/Reports';
import Reorder from './pages/panels/Reorder';
import Gstr3b from './pages/panels/Gstr3b';
import Gstr9 from './pages/panels/Gstr9';
import DocumentLibrary from './pages/panels/DocumentLibrary';
import HsnSummary from './pages/panels/HsnSummary';
import SeriesGaps from './pages/panels/SeriesGaps';
import GstRateCodes from './pages/panels/GstRateCodes';
import FxRates from './pages/panels/FxRates';
import FinancialStatements from './pages/panels/FinancialStatements';
import GeneralLedger from './pages/panels/GeneralLedger';
import Outlets from './pages/panels/Outlets';
import StockTransfers from './pages/panels/StockTransfers';
import Consignment from './pages/panels/Consignment';
import DistributorNetwork from './pages/panels/DistributorNetwork';
import UomSettings from './pages/panels/UomSettings';
import BillOfMaterials from './pages/panels/BillOfMaterials';
import WorkOrders from './pages/panels/WorkOrders';
import Approvals from './pages/panels/Approvals';
import ReturnsRto from './pages/panels/ReturnsRto';
import CodReconciliation from './pages/panels/CodReconciliation';
import WeightDisputes from './pages/panels/WeightDisputes';
import Refunds from './pages/panels/Refunds';
import WorkflowRules from './pages/panels/WorkflowRules';
import DocumentTemplates from './pages/panels/DocumentTemplates';
import CustomFields from './pages/panels/CustomFields';
import MarketplaceSettlements from './pages/panels/MarketplaceSettlements';
import ScannerShell from './pages/scanner/ScannerShell';
import ScanLookup from './pages/scanner/ScanLookup';
import ScanPutaway from './pages/scanner/ScanPutaway';
import ScanPick from './pages/scanner/ScanPick';
import ScanMove from './pages/scanner/ScanMove';
import ScanCount from './pages/scanner/ScanCount';
import PosSurface from './pages/pos/PosSurface';
import VendorPortal from './pages/vendor/VendorPortal';
import CustomerPortal from './pages/customer/CustomerPortal';
import PartnerPortal from './pages/partner/PartnerPortal';
import SetupGuide from './pages/SetupGuide';
// Marketing panel (docs/MARKETING_PANEL.md)
import MarketingDashboard from './pages/panels/marketing/MarketingDashboard';
import MarketingCampaigns from './pages/panels/marketing/MarketingCampaigns';
import MarketingTemplates from './pages/panels/marketing/MarketingTemplates';
import MarketingAudiences from './pages/panels/marketing/MarketingAudiences';
import MarketingAutomation from './pages/panels/marketing/MarketingAutomation';
import AdsManager from './pages/panels/marketing/AdsManager';
import AdsAudiences from './pages/panels/marketing/AdsAudiences';
import Connections from './pages/panels/marketing/Connections';
import ConnectorCallback from './pages/panels/marketing/ConnectorCallback';
import ConnectorInsights from './pages/panels/marketing/ConnectorInsights';
import AdsAiStudio from './pages/panels/marketing/AdsAiStudio';
import MarketingAnalyticsHub from './pages/panels/marketing/MarketingAnalyticsHub';
import MarketingCompliance from './pages/panels/marketing/MarketingCompliance';
import MarketingSettings from './pages/panels/marketing/MarketingSettings';
import AdsOAuthCallback from './pages/panels/marketing/AdsOAuthCallback';
import MarketingPerformance from './pages/panels/marketing/MarketingPerformance';
import GrowthAnalytics from './pages/panels/marketing/GrowthAnalytics';
import { useAuth } from './contexts/AuthContext';
import { WORKSPACES, WorkspaceKey, ROLE_SURFACE, ErpRole } from './lib/rbac';
import { PRODUCT, IS_SUITE } from './lib/product';
import RouteGuard from './components/RouteGuard';

/** Lands every user on THEIR surface: worker → scanner, cashier → POS,
 *  accountant → Accounting panel, warehouse manager → Inventory… */
function RoleHome() {
  const { workspaces, user } = useAuth();
  const surface = ROLE_SURFACE[user?.role as ErpRole];
  if (surface) return <Navigate to={surface} replace />;
  // Single-product build (VITE_PRODUCT) lands on that product's home.
  if (!IS_SUITE) return <Navigate to={PRODUCT.home} replace />;
  const first = (workspaces[0] ?? 'commerce') as WorkspaceKey;
  return <Navigate to={WORKSPACES[first]?.home ?? '/dashboard'} replace />;
}

function App() {
  console.log('📱 Admin Panel: App component rendering...');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Setup wizard — full-screen, no sidebar, still protected */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <SetupWizard />
            </ProtectedRoute>
          }
        />
        {/* Theme customizer — full-screen Shopify-style live editor */}
        <Route
          path="/themes/:id/customize"
          element={
            <ProtectedRoute>
              <ThemeCustomizer />
            </ProtectedRoute>
          }
        />
        {/* Page visual builder — full-screen Elementor-style editor (GrapesJS) */}
        <Route
          path="/pages/:id/builder"
          element={
            <ProtectedRoute>
              <RouteGuard>
                <React.Suspense fallback={<div className="h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" /></div>}>
                  <PageBuilder />
                </React.Suspense>
              </RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Warehouse scanner — full-screen mobile workspace (WMS slice 4b) */}
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <RouteGuard><ScannerShell /></RouteGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<ScanLookup />} />
          <Route path="putaway" element={<ScanPutaway />} />
          <Route path="pick" element={<ScanPick />} />
          <Route path="move" element={<ScanMove />} />
          <Route path="count" element={<ScanCount />} />
        </Route>
        {/* POS — full-screen counter-sales surface */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <RouteGuard><PosSurface /></RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Vendor portal — PUBLIC, no login: the URL token is the access (spec §12) */}
        <Route path="/vendor/:token" element={<VendorPortal />} />
        {/* Customer portal (B2B statements) — PUBLIC, no login: the URL token is the access (spec §12) */}
        <Route path="/customer/:token" element={<CustomerPortal />} />
        {/* Franchise/partner portal — PUBLIC, no login: shelf + self-reported sales + money (spec §5/§12) */}
        <Route path="/partner/:token" element={<PartnerPortal />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<RoleHome />} />
          <Route path="dashboard" element={<Dashboard />} />
          {/* ERP panels — separate workspaces per organisational role */}
          <Route path="panel/accounting" element={<AccountingDashboard />} />
          <Route path="panel/accounting/trial-balance" element={<TrialBalance />} />
          <Route path="panel/accounting/chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="panel/accounting/opening-balances" element={<OpeningBalances />} />
          <Route path="panel/accounting/journals" element={<Journals />} />
          <Route path="panel/accounting/statements" element={<FinancialStatements />} />
          <Route path="panel/accounting/general-ledger" element={<GeneralLedger />} />
          <Route path="panel/accounting/gstr1" element={<Gstr1 />} />
          <Route path="panel/accounting/gstr3b" element={<Gstr3b />} />
          <Route path="panel/accounting/gstr9" element={<Gstr9 />} />
          <Route path="panel/accounting/hsn-summary" element={<HsnSummary />} />
          <Route path="panel/accounting/series-gaps" element={<SeriesGaps />} />
          <Route path="panel/accounting/rate-check" element={<RateCheck />} />
          <Route path="panel/accounting/rate-codes" element={<GstRateCodes />} />
          <Route path="panel/accounting/fx" element={<FxRates />} />
          <Route path="panel/accounting/bills" element={<VendorBills />} />
          <Route path="panel/accounting/payables" element={<Payables />} />
          <Route path="panel/accounting/receivables" element={<Receivables />} />
          <Route path="panel/accounting/payments-received" element={<PaymentsReceived />} />
          <Route path="panel/accounting/recurring-invoices" element={<RecurringInvoices />} />
          <Route path="panel/accounting/dunning" element={<Dunning />} />
          <Route path="panel/customers/credit" element={<CreditControl />} />
          <Route path="panel/accounting/reconciliation" element={<Reconciliation />} />
          <Route path="panel/accounting/expenses" element={<Expenses />} />
          <Route path="panel/accounting/assets" element={<FixedAssets />} />
          <Route path="panel/accounting/tds" element={<Tds />} />
          <Route path="panel/accounting/tcs" element={<TcsRegister />} />
          <Route path="panel/accounting/scheduled-jobs" element={<ScheduledJobs />} />
          <Route path="panel/accounting/report-schedules" element={<ReportSchedules />} />
          <Route path="panel/accounting/bank-accounts" element={<BankAccounts />} />
          <Route path="panel/accounting/bank-recon" element={<BankRecon />} />
          <Route path="panel/accounting/bank-rules" element={<BankRules />} />
          <Route path="panel/accounting/einvoicing" element={<ProtectedModuleRoute module="einvoicing"><Einvoicing /></ProtectedModuleRoute>} />
          <Route path="panel/accounting/audit" element={<AuditTrail />} />
          <Route path="panel/accounting/settings" element={<AccountingSettings />} />
          <Route path="panel/accounting/documents" element={<DocumentLibrary />} />
          <Route path="panel/accounting/itc" element={<Itc2b />} />
          <Route path="panel/inventory" element={<InventoryPanelDashboard />} />
          <Route path="panel/inventory/purchasing" element={<Purchasing />} />
          <Route path="panel/inventory/batches" element={<Batches />} />
          <Route path="panel/inventory/wms" element={<WarehouseLayout />} />
          <Route path="panel/inventory/pick-lists" element={<PickLists />} />
          <Route path="panel/inventory/counts" element={<CycleCounts />} />
          <Route path="panel/inventory/labels" element={<LabelsBarcodes />} />
          <Route path="panel/inventory/reports" element={<Reports />} />
          <Route path="panel/inventory/reorder" element={<Reorder />} />
          <Route path="panel/inventory/outlets" element={<Outlets />} />
          <Route path="panel/inventory/transfers" element={<StockTransfers />} />
          <Route path="panel/inventory/consignment" element={<Consignment />} />
          <Route path="panel/inventory/network" element={<DistributorNetwork />} />
          <Route path="panel/inventory/uom" element={<UomSettings />} />
          <Route path="panel/inventory/bom" element={<BillOfMaterials />} />
          <Route path="panel/inventory/work-orders" element={<WorkOrders />} />
          <Route path="panel/inventory/approvals" element={<Approvals />} />
          <Route path="panel/purchasing" element={<Purchasing />} />
          <Route path="panel/purchasing/scorecard" element={<VendorScorecard />} />
          <Route path="panel/orders" element={<OrdersPanelDashboard />} />
          <Route path="panel/orders/ewb" element={<Ewb />} />
          <Route path="panel/orders/quotations" element={<Quotations />} />
          <Route path="panel/orders/documents" element={<SalesDocuments />} />
          <Route path="panel/orders/rto" element={<ReturnsRto />} />
          <Route path="panel/orders/cod-recon" element={<CodReconciliation />} />
          <Route path="panel/orders/weight-disputes" element={<WeightDisputes />} />
          {/* managed refund pipeline (081): request → approve → send → confirmed */}
          <Route path="panel/orders/refunds" element={<Refunds />} />
          <Route path="panel/orders/automation-rules" element={<WorkflowRules />} />
          <Route path="panel/settings/templates" element={<DocumentTemplates />} />
          <Route path="panel/settings/custom-fields" element={<CustomFields />} />
          <Route path="panel/accounting/settlements" element={<MarketplaceSettlements />} />
          <Route path="setup-guide" element={<SetupGuide />} />
          {/* Marketing panel — module-gated (marketing); ads pages also need ads_management */}
          <Route path="panel/marketing" element={<ProtectedModuleRoute module="marketing"><MarketingDashboard /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/performance" element={<ProtectedModuleRoute module="marketing"><MarketingPerformance /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/growth" element={<ProtectedModuleRoute module="marketing"><GrowthAnalytics /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/campaigns" element={<ProtectedModuleRoute module="marketing"><MarketingCampaigns /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/templates" element={<ProtectedModuleRoute module="marketing"><MarketingTemplates /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/audiences" element={<ProtectedModuleRoute module="marketing"><MarketingAudiences /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/automation" element={<ProtectedModuleRoute module="marketing"><MarketingAutomation /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/ads" element={<ProtectedModuleRoute module="ads_management"><AdsManager /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/ads/audiences" element={<ProtectedModuleRoute module="ads_management"><AdsAudiences /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/ads/oauth/callback" element={<ProtectedModuleRoute module="ads_management"><AdsOAuthCallback /></ProtectedModuleRoute>} />
          {/* Connector platform (migration 114) — one identity per provider, many services. */}
          <Route path="panel/marketing/connections" element={<ProtectedModuleRoute module="connectors"><Connections /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/connections/callback" element={<ProtectedModuleRoute module="connectors"><ConnectorCallback /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/connections/insights" element={<ProtectedModuleRoute module="connectors"><ConnectorInsights /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/ads/ai-studio" element={<ProtectedModuleRoute module="ads_management"><AdsAiStudio /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/analytics" element={<ProtectedModuleRoute module="marketing"><MarketingAnalyticsHub /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/compliance" element={<ProtectedModuleRoute module="marketing"><MarketingCompliance /></ProtectedModuleRoute>} />
          <Route path="panel/marketing/settings" element={<ProtectedModuleRoute module="marketing"><MarketingSettings /></ProtectedModuleRoute>} />
          <Route path="analytics" element={<Navigate to="/analytics/dashboard" replace />} />
          <Route path="analytics/dashboard" element={<AnalyticsDashboard />} />
          <Route path="analytics/store" element={<StoreAnalytics />} />
          <Route path="analytics/users" element={<UserAnalytics />} />
          <Route path="analytics/realtime" element={<RealtimeAnalytics />} />
          <Route path="analytics/custom" element={<CustomAnalytics />} />
          <Route path="analytics/marketing" element={<MarketingAnalytics />} />
          <Route path="products" element={<Products />} />
          <Route path="products/import-export" element={<ProductImportExport />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id/edit" element={<ProductForm />} />
          <Route path="products/:id/sections" element={<ProductSectionsManager />} />
          <Route path="products/:productSlug/variations/:variationKey/edit" element={<VariationEditPage />} />
          <Route path="products/bundles" element={<ProtectedModuleRoute module="bundles"><Bundles /></ProtectedModuleRoute>} />
          <Route path="products/bundles/new" element={<ProtectedModuleRoute module="bundles"><BundleForm /></ProtectedModuleRoute>} />
          <Route path="products/bundles/:id/edit" element={<ProtectedModuleRoute module="bundles"><BundleForm /></ProtectedModuleRoute>} />
          <Route path="products/categories" element={<Categories />} />
          <Route path="products/brands" element={<Brands />} />
          <Route path="products/attributes" element={<Attributes />} />
          <Route path="products/tags" element={<Tags />} />
          <Route path="products/size-charts" element={<ProtectedModuleRoute module="size_charts"><SizeCharts /></ProtectedModuleRoute>} />
          <Route path="products/specifications" element={<Specifications />} />
          <Route path="products/specifications/new" element={<SpecificationForm />} />
          <Route path="products/specifications/:id/edit" element={<SpecificationForm />} />
          <Route path="products/tags/:id/edit" element={<TagForm />} />
          <Route path="products/tags/new" element={<TagForm />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/new" element={<ManualOrderCreate />} />
          <Route path="orders/abandoned-carts" element={<AbandonedCarts />} />
          <Route path="orders/abandoned-carts/:id" element={<AbandonedCartDetail />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="shipments" element={<ProtectedModuleRoute module="shipping"><Shipments /></ProtectedModuleRoute>} />
          <Route path="customers" element={<Customers />} />
          <Route path="users" element={<Users />} />
          {/* UserDetail is a CUSTOMER profile (orders, addresses, lifetime
              value) — it reads /customers/:id. Served at both paths so old
              links keep working; /customers/:id is the one the UI links to. */}
          <Route path="customers/:id" element={<UserDetail />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="faqs" element={<FAQs />} />
          <Route path="reviews" element={<ProtectedModuleRoute module="reviews"><Reviews /></ProtectedModuleRoute>} />
          <Route path="questions" element={<ProtectedModuleRoute module="product_qa"><ProductQA /></ProtectedModuleRoute>} />
          <Route path="wishlists" element={<ProtectedModuleRoute module="wishlist"><Wishlist /></ProtectedModuleRoute>} />
          <Route path="coupons" element={<ProtectedModuleRoute module="coupons"><Coupons /></ProtectedModuleRoute>} />
          <Route path="coupons/new" element={<ProtectedModuleRoute module="coupons"><CouponForm /></ProtectedModuleRoute>} />
          <Route path="coupons/:id/edit" element={<ProtectedModuleRoute module="coupons"><CouponForm /></ProtectedModuleRoute>} />
          <Route path="appearance" element={<Navigate to="/appearance/pages" replace />} />
          <Route path="appearance/menus" element={<AppearanceMenus />} />
          <Route path="appearance/banners" element={<AppearanceBanners />} />
          <Route path="appearance/pages" element={<Pages />} />
          <Route path="appearance/style" element={<AppearanceStyle />} />
          <Route path="appearance/themes" element={<Themes />} />
          <Route path="appearance/products" element={<AppearanceProducts />} />
          <Route path="appearance/trust-badges" element={<TrustBadges />} />
          <Route path="pages" element={<Navigate to="/appearance/pages" replace />} />
          <Route path="pages/new" element={<PageForm />} />
          <Route path="pages/:id/edit" element={<PageForm />} />
          <Route
            path="leads"
            element={
              <ProtectedModuleRoute module="crm">
                <Leads />
              </ProtectedModuleRoute>
            }
          />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/store-config" element={<StoreConfiguration />} />
          <Route path="settings/staff" element={<Staff />} />
          <Route path="settings/general" element={<Navigate to="/appearance/style" replace />} />
          <Route path="settings/api-integrations" element={<ApiIntegrationSettings />} />
          <Route path="settings/contact" element={<ContactSettings />} />
          <Route path="settings/payment-discount" element={<PaymentDiscountSettings />} />
          <Route path="settings/payment-gateways" element={<PaymentGatewaySettings />} />
          <Route path="settings/sms-templates" element={<SmsTemplates />} />
          <Route path="settings/gst" element={<GstSettings />} />
          <Route path="settings/order-numbering" element={<OrderNumbering />} />
          <Route path="settings/invoice" element={<InvoiceSettings />} />
          <Route path="settings/shipping" element={<ShippingSettings />} />
          <Route path="settings/modules" element={<Modules />} />
          <Route path="settings/packages" element={<PackageBoxes />} />
          <Route path="settings/wallet" element={<Wallet />} />
          <Route path="seo" element={<Seo />} />
          <Route path="settings/billing" element={<Billing />} />
          <Route path="warehouses" element={<ProtectedModuleRoute module="inventory"><Warehouses /></ProtectedModuleRoute>} />
          <Route path="inventory" element={<ProtectedModuleRoute module="inventory"><Inventory /></ProtectedModuleRoute>} />
          <Route path="b2b" element={<ProtectedModuleRoute module="b2b"><B2B /></ProtectedModuleRoute>} />
          <Route path="channels" element={<ProtectedModuleRoute module="channel_sync"><Channels /></ProtectedModuleRoute>} />
          <Route path="channels/allocation" element={<ProtectedModuleRoute module="channel_sync"><ChannelAllocation /></ProtectedModuleRoute>} />
          <Route path="channels/mapping" element={<ProtectedModuleRoute module="channel_sync"><ChannelMapping /></ProtectedModuleRoute>} />
          <Route path="channels/import" element={<ProtectedModuleRoute module="channel_sync"><ChannelImport /></ProtectedModuleRoute>} />
          <Route path="marketing" element={<ProtectedModuleRoute module="marketing"><Marketing /></ProtectedModuleRoute>} />
          <Route path="blogs" element={<ProtectedModuleRoute module="blog"><Blogs /></ProtectedModuleRoute>} />
          <Route path="blogs/new" element={<ProtectedModuleRoute module="blog"><BlogForm /></ProtectedModuleRoute>} />
          <Route path="blogs/:id/edit" element={<ProtectedModuleRoute module="blog"><BlogForm /></ProtectedModuleRoute>} />
          <Route path="returns" element={<ProtectedModuleRoute module="returns"><Returns /></ProtectedModuleRoute>} />
          <Route path="settings/tax-rules" element={<ProtectedModuleRoute module="gst_tax"><TaxRules /></ProtectedModuleRoute>} />
          <Route path="settings/return-policies" element={<ProtectedModuleRoute module="returns"><ReturnPolicies /></ProtectedModuleRoute>} />
          <Route path="settings/manufacturers" element={<ProtectedModuleRoute module="manufacturers"><Manufacturers /></ProtectedModuleRoute>} />
          <Route path="products/variant-link-groups" element={<VariantLinkGroups />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="vendors/new" element={<VendorForm />} />
          <Route path="vendors/:id/edit" element={<VendorForm />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

