import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import ProductForm from './pages/ProductForm';
import OrderDetail from './pages/OrderDetail';
import FAQs from './pages/FAQs';
import Reviews from './pages/Reviews';
import Coupons from './pages/Coupons';
import CouponForm from './pages/CouponForm';
import ProductSectionsManager from './pages/ProductSectionsManager';
import ContactSettings from './pages/ContactSettings';
import PaymentDiscountSettings from './pages/PaymentDiscountSettings';
import Settings from './pages/Settings';
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
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="faqs" element={<FAQs />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="coupons/new" element={<CouponForm />} />
          <Route path="coupons/:id/edit" element={<CouponForm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/contact" element={<ContactSettings />} />
          <Route path="settings/payment-discount" element={<PaymentDiscountSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

