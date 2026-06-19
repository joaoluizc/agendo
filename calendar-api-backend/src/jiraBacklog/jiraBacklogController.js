import jiraBacklogService from "./jiraBacklogService.js";
import { isJiraConfigured } from "./lib/config.js";
import { DROPDOWN_OPTIONS } from "./lib/dropdowns.js";

// GET /jira-backlog/config — lets the UI know whether Jira fetches are available and
// supplies the canonical dropdown options (single source of truth for both ends).
const getConfig = async (_req, res) => {
  res.status(200).json({
    jiraConfigured: isJiraConfigured(),
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
    res.status(400).json({ message: error.message });
  }
};

const updateIssue = async (req, res) => {
  try {
    const issue = await jiraBacklogService.updateIssue(req.params.id, req.body || {});
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.status(200).json(issue);
  } catch (error) {
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

export default {
  getConfig,
  listIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  refreshZd,
};
