// TRIP CALENDAR — Express router exposing GET /trip-calendar.
// To remove: delete this file, src/controllers/tripCalendarController.js, and the two trip-calendar lines in app.js.

import express from "express";
import { getTripCalendar } from "../controllers/tripCalendarController.js";

const router = express.Router();

router.get("/", getTripCalendar);

export default router;
