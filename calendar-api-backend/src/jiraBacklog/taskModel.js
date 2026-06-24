import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * Tasks layer on top of the Jira backlog. A ticket (JiraIssue) can have many tasks;
 * each task carries a status drawn from a shared, customizable set (TaskStatus).
 *
 * These are top-level collections (rather than arrays embedded on the issue) because
 * the kanban page queries every task across all tickets and groups by status, and the
 * "can't delete a status that still has tasks" guard counts tasks by statusId — both
 * cheap on a collection, awkward on embedded arrays.
 *
 * Self-contained inside the module folder (like jiraBacklogModel.js) so the whole
 * feature can be deleted in one shot — see src/jiraBacklog/README.md.
 */

// A kanban column. `order` drives the left-to-right column order; defaults are seeded
// once in taskService.seedStatusesIfEmpty (Not done / Doing / Done).
const TaskStatusSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// A single task linked to one ticket. `order` preserves within-column ordering.
const JiraTaskSchema = new Schema(
  {
    issueId: { type: Schema.Types.ObjectId, ref: "JiraIssue", required: true, index: true },
    title: { type: String, required: true, trim: true },
    statusId: { type: Schema.Types.ObjectId, ref: "TaskStatus", required: true, index: true },
    order: { type: Number, default: 0 }, // within-column order
  },
  { timestamps: true },
);

// Mirror agendo's convention: isolated collections in development.
const isDev = process.env.NODE_ENV === "development";
const statusCollection = isDev ? "dev-task-statuses" : "task-statuses";
const taskCollection = isDev ? "dev-jira-tasks" : "jira-tasks";

export const TaskStatus = mongoose.model("TaskStatus", TaskStatusSchema, statusCollection);
export const JiraTask = mongoose.model("JiraTask", JiraTaskSchema, taskCollection);
