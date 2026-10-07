import express from "express";
import performanceController from "./performanceController.js";
import { requirePermission, signedIn } from "../middlewares/requirePermission.js";
import { getCaller } from "../services/authz.js";
import { can } from "../permissions/evaluate.js";

const performanceRouter = express.Router();
const c = performanceController;

// Open to any signed-in user: answers whether *they* may use Performance, so the
// frontend knows whether to show the page and its nav link. Kept for the current frontend
// only — it reads `permissions` from /user/info once the access editor ships.
performanceRouter.get("/access", signedIn, async (req, res) => {
  try {
    res.status(200).json({ allowed: can(await getCaller(req), "performance", "edit") });
  } catch (err) {
    console.error(`[performance] access check failed: ${err.message}`);
    res.status(200).json({ allowed: false });
  }
});

// Every Performance route needs performance:edit — there is no self level; agents never
// see the score. Admins have it; so does anyone an admin grants it to.
const performanceEdit = requirePermission("performance", "edit");
performanceRouter.get("/methodologies", performanceEdit, c.listMethodologies);
performanceRouter.get("/methodologies/:key", performanceEdit, c.getMethodology);

performanceRouter.get("/periods", performanceEdit, c.listPeriods);
performanceRouter.post("/periods", performanceEdit, c.createPeriod);
performanceRouter.get("/periods/:key", performanceEdit, c.getOverview);
performanceRouter.patch("/periods/:key", performanceEdit, c.updatePeriod);
performanceRouter.put("/periods/:key/agents", performanceEdit, c.replaceAgents);
performanceRouter.post("/periods/:key/lock", performanceEdit, c.lockPeriod);
performanceRouter.post("/periods/:key/unlock", performanceEdit, c.unlockPeriod);

performanceRouter.get("/periods/:key/imports", performanceEdit, c.listImports);
performanceRouter.post("/periods/:key/imports/preview", performanceEdit, c.previewImport);
performanceRouter.post("/periods/:key/imports", performanceEdit, c.commitImport);

performanceRouter.get("/periods/:key/scores", performanceEdit, c.getScores);

performanceRouter.get("/agents", performanceEdit, c.listAgents);
performanceRouter.post("/agents", performanceEdit, c.createAgent);
performanceRouter.delete("/agents/:agentId", performanceEdit, c.deleteAgent);

performanceRouter.get("/aliases", performanceEdit, c.listAliases);
performanceRouter.delete("/aliases/:id", performanceEdit, c.deleteAlias);

export default performanceRouter;
