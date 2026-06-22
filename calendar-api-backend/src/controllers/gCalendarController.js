import dotenv from "dotenv";
import express from "express";
import { google } from "googleapis";
// import cron from "node-cron";
import process from "process";
import gCalendarService from "../services/gCalendarService.js";
import userService from "../services/userService.js";
import utils from "../utils/utils.js";
import { requireAuth } from "@clerk/express";
import adminOnly from "../middlewares/adminOnly.js";

dotenv.config();

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const gCalendarRouter = express.Router();

gCalendarRouter.get("/calendars", requireAuth(), async (req, res) => {
  const tokens = await userService.getGapiToken(req.user.email); // Retrieve tokens from the user service
  if (!tokens) {
    return res.status(401).send("User not authenticated");
  }
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  calendar.calendarList.list({}, (err, response) => {
    if (err) {
      console.log(`[${req.requestId}] Error fetching calendars`, err);
      res.send("Error");
    }
    const calendars = response.data.items;
    res.json(calendars);
  });
});

gCalendarRouter.get("/events", requireAuth(), async (req, res) => {
  console.log(
    `[${req.requestId}] Fetching GCalendar events for ${req.auth.userId}`,
  );
  // const tokens = await userService.getGapiToken(req.user.email);
  const tokens = await userService.getUserGoogleOAuthToken_cl(req.auth.userId);
  if (!tokens) {
    return res.status(401).send("User not Google authenticated");
  }
  const calendarId = req.query.calendar ?? "primary";
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  calendar.events.list(
    {
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    },
    (err, response) => {
      if (err) {
        console.error(`[${req.requestId}] Can't fetch events`, err);
        return res.send("Error");
      }
      console.log(
        `[${req.requestId}] GCal fetch successful: ${response.data.items.length} events`,
      );
      const events = response.data.items;
      res.json(events);
    },
  );
});

/**
 * @openapi
 * /gcalendar/all-events:
 *   get:
 *     summary: Get all Google Calendar events for all users on a specific date (admin only)
 *     tags:
 *       - From google calendar
 *     security:
 *       - clerkAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-06-01"
 *         description: "The date for which to retrieve calendar data using ISO 8601 format. If date is invalid, the current date will be used."
 *     responses:
 *       200:
 *         description: List of events and users with errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       204:
 *         description: No eligible events found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch events
 */
gCalendarRouter.get(
  "/all-events",
  requireAuth(),
  adminOnly,
  async (req, res) => {
    const date = new Date(req.query.date.split("/")[0]);
    console.log(
      `[${req.requestId}] Fetching GCalendar events for ${req.auth.userId} on date ${date}`,
    );
    try {
      const response = await gCalendarService.getAllUsersEvents_cl(
        date,
        req.requestId,
      );
      const events = response.events;
      const usersWithErrors = response.usersWithErrors;

      if (Array.isArray(events) && events.length > 0) {
        console.log(
          `[${req.requestId}] GCal fetch successful for date ${date}: ${events.length} events`,
        );
        res.status(200).json({ events, errors: usersWithErrors });
      } else {
        console.warn(`[${req.requestId}] No eligible events found`);
        res.status(204).json({
          message: "No eligible events found",
          errors: usersWithErrors,
        });
      }
    } catch (error) {
      console.error(
        `[${req.requestId}] Error fetching all user events:`,
        error,
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  },
);

gCalendarRouter.post(
  "/days-shifts-to-gcal",
  requireAuth(),
  adminOnly,
  async (req, res) => {
    const date = req.body.date
      ? utils.todayISO(req.body.date)
      : utils.todayISO(new Date());
    console.log(
      `[${req.requestId}] gCalendarController day's shifts to gcal 1: Adding all shifts to GCal for date ${date}. Request from user ${req.auth.userId}`,
    );
    try {
      const result = await gCalendarService.addDaysShiftsToGcal_cl(
        date,
        req.requestId,
      );
      console.log(
        `[${req.requestId}] gCalendarController day's shifts to gcal 2: Shifts added to GCal for date ${date}`,
      );
      return res.status(result.status).json({
        message: result.message,
        errors: result.usersWithErrors,
      });
    } catch (error) {
      console.error(`[${req.requestId}] Error adding shifts to GCal:`, error);
      return res.status(500).json({ error: "Failed to add shifts to GCal" });
    }
  },
);

gCalendarRouter.post(
  "/user-day-shifts-to-gcal",
  requireAuth(),
  async (req, res) => {
    const date = req.body.date
      ? utils.todayISO(req.body.date)
      : utils.todayISO(new Date());
    const userId = req.auth.userId;

    console.log(
      `[${req.requestId}] gCalendarController user day's shifts to gcal 1: Adding user shifts to GCal for date ${date}. Request from user ${userId}`,
    );

    const user = await userService.findUserByClerkId(userId);
    console.log(
      `[${
        req.requestId
      }] gCalendarController - User found for ${userId}. ${JSON.stringify(
        user,
      )}`,
    );

    try {
      const result = await gCalendarService.addUsersDayShifts(
        user,
        date,
        req.requestId,
      );
      return res.status(result.status).json(result.message);
    } catch (error) {
      console.error(`[${req.requestId}] Error adding shifts to GCal:`, error);
      return res.status(500).json({ error: "Failed to add shifts to GCal" });
    }
  },
);

gCalendarRouter.post(
  "/admin-sync-user-day-shifts",
  requireAuth(),
  adminOnly,
  async (req, res) => {
    const date = req.body.date
      ? utils.todayISO(req.body.date)
      : utils.todayISO(new Date());
    const { userEmail } = req.body;

    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" });
    }

    console.log(
      `[${req.requestId}] gCalendarController admin sync user shifts 1: Syncing shifts for ${userEmail} on date ${date}. Request from admin ${req.auth.userId}`,
    );

    const user = await userService.findUser(userEmail);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      const result = await gCalendarService.addUsersDayShifts(
        user,
        date,
        req.requestId,
      );
      return res.status(result.status).json(result.message);
    } catch (error) {
      console.error(
        `[${req.requestId}] Error syncing user shifts to GCal:`,
        error,
      );
      return res
        .status(500)
        .json({ error: "Failed to sync user shifts to GCal" });
    }
  },
);

