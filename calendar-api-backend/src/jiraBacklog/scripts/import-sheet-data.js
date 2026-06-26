/**
 * One-time data import: replace the placeholder backlog with the real data from the
 * "SUP Jiras Backlog" Google Sheet (JIRAs tab). The cleaned sheet rows live in
 * seed/jiraBacklogSeed.js; this script applies them to an existing database (the
 * first-run seeding in jiraBacklogService only fires when the collection is EMPTY, so
 * a DB that already holds the placeholder rows needs this).
 *
 * Strategy: upsert by Jira key (issueKey). Each sheet row is written through the shared
 * mapSeedRecord() — identical to the documents first-run seeding produces — so existing
 * rows are overwritten field-for-field (including `status`, `urgency`, `order`) and new
 * rows are inserted. _ids are preserved, so any linked tasks stay attached. There are no
 * stale rows to delete (every key currently in the DB also exists in the sheet), so the
 * end state is the full 89-row sheet either way.
 *
 *   • Idempotent: re-running converges to the same state.
 *   • `order` is reset to the sheet's row order on every run.
 *   • Manual urgency overrides are reset (urgencyOverridden -> false) — expected for the
 *     placeholder-to-real cutover.
 *
 * Target collection (dev-jira-issues vs jira-issues) is chosen by flag, falling back to
 * NODE_ENV, then to development. Flags work the same in PowerShell, cmd, and bash — no
 * `NODE_ENV=… node …` prefix needed (that prefix is POSIX-only and fails in PowerShell).
 *
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/import-sheet-data.js            # dev (default)
 *     node src/jiraBacklog/scripts/import-sheet-data.js --prod     # production
 *     node src/jiraBacklog/scripts/import-sheet-data.js --dry-run  # preview, no writes
 *     node src/jiraBacklog/scripts/import-sheet-data.js --prod --wipe   # clean replace
 *
 * Flags:
 *     --prod / --production    target the production collection (jira-issues)
 *     --dev  / --development   target the dev collection (dev-jira-issues)
 *     --dry-run                report what would change; write nothing
 *     --wipe                   delete all rows first (clean replace). Changes _ids and so
 *                              orphans any tasks linked to the old rows — use only to drop
 *                              manual test rows whose key is not in the sheet.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";
import { JIRA_BACKLOG_SEED } from "../seed/jiraBacklogSeed.js";
import { mapSeedRecord } from "../seed/mapSeedRecord.js";

dotenv.config();

const flags = new Set(process.argv.slice(2).map((a) => a.toLowerCase()));
const has = (...names) => names.some((n) => flags.has(n));
const dryRun = has("--dry-run", "--dry");
const wipe = has("--wipe");

// Resolve the target env: explicit flag wins, then NODE_ENV (real env or .env), then dev.
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

  // Imported after NODE_ENV is finalised so the model binds to the right collection
  // (dev-jira-issues vs jira-issues is decided at module-eval time).
  const { JiraIssue } = await import("../jiraBacklogModel.js");
  const collection = JiraIssue.collection.name;

  const before = await JiraIssue.estimatedDocumentCount();
  const docs = JIRA_BACKLOG_SEED.map(mapSeedRecord); // order = sheet row order

  const statusTally = {};
  for (const doc of docs) statusTally[doc.status] = (statusTally[doc.status] || 0) + 1;

  if (dryRun) {
    const existing = new Set(
      (await JiraIssue.find({}, "issueKey").lean()).map((d) => d.issueKey),
    );
    const wouldInsert = docs.filter((d) => !existing.has(d.issueKey)).length;
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          target,
          collection,
          before,
          sheetRows: docs.length,
          wouldInsert,
          wouldUpdate: docs.length - wouldInsert,
          wipe,
          statusTally,
        },
        null,
        2,
      ),
    );
    await mongoose.disconnect();
    return;
  }

  if (wipe) await JiraIssue.deleteMany({});

  let inserted = 0;
  let updated = 0;
  for (const doc of docs) {
    const res = await JiraIssue.updateOne(
      { issueKey: doc.issueKey },
      { $set: doc },
      { upsert: true },
    );
    if (res.upsertedCount) inserted++;
    else updated++;
  }

  const after = await JiraIssue.estimatedDocumentCount();
  console.log(
    JSON.stringify(
      { target, collection, before, after, sheetRows: docs.length, wiped: wipe, inserted, updated, statusTally },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("[import-sheet-data] failed:", e);
  process.exit(1);
});
