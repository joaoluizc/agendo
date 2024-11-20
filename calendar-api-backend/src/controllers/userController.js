import userService from "../services/userService.js";
import bcrypt from "bcrypt";
import { sendCookies } from "../middlewares/sendCookies.js";
import process from "process";
import { Webhook } from "svix";

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

const newClerkUser = async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_NEW_USER_CREATED_SECRET;
  const svixHeaders = req.headers;
  const payload = req.body;

  console.log("Secret:", secret);
  console.log("Svix Headers:", svixHeaders);
  console.log("Payload:", payload);

  const wh = new Webhook(secret);
  let msg;
  try {
    msg = wh.verify(svixHeaders, payload);
    console.log("Verified message:", msg);
  } catch (e) {
    console.error("Verification error:", e);
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log(
    "Message received from clerk via webhook. New user created:",
    msg.payload
  );

  res.json();
};

export default {
  registerUser,
  loginUser,
  logoutUser,
  userInfo,
  newClerkUser,
};
