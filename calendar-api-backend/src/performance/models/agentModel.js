import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * Someone Performance scores who has no agendo account (no `users` doc), e.g. a billing
 * specialist who never takes shifts. Their facts and setup are keyed by `agentId`
 * ("ext_<_id>") wherever a clerk id would go.
 *
 * Deliberately not a placeholder in `users`: first sign-in provisions a user only when
 * no doc has that email, and would leave a placeholder without its clerk id — the person
 * couldn't use agendo. Instead the link happens on read: once a `users` doc with this
 * email exists, services/directory.js resolves `agentId` to that user's clerk id, and
 * everything keyed by it follows. Identity data is never written.
 */
const AgentSchema = new Schema(
  {
    agentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    region: { type: String, enum: ["US", "BR", "IL", "APAC", null], default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-performance-agents" : "performance-agents";

export const Agent = mongoose.model("PerformanceAgent", AgentSchema, collectionName);
