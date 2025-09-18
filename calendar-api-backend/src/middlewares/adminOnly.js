import { getAuth } from "@clerk/express";
import userService from "../services/userService.js";
import dotenv from "dotenv";
dotenv.config();

export default async function adminOnly(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await userService.findUserByClerkId(userId);
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }
  if (!user || (user && user.type !== "admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
