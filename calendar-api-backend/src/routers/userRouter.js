import express from 'express';
import userController from '../controllers/userController.js';
import verifyUserAuth from '../middlewares/verifyUserAuth.js'

const userRouter = express.Router();

userRouter.post('/register', userController.registerUser);
userRouter.post('/login', userController.loginUser);
userRouter.post('/logout', userController.logoutUser);
userRouter.get('/info', verifyUserAuth, userController.userInfo);

export default userRouter;