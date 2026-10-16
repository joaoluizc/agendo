import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZendeskClient, resolveReadUrl, ZendeskError } from "./zendeskClient.js";

/**
 * The Zendesk client against a stubbed `fetch`, a fake clock and a recording sleep: no
 * network, no real waiting (except the few tests about real concurrency and cancellation,
 * which use short real timers). Credentials and hosts are synthetic — the repo is public.
 */

const ENV = {
  ZD_SUBDOMAIN: "example-test",
  ZD_API_EMAIL: "service-user@example.test",
  ZD_API_TOKEN: "secret-token-value",
};
const BASE = "https://example-test.zendesk.com";

const ok = (body = { ok: true }, headers = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const status = (code, body = "{}", headers = {}) => new Response(body, { status: code, headers });

/** A client whose responses come from `responses`, in order. An Error entry is thrown. */
function harness({ responses = [], env = ENV, limits, caller = "caller-1" } = {}) {
  const calls = [];
  const sleeps = [];
  let clock = 1_000_000;
  const queue = [...responses];
  const client = createZendeskClient({
    env: () => env,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      const next = queue.shift();
      if (!next) throw new Error("unexpected extra request");
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    limits,
  });
  return { client, zd: client.forCaller(caller), calls, sleeps };
}

/* ------------------------------ read-only, by construction ------------------------------ */

test("every request is a GET, never follows redirects, and authenticates as the API-token user", async () => {
  const { zd, calls } = harness({ responses: [ok()] });
  await zd.get("/api/v2/search.json", { query: "type:ticket", per_page: 5, page: undefined, status: "" });

  const { url, init } = calls[0];
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "manual");
  assert.equal(
    init.headers.Authorization,
    `Basic ${Buffer.from("service-user@example.test/token:secret-token-value").toString("base64")}`,
  );
  const parsed = new URL(url);
  assert.equal(parsed.origin, BASE);
  assert.equal(parsed.searchParams.get("query"), "type:ticket");
  assert.equal(parsed.searchParams.get("per_page"), "5");
  assert.equal(parsed.searchParams.has("page"), false, "undefined parameters are dropped");
  assert.equal(parsed.searchParams.has("status"), false, "empty parameters are dropped");
});

test("the client has no write surface, and parameters cannot change the method", async () => {
  const { client, zd, calls } = harness({ responses: [ok()] });
  assert.deepEqual(Object.keys(client).sort(), ["forCaller", "host", "lastRateLimit"]);
  assert.deepEqual(Object.keys(zd), ["get"]);

  // `method` in the parameters is just another query parameter.
  await zd.get("/api/v2/tickets/1.json", { method: "DELETE" });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(new URL(calls[0].url).searchParams.get("method"), "DELETE");
});

