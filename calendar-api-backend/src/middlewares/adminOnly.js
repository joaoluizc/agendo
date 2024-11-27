import { getAuth } from "@clerk/express";
import userService from "../services/userService.js";

export default async function adminOnly(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await userService.findUser_cl(userId);
  if (user.publicMetadata.type !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
