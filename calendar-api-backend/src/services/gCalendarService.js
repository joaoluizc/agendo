import dotenv from "dotenv";
import slingController from "../controllers/slingController.js";
import userService from "./userService.js";
import utils from "../utils/utils.js";
import { google } from "googleapis";
import process from "process";
import addedGCalEventsService from "./addedGCalEventsService.js";
import { newShiftToEvent } from "../utils/newShiftToEvent.js";

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
  console.log(`[${requestId}] - Fetching user events for ${email}`);
  const tokens = await userService.getGapiToken(email); // Retrieve tokens from the user service
  if (!tokens) {
    throw new Error(`User ${email} not Google authenticated`);
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
          console.log(`[${requestId}] - Can't fetch events for ${email}`, err);
          reject(err);
        } else {
          const events = response.data.items;
          resolve(events);
        }
      }
    );
  });
};

async function getUserEvents_cl(
  user,
  date = new Date(),
  requestId = "req-id-nd"
) {
  const userId = user.id;
  const tokens = user.GoogleAccessToken;

  if (!tokens) {
    throw new Error(`User ${userId} not Google authenticated`);
  }

  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  return new Promise((resolve, reject) => {
    calendar.events.list(
      {
        calendarId: "primary",
        // set date to beginning of day
        timeMin: selectedDate.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      },
      (err, response) => {
        if (err) {
          console.log(`[${requestId}] - Can't fetch events for ${userId}`, err);
          reject(err);
        } else {
          const events = response.data.items;
          resolve(events);
        }
      }
    );
  });
}

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

