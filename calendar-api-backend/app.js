import { fetchAndStoreEscalatedAdaChats } from "./src/services/adaService.js";
import { scheduleAdaChatsJob } from "./src/cron/adaChatsCron.js";
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
import adaRouter from "./src/routers/adaRouter.js";
import dnsRouter from "./src/routers/dnsRouter.js";
import addRequestId from "./src/middlewares/addRequestId.js";
import { mountSwagger } from "./src/swagger/swagger.js";
import forecastRouter from "./src/routers/forecastRouter.js";
import constraintRouter from "./src/routers/constraintRouter.js";
import { startDemandForecastCron } from "./src/cron/demandForecastCron.js";
// import seedPositions from "./src/database/seeds/seedPositions.js";

dotenv.config();

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
  })
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

// Start Ada escalated chats cron job
scheduleAdaChatsJob();

// Start demand forecast cron job
startDemandForecastCron();

app.use("/gcalendar", gCalendarRouter);
app.use("/sling", requireAuth(), slingRouter);
app.use("/position", requireAuth(), positionRouter);
app.use("/user", userRouter);
app.use("/shift", requireAuth(), shiftRouter);
app.use("/location", requireAuth(), locationRouter);
app.use("/skills", requireAuth(), skillRouter);

app.use("/ada", adaRouter);
app.use("/dns", dnsRouter);

app.use("/forecast", requireAuth(), forecastRouter);
app.use("/constraints", constraintRouter);

app.get("/auth-check", requireAuth(), (req, res) =>
  res.status(200).json({ message: "authenticated" })
);

app.get("/", (req, res) =>
  res.status(200).json({ message: "hey there :-))))" })
);

app.listen(port, () => {
  console.log(`Calendar api backend running on ${port}`);
});