test("a request cannot be made without saying whose share of the budget it spends", () => {
  const { client } = harness();
  for (const bad of [undefined, null, "", 0, {}]) {
    assert.throws(() => client.forCaller(bad), /needs the caller's id/);
  }
});

/* ------------------------------ only plain /api/v2/ paths ------------------------------ */

test("only plain /api/v2/ paths are fetched: no addresses, encoded separators or traversal", async () => {
  const refused = [
    // Any address, however spelt — a cursor is a value for `page[after]`, never a URL.
    `${BASE}/api/v2/tickets.json?page%5Bafter%5D=abc`,
    "https://evil.example.test/api/v2/users.json",
    "http://example-test.zendesk.com/api/v2/users.json",
    "https://example-test.zendesk.com:8443/api/v2/users.json",
    "https://user:pw@example-test.zendesk.com/api/v2/users.json",
    "https://example-test.zendesk.com.evil.example.test/api/v2/users.json",
    "//evil.example.test/api/v2/users.json",
    "javascript:alert(1)",
    // Outside /api/v2/, or climbing out of it.
    "/api/v1/users.json",
    "/api/v2/../v1/users.json",
    "/api/v2/./users.json",
    "/api/v2/a//b.json",
    "/users.json",
    "api/v2/users.json",
    // Encoded and exotic separators: not decoded by URL parsing, so a proxy that does would
    // see a traversal the prefix check never did.
    "/api/v2/%2e%2e/users.json",
    "/api/v2/..%2fv1/users.json",
    "/api/v2/%5c..%5cv1/users.json",
    "/api/v2/..;/v1/users.json",
    "/api/v2/a\\b.json",
    "/api/v2/a b.json",
    "/api/v2/users.json?x=1",
    "/api/v2/users.json#frag",
    "",
    undefined,
    null,
    123,
  ];
  for (const target of refused) {
    const { zd, calls } = harness({ responses: [ok()] });
    await assert.rejects(
      zd.get(target),
      (error) => error instanceof ZendeskError && /only plain \/api\/v2\/ paths/.test(error.message),
      String(target),
    );
    assert.equal(calls.length, 0, `${String(target)} sent nothing`);
  }
});

test("ordinary Zendesk paths pass, and a cursor travels as a parameter", async () => {
  const { zd, calls } = harness({ responses: [ok(), ok(), ok()] });
  await zd.get("/api/v2/help_center/en-us/articles.json");
  await zd.get("/api/v2/tickets/123/comments.json");
  await zd.get("/api/v2/tickets.json", { "page[size]": 100, "page[after]": "abc123" });
  assert.equal(calls.length, 3);
  assert.equal(
    calls[2].url,
    `${BASE}/api/v2/tickets.json?page%5Bsize%5D=100&page%5Bafter%5D=abc123`,
  );
  assert.equal(resolveReadUrl(BASE, "/api/v2/users.json").pathname, "/api/v2/users.json");
});

/* ------------------------------ configuration ------------------------------ */

test("missing configuration says what is missing, and nothing is sent", async () => {
  const { zd, calls } = harness({ env: {} });
  await assert.rejects(zd.get("/api/v2/users/me.json"), /missing ZD_SUBDOMAIN, ZD_API_EMAIL, ZD_API_TOKEN/);
  assert.equal(calls.length, 0);
});

test("a subdomain that is not a bare label is refused, so it cannot redirect the base URL", async () => {
  for (const ZD_SUBDOMAIN of ["evil.example.test/x", "a b", "-lead", "trail-", "x/../y", "ex\nample"]) {
    const { zd, calls } = harness({ env: { ...ENV, ZD_SUBDOMAIN } });
    await assert.rejects(zd.get("/api/v2/users/me.json"), /not a valid subdomain/, JSON.stringify(ZD_SUBDOMAIN));
    assert.equal(calls.length, 0);
  }
  assert.equal(harness({ env: { ...ENV, ZD_SUBDOMAIN: "Example-Test" } }).client.host(), "example-test.zendesk.com");
});

test("stray whitespace around the credentials does not change them", async () => {
  const { zd, calls } = harness({
    responses: [ok()],
    env: { ...ENV, ZD_API_EMAIL: " service-user@example.test ", ZD_API_TOKEN: "secret-token-value\n" },
  });
  await zd.get("/api/v2/users/me.json");
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from("service-user@example.test/token:secret-token-value").toString("base64")}`,
  );
});

/* ------------------------------ errors say whose problem it is ------------------------------ */

test("errors name the cause and never carry a secret", async () => {
  const cases = [
    [401, "{}", [/rejected the credentials the agendo server uses/, /tell an agendo admin/]],
    [403, "{}", [/shared user's Zendesk role/, /not of your agendo access/, /zendesk_connection_status/]],
    [404, "{}", [/no such item, or the shared Zendesk user/]],
    [422, '{"error":"InvalidValue","description":"Invalid search query"}', [/HTTP 422/, /Invalid search query/]],
    [400, '{"error":"Bad thing"}', [/\(HTTP 400\): Bad thing$/]],
    [418, "not json", [/\(HTTP 418\)\.$/]],
  ];
  for (const [code, body, patterns] of cases) {
    const { zd } = harness({ responses: [status(code, body)] });
    const error = await zd.get("/api/v2/tickets/1.json").catch((e) => e);
    assert.ok(error instanceof ZendeskError, `${code}`);
    assert.equal(error.status, code);
    for (const pattern of patterns) assert.match(error.message, pattern, `${code}`);
    assert.doesNotMatch(error.message, /secret-token-value|service-user@example\.test/);
  }
});

test("what Zendesk echoes back reaches the model but not the log line", async () => {
  const echoed = '{"error":"InvalidValue","description":"Invalid query: jane@example.test"}';
  const { zd } = harness({ responses: [status(422, echoed)] });
  const error = await zd.get("/api/v2/search.json").catch((e) => e);
  assert.match(error.message, /jane@example\.test/, "the model can see why it failed");
  assert.equal(error.logMessage, "Zendesk rejected the request (HTTP 422).");
  assert.doesNotMatch(error.logMessage, /jane@example\.test/);
  // Every other error has nothing to hide, so the two are the same.
  const plain = await harness({ responses: [status(403)] }).zd.get("/api/v2/x.json").catch((e) => e);
  assert.equal(plain.logMessage, plain.message);
});

test("a response that is not JSON, or is a redirect, is an error, and a redirect is not followed", async () => {
  const html = harness({ responses: [status(200, "<html>sign in</html>")] });
  await assert.rejects(html.zd.get("/api/v2/tickets/1.json"), /not JSON/);

  const redirect = harness({
    responses: [status(302, "", { location: "https://evil.example.test/steal" })],
  });
  await assert.rejects(redirect.zd.get("/api/v2/tickets/1.json"), /never follows/);
  assert.equal(redirect.calls.length, 1, "no second request, to anywhere");
});

test("an answer over the size limit is refused", async () => {
  const { zd } = harness({ responses: [ok({ big: "x".repeat(200) })], limits: { maxBodyChars: 50 } });
  await assert.rejects(zd.get("/api/v2/tickets.json"), /too large/);
});

/* ------------------------------ retries, within the deadline ------------------------------ */

test("429 waits for Retry-After and retries", async () => {
  const { zd, calls, sleeps } = harness({ responses: [status(429, "{}", { "retry-after": "2" }), ok({ done: 1 })] });
  assert.deepEqual(await zd.get("/api/v2/tickets.json"), { done: 1 });
  assert.deepEqual(sleeps, [2000]);
  assert.equal(calls.length, 2);
});

test("a Retry-After too long to wait becomes an error that says how long, not a hang", async () => {
  const { zd, calls, sleeps } = harness({ responses: [status(429, "{}", { "retry-after": "120" })] });
  const error = await zd.get("/api/v2/tickets.json").catch((e) => e);
  assert.match(error.message, /about 120 seconds/);
  assert.match(error.message, /Duda's whole Zendesk account/);
  assert.equal(error.retryAfterSeconds, 120);
  assert.equal(error.status, 429);
  assert.deepEqual(sleeps, []);
  assert.equal(calls.length, 1);
});

test("429 keeps being refused: it gives up after the attempt limit", async () => {
  const limited = () => status(429, "{}", { "retry-after": "1" });
  const { zd, calls, sleeps } = harness({ responses: [limited(), limited(), limited()] });
  await assert.rejects(zd.get("/api/v2/tickets.json"), /rate-limiting/);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [1000, 1000]);
});

test("5xx is retried with a growing pause, then reported", async () => {
  const recovers = harness({ responses: [status(503), ok({ done: 1 })] });
  assert.deepEqual(await recovers.zd.get("/api/v2/tickets.json"), { done: 1 });
  assert.deepEqual(recovers.sleeps, [500]);

  const stays = harness({ responses: [status(500), status(502), status(503)] });
  await assert.rejects(stays.zd.get("/api/v2/tickets.json"), /unexpected response \(HTTP 503\)/);
  assert.deepEqual(stays.sleeps, [500, 1000]);
});

test("a network failure is retried, then reported without leaking its detail", async () => {
  const recovers = harness({ responses: [new Error("socket hang up"), ok({ done: 1 })] });
  assert.deepEqual(await recovers.zd.get("/api/v2/tickets.json"), { done: 1 });

  const down = harness({ responses: [new Error("getaddrinfo secret-detail"), new Error("x"), new Error("x")] });
  const error = await down.zd.get("/api/v2/tickets.json").catch((e) => e);
  assert.equal(error.message, "Could not reach Zendesk.");

  const timeout = () => Object.assign(new Error("aborted"), { name: "TimeoutError" });
  const slow = harness({ responses: [timeout(), timeout(), timeout()] });
  await assert.rejects(slow.zd.get("/api/v2/tickets.json"), /did not answer in time/);
});

test("a success whose body never arrives is a failed attempt, retried, not reported as 'not JSON'", async () => {
  const brokenBody = {
    status: 200,
    headers: new Headers(),
    text: async () => {
      throw Object.assign(new Error("terminated"), { name: "TimeoutError" });
    },
  };
  const { zd, calls } = harness({ responses: [brokenBody, ok({ done: 1 })] });
  assert.deepEqual(await zd.get("/api/v2/tickets.json"), { done: 1 });
  assert.equal(calls.length, 2);

  const never = harness({ responses: [brokenBody, brokenBody, brokenBody] });
  await assert.rejects(never.zd.get("/api/v2/tickets.json"), /did not answer in time/);
});

test("one deadline covers every attempt: a wait that would run past it is not taken", async () => {
  // A 2-second Retry-After does not fit in a 1-second deadline, so it fails now, not later.
  const slowDown = harness({
    responses: [status(429, "{}", { "retry-after": "2" }), ok()],
    limits: { overallDeadlineMs: 1000 },
  });
  await assert.rejects(slowDown.zd.get("/api/v2/tickets.json"), /rate-limiting/);
  assert.deepEqual(slowDown.sleeps, []);
  assert.equal(slowDown.calls.length, 1);

  // Same for a 5xx backoff.
  const failing = harness({ responses: [status(503), ok()], limits: { overallDeadlineMs: 400 } });
  await assert.rejects(failing.zd.get("/api/v2/tickets.json"), /HTTP 503/);
  assert.deepEqual(failing.sleeps, []);
  assert.equal(failing.calls.length, 1);
});

/* ------------------------------ budget, fairness and concurrency ------------------------------ */

test("the process-wide budget makes the next request wait for the window to clear", async () => {
  const { zd, calls, sleeps } = harness({
    responses: [ok(), ok(), ok()],
    limits: { maxRequestsPerMinute: 2, maxBudgetWaitMs: 60_000, overallDeadlineMs: 120_000 },
  });
  for (let i = 0; i < 3; i += 1) await zd.get("/api/v2/tickets.json");
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [60_000]);
});

test("a wait longer than the limit is an error that says when to retry", async () => {
  const { zd, calls } = harness({ responses: [ok(), ok()], limits: { maxRequestsPerMinute: 2 } });
  await zd.get("/api/v2/tickets.json");
  await zd.get("/api/v2/tickets.json");
  const error = await zd.get("/api/v2/tickets.json").catch((e) => e);
  assert.match(error.message, /as many requests as it allows itself/);
  assert.equal(error.retryAfterSeconds, 60);
  assert.equal(calls.length, 2);
});

test("one person cannot spend everyone's share: each caller has their own", async () => {
  const { client, calls } = harness({
    responses: [ok(), ok(), ok()],
    limits: { maxRequestsPerCallerPerMinute: 2, maxRequestsPerMinute: 100 },
  });
  const noisy = client.forCaller("user_noisy");
  const quiet = client.forCaller("user_quiet");
  await noisy.get("/api/v2/tickets.json");
  await noisy.get("/api/v2/tickets.json");

  const error = await noisy.get("/api/v2/tickets.json").catch((e) => e);
  assert.match(error.message, /your share of the Zendesk requests/);
  assert.equal(error.retryAfterSeconds, 60);

  // Someone else is untouched, and the refused call spent nothing.
  await quiet.get("/api/v2/tickets.json");
  assert.equal(calls.length, 3);
});

test("no more than the concurrency cap are in flight at once, and every request still completes", async () => {
  let inFlight = 0;
  let peak = 0;
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok();
    },
    // One caller on purpose, so the per-caller share is raised out of the way: this test is
    // about the global cap.
    limits: {
      maxConcurrent: 2,
      maxQueued: 50,
      maxPendingPerCaller: 50,
      maxRequestsPerMinute: 1000,
      maxRequestsPerCallerPerMinute: 1000,
    },
  });
  const zd = client.forCaller("caller-1");
  const results = await Promise.all(Array.from({ length: 7 }, () => zd.get("/api/v2/tickets.json")));
  assert.equal(results.length, 7);
  assert.equal(peak, 2);
  assert.equal(inFlight, 0);
});

test("the queue for a free connection is bounded: past it, a request is refused at once", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: async () => {
      await gate;
      return ok();
    },
    limits: { maxConcurrent: 1, maxQueued: 1, maxRequestsPerMinute: 1000, maxRequestsPerCallerPerMinute: 1000 },
  });
  const zd = client.forCaller("caller-1");
  const first = zd.get("/api/v2/a.json"); // takes the slot
  const second = zd.get("/api/v2/b.json"); // waits for it
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(zd.get("/api/v2/c.json"), /backed up on the agendo server/);
  release();
  await Promise.all([first, second]); // the two that were admitted both finish
});

test("waiting for a connection counts against the deadline", async () => {
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return ok();
    },
    limits: { maxConcurrent: 1, overallDeadlineMs: 40, maxRequestsPerMinute: 1000, maxRequestsPerCallerPerMinute: 1000 },
  });
  const zd = client.forCaller("caller-1");
  const [first, second] = await Promise.allSettled([zd.get("/api/v2/a.json"), zd.get("/api/v2/b.json")]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.match(second.reason.message, /took too long/);
});

/* ------------------------------ one person's share of the queue ------------------------------ */

/** A client whose requests all wait on one gate, so slots stay held until `release()`. */
function gatedClient(limits) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: async () => {
      await gate;
      return ok();
    },
    limits: { maxRequestsPerMinute: 1000, maxRequestsPerCallerPerMinute: 1000, ...limits },
  });
  return { client, release };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("one person cannot fill the queue: past their share, they are refused and others still get in", async () => {
  const { client, release } = gatedClient({ maxConcurrent: 1, maxQueued: 20, maxPendingPerCaller: 2 });
  const noisy = client.forCaller("user_noisy");
  const quiet = client.forCaller("user_quiet");

  const first = noisy.get("/api/v2/a.json"); // holds the connection
  const second = noisy.get("/api/v2/b.json"); // queued: their second place
  await settle();
  await assert.rejects(noisy.get("/api/v2/c.json"), /already have several Zendesk requests/);
  const other = quiet.get("/api/v2/d.json"); // someone else still queues
  release();
  await Promise.all([first, second, other]);

  await noisy.get("/api/v2/e.json"); // their places were freed again
});

test("a request that never reaches Zendesk gives its budget back", async () => {
  const { client, release } = gatedClient({ maxConcurrent: 1, maxQueued: 0, maxRequestsPerCallerPerMinute: 2 });
  const zd = client.forCaller("user_a");
  const first = zd.get("/api/v2/a.json");
  await settle();
  await assert.rejects(zd.get("/api/v2/b.json"), /backed up/); // refused, so it spent nothing
  release();
  await first;
  // First + this one = their two. Had the refusal kept its place in the window, this
  // would be refused as "your share".
  await zd.get("/api/v2/c.json");
});

/* ------------------------------ cancellation ------------------------------ */

test("a request cancelled before it starts takes no budget and no connection", async () => {
  const { zd, calls } = harness({ responses: [ok()], limits: { maxRequestsPerCallerPerMinute: 1 } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(zd.get("/api/v2/tickets.json", {}, { signal: controller.signal }), /cancelled/);
  assert.equal(calls.length, 0);
  // Their one request this minute is still theirs.
  await zd.get("/api/v2/tickets.json");
  assert.equal(calls.length, 1);
});

test("a call cancelled while queued leaves the queue at once and gives its budget back", { timeout: 5000 }, async () => {
  const { client, release } = gatedClient({ maxConcurrent: 1, maxRequestsPerCallerPerMinute: 2 });
  const zd = client.forCaller("user_a");
  const first = zd.get("/api/v2/a.json"); // holds the connection
  const controller = new AbortController();
  const queued = zd.get("/api/v2/b.json", {}, { signal: controller.signal });
  await settle();

  controller.abort();
  // Settles while the connection is still held: it did not wait for its turn to notice.
  await assert.rejects(queued, /cancelled/);

  release();
  await first;
  // First + this one = their two; the cancelled call cost nothing.
  await zd.get("/api/v2/c.json");
});

test("a call cancelled while waiting for budget stops waiting", { timeout: 5000 }, async () => {
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: async () => ok(),
    now: () => 1_000_000, // frozen, so the window never clears and the wait would be a full minute
    limits: { maxRequestsPerMinute: 1, maxBudgetWaitMs: 60_000, overallDeadlineMs: 120_000 },
  });
  const zd = client.forCaller("user_a");
  await zd.get("/api/v2/a.json");

  const controller = new AbortController();
  const waiting = zd.get("/api/v2/b.json", {}, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(waiting, /cancelled/);
});

test("a request is cut off by the deadline, not by the longer per-request timeout", { timeout: 5000 }, async () => {
  const client = createZendeskClient({
    env: () => ENV,
    // Hangs until its signal fires.
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
    limits: { requestTimeoutMs: 4000, overallDeadlineMs: 60 },
  });
  // `AbortSignal.timeout` timers are unref'd by design, and a stub fetch holds no socket, so
  // nothing here would keep the event loop alive for them. A real request does.
  const keepAlive = setTimeout(() => {}, 3000);
  const started = Date.now();
  try {
    await assert.rejects(client.forCaller("user_a").get("/api/v2/a.json"), /did not answer in time/);
    assert.ok(Date.now() - started < 1500, "gave up at the deadline, not after the 4 s request timeout");
  } finally {
    clearTimeout(keepAlive);
  }
});

test("a tool can bound several requests with one deadline", async () => {
  const { zd, calls, sleeps } = harness({ responses: [status(503), ok()] });
  // The 500 ms backoff does not fit in what is left of the tool's own deadline, however
  // generous the per-call default is.
  await assert.rejects(zd.get("/api/v2/tickets.json", {}, { deadlineAt: 1_000_000 + 100 }), /HTTP 503/);
  assert.deepEqual(sleeps, []);
  assert.equal(calls.length, 1);
});

test("a request cancelled while it is in flight stops, and is not retried", async () => {
  let started = 0;
  const client = createZendeskClient({
    env: () => ENV,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        started += 1;
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      }),
  });
  const controller = new AbortController();
  const pending = client.forCaller("caller-1").get("/api/v2/tickets.json", {}, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, /cancelled/);
  assert.equal(started, 1);
});

/* ------------------------------ rate-limit headroom ------------------------------ */

test("the latest rate-limit headers are remembered, in either header family", async () => {
  const { client, zd } = harness({
    responses: [
      ok({}, { "x-rate-limit": "400", "x-rate-limit-remaining": "399" }),
      ok({}, { "ratelimit-limit": "700", "ratelimit-remaining": "650" }),
      ok({}),
    ],
  });
  assert.equal(client.lastRateLimit(), null);
  await zd.get("/api/v2/tickets.json");
  assert.deepEqual(client.lastRateLimit(), { limit: 400, remaining: 399, observedAt: 1_000_000 });
  await zd.get("/api/v2/tickets.json");
  assert.deepEqual(client.lastRateLimit(), { limit: 700, remaining: 650, observedAt: 1_000_000 });
  await zd.get("/api/v2/tickets.json");
  assert.equal(client.lastRateLimit().remaining, 650, "a response with no headers keeps the last reading");
});

/* ------------------------------ nothing else gets a client ------------------------------ */

test("only the Zendesk tools import the client, and nothing outside the MCP module reaches for it", () => {
  const src = fileURLToPath(new URL("../../", import.meta.url));
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
  const sources = walk(src)
    .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))
    .map((file) => ({ rel: path.relative(src, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") }));

  // Inside mcp/: any mention of the client outside the Zendesk tools is a second door, with
  // its own budget and no review. Scanning for the name, not for `import … from`, so a
  // dynamic `import()`, a `require` or a re-export is caught too.
  const mentions = sources
    .filter(({ rel, text }) => rel.startsWith("mcp/") && /zendeskClient/.test(text))
    .map(({ rel }) => rel)
    .sort();
  assert.deepEqual(mentions, ["mcp/tools/zendesk.js", "mcp/tools/zendeskTickets.js"]);

  // Outside mcp/: nothing imports it at all. (The Jira-backlog feature has its own,
  // unrelated client of the same file name.)
  const outsiders = sources
    .filter(({ rel, text }) => !rel.startsWith("mcp/") && /mcp\/lib\/zendeskClient/.test(text))
    .map(({ rel }) => rel);
  assert.deepEqual(outsiders, []);
});