const getAllUsersEvents_cl = async (date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Fetching all users events`);
  const users = await userService.getAllUsersWithTokens_cl();

  let usersWithErrors = [];

  const allEventsPromises = users.map(async (user) => {
    const slingId = user.publicMetadata.slingId;
    const userId = user.id;

    let events;
    try {
      events = await getUserEvents_cl(user, date, requestId);
    } catch (e) {
      console.log(
        `[${requestId}] - Error fetching events for user ${user.firstName}: `,
        e
      );
      usersWithErrors.push({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        error: e?.errors?.[0]?.message || "Unknown error",
      });
      return {};
    }
    return { userId, slingId, events };
  });

  const allEvents = await Promise.all(allEventsPromises);
  const allEventsFiltered = allEvents.filter((event) => event.events);
  return { events: allEventsFiltered, usersWithErrors };
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
          console.log(
            `[${requestId}] - Error adding event to user ${user.email}`,
            err
          );
          reject(err);
        } else {
          resolve(response);
        }
      }
    );
  });
  return addedEvent.data;
};

const addEvent_cl = async (user, event, requestId = "req-id-nd") => {
  console.log(
    `[${requestId}] - Adding event to user ${user.firstName}: `,
    JSON.stringify(event)
  );
  const tokens = await userService.getUserGoogleOAuthToken_cl(user.id);
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
          console.error(
            `[${requestId}] - Error adding event to user ${user.firstName}`,
            err
          );
          reject(err);
        } else {
          resolve(response);
        }
      }
    );
  });
  console.log(
    `[${requestId}] - Event added to user ${user.firstName}`,
    JSON.stringify(addedEvent.data)
  );
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

  return await Promise.all(eventsPromises);
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

const deleteEvents_cl = async (user, events, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Deleting events`);
  console.log(`[${requestId}] - Deleting events for user ${user.id}`);
  const tokens = await userService.getUserGoogleOAuthToken_cl(user.id);
  console.log(`[${requestId}] - Tokens: ${JSON.stringify(tokens)}`);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const eventsPromises = events.map(async (event) => {
    console.log(`[${requestId}] - Deleting event ${event.id}`);
    return new Promise((resolve, reject) => {
      calendar.events.delete(
        {
          calendarId: "primary",
          eventId: event.id,
        },
        (err, response) => {
          if (err) {
            if (
              err.errors.message &&
              err.errors.message === "Resource has been deleted"
            ) {
              console.log(
                `[${requestId}] - Event ${event.id} has already been deleted. Event details: ${event.summary}, ${event.start.dateTime} - ${event.end.dateTime}`
              );
            } else {
              console.log(`[${requestId}] - Error deleting event`, err);
            }
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  });

  return await Promise.all(eventsPromises);
};

const updateEvents_cl = async (user, events, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Updating events`);
  const tokens = await userService.getUserGoogleOAuthToken_cl(user.id);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const eventsPromises = events.map(async (event) => {
    return new Promise((resolve, reject) => {
      calendar.events.update(
        {
          calendarId: "primary",
          eventId: event.id,
          resource: event,
        },
        (err, response) => {
          if (err) {
            console.log(`[${requestId}] - Error updating event`, err);
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  });
  await Promise.all(eventsPromises);
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
    console.error(
      `[${requestId}] - Error adding shifts to GCal: `,
      JSON.stringify(e)
    );
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

const addDaysShiftsToGcal_cl = async (date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding day's shifts to GCal`);
  let usersWithChanges = [];
  let numberOfAddedEvents = 0;
  const usersWithErrors = [];
  try {
    const calendar = await slingController.getCalendar(date);
    console.log(
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`
    );
    const usersTokensResponse = await userService.getAllUsersWithTokens_cl();
    const usersWithGoogle = usersTokensResponse.filter((user) => {
      if (!user.GoogleAccessToken) {
        usersWithErrors.push({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          error: "User not Google authenticated",
        });
        return false;
      }
      return true;
    });
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
          (slingUserCal) =>
            Number(slingUserCal.id) === Number(user.publicMetadata.slingId)
        )[0];
        if (!slingUser) {
          console.log(
            `[${requestId}] - Found no shifts for user ${user.firstName}, no event was added to calendar`
          );
          return;
        }
        const userShifts = slingUser.shifts;
        console.log(
          `[${requestId}] - Found ${userShifts.length} shifts for user ${user.firstName}`
        );

        const prevAddedEventsForUser = prevAddedEventsByUsers.find(
          (prevAddedEvent) => prevAddedEvent?.userId === user?.id
        );
        if (prevAddedEventsForUser) {
          // delete events from GCal
          console.log(
            `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} events for user ${user.firstName} on date ${date}`
          );
          try {
            await deleteEvents_cl(
              user,
              prevAddedEventsForUser.events,
              requestId
            );
            await addedGCalEventsService.deleteEvents(
              user.id,
              prevAddedEventsForUser.events,
              requestId
            );
          } catch (e) {
            console.log(
              `[${requestId}] - Error deleting events for user ${user.firstName} on date ${date}. Error Message: ${e}`
            );
          }
        }

        console.log(
          `[${requestId}] - Filtering shifts for ${user.firstName} to what user wants to sync`
        );
        const positionsToSync = user.publicMetadata.positionsToSync.map(
          (position) => position.positionId.toString()
        );
        const shiftsToAdd = userShifts.filter((event) =>
          positionsToSync.includes(event.position.id.toString())
        );
        const userEvents = shiftsToAdd.map((shift) =>
          utils.shiftToEvent(shift)
        );

        console.log(
          `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.firstName} on date ${date}`
        );
        usersWithChanges.push({
          firstName: user.firstName,
          addedEvents: userEvents,
        });
        numberOfAddedEvents += userEvents.length;
        let addedEvents = [];
        try {
          addedEvents = await Promise.all(
            userEvents.map(
              async (event) => await addEvent_cl(user, event, requestId)
            )
          );
          await addedGCalEventsService.addEvents_cl(
            user,
            addedEvents,
            requestId
          );
        } catch (error) {
          console.error(
            `[${requestId}] - Error adding event for user ${user.firstName}: `,
            error.errors[0].message
          );
          usersWithErrors.push({
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            error: error.errors[0].message,
          });
        }
        console.log(`[${requestId}] - ${addedEvents?.length} event(s) added`);
      })
    );
    if (numberOfAddedEvents?.length === 0 && usersWithChanges?.length === 0) {
      return {
        status: 200,
        message: "No shifts eligible to be added to GCal",
        usersWithErrors,
      };
    }
    return {
      status: 200,
      message: `${numberOfAddedEvents} shifts added to GCal for ${usersWithChanges.length} users`,
      addedEvents: usersWithChanges,
      usersWithErrors,
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
      userEvents.map(async (event) => await addEvent(user, event, requestId))
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

const addUsersDayShifts_cl = async (user, date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding user's day shifts to GCal`);
  try {
    const calendar = await slingController.getCalendar(date);
    console.log(
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`
    );

    const slingUser = calendar.find((slingUserCal) => {
      console.log(
        `comparing ${slingUserCal.id} with ${user.publicMetadata.slingId}`
      );
      return Number(slingUserCal.id) === Number(user.publicMetadata.slingId);
    });
    if (!slingUser) {
      console.log(
        `[${requestId}] - Found no shifts for user ${user.firstName}, no event was added to calendar`
      );
      return {
        status: 200,
        message: `Found no shifts for user ${user.firstName}, no event was added to calendar`,
      };
    }
    const userShifts = slingUser.shifts;
    console.log(
      `[${requestId}] - Found ${userShifts.length} shifts for user ${user.firstName}`
    );

    console.log(
      `[${requestId}] - Filtering shifts for ${user.firstName} to what user wants to sync`
    );
    const positionsToSync = user.publicMetadata.positionsToSync.map(
      (position) => position.positionId.toString()
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
        `[${requestId}] - Deleting ${prevAddedEventsForUser.events?.length} events for user ${user.firstName} on date ${date}.`
      );
      try {
        await deleteEvents_cl(user, prevAddedEventsForUser.events, requestId);
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
      `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.firstName} on date ${date}`
    );
    const addedEvents = await Promise.all(
      userEvents.map(async (event) => await addEvent_cl(user, event, requestId))
    );
    await addedGCalEventsService.addEvents_cl(user, addedEvents, requestId);
    console.log(`[${requestId}] - ${addedEvents?.length} event(s) added`);
    return {
      status: 200,
      message: `${addedEvents.length} shifts added to GCal for ${user.firstName}`,
      addedEvents,
    };
  } catch (e) {
    console.log(
      `[${requestId}] - Error adding shifts to GCal: `,
      JSON.stringify(e)
    );
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

const addEventForShift = async (userId, shift, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Starting addEventForShift flow`);

  const user = await userService.findUser_cl(userId);
  if (!shouldSyncShift(user, shift, requestId)) {
    console.log(
      `[${requestId}] - Shift not eligible to be synced. Ending addEventForShift flow.`
    );
    return;
  }

  let event;
  let addedEvent = null;
  try {
    // transform shift into calendar event
    event = await newShiftToEvent(shift);
    // add event to GCal
    addedEvent = await addEvent_cl(user, event, requestId);
    // add event to addedGCalEvents collection
    await addedGCalEventsService.addEvents_cl(user, [addedEvent], requestId);
    console.log(`[${requestId}] - Event added successfully to google calendar`);
  } catch (e) {
    console.error(
      `[${requestId}] - Error adding event to calendar for shift ${shift._id}: `,
      e
    );
  }

  console.log(`[${requestId}] - Ending addEventForShift flow`);

  return addedEvent;
};

function shouldSyncShift(clerkUser, shift, requestId = "req-id-nd") {
  console.log(
    `[${requestId}] - Checking if shift should be synced for user ${clerkUser.id}`
  );
  console.log(
    `[${requestId}] - Details of shift being checked: ${JSON.stringify(
      shift,
      null,
      2
    )}`
  );
  const positionsToSync = clerkUser.publicMetadata.positionsToSync.map(
    (position) => position._id.toString()
  );
  const shouldSync = positionsToSync.includes(shift.positionId.toString());
  console.log(
    `[${requestId}] - Position ${shift.positionId} sync status: ${shouldSync}`
  );
  return shouldSync;
}

/**
 * Get Google Calendar events for all users, excluding events created by this platform
 * @param {Date} date - The date to fetch events for
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} Object containing events and any errors
 */
const getAllUsersEventsExcludingPlatform = async (
  date,
  requestId = "req-id-nd"
) => {
  console.log(
    `[${requestId}] - Fetching all users events excluding platform-created events`
  );

  try {
    // Get all users with Google authentication
    const users = await userService.getAllUsersWithTokens_cl();
    let usersWithErrors = [];

    // Get all platform-created event IDs from the database
    const platformEventIds =
      await addedGCalEventsService.getAllPlatformEventIds(requestId);
    console.log(
      `[${requestId}] - Found ${platformEventIds.length} platform-created event IDs to exclude`
    );

    const allEventsPromises = users.map(async (user) => {
      const slingId = user.publicMetadata.slingId;
      const userId = user.id;

      let events;
      try {
        // Fetch events from Google Calendar
        events = await getUserEvents_cl(user, date, requestId);

        // Filter out platform-created events
        const filteredEvents = events.filter((event) => {
          return !platformEventIds.includes(event.id);
        });

        console.log(
          `[${requestId}] - User ${user.firstName}: ${events.length} total events, ${filteredEvents.length} after filtering platform events`
        );

        return { userId, slingId, events: filteredEvents };
      } catch (e) {
        console.log(
          `[${requestId}] - Error fetching events for user ${user.firstName}: `,
          e
        );
        usersWithErrors.push({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          error: e?.errors?.[0]?.message || "Unknown error",
        });
        return {};
      }
    });

    const allEvents = await Promise.all(allEventsPromises);
    const allEventsFiltered = allEvents.filter((event) => event.events);

    console.log(
      `[${requestId}] - Successfully fetched events for ${allEventsFiltered.length} users, excluding platform-created events`
    );

    return { events: allEventsFiltered, usersWithErrors };
  } catch (error) {
    console.error(
      `[${requestId}] - Error in getAllUsersEventsExcludingPlatform:`,
      error
    );
    throw error;
  }
};

export default {
  getUserInfo,
  getUserEvents,
  getAllUsersEvents,
  addEvent,
  addEvent_cl,
  addEvents,
  updateEvents_cl,
  deleteEvents_cl,
  addEventForShift,
  addDaysShiftsToGcal,
  addDaysShiftsToGcal_cl,
  addUsersDayShifts,
  addUsersDayShifts_cl,
  deleteEvents,
  getAllUsersEvents_cl,
  getAllUsersEventsExcludingPlatform,
};
