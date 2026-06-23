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

const setUserPositionsToSync = async (userId, positions) => {
  const user = await userService.findUserByClerkId(userId);
  if (!user) {
    throw new Error("User not found");
  }
  user.positionsToSync = positions;
  await user.save();
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
  setUserPositionsToSync,
};
