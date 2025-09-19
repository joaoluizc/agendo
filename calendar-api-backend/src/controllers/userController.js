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

const newClerkUser = async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_NEW_USER_CREATED_SECRET;
  const svixHeaders = {
    "svix-id": req.headers["svix-id"],
    "svix-timestamp": req.headers["svix-timestamp"],
    "svix-signature": req.headers["svix-signature"],
  };
  const payload = req.rawBody;

  const wh = new Webhook(secret);

  let msg;
  try {
    msg = wh.verify(payload, svixHeaders);
    msg = msg.data;
  } catch (e) {
    console.error("Verification error:", e);
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { first_name: firstName, last_name: lastName } = msg;
  const userEmail = msg.email_addresses[0].email_address;
  const clerkId = msg.id;
  const userId = msg.id;
  const slingId = utils.getSlingIdByEmail(userEmail);

  console.log(
    `[${req.requestId}]: newClerkUser called for user: ${userEmail}, clerkId: ${clerkId}, slingId: ${slingId}`
  );

  await userService.createUser({
    firstName,
    lastName,
    email: userEmail,
    slingId,
    clerkId,
  });
  // await userService.addPositionsToSyncNewUser(userId);
  // await userService.addBasicPropertiesToNewUser(userId, userEmail);

  res.json();
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
