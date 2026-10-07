import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import process from "process";
import { clerkMiddleware } from "@clerk/express";

import connectDB from "./src/database/db.js";
import addRequestId from "./src/middlewares/addRequestId.js";
import { mountSwagger } from "./src/swagger/swagger.js";
import { startJiraBacklogScheduler } from "./src/jiraBacklog/scheduler.js";
// Every REST router and its mount path — see src/routes.js.
import { mountApiRoutes } from "./src/routes.js";
// MCP server — self-contained module, see src/mcp/README.md to remove.
import { mountMcpRoutes } from "./src/mcp/mcpRouter.js";

dotenv.config();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

const port = process.env.PORT || 3001;

const corsOrigin =
  process.env.NODE_ENV === "production"
    ? "https://agendo-navy.vercel.app"
    : "http://localhost:3001";

const app = express();
app.use(
  express.json({
    verify: function (req, res, buf) {
      req.rawBody = buf;
    },
  }),
);
app.use(clerkMiddleware());
app.use(cookieParser());
// Hoisted above mountMcpRoutes: the MCP routes log with req.requestId, so the id has to
// exist before they run. Everything downstream is unaffected by the earlier assignment.
app.use(addRequestId);

// MCP server (self-contained module). Mounted here, ahead of the global CORS policy
// below, on purpose: that policy is locked to the Vercel origin and answers preflight
// requests itself, so anything mounted after it can never apply its own CORS. MCP's
// discovery routes must be publicly readable and must expose WWW-Authenticate, so they
// carry their own policy — see src/mcp/mcpRouter.js. It still sits after
// clerkMiddleware(), which is what makes the OAuth token on the request verifiable.
mountMcpRoutes(app);

const corsOptions = {
  origin: corsOrigin,
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(cors(corsOptions));
mountSwagger(app);

connectDB();

// Jira backlog: register the daily 00:00 UTC "Sync from Jira" job (self-contained module).
startJiraBacklogScheduler();

mountApiRoutes(app);

app.listen(port, "0.0.0.0", () => {
  console.log(`Calendar api backend running on ${port}`);
});
