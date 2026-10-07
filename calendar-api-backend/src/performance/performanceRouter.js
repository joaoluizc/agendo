import express from "express";
import performanceController from "./performanceController.js";
import { requirePermission } from "../middlewares/requirePermission.js";

const performanceRouter = express.Router();
const c = performanceController;

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
