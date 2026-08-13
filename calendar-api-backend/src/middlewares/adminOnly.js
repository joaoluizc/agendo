import process from "process";
import { getAuth } from "@clerk/express";
import dotenv from "dotenv";
import { resolveUser } from "../services/authz.js";
dotenv.config();

// Local escape hatch for working on admin routes without an admin account.
//
// Deliberately NOT keyed on NODE_ENV: that same flag also selects the Mongo collection
// (dev-users vs users), so pointing at the wrong data used to disable every admin gate
// in the application as a silent side effect. Two orthogonal concerns, two flags.
const adminBypassEnabled = process.env.ADMIN_BYPASS === "1";

export default async function adminOnly(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (adminBypassEnabled) {
    console.warn(
      `[${req.requestId}]: ADMIN_BYPASS=1 - admin check skipped for ${userId}`
    );
    return next();
  }

  try {
    const { isAdmin } = await resolveUser(userId);
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (err) {
    // Without this an async throw leaves the request hanging with no response at all.
    console.error(`[${req.requestId}]: admin check failed: ${err.message}`);
    return res.status(500).json({ error: "Could not verify permissions" });
  }

  next();
}
