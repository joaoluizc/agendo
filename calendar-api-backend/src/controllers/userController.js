import process from "process";
import { Webhook } from "svix";
import userService from "../services/userService.js";
import utils from "../utils/utils.js";

const userInfo = async (req, res) => {
  const userId = req.auth.userId;
  console.log(`[${req.requestId}]: getting user info for ${userId}`);
  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const user = await userService.findUser(userEmail);
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }
  const response = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    slingId: user.slingId,
    timeZone: user.timeZone,
    type: user.type,
  };
  res.status(200).json(response);
};

// an endpoint calling this function is redundant, since all of this info is already on the frontend via clerk
// for time management purposes, this will remain until the frontend can be refactored
const userInfo_cl = async (req, res) => {
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

  const response = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    slingId: user.slingId,
    timeZone: user.timeZone,
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
    // and can be backfilled later via /user/add-clerk-id-to-all-users.
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

const getAllUsers_cl = async (_req, res) => {
  try {
    const users = await userService.getAllUsersSafeInfo_cl();
    res.status(200).json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

export default {
  // registerUser,
  // loginUser,
  userInfo,
  userInfo_cl,
  newClerkUser,
  getAllUsers_cl,
};
