/**
 * Read-only end-to-end check of the DOMO half of MRR resolution: email -> owner account ->
 * latest-complete-month MRR. Touches no database and writes nothing — it only runs the same
 * two lib/domoClient.js functions the refresh endpoint uses, against four accounts chosen to
 * cover every shape the resolver has to handle.
 *
 * Why these four (all verified live 2026-08-24, latest complete month 2026-07):
 *
 *   websitebuilder@thryv.com     IVR sub whose charges are booked on its BILLING MASTER.
 *                                Own account_id (576/dex) has zero revenue rows; the money
 *                                ($105,797.32) sits on thryv-master@dexyp.com (596/dex).
 *                                This is the case that used to report $0 — the regression
 *                                guard for the billing-master fallback.
 *   websitebuilder@register.it   IVR sub whose charges ARE booked on its own account_id
 *                                (2085490/duda). Its billing_master_accountid points at
 *                                dada_eu_master@dudamobile.com, which bills 10 sibling
 *                                accounts — so an unconditional roll-up would more than
 *                                double this client's MRR. The guard against "just always
 *                                use the billing master".
 *   duda-owner-ionos@ionos.com   The seeded 1&1/IONOS override target. Own id and billing
 *                                master agree, so it must be unaffected either way.
 *   sofia.mazzoli@register.it    A STAFF account that must roll up through
 *                                parent_account_uuid to websitebuilder@register.it and
 *                                report exactly that owner's MRR.
 *
 * Assertions are on SHAPE (which key produced the number, whether it's non-zero), never on
 * dollar amounts — those move every month. The amounts are printed for eyeballing.
 *
 * Requires the `# === MRR resolution ===` DOMO vars in calendar-api-backend/.env.
 *
 * Run from calendar-api-backend/:
 *     node src/jiraBacklog/scripts/verify-mrr-resolution.js
 *
 * Exits 0 when every case matches, 1 otherwise.
 */
import dotenv from "dotenv";
import process from "process";
import { resolveOwnerAccount, fetchMrrForOwner } from "../lib/domoClient.js";
import { domoConfig } from "../lib/config.js";

dotenv.config();

const CASES = [
  {
    email: "websitebuilder@thryv.com",
    expectOwnerEmail: "websitebuilder@thryv.com",
    expectSource: "billing_master",
    expectNonZero: true,
    note: "IVR sub — MRR lives on the billing master (thryv-master@dexyp.com)",
  },
  {
    email: "websitebuilder@register.it",
    expectOwnerEmail: "websitebuilder@register.it",
    expectSource: "account",
    expectNonZero: true,
    note: "IVR sub billed on its own id — must NOT roll up to the group master",
  },
  {
    email: "duda-owner-ionos@ionos.com",
    expectOwnerEmail: "duda-owner-ionos@ionos.com",
    expectSource: "account",
    expectNonZero: true,
    note: "seeded IONOS override target — own id and billing master agree",
  },
  {
    email: "sofia.mazzoli@register.it",
    expectOwnerEmail: "websitebuilder@register.it",
    expectSource: "account",
    expectNonZero: true,
    note: "STAFF account — must roll up to its parent owner",
  },
];

const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function run() {
  if (!domoConfig.clientId || !domoConfig.clientSecret) {
    throw new Error("DOMO is not configured — set DOMO_CLIENT_ID / DOMO_CLIENT_SECRET in .env");
  }

  const failures = [];
  const byEmail = new Map();

  for (const c of CASES) {
    console.log(`\n### ${c.email}`);
    console.log(`    (${c.note})`);

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
    if (owner.ownerEmail?.toLowerCase() !== c.expectOwnerEmail) {
      problems.push(`owner is ${owner.ownerEmail}, expected ${c.expectOwnerEmail}`);
    }
    if (result.source !== c.expectSource) {
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

  // The STAFF roll-up must land on exactly the same number as the owner it rolls up to —
  // catches a roll-up that resolves to the right *name* but the wrong account row.
  const staff = byEmail.get("sofia.mazzoli@register.it");
  const owner = byEmail.get("websitebuilder@register.it");
  if (staff && owner) {
    console.log("\n### cross-check: STAFF roll-up matches its owner");
    if (staff.result.mrr === owner.result.mrr) {
      console.log(`    OK — both ${money(owner.result.mrr)}`);
    } else {
      console.log(`    FAIL — staff ${money(staff.result.mrr)} vs owner ${money(owner.result.mrr)}`);
      failures.push("STAFF roll-up MRR differs from its owner's");
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  if (failures.length) {
    console.log(`${failures.length} check(s) FAILED:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log(`All ${CASES.length} cases + cross-check passed.`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
