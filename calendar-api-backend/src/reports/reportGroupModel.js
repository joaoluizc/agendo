import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * A report group: "Tickets" or "Chats", holding the plain shift/position NAME strings
 * (not Position._id) that count toward it; a shift's Position._id is resolved to its name
 * and matched against these. Names, not ids, because the report used to classify
 * Sling-sourced shifts too, which only ever carried a raw position name string, never
 * agendo's Mongo id. The report reads agendo shifts only now, but the shape stays — see
 * src/reports/README.md for why this deliberately differs from CoverageMeterModel's
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
