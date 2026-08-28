// One-off migration: stamp `status: "published"` onto Shift documents written before the
// draft/published lifecycle existed.
//
// Every shift created before that change has no `status` field, which breaks in two
// directions at once (see the comment in models/ShiftModel.js):
//
//   - a query for `{ status: "published" }` matches none of them, and
//   - Mongoose applies `default: "draft"` when it *hydrates* one, so a legacy shift reads
//     back claiming to be a draft — silently dropped from calendars and reports.
//
// Those shifts are real, published history: they were synced to agents' calendars when
// they were created, because that was the only behaviour then. `source: "ui"` is stamped
// with them, since a human creating one by hand was the only way in.
//
// This is cleanup, not a prerequisite. `status` has no schema default precisely so that a
// document without one reads as published everywhere — see models/ShiftModel.js — so the
// app is correct before this ever runs. Running it makes the data describe itself instead
// of relying on that convention, and is a prerequisite only if the `$ne: "draft"` filters
// are ever tightened to `= "published"`. Idempotent; safe to re-run any time.
//
// Dry-run by default: prints what it would change and writes nothing. Pass --apply to
// actually write.
//
//   node src/database/scripts/backfillShiftStatus.js              # dry run
//   node src/database/scripts/backfillShiftStatus.js --apply
//
// Uses the native collection rather than the Mongoose model so the $set isn't reshaped by
// schema casting, and reads `shifts` by the model's own collection name — unlike `users`,
// `shifts` is NOT env-split, so NODE_ENV does not change which collection this touches.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";
import Shift from "../../models/ShiftModel.js";

dotenv.config();

const apply = process.argv.includes("--apply");

// A legacy shift is one with no `status` at all. Anything already carrying the field was
// written by the new code and is left alone, which is what makes this re-runnable.
const LEGACY_FILTER = { status: { $exists: false } };

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const { name } = Shift.collection;
    console.log(`MongoDB connected — collection "${name}"`);

    const total = await Shift.collection.countDocuments({});
    const legacy = await Shift.collection.countDocuments(LEGACY_FILTER);
    const drafts = await Shift.collection.countDocuments({ status: "draft" });
    const published = await Shift.collection.countDocuments({ status: "published" });

    console.log(
      `${total} shift(s) total: ${legacy} with no status, ${published} published, ${drafts} draft.`,
    );

    if (legacy === 0) {
      console.log("Nothing to backfill.");
      return;
    }

    if (!apply) {
      console.log(
        `Dry run — would set status:"published", source:"ui" on ${legacy} shift(s). ` +
          "Re-run with --apply to write.",
      );
      return;
    }

    const result = await Shift.collection.updateMany(LEGACY_FILTER, {
      $set: { status: "published", source: "ui" },
    });

    const remaining = await Shift.collection.countDocuments(LEGACY_FILTER);
    console.log(
      `Backfilled. Matched ${result.matchedCount}, modified ${result.modifiedCount}, ` +
        `${remaining} still without a status.`,
    );
  } catch (err) {
    console.error("Backfill failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  }
};

run();
