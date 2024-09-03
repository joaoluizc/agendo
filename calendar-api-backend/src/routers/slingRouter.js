import express from 'express';
import SlingService from '../services/slingService.js';
import utils from '../utils/utils.js';

const slingRouter = express.Router();

const slingService = new SlingService();
slingService.init();

slingRouter.get('/positions', async (req, res) => {
  res.status(200).json({ response: slingService.positions });
});

slingRouter.get('/users', async (req, res) => {
  res.status(200).json({ response: slingService.users });
});

slingRouter.get('/calendar/', async (req, res) => {
  const date = req.query.date || utils.todayISO(new Date());
  const calendar = await slingService.fetchTodaysCalendar(date);
  const sortedCalendar = slingService.sortCalendarByUser(calendar);
  res.status(200).json(sortedCalendar);
});

export default slingRouter;
