import { validatePermissionsPatch } from "./evaluate.js";

/**
 * What an existing user gets when per-area permissions are introduced: today's effective
 * access, plus the changes decided for the rollout (docs/permissions-plan.md §10). Pure,
 * so the mapping is tested apart from the script that writes it
 * (database/scripts/backfillPermissions.js).
 *
 *  - scheduling: view — every signed-in user can read the published schedule today.
 *  - bugs: none — bug tracking is admin-only today.
 *  - reports: self — new: everyone sees their own report (decided 2026-10-06).
 *  - performance: edit for people on today's PERFORMANCE_ACCESS_EMAILS allowlist, which
 *    gated reads and management alike; none for everyone else.
 *
 * Admins get the same stored values as everyone else: their access comes from the admin
 * flag, and these values are what they fall back to if that flag is ever removed.
 */
export function permissionsForExistingUser(user, performanceAllowlist) {
  const email = String(user?.email || "").trim().toLowerCase();
  const permissions = {
    scheduling: "view",
    bugs: "none",
    reports: "self",
    performance: email && performanceAllowlist.has(email) ? "edit" : "none",
  };
  const { ok, errors } = validatePermissionsPatch(permissions);
  if (!ok) {
    throw new Error(`backfill mapping is out of step with the registry: ${errors.join("; ")}`);
  }
  return permissions;
}

/** PERFORMANCE_ACCESS_EMAILS (comma-separated) as a lowercase Set — same parse as access.js. */
export function parseAllowlist(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export default { permissionsForExistingUser, parseAllowlist };
