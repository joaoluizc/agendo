import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "@clerk/express";

const userRouter = express.Router();

userRouter.get("/info", requireAuth(), userController.getMyProfile);
userRouter.get("/all", requireAuth(), userController.getAllUsers);
userRouter.post("/clerk/new", userController.newClerkUser);

export default userRouter;
