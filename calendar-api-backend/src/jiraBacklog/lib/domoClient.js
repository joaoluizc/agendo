import { domoConfig, assertDomoConfig } from "./config.js";

/**
 * Server-side DOMO client for the MRR-resolution feature: resolve a Zendesk requester's
 * email to its owning account, then that account's latest-complete-month MRR. Implements
 * the two-query design from Duda's BI agent (a single Domo dataset-query call can't join
 * across datasets, so the account self-join — matched account → parent account — and the
 * revenue lookup are each their own query against their own dataset).
 *
 * Auth: OAuth2 client-credentials grant (scope=data), token cached in-process until it's
 * close to expiry — every refresh otherwise costs a round trip before the real query.
 */

let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) return cachedToken.token;

  const basic = Buffer.from(`${domoConfig.clientId}:${domoConfig.clientSecret}`).toString("base64");
  let res;
  try {
    res = await fetch("https://api.domo.com/oauth/token?grant_type=client_credentials&scope=data", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });
  } catch (err) {
    throw new Error(`DOMO auth request failed: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[jira-backlog][mrr] DOMO auth ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`DOMO auth failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3000) * 1000 };
  return cachedToken.token;
}

/** A SQL literal for a value going into a DQL WHERE clause — quoted unless it's a number. */
function sqlLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

