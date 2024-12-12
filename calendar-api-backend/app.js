import express from "express";
import session from "express-session";
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
import addRequestId from "./src/middlewares/addRequestId.js";
// import seedPositions from "./src/database/seeds/seedPositions.js";

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
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }, // Set to true if using HTTPS
    proxy: true,
  })
);
app.use(cors(corsOptions));

connectDB();

// await seedPositions();

app.use("/gcalendar", addRequestId, gCalendarRouter);
app.use("/sling", addRequestId, requireAuth(), slingRouter);
app.use("/position", addRequestId, requireAuth(), positionRouter);
// app.use("/position", addRequestId, positionRouter);
app.use("/user", addRequestId, requireAuth(), userRouter);
// app.use("/shift", addRequestId, shiftRouter); // UNPROTECTED FOR DEV TESTING
app.use("/shift", addRequestId, requireAuth(), shiftRouter);

app.get("/auth-check", requireAuth(), (req, res) =>
  res.status(200).json({ message: "authenticated" })
);

app.get("/", (req, res) =>
  res.status(200).json({ message: "hey there :-))))" })
);

app.listen(port, () => {
  console.log(`Calendar api backend running on ${port}`);
});
