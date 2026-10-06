/**
 * Who may see and run Performance: the people listed in PERFORMANCE_ACCESS_EMAILS
 * (comma-separated), matched on their agendo user's email. Not all admins — agent
 * performance is visible to a named few. The list lives in the environment, not here,
 * because this repository is public.
 *
 * Fails closed: unset or empty means nobody. ADMIN_BYPASS=1 (local runs only, see
 * middlewares/adminOnly.js) lets a local run through, as it does for admin routes.
 *
 * This is the one place to change when finer roles exist — the router uses nothing else.
 * The frontend asks GET /performance/access and hides the page and its nav link.
 */
import process from "process";
import { getAuth } from "@clerk/express";
import { resolveUser, adminBypassEnabled } from "../../services/authz.js";

export function allowedEmails() {
  return String(process.env.PERFORMANCE_ACCESS_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether this Clerk user may use Performance. Never throws for a missing user. */
export async function hasPerformanceAccess(clerkId) {
  if (!clerkId) return false;
  if (adminBypassEnabled()) return true;
  const allowed = allowedEmails();
  if (!allowed.length) return false;
  const { mongoUser } = await resolveUser(clerkId);
  return Boolean(mongoUser?.email) && allowed.includes(String(mongoUser.email).toLowerCase());
}

export async function canViewPerformance(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (!(await hasPerformanceAccess(userId))) {
      console.warn(`[${req.requestId}] - performance access denied for ${userId} on ${req.method} ${req.originalUrl}`);
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (err) {
    // express 4 doesn't catch async middleware rejections; answer instead of hanging.
    console.error(`[${req.requestId}] - performance access check failed: ${err.message}`);
    return res.status(500).json({ error: "Could not verify permissions" });
  }
  next();
}

// Everyone who can see it can also import and lock, for now.
export const canManagePerformance = canViewPerformance;
