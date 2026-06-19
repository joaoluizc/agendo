/**
 * One-time migration: collapse the three legacy booleans
 * (closed / checkedSquad / reviewSquad) into the single `status` field, using the
 * shared deriveStatus() decision tree, then $unset the booleans.
 *
 * Idempotent: a document that no longer carries any legacy boolean is skipped, so
 * re-running is safe. Operates on the raw collection, so it does not depend on the
 * Mongoose schema still knowing about the old fields.
 *
 * Targets dev-jira-issues or jira-issues based on NODE_ENV (same rule as the model).
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/migrate-status.js              # uses NODE_ENV from .env
 *     NODE_ENV=production node src/jiraBacklog/scripts/migrate-status.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { deriveStatus } from "../lib/status.js";

dotenv.config();

const LEGACY = ["closed", "checkedSquad", "reviewSquad"];
const collectionName =
  process.env.NODE_ENV === "development" ? "dev-jira-issues" : "jira-issues";

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.collection(collectionName);
  const docs = await coll.find({}).toArray();

  let migrated = 0;
  let skipped = 0;
  const tally = {};
  for (const d of docs) {
    const hasLegacy = LEGACY.some((k) => k in d);
    if (!hasLegacy && d.status) {
      skipped++;
      continue;
    }
    const status = deriveStatus(d);
    tally[status] = (tally[status] || 0) + 1;
    await coll.updateOne(
      { _id: d._id },
      { $set: { status }, $unset: { closed: "", checkedSquad: "", reviewSquad: "" } },
    );
    migrated++;
  }

  console.log(
    JSON.stringify(
      { collection: collectionName, total: docs.length, migrated, skipped, tally },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("[migrate-status] failed:", e);
  process.exit(1);
});
