import express from 'express';
import session from 'express-session';
import cors from 'cors'
import cookieParser from 'cookie-parser';
import process from 'process'

import connectDB from './src/database/db.js'
import userRouter from './src/routers/userRouter.js';
import gCalendarRouter from './src/controllers/gCalendarController.js';
import slingRouter from './src/routers/slingRouter.js'
import positionRouter from './src/routers/positionRouters.js';
import verifyUserAuth from './src/middlewares/verifyUserAuth.js';
import seedPositions from './src/database/seeds/seedPositions.js';

const port = process.env.PORT || 3001;

const corsOrigin = process.env.NODE_ENV === 'production' ? 'https://agendo-navy.vercel.app' : 'agendo-git-event-switchup-gcal-joao-luizs-projects-3655b273.vercel.app';

const app = express();
app.use(express.json());
app.use(cookieParser());
const corsOptions = {
  origin: corsOrigin,
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }, // Set to true if using HTTPS
  proxy: true,
}));
app.use(cors(corsOptions));

connectDB();

await seedPositions();

app.use('/gcalendar', gCalendarRouter);
app.use('/sling', verifyUserAuth, slingRouter);
app.use('/position', verifyUserAuth, positionRouter);
app.use('/user', userRouter);

app.get('/auth-check', verifyUserAuth, (req, res) => res.status(200).json({message: 'authenticated'}));

app.get('/', (req, res) => res.status(200).json({message: 'hey there :-))))'}));

app.listen(port, () => {
    console.log(`Calendar api backend running on ${port}`);
});