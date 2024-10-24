import dotenv from "dotenv";
import slingController from "../controllers/slingController.js";
import gCalendarService from "../services/gCalendarService.js";
import userService from "./userService.js";
import utils from "../utils/utils.js";
import { google } from "googleapis";
import process from "process";
import addedGCalEventsService from "./addedGCalEventsService.js";

dotenv.config();

const getOAuth2Client = (tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.SECRET_ID,
    process.env.REDIRECT
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getUserTokens = async (user) => {
  if (user?.tokens) {
    return user.tokens;
  } else if (user?.gapitoken) {
    return user.gapitoken;
  }
  return await userService.getGapiToken(user.email);
};

const getUserInfo = async (tokens, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Fetching user info`);
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    }
  );
  return await response.json();
};

const getUserEvents = async (
  email,
  date = new Date(),
  requestId = "req-id-nd"
) => {
  console.log(`[${requestId}] - Fetching user events`);
  const tokens = await userService.getGapiToken(email); // Retrieve tokens from the user service
  if (!tokens) {
    throw new Error("User not Google authenticated");
  }

  const calendarId = "primary";
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  return new Promise((resolve, reject) => {
    calendar.events.list(
      {
        calendarId,
        // set date to beginning of day
        timeMin: selectedDate.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      },
      (err, response) => {
        if (err) {
          console.log(`[${requestId}] - Can't fetch events`, err);
          reject(err);
        } else {
          const events = response.data.items;
          resolve(events);
        }
      }
    );
  });
};

const getAllUsersEvents = async (date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Fetching all users events`);
  const users = await userService.getAllUsersWithTokens();

  const allEventsPromises = users.map(async (user) => {
    const { email, slingId } = user;
    const events = await getUserEvents(email, date, requestId);
    return { email, slingId, events };
  });

  const allEvents = await Promise.all(allEventsPromises);
  return allEvents;
};

const addEvent = async (user, event, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding event`);
  const tokens = await getUserTokens(user);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const addedEvent = await new Promise((resolve, reject) => {
    calendar.events.insert(
      {
        calendarId: "primary",
        resource: event,
      },
      (err, response) => {
        if (err) {
          console.log(`[${requestId}] - Error adding event`, err);
          reject(err);
        } else {
          resolve(response);
        }
      }
    );
  });
  return addedEvent.data;
};

