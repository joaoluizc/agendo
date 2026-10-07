import express from "express";
import process from "process";
import requireSession from "../middlewares/requireSession.js";
import { publicRoute, signedIn } from "../middlewares/requirePermission.js";

// The app's own small endpoints. They lived inline in app.js; a router makes them visible
// to the route-requirements test like every other route.
const metaRouter = express.Router();

// Stamped when the module loads, i.e. at boot, so /version can report how long this build
// has been serving.
const startedAt = new Date();

metaRouter.get("/", publicRoute, (req, res) =>
  res.status(200).json({ message: "hey there :-))))" }),
);

metaRouter.get("/auth-check", signedIn, requireSession, (req, res) =>
  res.status(200).json({ message: "authenticated" }),
);

/**
 * Which build is actually serving — the question "is my change live yet?" had no answer
 * short of the Render dashboard, because nothing the API returns distinguishes one
 * deploy from the next. Render sets RENDER_GIT_COMMIT itself; running anywhere else
 * reports "unknown", which is the honest answer and a useful signal on its own.
 *
 * Signed-in only, like everything but `/`. The sha is not a secret — the repo is
 * public — but pinning a live deployment to an exact tree tells anyone probing which
 * known advisories still apply to it and which are already patched out, and that is
 * worth nothing to an anonymous caller. Short sha and boot time only: no env names, no
 * dependency versions, nothing that grows into a recon aid.
 *
 * From a signed-in browser, the frontend's /api rewrite reaches it at /api/version.
 */
metaRouter.get("/version", signedIn, requireSession, (req, res) =>
  res.status(200).json({
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "unknown",
    startedAt: startedAt.toISOString(),
  }),
);

export default metaRouter;
