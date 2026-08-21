import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import SpecSheet from './pages/SpecSheet';
import SampleCentral from './pages/SampleCentral';
import Eos from './pages/Eos';

// Role gate (Task 2.7): the Cortina sales role sees ONLY Sample Central.
// InternalOnly wraps every internal route; HomeRedirect sends each role to its
// landing app.
function InternalOnly() {
  const { profile } = useAuth();
  if (profile?.role === 'cortina') return <Navigate to="/sample-central" replace />;
  return <Outlet />;
}
function HomeRedirect() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === 'cortina' ? '/sample-central' : '/orders'} replace />;
}
import Payments from './pages/Payments';
import PaymentDetail from './pages/PaymentDetail';
import EomSnapshot from './pages/EomSnapshot';
import LotTrace from './pages/LotTrace';
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
              {/* Sample Central — all authenticated roles, and OUTSIDE Layout:
                  it carries the prototype's own aubergine nav instead of the
                  shared sidebar (ADR-030). The waffle in that nav is how internal
                  users get back to Cookie Central. */}
              <Route
                path="/sample-central"
                element={
                  <ProtectedRoute>
                    <SampleCentral />
                  </ProtectedRoute>
                }
              />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<HomeRedirect />} />
                {/* Internal-only routes — Cortina role is redirected to Sample Central */}
                <Route element={<InternalOnly />}>
                  <Route path="orders" element={<ProductOrders />} />
                  <Route path="orders/:poNumber" element={<PurchaseOrderDetail />} />
                  <Route path="weekly" element={<WeeklyReport />} />
                  <Route path="eos" element={<Eos />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="payments/:poNumber" element={<PaymentDetail />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="snapshot" element={<EomSnapshot />} />
                  <Route path="reference" element={<Reference />} />
                  <Route path="spec-sheet" element={<SpecSheet />} />
                  <Route path="trace" element={<LotTrace />} />
                  <Route path="audit" element={<AuditLog />} />
                  <Route path="uploads" element={<Uploads />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RetailerFilterProvider>
      </UOMProvider>
    </AuthProvider>
  );
}