gCalendarRouter.get("/", (req, res) =>
  res.status(200).json({ message: "hey there :-))))" }),
);

/**
 * @openapi
 * /gcalendar/all-events-excluding-platform:
 *   get:
 *     summary: Get all Google Calendar events for all users on a specific date, excluding events created by this platform and workingLocation events (admin only)
 *     tags:
 *       - From google calendar
 *     security:
 *       - clerkAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-06-01"
 *         description: "The date for which to retrieve calendar data using ISO 8601 format. If date is invalid, the current date will be used."
 *     responses:
 *       200:
 *         description: List of events and users with errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       204:
 *         description: No eligible events found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch events
 */
gCalendarRouter.get(
  "/all-events-excluding-platform",
  requireAuth(),
  adminOnly,
  async (req, res) => {
    // Handle missing or invalid date parameter
    if (!req.query.date) {
      return res.status(400).json({
        error: "Date parameter is required. Use format: ?date=YYYY-MM-DD",
      });
    }

    let date;
    try {
      // Handle different date formats
      const dateString = req.query.date.includes("/")
        ? req.query.date.split("/")[0]
        : req.query.date;
      date = new Date(dateString);

      // Validate the date
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
      }
    } catch (error) {
      return res.status(400).json({
        error: "Invalid date format. Use YYYY-MM-DD format",
      });
    }

    console.log(
      `[${req.requestId}] Fetching GCalendar events excluding platform-created and workingLocation events for ${req.auth.userId} on date ${date}`,
    );
    try {
      const response =
        await gCalendarService.getAllUsersEventsExcludingPlatform(
          date,
          req.requestId,
        );
      const events = response.events;
      const usersWithErrors = response.usersWithErrors;

      if (Array.isArray(events) && events.length > 0) {
        console.log(
          `[${req.requestId}] GCal fetch successful for date ${date}: ${events.length} events (excluding platform-created and workingLocation events)`,
        );
        res.status(200).json({ events, errors: usersWithErrors });
      } else {
        console.warn(
          `[${req.requestId}] No eligible events found (excluding platform-created and workingLocation events)`,
        );
        res.status(204).json({
          message:
            "No eligible events found (excluding platform-created and workingLocation events)",
          errors: usersWithErrors,
        });
      }
    } catch (error) {
      console.error(
        `[${req.requestId}] Error fetching all user events excluding platform:`,
        error,
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  },
);

export default gCalendarRouter;
