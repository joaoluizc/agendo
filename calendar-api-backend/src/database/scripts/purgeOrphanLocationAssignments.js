// One-off cleanup: remove entries from `locations.assignedUsers` that point at no real user.
//
// `assignedUsers` is a bare array of clerk id strings with no ref and nothing enforcing
// that the ids exist, so an id stays behind whenever the account it named goes away. Two
// ways that happened before offboarding existed:
//
//   - someone was deleted from Mongo by hand (until now, the only way to cut access), and
//     nothing went back to tidy their assignments;
//   - `locations` only became env-split later (see models/LocationModel.js), so a local
//     run with NODE_ENV=development wrote `dev-users` clerk ids into the production
//     documents.
//
// `DELETE /user/:clerkId` now pulls the id as part of offboarding (services/offboardService.js),
// so this is for the backlog that predates it. 3 such assignments were found on 2026-10-06.
//
// Unlike an orphan *shift*, an orphan assignment has no historical value: `assignedUsers`
// is current configuration, read to group the hours report by location
// (reports/reportsService.js:179) and to render the locations editor. An id naming nobody
// can only mislead, so every orphan is removed — there is no --include-unknown here.
//
// Dry-run by default: prints what it would remove and changes nothing. Pass --apply to
// actually write. Idempotent — safe to run again.
//
//   node src/database/scripts/purgeOrphanLocationAssignments.js            # dry run
//   node src/database/scripts/purgeOrphanLocationAssignments.js --apply
//   node src/database/scripts/purgeOrphanLocationAssignments.js --dev --apply
//
// Reads the collections by literal name rather than through the models, for the reason
// purgeOrphanShifts.js spells out: a model binds to whichever collection NODE_ENV selects,
// so a local run would otherwise compare production locations against the 3-doc dev roster
// and call every real agent an orphan. --dev picks the `dev-*` pair explicitly instead.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";

dotenv.config();

const apply = process.argv.includes("--apply");
const dev = process.argv.includes("--dev");

const usersCollection = dev ? "dev-users" : "users";
const locationsCollection = dev ? "dev-locations" : "locations";

// A roster this small means we're pointed at the wrong collection or a half-empty
// database — clearing "orphans" off that comparison would strip every real assignment.
const MIN_EXPECTED_USERS = dev ? 1 : 5;

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log(
      `MongoDB connected (db: ${db.databaseName}) — reading \`${locationsCollection}\` ` +
        `against \`${usersCollection}\``,
    );

    const users = await db
      .collection(usersCollection)
      .find({ clerkId: { $exists: true, $ne: null } }, { projection: { clerkId: 1, email: 1 } })
      .toArray();
    if (users.length < MIN_EXPECTED_USERS) {
      console.error(
        `Only ${users.length} user(s) with a clerkId in \`${usersCollection}\` — refusing ` +
          `to treat every assignment as an orphan. Aborting.`,
      );
      process.exitCode = 1;
      return;
    }
    const realClerkIds = new Set(users.map((u) => u.clerkId));
    console.log(`${realClerkIds.size} user(s) on the roster.`);

    const locations = await db
      .collection(locationsCollection)
      .find({}, { projection: { name: 1, assignedUsers: 1 } })
      .toArray();

    const stale = locations
      .map((location) => ({
        location,
        orphans: (location.assignedUsers || []).filter((id) => !realClerkIds.has(id)),
      }))
      .filter(({ orphans }) => orphans.length > 0);

    const total = stale.reduce((sum, { orphans }) => sum + orphans.length, 0);
    const assignedTotal = locations.reduce(
      (sum, l) => sum + (l.assignedUsers || []).length,
      0,
    );
    console.log(
      `\n${total} orphan assignment(s) across ${stale.length} of ${locations.length} ` +
        `location(s), out of ${assignedTotal} assignment(s) in all:`,
    );
    for (const { location, orphans } of stale) {
      console.log(`  ${location.name} (${location._id})`);
      for (const id of orphans) console.log(`    - ${id}`);
    }

    if (total === 0) {
      console.log("\nNothing to remove.");
      return;
    }
    if (!apply) {
      console.log("\nDry run — nothing changed. Re-run with --apply to remove these.");
      return;
    }

    let updated = 0;
    for (const { location, orphans } of stale) {
      // Pull exactly the ids this run reported, rather than rewriting the whole array:
      // an admin editing the same location meanwhile keeps their change.
      const result = await db
        .collection(locationsCollection)
        .updateOne({ _id: location._id }, { $pull: { assignedUsers: { $in: orphans } } });
      updated += result.modifiedCount;
    }
    console.log(`\nUpdated ${updated} location(s), removing ${total} assignment(s).`);
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
