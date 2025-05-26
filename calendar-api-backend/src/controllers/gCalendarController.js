import dotenv from "dotenv";
import express from "express";
import { google } from "googleapis";
// import cron from "node-cron";
import process from "process";
import gCalendarService from "../services/gCalendarService.js";
import userService from "../services/userService.js";
import utils from "../utils/utils.js";
import { requireAuth } from "@clerk/express";
import { sendCookies } from "../middlewares/sendCookies.js";
import adminOnly from "../middlewares/adminOnly.js";

dotenv.config();

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const gCalendarRouter = express.Router();

// const getOAuth2Client = (tokens) => {
//   const oauth2Client = new google.auth.OAuth2(
//     process.env.CLIENT_ID,
//     process.env.SECRET_ID,
//     process.env.REDIRECT
//   );
//   oauth2Client.setCredentials(tokens);
//   return oauth2Client;
// };

// gCalendarRouter.get("/login", async (req, res) => {
//   console.log(
//     `[${req.requestId}] GCalendar login 1.1: Authenticating user with Google OAuth2`
//   );
//   const oauth2Client = new google.auth.OAuth2(
//     process.env.CLIENT_ID,
//     process.env.SECRET_ID,
//     process.env.REDIRECT
//   );

//   const url = oauth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: SCOPES,
//   });
//   console.log(
//     `[${req.requestId}] GCalendar login 1.3: Redirecting user to Google OAuth2 login page: ${url}`
//   );
//   res.status(200).json({ ssoUrl: url });
// });

// gCalendarRouter.get("/redirect", async (req, res) => {
//   console.log(
//     `[${req.requestId}] GCalendar login 2.1: Starting callback processes for Google OAuth2 login`
//   );
//   const code = req.query.code;
//   console.log(
//     `[${req.requestId}] GCalendar login 2.2: Received code ${code} from Google OAuth2 login page`
//   );

//   const oauth2Client = new google.auth.OAuth2(
//     process.env.CLIENT_ID,
//     process.env.SECRET_ID,
//     process.env.REDIRECT
//   );
//   let userTokens;
//   let agendoUser;
//   let profile;
//   oauth2Client.getToken(code, async (err, tokens) => {
//     if (err) {
//       console.log(
//         `[${req.requestId}] GCalendar login error: Couldn't get token`,
//         err
//       );
//       return res.send("Error");
//     }
//     console.log(
//       `[${
//         req.requestId
//       }] GCalendar login 2.6: Received tokens for user ${JSON.stringify(
//         tokens
//       )}`
//     );
//     oauth2Client.setCredentials(tokens);
//     userTokens = tokens;
//     try {
//       profile = await gCalendarService.getUserInfo(userTokens, req.requestId);
//       agendoUser = await userService.findUser(profile.email);
//     } catch (e) {
//       console.error(`[${req.requestId}] Error fetching user profile:`, e);
//       return res.status(500).send("Error");
//     }
//     if (!agendoUser) {
//       console.log(
//         `[${req.requestId}] Google auth user not found: Creating account for ${profile.email}`
//       );
//       const slingId = await utils.getSlingIdByEmail(profile.email);
//       const user = {
//         email: profile.email,
//         firstName: profile.given_name,
//         lastName: profile.family_name,
//         slingId,
//       };
//       try {
//         await userService.createUser(user);
//         await userService.addGapiToken(profile.email, userTokens);
//         console.log(
//           `[${req.requestId}] GCalendar login 2.3: User ${profile.email} authenticated with Google OAuth2. Redirecting back to frontend on ${process.env.REDIRECT_FRONTEND}`
//         );
//       } catch (e) {
//         console.error(
//           `[${req.requestId}] Error creating user or saving token:`,
//           e
//         );
//         return res.status(500).send("Error");
//       }
//     }
//     if (agendoUser && (tokens?.access_token || tokens?.refresh_token)) {
//       await userService.addGapiToken(profile.email, userTokens);
//       console.log(
//         `[${req.requestId}] GCalendar login 2.4: User ${profile.email} authenticated with Google OAuth2. Redirecting back to frontend on ${process.env.REDIRECT_FRONTEND}`
//       );
//     }
//     req.body = { email: profile.email };
//     sendCookies(req, res);
//   });
// });

//updated to use Clerk

