// services/positionService.js
import Position from '../models/PositionModel.js';
import { User } from '../models/UserModel.js';
import userService from './userService.js';

const createPosition = async (data) => {
  const { name, color } = data;
  const position = new Position({ name, color });
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
    const { name, color } = data;
    position.name = name;
    position.color = color;
    await position.save();
    return position;
};

const deletePosition = async (id) => {
    const position = await Position
        .findByIdAndDelete(id);
    return position;
};

const getUserPositionsToSync = async (userId) => {
    const user = await userService.findUserByClerkId(userId);
    if (!user) {
        throw new Error('User not found');
    }
    return user.positionsToSync;
}

const setUserPositionsToSync = async (userId, positions) => {
    const user = await userService.findUserByClerkId(userId);
    if (!user) {
        throw new Error('User not found');
    }
    user.positionsToSync = positions;
    await user.save();
}

export default {
    createPosition,
    getPositions,
    getPositionById,
    updatePosition,
    deletePosition,
    getUserPositionsToSync,
    setUserPositionsToSync,
};
