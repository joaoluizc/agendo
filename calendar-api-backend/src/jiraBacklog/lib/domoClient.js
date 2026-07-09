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
  "parent_account_email, billing_master_business_name, account_plan_type";

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
    inputUserType: matched.user_type || "",
  };
}

/**
 * Latest-complete-month MRR for a resolved owner account: recurring, non-onetime/sfl revenue
 * in the most recently closed Netsuite month (the canonical MRR definition from the BI agent).
 */
export async function fetchMrrForOwner({ accountId, instance }) {
  assertDomoConfig();

  const sql = `
    SELECT
      SUM(CASE WHEN payment_type = 'recurring' AND frequency NOT IN ('onetime', 'sfl') THEN revenue_net_amount ELSE 0 END) AS mrr,
      MAX(max_netsuite_charge_date) AS latest_month
    FROM table
    WHERE account_id = ${sqlLiteral(accountId)}
      AND athena_env = ${sqlLiteral(instance)}
      AND charge_date >= max_netsuite_charge_date
      AND charge_date < DATE_ADD(max_netsuite_charge_date, INTERVAL 1 MONTH)
  `;
  const [row] = await runQuery(domoConfig.revenueDatasetId, sql);
  const mrr = row?.mrr != null ? Math.round(Number(row.mrr) * 100) / 100 : 0;
  return { mrr, latestMonth: row?.latest_month || null };
}
