import express from "express";
import slingController from "../controllers/slingController.js";

const slingRouter = express.Router();

/**
 * @openapi
 * /sling/positions:
 *   get:
 *     summary: Retrieve a list of positions.
 *     tags:
 *       - From sling
 *     responses:
 *       200:
 *         description: A list of positions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: array
 *                   items:
 *                     type: object
 */
slingRouter.get("/positions", async (req, res) => {
  const positions = slingController.getPositions();
  res.status(200).json({ response: positions });
});

/**
 * @openapi
 * /sling/users:
 *   get:
 *     summary: Retrieve a list of users.
 *     tags:
 *       - From sling
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: array
 *                   items:
 *                     type: object
 */
slingRouter.get("/users", async (req, res) => {
  const users = slingController.getUsers();
  res.status(200).json({ response: users });
});

/**
 * @openapi
 * /sling/calendar:
 *   get:
 *     summary: Retrieve calendar data from sling for a specific date.
 *     tags:
 *       - From sling
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *         required: true
 *         description: The date for which to retrieve calendar data using ISO 8601 format. If date is invalid, the current date will be used.
 *     responses:
 *       200:
 *         description: Calendar data for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
slingRouter.get("/calendar/", async (req, res) => {
  console.log("calendar route hit");
  const date = req.query.date;
  const calendar = await slingController.getCalendar(date);
  res.status(200).json(calendar);
});

export default slingRouter;
