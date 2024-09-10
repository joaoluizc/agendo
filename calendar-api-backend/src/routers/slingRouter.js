import express from 'express';
import slingController from '../controllers/slingController.js';

const slingRouter = express.Router();

slingRouter.get('/positions', async (req, res) => {
  const positions = slingController.getPositions();
  res.status(200).json({ response: positions });
});

slingRouter.get('/users', async (req, res) => {
  const users = slingController.getUsers();
  res.status(200).json({ response: users });
});

slingRouter.get('/calendar/', async (req, res) => {
  const calendar = await slingController.getCalendar();
  res.status(200).json(calendar);
});

export default slingRouter;
