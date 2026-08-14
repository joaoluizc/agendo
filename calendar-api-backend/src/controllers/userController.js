import process from "process";
import { Webhook } from "svix";
import userService from "../services/userService.js";
import { resolveUser } from "../services/authz.js";
import utils from "../utils/utils.js";

// The authoritative profile endpoint. Mongo owns every field returned here — Clerk
// publicMetadata is not read (see docs/knowledge/clerk-mongo-boundary.md).
//
// This is the single point of failure for frontend authorization: every admin gate in
// the UI reads `type` from this response, and the provider treats a failed fetch as
// "loaded, type = ''". So a 500 here silently demotes an admin to a normal user rather
// than showing an error — never let this throw past the guards below.
const getMyProfile = async (req, res) => {
  const userId = req.auth.userId;
  console.log(`[${req.requestId}]: getting user info for ${userId}`);
  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  let user;
  try {
    user = await userService.findUserByClerkId(userId);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }

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
    timeZone: user.timezone,
    type: user.type,
  };
  res.status(200).json(response);
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
// avatar. But `type`, `slingId` and `email` are admin-only: previously they were
// sourced from Clerk publicMetadata and came back empty, so nothing was exposed. Now
// they carry real values, and without this filter any signed-in employee could
// enumerate exactly who the admins are.
const getAllUsers = async (req, res) => {
  try {
    const { isAdmin } = await resolveUser(req.auth?.userId);
    const users = await userService.getAllUsersSafeInfo();
    const payload = isAdmin
      ? users
      : users.map((user) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          hasImage: user.hasImage,
        }));
    res.status(200).json(payload);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

export default {
  getMyProfile,
  newClerkUser,
  getAllUsers,
};
