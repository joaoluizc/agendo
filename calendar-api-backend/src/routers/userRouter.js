import express from "express";
import userController from "../controllers/userController.js";
import requireSession from "../middlewares/requireSession.js";
import adminOnly from "../middlewares/adminOnly.js";
import { requireAdmin, signedIn, webhookRoute } from "../middlewares/requirePermission.js";

const userRouter = express.Router();

userRouter.get("/info", signedIn, requireSession, userController.getMyProfile);
userRouter.get("/all", signedIn, requireSession, userController.getAllUsers);
// What can be granted, with labels and descriptions — the admin access editor renders
// from this. Product copy only, so any signed-in user may read it.
userRouter.get(
  "/permission-registry",
  signedIn,
  requireSession,
  userController.getPermissionRegistry,
);
userRouter.post("/clerk/new", webhookRoute, userController.newClerkUser);
// An agent's own timezone. Self-service on purpose — needing an admin is how the field
// stayed on its default for everyone. Agendo's MCP server renders every time in this
// value, so until it is set a time is labelled UTC because that is what it honestly is.
userRouter.put("/me/timezone", signedIn, requireSession, userController.setMyTimezone);

// An admin sets anyone's timezone. Gated server-side, not only in the UI.
userRouter.put(
  "/:clerkId/timezone",
  requireAdmin,
  requireSession,
  adminOnly,
  userController.setUserTimezoneById,
);

// Manager-only notes about an agent, keyed by the agent's Clerk id. Read back through
// the admin shape of /all.
userRouter.put(
  "/:clerkId/preferences",
  requireAdmin,
  requireSession,
  adminOnly,
  userController.setUserPreferences,
);

export default userRouter;
