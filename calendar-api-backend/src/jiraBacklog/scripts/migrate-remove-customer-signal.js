/**
 * One-time cleanup: drop the legacy "customer signal" fields
 * (custFrust / custPlan / spread / tlUrg) from every issue document. These fields were
 * removed from the schema and UI; this $unsets the dormant values left behind in existing
 * documents so they stop riding along in API responses (lean() returns stored fields even
 * when they're no longer in the schema).
 *
 * Idempotent: only documents that still carry one of the fields are matched, so re-running
 * is a no-op. Operates on the raw collection, so it doesn't depend on the Mongoose schema.
 *
 * Targets dev-jira-issues or jira-issues based on NODE_ENV (same rule as the model).
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/migrate-remove-customer-signal.js              # uses NODE_ENV from .env
 *     NODE_ENV=production node src/jiraBacklog/scripts/migrate-remove-customer-signal.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const LEGACY = ["custFrust", "custPlan", "spread", "tlUrg"];
const collectionName =
  process.env.NODE_ENV === "development" ? "dev-jira-issues" : "jira-issues";

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.collection(collectionName);

  const filter = { $or: LEGACY.map((k) => ({ [k]: { $exists: true } })) };
  const matched = await coll.countDocuments(filter);
  const unset = Object.fromEntries(LEGACY.map((k) => [k, ""]));
  const res = await coll.updateMany(filter, { $unset: unset });

  console.log(
    JSON.stringify(
      { collection: collectionName, matched, modified: res.modifiedCount },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("[migrate-remove-customer-signal] failed:", e);
  process.exit(1);
});
