import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";

const userRouter = express.Router();

userRouter.post("/register", userController.registerUser);
userRouter.post("/login", userController.loginUser);
userRouter.post("/logout", userController.logoutUser);
userRouter.get("/info", requireAuth, userController.userInfo);
userRouter.post("/clerk/new", userController.newClerkUser);

export default userRouter;
