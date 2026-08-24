/**
 * Read-only end-to-end check of the DOMO half of MRR resolution: email -> owner account ->
 * latest-complete-month MRR. Touches no database and writes nothing — it only runs the same
 * two lib/domoClient.js functions the refresh endpoint uses.
 *
 * CLIENT DATA NEVER LIVES IN THIS REPO. The accounts to check are read from
 * `scripts/mrr-verification-accounts.local.json`, which is gitignored. Real customer account
 * emails, account ids, and revenue figures must not be committed — this repo is public.
 *
 * Create the fixture locally (see the four shapes it must cover, below):
 *
 *   [
 *     {
 *       "email": "<requester or account email to resolve>",
 *       "expectOwnerEmail": "<the owner account it must resolve to>",
 *       "expectSource": "billing_master",   // or "account"
 *       "expectNonZero": true,
 *       "note": "why this case is here"
 *     }
 *   ]
 *
 * The four shapes worth pinning — pick one real account for each from Domo:
 *
 *   1. `expectSource: "billing_master"` — an invoiced reseller (`is_ivr = 1`) whose own
 *      account_id has NO revenue rows because its charges are booked on its billing master.
 *      This is the case the billing-master fallback exists for; without it the account
 *      reports $0. The regression guard.
 *   2. `expectSource: "account"` — an invoiced reseller whose charges ARE booked on its own
 *      account_id, while `billing_master_accountid` points at a group master billing many
 *      sibling accounts. Guards against "just always use the billing master", which would
 *      attribute the whole group's revenue to this one client.
 *   3. `expectSource: "account"` — an account whose own id and billing master agree, so it
 *      must be unaffected either way (a good pick: whichever account an MRR override targets).
 *   4. A STAFF account that must roll up through `parent_account_uuid` to its owner, and
 *      report exactly that owner's MRR. Set `crossCheckWith` to the owner's entry `email` to
 *      assert the two produce an identical figure.
 *
 * Assertions are on SHAPE (which key produced the number, whether it's non-zero), never on
 * dollar amounts — those move every month, and they do not belong in source control.
 *
 * Requires the `# === MRR resolution ===` DOMO vars in calendar-api-backend/.env.
 *
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/verify-mrr-resolution.js
 *
 * Exits 0 when every case matches, 1 otherwise.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import process from "process";
import { resolveOwnerAccount, fetchMrrForOwner } from "../lib/domoClient.js";
import { domoConfig } from "../lib/config.js";

dotenv.config();

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "mrr-verification-accounts.local.json");

/** Amounts are printed for eyeballing only — never asserted on, never committed. */
const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function loadCases() {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(
      `Missing ${path.basename(FIXTURE)}.\n` +
        "This script reads its accounts from a gitignored local fixture so that client\n" +
        "identifiers and revenue figures stay out of the repo. See the header of this file\n" +
        "for the format and the four shapes to cover.",
    );
  }
  const cases = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  if (!Array.isArray(cases) || !cases.length) throw new Error(`${path.basename(FIXTURE)} must be a non-empty array.`);
  return cases;
}

async function run() {
  if (!domoConfig.clientId || !domoConfig.clientSecret) {
    throw new Error("DOMO is not configured — set DOMO_CLIENT_ID / DOMO_CLIENT_SECRET in .env");
  }

  const cases = loadCases();
  const failures = [];
  const byEmail = new Map();

  for (const c of cases) {
    console.log(`\n### ${c.email}`);
    if (c.note) console.log(`    (${c.note})`);

    const owner = await resolveOwnerAccount(c.email);
    if (!owner) {
      console.log("    FAIL — resolved to no account at all");
      failures.push(`${c.email}: no account match`);
      continue;
    }

    const result = await fetchMrrForOwner({
      accountId: owner.ownerAccountId,
      instance: owner.ownerInstance,
      billingMasterAccountId: owner.ownerBillingMasterAccountId,
    });
    byEmail.set(c.email, { owner, result });

    console.log(
      `    owner       ${owner.ownerEmail} (${owner.ownerAccountId}/${owner.ownerInstance})` +
        `  billing master ${owner.ownerBillingMasterAccountId}` +
        (owner.ownerBillingMasterName ? ` (${owner.ownerBillingMasterName})` : ""),
    );
    console.log(`    MRR         ${money(result.mrr)}  via ${result.source} ${result.accountIdUsed}  [month ${result.latestMonth}]`);

    const problems = [];
    if (c.expectOwnerEmail && owner.ownerEmail?.toLowerCase() !== c.expectOwnerEmail.toLowerCase()) {
      problems.push(`owner is ${owner.ownerEmail}, expected ${c.expectOwnerEmail}`);
    }
    if (c.expectSource && result.source !== c.expectSource) {
      problems.push(`MRR came from "${result.source}", expected "${c.expectSource}"`);
    }
    if (c.expectNonZero && !(result.mrr > 0)) {
      problems.push(`MRR is ${money(result.mrr)}, expected a non-zero amount`);
    }

    if (problems.length) {
      problems.forEach((p) => console.log(`    FAIL — ${p}`));
      failures.push(`${c.email}: ${problems.join("; ")}`);
    } else {
      console.log("    OK");
    }
  }

  // A roll-up case must land on exactly the same number as the owner it rolls up to — catches
  // a roll-up that resolves to the right *name* but the wrong account row.
  for (const c of cases.filter((x) => x.crossCheckWith)) {
    const a = byEmail.get(c.email);
    const b = byEmail.get(c.crossCheckWith);
    if (!a || !b) continue;
    console.log(`\n### cross-check: ${c.email} matches ${c.crossCheckWith}`);
    if (a.result.mrr === b.result.mrr) {
      console.log(`    OK — both ${money(b.result.mrr)}`);
    } else {
      console.log(`    FAIL — ${money(a.result.mrr)} vs ${money(b.result.mrr)}`);
      failures.push(`${c.email}: MRR differs from ${c.crossCheckWith}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  if (failures.length) {
    console.log(`${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log(`All ${cases.length} case(s) + cross-checks passed.`);
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
