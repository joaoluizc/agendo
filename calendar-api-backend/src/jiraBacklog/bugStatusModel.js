import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * The set of triage statuses an issue can have (the dropdown on the backlog). Previously a
 * hardcoded list (lib/status.js STATUS_OPTIONS); now user-managed so admins can add/remove
 * statuses. The issue still stores its status as the name string (JiraIssue.status) — this
 * collection just defines which names are available, so add/delete needs no data migration.
 *
 * Self-contained inside the module folder (like the other jiraBacklog models) so the whole
 * feature can be deleted in one shot — see src/jiraBacklog/README.md.
 */
const BugStatusSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    order: { type: Number, default: 0 }, // dropdown / lifecycle order
  },
  { timestamps: true },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-bug-statuses" : "bug-statuses";

export const BugStatus = mongoose.model("BugStatus", BugStatusSchema, collectionName);
