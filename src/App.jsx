import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UOMProvider } from './contexts/UOMContext';
import { RetailerFilterProvider } from './contexts/RetailerFilterContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ProductOrders from './pages/ProductOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import Inventory from './pages/Inventory';
import Uploads from './pages/Uploads';
import WeeklyReport from './pages/WeeklyReport';
import Reference from './pages/Reference';
import Payments from './pages/Payments';
import PaymentDetail from './pages/PaymentDetail';
import EomSnapshot from './pages/EomSnapshot';
import AuditLog from './pages/AuditLog';
import PageStub from './pages/PageStub';

export default function App() {
  return (
    <AuthProvider>
      <UOMProvider>
        <RetailerFilterProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/orders" replace />} />
                <Route path="orders" element={<ProductOrders />} />
                <Route path="orders/:poNumber" element={<PurchaseOrderDetail />} />
                <Route path="weekly" element={<WeeklyReport />} />
                <Route path="payments" element={<Payments />} />
                <Route path="payments/:poNumber" element={<PaymentDetail />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="snapshot" element={<EomSnapshot />} />
                <Route path="reference" element={<Reference />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="uploads" element={<Uploads />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RetailerFilterProvider>
      </UOMProvider>
    </AuthProvider>
  );
}
