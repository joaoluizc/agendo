import { Link, Outlet } from "react-router-dom";
import { Lock } from "lucide-react";
import { useUserSettings } from "@/providers/useUserSettings";
import { Requirement, describeRequirement } from "./permissions";

/**
 * Route guard: renders the page only for someone who meets `requires` — "admin" or
 * "<area>:<level>" (see permissions.ts). Nested inside ProtectedRoute, so the user is
 * already signed in here.
 *
 * Waits for /api/user/info (userInfoLoaded) before deciding, so nobody is turned away in
 * the moment before their access loads; a failed load counts as no access. This only
 * spares people a page of 403s — the API enforces the same rule on every call.
 */
const RequirePermission = ({ requires }: { requires: Requirement }) => {
  const { userInfoLoaded, meets } = useUserSettings();

  if (!userInfoLoaded) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">Loading…</div>
    );
  }

  if (!meets(requires)) {
    return <NoAccess requires={requires} />;
  }

  return <Outlet />;
};

export const NoAccess = ({ requires }: { requires: Requirement }) => (
  <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
    <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="text-lg font-semibold">You don’t have access to this page</h1>
    <p className="text-sm text-muted-foreground">
      It’s for {describeRequirement(requires)}. An agendo admin can give you access in
      Settings → Users.
    </p>
    <Link to="/" className="text-sm underline underline-offset-4">
      Back to home
    </Link>
  </div>
);

export default RequirePermission;
