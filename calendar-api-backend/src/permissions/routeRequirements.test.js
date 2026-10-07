import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";

/**
 * Every route agendo serves declares exactly one requirement marker, first in its chain
 * (middlewares/requirePermission.js), and the full route → requirement map below is the
 * reviewed contract. Adding a route without a marker, or changing who may call one, fails
 * here — so it shows up in review as a diff to EXPECTED.
 *
 * It loads the real routers and the real mount table (src/routes.js, mcp/mcpRouter.js).
 * Two modules do I/O at import time and are mocked so this runs offline: the Redis client
 * (connects with a top-level await) and the Sling service (calls Sling's API on load).
 * Needs `--experimental-test-module-mocks` (see the `test` script in package.json).
 */

const EXPECTED = {
  // MCP + OAuth discovery (mcp/mcpRouter.js; tools carry their own requirements)
  "GET /.well-known/oauth-protected-resource/mcp": "public",
  "GET /.well-known/oauth-protected-resource": "public",
  "GET /.well-known/oauth-authorization-server": "public",
  "GET /mcp-client.json": "public",
  "ALL /mcp": "mcp",

  // Meta
  "GET /": "public",
  "GET /auth-check": "signedIn",
  "GET /version": "signedIn",

  // Users
  "GET /user/info": "signedIn",
  "GET /user/all": "signedIn",
  "GET /user/permission-registry": "signedIn",
  "POST /user/clerk/new": "webhook",
  "PUT /user/me/timezone": "signedIn",
  "PUT /user/:clerkId/timezone": "admin",
  "PUT /user/:clerkId/preferences": "admin",

  // Google Calendar
  "GET /gcalendar/calendars": "signedIn", // broken; deleted in phase 2
  "GET /gcalendar/events": "signedIn", // broken; deleted in phase 2
  "GET /gcalendar/all-events": "admin", // everyone's personal calendars
  "POST /gcalendar/days-shifts-to-gcal": "admin", // bulk sync
  "POST /gcalendar/user-day-shifts-to-gcal": "signedIn", // own calendar
  "POST /gcalendar/admin-sync-user-day-shifts": "scheduling:edit",
  "GET /gcalendar": "public",
  "GET /gcalendar/all-events-excluding-platform": "admin",

  // Sling (legacy)
  "GET /sling/positions": "scheduling:view", // broken; deleted in phase 2
  "GET /sling/users": "admin", // raw Sling roster, no frontend caller
  "GET /sling/calendar": "scheduling:view",

  // Positions
  "GET /position/all": "signedIn",
  "POST /position/new": "admin",
  "GET /position": "signedIn", // broken; deleted in phase 2
  "GET /position/sync": "signedIn",
  "PUT /position/sync": "signedIn",
  "GET /position/sync-rules": "scheduling:edit",
  "GET /position/default-color": "signedIn",
  "PUT /position/default-color": "signedIn",
  "PUT /position/:positionId": "admin",
  "DELETE /position/:positionId": "admin",

  // Coverage targets (scheduling edit includes them — decision 5)
  "GET /coverage-meter": "scheduling:edit",
  "PUT /coverage-meter": "scheduling:edit",

  // Shifts
  "POST /shift/new": "scheduling:edit",
  "GET /shift/range": "scheduling:view",
  "GET /shift": "scheduling:view",
  "PUT /shift": "scheduling:edit",
  "POST /shift/delete": "scheduling:edit",
  "GET /shift/range/with-sling": "scheduling:view",
  "POST /shift/duplicate-shifts": "scheduling:edit",
  "POST /shift/publish": "scheduling:edit",
  "POST /shift/unpublish": "scheduling:edit",

  // Locations
  "GET /location/all": "signedIn",
  "POST /location/new": "admin",
  "GET /location/:id": "signedIn",
  "PUT /location/:id": "admin",
  "DELETE /location/:id": "admin",

  // Skills
  "GET /skills": "scheduling:view",
  "GET /skills/:skillId": "scheduling:view",
  "POST /skills": "admin",
  "PUT /skills/:skillId": "admin",
  "DELETE /skills/:skillId": "admin",

  // Public on purpose: used outside agendo
  "GET /dns/lookup": "public",
  "GET /discovai": "public",
  "POST /discovai/chat": "public",
  "POST /discovai/:dataset/chat": "public",

  // Bug tracking (config is admin-only — decision 6)
  "GET /jira-backlog/config": "bugs:view",
  "GET /jira-backlog/issues": "bugs:view",
  "POST /jira-backlog/issues": "bugs:edit",
  "PATCH /jira-backlog/issues/:id": "bugs:edit",
  "DELETE /jira-backlog/issues/:id": "bugs:edit",
  "POST /jira-backlog/issues/:id/refresh-zd": "bugs:edit",
  "POST /jira-backlog/issues/:id/refresh-mrr": "bugs:edit",
  "POST /jira-backlog/issues/:id/autofill": "bugs:edit",
  "GET /jira-backlog/mrr-overrides": "admin",
  "POST /jira-backlog/mrr-overrides": "admin",
  "DELETE /jira-backlog/mrr-overrides/:id": "admin",
  "GET /jira-backlog/bug-statuses": "bugs:view",
  "POST /jira-backlog/bug-statuses": "admin",
  "DELETE /jira-backlog/bug-statuses/:id": "admin",
  "GET /jira-backlog/tasks": "bugs:view",
  "POST /jira-backlog/tasks": "bugs:edit",
  "GET /jira-backlog/issues/:id/tasks": "bugs:view",
  "POST /jira-backlog/issues/:id/tasks": "bugs:edit",
  "PATCH /jira-backlog/tasks/:taskId": "bugs:edit",
  "DELETE /jira-backlog/tasks/:taskId": "bugs:edit",
  "POST /jira-backlog/issues/:id/no-eta-task": "bugs:edit",
  "POST /jira-backlog/tasks/:taskId/no-eta": "bugs:edit",
  "GET /jira-backlog/task-statuses": "bugs:view",
  "POST /jira-backlog/task-statuses": "admin",
  "PUT /jira-backlog/task-statuses/order": "admin",
  "PATCH /jira-backlog/task-statuses/:id": "admin",
  "DELETE /jira-backlog/task-statuses/:id": "admin",

  // Reports
  "GET /reports/groups": "reports:edit",
  "PUT /reports/groups": "reports:edit",
  "GET /reports/hours": "reports:self",

  // Performance (no self level — agents never see the score)
  "GET /performance/access": "signedIn", // removed with the old frontend gate
  "GET /performance/methodologies": "performance:edit",
  "GET /performance/methodologies/:key": "performance:edit",
  "GET /performance/periods": "performance:edit",
  "POST /performance/periods": "performance:edit",
  "GET /performance/periods/:key": "performance:edit",
  "PATCH /performance/periods/:key": "performance:edit",
  "PUT /performance/periods/:key/agents": "performance:edit",
  "POST /performance/periods/:key/lock": "performance:edit",
  "POST /performance/periods/:key/unlock": "performance:edit",
  "GET /performance/periods/:key/imports": "performance:edit",
  "POST /performance/periods/:key/imports/preview": "performance:edit",
  "POST /performance/periods/:key/imports": "performance:edit",
  "GET /performance/periods/:key/scores": "performance:edit",
  "GET /performance/agents": "performance:edit",
  "POST /performance/agents": "performance:edit",
  "DELETE /performance/agents/:agentId": "performance:edit",
  "GET /performance/aliases": "performance:edit",
  "DELETE /performance/aliases/:id": "performance:edit",
};

