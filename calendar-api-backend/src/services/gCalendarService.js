import dotenv from "dotenv";
import slingController from "../controllers/slingController.js";
import userService from "./userService.js";
import utils from "../utils/utils.js";
import { google } from "googleapis";
import process from "process";
import addedGCalEventsService from "./addedGCalEventsService.js";
import { newShiftToEvent } from "../utils/newShiftToEvent.js";
import positionService from "./positionService.js";

dotenv.config();

const getOAuth2Client = (tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.SECRET_ID,
    process.env.REDIRECT,
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getUserTokens = async (user) => {
  if (user?.tokens) return user.tokens;
  if (user?.gapitoken) return user.gapitoken;
  const legacyToken = await userService.getGapiToken(user.email);
  if (legacyToken) return legacyToken;
  if (user?.clerkId) return userService.getUserGoogleOAuthToken_cl(user.clerkId);
  return null;
};

const getUserInfo = async (tokens, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Fetching user info`);
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );
  return await response.json();
};

const getUserEvents = async (
  email,
  date = new Date(),
  requestId = "req-id-nd",
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
      },
    );
  });
};

async function getUserEvents_cl(
  user,
  date = new Date(),
  requestId = "req-id-nd",
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
      },
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
        e?.errors?.[0]?.message,
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
  const tokens = await userService.getUserGoogleOAuthToken_cl(user.clerkId);
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
            err,
          );
          reject(err);
        } else {
          resolve(response);
        }
      },
    );
  });
  return addedEvent.data;
};

const addEvent_cl = async (user, event, requestId = "req-id-nd") => {
  console.log(
    `[${requestId}] - Adding event to user ${user.firstName}: `,
    JSON.stringify(event),
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
            err,
          );
          reject(err);
        } else {
          resolve(response);
        }
      },
    );
  });
  console.log(
    `[${requestId}] - Event added to user ${user.firstName}`,
    JSON.stringify(addedEvent.data),
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
        },
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
        },
      );
    });
  });

  return Promise.all(eventsPromises);
};

const deleteEvents_cl = async (user, events, requestId = "req-id-nd") => {
  if (!events?.length) return { deletedIds: [], failedIds: [] };

  console.log(`[${requestId}] - Deleting ${events.length} events for user ${user.id}`);
  const tokens = await userService.getUserGoogleOAuthToken_cl(user.id);
  const oauth2Client = getOAuth2Client(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const results = await Promise.allSettled(
    events.map((event) => {
      console.log(`[${requestId}] - Deleting event ${event.id}`);
      return new Promise((resolve) => {
        calendar.events.delete(
          { calendarId: "primary", eventId: event.id },
          (err) => {
            if (err) {
              const errMsg = err?.errors?.[0]?.message || err?.message || "Unknown error";
              if (errMsg === "Resource has been deleted") {
                console.log(
                  `[${requestId}] - Event ${event.id} was already deleted from GCal — treating as success`,
                );
                resolve({ id: event.id, status: "already-deleted" });
              } else {
                console.error(
                  `[${requestId}] - Failed to delete event ${event.id}: ${errMsg}`,
                );
                resolve({ id: event.id, status: "failed", error: errMsg });
              }
            } else {
              resolve({ id: event.id, status: "deleted" });
            }
          },
        );
      });
    }),
  );

  const allResults = results.map((r) => r.value);
  const deletedIds = allResults
    .filter((r) => r.status === "deleted" || r.status === "already-deleted")
    .map((r) => r.id);
  const failedIds = allResults
    .filter((r) => r.status === "failed")
    .map((r) => r.id);

  if (failedIds.length > 0) {
    console.warn(
      `[${requestId}] - ${failedIds.length}/${events.length} event deletions failed for user ${user.id}: [${failedIds.join(", ")}]`,
    );
  }
  console.log(
    `[${requestId}] - Deleted ${deletedIds.length}/${events.length} events for user ${user.id}`,
  );

  return { deletedIds, failedIds };
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
        },
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
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`,
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
      `[${requestId}] - Found ${usersWithGoogle.length} users authenticated with Google`,
    );

    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    console.log(
      `[${requestId}] - Found ${prevAddedEventsByUsers.length} users with events previously added for date ${date}`,
    );

    await Promise.all(
      usersWithGoogle.map(async (user) => {
        const slingUser = calendar.filter(
          (slingUserCal) => Number(slingUserCal.id) === Number(user.slingId),
        )[0];
        if (!slingUser) {
          console.log(
            `[${requestId}] - Found no shifts for user ${user.email}, no event was added to calendar`,
          );
          return;
        }
        const userShifts = slingUser.shifts;
        console.log(
          `[${requestId}] - Found ${userShifts.length} shifts for user ${user.email}`,
        );

        const prevAddedEventsForUser = prevAddedEventsByUsers.find(
          (prevAddedEvent) => prevAddedEvent?.userId === user?.id,
        );
        if (prevAddedEventsForUser) {
          // delete events from GCal
          console.log(
            `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} events for user ${user.email} on date ${date}`,
          );
          try {
            await deleteEvents(user, prevAddedEventsForUser.events, requestId);
            await addedGCalEventsService.deleteEvents(
              user.id,
              prevAddedEventsForUser.events,
              requestId,
            );
          } catch (e) {
            console.log(
              `[${requestId}] - Error deleting events for user ${user.email} on date ${date}. Error Message: ${e}`,
            );
          }
        }

        console.log(
          `[${requestId}] - Filtering shifts for ${user.email} to what user wants to sync`,
        );
        // Defensive: this function is currently unwired (no callers), but keep it
        // consistent with the live paths — enforced positions always sync.
        const { slingIds: enforcedSlingIds } =
          await positionService.getEnforcedPositionIds();
        const positionsToSync = [
          ...new Set([
            ...user.positionsToSync
              .filter((position) => position.sync === true)
              .map((position) => position.positionId.toString()),
            ...enforcedSlingIds,
          ]),
        ];
        const shiftsToAdd = userShifts.filter((event) =>
          positionsToSync.includes(event.position.id.toString()),
        );
        const colorByPositionId = new Map(
          (user.positionsToSync || [])
            .filter((p) => p.colorId)
            .map((p) => [p.positionId.toString(), p.colorId]),
        );
        const userEvents = shiftsToAdd.map((shift) => {
          const colorId =
            user.defaultEventColorId ||
            colorByPositionId.get(shift.position.id.toString());
          return utils.shiftToEvent(shift, colorId);
        });

        console.log(
          `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`,
        );
        usersWithChanges.push({ email: user.email, addedEvents: userEvents });
        numberOfAddedEvents += userEvents.length;
        const addedEvents = await Promise.all(
          userEvents.map(
            async (event) => await addEvent(user, event, requestId),
          ),
        );
        await addedGCalEventsService.addEvents(user, addedEvents, requestId);
        console.log(`[${requestId}] - ${addedEvents?.length} event(s) added`);
      }),
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
      JSON.stringify(e),
    );
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

const processBatch = async (users, batchSize, processor) => {
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));
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
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`,
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
      `[${requestId}] - Found ${usersWithGoogle.length} users authenticated with Google`,
    );

    console.time(`[${requestId}] prevAddedEventsByUsers`);
    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    console.timeEnd(`[${requestId}] prevAddedEventsByUsers`);
    console.log(
      `[${requestId}] - Found ${prevAddedEventsByUsers.length} users with events previously added for date ${date}`,
    );

    const userIds = usersWithGoogle.map((user) => user.id);
    const positionsByUser =
      await positionService.getPositionsToSyncForUsers(userIds);

    const processUser = async (user) => {
      // Look up MongoDB user to get consistent userId for database tracking
      const mongoUser = await userService.findUserByClerkId(user.id);
      if (!mongoUser) {
        console.log(
          `[${requestId}] - MongoDB user not found for Clerk ID ${user.id}, skipping`,
        );
        return;
      }

      // Delete previously-tracked events BEFORE checking whether the user has shifts today.
      // Without this ordering, syncing a day where all shifts were deleted would leave stale
      // GCal events behind (the !slingUser guard would return early and skip cleanup).
      const prevAddedEventsForUser = prevAddedEventsByUsers.find(
        (prevAddedEvent) => prevAddedEvent?.userId === mongoUser?.id,
      );
      if (prevAddedEventsForUser) {
        console.log(
          `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} tracked events for user ${user.firstName} on date ${date}`,
        );
        const { deletedIds, failedIds } = await deleteEvents_cl(
          user,
          prevAddedEventsForUser.events,
          requestId,
        );
        // Clean up DB tracking for events that were deleted (or were already gone from GCal).
        // Do this even if some deletions failed so stale records don't accumulate.
        const eventsToRemoveFromTracking = prevAddedEventsForUser.events.filter(
          (e) => deletedIds.includes(e.id),
        );
        if (eventsToRemoveFromTracking.length > 0) {
          await addedGCalEventsService.deleteEvents(
            mongoUser.id,
            eventsToRemoveFromTracking,
            requestId,
          );
        }
        if (failedIds.length > 0) {
          console.warn(
            `[${requestId}] - ${failedIds.length} event(s) could not be deleted from GCal for user ${user.firstName} — they may appear as duplicates until the next sync`,
          );
        }
      }

      const slingUser = calendar.filter(
        (slingUserCal) => Number(slingUserCal.id) === Number(user.slingId),
      )[0];
      if (!slingUser) {
        console.log(
          `[${requestId}] - Found no shifts for user ${user.firstName}, no new events to add`,
        );
        return;
      }
      const userShifts = slingUser.shifts;
      console.log(
        `[${requestId}] - Found ${userShifts.length} shifts for user ${user.firstName}`,
      );

      console.log(
        `[${requestId}] - Filtering shifts for ${user.firstName} to what user wants to sync`,
      );
      // Enforced positions are already merged into positionsByUser by
      // positionService.getPositionsToSyncForUsers — no extra union needed here.
      const positionsToSync = positionsByUser[user.id] || [];
      console.log(
        `[${requestId}] - positionsToSync for ${user.firstName}: ${JSON.stringify(positionsToSync)}`,
      );
      const shiftsToAdd = userShifts.filter((event) =>
        positionsToSync.includes(event.position.id.toString()),
      );
      // Per-position Google Calendar colors (Sling positionId -> colorId). The
      // user-level default, when set, wins over every per-position choice.
      const colorByPositionId = new Map(
        (mongoUser.positionsToSync || [])
          .filter((p) => p.colorId)
          .map((p) => [p.positionId.toString(), p.colorId]),
      );
      const userEvents = shiftsToAdd.map((shift) => {
        const colorId =
          mongoUser.defaultEventColorId ||
          colorByPositionId.get(shift.position.id.toString());
        return utils.shiftToEvent(shift, colorId);
      });

      console.log(
        `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.firstName} on date ${date}`,
      );

      // Use allSettled so a single failed insert does not discard successfully-added events.
      const addResults = await Promise.allSettled(
        userEvents.map((event) => addEvent_cl(user, event, requestId)),
      );

      const addedEvents = addResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      const failedAdds = addResults.filter((r) => r.status === "rejected");

      if (failedAdds.length > 0) {
        const firstError =
          failedAdds[0].reason?.errors?.[0]?.message ||
          failedAdds[0].reason?.message ||
          "Unknown error";
        console.error(
          `[${requestId}] - ${failedAdds.length}/${userEvents.length} event(s) failed to add for user ${user.firstName}. First error: ${firstError}`,
        );
        usersWithErrors.push({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          error: `Failed to add ${failedAdds.length}/${userEvents.length} events: ${firstError}`,
        });
      }

      if (addedEvents.length > 0) {
        // Use mongoUser.id for consistent database tracking
        const userForTracking = { ...user, id: mongoUser.id };
        await addedGCalEventsService.addEvents_cl(userForTracking, addedEvents, requestId);
      }

      usersWithChanges.push({
        firstName: user.firstName,
        addedEvents: addedEvents,
      });
      numberOfAddedEvents += addedEvents.length;
      console.log(
        `[${requestId}] - ${addedEvents.length}/${userEvents.length} event(s) added for user ${user.firstName}`,
      );
    };

    // Process users in batches of 10 to limit memory usage
    await processBatch(usersWithGoogle, 10, processUser);

    if (numberOfAddedEvents === 0 && usersWithChanges?.length === 0) {
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

const deleteUserDayTrackedEvents = async (user, date, requestId = "req-id-nd") => {
  const prevAddedEventsByUsers = await addedGCalEventsService.findEventsByDate(date, requestId);
  const prevAddedEventsForUser = prevAddedEventsByUsers.find(
    (prev) => prev?.userId === user?.id,
  );
  if (!prevAddedEventsForUser?.events?.length) {
    console.log(`[${requestId}] - No tracked events to delete for user ${user.email} on ${date}`);
    return;
  }
  console.log(
    `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} tracked events for ${user.email} on ${date}`,
  );
  const tokens = await getUserTokens(user);
  const oauth2Client = getOAuth2Client(tokens);
  const cal = google.calendar({ version: "v3", auth: oauth2Client });
  await Promise.allSettled(
    prevAddedEventsForUser.events.map(
      (event) =>
        new Promise((resolve) => {
          cal.events.delete({ calendarId: "primary", eventId: event.id }, (err) => {
            if (err) {
              console.log(
                `[${requestId}] - Could not delete event ${event.id} from GCal: ${err.message || err}`,
              );
            }
            resolve();
          });
        }),
    ),
  );
  await addedGCalEventsService.deleteEvents(user.id, prevAddedEventsForUser.events, requestId);
};

const addUsersDayShifts = async (user, date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Adding user's day shifts to GCal`);
  try {
    const calendar = await slingController.getCalendar(date);
    console.log(
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`,
    );

    // Delete previously-tracked events BEFORE checking whether the user has shifts today.
    // Without this ordering, syncing a day where all shifts were deleted would leave stale
    // GCal events behind (the !slingUser guard would return early and skip cleanup).
    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    console.log(
      `[${requestId}] - findEventsByDate returned ${prevAddedEventsByUsers.length} users with events`,
    );
    const prevAddedEventsForUser = prevAddedEventsByUsers.find(
      (prevAddedEvent) => prevAddedEvent?.userId === user?.id,
    );
    console.log(
      `[${requestId}] - Looking for events matching userId: ${user?.id}. Found: ${!!prevAddedEventsForUser}${
        prevAddedEventsForUser
          ? ` with ${prevAddedEventsForUser.events?.length} events`
          : ""
      }`,
    );
    if (prevAddedEventsForUser?.events?.length) {
      console.log(
        `[${requestId}] - Deleting ${prevAddedEventsForUser.events.length} tracked events for user ${user.email} on date ${date}`,
      );
      try {
        const tokens = await getUserTokens(user);
        if (!tokens) {
          console.error(
            `[${requestId}] - No Google tokens found for user ${user.email}, cannot delete events`,
          );
        } else {
          console.log(
            `[${requestId}] - Retrieved Google tokens for user ${user.email}, attempting to delete ${prevAddedEventsForUser.events.length} events`,
          );
          const oauth2Client = getOAuth2Client(tokens);
          const cal = google.calendar({ version: "v3", auth: oauth2Client });
          const deleteResults = await Promise.allSettled(
            prevAddedEventsForUser.events.map(
              (event) =>
                new Promise((resolve) => {
                  cal.events.delete(
                    { calendarId: "primary", eventId: event.id },
                    (err) => {
                      if (err) {
                        const errMsg = err?.errors?.[0]?.message || err?.message || "Unknown error";
                        if (errMsg === "Resource has been deleted") {
                          resolve({ id: event.id, status: "already-deleted" });
                        } else {
                          console.error(
                            `[${requestId}] - Failed to delete event ${event.id}: ${errMsg}`,
                          );
                          resolve({ id: event.id, status: "failed", error: errMsg });
                        }
                      } else {
                        resolve({ id: event.id, status: "deleted" });
                      }
                    },
                  );
                }),
            ),
          );

          const allResults = deleteResults.map((r) => r.value);
          const deletedIds = allResults
            .filter((r) => r.status === "deleted" || r.status === "already-deleted")
            .map((r) => r.id);
          const failedIds = allResults
            .filter((r) => r.status === "failed")
            .map((r) => r.id);

          console.log(
            `[${requestId}] - Google Calendar deletion results: ${deletedIds.length} deleted/already-deleted, ${failedIds.length} failed`,
          );

          if (deletedIds.length > 0) {
            const eventsToRemoveFromTracking = prevAddedEventsForUser.events.filter(
              (e) => deletedIds.includes(e.id),
            );
            await addedGCalEventsService.deleteEvents(
              user.id,
              eventsToRemoveFromTracking,
              requestId,
            );
          }
          if (failedIds.length > 0) {
            console.warn(
              `[${requestId}] - ${failedIds.length} event(s) could not be deleted from GCal for user ${user.email} — they may appear as duplicates`,
            );
          }
        }
      } catch (e) {
        console.error(
          `[${requestId}] - Error deleting events for user ${user.email}: ${e.message}`,
        );
      }
    }

    const slingUser = calendar.find(
      (slingUserCal) => Number(slingUserCal.id) === Number(user.slingId),
    );
    if (!slingUser) {
      console.log(
        `[${requestId}] - Found no shifts for user ${user.email}, no new events to add`,
      );
      return {
        status: 200,
        message: `Found no shifts for user ${user.email}, no new events to add`,
      };
    }
    const userShifts = slingUser.shifts;
    console.log(
      `[${requestId}] - Found ${userShifts.length} shifts for user ${user.email}`,
    );

    console.log(
      `[${requestId}] - Filtering shifts for ${user.email} to what user wants to sync`,
    );
    const { slingIds: enforcedSlingIds } =
      await positionService.getEnforcedPositionIds();
    const positionsToSync = [
      ...new Set([
        ...user.positionsToSync
          // Only positions the user actually checked. Without this filter every
          // position in positionsToSync synced, so unchecked shifts kept syncing.
          .filter((position) => position.sync === true)
          .map((position) => position.positionId.toString()),
        ...enforcedSlingIds,
      ]),
    ];
    const shiftsToAdd = userShifts.filter((event) =>
      positionsToSync.includes(event.position.id.toString()),
    );
    // Per-position Google Calendar colors (Sling positionId -> colorId); the
    // user-level default, when set, overrides every per-position choice.
    const colorByPositionId = new Map(
      (user.positionsToSync || [])
        .filter((p) => p.colorId)
        .map((p) => [p.positionId.toString(), p.colorId]),
    );
    const userEvents = shiftsToAdd.map((shift) => {
      const colorId =
        user.defaultEventColorId ||
        colorByPositionId.get(shift.position.id.toString());
      return utils.shiftToEvent(shift, colorId);
    });

    console.log(
      `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.email} on date ${date}`,
    );

    // Use allSettled so a single failed insert does not discard successfully-added events.
    const addResults = await Promise.allSettled(
      userEvents.map(async (event) => await addEvent(user, event, requestId)),
    );

    const addedEvents = addResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    const failedAdds = addResults.filter((r) => r.status === "rejected");

    if (failedAdds.length > 0) {
      const firstError =
        failedAdds[0].reason?.errors?.[0]?.message ||
        failedAdds[0].reason?.message ||
        "Unknown error";
      console.error(
        `[${requestId}] - ${failedAdds.length}/${userEvents.length} event(s) failed to add for user ${user.email}. First error: ${firstError}`,
      );
    }

    if (addedEvents.length > 0) {
      await addedGCalEventsService.addEvents(user, addedEvents, requestId);
    }

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
      `[${requestId}] - Found ${calendar.length} shifts for date ${date}`,
    );

    // Delete previously-tracked events BEFORE checking whether the user has shifts today.
    // Without this ordering, syncing a day where all shifts were deleted would leave stale
    // GCal events behind (the !slingUser guard would return early and skip cleanup).
    const prevAddedEventsByUsers =
      await addedGCalEventsService.findEventsByDate(date, requestId);
    const prevAddedEventsForUser = prevAddedEventsByUsers.find(
      (prevAddedEvent) => prevAddedEvent?.userId === user?.id,
    );
    if (prevAddedEventsForUser) {
      console.log(
        `[${requestId}] - Deleting ${prevAddedEventsForUser.events?.length} tracked events for user ${user.firstName} on date ${date}`,
      );
      const { deletedIds, failedIds } = await deleteEvents_cl(
        user,
        prevAddedEventsForUser.events,
        requestId,
      );
      const eventsToRemoveFromTracking = prevAddedEventsForUser.events.filter(
        (e) => deletedIds.includes(e.id),
      );
      if (eventsToRemoveFromTracking.length > 0) {
        await addedGCalEventsService.deleteEvents(
          user.id,
          eventsToRemoveFromTracking,
          requestId,
        );
      }
      if (failedIds.length > 0) {
        console.warn(
          `[${requestId}] - ${failedIds.length} event(s) could not be deleted from GCal for user ${user.firstName} — they may appear as duplicates`,
        );
      }
    }

    const slingUser = calendar.find((slingUserCal) => {
      console.log(
        `comparing ${slingUserCal.id} with ${user.publicMetadata.slingId}`,
      );
      return Number(slingUserCal.id) === Number(user.publicMetadata.slingId);
    });
    if (!slingUser) {
      console.log(
        `[${requestId}] - Found no shifts for user ${user.firstName}, no new events to add`,
      );
      return {
        status: 200,
        message: `Found no shifts for user ${user.firstName}, no new events to add`,
      };
    }
    const userShifts = slingUser.shifts;
    console.log(
      `[${requestId}] - Found ${userShifts.length} shifts for user ${user.firstName}`,
    );

    console.log(
      `[${requestId}] - Filtering shifts for ${user.firstName} to what user wants to sync`,
    );
    // Defensive: this function is currently unwired (no callers), but keep it
    // consistent with the live paths — enforced positions always sync.
    const { slingIds: enforcedSlingIds } =
      await positionService.getEnforcedPositionIds();
    const positionsToSync = [
      ...new Set([
        ...user.publicMetadata.positionsToSync
          .filter((position) => position.sync === true)
          .map((position) => position.positionId.toString()),
        ...enforcedSlingIds,
      ]),
    ];
    const shiftsToAdd = userShifts.filter((event) =>
      positionsToSync.includes(event.position.id.toString()),
    );
    const colorByPositionId = new Map(
      (user.publicMetadata.positionsToSync || [])
        .filter((p) => p.colorId)
        .map((p) => [p.positionId.toString(), p.colorId]),
    );
    const userEvents = shiftsToAdd.map((shift) => {
      const colorId =
        user.publicMetadata.defaultEventColorId ||
        colorByPositionId.get(shift.position.id.toString());
      return utils.shiftToEvent(shift, colorId);
    });

    console.log(
      `[${requestId}] - Adding ${userEvents.length} shifts to GCal for ${user.firstName} on date ${date}`,
    );

    const addResults = await Promise.allSettled(
      userEvents.map((event) => addEvent_cl(user, event, requestId)),
    );

    const addedEvents = addResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    const failedAdds = addResults.filter((r) => r.status === "rejected");

    if (failedAdds.length > 0) {
      const firstError =
        failedAdds[0].reason?.errors?.[0]?.message ||
        failedAdds[0].reason?.message ||
        "Unknown error";
      console.error(
        `[${requestId}] - ${failedAdds.length}/${userEvents.length} event(s) failed to add for user ${user.firstName}. First error: ${firstError}`,
      );
    }

    if (addedEvents.length > 0) {
      await addedGCalEventsService.addEvents_cl(user, addedEvents, requestId);
    }

    console.log(
      `[${requestId}] - ${addedEvents.length}/${userEvents.length} event(s) added for user ${user.firstName}`,
    );
    return {
      status: 200,
      message: `${addedEvents.length} shifts added to GCal for ${user.firstName}`,
      addedEvents,
    };
  } catch (e) {
    console.log(
      `[${requestId}] - Error adding shifts to GCal: `,
      JSON.stringify(e),
    );
    return { status: 500, message: "Error adding shifts to GCal" };
  }
};

const addEventForShift = async (
  userId,
  shift,
  requestId = "req-id-nd",
  enforcedObjectIds = null,
) => {
  console.log(`[${requestId}] - Starting addEventForShift flow`);

  const user = await userService.findUser_cl(userId);
  if (!(await shouldSyncShift(user, shift, requestId, enforcedObjectIds))) {
    console.log(
      `[${requestId}] - Shift not eligible to be synced. Ending addEventForShift flow.`,
    );
    return;
  }

  let event;
  let addedEvent = null;
  try {
    // Get MongoDB user for consistent database tracking
    const mongoUser = await userService.findUserByClerkId(user.id);
    if (!mongoUser) {
      console.error(
        `[${requestId}] - MongoDB user not found for Clerk ID ${user.id}, cannot sync shift`,
      );
      return;
    }

    // Resolve the user's chosen Google Calendar color for this shift's position
    // (user-level default -> per-position choice -> none). Read from the Mongo user,
    // the same source the settings panel writes.
    const position = await positionService.getPositionById(shift.positionId);
    const colorId = positionService.resolveEventColorId(mongoUser, position);
    // transform shift into calendar event
    event = await newShiftToEvent(shift, colorId);
    // add event to GCal
    addedEvent = await addEvent_cl(user, event, requestId);
    // add event to addedGCalEvents collection with MongoDB user ID for consistency
    const userForTracking = { ...user, id: mongoUser.id };
    await addedGCalEventsService.addEvents_cl(userForTracking, [addedEvent], requestId);
    console.log(`[${requestId}] - Event added successfully to google calendar`);
  } catch (e) {
    console.error(
      `[${requestId}] - Error adding event to calendar for shift ${shift._id}: `,
      e,
    );
  }

  console.log(`[${requestId}] - Ending addEventForShift flow`);

  return addedEvent;
};

async function shouldSyncShift(
  clerkUser,
  shift,
  requestId = "req-id-nd",
  enforcedObjectIds = null,
) {
  console.log(
    `[${requestId}] - Checking if shift should be synced for user ${clerkUser.id}`,
  );
  const shiftPositionId = shift.positionId.toString();

  // Admin-enforced positions always sync, overriding the user's preference.
  // Callers in a loop should pass enforcedObjectIds to avoid a query per shift.
  const enforced =
    enforcedObjectIds ??
    (await positionService.getEnforcedPositionIds()).objectIds;
  if (enforced.includes(shiftPositionId)) {
    console.log(
      `[${requestId}] - Position ${shift.positionId} is admin-enforced; syncing`,
    );
    return true;
  }

  // Read the user's real preference from Mongo — the source the settings panel
  // writes via setUserPositionsToSync. We must NOT read clerkUser.publicMetadata
  // here: it isn't updated when the user saves, and the previous code synced
  // every position merely *present* in it, ignoring each entry's `sync` flag —
  // which caused unchecked positions to keep syncing.
  // The shift carries the position's Mongo _id; user prefs are keyed by the
  // Sling positionId, so resolve the Position doc to bridge the two id-spaces
  // (same match the bulk sync path uses).
  const mongoUser = await userService.findUserByClerkId(clerkUser.id);
  const position = await positionService.getPositionById(shift.positionId);
  const shouldSync = (mongoUser?.positionsToSync || []).some(
    (pref) => pref.positionId === position?.positionId && pref.sync === true,
  );

  console.log(
    `[${requestId}] - Position ${shift.positionId} sync status: ${shouldSync}`,
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
  requestId = "req-id-nd",
) => {
  console.log(
    `[${requestId}] - Fetching all users events excluding platform-created events`,
  );

  try {
    // Get all users with Google authentication
    const users = await userService.getAllUsersWithTokens_cl();
    let usersWithErrors = [];

    // Get all platform-created event IDs from the database
    const platformEventIds =
      await addedGCalEventsService.getAllPlatformEventIds(requestId);
    console.log(
      `[${requestId}] - Found ${platformEventIds.length} platform-created event IDs to exclude`,
    );

    const allEventsPromises = users.map(async (user) => {
      const slingId = user.publicMetadata.slingId;
      const userId = user.id;

      let events;
      try {
        // Fetch events from Google Calendar
        events = await getUserEvents_cl(user, date, requestId);

        // Filter out platform-created events and workingLocation events
        const filteredEvents = events.filter((event) => {
          return (
            !platformEventIds.includes(event.id) &&
            event.eventType !== "workingLocation"
          );
        });

        console.log(
          `[${requestId}] - User ${user.firstName}: ${events.length} total events, ${filteredEvents.length} after filtering platform and workingLocation events`,
        );

        return { userId, slingId, events: filteredEvents };
      } catch (e) {
        console.log(
          `[${requestId}] - Error fetching events for user ${user.firstName}: `,
          e,
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
      `[${requestId}] - Successfully fetched events for ${allEventsFiltered.length} users, excluding platform-created and workingLocation events`,
    );

    return { events: allEventsFiltered, usersWithErrors };
  } catch (error) {
    console.error(
      `[${requestId}] - Error in getAllUsersEventsExcludingPlatform:`,
      error,
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
  deleteUserDayTrackedEvents,
  addUsersDayShifts,
  addUsersDayShifts_cl,
  deleteEvents,
  getAllUsersEvents_cl,
  getAllUsersEventsExcludingPlatform,
};
