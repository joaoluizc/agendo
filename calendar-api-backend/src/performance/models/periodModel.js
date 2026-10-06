import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * Who is scored how in this quarter. Region and role are stored per period, not read
 * live from Location or anywhere else, so a quarter keeps its setup after people move
 * teams or locations are renamed. The cohort is not stored: the methodology derives it
 * from the region (cohortByRegion), so a later version can regroup a past quarter.
 */
const PeriodAgentSchema = new Schema(
  {
    clerkId: { type: String, required: true },
    region: { type: String, enum: ["US", "BR", "IL", "APAC", null], default: null },
    role: { type: String, required: true, default: "regular" },
    cohortOverride: { type: String, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const MethodologyChangeSchema = new Schema(
  {
    key: { type: String, required: true },
    setAt: { type: Date, required: true },
    setBy: { type: String, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * A quarter. Its boundaries are explicit instants in the team's timezone (UTC-3), built
 * by lib/quarters.js — never from server-local date parts. `methodologyKey` is the
 * official version its scores are read with; any other version can still be applied as a
 * what-if, and changing the official one (even when locked) is logged in
 * `methodologyHistory`.
 *
 * Locking freezes the hours: `hoursSnapshot` keeps each agent's minutes per report group
 * and the group lists they were classified with, so later shift edits or report-group
 * changes can't move a closed quarter. Facts are frozen by refusing imports while locked.
 */
const PeriodSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    year: { type: Number, required: true },
    quarter: { type: Number, required: true, min: 1, max: 4 },
    startsAt: { type: Date, required: true, unique: true },
    endsAt: { type: Date, required: true },
    tz: { type: String, required: true },
    methodologyKey: { type: String, required: true },
    methodologyHistory: { type: [MethodologyChangeSchema], default: [] },
    status: { type: String, enum: ["open", "locked"], default: "open" },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    // "agendo": hours come from shifts (per-agent imported hours override them);
    // "import": a quarter from before agendo had the shifts, hours are imported only.
    hoursSource: { type: String, enum: ["agendo", "import"], default: "agendo" },
    agents: { type: [PeriodAgentSchema], default: [] },
    hoursSnapshot: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-periods" : "performance-periods";

export const Period = mongoose.model("PerformancePeriod", PeriodSchema, collectionName);
