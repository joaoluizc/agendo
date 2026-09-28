import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";
import adminOnly from "../middlewares/adminOnly.js";

const userRouter = express.Router();

userRouter.get("/info", requireAuth(), userController.getMyProfile);
userRouter.get("/all", requireAuth(), userController.getAllUsers);
userRouter.post("/clerk/new", userController.newClerkUser);
// Manager-only notes about an agent, keyed by the agent's Clerk id. Read back through
// the admin shape of /all.
userRouter.put(
  "/:clerkId/preferences",
  requireAuth(),
  adminOnly,
  userController.setUserPreferences,
);

export default userRouter;
