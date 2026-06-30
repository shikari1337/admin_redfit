import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Products from './pages/Products';
import Bundles from './pages/Bundles';
import AbandonedCarts from './pages/AbandonedCarts';
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
import BundleForm from './pages/BundleForm';
import OrderDetail from './pages/OrderDetail';
import FAQs from './pages/FAQs';
import Reviews from './pages/Reviews';
import Coupons from './pages/Coupons';
import CouponForm from './pages/CouponForm';
import ProductSectionsManager from './pages/ProductSectionsManager';
import ContactSettings from './pages/ContactSettings';
import PaymentDiscountSettings from './pages/PaymentDiscountSettings';
import SmsTemplates from './pages/SmsTemplates';
import ApiIntegrationSettings from './pages/ApiIntegrationSettings';
import PaymentGatewaySettings from './pages/PaymentGatewaySettings';
import GstSettings from './pages/GstSettings';
import Settings from './pages/Settings';
import ShippingSettings from './pages/ShippingSettings';
import Warehouses from './pages/Warehouses';
import Shipments from './pages/Shipments';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Gallery from './pages/Gallery';
import Logs from './pages/Logs';
import Pages from './pages/Pages';
import PageForm from './pages/PageForm';
import AppearanceMenus from './pages/AppearanceMenus';
import AppearanceStyle from './pages/AppearanceStyle';
import AppearanceBanners from './pages/AppearanceBanners';
import Leads from './pages/Leads';
import ContentManager from './pages/ContentManager';
import PageEditor from './pages/PageEditor';
import Staff from './pages/Staff';
import Layout from './components/Layout';
import { ProtectedModuleRoute } from './components/ProtectedModuleRoute';
import { ProtectedRoute } from './components/ProtectedRoute';

import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard';
import StoreAnalytics from './pages/analytics/StoreAnalytics';
import UserAnalytics from './pages/analytics/UserAnalytics';
import RealtimeAnalytics from './pages/analytics/RealtimeAnalytics';
import CustomAnalytics from './pages/analytics/CustomAnalytics';
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

function App() {
  console.log('📱 Admin Panel: App component rendering...');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="analytics" element={<Navigate to="/analytics/dashboard" replace />} />
          <Route path="analytics/dashboard" element={<AnalyticsDashboard />} />
          <Route path="analytics/store" element={<StoreAnalytics />} />
          <Route path="analytics/users" element={<UserAnalytics />} />
          <Route path="analytics/realtime" element={<RealtimeAnalytics />} />
          <Route path="analytics/custom" element={<CustomAnalytics />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id/edit" element={<ProductForm />} />
          <Route path="products/:id/sections" element={<ProductSectionsManager />} />
          <Route path="products/:productSlug/variations/:variationIndex/edit" element={<VariationEditPage />} />
          <Route path="products/bundles" element={<Bundles />} />
          <Route path="products/bundles/new" element={<BundleForm />} />
          <Route path="products/bundles/:id/edit" element={<BundleForm />} />
          <Route path="products/categories" element={<Categories />} />
          <Route path="products/brands" element={<Brands />} />
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
          <Route path="orders/abandoned-carts" element={<AbandonedCarts />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="faqs" element={<FAQs />} />
          <Route path="reviews" element={<ProtectedModuleRoute module="reviews"><Reviews /></ProtectedModuleRoute>} />
          <Route path="coupons" element={<ProtectedModuleRoute module="coupons"><Coupons /></ProtectedModuleRoute>} />
          <Route path="coupons/new" element={<ProtectedModuleRoute module="coupons"><CouponForm /></ProtectedModuleRoute>} />
          <Route path="coupons/:id/edit" element={<ProtectedModuleRoute module="coupons"><CouponForm /></ProtectedModuleRoute>} />
          <Route path="appearance" element={<Navigate to="/appearance/pages" replace />} />
          <Route path="appearance/menus" element={<AppearanceMenus />} />
          <Route path="appearance/banners" element={<AppearanceBanners />} />
          <Route path="appearance/pages" element={<Pages />} />
          <Route path="appearance/style" element={<AppearanceStyle />} />
          <Route path="pages" element={<Navigate to="/appearance/pages" replace />} />
          <Route path="pages/new" element={<PageForm />} />
          <Route path="pages/:id/edit" element={<PageForm />} />
          <Route
            path="leads"
            element={
              <ProtectedModuleRoute module="leads_manager">
                <Leads />
              </ProtectedModuleRoute>
            }
          />
          <Route
            path="content"
            element={
              <ProtectedModuleRoute module="page_editor">
                <ContentManager />
              </ProtectedModuleRoute>
            }
          />
          <Route
            path="content/:pageSlug/edit"
            element={
              <ProtectedModuleRoute module="page_editor">
                <PageEditor />
              </ProtectedModuleRoute>
            }
          />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/staff" element={<Staff />} />
          <Route path="settings/general" element={<Navigate to="/appearance/style" replace />} />
          <Route path="settings/api-integrations" element={<ApiIntegrationSettings />} />
          <Route path="settings/contact" element={<ContactSettings />} />
          <Route path="settings/payment-discount" element={<PaymentDiscountSettings />} />
          <Route path="settings/payment-gateways" element={<PaymentGatewaySettings />} />
          <Route path="settings/sms-templates" element={<SmsTemplates />} />
          <Route path="settings/gst" element={<GstSettings />} />
          <Route path="settings/shipping" element={<ShippingSettings />} />
          <Route path="settings/modules" element={<Modules />} />
          <Route path="settings/packages" element={<PackageBoxes />} />
          <Route path="settings/billing" element={<Billing />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="b2b" element={<ProtectedModuleRoute module="b2b"><B2B /></ProtectedModuleRoute>} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="blogs" element={<Blogs />} />
          <Route path="blogs/new" element={<BlogForm />} />
          <Route path="blogs/:id/edit" element={<BlogForm />} />
          <Route path="returns" element={<Returns />} />
          <Route path="settings/tax-rules" element={<TaxRules />} />
          <Route path="settings/return-policies" element={<ReturnPolicies />} />
          <Route path="settings/manufacturers" element={<Manufacturers />} />
          <Route path="products/variant-link-groups" element={<VariantLinkGroups />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

