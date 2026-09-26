import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import AppShell from "./layouts/AppShell";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import UsersPage from "./pages/UsersPage";
import UserDetailPage from "./pages/UserDetailPage";
import RolesPage from "./pages/RolesPage";
import RoleMatrixPage from "./pages/RoleMatrixPage";
import PermissionsPage from "./pages/PermissionsPage";
import DevicesPage from "./pages/DevicesPage";

function Guard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center text-ink-700">Loading session…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="iam/users" element={<UsersPage />} />
        <Route path="iam/users/:id" element={<UserDetailPage />} />
        <Route path="iam/roles" element={<RolesPage />} />
        <Route path="iam/roles/:id" element={<RoleMatrixPage />} />
        <Route path="iam/permissions" element={<PermissionsPage />} />
        <Route path="iam/devices" element={<DevicesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
