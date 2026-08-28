import { getAuth } from "@clerk/express";
import dotenv from "dotenv";
import { resolveUser, adminBypassEnabled } from "../services/authz.js";
dotenv.config();

/**
 * The single authorization gate in agendo: is this caller an admin?
 *
 * Authority is Mongo `user.type`, resolved through `services/authz.resolveUser` — the
 * one place that answers "who is this caller and are they an admin". The other check
 * that used to exist, `utils/userIsAdmin`, read Clerk `publicMetadata.type` — a field
 * agendo stopped writing once the user profile JSON outgrew Clerk's metadata size limit
 * — so it returned false for genuine admins. It has been removed; do not reintroduce a
 * publicMetadata read for authorization. See docs/knowledge/clerk-mongo-boundary.md.
 *
 * This used to `next()` unconditionally when `NODE_ENV === "development"`, which meant
 * no gated route was ever really exercised locally and every role bug stayed invisible
 * until production. That bypass is gone. `ADMIN_BYPASS=1` replaces it as an explicit,
 * loudly-logged opt-in, deliberately NOT keyed on NODE_ENV: that flag also selects the
 * Mongo collection (dev-users vs users), so pointing at the wrong data used to disable
 * every admin gate as a silent side effect. Two orthogonal concerns, two flags.
 *
 * With the bypass off, a 403 locally means your Clerk user needs `type: "admin"` in the
 * `dev-users` collection (collections are environment-split — see models/UserModel.js).
 */

export default async function adminOnly(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (adminBypassEnabled()) {
    console.warn(
      `[${req.requestId}] - ADMIN_BYPASS=1, admin check skipped for ${userId} on ${req.method} ${req.originalUrl}`,
    );
    return next();
  }

  try {
    const { mongoUser, isAdmin } = await resolveUser(userId);

    if (!isAdmin) {
      // Logged because a 403 here is otherwise indistinguishable from a bug: the two
      // causes (no Mongo record for this Clerk id vs. a non-admin) need different fixes.
      console.warn(
        `[${req.requestId}] - adminOnly denied ${req.method} ${req.originalUrl} for clerkId ${userId}: ` +
          (mongoUser
            ? `type is "${mongoUser.type}"`
            : "no matching user in Mongo"),
      );
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (err) {
    // Without this an async throw leaves the request hanging with no response at all:
    // express 4 does not catch rejections from async middleware.
    console.error(`[${req.requestId}] - admin check failed: ${err.message}`);
    return res.status(500).json({ error: "Could not verify permissions" });
  }

  next();
}
