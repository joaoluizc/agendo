import express from 'express';
import cors from 'cors'
import cookieParser from 'cookie-parser';

import connectDB from './src/database/db.js'
import gCalendarRouter from './src/controllers/gCalendarController.js';
import slingRouter from './src/routers/slingRouter.js'
import positionRouter from './src/routers/positionRouters.js';
import userController from './src/controllers/userController.js'
import verifyUserAuth from './src/middlewares/verifyUserAuth.js';
import seedPositions from './src/database/seeds/seedPositions.js';

const port = 3001;

const app = express();
app.use(express.json());
app.use(cookieParser());
const corsOptions = {
  origin: 'http://localhost:3001',
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(cors(corsOptions));

connectDB();

await seedPositions();

app.use('/gcalendar', verifyUserAuth, gCalendarRouter);
app.use('/sling', verifyUserAuth, slingRouter);
app.use('/position', verifyUserAuth, positionRouter);

app.post('/register', userController.registerUser)
app.post('/login', userController.loginUser)
app.post('/logout', userController.logoutUser)
app.get('/auth-check', verifyUserAuth, (req, res) => res.status(200).json({message: 'authenticated'}));

app.get('/', (req, res) => res.status(200).json({message: 'hey there :-))))'}));

app.listen(port, () => {
    console.log(`Calendar api backend running on ${port}`);
});