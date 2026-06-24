import { Navigate, Outlet } from "react-router-dom";
import { useUserSettings } from "@/providers/useUserSettings";

/**
 * Gate for admin-only pages (Jira Backlog, Tasks). Nested inside ProtectedRoute, so the
 * user is already signed in here. We wait for /api/user/info to resolve (userInfoLoaded)
 * before deciding, so an admin isn't bounced during the brief window before their role
 * loads on a fresh page load / refresh; non-admins are sent home.
 */
const AdminRoute = () => {
  const { type, userInfoLoaded } = useUserSettings();

  if (!userInfoLoaded) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">Loading…</div>
    );
  }

  if (type !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
