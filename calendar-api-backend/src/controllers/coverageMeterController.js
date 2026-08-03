import mongoose from "mongoose";
import coverageMeterService from "../services/coverageMeterService.js";

const MAX_NAME_LENGTH = 60;
const MAX_TARGET = 8;
/** UTC half-hour slots per day — see CoverageMeterModel.js for why it isn't 24. */
const SLOTS_PER_DAY = 48;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Validate one meter from a replace-all payload. Returns an error string, or null
 * when the meter is well formed. The target grid is checked exhaustively because a
 * malformed row would silently break the schedule page's per-slot lookup.
 */
const validateMeter = (meter, index) => {
  const where = `meters[${index}]`;

  if (!meter || typeof meter !== "object") return `${where} must be an object`;

  if (typeof meter.name !== "string" || !meter.name.trim()) {
    return `${where}.name is required`;
  }
  if (meter.name.trim().length > MAX_NAME_LENGTH) {
    return `${where}.name must be at most ${MAX_NAME_LENGTH} characters`;
  }
  if (typeof meter.color !== "string" || !HEX_COLOR.test(meter.color)) {
    return `${where}.color must be a hex color like #3B82F6`;
  }

  if (!Array.isArray(meter.positionIds)) {
    return `${where}.positionIds must be an array`;
  }
  const badId = meter.positionIds.find(
    (id) => !mongoose.isValidObjectId(id),
  );
  if (badId !== undefined) {
    return `${where}.positionIds contains an invalid position id: ${badId}`;
  }

  if (!Array.isArray(meter.targets) || meter.targets.length !== 7) {
    return `${where}.targets must have 7 days`;
  }
  for (let day = 0; day < 7; day++) {
    const row = meter.targets[day];
    if (!Array.isArray(row) || row.length !== SLOTS_PER_DAY) {
      return `${where}.targets[${day}] must have ${SLOTS_PER_DAY} half-hour slots`;
    }
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const value = row[slot];
      if (!Number.isInteger(value) || value < 0 || value > MAX_TARGET) {
        return `${where}.targets[${day}][${slot}] must be an integer between 0 and ${MAX_TARGET}`;
      }
    }
  }

  return null;
};

const getMeters = async (req, res) => {
  try {
    const meters = await coverageMeterService.getMeters();
    res.status(200).json(meters);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const replaceMeters = async (req, res) => {
  const meters = req.body?.meters;

  if (!Array.isArray(meters)) {
    return res.status(400).json({ message: "meters must be an array" });
  }

  for (let i = 0; i < meters.length; i++) {
    const error = validateMeter(meters[i], i);
    if (error) return res.status(400).json({ message: error });
  }

  try {
    const saved = await coverageMeterService.replaceAll(meters);
    res.status(200).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export default { getMeters, replaceMeters };
