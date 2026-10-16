import process from "process";

/**
 * The only door from agendo's MCP server to Zendesk, and it only opens one way.
 *
 * **Read-only is structural, not a setting.** The one function that reaches the network is
 * `get()`, the HTTP method is a literal inside it, and nothing a caller passes can change
 * it. There is no write function to call, no `method` argument, no environment switch. The
 * credential is a Zendesk API token, which Zendesk cannot scope — it can do whatever its
 * owner can — so this file is the *only* thing standing between the support team's Claude
 * clients and a write. A test pins that every request is a GET. Adding writes later means
 * a second, separately reviewed module behind its own permission level, not a relaxed
 * version of this one.
 *
 * Other guards, each there because something goes wrong without it:
 *
 *  - **Only plain `/api/v2/` paths are fetched, never an address.** A target must match a
 *    tight character allowlist (no `%`, `;`, `\`, `..`, empty segments), so an encoded
 *    separator cannot climb out of `/api/v2/` on a proxy that decodes it, and a full URL
 *    — including a pagination cursor — is refused outright. Tools build paths themselves,
 *    from fixed templates and validated ids, and pass a cursor as the opaque value Zendesk
 *    gave (`page[after]`), never as a URL. The origin is checked again on the result. This
 *    is a *character-level* backstop, not an endpoint allowlist: it would let a tool fetch
 *    `/api/v2/audit_logs.json` if one asked. Which endpoints are read is decided by the
 *    tools' fixed paths. That Zendesk GETs are side-effect-free is Zendesk's promise, not
 *    ours to verify.
 *  - **Credentials only ever reach the configured Zendesk host.** A JSON read never follows a
 *    redirect. `download()` is the one exception, because Zendesk serves attachments from a
 *    redirect to storage: it starts only from `https://<host>/attachments/…`, sends the
 *    credential on that first request alone, follows at most a few hops and only to https
 *    names that are real (not IP addresses, `localhost`, single labels or internal-looking
 *    names, a trailing dot included), reads at most a fixed number of bytes, never retries,
 *    and never logs the address (its path carries a secret).
 *  - **A request budget, shared fairly.** Zendesk's rate limit is per *account* and shared
 *    by every integration on it (Duda's Jira-backlog sync included). The process-wide
 *    budget is a fraction of the lowest plan limit, and each caller gets a smaller share of
 *    it, so one person's runaway model loop cannot lock out the rest of the team. A request
 *    that never reaches Zendesk (refused, cancelled, timed out waiting) gives its budget
 *    back. (The budget is per process: a second instance would double it.)
 *  - **Bounded time and queue, per caller too.** One deadline covers every attempt, wait
 *    and retry of a call; the queue for a free connection is capped, and so is how many
 *    positions in it any one caller may hold, so a burst from one person cannot fill the
 *    queue and turn everyone else away. A cancelled call leaves the queue, or its budget
 *    wait, at once. Without these a slow Zendesk piles abandoned work behind the client's
 *    own timeout.
 *  - **429 and 5xx are retried, within the deadline.** A `Retry-After` longer than a call
 *    can sensibly wait becomes an error that says how long.
 *  - **Errors say whose problem it is.** "403" alone sends a person to an engineer; the
 *    message says it is the shared Zendesk user's role, not their agendo access.
 *
 * Callers are identified (`forCaller(id)`) on purpose: there is no way to make a request
 * without saying whose share of the budget it spends.
 *
 * Config is read from `process.env` on every call (the Jira-backlog feature's pattern):
 * ES imports are hoisted above `app.js`'s `dotenv.config()`, so reading at import time
 * would see nothing. The variables are the ones that feature already uses —
 * `ZD_SUBDOMAIN`, `ZD_API_EMAIL`, `ZD_API_TOKEN`.
 */

/**
 * An error whose message is safe to show a person and their model. Never carries a secret.
 *
 * `logMessage` is what may be written to a log: the message *without* any detail Zendesk
 * echoed back. A rejected search can quote the query, and a query can hold a customer's
 * email — so the model may see that detail, but Render's logs may not.
 */
export class ZendeskError extends Error {
  constructor(message, { status, retryAfterSeconds, logMessage } = {}) {
    super(message);
    this.name = "ZendeskError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.logMessage = logMessage ?? message;
  }
}

