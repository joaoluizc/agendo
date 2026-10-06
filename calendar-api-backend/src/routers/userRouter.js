import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";
import adminOnly from "../middlewares/adminOnly.js";

const userRouter = express.Router();

userRouter.get("/info", requireAuth(), userController.getMyProfile);
userRouter.get("/all", requireAuth(), userController.getAllUsers);
userRouter.post("/clerk/new", userController.newClerkUser);
// An agent's own timezone. Self-service on purpose — needing an admin is how the field
// stayed on its default for everyone. Agendo's MCP server renders every time in this
// value, so until it is set a time is labelled UTC because that is what it honestly is.
userRouter.put("/me/timezone", requireAuth(), userController.setMyTimezone);

// An admin sets anyone's timezone. Gated server-side, not only in the UI.
userRouter.put(
  "/:clerkId/timezone",
  requireAuth(),
  adminOnly,
  userController.setUserTimezoneById,
);

// Manager-only notes about an agent, keyed by the agent's Clerk id. Read back through
// the admin shape of /all.
userRouter.put(
  "/:clerkId/preferences",
  requireAuth(),
  adminOnly,
  userController.setUserPreferences,
);

export default userRouter;
