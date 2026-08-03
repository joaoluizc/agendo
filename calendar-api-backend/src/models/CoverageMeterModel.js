import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * A coverage meter: a named, colored group of positions with an hourly headcount
 * target for every day of the week. The schedule page renders one coverage row per
 * meter and flags any half hour where the number of scheduled agents falls below
 * the target. Admin-only, end to end (see coverageMeterRouter.js).
 *
 * Two conventions here are load-bearing — read them before touching this file.
 *
 * `positionIds` holds Position._id, the same id space as Shift.positionId, so the
 * coverage count is a direct join. It is NOT the Sling id in Position.positionId /
 * User.positionsToSync[].positionId. The codebase mixes both spaces (which is why
 * positionService.getEnforcedPositionIds exists) — this one is Mongo ids.
 *
 * `targets[d][s]` is UTC, Sunday-first: `d` matches Date#getUTCDay() (and the existing
 * User.workHours.dayOfWeek convention), `s` is a half-hour slot 0..47. Nothing local is
 * ever persisted — agendo is used across timezones, so a target is an absolute weekly
 * instant, not a wall-clock label. The client converts to and from its own local time
 * for display (see the frontend's src/utils/coverageTargets.ts).
 *
 * Slots are half-hourly, not hourly, even though the admin edits an hourly grid: whole
 * UTC hours cannot represent a local hour in a half-hour zone (in UTC+05:30, local
 * 09:00 is UTC 03:30), so an hourly grid silently shifts every target by 30 minutes.
 * 48 slots also line up with the schedule grid's own half-hour columns.
 */
const CoverageMeterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    positionIds: [{ type: Schema.Types.ObjectId, ref: "Position" }],
    // [7][48] — UTC day-of-week (0 = Sunday) × half-hour slot, each value 0..8.
    targets: { type: [[Number]], required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Mirror agendo's convention: isolated collections in development.
const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-coverage-meters" : "coverage-meters";

const CoverageMeter = mongoose.model(
  "CoverageMeter",
  CoverageMeterSchema,
  collectionName,
);

export default CoverageMeter;
