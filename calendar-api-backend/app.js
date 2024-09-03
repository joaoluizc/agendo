import express from 'express';
import cors from 'cors'
import cookieParser from 'cookie-parser';

import connectDB from './src/database/db.js'
import gCalendarRouter from './src/controllers/gCalendarController.js';
import slingRouter from './src/services/slingService.js';
import positionRouter from './src/routers/positionRouters.js';
import userController from './src/controllers/userController.js'
import verifyUserAuthentication from './src/middlewares/verifyUserAuthentication.js';
import seedPositions from './src/seeds/seedPositions.js';

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

app.use('/gcalendar', verifyUserAuthentication, gCalendarRouter);
app.use('/sling', verifyUserAuthentication, slingRouter);
app.use('/position', verifyUserAuthentication, positionRouter);

app.post('/register', userController.registerUser)
app.post('/login', userController.loginUser)
app.post('/logout', userController.logoutUser)
app.get('/auth-check', verifyUserAuthentication, (req, res) => res.status(200).json({message: 'authenticated'}));

app.get('/', (req, res) => res.status(200).json({message: 'hey there :-))))'}));

app.listen(port, () => {
    console.log(`Calendar api backend running on ${port}`);
});