// services/positionService.js
import Position from "../models/PositionModel.js";
import { User } from "../models/UserModel.js";
import userService from "./userService.js";
import redisClient from "../database/redisClient.js";

const createPosition = async (data) => {
  const { name, color, type, minTime, maxTime, stress, requiredSkills } = data;

  const position = new Position({
    name,
    color,
    type,
    positionId: data.positionId || "",
    minTime: minTime || 30,
    maxTime: maxTime || 480,
    stress: stress || false,
    requiredSkills: requiredSkills || [],
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
  const {
    name,
    color,
    type,
    positionId,
    minTime,
    maxTime,
    stress,
    requiredSkills,
  } = data;

  position.name = name;
  position.color = color;
  position.type = type;
  position.positionId = positionId;

  // Update new fields if provided
  if (minTime !== undefined) position.minTime = minTime;
  if (maxTime !== undefined) position.maxTime = maxTime;
  if (stress !== undefined) position.stress = stress;
  if (requiredSkills !== undefined) position.requiredSkills = requiredSkills;

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

  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  } catch (redisError) {
    console.warn("Redis cache retrieval failed:", redisError);
  }

  const positionsToSync = users.reduce((acc, user) => {
    const userPositionsToSync = user.positionsToSync
      .filter((pos) => pos.sync === true)
      .map((pos) => pos.positionId);
    acc[user.clerkId] = userPositionsToSync;
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
  setUserPositionsToSync,
};
