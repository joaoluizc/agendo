import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * A report group: "Tickets" or "Chats", holding the plain shift/position NAME strings
 * (not Position._id) that count toward it. Names, not ids, because this has to classify
 * both agendo-native shifts (which resolve a Position._id -> name) and Sling-sourced
 * shifts (which only ever carry a raw position name string, never agendo's Mongo id) —
 * see src/reports/README.md for why this deliberately differs from CoverageMeterModel's
 * positionIds:[ObjectId] shape.
 *
 * Exactly two documents ever exist ("Tickets", "Chats") — "Other" is never stored, it's
 * whatever doesn't match either list, computed at report time.
 *
 * Self-contained inside the module folder (like jiraBacklog's models) so the whole
 * feature can be deleted in one shot — see src/reports/README.md.
 */
const ReportGroupSchema = new Schema(
  {
    name: { type: String, enum: ["Tickets", "Chats"], required: true, unique: true },
    // Matched case-insensitively/trimmed against a shift's resolved position name.
    positionNames: { type: [String], default: [] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-report-groups" : "report-groups";

export const ReportGroup = mongoose.model("ReportGroup", ReportGroupSchema, collectionName);
