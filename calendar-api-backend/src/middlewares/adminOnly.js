import { getAuth } from "@clerk/express";
import userService from "../services/userService.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * The single authorization gate in agendo: is this caller an admin?
 *
 * Authority is Mongo `user.type`. The other check that used to exist,
 * `utils/userIsAdmin`, read Clerk `publicMetadata.type` — a field agendo stopped
 * writing once the user profile JSON outgrew Clerk's metadata size limit — so it
 * returned false for genuine admins. It has been removed; do not reintroduce a
 * publicMetadata read for authorization.
 *
 * This used to `next()` unconditionally when `NODE_ENV === "development"`, which meant
 * no gated route was ever really exercised locally and every role bug stayed invisible
 * until production. The bypass is gone: local dev now behaves exactly like production.
 * If you get a 403 locally, your Clerk user needs `type: "admin"` in the `dev-users`
 * collection (collections are environment-split — see models/userModel.js).
 */
export default async function adminOnly(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await userService.findUserByClerkId(userId);

  if (!user || user.type !== "admin") {
    // Logged because a 403 here is otherwise indistinguishable from a bug: the two
    // causes (no Mongo record for this Clerk id vs. a non-admin) need different fixes.
    console.warn(
      `[${req.requestId}] - adminOnly denied ${req.method} ${req.originalUrl} for clerkId ${userId}: ` +
        (user ? `type is "${user.type}"` : "no matching user in Mongo"),
    );
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}
