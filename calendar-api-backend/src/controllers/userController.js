import process from "process";
import { Webhook } from "svix";
import userService from "../services/userService.js";
import { getCaller } from "../services/authz.js";
import { effectivePermissions } from "../permissions/evaluate.js";
import { publicRegistry } from "../permissions/registry.js";
import { rosterShapeFor } from "../permissions/shaping.js";
import { planAccessChange, storedPermissions } from "../permissions/accessChange.js";
import { PermissionAudit } from "../models/PermissionAuditModel.js";
import utils from "../utils/utils.js";

// The authoritative profile endpoint. Mongo owns every field returned here — Clerk
// publicMetadata is not read (see docs/knowledge/clerk-mongo-boundary.md).
//
// This is the single point of failure for frontend authorization: every admin gate in
// the UI reads `type` from this response, and the provider treats a failed fetch as
// "loaded, type = ''". So a 500 here silently demotes an admin to a normal user rather
// than showing an error — never let this throw past the guards below.
//
// `permissions` is the caller's *effective* access per area (an admin's is the top level
// everywhere), computed here by the same evaluator the API enforces with. The frontend
// must read access from it, never derive it from `type`.
const getMyProfile = async (req, res) => {
  // The caller the route's requirement marker already resolved: same session-only
  // identity, no second Mongo read.
  let caller;
  try {
    caller = await getCaller(req);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }
  const userId = caller?.clerkId;
  console.log(`[${req.requestId}]: getting user info for ${userId}`);
  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const user = caller.mongoUser;
  if (!user) {
    console.error(
      `[${req.requestId}]: no mongo user for clerk id ${userId} - profile unavailable`
    );
    return res.status(404).json({ message: "User not found" });
  }

  const response = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    slingId: user.slingId,
    // The schema path is `timezone`; `user.timeZone` is off-schema so Mongoose never
    // hydrates it. NOTE this is not a full fix: every doc's `timezone` is still the
    // schema default "UTC", while the real legacy value sits in the unreadable
    // off-schema `timeZone` field. Nothing consumes this yet; migrating the real
    // values is tracked separately.
    // `timezone` is the real, schema-backed value. `timeZone` is kept alongside it only
    // so an older client that still reads the camelCase key does not break mid-deploy;
    // it carries the same string and should be dropped once nothing reads it.
    timezone: user.timezone,
    timeZone: user.timezone,
    type: user.type,
    isAdmin: caller.isAdmin,
    permissions: effectivePermissions(caller),
  };
  res.status(200).json(response);
};

// The permission registry for the admin access editor: areas, levels, labels and copy.
const getPermissionRegistry = (req, res) => {
  res.status(200).json(publicRegistry());
};

// Creates the mongo user behind a verified clerk "user created" webhook. Runs after
// the webhook has already been acked, so its only output is the log line it ends on —
// every path through here must log exactly one outcome.
const provisionClerkUser = async ({
  requestId,
  firstName,
  lastName,
  userEmail,
  clerkId,
}) => {
  let slingId;
  try {
    slingId = await utils.getSlingIdByEmail(userEmail);
    if (!slingId) {
      console.warn(
        `[${requestId}]: newClerkUser - no sling user matches ${userEmail}; continuing without a slingId`,
      );
    }
  } catch (err) {
    // A sling outage must not block the signup — slingId is optional on the model
    // and must currently be corrected by hand in Mongo (the old bulk backfill routes
    // were removed - they seeded from Clerk publicMetadata, which is no longer written).
    console.error(
      `[${requestId}]: newClerkUser - sling lookup failed for ${userEmail}: ${err.message}. Continuing without a slingId.`,
    );
  }

  const { created } = await userService.createUser({
    firstName,
    lastName,
    email: userEmail,
    slingId,
    clerkId,
  });
  // await userService.addPositionsToSyncNewUser(clerkId);
  // await userService.addBasicPropertiesToNewUser(clerkId, userEmail);

  console.log(
    created
      ? `[${requestId}]: newClerkUser - created user ${userEmail} (clerkId: ${clerkId}, slingId: ${slingId ?? "none"})`
      : `[${requestId}]: newClerkUser - user ${userEmail} already existed (clerkId: ${clerkId}); nothing to do`,
  );
};

