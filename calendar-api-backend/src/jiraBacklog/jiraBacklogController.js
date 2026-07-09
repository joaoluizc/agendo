import jiraBacklogService from "./jiraBacklogService.js";
import { isJiraConfigured, isMrrConfigured } from "./lib/config.js";
import { DROPDOWN_OPTIONS } from "./lib/dropdowns.js";

// GET /jira-backlog/config — lets the UI know whether Jira fetches are available and
// supplies the canonical dropdown options (single source of truth for both ends).
const getConfig = async (_req, res) => {
  res.status(200).json({
    jiraConfigured: isJiraConfigured(),
    mrrConfigured: isMrrConfigured(),
    dropdownOptions: DROPDOWN_OPTIONS,
  });
};

const listIssues = async (_req, res) => {
  try {
    const issues = await jiraBacklogService.getAllIssues();
    res.status(200).json(issues);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createIssue = async (req, res) => {
  try {
    const issue = await jiraBacklogService.createIssue(req.body || {});
    res.status(201).json(issue);
  } catch (error) {
    if (error.code === "DUPLICATE_ISSUE") {
      return res
        .status(409)
        .json({ code: "DUPLICATE_ISSUE", message: error.message, existingId: error.existingId });
    }
    res.status(400).json({ message: error.message });
  }
};

const updateIssue = async (req, res) => {
  try {
    const issue = await jiraBacklogService.updateIssue(req.params.id, req.body || {});
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json(issue);
  } catch (error) {
    if (error.code === "DUPLICATE_ISSUE") {
      return res
        .status(409)
        .json({ code: "DUPLICATE_ISSUE", message: error.message, existingId: error.existingId });
    }
    res.status(400).json({ message: error.message });
  }
};

const deleteIssue = async (req, res) => {
  try {
    const ok = await jiraBacklogService.deleteIssue(req.params.id);
    if (!ok) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json({ message: "Issue deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Jira not being configured is a normal, expected state (the user opted to wire it up
// later) — surface it as 409 with a code the UI can detect, not a 500.
//
// The toolbar's "Refresh ZD counts" calls this per visible row (bounded concurrency on
// the client), so there's no long-running batch request to time out.
const refreshZd = async (req, res) => {
  if (!isJiraConfigured()) {
    return res.status(409).json({ code: "JIRA_NOT_CONFIGURED", message: "Jira is not configured" });
  }
  try {
    const issue = await jiraBacklogService.refreshZdCount(req.params.id);
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json(issue);
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

// Pull as much as possible from the linked Jira ticket onto a row (summary, priority,
// squad, sprint, Zendesk count). Same 409-when-unconfigured convention as refreshZd.
const autofill = async (req, res) => {
  if (!isJiraConfigured()) {
    return res.status(409).json({ code: "JIRA_NOT_CONFIGURED", message: "Jira is not configured" });
  }
  try {
    const issue = await jiraBacklogService.autofillFromJira(req.params.id);
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json(issue);
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

// Same 409-when-unconfigured convention as refreshZd — MRR resolution needs all three of
// Jira, Zendesk, and DOMO configured, so the message names whichever aren't (mirrors the
// "which env vars" detail assertXConfig() throws, without the caller needing to know that).
const refreshMrr = async (req, res) => {
  if (!isMrrConfigured()) {
    return res.status(409).json({
      code: "MRR_NOT_CONFIGURED",
      message: "MRR lookup isn't fully configured yet (Jira, Zendesk, and DOMO are all required).",
    });
  }
  try {
    const issue = await jiraBacklogService.refreshMrr(req.params.id);
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json(issue);
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
};

/* MRR overrides: admin-managed matcher (Zendesk org / exact email) -> Duda account email.
   Plain CRUD, same conventions as bug statuses (11000 duplicate-key -> 409). */
const listMrrOverrides = async (_req, res) => {
  try {
    const overrides = await jiraBacklogService.getMrrOverrides();
    res.status(200).json(overrides);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createMrrOverride = async (req, res) => {
  try {
    const override = await jiraBacklogService.createMrrOverride(req.body || {});
    res.status(201).json(override);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ code: "DUPLICATE_OVERRIDE", message: "An override for that matcher already exists." });
    }
    res.status(400).json({ message: error.message });
  }
};

const deleteMrrOverride = async (req, res) => {
  try {
    const ok = await jiraBacklogService.deleteMrrOverride(req.params.id);
    if (!ok) return res.status(404).json({ message: "Override not found" });
    res.status(200).json({ message: "Override deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const listBugStatuses = async (_req, res) => {
  try {
    const statuses = await jiraBacklogService.getBugStatuses();
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createBugStatus = async (req, res) => {
  try {
    const status = await jiraBacklogService.createBugStatus(req.body || {});
    res.status(201).json(status);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ code: "DUPLICATE_STATUS", message: "A status with that name already exists." });
    }
    res.status(400).json({ message: error.message });
  }
};

// Deleting a status that issues still use is blocked (409) — same convention as the
// task-status guard, so the UI can show a clear message.
const deleteBugStatus = async (req, res) => {
  try {
    const result = await jiraBacklogService.deleteBugStatus(req.params.id);
    if (result.ok) return res.status(200).json({ message: "Status deleted" });
    if (result.code === "NOT_FOUND") return res.status(404).json({ message: "Status not found" });
    if (result.code === "STATUS_IN_USE") {
      return res.status(409).json({
        code: "STATUS_IN_USE",
        message: `This status is used by ${result.count} issue${result.count === 1 ? "" : "s"}. Reassign them first.`,
      });
    }
    res.status(400).json({ message: "Could not delete status" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  getConfig,
  listIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  refreshZd,
  refreshMrr,
  listMrrOverrides,
  createMrrOverride,
  deleteMrrOverride,
  autofill,
  listBugStatuses,
  createBugStatus,
  deleteBugStatus,
};
