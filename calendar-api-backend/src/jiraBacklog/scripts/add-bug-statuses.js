/**
 * One-time, idempotent: ensure every canonical issue status (STATUS_OPTIONS in lib/status.js)
 * exists in the BugStatus collection. First-run seeding only fires on an EMPTY collection, so
 * a database seeded before new statuses were added (e.g. "Possible No-ETA", "No-ETA") needs
 * this to surface them in the status dropdown. Existing statuses are left untouched; any
 * missing ones are appended (order = current max + 1). Re-running is a no-op.
 *
 * Target collection (dev-bug-statuses vs bug-statuses) is chosen by flag, falling back to
 * NODE_ENV, then development. Flags work the same in PowerShell, cmd, and bash — no POSIX
 * `NODE_ENV=… node …` prefix needed.
 *
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/add-bug-statuses.js            # dev (default)
 *     node src/jiraBacklog/scripts/add-bug-statuses.js --prod     # production
 *     node src/jiraBacklog/scripts/add-bug-statuses.js --dry-run  # preview, writes nothing
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";
import { STATUS_OPTIONS } from "../lib/status.js";

dotenv.config();

const flags = new Set(process.argv.slice(2).map((a) => a.toLowerCase()));
const has = (...names) => names.some((n) => flags.has(n));
const dryRun = has("--dry-run", "--dry");

const target = has("--prod", "--production")
  ? "production"
  : has("--dev", "--development")
    ? "development"
    : process.env.NODE_ENV || "development";
// Set before importing the model so it binds to the matching collection.
process.env.NODE_ENV = target;

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);

  const { BugStatus } = await import("../bugStatusModel.js");
  const collection = BugStatus.collection.name;

  const existing = await BugStatus.find().select("name order").lean();
  const present = new Set(existing.map((s) => s.name));
  const missing = STATUS_OPTIONS.filter((name) => !present.has(name));

  let nextOrder = existing.reduce((max, s) => Math.max(max, s.order ?? 0), -1) + 1;
  const toInsert = missing.map((name) => ({ name, order: nextOrder++ }));

  if (!dryRun && toInsert.length) await BugStatus.insertMany(toInsert);

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        target,
        collection,
        existing: existing.length,
        inserted: dryRun ? 0 : toInsert.length,
        names: missing,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("[add-bug-statuses] failed:", e);
  process.exit(1);
});
