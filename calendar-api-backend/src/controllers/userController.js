import bcrypt from "bcrypt";
import process from "process";
import { Webhook } from "svix";
import userService from "../services/userService.js";
import { sendCookies } from "../middlewares/sendCookies.js";

// no longer used
const registerUser = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      message: "firstName, lastName, email, and password are required fields",
    });
  }
  try {
    console.log({ firstName, lastName, email, password });
    await userService.createUser(req.body);
    sendCookies(req, res);
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ msg: err.message });
  }
};

// no longer used
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await userService.findUser(email);
    if (!user) {
      return res
        .status(400)
        .json({ msg: "Invalid credentials. Email not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ msg: "Invalid credentials. Wrong password." });
    }

    sendCookies(req, res);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

// no longer used
const logoutUser = async (req, res) => {
  res.cookie("jwt", "", {
    maxAge: 1,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    domain: "dmsupport.org",
  });
  res.status(200).send("Logged out");
};

const userInfo = async (req, res) => {
  const userEmail = req.user.email;
  console.log(userEmail);
  if (!userEmail) {
    return res.status(400).json({ message: "email is required" });
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
    user = await userService.findUser_cl(userId);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: `caught error: ${err.message}` });
  }

  const response = {
    email: user.emailAddresses[0].emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    slingId: user.publicMetadata.slingId,
    timeZone: user.publicMetadata.timeZone,
    type: user.publicMetadata.type,
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

  const userEmail = msg.email_addresses[0].email_address;
  const userId = msg.id;

  console.log(
    "Message received from clerk via webhook. New user created: ",
    userEmail
  );

  await userService.addPositionsToSyncNewUser(userId);
  await userService.addBasicPropertiesToNewUser(userId, userEmail);

  res.json();
};

const getAllUsers_cl = async (req, res) => {
  const users = await userService.getAllUsers_cl();
  try {
    res.status(200).json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: `caught error: ${err.message}` });
  }
};

export default {
  registerUser,
  loginUser,
  logoutUser,
  userInfo,
  userInfo_cl,
  newClerkUser,
  getAllUsers_cl,
};