/** A bare subdomain label — never a host, a path or anything that could redirect the base URL. */
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** The only shape of path `get()` will fetch. See the header for why it is this tight. */
const READ_PATH_PATTERN = /^\/api\/v2\/[A-Za-z0-9_\-./]*$/;

/**
 * Defaults, all overridable per client so tests can run without sleeping.
 *
 * 100 requests a minute is a quarter of the lowest limit Zendesk lists for a plan with a
 * meaningful API (400/min); 30 of those per person means four people at full tilt are
 * needed to exhaust it, and the rest of the account keeps its room. Of the 4 + 20 places
 * a request can hold (in flight, or queued), one person may hold 6.
 */
export const DEFAULT_LIMITS = Object.freeze({
  maxRequestsPerMinute: 100,
  maxRequestsPerCallerPerMinute: 30,
  maxConcurrent: 4,
  maxQueued: 20,
  maxPendingPerCaller: 6,
  maxAttempts: 3,
  maxRetryWaitMs: 10_000,
  maxBudgetWaitMs: 15_000,
  requestTimeoutMs: 20_000,
  overallDeadlineMs: 25_000,
  maxBodyChars: 5_000_000,
  maxDownloadBytes: 3_000_000,
  maxDownloadRedirects: 3,
});

/**
 * Where agendo's Zendesk credentials come from. Throws a ZendeskError that names what is
 * missing — to the person it reads as "ask an admin", not as a stack trace.
 */
function readSettings(env) {
  const subdomain = String(env.ZD_SUBDOMAIN || "").trim();
  const email = String(env.ZD_API_EMAIL || "").trim();
  const token = String(env.ZD_API_TOKEN || "").trim();

  const missing = [];
  if (!subdomain) missing.push("ZD_SUBDOMAIN");
  if (!email) missing.push("ZD_API_EMAIL");
  if (!token) missing.push("ZD_API_TOKEN");
  if (missing.length) {
    throw new ZendeskError(
      `Zendesk is not configured on the agendo server (missing ${missing.join(", ")}). ` +
        `An agendo admin needs to set it; nothing you can change from here.`,
    );
  }
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    throw new ZendeskError(
      "The Zendesk subdomain configured on the agendo server is not a valid subdomain. " +
        "An agendo admin needs to fix ZD_SUBDOMAIN.",
    );
  }

  const host = `${subdomain.toLowerCase()}.zendesk.com`;
  return {
    host,
    baseUrl: `https://${host}`,
    // Zendesk's API-token scheme: Basic, with `{email}/token` as the user.
    authorization: `Basic ${Buffer.from(`${email}/token:${token}`).toString("base64")}`,
  };
}

/** Is `target` a plain `/api/v2/…` path: allowlisted characters, no dot or empty segments? */
function isPlainApiPath(target) {
  if (typeof target !== "string" || !READ_PATH_PATTERN.test(target)) return false;
  const segments = target.split("/").slice(1);
  return !segments.some(
    (segment, index) =>
      segment === "." || segment === ".." || (segment === "" && index < segments.length - 1),
  );
}

/**
 * Resolve what a caller asked for into a URL on the configured host, or refuse.
 *
 * `target` must be a plain path (`isPlainApiPath`); a full URL is refused however it is
 * spelt. Parameters go in the query, percent-encoded. The result is checked once more —
 * same origin, pathname exactly as given — so that if the allowlist is ever loosened this
 * still holds.
 */
