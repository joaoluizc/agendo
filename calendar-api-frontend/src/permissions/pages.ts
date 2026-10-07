import { Requirement } from "./permissions";

/**
 * The area pages in the header, desktop and mobile alike, with what each needs. main.tsx
 * guards the same routes with the same requirements (RequirePermission), so a link is only
 * offered to someone the page will open for.
 */
export const AREA_PAGES: { to: string; label: string; requires: Requirement }[] = [
  { to: "/app/jira-backlog", label: "Bug Tracker", requires: "bugs:view" },
  { to: "/app/tasks", label: "Bug Tasks", requires: "bugs:view" },
  { to: "/app/reports", label: "Reports", requires: "reports:self" },
  { to: "/app/performance", label: "Performance", requires: "performance:edit" },
];

/** Both schedule screens. */
export const SCHEDULE_REQUIREMENT: Requirement = "scheduling:view";
