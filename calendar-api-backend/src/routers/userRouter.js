import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";
// import verifyUserAuth from "../middlewares/verifyUserAuth.js";

const userRouter = express.Router();

userRouter.post("/register", userController.registerUser);
userRouter.post("/login", userController.loginUser);
userRouter.post("/logout", userController.logoutUser);
// userRouter.get("/info", verifyUserAuth, userController.userInfo);
userRouter.get("/info", requireAuth(), userController.userInfo_cl);
userRouter.get("/all", userController.getAllUsers_cl);
userRouter.post("/clerk/new", userController.newClerkUser);

export default userRouter;
