import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";
// import verifyUserAuth from "../middlewares/verifyUserAuth.js";
import userService from "../services/userService.js";

const userRouter = express.Router();

// userRouter.post("/register", userController.registerUser);
// userRouter.post("/login", userController.loginUser);
// userRouter.post("/logout", userController.logoutUser);
// userRouter.get("/info", verifyUserAuth, userController.userInfo);
userRouter.get("/info", requireAuth(), userController.userInfo_cl);
userRouter.get("/all", requireAuth(), userController.getAllUsers_cl);
userRouter.post("/clerk/new", userController.newClerkUser);
userRouter.post("/add-clerk-id-to-all-users", requireAuth(), userService.addClerkIdToAllUsers);
userRouter.post("/add-all-new-users-to-clerk", requireAuth(), userService.addNewClerkUsersToMongo);

export default userRouter;
