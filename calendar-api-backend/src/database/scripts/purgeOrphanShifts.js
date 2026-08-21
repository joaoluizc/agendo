// One-off cleanup: delete old Shift documents that belong to no real agent.
//
// `Shift` is a single shared collection, but `User` is env-split into `dev-users`/`users`
// (see models/UserModel.js), so running the backend with NODE_ENV=development against the
// same cluster writes real rows into the production `shifts` collection keyed by a clerk
// id only `dev-users` knows. Shifts left behind by since-deleted accounts look the same.
// The hours report now ignores both (reportsService.js), but the rows still sit in Mongo —
// this removes the stale ones.
//
// Only shifts whose userId is a *known* `dev-users` account are deleted. Orphans whose
// clerk id is in neither collection are reported and left alone: those accounts are also
// gone from Clerk (checked — all 404), so there is no way to tell an old dev login apart
// from an ex-employee whose early shifts are real history. --include-unknown opts into
// deleting those too, if you know they were dev logins.
//
// Dry-run by default: prints what it would delete and changes nothing. Pass --apply to
// actually delete. Idempotent — safe to run again.
//
//   node src/database/scripts/purgeOrphanShifts.js                    # dry run, 3-month cutoff
//   node src/database/scripts/purgeOrphanShifts.js --apply
//   node src/database/scripts/purgeOrphanShifts.js --before=2026-05-21 --apply
//   node src/database/scripts/purgeOrphanShifts.js --include-unknown --apply
//
// Recent orphans are deliberately kept: dev shifts from the last few months are still
// someone's in-progress test data. Only shifts starting before the cutoff are purged.
//
// Reads `users` and `dev-users` by literal collection name rather than through the User
// model on purpose. The model binds to whichever collection NODE_ENV selects, so a local
// run (NODE_ENV=development) would otherwise compare production shifts against the
// 3-doc dev roster and consider every real agent an orphan.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";

dotenv.config();

const DEFAULT_CUTOFF_MONTHS = 3;
// A roster this small means we're pointed at the wrong collection or a half-empty
// database — deleting "orphans" off that comparison would wipe real shifts.
const MIN_EXPECTED_USERS = 5;

const apply = process.argv.includes("--apply");
const includeUnknown = process.argv.includes("--include-unknown");
const beforeArg = process.argv
  .find((arg) => arg.startsWith("--before="))
  ?.split("=")[1];

function resolveCutoff() {
  if (beforeArg) {
    const parsed = new Date(beforeArg);
    if (Number.isNaN(parsed.getTime())) {
      console.error(`--before=${beforeArg} is not a valid date. Aborting.`);
      process.exit(1);
    }
    return parsed;
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - DEFAULT_CUTOFF_MONTHS);
  return cutoff;
}

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  const cutoff = resolveCutoff();

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected (db: ${mongoose.connection.db.databaseName})`);
    const db = mongoose.connection.db;

    const realUsers = await db
      .collection("users")
      .find({ clerkId: { $exists: true, $ne: null } }, { projection: { clerkId: 1 } })
      .toArray();
    if (realUsers.length < MIN_EXPECTED_USERS) {
      console.error(
        `Only ${realUsers.length} user(s) with a clerkId in \`users\` — refusing to treat ` +
          `every shift as an orphan. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }
    const realClerkIds = realUsers.map((u) => u.clerkId);

    // Identifies which orphans are known dev accounts — the deletable ones, unless
    // --include-unknown widens it to every orphan.
    const devEmailByClerkId = new Map(
      (await db.collection("dev-users").find({}, { projection: { clerkId: 1, email: 1 } }).toArray())
        .map((u) => [u.clerkId, u.email]),
    );
    const devClerkIds = [...devEmailByClerkId.keys()].filter(
      (id) => id && !realClerkIds.includes(id),
    );

    const query = {
      startTime: { $lt: cutoff },
      // $nin still applies with --include-unknown: a dev-users id that also exists in the
      // real roster is the same person, not an orphan.
      userId: includeUnknown ? { $nin: realClerkIds } : { $in: devClerkIds },
    };

    const groups = await db
      .collection("shifts")
      .aggregate([
        { $match: query },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
            first: { $min: "$startTime" },
            last: { $max: "$startTime" },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const total = groups.reduce((sum, g) => sum + g.count, 0);
    console.log(
      `\nTargeted: ${total} shift(s) across ${groups.length} userId(s), starting before ` +
        `${cutoff.toISOString()}`,
    );
    for (const g of groups) {
      const who = devEmailByClerkId.get(g._id) ?? "not in dev-users either (deleted account?)";
      console.log(
        `  ${g._id} | ${g.count} shift(s) | ${g.first.toISOString().slice(0, 10)} -> ` +
          `${g.last.toISOString().slice(0, 10)} | ${who}`,
      );
    }

    // Everything the run leaves behind, spelled out — a purge that silently narrowed its
    // own scope reads like it covered everything.
    const keptRecent = await db
      .collection("shifts")
      .countDocuments({ userId: { $nin: realClerkIds }, startTime: { $gte: cutoff } });
    console.log(`\nKeeping ${keptRecent} orphan shift(s) at or after the cutoff.`);

    if (!includeUnknown) {
      const unidentified = await db.collection("shifts").aggregate([
        {
          $match: {
            startTime: { $lt: cutoff },
            userId: { $nin: [...realClerkIds, ...devClerkIds] },
          },
        },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray();
      const unidentifiedTotal = unidentified.reduce((sum, g) => sum + g.count, 0);
      if (unidentifiedTotal > 0) {
        console.log(
          `Keeping ${unidentifiedTotal} shift(s) across ${unidentified.length} unidentified ` +
            `userId(s) (in neither \`users\` nor \`dev-users\` — could be ex-employees). ` +
            `Pass --include-unknown to delete these too:`,
        );
        for (const g of unidentified) console.log(`  ${g._id} | ${g.count} shift(s)`);
      }
    }

    if (!apply) {
      console.log("\nDry run — nothing deleted. Re-run with --apply to delete.");
      return;
    }
    if (total === 0) {
      console.log("\nNothing to delete.");
      return;
    }

    const result = await db.collection("shifts").deleteMany(query);
    console.log(`\nDeleted ${result.deletedCount} shift(s).`);
    console.log(
      "Note: the hours report caches its results in Redis for up to 24h " +
        "(`reports:hours:*`) — flush those keys to see the change immediately.",
    );
  } catch (err) {
    console.error("Purge failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  }
};

run();
