// One-off migration: give every existing user an explicit `permissions` set when per-area
// permissions are introduced (docs/permissions-plan.md §10, docs/knowledge/permissions.md).
//
// Until this runs, a user with no `permissions` reads as "none" everywhere — the evaluator
// fails closed — so it must run right after the phase-1 deploy, before anything enforces.
// What each user gets is in src/permissions/backfill.js: today's access (schedule view,
// Performance edit for the PERFORMANCE_ACCESS_EMAILS allowlist) plus their own report.
//
// Only documents with no `permissions` at all are touched, and each write re-checks that
// in its filter, so it is idempotent and never overwrites a grant an admin has made.
// Every write also appends a `via: "migration"` record to the matching audit collection.
//
// Dry-run by default: prints counts and writes nothing. --apply writes.
//
//   node src/database/scripts/backfillPermissions.js                          # dry run, both
//   node src/database/scripts/backfillPermissions.js --collection=dev-users --apply
//   node src/database/scripts/backfillPermissions.js --collection=users --apply
//
// Reads `users` and `dev-users` by literal collection name (not through the User model,
// which binds to whichever one NODE_ENV selects), so NODE_ENV does not matter here.
//
// PERFORMANCE_ACCESS_EMAILS is read from the environment, as the app reads it — and the
// real list lives in Render's environment, not in a local .env. For the production run,
// pass Render's value explicitly; --apply on `users` refuses to run with an empty list
// unless --allow-empty-allowlist says that is intended:
//
//   PERFORMANCE_ACCESS_EMAILS="<value from Render>" node src/database/scripts/backfillPermissions.js --collection=users --apply
//
// Output is counts only. Allowlist entries that match nobody are printed, so a typo in the
// env var is visible — that list comes from your own environment and stays on your console.

import mongoose from "mongoose";
import dotenv from "dotenv";
import process from "process";
import { permissionsForExistingUser, parseAllowlist } from "../../permissions/backfill.js";
import { PERMISSION_AUDIT_COLLECTIONS } from "../../models/PermissionAuditModel.js";

dotenv.config();

// A production roster this small means the wrong database or a half-empty one.
const MIN_EXPECTED_USERS = 5;

const TARGETS = {
  users: { audit: PERMISSION_AUDIT_COLLECTIONS.production, floor: MIN_EXPECTED_USERS },
  "dev-users": { audit: PERMISSION_AUDIT_COLLECTIONS.development, floor: 0 },
};

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const allowEmptyAllowlist = process.argv.includes("--allow-empty-allowlist");
const collectionArg =
  process.argv.find((arg) => arg.startsWith("--collection="))?.split("=")[1] ?? "both";

const LEGACY_FILTER = { permissions: { $exists: false } };

function selectedCollections() {
  if (collectionArg === "both") return Object.keys(TARGETS);
  if (TARGETS[collectionArg]) return [collectionArg];
  console.error(`--collection must be users, dev-users or both (got "${collectionArg}"). Aborting.`);
  process.exit(1);
}

async function backfill(db, name, allowlist) {
  const { audit, floor } = TARGETS[name];
  const users = db.collection(name);
  const total = await users.countDocuments({});
  console.log(`\n== ${name}: ${total} user(s)`);

  if (total < floor && !force) {
    console.error(
      `   Fewer than ${floor} users — wrong database? Skipping. Re-run with --force if this is right.`,
    );
    process.exitCode = 1;
    return;
  }

  // The allowlist lives in Render's environment, not necessarily in a local .env. Writing
  // production with an empty one would silently drop Performance for every non-admin on it.
  if (apply && name === "users" && allowlist.size === 0 && !allowEmptyAllowlist) {
    console.error(
      "   PERFORMANCE_ACCESS_EMAILS is empty here. Set it to the value from Render's environment, " +
        "or pass --allow-empty-allowlist if nobody outside the admins should keep Performance. Skipping.",
    );
    process.exitCode = 1;
    return;
  }

  const legacy = await users
    .find(LEGACY_FILTER, { projection: { email: 1, clerkId: 1, type: 1 } })
    .toArray();
  const matchedAllowlist = new Set();
  const plan = legacy.map((user) => {
    const permissions = permissionsForExistingUser(user, allowlist);
    if (permissions.performance === "edit") {
      matchedAllowlist.add(String(user.email).trim().toLowerCase());
    }
    return { user, permissions };
  });

  const admins = plan.filter(({ user }) => user.type === "admin").length;
  const performanceAdmins = plan.filter(
    ({ user, permissions }) => permissions.performance === "edit" && user.type === "admin",
  ).length;
  const performanceOthers = plan.filter(
    ({ user, permissions }) => permissions.performance === "edit" && user.type !== "admin",
  ).length;

  console.log(
    `   ${legacy.length} without permissions (${admins} admin, ${legacy.length - admins} other); ` +
      `${total - legacy.length} already set.`,
  );
  console.log(
    `   Each gets scheduling:view, bugs:none, reports:self. performance:edit from the allowlist: ` +
      `${performanceOthers} non-admin, ${performanceAdmins} admin (admins have it anyway).`,
  );

  if (!legacy.length) {
    console.log("   Nothing to backfill.");
    return matchedAllowlist;
  }
  if (!apply) {
    console.log("   Dry run — nothing written. Re-run with --apply to write.");
    return matchedAllowlist;
  }

  const audits = db.collection(audit);
  let written = 0;
  for (const { user, permissions } of plan) {
    const at = new Date();
    const result = await users.updateOne(
      { _id: user._id, ...LEGACY_FILTER },
      {
        $set: {
          permissions,
          permissionsUpdatedAt: at,
          permissionsUpdatedBy: "migration",
        },
      },
    );
    if (result.modifiedCount !== 1) {
      continue; // set by someone else since we read it — leave theirs alone
    }
    written++;
    await audits.insertOne({
      at,
      via: "migration",
      actorClerkId: "migration",
      targetClerkId: user.clerkId ?? null,
      targetUserId: user._id,
      before: { type: user.type, permissions: null },
      after: { type: user.type, permissions },
    });
  }
  const remaining = await users.countDocuments(LEGACY_FILTER);
  console.log(`   Wrote ${written}; ${remaining} still without permissions. Audit: ${audit}.`);
  return matchedAllowlist;
}

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  const collections = selectedCollections();
  const allowlist = parseAllowlist(process.env.PERFORMANCE_ACCESS_EMAILS);
  console.log(
    `${apply ? "APPLY" : "Dry run"} — collections: ${collections.join(", ")}; ` +
      `Performance allowlist: ${allowlist.size} address(es).`,
  );

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const { db } = mongoose.connection;
    const matched = new Set();
    for (const name of collections) {
      const found = await backfill(db, name, allowlist);
      found?.forEach((email) => matched.add(email));
    }
    const unmatched = [...allowlist].filter((email) => !matched.has(email));
    if (unmatched.length) {
      console.log(
        `\nAllowlist entries with no user still to backfill (typo, or already set): ${unmatched.join(", ")}`,
      );
    }
  } catch (err) {
    console.error("Backfill failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
