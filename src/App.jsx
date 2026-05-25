import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UOMProvider } from './contexts/UOMContext';
import { RetailerFilterProvider } from './contexts/RetailerFilterContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ProductOrders from './pages/ProductOrders';
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
                <Route
                  path="weekly"
                  element={
                    <PageStub
                      title="Weekly Report"
                      day={6}
                      scope="KPIs, findings, EOS sections, week archive — built Day 6 (BUILD_PLAN 6.6)."
                    />
                  }
                />
                <Route
                  path="payments"
                  element={
                    <PageStub
                      title="Payments"
                      day={6}
                      scope="List with retailer filter + detail view — built Day 6 (BUILD_PLAN 6.1, 6.2)."
                    />
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <PageStub
                      title="Inventory"
                      day={4}
                      scope="3-view toggle (Warehouse / Product / Reorder) — built Days 4-5 (BUILD_PLAN 4.x, 5.x)."
                    />
                  }
                />
                <Route
                  path="snapshot"
                  element={
                    <PageStub
                      title="EOM Snapshot"
                      day={7}
                      scope="Monthly KPIs with vs-last-month deltas — built Day 7 (BUILD_PLAN 7.1)."
                    />
                  }
                />
                <Route
                  path="reference"
                  element={
                    <PageStub
                      title="Reference"
                      day={6}
                      scope="Products + UOM, Raw Materials, Transitions — built Day 6 (BUILD_PLAN 6.3-6.5)."
                    />
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RetailerFilterProvider>
      </UOMProvider>
    </AuthProvider>
  );
}
