import process from "process";
import { Webhook } from "svix";
import userService from "../services/userService.js";
import { getCaller } from "../services/authz.js";
import { effectivePermissions } from "../permissions/evaluate.js";
import { publicRegistry } from "../permissions/registry.js";
import { rosterShapeFor } from "../permissions/shaping.js";
import { planAccessChange, storedPermissions } from "../permissions/accessChange.js";
import { planOffboard } from "../permissions/offboard.js";
import { offboardUser } from "../services/offboardService.js";
import { PermissionAudit } from "../models/PermissionAuditModel.js";
import { identityFromWebhook } from "../permissions/onboarding.js";
import onboardingService from "../services/onboardingService.js";

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

// Clerk's `user.created` webhook (svix-signed). It provisions the agendo user: with the
// access an admin invited this email with, or the new-user defaults. The rules are in
// permissions/onboarding.js; the first-request backstop in services/authz.js catches a
// delivery that never arrives. Acked before provisioning, so its outcome is a log line.
const newClerkUser = async (req, res) => {
  const svixHeaders = {
    "svix-id": req.headers["svix-id"],
    "svix-timestamp": req.headers["svix-timestamp"],
    "svix-signature": req.headers["svix-signature"],
  };

  let event;
  try {
    // Webhook() itself throws on a missing/malformed secret, so it belongs in here too.
    const wh = new Webhook(process.env.CLERK_WEBHOOK_NEW_USER_CREATED_SECRET);
    event = wh.verify(req.rawBody, svixHeaders);
  } catch (e) {
    console.error(
      `[${req.requestId}]: newClerkUser - webhook verification failed: ${e.message}`,
    );
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Only account creation provisions. Ack anything else the endpoint is subscribed to, so
  // svix doesn't retry it.
  if (event.type && event.type !== "user.created") {
    console.log(`[${req.requestId}]: newClerkUser - ignoring a ${event.type} event`);
    return res.status(200).json({ message: `ignored: ${event.type}` });
  }

  const identity = identityFromWebhook(event.data);
  if (!identity.email) {
    console.error(
      `[${req.requestId}]: newClerkUser - payload for clerkId ${identity.clerkId} has no email address; ignoring`,
    );
    return res.status(200).json({ message: "ignored: no email address" });
  }

  // Ack before provisioning: svix gives the endpoint only a few seconds, and the sling
  // lookup is a network round trip. The outcome is logged, never returned.
  console.log(
    `[${req.requestId}]: newClerkUser - accepted webhook for ${identity.email} (clerkId: ${identity.clerkId}); provisioning`,
  );
  res.status(200).json({ message: "accepted" });

  try {
    await onboardingService.provisionIdentity(identity, {
      source: "webhook",
      requestId: req.requestId,
    });
  } catch (err) {
    // Nothing to return to clerk at this point — the log is the only signal, so make it
    // loud. Their first request will try again (services/authz.js).
    console.error(
      `[${req.requestId}]: newClerkUser - FAILED to provision ${identity.email} (clerkId: ${identity.clerkId}) after acking the webhook: ${err.message}`,
      err,
    );
  }
};

// Pending invites: access set for an email before that person has an agendo user.
// Admin-only on the route. See docs/knowledge/onboarding.md.
const listInvites = async (req, res) => {
  try {
    res.status(200).json(await onboardingService.listInvites());
  } catch (err) {
    console.error(`[${req.requestId}]: listInvites failed: ${err.message}`);
    res.status(500).json({ error: `Could not load invites: ${err.message}` });
  }
};

// Create or update the invite for an email. If they already have a Clerk account they
// are provisioned on the spot (`status: "provisioned"`), else it waits (`"pending"`).
const saveInvite = async (req, res) => {
  try {
    const actor = await getCaller(req);
    const result = await onboardingService.saveInvite({
      actor,
      body: req.body,
      requestId: req.requestId,
    });
    if (!result.ok) {
      const { status, error, details, clerkId } = result;
      return res.status(status).json({
        error,
        ...(details ? { details } : {}),
        ...(clerkId !== undefined ? { clerkId } : {}),
      });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error(`[${req.requestId}]: saveInvite failed: ${err.message}`);
    res.status(500).json({ error: `Could not save the invite: ${err.message}` });
  }
};

const revokeInvite = async (req, res) => {
  const { inviteId } = req.params;
  try {
    const actor = await getCaller(req);
    const revoked = await onboardingService.revokeInvite(inviteId);
    if (!revoked) {
      return res.status(404).json({ error: "No pending invite with that id" });
    }
    console.log(`[${req.requestId}]: revokeInvite - ${actor.clerkId} revoked invite ${inviteId}`);
    res.status(200).json({ id: inviteId, revoked: true });
  } catch (err) {
    console.error(`[${req.requestId}]: revokeInvite failed for ${inviteId}: ${err.message}`);
    res.status(500).json({ error: `Could not revoke the invite: ${err.message}` });
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

/**
 * Offboard someone: delete them from agendo and from Clerk in one step. Admin-only on the
 * route; the rules (not yourself, not the last admin, a missing Mongo user resumes rather
 * than 404s) are in permissions/offboard.js, and the ordering and what happens to their
 * data is in services/offboardService.js.
 *
 * Irreversible, so the answer is a full report rather than a bare 204 — the UI reads it
 * back to the admin. Three outcomes:
 *
 *   200  everything went through
 *   207  access was cut but some cleanup failed — `errors` says what, and the admin has
 *        to finish it by hand (most often: delete the account in the Clerk dashboard)
 *   500  the agendo user itself could not be deleted, so nothing was cut and nothing else
 *        was attempted
 *
 * The audit record is written before the deletion, from the loaded document: it is the
 * only trace that survives the user, and writing it afterwards would mean losing it
 * entirely if the process died mid-request.
 */
const offboardUserById = async (req, res) => {
  const { clerkId } = req.params;
  try {
    const actor = await getCaller(req);
    const target = await userService.findUserByClerkId(clerkId);
    const otherAdminCount = target ? await userService.countOtherAdmins(clerkId) : 0;
    const plan = planOffboard({ actor, target, targetClerkId: clerkId, otherAdminCount });
    if (!plan.ok) {
      console.warn(
        `[${req.requestId}]: offboardUser - refused ${clerkId} for ${actor.clerkId}: ${plan.error}`,
      );
      return res.status(plan.status).json({ error: plan.error });
    }

    const who = target ? `${target.firstName} ${target.lastName} <${target.email}>` : clerkId;
    console.log(
      `[${req.requestId}]: offboardUser - ${actor.clerkId} is offboarding ${who}` +
        `${plan.resume ? " (resuming: no agendo user to delete)" : ""}`,
    );

    // Written first, and deliberately not rolled back if the offboard then fails: "an
    // admin ran this against this person at this time" is true either way, and the
    // report below says how far it got.
    if (target) {
      try {
        await PermissionAudit.create({
          at: new Date(),
          via: "web",
          actorClerkId: actor.clerkId,
          targetClerkId: target.clerkId,
          targetUserId: target._id,
          before: { type: target.type, permissions: storedPermissions(target) },
          after: { type: "offboarded", permissions: null },
          requestId: req.requestId,
        });
      } catch (err) {
        console.error(
          `[${req.requestId}]: offboardUser - AUDIT WRITE FAILED for ${clerkId}: ${err.message}`,
        );
      }
    }

    const report = await offboardUser(clerkId, { requestId: req.requestId });
    const body = { id: clerkId, name: target ? `${target.firstName} ${target.lastName}` : null, ...report };

    if (!report.mongoUserDeleted && !plan.resume) {
      // The kill switch itself failed — `offboardService` aborted before any cleanup.
      return res.status(500).json({ error: "Could not remove the agendo user", ...body });
    }
    return res.status(report.errors.length ? 207 : 200).json(body);
  } catch (err) {
    console.error(`[${req.requestId}]: offboardUser failed for ${clerkId}: ${err.message}`);
    res.status(500).json({ error: `Could not offboard: ${err.message}` });
  }
};

export default {
  getMyProfile,
  offboardUserById,
  setUserPermissions,
  getPermissionRegistry,
  newClerkUser,
  listInvites,
  saveInvite,
  revokeInvite,
  getAllUsers,
  setUserPreferences,
  setMyTimezone,
  setUserTimezoneById,
};
