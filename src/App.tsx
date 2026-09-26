import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyRetry } from './lib/lazyRetry';
const Login = lazyRetry(() => import('./pages/Login'));
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));

const Products = lazyRetry(() => import('./pages/Products'));
const Bundles = lazyRetry(() => import('./pages/Bundles'));
const AbandonedCarts = lazyRetry(() => import('./pages/AbandonedCarts'));
const AbandonedCartDetail = lazyRetry(() => import('./pages/AbandonedCartDetail'));
const Categories = lazyRetry(() => import('./pages/Categories'));
const Brands = lazyRetry(() => import('./pages/Brands'));
const Companies = lazyRetry(() => import('./pages/Companies'));
const Attributes = lazyRetry(() => import('./pages/Attributes'));
const SizeCharts = lazyRetry(() => import('./pages/SizeCharts'));
const Tags = lazyRetry(() => import('./pages/Tags'));
const TagForm = lazyRetry(() => import('./pages/TagForm'));
const Specifications = lazyRetry(() => import('./pages/Specifications'));
const SpecificationForm = lazyRetry(() => import('./pages/SpecificationForm'));
const Orders = lazyRetry(() => import('./pages/Orders'));
const ProductForm = lazyRetry(() => import('./pages/ProductForm'));
const ProductImportExport = lazyRetry(() => import('./pages/ProductImportExport'));
const BundleForm = lazyRetry(() => import('./pages/BundleForm'));
const OrderDetail = lazyRetry(() => import('./pages/OrderDetail'));
const ManualOrderCreate = lazyRetry(() => import('./pages/ManualOrderCreate'));
const FAQs = lazyRetry(() => import('./pages/FAQs'));
const Reviews = lazyRetry(() => import('./pages/Reviews'));
const ProductQA = lazyRetry(() => import('./pages/ProductQA'));
const Wishlist = lazyRetry(() => import('./pages/Wishlist'));
const Coupons = lazyRetry(() => import('./pages/Coupons'));
const CouponForm = lazyRetry(() => import('./pages/CouponForm'));
const ProductSectionsManager = lazyRetry(() => import('./pages/ProductSectionsManager'));
const ContactSettings = lazyRetry(() => import('./pages/ContactSettings'));
const PaymentDiscountSettings = lazyRetry(() => import('./pages/PaymentDiscountSettings'));
const SmsTemplates = lazyRetry(() => import('./pages/SmsTemplates'));
const CartRecoveryAutomation = lazyRetry(() => import('./pages/CartRecoveryAutomation'));
const ApiIntegrationSettings = lazyRetry(() => import('./pages/ApiIntegrationSettings'));
const PaymentGatewaySettings = lazyRetry(() => import('./pages/PaymentGatewaySettings'));
const GstSettings = lazyRetry(() => import('./pages/GstSettings'));
const OrderNumbering = lazyRetry(() => import('./pages/OrderNumbering'));
const InvoiceSettings = lazyRetry(() => import('./pages/InvoiceSettings'));
const Settings = lazyRetry(() => import('./pages/Settings'));
const SettingsCenter = lazyRetry(() => import('./pages/SettingsCenter'));
const ShippingSettings = lazyRetry(() => import('./pages/ShippingSettings'));
const Markets = lazyRetry(() => import('./pages/Markets'));
const Warehouses = lazyRetry(() => import('./pages/Warehouses'));
const Shipments = lazyRetry(() => import('./pages/Shipments'));
const Users = lazyRetry(() => import('./pages/Users'));
const UserDetail = lazyRetry(() => import('./pages/UserDetail'));
const Customers = lazyRetry(() => import('./pages/Customers'));
const CustomerDuplicates = lazyRetry(() => import('./pages/CustomerDuplicates'));
const Gallery = lazyRetry(() => import('./pages/Gallery'));
const Logs = lazyRetry(() => import('./pages/Logs'));
const Pages = lazyRetry(() => import('./pages/Pages'));
const PageForm = lazyRetry(() => import('./pages/PageForm'));
// Lazy: GrapesJS is ~1 MB gzip and only this route needs it.
const PageBuilder = lazyRetry(() => import('./pages/PageBuilder'));
const AppearanceMenus = lazyRetry(() => import('./pages/AppearanceMenus'));
const AppearanceStyle = lazyRetry(() => import('./pages/AppearanceStyle'));
const Themes = lazyRetry(() => import('./pages/Themes'));
const ThemeCustomizer = lazyRetry(() => import('./pages/ThemeCustomizer'));
const AppearanceProducts = lazyRetry(() => import('./pages/AppearanceProducts'));
const TrustBadges = lazyRetry(() => import('./pages/TrustBadges'));
const AppearanceBanners = lazyRetry(() => import('./pages/AppearanceBanners'));
const Leads = lazyRetry(() => import('./pages/Leads'));
const Staff = lazyRetry(() => import('./pages/Staff'));
const Channels = lazyRetry(() => import('./pages/Channels'));
const ChannelAllocation = lazyRetry(() => import('./pages/panels/ChannelAllocation'));
const ChannelMapping = lazyRetry(() => import('./pages/ChannelMapping'));
const ChannelImport = lazyRetry(() => import('./pages/ChannelImport'));
const ChannelDaily = lazyRetry(() => import('./pages/ChannelDaily'));
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