let routes;

function joinPath(base, path) {
  const joined = `${base}/${path}`.replace(/\/{2,}/g, "/");
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

// `app.all` registers the handler chain once per HTTP method (express 4.21), so an
// all-methods route is reported as ALL and its handlers are de-duplicated.
const ALL_METHODS_THRESHOLD = 20;

function collect(stack, base) {
  return stack
    .filter((layer) => layer.route)
    .map((layer) => {
      const methods = Object.keys(layer.route.methods);
      const verb =
        methods.includes("_all") || methods.length > ALL_METHODS_THRESHOLD
          ? "ALL"
          : methods.map((m) => m.toUpperCase()).join(",");
      const handlers = [...new Set(layer.route.stack.map((s) => s.handle))];
      return { key: `${verb} ${joinPath(base, layer.route.path)}`, handlers };
    });
}

before(async () => {
  const redis = { get: async () => null, set: async () => "OK", del: async () => 0, on() {} };
  mock.module(new URL("../database/redisClient.js", import.meta.url).href, {
    defaultExport: redis,
  });
  mock.module(new URL("../services/slingService.js", import.meta.url).href, {
    defaultExport: class FakeSlingService {
      async init() {}
    },
  });

  const { API_ROUTERS } = await import("../routes.js");
  const { mountMcpRoutes } = await import("../mcp/mcpRouter.js");

  const mcpApp = express();
  mountMcpRoutes(mcpApp);

  routes = [
    ...collect(mcpApp._router.stack, ""),
    ...API_ROUTERS.flatMap(({ path, router }) => collect(router.stack, path)),
  ];
});

test("every route has exactly one requirement marker, first in its chain", () => {
  const problems = [];
  for (const { key, handlers } of routes) {
    const markers = handlers.filter((h) => h.requirement);
    if (markers.length !== 1) {
      problems.push(`${key}: ${markers.length} markers`);
    } else if (!handlers[0].requirement) {
      problems.push(`${key}: marker is not the first handler`);
    }
  }
  assert.deepEqual(problems, []);
});

test("no route is declared twice", () => {
  const keys = routes.map((r) => r.key);
  const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
  assert.deepEqual(duplicates, []);
});

test("the route → requirement map matches the reviewed contract", () => {
  const actual = Object.fromEntries(
    routes.map(({ key, handlers }) => [key, handlers.find((h) => h.requirement)?.requirement]),
  );
  const missing = Object.keys(EXPECTED).filter((key) => !(key in actual));
  const unexpected = Object.keys(actual).filter((key) => !(key in EXPECTED));
  const changed = Object.keys(EXPECTED)
    .filter((key) => key in actual && actual[key] !== EXPECTED[key])
    .map((key) => `${key}: expected ${EXPECTED[key]}, got ${actual[key]}`);
  assert.deepEqual({ missing, unexpected, changed }, { missing: [], unexpected: [], changed: [] });
  assert.equal(routes.length, 110);
});
