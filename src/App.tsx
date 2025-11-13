import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Bundles from './pages/Bundles';
import AbandonedCarts from './pages/AbandonedCarts';
import Categories from './pages/Categories';
import SizeCharts from './pages/SizeCharts';
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
import GeneralSettings from './pages/GeneralSettings';
import ApiIntegrationSettings from './pages/ApiIntegrationSettings';
import PaymentGatewaySettings from './pages/PaymentGatewaySettings';
import GstSettings from './pages/GstSettings';
import Settings from './pages/Settings';
import ShippingSettings from './pages/ShippingSettings';
import Warehouses from './pages/Warehouses';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Gallery from './pages/Gallery';
import Logs from './pages/Logs';
import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

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
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id/edit" element={<ProductForm />} />
          <Route path="products/:id/sections" element={<ProductSectionsManager />} />
          <Route path="products/bundles" element={<Bundles />} />
          <Route path="products/bundles/new" element={<BundleForm />} />
          <Route path="products/bundles/:id/edit" element={<BundleForm />} />
          <Route path="categories" element={<Categories />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="size-charts" element={<SizeCharts />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/abandoned-carts" element={<AbandonedCarts />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="faqs" element={<FAQs />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="coupons/new" element={<CouponForm />} />
          <Route path="coupons/:id/edit" element={<CouponForm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/general" element={<GeneralSettings />} />
          <Route path="settings/api-integrations" element={<ApiIntegrationSettings />} />
          <Route path="settings/contact" element={<ContactSettings />} />
          <Route path="settings/payment-discount" element={<PaymentDiscountSettings />} />
          <Route path="settings/payment-gateways" element={<PaymentGatewaySettings />} />
          <Route path="settings/sms-templates" element={<SmsTemplates />} />
          <Route path="settings/gst" element={<GstSettings />} />
          <Route path="settings/shipping" element={<ShippingSettings />} />
          <Route path="warehouses" element={<Warehouses />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