const AnalyticsDashboard = lazyRetry(() => import('./pages/analytics/AnalyticsDashboard'));
const StoreAnalytics = lazyRetry(() => import('./pages/analytics/StoreAnalytics'));
const UserAnalytics = lazyRetry(() => import('./pages/analytics/UserAnalytics'));
const RealtimeAnalytics = lazyRetry(() => import('./pages/analytics/RealtimeAnalytics'));
const CustomAnalytics = lazyRetry(() => import('./pages/analytics/CustomAnalytics'));
const MarketingAnalytics = lazyRetry(() => import('./pages/analytics/MarketingAnalytics'));
const Modules = lazyRetry(() => import('./pages/Modules'));
const PackageBoxes = lazyRetry(() => import('./pages/PackageBoxes'));
const B2B = lazyRetry(() => import('./pages/B2B'));
const Marketing = lazyRetry(() => import('./pages/Marketing'));
const Billing = lazyRetry(() => import('./pages/Billing'));
const Inventory = lazyRetry(() => import('./pages/Inventory'));
const VariationEditPage = lazyRetry(() => import('./pages/VariationEditPage'));
const Blogs = lazyRetry(() => import('./pages/Blogs'));
const BlogForm = lazyRetry(() => import('./pages/BlogForm'));
const Returns = lazyRetry(() => import('./pages/Returns'));
const TaxRules = lazyRetry(() => import('./pages/TaxRules'));
const ReturnPolicies = lazyRetry(() => import('./pages/ReturnPolicies'));
const Manufacturers = lazyRetry(() => import('./pages/Manufacturers'));
const VariantLinkGroups = lazyRetry(() => import('./pages/VariantLinkGroups'));
const Vendors = lazyRetry(() => import('./pages/Vendors'));
const VendorForm = lazyRetry(() => import('./pages/VendorForm'));
const SetupWizard = lazyRetry(() => import('./pages/SetupWizard'));
const StoreConfiguration = lazyRetry(() => import('./pages/StoreConfiguration'));
const Wallet = lazyRetry(() => import('./pages/Wallet'));
const Seo = lazyRetry(() => import('./pages/Seo'));

