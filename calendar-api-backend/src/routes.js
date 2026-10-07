import userRouter from "./routers/userRouter.js";
import gCalendarRouter from "./controllers/gCalendarController.js";
import slingRouter from "./routers/slingRouter.js";
import positionRouter from "./routers/positionRouters.js";
import coverageMeterRouter from "./routers/coverageMeterRouter.js";
import shiftRouter from "./routers/shiftRouter.js";
import locationRouter from "./routers/locationRouter.js";
import skillRouter from "./routers/skillRouter.js";
import dnsRouter from "./routers/dnsRouter.js";
import metaRouter from "./routers/metaRouter.js";
// DiscovAI search — self-contained module, see src/discovai/README.md to remove.
import discovaiRouter from "./discovai/discovaiRouter.js";
// Jira backlog — self-contained module, see src/jiraBacklog/README.md to remove.
import jiraBacklogRouter from "./jiraBacklog/jiraBacklogRouter.js";
// Reports — self-contained module, see src/reports/README.md to remove.
import reportsRouter from "./reports/reportsRouter.js";
// Performance — self-contained module, see src/performance/README.md to remove.
import performanceRouter from "./performance/performanceRouter.js";

/**
 * Every REST router and where it is mounted, in mount order. app.js mounts this list;
 * `permissions/routeRequirements.test.js` walks the same list, so the test checks the real
 * mount table rather than a copy of it. The MCP routes (mcp/mcpRouter.js) and Swagger are
 * mounted separately in app.js because of the CORS ordering they need.
 *
 * There is no router-level gate: every route authenticates and authorizes through its own
 * requirement marker (middlewares/requirePermission.js); routeRequirements.test.js proves none is missing.
 */
export const API_ROUTERS = [
  { path: "/gcalendar", router: gCalendarRouter },
  { path: "/sling", router: slingRouter },
  { path: "/position", router: positionRouter },
  { path: "/coverage-meter", router: coverageMeterRouter },
  { path: "/user", router: userRouter },
  { path: "/shift", router: shiftRouter },
  { path: "/location", router: locationRouter },
  { path: "/skills", router: skillRouter },
  // Public on purpose: used outside agendo.
  { path: "/dns", router: dnsRouter },
  // DiscovAI search (public, no auth — like /dns). Self-contained module.
  { path: "/discovai", router: discovaiRouter },
  { path: "/jira-backlog", router: jiraBacklogRouter },
  { path: "/reports", router: reportsRouter },
  { path: "/performance", router: performanceRouter },
  // Last: `/`, `/auth-check`, `/version`.
  { path: "/", router: metaRouter },
];

export function mountApiRoutes(app) {
  for (const { path, router } of API_ROUTERS) {
    app.use(path, router);
  }
}

export default { API_ROUTERS, mountApiRoutes };