// gCalendarRouter.get("/userinfo", requireAuth(), async (req, res) => {
//   console.log(
//     `[${req.requestId}] UserInfo 1: Fetching user info for ${req.auth.userId}`
//   );
//   const tokens = await userService.getUserGoogleOAuthToken_cl(req.auth.userId);
//   // const tokens = await userService.getGapiToken(req.user.email);
//   if (!tokens) {
//     console.log(
//       `[${req.requestId}] UserInfo 2: User ${req.user.email} not authenticated with Google`
//     );
//     return res.status(204).send("User not authenticated with Google");
//   }
//   const data = await gCalendarService.getUserInfo(tokens, req.requestId);
//   console.log(
//     `[${req.requestId}] UserInfo 3: User info fetched for ${req.user.email}`
//   );
//   res.status(200).json(data);
// });

// gCalendarRouter.post("/disconnect", requireAuth(), async (req, res) => {
//   console.log(
//     `[${req.requestId}] Disconnecting user ${req.user.email} from Google OAuth2`
//   );
//   await userService.addGapiToken(req.user.email, null);
//   console.log(
//     `[${req.requestId}] User ${req.user.email} disconnected from Google OAuth2`
//   );
//   res.status(200).send("Disconnected");
// });

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
    `[${req.requestId}] Fetching GCalendar events for ${req.auth.userId}`
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
        `[${req.requestId}] GCal fetch successful: ${response.data.items.length} events`
      );
      const events = response.data.items;
      res.json(events);
    }
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
      `[${req.requestId}] Fetching GCalendar events for ${req.auth.userId} on date ${date}`
    );
    try {
      const response = await gCalendarService.getAllUsersEvents_cl(
        date,
        req.requestId
      );
      const events = response.events;
      const usersWithErrors = response.usersWithErrors;

      if (Array.isArray(events) && events.length > 0) {
        console.log(
          `[${req.requestId}] GCal fetch successful for date ${date}: ${events.length} events`
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
        error
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  }
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
      `[${req.requestId}] gCalendarController day's shifts to gcal 1: Adding all shifts to GCal for date ${date}. Request from user ${req.auth.firstName}`
    );
    try {
      const result = await gCalendarService.addDaysShiftsToGcal_cl(
        date,
        req.requestId
      );
      console.log(
        `[${req.requestId}] gCalendarController day's shifts to gcal 2: Shifts added to GCal for date ${date}`
      );
      return res.status(result.status).json({
        message: result.message,
        errors: result.usersWithErrors,
      });
    } catch (error) {
      console.error(`[${req.requestId}] Error adding shifts to GCal:`, error);
      return res.status(500).json({ error: "Failed to add shifts to GCal" });
    }
  }
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
      `[${req.requestId}] gCalendarController user day's shifts to gcal 1: Adding user shifts to GCal for date ${date}. Request from user ${userId}`
    );

    const user = await userService.findUser_cl(userId);
    console.log(
      `[${
        req.requestId
      }] gCalendarController - User found for ${userId}. ${JSON.stringify(
        user
      )}`
    );

    try {
      const result = await gCalendarService.addUsersDayShifts_cl(
        user,
        date,
        req.requestId
      );
      return res.status(result.status).json(result.message);
    } catch (error) {
      console.error(`[${req.requestId}] Error adding shifts to GCal:`, error);
      return res.status(500).json({ error: "Failed to add shifts to GCal" });
    }
  }
);

gCalendarRouter.get("/", (req, res) =>
  res.status(200).json({ message: "hey there :-))))" })
);

// // Cron job to check and refresh gapi tokens every 30 minutes
// cron.schedule("*/30 * * * *", async () => {
//   console.log("Running cron job to check and refresh tokens");
//   const users = await userService.getAllUsersWithTokens();
//   users.forEach(async (user) => {
//     const { email, tokens } = user;
//     const oauth2Client = getOAuth2Client(tokens);

//     // Check if the token is about to expire in the next 10 minutes
//     const expirationTime = tokens.expiry_date;
//     const currentTime = new Date().getTime();
//     const sixtyMinutes = 60 * 60 * 1000;

//     if (expirationTime - currentTime < sixtyMinutes) {
//       console.log(`Refreshing token for user: ${email}`);
//       oauth2Client.refreshAccessToken(async (err, newTokens) => {
//         if (err) {
//           console.error(`Error refreshing token for user: ${email}`, err);
//         } else {
//           try {
//             await userService.addGapiToken(email, newTokens);
//           } catch (e) {
//             console.error(`Error saving new token for user: ${email}`, e);
//             return;
//           }
//           console.log(`Token refreshed for user: ${email}`);
//         }
//       });
//     }
//   });
// });

export default gCalendarRouter;