export function resolveReadUrl(baseUrl, target, params = {}) {
  if (!isPlainApiPath(target)) {
    throw new ZendeskError(
      "Refused: only plain /api/v2/ paths can be read — not full addresses, and nothing else.",
    );
  }
  const base = new URL(baseUrl);
  const url = new URL(target, base);
  if (url.origin !== base.origin || url.pathname !== target || url.username || url.password) {
    throw new ZendeskError(
      "Refused: that address is not on this agendo server's Zendesk account, and credentials are never sent anywhere else.",
    );
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/** Seconds from a `Retry-After` header (delay-seconds form), or null if absent or unusable. */
function parseRetryAfter(value) {
  if (value == null) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

/**
 * Zendesk's rate-limit headers as numbers, or null when the response carried none. Both
 * the long-standing `X-Rate-Limit*` pair and the standard `RateLimit-*` pair are read.
 */
function readRateLimit(headers, observedAt) {
  const number = (name) => {
    const raw = headers.get(name);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const limit = number("x-rate-limit") ?? number("ratelimit-limit");
  const remaining = number("x-rate-limit-remaining") ?? number("ratelimit-remaining");
  if (limit === null && remaining === null) return null;
  return { limit, remaining, observedAt };
}

/**
 * What Zendesk said went wrong, trimmed — or "" if the body has nothing usable. Zendesk's
 * 4xx bodies are usually `{ "error": "InvalidValue", "description": "…readable…" }`, so the
 * readable `description` comes before the machine code in `error`.
 */
function errorDetail(text) {
  try {
    const body = JSON.parse(text);
    const candidate =
      body?.description ||
      (typeof body?.error === "string" && body.error) ||
      body?.error?.message ||
      body?.error?.title ||
      body?.message ||
      "";
    return String(candidate).slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * The person-readable error for a response we are not going to retry. Zendesk's own detail
 * goes in `message` (the model benefits from it) but not in `logMessage` (see ZendeskError).
 */
function errorForStatus(status, detail) {
  if (status === 401) {
    return new ZendeskError(
      "Zendesk rejected the credentials the agendo server uses (HTTP 401). That is a server " +
        "configuration problem, not something about your access: tell an agendo admin.",
      { status },
    );
  }
  if (status === 403) {
    return new ZendeskError(
      "Zendesk refused this (HTTP 403): the Zendesk user agendo reads as is not allowed to see it. " +
        "That is a limit of that shared user's Zendesk role, not of your agendo access — " +
        "`zendesk_connection_status` shows the role.",
      { status },
    );
  }
  if (status === 404) {
    return new ZendeskError(
      "Zendesk has no such item, or the shared Zendesk user agendo reads as cannot see it (HTTP 404).",
      { status },
    );
  }
  if (status >= 400 && status < 500) {
    const withoutDetail = `Zendesk rejected the request (HTTP ${status}).`;
    return new ZendeskError(
      detail ? `Zendesk rejected the request (HTTP ${status}): ${detail}` : withoutDetail,
      { status, logMessage: withoutDetail },
    );
  }
  return new ZendeskError(`Zendesk returned an unexpected response (HTTP ${status}).`, { status });
}

/** The only shape of file address a download starts from: a plain path under `/attachments/`. */
const ATTACHMENT_PATH_PATTERN = /^\/attachments\/[A-Za-z0-9_\-./]*$/;

const refusedAddress = () =>
  new ZendeskError(
    "Refused: that is not a file on this agendo server's Zendesk account, and credentials are never sent anywhere else.",
  );

/**
 * The address a download starts from, or a refusal. It must be `https://<the configured Zendesk
 * host>/attachments/…`: no other host (an attachment's `content_url` can point outside Zendesk,
 * and a customer may have chosen where), no port, no userinfo, no path outside `/attachments/`,
 * no dot or empty segments, no encoded separators. A query is allowed: Zendesk puts the file's
 * name there.
 */
export function attachmentUrl(settings, raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw refusedAddress();
  }
  const segments = url.pathname.split("/").slice(1);
  const plain =
    ATTACHMENT_PATH_PATTERN.test(url.pathname) &&
    !segments.some((segment, index) => segment === "." || segment === ".." || (segment === "" && index < segments.length - 1));
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== settings.host ||
    url.port ||
    url.username ||
    url.password ||
    !plain
  ) {
    throw refusedAddress();
  }
  return url;
}

/**
 * Where a redirect may lead, or a refusal. The `Location` came from Zendesk, but it is followed
 * without credentials and so only to a place that looks like the public web: https, the default
 * port, no userinfo, and a host that is a real name — not an IP address in any spelling (the URL
 * parser has already turned hex, octal and decimal forms into dotted ones), not `localhost`, not
 * a single label, not a name that says it is internal. This does not stop a public name that
 * resolves to a private address; it narrows what a bad redirect can reach, and the redirect is
 * Zendesk's to give, not a customer's.
 */
export function resolveRedirect(location, from) {
  // A redirect with no destination is malformed; an empty one would resolve to where we already are.
  if (typeof location !== "string" || !location.trim()) {
    throw new ZendeskError("The file's download link redirected somewhere that is not an address.");
  }
  let url;
  try {
    url = new URL(String(location), from);
  } catch {
    throw new ZendeskError("The file's download link redirected somewhere that is not an address.");
  }
  // A trailing dot names the same host ("evil.localhost." is "evil.localhost"), so it cannot hide one.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  const internal =
    host === "localhost" ||
    !host.includes(".") ||
    host.startsWith("[") ||
    host.includes(":") ||
    /^[0-9.]+$/.test(host) ||
    /\.(localhost|local|localdomain|internal|intranet|private|lan|home|corp|arpa)$/.test(host);
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || internal) {
    throw new ZendeskError(
      "The file's download link redirected to a place this connection will not fetch from, so it was not followed.",
    );
  }
  return url;
}

/** Let go of a body nobody will read, so its connection is not held open. */
async function discardBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // nothing useful to do with a body we did not want
  }
}

/** A response body as bytes, read up to `maxBytes` and no further. */
async function readBounded(response, maxBytes) {
  const tooBig = () =>
    new ZendeskError(`The file is larger than the ${Math.round(maxBytes / 1_000_000)} MB this connection will download.`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    throw tooBig();
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw tooBig();
    return bytes;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooBig();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** `image/png` from `Image/PNG; charset=x`, or null if it is not a media type. */
function cleanContentType(header) {
  const type = String(header ?? "").split(";")[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(type) && type.length <= 100 ? type : null;
}

/** Zendesk said 429: how long to wait, and whose limit it is. */
const rateLimited = (waitSeconds, status) =>
  new ZendeskError(
    `Zendesk is rate-limiting requests (HTTP 429). Try again in about ${waitSeconds} seconds — ` +
      "the limit is shared by Duda's whole Zendesk account, not just agendo.",
    { status, retryAfterSeconds: waitSeconds },
  );

const tooSlow = () =>
  new ZendeskError("Zendesk took too long to answer. Try again, or ask for less.");
const cancelled = () => new ZendeskError("The request was cancelled before Zendesk answered.");

/**
 * Sleep `ms`, or reject as cancelled the moment `signal` aborts (clearing the timer, so a
 * cancelled call does not leave one running). Tests inject their own `sleep` and ignore the
 * signal; the callers re-check it after every sleep for exactly that reason.
 */
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Build a client. The shared instance below is what the tools use; the factory exists so
 * tests can inject `fetch`, a clock and a sleep, and tighten the limits.
 */
export function createZendeskClient({
  env = () => process.env,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = abortableSleep,
  limits: limitOverrides = {},
} = {}) {
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };

  // --- request budget: sliding one-minute windows, process-wide and per caller -------
  const globalWindow = [];
  const callerWindows = new Map();
  const prune = (window, t) => {
    while (window.length && t - window[0] >= 60_000) window.shift();
  };
  const sweep = (t) => {
    for (const [key, window] of callerWindows) {
      prune(window, t);
      if (!window.length) callerWindows.delete(key);
    }
  };
  const removeOne = (window, value) => {
    const index = window.indexOf(value);
    if (index >= 0) window.splice(index, 1);
  };

  /** Spend one request from the caller's share and the process budget. Returns the ticket. */
  async function takeBudget(callerKey, deadlineAt, signal) {
    for (;;) {
      if (signal?.aborted) throw cancelled();
      const t = now();
      prune(globalWindow, t);
      if (callerWindows.size > 200) sweep(t);
      const window = callerWindows.get(callerKey) ?? [];
      prune(window, t);

      const callerWait =
        window.length >= limits.maxRequestsPerCallerPerMinute ? 60_000 - (t - window[0]) : 0;
      const globalWait =
        globalWindow.length >= limits.maxRequestsPerMinute ? 60_000 - (t - globalWindow[0]) : 0;
      const wait = Math.max(callerWait, globalWait);

      if (wait === 0) {
        window.push(t);
        callerWindows.set(callerKey, window);
        globalWindow.push(t);
        return t;
      }
      if (wait > limits.maxBudgetWaitMs || t + wait > deadlineAt) {
        const retryAfterSeconds = Math.ceil(wait / 1000);
        throw callerWait >= globalWait
          ? new ZendeskError(
              "You have used your share of the Zendesk requests agendo allows itself this minute " +
                `(it is divided between people). Try again in about ${retryAfterSeconds} seconds.`,
              { retryAfterSeconds },
            )
          : new ZendeskError(
              "agendo is sending Zendesk as many requests as it allows itself right now (the Zendesk " +
                "rate limit is shared by Duda's whole account). Try again in a minute.",
              { retryAfterSeconds },
            );
      }
      await sleep(wait, signal);
    }
  }

  /** Give back a request that never reached Zendesk. */
  function refundBudget(callerKey, ticket) {
    removeOne(globalWindow, ticket);
    const window = callerWindows.get(callerKey);
    if (window) removeOne(window, ticket);
  }

  // --- concurrency: a bounded queue, and a bounded share of it per caller -------------
  let active = 0;
  const waiting = [];
  const pendingByCaller = new Map(); // callerKey -> places held (in flight + queued)
  const holdPlace = (callerKey) => pendingByCaller.set(callerKey, (pendingByCaller.get(callerKey) ?? 0) + 1);
  const freePlace = (callerKey) => {
    const left = (pendingByCaller.get(callerKey) ?? 1) - 1;
    if (left > 0) pendingByCaller.set(callerKey, left);
    else pendingByCaller.delete(callerKey);
  };

  function acquireSlot(callerKey, deadlineAt, signal) {
    if (signal?.aborted) throw cancelled();
    if ((pendingByCaller.get(callerKey) ?? 0) >= limits.maxPendingPerCaller) {
      throw new ZendeskError(
        "You already have several Zendesk requests in progress. Wait for them to finish, then ask again.",
      );
    }
    if (active < limits.maxConcurrent) {
      active += 1;
      holdPlace(callerKey);
      return Promise.resolve();
    }
    if (waiting.length >= limits.maxQueued) {
      throw new ZendeskError(
        "Zendesk requests are backed up on the agendo server right now. Try again in a few seconds.",
      );
    }
    holdPlace(callerKey);
    return new Promise((resolve, reject) => {
      const entry = { resolve };
      const leave = (error) => {
        entry.cleanup();
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        freePlace(callerKey);
        reject(error);
      };
      const timer = setTimeout(() => leave(tooSlow()), Math.max(0, deadlineAt - now()));
      const onAbort = () => leave(cancelled());
      entry.cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(entry);
    });
  }
  function releaseSlot(callerKey) {
    freePlace(callerKey);
    const next = waiting.shift();
    if (next) {
      next.cleanup();
      next.resolve(); // the slot passes to them; `active` stays as it is
    } else {
      active -= 1;
    }
  }

  /** Sleep `ms` unless that would run past the deadline. Returns whether it slept. */
  async function pause(ms, deadlineAt, signal) {
    if (now() + ms > deadlineAt) return false;
    await sleep(ms, signal);
    if (signal?.aborted) throw cancelled();
    return true;
  }

  let rateLimit = null;

  /**
   * Run one request inside the budget and the queue: take a request from the caller's share,
   * wait for a free connection, and hand `send` the signal that covers the per-request timeout
   * and the caller's cancellation. `send` makes the request and reads its body *inside* the
   * slot. A request that never reaches Zendesk (refused, cancelled, timed out waiting) gives
   * its budget back.
   */
  async function guarded({ callerKey, deadlineAt, signal }, send) {
    if (signal?.aborted) throw cancelled();
    const ticket = await takeBudget(callerKey, deadlineAt, signal);
    try {
      await acquireSlot(callerKey, deadlineAt, signal);
    } catch (error) {
      refundBudget(callerKey, ticket);
      throw error;
    }
    let sent = false;
    try {
      if (signal?.aborted) throw cancelled();
      const remainingMs = deadlineAt - now();
      if (remainingMs <= 0) throw tooSlow();

      const timeout = AbortSignal.timeout(Math.min(limits.requestTimeoutMs, remainingMs));
      sent = true;
      return await send(signal && typeof AbortSignal.any === "function" ? AbortSignal.any([timeout, signal]) : timeout);
    } finally {
      releaseSlot(callerKey);
      if (!sent) refundBudget(callerKey, ticket);
    }
  }

  /** One attempt at a JSON read: the response, with its body read inside the slot. */
  function attempt(url, settings, context) {
    return guarded(context, async (requestSignal) => {
      const response = await fetchImpl(url, {
        method: "GET", // the only method this module can send
        redirect: "manual",
        headers: {
          Authorization: settings.authorization,
          Accept: "application/json",
          "User-Agent": "agendo-mcp",
        },
        signal: requestSignal,
      });
      const seen = readRateLimit(response.headers, now());
      if (seen) rateLimit = seen;

      // Best-effort guard before reading (chunked responses carry no length), exact after.
      const tooLarge = () =>
        new ZendeskError(
          "Zendesk's answer was too large to handle. Ask for less (a narrower search or fewer items).",
        );
      if (Number(response.headers.get("content-length")) > limits.maxBodyChars) {
        await discardBody(response);
        throw tooLarge();
      }

      // A body that fails to arrive on a success is a failed attempt, retried like any other
      // network error. On an error status the status matters more than a missing body.
      const succeeded = response.status >= 200 && response.status < 300;
      const body = succeeded ? await response.text() : await response.text().catch(() => "");
      if (body.length > limits.maxBodyChars) throw tooLarge();

      return {
        status: response.status,
        body,
        retryAfter: parseRetryAfter(response.headers.get("retry-after")),
      };
    });
  }
  /**
   * GET a Zendesk API path and return the parsed JSON, spending `callerKey`'s share of the
   * budget. Throws ZendeskError for anything a person should hear about.
   *
   * `signal` cancels the call. `deadlineAt` (epoch ms) is for a tool that makes several
   * requests for one answer: it computes one deadline up front and passes it to each, so
   * the tool as a whole is bounded rather than each request.
   */
  async function run(callerKey, target, params = {}, { signal, deadlineAt: toolDeadline } = {}) {
    const settings = readSettings(env());
    const url = resolveReadUrl(settings.baseUrl, target, params);
    const deadlineAt = Math.min(toolDeadline ?? Infinity, now() + limits.overallDeadlineMs);
    const context = { callerKey, deadlineAt, signal };

    for (let tries = 1; ; tries += 1) {
      const last = tries >= limits.maxAttempts;
      const backoffMs = 500 * 2 ** (tries - 1);
      let result;
      try {
        result = await attempt(url, settings, context);
      } catch (err) {
        if (err instanceof ZendeskError) throw err;
        if (signal?.aborted) throw cancelled();
        if (!last && (await pause(backoffMs, deadlineAt, signal))) continue;
        throw new ZendeskError(
          err?.name === "TimeoutError" ? "Zendesk did not answer in time." : "Could not reach Zendesk.",
        );
      }

      const { status, body, retryAfter } = result;
      if (status >= 200 && status < 300) {
        try {
          return JSON.parse(body);
        } catch {
          throw new ZendeskError("Zendesk answered with something that is not JSON.", { status });
        }
      }

      // Path only, never the query: a search query can hold a customer's email.
      console.warn(`[mcp][zendesk] HTTP ${status} for ${url.pathname}`);

      if (status >= 300 && status < 400) {
        throw new ZendeskError(
          `Zendesk answered with a redirect (HTTP ${status}), which this connection never follows.`,
          { status },
        );
      }
      if (status === 429) {
        const waitSeconds = retryAfter ?? 5;
        if (
          !last &&
          waitSeconds * 1000 <= limits.maxRetryWaitMs &&
          (await pause(waitSeconds * 1000, deadlineAt, signal))
        ) {
          continue;
        }
        throw rateLimited(waitSeconds, status);
      }
      if (status >= 500) {
        if (!last && (await pause(backoffMs, deadlineAt, signal))) continue;
        throw errorForStatus(status);
      }
      throw errorForStatus(status, errorDetail(body));
    }
  }

  /**
   * GET an attachment's bytes, spending `callerKey`'s share of the budget. Returns
   * `{ bytes, contentType }`; throws ZendeskError for anything a person should hear about.
   *
   * This is the one place the client follows a redirect, and it does it under rules a JSON read
   * never needs (see the header): the address must be a file on the configured Zendesk host
   * (`/attachments/…`), credentials go to that first request and no other, each redirect must
   * lead to an https host that is a real name, there are at most a few hops, the body is read
   * up to a byte cap and no further, and nothing about the address is ever logged — its path
   * carries a secret token. There is no retry: a failed download is the person's to ask for again.
   */
  async function runDownload(callerKey, contentUrl, { signal, deadlineAt: toolDeadline, maxBytes } = {}) {
    const settings = readSettings(env());
    let url = attachmentUrl(settings, contentUrl);
    const deadlineAt = Math.min(toolDeadline ?? Infinity, now() + limits.overallDeadlineMs);
    const cap = Math.min(maxBytes ?? limits.maxDownloadBytes, limits.maxDownloadBytes);
    const context = { callerKey, deadlineAt, signal };
    let credentialed = true;

    for (let hop = 0; hop <= limits.maxDownloadRedirects; hop += 1) {
      let answer;
      try {
        answer = await guarded(context, async (requestSignal) => {
          const headers = { Accept: "*/*", "User-Agent": "agendo-mcp" };
          // Credentials go to the first request, on the Zendesk host, and to nothing after it.
          if (credentialed) headers.Authorization = settings.authorization;
          const response = await fetchImpl(url, { method: "GET", redirect: "manual", headers, signal: requestSignal });
          const status = response.status;
          if (status >= 200 && status < 300) {
            return { status, bytes: await readBounded(response, cap), contentType: cleanContentType(response.headers.get("content-type")) };
          }
          const location = response.headers.get("location");
          const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
          await discardBody(response);
          return { status, location, retryAfter };
        });
      } catch (err) {
        if (err instanceof ZendeskError) throw err;
        if (signal?.aborted) throw cancelled();
        throw new ZendeskError(
          err?.name === "TimeoutError" ? "Zendesk did not answer in time." : "Could not reach Zendesk.",
        );
      }

      const { status } = answer;
      if (status >= 200 && status < 300) return { bytes: answer.bytes, contentType: answer.contentType };

      if (status >= 300 && status < 400) {
        // The normal way a file is served, so not worth a log line.
        url = resolveRedirect(answer.location, url);
        credentialed = false;
        continue;
      }

      // The status only: the address holds a secret token and is never logged.
      console.warn(`[mcp][zendesk] attachment download HTTP ${status} (hop ${hop})`);

      if (status === 429 && hop === 0) throw rateLimited(answer.retryAfter ?? 5, status);
      if (hop > 0) {
        throw new ZendeskError(
          `The file's download link was refused or has expired (HTTP ${status}). Ask for the attachment again.`,
          { status },
        );
      }
      throw errorForStatus(status);
    }
    throw new ZendeskError("The file's download link redirected too many times, so it was not followed.");
  }
  return {
    /**
     * A handle that spends `callerKey`'s share of the budget — the caller's Clerk id. The
     * only way to make a request, so none is ever unattributed.
     */
    forCaller(callerKey) {
      if (typeof callerKey !== "string" || !callerKey) {
        throw new Error("zendesk.forCaller needs the caller's id, so the request budget can be shared fairly");
      }
      return Object.freeze({
        get: (target, params = {}, options = {}) => run(callerKey, target, params, options),
        download: (contentUrl, options = {}) => runDownload(callerKey, contentUrl, options),
      });
    },
    /** The configured Zendesk host (`<subdomain>.zendesk.com`). Throws if unconfigured. */
    host: () => readSettings(env()).host,
    /** The most recent rate-limit headers seen, `{ limit, remaining, observedAt }`, or null. */
    lastRateLimit: () => rateLimit,
  };
}

/** The shared client: one budget and one concurrency cap for the whole process. */
export const zendesk = createZendeskClient();

export default { zendesk, createZendeskClient, resolveReadUrl, ZendeskError, DEFAULT_LIMITS };