const addEvents = async (user, events, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding multiple events`);
  const tokens = await getUserTokens(user);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const eventsPromises = events.map(async (event) => {
    return new Promise((resolve, reject) => {
      calendar.events.insert(
        {
          calendarId: "primary",
          resource: event,
        },
        (err, response) => {
          if (err) {
            console.log(`[${requestId}] - Error adding event`, err);
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  });

  return Promise.all(eventsPromises);
};

const deleteEvents = async (user, events, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Deleting events`);
  const tokens = await getUserTokens(user);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const eventsPromises = events.map(async (event) => {
    return new Promise((resolve, reject) => {
      calendar.events.delete(
        {
          calendarId: "primary",
          eventId: event.id,
        },
        (err, response) => {
          if (err) {
            console.log(`[${requestId}] - Error deleting event`, err);
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  });

  return Promise.all(eventsPromises);
};

const addDaysShiftsToGcal = async (date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding day's shifts to GCal`);
  let usersWithChanges = [];
  let numberOfAddedEvents = 0;
  try {
    const calendar = await slingController.getCalendar(date);
    console.log(
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`
    );
    const usersWithGoogle = await userService.getAllUsersWithTokens();
    console.log(
      `[${requestId}] - Found ${usersWithGoogle.length} users authenticated with Google`
    );

    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    console.log(
      `[${requestId}] - Found ${prevAddedEventsByUsers.length} users with events previously added for date ${date}`
    );

    await Promise.all(
      usersWithGoogle.map(async (user) => {
        const slingUser = calendar.filter(
          (slingUserCal) => Number(slingUserCal.id) === Number(user.slingId)
        )[0];
        if (!slingUser) {
          console.log(
            `[${requestId}] - Found no shifts for user ${user.email}, no event was added to calendar`
          );
          return;
        }
        const userShifts = slingUser.shifts;
        console.log(
          `[${requestId}] - Found ${userShifts.length} shifts for user ${user.email}`
        );

        const prevAddedEventsForUser = prevAddedEventsByUsers.find(
          (prevAddedEvent) => prevAddedEvent?.userId === user?.id
        );
        if (prevAddedEventsForUser) {
          // delete events from GCal
          console.log(
            `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} events for user ${user.email} on date ${date}`
          );
          try {
            await deleteEvents(user, prevAddedEventsForUser.events, requestId);
            await addedGCalEventsService.deleteEvents(
              user.id,
              prevAddedEventsForUser.events,
              requestId
            );
          } catch (e) {
            console.log(
              `[${requestId}] - Error deleting events for user ${user.email} on date ${date}. Error Message: ${e}`
            );
          }
        }

        console.log(
          `[${requestId}] - Filtering shifts for ${user.email} to what user wants to sync`
        );
        const positionsToSync = user.positionsToSync.map((position) =>
          position.positionId.toString()
        );
        const shiftsToAdd = userShifts.filter((event) =>
          positionsToSync.includes(event.position.id.toString())
        );
        const userEvents = shiftsToAdd.map((shift) =>
          utils.shiftToEvent(shift)
        );

        console.log(
          `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`
        );
        usersWithChanges.push({ email: user.email, addedEvents: userEvents });
        numberOfAddedEvents += userEvents.length;
        const addedEvents = await Promise.all(
          userEvents.map(
            async (event) => await addEvent(user, event, requestId)
          )
        );
        await addedGCalEventsService.addEvents(user, addedEvents, requestId);
        console.log(`[${requestId}] - ${addedEvents?.length} event(s) added`);
      })
    );
    if (numberOfAddedEvents?.length === 0 && usersWithChanges?.length === 0) {
      return { status: 200, message: "No shifts eligible to be added to GCal" };
    }
    return {
      status: 200,
      message: `${numberOfAddedEvents} shifts added to GCal for ${usersWithChanges.length} users`,
      addedEvents: usersWithChanges,
    };
  } catch (e) {
    console.log(`[${requestId}] - Error adding shifts to GCal: `, e.message);
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

const addUsersDayShifts = async (user, date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding user's day shifts to GCal`);
  try {
    const calendar = await slingController.getCalendar(date);
    console.log(
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`
    );

    const slingUser = calendar.find(
      (slingUserCal) => Number(slingUserCal.id) === Number(user.slingId)
    );
    if (!slingUser) {
      console.log(
        `[${requestId}] - Found no shifts for user ${user.email}, no event was added to calendar`
      );
      return {
        status: 200,
        message: `Found no shifts for user ${user.email}, no event was added to calendar`,
      };
    }
    const userShifts = slingUser.shifts;
    console.log(
      `[${requestId}] - Found ${userShifts.length} shifts for user ${user.email}`
    );

    console.log(
      `[${requestId}] - Filtering shifts for ${user.email} to what user wants to sync`
    );
    const positionsToSync = user.positionsToSync.map((position) =>
      position.positionId.toString()
    );
    const shiftsToAdd = userShifts.filter((event) =>
      positionsToSync.includes(event.position.id.toString())
    );
    const userEvents = shiftsToAdd.map((shift) => utils.shiftToEvent(shift));

    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    const prevAddedEventsForUser = prevAddedEventsByUsers.find(
      (prevAddedEvent) => prevAddedEvent?.userId === user?.id
    );
    if (prevAddedEventsForUser) {
      console.log(
        `[${requestId}] - Deleting ${prevAddedEventsForUser.events?.length} events for user ${user.email} on date ${date}.`
      );
      try {
        await deleteEvents(user, prevAddedEventsForUser.events, requestId);
        await addedGCalEventsService.deleteEvents(
          user.id,
          prevAddedEventsForUser.events,
          requestId
        );
      } catch (e) {
        console.log(
          `[${requestId}] - Error deleting events for user ${user.email} on date ${date}. Error Message: ${e}`
        );
      }
    }

    console.log(
      `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`
    );
    const addedEvents = await Promise.all(
      userEvents.map(
        async (event) => await gCalendarService.addEvent(user, event, requestId)
      )
    );
    await addedGCalEventsService.addEvents(user, addedEvents, requestId);
    console.log(`[${requestId}] - ${addedEvents?.length} event(s) added`);
    return {
      status: 200,
      message: `${addedEvents.length} shifts added to GCal for ${user.email}`,
      addedEvents,
    };
  } catch (e) {
    console.log(`[${requestId}] - Error adding shifts to GCal: `, e.message);
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

export default {
  getUserInfo,
  getUserEvents,
  getAllUsersEvents,
  addEvent,
  addEvents,
  addDaysShiftsToGcal,
  addUsersDayShifts,
  deleteEvents,
};
