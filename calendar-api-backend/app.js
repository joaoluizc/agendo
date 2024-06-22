import express from 'express';
import cors from 'cors'
import connectDB from './src/database/db.js'
import gCalendarRouter from './src/controllers/gCalendarController.js';
import slingRouter from './src/controllers/slingController.js';
import userController from './src/controllers/userController.js'

const port = 3001;

const app = express();
app.use(express.json());

const corsOptions = {
    origin: 'http://localhost:5173', // Replace with your client's origin
    optionsSuccessStatus: 200,
  };
app.use(cors(corsOptions));

connectDB();

app.use('/gcalendar', gCalendarRouter);
app.use('/sling', slingRouter);

app.post('/register', userController.registerUser)
app.post('/login', userController.loginUser)

app.get('/', (req, res) => res.status(200).json({message: 'hey there :-))))'}));

app.listen(port, () => {
    console.log(`Calendar api backend running on ${port}`);
});