const newClerkUser = async (req, res) => {
  const svixHeaders = {
    "svix-id": req.headers["svix-id"],
    "svix-timestamp": req.headers["svix-timestamp"],
    "svix-signature": req.headers["svix-signature"],
  };

  let msg;
  try {
    // Webhook() itself throws on a missing/malformed secret, so it belongs in here too.
    const wh = new Webhook(process.env.CLERK_WEBHOOK_NEW_USER_CREATED_SECRET);
    msg = wh.verify(req.rawBody, svixHeaders).data;
  } catch (e) {
    console.error(
      `[${req.requestId}]: newClerkUser - webhook verification failed: ${e.message}`,
    );
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { first_name: firstName, last_name: lastName } = msg;
  const userEmail = msg.email_addresses?.[0]?.email_address;
  const clerkId = msg.id;

  if (!userEmail) {
    console.error(
      `[${req.requestId}]: newClerkUser - payload for clerkId ${clerkId} has no email address; ignoring`,
    );
    return res.status(200).json({ message: "ignored: no email address" });
  }

  // Ack before provisioning: svix gives the endpoint only a few seconds, and the sling
  // lookup below is a network round trip. The outcome is logged, never returned.
  console.log(
    `[${req.requestId}]: newClerkUser - accepted webhook for ${userEmail} (clerkId: ${clerkId}); provisioning`,
  );
  res.status(200).json({ message: "accepted" });

  try {
    await provisionClerkUser({
      requestId: req.requestId,
      firstName,
      lastName,
      userEmail,
      clerkId,
    });
  } catch (err) {
    // Nothing to return to clerk at this point — the log is the only signal, so make it loud.
    console.error(
      `[${req.requestId}]: newClerkUser - FAILED to provision ${userEmail} (clerkId: ${clerkId}) after acking the webhook: ${err.message}`,
      err,
    );
  }
};

// The roster is readable by everyone - the schedule grid needs every agent's name and
// avatar. Everything else is shaped by permission (permissions/shaping.js): schedule
// builders (scheduling:edit) also get email, slingId and the managers' notes about agents;
// `type` and permissions stay admin-only, so nobody else can enumerate who the admins are.
const getAllUsers = async (req, res) => {
  try {
    // Which fields each caller gets is decided in permissions/shaping.js.
    const caller = await getCaller(req);
    const users = await userService.getAllUsersSafeInfo();
    res.status(200).json(rosterShapeFor(caller, users));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

// A long note is still well under this; the cap only stops a runaway paste.
const PREFERENCES_MAX_LENGTH = 20000;

// Markup with no text in it - what the editor sends for a cleared note, e.g. "<p></p>".
const isEmptyMarkup = (html) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";

// Admin-only (route-gated): save one agent's scheduling preferences. The body is
// `{ preferences }`, HTML from the Settings → Users editor; it is rendered through
// interweave on the way out, which strips anything unsafe.
/**
 * An agent sets their own timezone.
 *
 * Self-service and therefore not admin-gated: a person changing their own zone needs no
 * approval, and making them ask is how the field stayed empty for a year.
 */
const setMyTimezone = async (req, res) => {
  const { timezone } = req.body ?? {};
  try {
    const saved = await userService.setUserTimezone(req.auth.userId, timezone);
    console.log(
      `[${req.requestId}]: setMyTimezone - ${req.auth.userId} -> ${saved.timezone}`,
    );
    return res.status(200).json(saved);
  } catch (err) {
    if (err.code === "INVALID_TIMEZONE") {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === "User not found") {
      return res.status(404).json({ message: err.message });
    }
    console.error(`[${req.requestId}]: setMyTimezone failed: ${err.message}`);
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

/**
 * An admin sets someone else's timezone.
 *
 * Needed because the team spans several countries and people do not reliably keep their
 * own profile current — an admin has to be able to fix a wrong zone without chasing the
 * person. Gated by `requireAdmin` on the route, server-side, not merely hidden in the UI.
 */
const setUserTimezoneById = async (req, res) => {
  const { clerkId } = req.params;
  const { timezone } = req.body ?? {};
  try {
    const saved = await userService.setUserTimezone(clerkId, timezone);
    console.log(
      `[${req.requestId}]: setUserTimezone - ${req.auth.userId} set ${clerkId} -> ${saved.timezone}`,
    );
    return res.status(200).json(saved);
  } catch (err) {
    if (err.code === "INVALID_TIMEZONE") {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === "User not found") {
      return res.status(404).json({ message: err.message });
    }
    console.error(
      `[${req.requestId}]: setUserTimezone failed for ${clerkId}: ${err.message}`,
    );
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

const setUserPreferences = async (req, res) => {
  const { clerkId } = req.params;
  const { preferences } = req.body ?? {};

  if (typeof preferences !== "string") {
    return res.status(400).json({ message: "preferences must be a string" });
  }
  if (preferences.length > PREFERENCES_MAX_LENGTH) {
    return res.status(400).json({
      message: `preferences can be at most ${PREFERENCES_MAX_LENGTH} characters`,
    });
  }

  const value = isEmptyMarkup(preferences) ? "" : preferences.trim();

  try {
    const saved = await userService.setUserPreferences(
      clerkId,
      value,
      req.auth.userId,
    );
    console.log(
      `[${req.requestId}]: setUserPreferences - ${req.auth.userId} saved preferences for ${clerkId} (${value.length} chars)`,
    );
    return res.status(200).json(saved);
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(404).json({ message: err.message });
    }
    console.error(
      `[${req.requestId}]: setUserPreferences - failed for ${clerkId}: ${err.message}`,
    );
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

// An admin changes someone's access: their area levels and/or admin flag. The rules are
// in permissions/accessChange.js; this loads, applies, stamps and audits. Admin-only on
// the route. Every change appends a PermissionAudit record.
const setUserPermissions = async (req, res) => {
  const { clerkId } = req.params;
  try {
    const actor = await getCaller(req);
    const target = await userService.findUserByClerkId(clerkId);
    const otherAdminCount = target ? await userService.countOtherAdmins(clerkId) : 0;
    const plan = planAccessChange({ actor, target, body: req.body, otherAdminCount });
    if (!plan.ok) {
      return res
        .status(plan.status)
        .json({ error: plan.error, ...(plan.details ? { details: plan.details } : {}) });
    }

    const before = { type: target.type, permissions: storedPermissions(target) };
    if (plan.changed) {
      target.type = plan.type;
      target.permissions = plan.permissions;
      target.permissionsUpdatedAt = new Date();
      target.permissionsUpdatedBy = actor.clerkId;
      await target.save();
      try {
        await PermissionAudit.create({
          at: target.permissionsUpdatedAt,
          via: "web",
          actorClerkId: actor.clerkId,
          targetClerkId: target.clerkId,
          targetUserId: target._id,
          before,
          after: { type: target.type, permissions: plan.permissions },
          requestId: req.requestId,
        });
      } catch (err) {
        // The change itself is saved; a lost audit record must at least be loud.
        console.error(
          `[${req.requestId}]: setUserPermissions - AUDIT WRITE FAILED for ${clerkId}: ${err.message}`,
        );
      }
      console.log(
        `[${req.requestId}]: setUserPermissions - ${actor.clerkId} set ${clerkId}: type ${before.type} -> ${target.type}, permissions ${JSON.stringify(before.permissions)} -> ${JSON.stringify(plan.permissions)}`,
      );
    }

    res.status(200).json({
      id: target.clerkId,
      type: target.type,
      permissions: storedPermissions(target),
      permissionsUpdatedAt: target.permissionsUpdatedAt || null,
      permissionsUpdatedBy: target.permissionsUpdatedBy || null,
      effectivePermissions: effectivePermissions({
        clerkId: target.clerkId,
        mongoUser: target,
        isAdmin: target.type === "admin",
      }),
    });
  } catch (err) {
    console.error(`[${req.requestId}]: setUserPermissions failed for ${clerkId}: ${err.message}`);
    res.status(500).json({ error: `Could not update access: ${err.message}` });
  }
};

export default {
  getMyProfile,
  setUserPermissions,
  getPermissionRegistry,
  newClerkUser,
  getAllUsers,
  setUserPreferences,
  setMyTimezone,
  setUserTimezoneById,
};
