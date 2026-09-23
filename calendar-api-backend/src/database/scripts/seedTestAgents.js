// Test agents for local runs: twelve fake agents, three per location, so the location
// flags (the grid's filter, the duplicate dialog) have real people to work with. A local
// run's roster is `dev-users`, which holds a handful of real dev logins with no location.
//
// What it touches, and why each is safe:
//   - `dev-users` — the test agents themselves. Local-only collection (models/UserModel.js).
//     Clerk ids are `test_<name>`: no Clerk account exists, so nothing can sign in as them,
//     they have no avatar, and a publish that tries to sync them to Google fails and says
//     so — the shift is still published.
//   - `dev-locations` — local-only too (models/LocationModel.js). Created from the
//     production location *names* if empty (never their assignments), then the test agents
//     are added to the four flag locations.
//   - `shifts` — only with --shifts-on. This collection is NOT env-split, so the drafts land
//     beside production data. Production never shows them (no production user has a
//     `test_` id, the grid drops off-roster shifts, reports skip them), and --remove
//     deletes every shift whose userId starts with `test_`.
//
// Dry-run by default: prints what it would do and writes nothing. Idempotent.
//
//   node src/database/scripts/seedTestAgents.js                              # dry run
//   node src/database/scripts/seedTestAgents.js --apply
//   node src/database/scripts/seedTestAgents.js --apply --shifts-on=2027-01-11
//   node src/database/scripts/seedTestAgents.js --remove --apply
//
// Models are imported after NODE_ENV is forced to development, and every write is refused
// unless they bound to the dev collections.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";

dotenv.config();
process.env.NODE_ENV = "development";

const apply = process.argv.includes("--apply");
const remove = process.argv.includes("--remove");
const shiftsOn = process.argv
  .find((arg) => arg.startsWith("--shifts-on="))
  ?.split("=")[1];

const TEST_PREFIX = "test_";
const TEST_ID = /^test_/;

/** Three per flag location, named so they read as test data on the grid ("Casey T."). */
const AGENTS = {
  Colorado: ["Casey", "Morgan", "Riley"],
  LATAM: ["Bia", "Caio", "Lu"],
  Israel: ["Dana", "Eitan", "Tamar"],
  APAC: ["Joy", "Mark", "Rina"],
};

/**
 * A plausible day per agent, as [startHour, endHour, position type] in local time. Each
 * location starts at a different hour so the grid's first-shift ordering has something to
 * sort, and each agent gets a break so off-duty positions are represented.
 */
const DAY_PLAN = {
  Colorado: [[12, 16, "live channel"], [16, 17, "break"], [17, 20, "tickets"]],
  LATAM: [[8, 11, "live channel"], [11, 12, "break"], [12, 16, "tickets"]],
  Israel: [[3, 6, "tickets"], [6, 7, "break"], [7, 10, "live channel"]],
  APAC: [[0, 3, "live channel"], [3, 4, "break"], [4, 7, "tickets"]],
};

const agentsFor = (location) =>
  AGENTS[location].map((firstName) => ({
    clerkId: `${TEST_PREFIX}${firstName.toLowerCase()}`,
    firstName,
    lastName: "Test",
    // .test is reserved (RFC 2606): it can never deliver anywhere.
    email: `${firstName.toLowerCase()}@agendo.test`,
    type: "normal",
  }));

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  if (shiftsOn && !/^\d{4}-\d{2}-\d{2}$/.test(shiftsOn)) {
    console.error(`--shifts-on must be YYYY-MM-DD, got "${shiftsOn}". Aborting.`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  // Skill first: User's pre-save hook looks it up by name.
  await import("../../models/SkillModel.js");
  const { User } = await import("../../models/UserModel.js");
  const { default: Location } = await import("../../models/LocationModel.js");
  const { default: Shift } = await import("../../models/ShiftModel.js");
  const { default: Position } = await import("../../models/PositionModel.js");

  const bound = {
    users: User.collection.name,
    locations: Location.collection.name,
  };
  if (bound.users !== "dev-users" || bound.locations !== "dev-locations") {
    console.error(`Refusing to run: models bound to ${JSON.stringify(bound)}.`);
    process.exit(1);
  }
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${JSON.stringify(bound)}, shifts in "${Shift.collection.name}"`);

  if (remove) {
    const users = await User.countDocuments({ clerkId: TEST_ID });
    const shifts = await Shift.countDocuments({ userId: TEST_ID });
    const locations = await Location.countDocuments({ assignedUsers: TEST_ID });
    console.log(`Would remove ${users} test agents, ${shifts} of their shifts, and unassign them from ${locations} dev locations.`);
    if (apply) {
      await Shift.deleteMany({ userId: TEST_ID });
      await Location.updateMany({}, { $pull: { assignedUsers: { $regex: "^test_" } } });
      await User.deleteMany({ clerkId: TEST_ID });
      console.log("Removed.");
    }
    await mongoose.disconnect();
    return;
  }

  // Dev locations: the production names, no production assignments.
  if ((await Location.countDocuments()) === 0) {
    const names = (
      await mongoose.connection.db.collection("locations").find({}, { projection: { name: 1 } }).toArray()
    ).map((location) => location.name);
    const toCreate = [...new Set([...names, ...Object.keys(AGENTS)])];
    console.log(`dev-locations is empty — would create: ${toCreate.join(", ")}`);
    if (apply) await Location.insertMany(toCreate.map((name) => ({ name, assignedUsers: [] })));
  }

  for (const location of Object.keys(AGENTS)) {
    const agents = agentsFor(location);
    const existing = new Set(
      (await User.find({ clerkId: { $in: agents.map((a) => a.clerkId) } }, { clerkId: 1 })).map((u) => u.clerkId)
    );
    const missing = agents.filter((agent) => !existing.has(agent.clerkId));
    console.log(`${location}: ${missing.length} to create (${missing.map((a) => a.firstName).join(", ") || "none"}), ${existing.size} already there`);
    if (!apply) continue;
    for (const agent of missing) await new User(agent).save();
    await Location.updateOne(
      { name: location },
      { $addToSet: { assignedUsers: { $each: agents.map((a) => a.clerkId) } } },
      { upsert: true }
    );
  }

  if (shiftsOn) {
    const [year, month, day] = shiftsOn.split("-").map(Number);
    const positions = await Position.find({}, { name: 1, type: 1 }).lean();
    const byType = (type) => positions.find((position) => position.type === type) ?? positions[0];
    const dayStart = new Date(year, month - 1, day);
    const dayEnd = new Date(year, month - 1, day + 1);

    for (const location of Object.keys(AGENTS)) {
      for (const agent of agentsFor(location)) {
        const already = await Shift.countDocuments({
          userId: agent.clerkId,
          startTime: { $gte: dayStart, $lt: dayEnd },
        });
        if (already) {
          console.log(`${agent.firstName}: already has ${already} shift(s) on ${shiftsOn}, skipped`);
          continue;
        }
        const shifts = DAY_PLAN[location].map(([from, to, type]) => ({
          userId: agent.clerkId,
          startTime: new Date(year, month - 1, day, from),
          endTime: new Date(year, month - 1, day, to),
          positionId: byType(type)._id,
          createdBy: "seedTestAgents",
          status: "draft",
          source: "seedTestAgents",
        }));
        console.log(`${agent.firstName}: ${shifts.length} drafts on ${shiftsOn}`);
        if (apply) await Shift.insertMany(shifts);
      }
    }
  }

  if (!apply) console.log("Nothing written. Re-run with --apply.");
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("[seedTestAgents] failed:", error);
  process.exit(1);
});
