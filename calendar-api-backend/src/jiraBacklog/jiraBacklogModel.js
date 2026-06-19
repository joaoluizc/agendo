import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * A single Jira bug row. Field names follow the seed export, except the Jira key is
 * stored as `issueKey` (Mongoose reserves the `id` virtual). `order` preserves
 * insertion order for the "All" view; `urgencyOverridden` records whether an admin
 * typed the urgency by hand (vs. it being auto-calculated).
 *
 * Self-contained inside the module folder (rather than src/models/) so the whole
 * feature can be deleted in one shot — see src/jiraBacklog/README.md.
 */
const JiraIssueSchema = new Schema(
  {
    issueKey: { type: String, default: "" }, // e.g. "SUP-6983"
    url: { type: String, default: "" },
    // Consolidated triage state (replaces the old closed/checkedSquad/reviewSquad
    // booleans). One of lib/status.js STATUS_OPTIONS.
    status: { type: String, default: "Backlog" },
    desc: { type: String, default: "" },
    client: { type: String, default: "" },
    priority: { type: String, default: "" },
    squad: { type: String, default: "" },
    sprint: { type: String, default: "" },
    complexity: { type: String, default: "" },
    urgency: { type: Number, default: null }, // 0–100 or null
    urgencyOverridden: { type: Boolean, default: false },
    comment: { type: String, default: "" },
    bugType: { type: String, default: "" },
    scope: { type: String, default: "" },
    planTier: { type: String, default: "" },
    workaround: { type: String, default: "" },
    frustration: { type: String, default: "" },
    scopeConf: { type: String, default: "" },
    workaroundQ: { type: String, default: "" },
    custFrust: { type: String, default: "" },
    custPlan: { type: String, default: "" },
    spread: { type: String, default: "" },
    tlUrg: { type: String, default: "" },
    zdCount: { type: Number, default: null }, // linked Zendesk ticket count
    zdCountFetchedAt: { type: Date, default: null },
    order: { type: Number, default: 0 }, // insertion order ("All" view)
  },
  { timestamps: true },
);

// Mirror agendo's UserModel convention: an isolated collection in development.
const collectionName =
  process.env.NODE_ENV === "development" ? "dev-jira-issues" : "jira-issues";

export const JiraIssue = mongoose.model("JiraIssue", JiraIssueSchema, collectionName);
