import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import process from "process";
import { clerkMiddleware, requireAuth } from "@clerk/express";

import connectDB from "./src/database/db.js";
import userRouter from "./src/routers/userRouter.js";
import gCalendarRouter from "./src/controllers/gCalendarController.js";
import slingRouter from "./src/routers/slingRouter.js";
import positionRouter from "./src/routers/positionRouters.js";
import shiftRouter from "./src/routers/shiftRouter.js";
import locationRouter from "./src/routers/locationRouter.js";
import skillRouter from "./src/routers/skillRouter.js";
import dnsRouter from "./src/routers/dnsRouter.js";
import addRequestId from "./src/middlewares/addRequestId.js";
import { mountSwagger } from "./src/swagger/swagger.js";
// DiscovAI search — self-contained module, see src/discovai/README.md to remove.
import discovaiRouter from "./src/discovai/discovaiRouter.js";
// Jira backlog — self-contained module, see src/jiraBacklog/README.md to remove.
import jiraBacklogRouter from "./src/jiraBacklog/jiraBacklogRouter.js";
import { startJiraBacklogScheduler } from "./src/jiraBacklog/scheduler.js";

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
app.use(clerkMiddleware());
const corsOptions = {
  origin: corsOrigin,
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(addRequestId);
mountSwagger(app);

connectDB();

// Jira backlog: register the daily 00:00 UTC "Sync from Jira" job (self-contained module).
startJiraBacklogScheduler();

app.use("/gcalendar", gCalendarRouter);
app.use("/sling", requireAuth(), slingRouter);
app.use("/position", requireAuth(), positionRouter);
app.use("/user", userRouter);
app.use("/shift", requireAuth(), shiftRouter);
app.use("/location", requireAuth(), locationRouter);
app.use("/skills", requireAuth(), skillRouter);

app.use("/dns", dnsRouter);

// DiscovAI search (public, no auth — like /ada and /dns). Self-contained module.
app.use("/discovai", discovaiRouter);

// Jira backlog (self-contained module). Authed like the rest of /app; admin-only
// mutations are enforced inside the router via agendo's adminOnly middleware.
app.use("/jira-backlog", requireAuth(), jiraBacklogRouter);

app.get("/auth-check", requireAuth(), (req, res) =>
  res.status(200).json({ message: "authenticated" }),
);

app.get("/", (req, res) =>
  res.status(200).json({ message: "hey there :-))))" }),
);

app.listen(port, "0.0.0.0", () => {
  console.log(`Calendar api backend running on ${port}`);
});
