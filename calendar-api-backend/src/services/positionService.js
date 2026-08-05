// services/positionService.js
import Position from "../models/PositionModel.js";
import { User } from "../models/UserModel.js";
import userService from "./userService.js";
import redisClient from "../database/redisClient.js";

const createPosition = async (data) => {
  const { name, color, type, enforceSync } = data;

  const position = new Position({
    name,
    color,
    type,
    positionId: data.positionId || "",
    enforceSync: enforceSync || false,
  });
  await position.save();
  return position;
};

const getPositions = async () => {
  const positions = await Position.find();
  return positions;
};

const getPositionById = async (id) => {
  const position = await Position.findById(id);
  return position;
};

const updatePosition = async (id, data) => {
  const position = await Position.findById(id);
  if (!position) {
    return null;
  }
  const { name, color, type, positionId, enforceSync } = data;

  position.name = name;
  position.color = color;
  position.type = type;
  position.positionId = positionId;

  if (enforceSync !== undefined) position.enforceSync = enforceSync;

  await position.save();
  return position;
};

const deletePosition = async (id) => {
  const position = await Position.findByIdAndDelete(id);
  return position;
};

const getUserPositionsToSync = async (userId) => {
  const user = await userService.findUserByClerkId(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user.positionsToSync;
};

const getPositionsToSyncForUsers = async (userIds) => {
  const users = await userService.findUsersByClerkIds(userIds);

  const cacheKey = `positionsToSync:${userIds.sort().join(",")}`;

  // try {
  //   const cachedData = await redisClient.get(cacheKey);
  //   if (cachedData) {
  //     return JSON.parse(cachedData);
  //   }
  // } catch (redisError) {
  //   console.warn("Redis cache retrieval failed:", redisError);
  // }

  // Positions an admin marked as enforceSync are always synced for every user,
  // regardless of their personal preference. Inject the enforced Sling ids here so
  // the bulk day-sync path (addDaysShiftsToGcal_cl) enforces them automatically.
  const { slingIds: enforcedSlingIds } = await getEnforcedPositionIds();

  const positionsToSync = users.reduce((acc, user) => {
    const userPositionsToSync = user.positionsToSync
      .filter((pos) => pos.sync === true)
      .map((pos) => pos.positionId);
    acc[user.clerkId] = [
      ...new Set([...userPositionsToSync, ...enforcedSlingIds]),
    ];
    return acc;
  }, {});

  try {
    await redisClient.set(cacheKey, JSON.stringify(positionsToSync), {
      EX: 86400,
    }); // Cache for 24 hours
  } catch (redisError) {
    console.warn("Redis cache set failed:", redisError);
  }

  return positionsToSync;
};

// Positions an admin flagged with enforceSync are synced to every user's calendar
// regardless of personal preference. Returned in both id spaces:
//  - slingIds:  Sling positionId strings, used by the Sling bulk-sync filters
//               (matched against event.position.id). Empty ids are dropped.
//  - objectIds: Mongo _id strings, used by the agendo per-shift gate shouldSyncShift
//               (matched against shift.positionId).
const getEnforcedPositionIds = async () => {
  const enforced = await Position.find({ enforceSync: true }, { positionId: 1 });
  return {
    slingIds: enforced.map((p) => p.positionId?.toString()).filter(Boolean),
    objectIds: enforced.map((p) => p._id.toString()),
  };
};

/**
 * Does this user's own preference sync shifts on `position`?
 *
 * The single home of the id-space bridge, and the reason it is a named function rather
 * than an inline `.some()`: a user's preferences are keyed by the **Sling** positionId,
 * while a Shift carries the position's **Mongo _id**. Comparing the wrong pair silently
 * matches nothing, and treating a mere entry as consent — ignoring its `sync` flag —
 * is what made unchecked positions keep syncing. Every caller goes through here.
 *
 * @param {object} user  Mongo user doc (not the Clerk user: `publicMetadata` is not
 *                       updated when the settings panel saves).
 * @param {object} position  Position doc.
 */
const prefersSync = (user, position) =>
  (user?.positionsToSync || []).some(
    (pref) => pref.positionId === position?.positionId && pref.sync === true,
  );

/**
 * Every position's sync verdict for one user.
 *
 * The same two-step rule the per-shift gate applies (`gCalendarService.shouldSyncShift`):
 * admin enforcement wins, otherwise the user's own preference decides. Exposed so an
 * admin can see whether a given agent's shift will actually reach their calendar —
 * previously only the backend could answer that, so the UI had to stay vague.
 *
 * Keyed by Mongo `_id` because that is what a Shift carries and what the frontend
 * already holds in `allPositions`, which keeps the Sling-id bridge on this side of the
 * wire where the canonical logic lives.
 */
const getSyncRulesForUser = async (clerkUserId) => {
  const user = await userService.findUserByClerkId(clerkUserId);
  if (!user) {
    throw new Error("User not found");
  }

  const [positions, { objectIds: enforcedObjectIds }] = await Promise.all([
    getPositions(),
    getEnforcedPositionIds(),
  ]);

  return positions.map((position) => {
    const enforced = enforcedObjectIds.includes(position._id.toString());
    const preference = prefersSync(user, position);
    return {
      positionId: position._id.toString(),
      enforced,
      preference,
      willSync: enforced || preference,
    };
  });
};

const setUserPositionsToSync = async (userId, positions) => {
  const user = await userService.findUserByClerkId(userId);
  if (!user) {
    throw new Error("User not found");
  }
  user.positionsToSync = positions;
  await user.save();
};

const getUserDefaultEventColorId = async (userId) => {
  const user = await userService.findUserByClerkId(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user.defaultEventColorId ?? null;
};

const setUserDefaultEventColorId = async (userId, colorId) => {
  const user = await userService.findUserByClerkId(userId);
  if (!user) {
    throw new Error("User not found");
  }
  // Normalize "" / undefined to null so "clear the default" is unambiguous.
  user.defaultEventColorId = colorId || null;
  await user.save();
  return user.defaultEventColorId;
};

// Resolve the Google Calendar colorId to use for a shift of `position` for `user`.
// Precedence: user-level default -> per-position choice -> undefined (Google default).
// `position` is a Position doc; matched against positionsToSync by the Sling positionId,
// the same key the settings panel reads/writes.
const resolveEventColorId = (user, position) => {
  if (!user) return undefined;
  if (user.defaultEventColorId) return user.defaultEventColorId;
  const match = (user.positionsToSync || []).find(
    (p) => p.positionId === position?.positionId,
  );
  return match?.colorId || undefined;
};

export default {
  createPosition,
  getPositions,
  getPositionById,
  updatePosition,
  deletePosition,
  getUserPositionsToSync,
  getPositionsToSyncForUsers,
  getEnforcedPositionIds,
  prefersSync,
  getSyncRulesForUser,
  setUserPositionsToSync,
  getUserDefaultEventColorId,
  setUserDefaultEventColorId,
  resolveEventColorId,
};
