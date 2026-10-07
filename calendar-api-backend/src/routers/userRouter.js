import express from "express";
import userController from "../controllers/userController.js";
import { requireAdmin, signedIn, webhookRoute } from "../middlewares/requirePermission.js";

const userRouter = express.Router();

userRouter.get("/info", signedIn, userController.getMyProfile);
userRouter.get("/all", signedIn, userController.getAllUsers);
// What can be granted, with labels and descriptions — the admin access editor renders
// from this. Product copy only, so any signed-in user may read it.
userRouter.get(
  "/permission-registry",
  signedIn,
  userController.getPermissionRegistry,
);
userRouter.post("/clerk/new", webhookRoute, userController.newClerkUser);
// An agent's own timezone. Self-service on purpose — needing an admin is how the field
// stayed on its default for everyone. Agendo's MCP server renders every time in this
// value, so until it is set a time is labelled UTC because that is what it honestly is.
userRouter.put("/me/timezone", signedIn, userController.setMyTimezone);

// An admin sets anyone's timezone. Gated server-side, not only in the UI.
userRouter.put(
  "/:clerkId/timezone",
  requireAdmin,
  userController.setUserTimezoneById,
);

// An admin grants or revokes someone's access (area levels, admin flag). The rules —
// not yourself, not the last admin — are in permissions/accessChange.js.
userRouter.put(
  "/:clerkId/permissions",
  requireAdmin,
  userController.setUserPermissions,
);

// Manager-only notes about an agent, keyed by the agent's Clerk id. Read back through
// the admin shape of /all.
userRouter.put(
  "/:clerkId/preferences",
  requireAdmin,
  userController.setUserPreferences,
);

export default userRouter;