/** Run a DQL SELECT against one dataset. Returns rows as plain objects keyed by column name. */
async function runQuery(datasetId, sql) {
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(`https://api.domo.com/v1/datasets/query/execute/${encodeURIComponent(datasetId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
  } catch (err) {
    throw new Error(`DOMO query request failed: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[jira-backlog][mrr] DOMO query ${res.status} on ${datasetId}: ${body.slice(0, 300)}`);
    throw new Error(`DOMO query failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

const ACCOUNT_COLUMNS =
  "account_uuid, account_id, instance, account_name, user_type, parent_account_uuid, " +
  "parent_account_email, billing_master_business_name, account_plan_type, " +
  "billing_master_accountid, billing_master_accountname";

/**
 * Resolve an email (a Zendesk ticket requester) to its owning account. Staff/child accounts
 * roll up to their parent; owner accounts self-reference (parent_account_uuid == their own
 * account_uuid), so only a *different* parent uuid triggers the roll-up. Returns null when
 * the email doesn't match any account.
 *
 * Every parent lookup is pinned to the child's `instance` — uuids and account_ids are only
 * unique per instance (verified live: the same uuid/id names unrelated accounts on `duda`
 * vs `eu`), so an unpinned lookup can resolve to a random other customer. And on some
 * instances (seen on `eu`) the child's parent_account_uuid doesn't match any account row at
 * all, so when the uuid pointer finds nothing we fall back to `parent_account_email` — the
 * BI agent's designated fallback key.
 */
export async function resolveOwnerAccount(email) {
  assertDomoConfig();

  const [matched] = await runQuery(
    domoConfig.accountsDatasetId,
    `SELECT ${ACCOUNT_COLUMNS} FROM table WHERE LOWER(account_name) = LOWER(${sqlLiteral(email)}) LIMIT 1`,
  );
  if (!matched) return null;

  let owner = matched;
  if (matched.parent_account_uuid && matched.parent_account_uuid !== matched.account_uuid) {
    const instancePin = `instance = ${sqlLiteral(matched.instance)}`;
    let [parent] = await runQuery(
      domoConfig.accountsDatasetId,
      `SELECT ${ACCOUNT_COLUMNS} FROM table WHERE account_uuid = ${sqlLiteral(matched.parent_account_uuid)} AND ${instancePin} LIMIT 1`,
    );
    if (!parent && matched.parent_account_email) {
      [parent] = await runQuery(
        domoConfig.accountsDatasetId,
        `SELECT ${ACCOUNT_COLUMNS} FROM table WHERE LOWER(account_name) = LOWER(${sqlLiteral(matched.parent_account_email)}) AND ${instancePin} LIMIT 1`,
      );
    }
    if (parent) owner = parent;
  }

  return {
    ownerAccountUuid: owner.account_uuid,
    ownerAccountId: owner.account_id,
    ownerInstance: owner.instance,
    ownerEmail: owner.account_name,
    ownerBusinessName: owner.billing_master_business_name || "",
    ownerPlanType: owner.account_plan_type || "",
    // The account that actually gets invoiced for this owner — see fetchMrrForOwner().
    ownerBillingMasterAccountId: owner.billing_master_accountid ?? null,
    ownerBillingMasterName: owner.billing_master_accountname || "",
    inputUserType: matched.user_type || "",
  };
}

/** The canonical MRR measure, per athena-views' revenue skill: recurring, non-onetime/sfl. */
const MRR_SUM =
  "SUM(CASE WHEN payment_type = 'recurring' AND frequency NOT IN ('onetime', 'sfl') THEN revenue_net_amount ELSE 0 END)";
/** The latest complete Netsuite month. `max_netsuite_charge_date` is the same on every row. */
const LATEST_MONTH_WINDOW =
  "charge_date >= max_netsuite_charge_date AND charge_date < DATE_ADD(max_netsuite_charge_date, INTERVAL 1 MONTH)";

/** Latest-complete-month MRR for one revenue key. `rows` distinguishes "$0" from "no rows". */
async function queryMrr(keyColumn, keyValue, instance) {
  const sql = `
    SELECT
      ${MRR_SUM} AS mrr,
      COUNT(*) AS row_count,
      MAX(max_netsuite_charge_date) AS latest_month
    FROM table
    WHERE ${keyColumn} = ${sqlLiteral(keyValue)}
      AND athena_env = ${sqlLiteral(instance)}
      AND ${LATEST_MONTH_WINDOW}
  `;
  const [row] = await runQuery(domoConfig.revenueDatasetId, sql);
  // Domo returns '' (not null) for an aggregate over an empty row set.
  const num = (v) => (v === "" || v == null ? 0 : Number(v));
  return {
    mrr: Math.round(num(row?.mrr) * 100) / 100,
    rows: num(row?.row_count),
    latestMonth: row?.latest_month || null,
  };
}

/**
 * Latest-complete-month MRR for a resolved owner account.
 *
 * Keyed on the owner's own `account_id` + `athena_env` first. If the owner has *no revenue
 * rows at all* in that month, retry once against its `billing_master_accountid` — the owner
 * is an invoiced reseller (`is_ivr = 1`, the `INVOICED_RESELLER` role) whose charges are
 * billed through a master account, so the money is booked on the master, not on it.
 * `billing_master_accountid` is literally `view_invoiced_reseller.parent_account_id`
 * (athena-views `mview/view_account_attributes.sql:28,135`), coalesced to the account's own
 * id when it isn't an IVR sub — so the fallback is a no-op for ordinary accounts.
 *
 * Own-id FIRST, always: for most enterprise accounts the charges *are*
 * booked on the account itself while `billing_master_accountid` points at a group master that
 * bills many siblings — rolling up unconditionally would attribute the whole group's MRR to
 * one client. Verified against all four shapes in scripts/verify-mrr-resolution.js.
 *
 * Returns `source` so the caller can record which key produced the number.
 */
export async function fetchMrrForOwner({ accountId, instance, billingMasterAccountId = null }) {
  assertDomoConfig();

  const own = await queryMrr("account_id", accountId, instance);
  if (own.rows > 0) return { ...own, source: "account", accountIdUsed: accountId };

  const canFallBack = billingMasterAccountId != null && String(billingMasterAccountId) !== String(accountId);
  if (!canFallBack) return { ...own, source: "account", accountIdUsed: accountId };

  const master = await queryMrr("account_id", billingMasterAccountId, instance);
  if (master.rows === 0) return { ...own, source: "account", accountIdUsed: accountId };

  return { ...master, source: "billing_master", accountIdUsed: billingMasterAccountId };
}
