import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));

const Products = React.lazy(() => import('./pages/Products'));
const Bundles = React.lazy(() => import('./pages/Bundles'));
const AbandonedCarts = React.lazy(() => import('./pages/AbandonedCarts'));
const AbandonedCartDetail = React.lazy(() => import('./pages/AbandonedCartDetail'));
const Categories = React.lazy(() => import('./pages/Categories'));
const Brands = React.lazy(() => import('./pages/Brands'));
const Companies = React.lazy(() => import('./pages/Companies'));
const Attributes = React.lazy(() => import('./pages/Attributes'));
const SizeCharts = React.lazy(() => import('./pages/SizeCharts'));
const Tags = React.lazy(() => import('./pages/Tags'));
const TagForm = React.lazy(() => import('./pages/TagForm'));
const Specifications = React.lazy(() => import('./pages/Specifications'));
const SpecificationForm = React.lazy(() => import('./pages/SpecificationForm'));
const Orders = React.lazy(() => import('./pages/Orders'));
const ProductForm = React.lazy(() => import('./pages/ProductForm'));
const ProductImportExport = React.lazy(() => import('./pages/ProductImportExport'));
const BundleForm = React.lazy(() => import('./pages/BundleForm'));
const OrderDetail = React.lazy(() => import('./pages/OrderDetail'));
const ManualOrderCreate = React.lazy(() => import('./pages/ManualOrderCreate'));
const FAQs = React.lazy(() => import('./pages/FAQs'));
const Reviews = React.lazy(() => import('./pages/Reviews'));
const ProductQA = React.lazy(() => import('./pages/ProductQA'));
const Wishlist = React.lazy(() => import('./pages/Wishlist'));
const Coupons = React.lazy(() => import('./pages/Coupons'));
const CouponForm = React.lazy(() => import('./pages/CouponForm'));
const ProductSectionsManager = React.lazy(() => import('./pages/ProductSectionsManager'));
const ContactSettings = React.lazy(() => import('./pages/ContactSettings'));
const PaymentDiscountSettings = React.lazy(() => import('./pages/PaymentDiscountSettings'));
const SmsTemplates = React.lazy(() => import('./pages/SmsTemplates'));
const CartRecoveryAutomation = React.lazy(() => import('./pages/CartRecoveryAutomation'));
const ApiIntegrationSettings = React.lazy(() => import('./pages/ApiIntegrationSettings'));
const PaymentGatewaySettings = React.lazy(() => import('./pages/PaymentGatewaySettings'));
const GstSettings = React.lazy(() => import('./pages/GstSettings'));
const OrderNumbering = React.lazy(() => import('./pages/OrderNumbering'));
const InvoiceSettings = React.lazy(() => import('./pages/InvoiceSettings'));
const Settings = React.lazy(() => import('./pages/Settings'));
const SettingsCenter = React.lazy(() => import('./pages/SettingsCenter'));
const ShippingSettings = React.lazy(() => import('./pages/ShippingSettings'));
const Markets = React.lazy(() => import('./pages/Markets'));
const Warehouses = React.lazy(() => import('./pages/Warehouses'));
const Shipments = React.lazy(() => import('./pages/Shipments'));
const Users = React.lazy(() => import('./pages/Users'));
const UserDetail = React.lazy(() => import('./pages/UserDetail'));
const Customers = React.lazy(() => import('./pages/Customers'));
const CustomerDuplicates = React.lazy(() => import('./pages/CustomerDuplicates'));
const Gallery = React.lazy(() => import('./pages/Gallery'));
const Logs = React.lazy(() => import('./pages/Logs'));
const Pages = React.lazy(() => import('./pages/Pages'));
const PageForm = React.lazy(() => import('./pages/PageForm'));
// Lazy: GrapesJS is ~1 MB gzip and only this route needs it.
const PageBuilder = React.lazy(() => import('./pages/PageBuilder'));
const AppearanceMenus = React.lazy(() => import('./pages/AppearanceMenus'));
const AppearanceStyle = React.lazy(() => import('./pages/AppearanceStyle'));
const Themes = React.lazy(() => import('./pages/Themes'));
const ThemeCustomizer = React.lazy(() => import('./pages/ThemeCustomizer'));
const AppearanceProducts = React.lazy(() => import('./pages/AppearanceProducts'));
const TrustBadges = React.lazy(() => import('./pages/TrustBadges'));
const AppearanceBanners = React.lazy(() => import('./pages/AppearanceBanners'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Staff = React.lazy(() => import('./pages/Staff'));
const Channels = React.lazy(() => import('./pages/Channels'));
const ChannelAllocation = React.lazy(() => import('./pages/panels/ChannelAllocation'));
const ChannelMapping = React.lazy(() => import('./pages/ChannelMapping'));
const ChannelImport = React.lazy(() => import('./pages/ChannelImport'));
const ChannelDaily = React.lazy(() => import('./pages/ChannelDaily'));
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

const AnalyticsDashboard = React.lazy(() => import('./pages/analytics/AnalyticsDashboard'));
const StoreAnalytics = React.lazy(() => import('./pages/analytics/StoreAnalytics'));
const UserAnalytics = React.lazy(() => import('./pages/analytics/UserAnalytics'));
const RealtimeAnalytics = React.lazy(() => import('./pages/analytics/RealtimeAnalytics'));
const CustomAnalytics = React.lazy(() => import('./pages/analytics/CustomAnalytics'));
const MarketingAnalytics = React.lazy(() => import('./pages/analytics/MarketingAnalytics'));
const Modules = React.lazy(() => import('./pages/Modules'));
const PackageBoxes = React.lazy(() => import('./pages/PackageBoxes'));
const B2B = React.lazy(() => import('./pages/B2B'));
const Marketing = React.lazy(() => import('./pages/Marketing'));
const Billing = React.lazy(() => import('./pages/Billing'));
const Inventory = React.lazy(() => import('./pages/Inventory'));
const VariationEditPage = React.lazy(() => import('./pages/VariationEditPage'));
const Blogs = React.lazy(() => import('./pages/Blogs'));
const BlogForm = React.lazy(() => import('./pages/BlogForm'));
const Returns = React.lazy(() => import('./pages/Returns'));
const TaxRules = React.lazy(() => import('./pages/TaxRules'));
const ReturnPolicies = React.lazy(() => import('./pages/ReturnPolicies'));
const Manufacturers = React.lazy(() => import('./pages/Manufacturers'));
const VariantLinkGroups = React.lazy(() => import('./pages/VariantLinkGroups'));
const Vendors = React.lazy(() => import('./pages/Vendors'));
const VendorForm = React.lazy(() => import('./pages/VendorForm'));
const SetupWizard = React.lazy(() => import('./pages/SetupWizard'));
const StoreConfiguration = React.lazy(() => import('./pages/StoreConfiguration'));
const Wallet = React.lazy(() => import('./pages/Wallet'));
const Seo = React.lazy(() => import('./pages/Seo'));

// ERP panels (per-role workspaces)
const AccountingDashboard = React.lazy(() => import('./pages/panels/AccountingDashboard'));
const Expenses = React.lazy(() => import('./pages/panels/Expenses'));
const RecurringInvoices = React.lazy(() => import('./pages/panels/RecurringInvoices'));
const FixedAssets = React.lazy(() => import('./pages/panels/FixedAssets'));
const TrialBalance = React.lazy(() => import('./pages/panels/TrialBalance'));
const Journals = React.lazy(() => import('./pages/panels/Journals'));
const ChartOfAccounts = React.lazy(() => import('./pages/panels/ChartOfAccounts'));
const OpeningBalances = React.lazy(() => import('./pages/panels/OpeningBalances'));
const Gstr1 = React.lazy(() => import('./pages/panels/Gstr1'));
const RateCheck = React.lazy(() => import('./pages/panels/RateCheck'));
const VendorBills = React.lazy(() => import('./pages/panels/VendorBills'));
const Payables = React.lazy(() => import('./pages/panels/Payables'));
const Receivables = React.lazy(() => import('./pages/panels/Receivables'));
const ProformaInvoices = React.lazy(() => import('./pages/panels/ProformaInvoices'));
const PaymentsReceived = React.lazy(() => import('./pages/panels/PaymentsReceived'));
const Dunning = React.lazy(() => import('./pages/panels/Dunning'));
const CreditControl = React.lazy(() => import('./pages/panels/CreditControl'));
const Tds = React.lazy(() => import('./pages/panels/Tds'));
const TcsRegister = React.lazy(() => import('./pages/panels/TcsRegister'));
const ScheduledJobs = React.lazy(() => import('./pages/panels/ScheduledJobs'));
const ReportSchedules = React.lazy(() => import('./pages/panels/ReportSchedules'));
const Reconciliation = React.lazy(() => import('./pages/panels/Reconciliation'));
const BankRecon = React.lazy(() => import('./pages/panels/BankRecon'));
const BankRules = React.lazy(() => import('./pages/panels/BankRules'));
const BankAccounts = React.lazy(() => import('./pages/panels/BankAccounts'));
const Einvoicing = React.lazy(() => import('./pages/panels/Einvoicing'));
const AuditTrail = React.lazy(() => import('./pages/panels/AuditTrail'));
const AccountingSettings = React.lazy(() => import('./pages/panels/AccountingSettings'));
const InventoryPanelDashboard = React.lazy(() => import('./pages/panels/InventoryPanelDashboard'));
const Purchasing = React.lazy(() => import('./pages/panels/Purchasing'));
const VendorScorecard = React.lazy(() => import('./pages/panels/VendorScorecard'));
const OrdersPanelDashboard = React.lazy(() => import('./pages/panels/OrdersPanelDashboard'));
const SalesTeam = React.lazy(() => import('./pages/panels/SalesTeam'));
const Ewb = React.lazy(() => import('./pages/panels/Ewb'));
const Quotations = React.lazy(() => import('./pages/panels/Quotations'));
const SalesDocuments = React.lazy(() => import('./pages/panels/SalesDocuments'));
const Itc2b = React.lazy(() => import('./pages/panels/Itc2b'));
const Batches = React.lazy(() => import('./pages/panels/Batches'));
const WarehouseLayout = React.lazy(() => import('./pages/panels/WarehouseLayout'));
const PickLists = React.lazy(() => import('./pages/panels/PickLists'));
const CycleCounts = React.lazy(() => import('./pages/panels/CycleCounts'));
const LabelsBarcodes = React.lazy(() => import('./pages/panels/LabelsBarcodes'));
const Reports = React.lazy(() => import('./pages/panels/Reports'));
const Reorder = React.lazy(() => import('./pages/panels/Reorder'));
const Gstr3b = React.lazy(() => import('./pages/panels/Gstr3b'));
const Gstr9 = React.lazy(() => import('./pages/panels/Gstr9'));
const DocumentLibrary = React.lazy(() => import('./pages/panels/DocumentLibrary'));
const HsnSummary = React.lazy(() => import('./pages/panels/HsnSummary'));
const SeriesGaps = React.lazy(() => import('./pages/panels/SeriesGaps'));
const GstRateCodes = React.lazy(() => import('./pages/panels/GstRateCodes'));
const FxRates = React.lazy(() => import('./pages/panels/FxRates'));
const FinancialStatements = React.lazy(() => import('./pages/panels/FinancialStatements'));
const GeneralLedger = React.lazy(() => import('./pages/panels/GeneralLedger'));
const Outlets = React.lazy(() => import('./pages/panels/Outlets'));
const StockTransfers = React.lazy(() => import('./pages/panels/StockTransfers'));
const Consignment = React.lazy(() => import('./pages/panels/Consignment'));
const DistributorNetwork = React.lazy(() => import('./pages/panels/DistributorNetwork'));
const UomSettings = React.lazy(() => import('./pages/panels/UomSettings'));
const GoodsInLabels = React.lazy(() => import('./pages/panels/GoodsInLabels'));
const BillOfMaterials = React.lazy(() => import('./pages/panels/BillOfMaterials'));
const WorkOrders = React.lazy(() => import('./pages/panels/WorkOrders'));
const Approvals = React.lazy(() => import('./pages/panels/Approvals'));
const ReturnsRto = React.lazy(() => import('./pages/panels/ReturnsRto'));
const CodReconciliation = React.lazy(() => import('./pages/panels/CodReconciliation'));
const WeightDisputes = React.lazy(() => import('./pages/panels/WeightDisputes'));
const Refunds = React.lazy(() => import('./pages/panels/Refunds'));
const WorkflowRules = React.lazy(() => import('./pages/panels/WorkflowRules'));
const DocumentTemplates = React.lazy(() => import('./pages/panels/DocumentTemplates'));
const CustomFields = React.lazy(() => import('./pages/panels/CustomFields'));
const MarketplaceSettlements = React.lazy(() => import('./pages/panels/MarketplaceSettlements'));
const ScannerShell = React.lazy(() => import('./pages/scanner/ScannerShell'));
const ScanLookup = React.lazy(() => import('./pages/scanner/ScanLookup'));
const ScanPutaway = React.lazy(() => import('./pages/scanner/ScanPutaway'));
const ScanPick = React.lazy(() => import('./pages/scanner/ScanPick'));
const ScanMove = React.lazy(() => import('./pages/scanner/ScanMove'));
const ScanCount = React.lazy(() => import('./pages/scanner/ScanCount'));
const PosSurface = React.lazy(() => import('./pages/pos/PosSurface'));
const VendorPortal = React.lazy(() => import('./pages/vendor/VendorPortal'));
const CustomerPortal = React.lazy(() => import('./pages/customer/CustomerPortal'));
const PartnerPortal = React.lazy(() => import('./pages/partner/PartnerPortal'));
const SetupGuide = React.lazy(() => import('./pages/SetupGuide'));
// Marketing panel (docs/MARKETING_PANEL.md)
const MarketingDashboard = React.lazy(() => import('./pages/panels/marketing/MarketingDashboard'));
const MarketingCampaigns = React.lazy(() => import('./pages/panels/marketing/MarketingCampaigns'));
const MarketingTemplates = React.lazy(() => import('./pages/panels/marketing/MarketingTemplates'));
const MarketingAudiences = React.lazy(() => import('./pages/panels/marketing/MarketingAudiences'));
const MarketingAutomation = React.lazy(() => import('./pages/panels/marketing/MarketingAutomation'));
const AdsManager = React.lazy(() => import('./pages/panels/marketing/AdsManager'));
const AdsAudiences = React.lazy(() => import('./pages/panels/marketing/AdsAudiences'));
const Connections = React.lazy(() => import('./pages/panels/marketing/Connections'));
const ConnectorCallback = React.lazy(() => import('./pages/panels/marketing/ConnectorCallback'));
const ConnectorInsights = React.lazy(() => import('./pages/panels/marketing/ConnectorInsights'));
const GoogleReviews = React.lazy(() => import('./pages/panels/marketing/GoogleReviews'));
const AdsAiStudio = React.lazy(() => import('./pages/panels/marketing/AdsAiStudio'));
const MarketingAnalyticsHub = React.lazy(() => import('./pages/panels/marketing/MarketingAnalyticsHub'));
const MarketingCompliance = React.lazy(() => import('./pages/panels/marketing/MarketingCompliance'));
const MarketingSettings = React.lazy(() => import('./pages/panels/marketing/MarketingSettings'));
const AdsOAuthCallback = React.lazy(() => import('./pages/panels/marketing/AdsOAuthCallback'));
const MarketingPerformance = React.lazy(() => import('./pages/panels/marketing/MarketingPerformance'));
const GrowthAnalytics = React.lazy(() => import('./pages/panels/marketing/GrowthAnalytics'));
import { useAuth } from './contexts/AuthContext';
import { ROLE_SURFACE, ErpRole } from './lib/rbac';
import { PRODUCT, IS_SUITE } from './lib/product';
import RouteGuard from './components/RouteGuard';

/** A full-screen route's own loading frame (it has no Layout to provide one). */
const FullScreenFallback = (
  <div className="flex h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);
const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={FullScreenFallback}>{children}</React.Suspense>
);

/**
 * Where `/` lands.
 *
 * Device-first roles keep their own surface: scanning and selling at a counter
 * are the whole job, and a dashboard detour is a tap they cannot afford.
 * EVERYONE ELSE now lands on `/dashboard`, which is role-aware in itself
 * (`components/home/RoleHome.tsx`) — it used to bounce through a "workspace"
 * table to one of six panel dashboards, which is how an accountant ended up on
 * a page of charts instead of the invoices waiting for them.
 */
function RoleHome() {
  const { user } = useAuth();
  const surface = ROLE_SURFACE[user?.role as ErpRole];
  if (surface) return <Navigate to={surface} replace />;
  // Single-product build (VITE_PRODUCT) lands on that product's home.
  if (!IS_SUITE) return <Navigate to={PRODUCT.home} replace />;
  return <Navigate to="/dashboard" replace />;
}

function App() {
  console.log('📱 Admin Panel: App component rendering...');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<FullScreen><Login /></FullScreen>} />
        {/* Setup wizard — full-screen, no sidebar, still protected */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <RouteGuard><FullScreen><SetupWizard /></FullScreen></RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Theme customizer — full-screen Shopify-style live editor */}
        <Route
          path="/themes/:id/customize"
          element={
            <ProtectedRoute>
              <RouteGuard><FullScreen><ThemeCustomizer /></FullScreen></RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Page visual builder — full-screen Elementor-style editor (GrapesJS) */}
        <Route
          path="/pages/:id/builder"
          element={
            <ProtectedRoute>
              <RouteGuard><FullScreen><PageBuilder /></FullScreen></RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Warehouse scanner — full-screen mobile workspace (WMS slice 4b) */}
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <RouteGuard><FullScreen><ScannerShell /></FullScreen></RouteGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<FullScreen><ScanLookup /></FullScreen>} />
          <Route path="putaway" element={<FullScreen><ScanPutaway /></FullScreen>} />
          <Route path="pick" element={<FullScreen><ScanPick /></FullScreen>} />
          <Route path="move" element={<FullScreen><ScanMove /></FullScreen>} />
          <Route path="count" element={<FullScreen><ScanCount /></FullScreen>} />
        </Route>
        {/* POS — full-screen counter-sales surface */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <RouteGuard><FullScreen><PosSurface /></FullScreen></RouteGuard>
            </ProtectedRoute>
          }
        />
        {/* Vendor portal — PUBLIC, no login: the URL token is the access (spec §12) */}
        <Route path="/vendor/:token" element={<FullScreen><VendorPortal /></FullScreen>} />
        {/* Customer portal (B2B statements) — PUBLIC, no login: the URL token is the access (spec §12) */}
        <Route path="/customer/:token" element={<FullScreen><CustomerPortal /></FullScreen>} />
        {/* Franchise/partner portal — PUBLIC, no login: shelf + self-reported sales + money (spec §5/§12) */}
        <Route path="/partner/:token" element={<FullScreen><PartnerPortal /></FullScreen>} />
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
          <Route path="panel/accounting/proforma" element={<ProformaInvoices />} />
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
          <Route path="panel/accounting/einvoicing" element={<Einvoicing />} />
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
          <Route path="panel/inventory/goods-in" element={<GoodsInLabels />} />
          <Route path="panel/inventory/bom" element={<BillOfMaterials />} />
          <Route path="panel/inventory/work-orders" element={<WorkOrders />} />
          <Route path="panel/inventory/approvals" element={<Approvals />} />
          <Route path="panel/purchasing" element={<Purchasing />} />
          <Route path="panel/purchasing/scorecard" element={<VendorScorecard />} />
          <Route path="panel/orders" element={<OrdersPanelDashboard />} />
          {/* Sales attribution + staff activity (mig 151) — reports.read */}
          <Route path="panel/orders/sales-team" element={<SalesTeam />} />
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
          <Route path="panel/marketing" element={<MarketingDashboard />} />
          <Route path="panel/marketing/performance" element={<MarketingPerformance />} />
          <Route path="panel/marketing/growth" element={<GrowthAnalytics />} />
          <Route path="panel/marketing/campaigns" element={<MarketingCampaigns />} />
          {/* One dedicated panel per channel (sms | whatsapp | email | push) —
              same component, which reads :channel and locks itself to it. */}
          <Route path="panel/marketing/campaigns/:channel" element={<MarketingCampaigns />} />
          <Route path="panel/marketing/templates" element={<MarketingTemplates />} />
          <Route path="panel/marketing/audiences" element={<MarketingAudiences />} />
          <Route path="panel/marketing/automation" element={<MarketingAutomation />} />
          <Route path="panel/marketing/ads" element={<AdsManager />} />
          <Route path="panel/marketing/ads/audiences" element={<AdsAudiences />} />
          <Route path="panel/marketing/ads/oauth/callback" element={<AdsOAuthCallback />} />
          {/* Connector platform (migration 114) — one identity per provider, many services. */}
          <Route path="panel/marketing/connections" element={<Connections />} />
          <Route path="panel/marketing/connections/callback" element={<ConnectorCallback />} />
          <Route path="panel/marketing/connections/insights" element={<ConnectorInsights />} />
          {/* Google Business Profile reviews — gated on the `connectors` module
              because the sync lives on the connector identity; the PUBLIC
              storefront read is gated on `reviews` instead (routes/reviews.ts). */}
          <Route path="panel/marketing/google-reviews" element={<GoogleReviews />} />
          <Route path="panel/marketing/ads/ai-studio" element={<AdsAiStudio />} />
          <Route path="panel/marketing/analytics" element={<MarketingAnalyticsHub />} />
          <Route path="panel/marketing/compliance" element={<MarketingCompliance />} />
          <Route path="panel/marketing/settings" element={<MarketingSettings />} />
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
          <Route path="products/bundles" element={<Bundles />} />
          <Route path="products/bundles/new" element={<BundleForm />} />
          <Route path="products/bundles/:id/edit" element={<BundleForm />} />
          <Route path="products/categories" element={<Categories />} />
          <Route path="products/brands" element={<Brands />} />
          <Route path="products/companies" element={<Companies />} />
          <Route path="products/attributes" element={<Attributes />} />
          <Route path="products/tags" element={<Tags />} />
          <Route path="products/size-charts" element={<SizeCharts />} />
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
          <Route path="shipments" element={<Shipments />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/duplicates" element={<CustomerDuplicates />} />
          <Route path="users" element={<Users />} />
          {/* UserDetail is a CUSTOMER profile (orders, addresses, lifetime
              value) — it reads /customers/:id. Served at both paths so old
              links keep working; /customers/:id is the one the UI links to. */}
          <Route path="customers/:id" element={<UserDetail />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="faqs" element={<FAQs />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="questions" element={<ProductQA />} />
          <Route path="wishlists" element={<Wishlist />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="coupons/new" element={<CouponForm />} />
          <Route path="coupons/:id/edit" element={<CouponForm />} />
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
              
                <Leads />
              
            }
          />
          <Route path="settings" element={<SettingsCenter />} />
          <Route path="settings/directory" element={<Settings />} />
          <Route path="settings/store-config" element={<StoreConfiguration />} />
          <Route path="settings/staff" element={<Staff />} />
          <Route path="settings/general" element={<Navigate to="/appearance/style" replace />} />
          <Route path="settings/api-integrations" element={<ApiIntegrationSettings />} />
          <Route path="settings/contact" element={<ContactSettings />} />
          <Route path="settings/payment-discount" element={<PaymentDiscountSettings />} />
          <Route path="settings/payment-gateways" element={<PaymentGatewaySettings />} />
          <Route path="settings/sms-templates" element={<SmsTemplates />} />
          <Route path="settings/cart-recovery-automation" element={<CartRecoveryAutomation />} />
          <Route path="settings/gst" element={<GstSettings />} />
          <Route path="settings/markets" element={<Markets />} />
          <Route path="settings/order-numbering" element={<OrderNumbering />} />
          <Route path="settings/invoice" element={<InvoiceSettings />} />
          <Route path="settings/shipping" element={<ShippingSettings />} />
          <Route path="settings/modules" element={<Modules />} />
          <Route path="settings/packages" element={<PackageBoxes />} />
          <Route path="settings/wallet" element={<Wallet />} />
          <Route path="seo" element={<Seo />} />
          <Route path="settings/billing" element={<Billing />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="b2b" element={<B2B />} />
          <Route path="channels" element={<Channels />} />
          <Route path="channels/allocation" element={<ChannelAllocation />} />
          <Route path="channels/mapping" element={<ChannelMapping />} />
          <Route path="channels/import" element={<ChannelImport />} />
          <Route path="channels/daily" element={<ChannelDaily />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="blogs" element={<Blogs />} />
          <Route path="blogs/new" element={<BlogForm />} />
          <Route path="blogs/:id/edit" element={<BlogForm />} />
          <Route path="returns" element={<Returns />} />
          <Route path="settings/tax-rules" element={<TaxRules />} />
          <Route path="settings/return-policies" element={<ReturnPolicies />} />
          <Route path="settings/manufacturers" element={<Manufacturers />} />
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

