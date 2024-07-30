// services/positionService.js
import Position from '../models/Position.js';

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

export default {
    createPosition,
    getPositions,
    getPositionById,
    updatePosition,
    deletePosition,
};