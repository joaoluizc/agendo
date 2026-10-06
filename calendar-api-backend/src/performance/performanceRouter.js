import express from "express";
import performanceController from "./performanceController.js";
import { canViewPerformance, canManagePerformance, hasPerformanceAccess } from "./lib/access.js";
import { getAuth } from "@clerk/express";

const performanceRouter = express.Router();
const c = performanceController;

// Open to any signed-in user: answers whether *they* may use Performance, so the
// frontend knows whether to show the page and its nav link.
performanceRouter.get("/access", async (req, res) => {
  try {
    res.status(200).json({ allowed: await hasPerformanceAccess(getAuth(req)?.userId) });
  } catch (err) {
    console.error(`[performance] access check failed: ${err.message}`);
    res.status(200).json({ allowed: false });
  }
});

// Gated through lib/access.js only, so finer roles later are a one-file change.
performanceRouter.get("/methodologies", canViewPerformance, c.listMethodologies);
performanceRouter.get("/methodologies/:key", canViewPerformance, c.getMethodology);

performanceRouter.get("/periods", canViewPerformance, c.listPeriods);
performanceRouter.post("/periods", canManagePerformance, c.createPeriod);
performanceRouter.get("/periods/:key", canViewPerformance, c.getOverview);
performanceRouter.patch("/periods/:key", canManagePerformance, c.updatePeriod);
performanceRouter.put("/periods/:key/agents", canManagePerformance, c.replaceAgents);
performanceRouter.post("/periods/:key/lock", canManagePerformance, c.lockPeriod);
performanceRouter.post("/periods/:key/unlock", canManagePerformance, c.unlockPeriod);

performanceRouter.get("/periods/:key/imports", canViewPerformance, c.listImports);
performanceRouter.post("/periods/:key/imports/preview", canManagePerformance, c.previewImport);
performanceRouter.post("/periods/:key/imports", canManagePerformance, c.commitImport);

performanceRouter.get("/periods/:key/scores", canViewPerformance, c.getScores);

performanceRouter.get("/aliases", canViewPerformance, c.listAliases);
performanceRouter.delete("/aliases/:id", canManagePerformance, c.deleteAlias);

export default performanceRouter;