// ERP panels (per-role workspaces)
const AccountingDashboard = lazyRetry(() => import('./pages/panels/AccountingDashboard'));
const Expenses = lazyRetry(() => import('./pages/panels/Expenses'));
const RecurringInvoices = lazyRetry(() => import('./pages/panels/RecurringInvoices'));
const FixedAssets = lazyRetry(() => import('./pages/panels/FixedAssets'));
const TrialBalance = lazyRetry(() => import('./pages/panels/TrialBalance'));
const Journals = lazyRetry(() => import('./pages/panels/Journals'));
const ChartOfAccounts = lazyRetry(() => import('./pages/panels/ChartOfAccounts'));
const OpeningBalances = lazyRetry(() => import('./pages/panels/OpeningBalances'));
const Gstr1 = lazyRetry(() => import('./pages/panels/Gstr1'));
const RateCheck = lazyRetry(() => import('./pages/panels/RateCheck'));
const VendorBills = lazyRetry(() => import('./pages/panels/VendorBills'));
const Payables = lazyRetry(() => import('./pages/panels/Payables'));
const Receivables = lazyRetry(() => import('./pages/panels/Receivables'));
const ProformaInvoices = lazyRetry(() => import('./pages/panels/ProformaInvoices'));
const PaymentsReceived = lazyRetry(() => import('./pages/panels/PaymentsReceived'));
const Dunning = lazyRetry(() => import('./pages/panels/Dunning'));
const CreditControl = lazyRetry(() => import('./pages/panels/CreditControl'));
const Tds = lazyRetry(() => import('./pages/panels/Tds'));
const TcsRegister = lazyRetry(() => import('./pages/panels/TcsRegister'));
const ScheduledJobs = lazyRetry(() => import('./pages/panels/ScheduledJobs'));
const ReportSchedules = lazyRetry(() => import('./pages/panels/ReportSchedules'));
const Reconciliation = lazyRetry(() => import('./pages/panels/Reconciliation'));
const BankRecon = lazyRetry(() => import('./pages/panels/BankRecon'));
const BankRules = lazyRetry(() => import('./pages/panels/BankRules'));
const BankAccounts = lazyRetry(() => import('./pages/panels/BankAccounts'));
const Einvoicing = lazyRetry(() => import('./pages/panels/Einvoicing'));
const AuditTrail = lazyRetry(() => import('./pages/panels/AuditTrail'));
const AccountingSettings = lazyRetry(() => import('./pages/panels/AccountingSettings'));
const InventoryPanelDashboard = lazyRetry(() => import('./pages/panels/InventoryPanelDashboard'));
const Purchasing = lazyRetry(() => import('./pages/panels/Purchasing'));
const VendorScorecard = lazyRetry(() => import('./pages/panels/VendorScorecard'));
const OrdersPanelDashboard = lazyRetry(() => import('./pages/panels/OrdersPanelDashboard'));
const SalesTeam = lazyRetry(() => import('./pages/panels/SalesTeam'));
const Ewb = lazyRetry(() => import('./pages/panels/Ewb'));
const Quotations = lazyRetry(() => import('./pages/panels/Quotations'));
const SalesDocuments = lazyRetry(() => import('./pages/panels/SalesDocuments'));
const Itc2b = lazyRetry(() => import('./pages/panels/Itc2b'));
const Batches = lazyRetry(() => import('./pages/panels/Batches'));
const WarehouseLayout = lazyRetry(() => import('./pages/panels/WarehouseLayout'));
const PickLists = lazyRetry(() => import('./pages/panels/PickLists'));
const CycleCounts = lazyRetry(() => import('./pages/panels/CycleCounts'));
const LabelsBarcodes = lazyRetry(() => import('./pages/panels/LabelsBarcodes'));
const Reports = lazyRetry(() => import('./pages/panels/Reports'));
const Reorder = lazyRetry(() => import('./pages/panels/Reorder'));
const Gstr3b = lazyRetry(() => import('./pages/panels/Gstr3b'));
const Gstr9 = lazyRetry(() => import('./pages/panels/Gstr9'));
const DocumentLibrary = lazyRetry(() => import('./pages/panels/DocumentLibrary'));
const HsnSummary = lazyRetry(() => import('./pages/panels/HsnSummary'));
const SeriesGaps = lazyRetry(() => import('./pages/panels/SeriesGaps'));
const GstRateCodes = lazyRetry(() => import('./pages/panels/GstRateCodes'));
const FxRates = lazyRetry(() => import('./pages/panels/FxRates'));
const FinancialStatements = lazyRetry(() => import('./pages/panels/FinancialStatements'));
const GeneralLedger = lazyRetry(() => import('./pages/panels/GeneralLedger'));
const Outlets = lazyRetry(() => import('./pages/panels/Outlets'));
const StockTransfers = lazyRetry(() => import('./pages/panels/StockTransfers'));
const Consignment = lazyRetry(() => import('./pages/panels/Consignment'));
const DistributorNetwork = lazyRetry(() => import('./pages/panels/DistributorNetwork'));
const UomSettings = lazyRetry(() => import('./pages/panels/UomSettings'));
const GoodsInLabels = lazyRetry(() => import('./pages/panels/GoodsInLabels'));
const BillOfMaterials = lazyRetry(() => import('./pages/panels/BillOfMaterials'));
const WorkOrders = lazyRetry(() => import('./pages/panels/WorkOrders'));
const Approvals = lazyRetry(() => import('./pages/panels/Approvals'));
const ReturnsRto = lazyRetry(() => import('./pages/panels/ReturnsRto'));
const CodReconciliation = lazyRetry(() => import('./pages/panels/CodReconciliation'));
const WeightDisputes = lazyRetry(() => import('./pages/panels/WeightDisputes'));
const Refunds = lazyRetry(() => import('./pages/panels/Refunds'));
const WorkflowRules = lazyRetry(() => import('./pages/panels/WorkflowRules'));
const DocumentTemplates = lazyRetry(() => import('./pages/panels/DocumentTemplates'));
const CustomFields = lazyRetry(() => import('./pages/panels/CustomFields'));
const MarketplaceSettlements = lazyRetry(() => import('./pages/panels/MarketplaceSettlements'));
const ScannerShell = lazyRetry(() => import('./pages/scanner/ScannerShell'));
const ScanLookup = lazyRetry(() => import('./pages/scanner/ScanLookup'));
const ScanPutaway = lazyRetry(() => import('./pages/scanner/ScanPutaway'));
const ScanPick = lazyRetry(() => import('./pages/scanner/ScanPick'));
const ScanMove = lazyRetry(() => import('./pages/scanner/ScanMove'));
const ScanCount = lazyRetry(() => import('./pages/scanner/ScanCount'));
const PosSurface = lazyRetry(() => import('./pages/pos/PosSurface'));
const VendorPortal = lazyRetry(() => import('./pages/vendor/VendorPortal'));
const CustomerPortal = lazyRetry(() => import('./pages/customer/CustomerPortal'));
const PartnerPortal = lazyRetry(() => import('./pages/partner/PartnerPortal'));
const SetupGuide = lazyRetry(() => import('./pages/SetupGuide'));
// Marketing panel (docs/MARKETING_PANEL.md)
const MarketingDashboard = lazyRetry(() => import('./pages/panels/marketing/MarketingDashboard'));
const MarketingCampaigns = lazyRetry(() => import('./pages/panels/marketing/MarketingCampaigns'));
const MarketingTemplates = lazyRetry(() => import('./pages/panels/marketing/MarketingTemplates'));
const MarketingAudiences = lazyRetry(() => import('./pages/panels/marketing/MarketingAudiences'));
const MarketingAutomation = lazyRetry(() => import('./pages/panels/marketing/MarketingAutomation'));
const AdsManager = lazyRetry(() => import('./pages/panels/marketing/AdsManager'));
const AdsAudiences = lazyRetry(() => import('./pages/panels/marketing/AdsAudiences'));
const Connections = lazyRetry(() => import('./pages/panels/marketing/Connections'));
const ConnectorCallback = lazyRetry(() => import('./pages/panels/marketing/ConnectorCallback'));
const ConnectorInsights = lazyRetry(() => import('./pages/panels/marketing/ConnectorInsights'));
const GoogleReviews = lazyRetry(() => import('./pages/panels/marketing/GoogleReviews'));
const AdsAiStudio = lazyRetry(() => import('./pages/panels/marketing/AdsAiStudio'));
const MarketingAnalyticsHub = lazyRetry(() => import('./pages/panels/marketing/MarketingAnalyticsHub'));
const MarketingCompliance = lazyRetry(() => import('./pages/panels/marketing/MarketingCompliance'));
const MarketingSettings = lazyRetry(() => import('./pages/panels/marketing/MarketingSettings'));
const AdsOAuthCallback = lazyRetry(() => import('./pages/panels/marketing/AdsOAuthCallback'));
const MarketingPerformance = lazyRetry(() => import('./pages/panels/marketing/MarketingPerformance'));
const GrowthAnalytics = lazyRetry(() => import('./pages/panels/marketing/GrowthAnalytics'));
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

