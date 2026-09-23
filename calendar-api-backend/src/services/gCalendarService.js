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
  if (user?.clerkId) return userService.getGoogleOAuthTokenByClerkId(user.clerkId);
  return null;
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

const getAllUsersEvents_cl = async (date, requestId = "req-id-nd") => {
  console.log(`[${requestId}] - Fetching all users events`);
  const users = await userService.getUsersWithGoogleTokens();

  let usersWithErrors = [];

  const allEventsPromises = users.map(async (user) => {
    // slingId comes from Mongo via getUsersWithGoogleTokens - never from Clerk
    // publicMetadata, which is no longer written. See docs/knowledge/clerk-mongo-boundary.md.
    const slingId = user.slingId;
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
  const tokens = await userService.getGoogleOAuthTokenByClerkId(user.clerkId);
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

/**
 * @param {object} [preloadedTokens] The user's Google tokens, when the caller already
 *   fetched them for a batch. `undefined` means "look them up"; `null` is a real answer
 *   (no Google connection) and is passed through so the insert fails loudly.
 */
const addEvent_cl = async (
  user,
  event,
  requestId = "req-id-nd",
  preloadedTokens = undefined,
) => {
  console.log(
    `[${requestId}] - Adding event to user ${user.firstName}: `,
    JSON.stringify(event),
  );
  const tokens =
    preloadedTokens === undefined
      ? await userService.getGoogleOAuthTokenByClerkId(user.id)
      : preloadedTokens;
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
  const tokens = await userService.getGoogleOAuthTokenByClerkId(user.id);
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

    // This sync deletes each user's previously-tracked events BEFORE working out what
    // to re-add. An empty calendar is therefore indistinguishable from "everyone's
    // shifts were deleted in Sling", and a Sling outage would wipe every user's events
    // for this date in one run. Refuse rather than guess.
    if (!Array.isArray(calendar) || calendar.length === 0) {
      console.warn(
        `[${requestId}] - Sling returned no shifts for ${date}; aborting sync instead of deleting every user's events`,
      );
      return {
        status: 200,
        message: `No shifts returned from Sling for ${date} - sync aborted so no events were deleted`,
        usersWithErrors: [
          { error: `No shifts returned from Sling for ${date}; sync aborted` },
        ],
      };
    }

    const usersTokensResponse = await userService.getUsersWithGoogleTokens();
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

      // Without a slingId we can never match this user to a Sling shift, so the
      // delete-then-readd below would delete their events and add nothing back.
      //
      // Guard on `user.slingId` (the cached roster value the match at `slingUser`
      // actually uses), not `mongoUser.slingId` - the roster is Redis-cached for 10
      // minutes, so the two can disagree and only the cached one decides the match.
      //
      // Only skip when there is nothing tracked to clean up. A user who HAD a slingId,
      // has tracked events, and then had it cleared (offboarding) still needs those
      // stale events removed from their calendar - skipping them would strand the
      // events forever, and strand the tracking rows with them.
      if (!user.slingId && !prevAddedEventsForUser?.events?.length) {
        console.warn(
          `[${requestId}] - No slingId for user ${user.id} and nothing tracked; skipping`,
        );
        usersWithErrors.push({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          error: "User has no slingId; skipped to avoid deleting their events",
        });
        return;
      }
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

/**
 * Put one agendo shift on its agent's calendar.
 *
 * `options.context` carries lookups a batch caller has already done for this agent —
 * `{ clerkUser, mongoUser, tokens, positionsById }` — so publishing a full day does not
 * fetch the same Clerk user, OAuth token, Mongo user and position two or three times per
 * shift. Anything missing from it is looked up as before.
 *
 * `options.throwOnError` rethrows a failed insert instead of returning nothing. Without
 * it, "Google refused" and "this agent has the position's sync switched off" both come
 * back empty, and callers reported the failure as a success.
 */
const addEventForShift = async (
  userId,
  shift,
  requestId = "req-id-nd",
  enforcedObjectIds = null,
  { context = null, throwOnError = false } = {},
) => {
  console.log(`[${requestId}] - Starting addEventForShift flow`);

  const user = context?.clerkUser ?? (await userService.getClerkUserById(userId));
  if (
    !(await shouldSyncShift(user, shift, requestId, enforcedObjectIds, context))
  ) {
    console.log(
      `[${requestId}] - Shift not eligible to be synced. Ending addEventForShift flow.`,
    );
    return;
  }

  let event;
  let addedEvent = null;
  try {
    // Get MongoDB user for consistent database tracking
    const mongoUser = context
      ? context.mongoUser
      : await userService.findUserByClerkId(user.id);
    if (!mongoUser) {
      console.error(
        `[${requestId}] - MongoDB user not found for Clerk ID ${user.id}, cannot sync shift`,
      );
      if (throwOnError) throw new Error(`No agendo user for ${user.id}`);
      return;
    }

    // Resolve the user's chosen Google Calendar color for this shift's position
    // (user-level default -> per-position choice -> none). Read from the Mongo user,
    // the same source the settings panel writes.
    const position =
      context?.positionsById?.get(String(shift.positionId)) ??
      (await positionService.getPositionById(shift.positionId));
    const colorId = positionService.resolveEventColorId(mongoUser, position);
    // transform shift into calendar event
    event = await newShiftToEvent(shift, colorId, position);
    // add event to GCal
    addedEvent = await addEvent_cl(user, event, requestId, context?.tokens);
    // add event to addedGCalEvents collection with MongoDB user ID for consistency
    const userForTracking = { ...user, id: mongoUser.id };
    await addedGCalEventsService.addEvents_cl(userForTracking, [addedEvent], requestId);
    console.log(`[${requestId}] - Event added successfully to google calendar`);
  } catch (e) {
    console.error(
      `[${requestId}] - Error adding event to calendar for shift ${shift._id}: `,
      e,
    );
    if (throwOnError) throw e;
  }

  console.log(`[${requestId}] - Ending addEventForShift flow`);

  return addedEvent;
};

async function shouldSyncShift(
  clerkUser,
  shift,
  requestId = "req-id-nd",
  enforcedObjectIds = null,
  context = null,
) {
  // A draft is a plan, not a commitment: it never reaches an agent's calendar. Publishing
  // is what syncs it (see shiftService.publishShifts), so this returns false until then.
  //
  // The check sits here, in the single gate every per-shift caller already passes through,
  // rather than at each call site — that way the drag-to-move path (PUT /shift/) and
  // anything added later are covered without anyone having to remember.
  //
  // It also comes before the log line below, which dereferences `clerkUser.id`: a draft
  // must be refused even when the caller's user lookup came back empty, rather than
  // throwing on the way to the answer.
  if (shift.status === "draft") {
    console.log(`[${requestId}] - Shift is a draft; not syncing.`);
    return false;
  }

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
  // Sling positionId, so positionService.prefersSync owns that bridge. It is the
  // same predicate positionService.getSyncRulesForUser reports to admins, so what
  // the edit dialog promises and what this gate does cannot drift apart.
  const mongoUser = context
    ? context.mongoUser
    : await userService.findUserByClerkId(clerkUser.id);
  const position =
    context?.positionsById?.get(shiftPositionId) ??
    (await positionService.getPositionById(shift.positionId));
  const shouldSync = positionService.prefersSync(mongoUser, position);

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
    const users = await userService.getUsersWithGoogleTokens();
    let usersWithErrors = [];

    // Get all platform-created event IDs from the database
    const platformEventIds =
      await addedGCalEventsService.getAllPlatformEventIds(requestId);
    console.log(
      `[${requestId}] - Found ${platformEventIds.length} platform-created event IDs to exclude`,
    );

    const allEventsPromises = users.map(async (user) => {
      // slingId comes from Mongo via getUsersWithGoogleTokens - never from Clerk
    // publicMetadata, which is no longer written. See docs/knowledge/clerk-mongo-boundary.md.
    const slingId = user.slingId;
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
  addEventForShift,
  addUsersDayShifts,
  addDaysShiftsToGcal_cl,
  deleteEvents,
  deleteEvents_cl,
  getAllUsersEvents_cl,
  getAllUsersEventsExcludingPlatform,
};
