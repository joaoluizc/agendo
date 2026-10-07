import express from "express";
import performanceController from "./performanceController.js";
import { canViewPerformance, canManagePerformance, hasPerformanceAccess } from "./lib/access.js";
import { getAuth } from "@clerk/express";
import { requirePermission, signedIn } from "../middlewares/requirePermission.js";

const performanceRouter = express.Router();
const c = performanceController;

// Open to any signed-in user: answers whether *they* may use Performance, so the
// frontend knows whether to show the page and its nav link.
performanceRouter.get("/access", signedIn, async (req, res) => {
  try {
    res.status(200).json({ allowed: await hasPerformanceAccess(getAuth(req)?.userId) });
  } catch (err) {
    console.error(`[performance] access check failed: ${err.message}`);
    res.status(200).json({ allowed: false });
  }
});

// Every Performance route needs performance:edit — there is no self level; agents never
// see the score. The marker (shadow mode in phase 1) runs first; the legacy allowlist gate
// from lib/access.js still enforces behind it until phase 2 removes it.
const performanceEdit = requirePermission("performance", "edit");
performanceRouter.get("/methodologies", performanceEdit, canViewPerformance, c.listMethodologies);
performanceRouter.get("/methodologies/:key", performanceEdit, canViewPerformance, c.getMethodology);

performanceRouter.get("/periods", performanceEdit, canViewPerformance, c.listPeriods);
performanceRouter.post("/periods", performanceEdit, canManagePerformance, c.createPeriod);
performanceRouter.get("/periods/:key", performanceEdit, canViewPerformance, c.getOverview);
performanceRouter.patch("/periods/:key", performanceEdit, canManagePerformance, c.updatePeriod);
performanceRouter.put("/periods/:key/agents", performanceEdit, canManagePerformance, c.replaceAgents);
performanceRouter.post("/periods/:key/lock", performanceEdit, canManagePerformance, c.lockPeriod);
performanceRouter.post("/periods/:key/unlock", performanceEdit, canManagePerformance, c.unlockPeriod);

performanceRouter.get("/periods/:key/imports", performanceEdit, canViewPerformance, c.listImports);
performanceRouter.post("/periods/:key/imports/preview", performanceEdit, canManagePerformance, c.previewImport);
performanceRouter.post("/periods/:key/imports", performanceEdit, canManagePerformance, c.commitImport);

performanceRouter.get("/periods/:key/scores", performanceEdit, canViewPerformance, c.getScores);

performanceRouter.get("/agents", performanceEdit, canViewPerformance, c.listAgents);
performanceRouter.post("/agents", performanceEdit, canManagePerformance, c.createAgent);
performanceRouter.delete("/agents/:agentId", performanceEdit, canManagePerformance, c.deleteAgent);

performanceRouter.get("/aliases", performanceEdit, canViewPerformance, c.listAliases);
performanceRouter.delete("/aliases/:id", performanceEdit, canManagePerformance, c.deleteAlias);

export default performanceRouter;
