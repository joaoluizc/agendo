/**
 * What can be granted in agendo: the permission areas and their levels.
 *
 * This file is the single source of truth. The User schema's `permissions` subdocument,
 * the evaluator (`evaluate.js`), every route's requirement marker, the admin editor (via
 * GET /user/permission-registry) and, later, the MCP tool filter are all derived from it.
 * Adding an area is one entry here — see docs/knowledge/permissions.md.
 *
 * Rules for editing it:
 *  - `levels` is ordinal, lowest first, and always starts with "none". Each level includes
 *    everything below it.
 *  - Levels are stored on users **by name**, never by position, so a level can be inserted
 *    later without changing what stored values mean. Never rename or remove a level that is
 *    stored on users without a migration.
 *  - A new area defaults to "none" for existing non-admins (admins get every area through
 *    the admin flag). If it is carved out of an area people can already reach, its PR must
 *    backfill current access.
 *  - The repo is public: labels and descriptions are product copy, never people or data.
 */

export const REGISTRY_VERSION = 1;

const area = (definition) =>
  Object.freeze({
    ...definition,
    levels: Object.freeze([...definition.levels]),
    describe: Object.freeze({ ...definition.describe }),
  });

export const PERMISSION_AREAS = Object.freeze({
  scheduling: area({
    label: "Scheduling",
    levels: ["none", "view", "edit"],
    defaultForNewUsers: "view",
    describe: {
      none: "No schedule pages (their own shifts still sync to their calendar)",
      view: "See the published team schedule",
      edit: "Build the schedule: drafts, edits, publishing, coverage targets, manager notes (read)",
    },
  }),
  bugs: area({
    label: "Bug tracking",
    levels: ["none", "view", "edit"],
    defaultForNewUsers: "none",
    describe: {
      none: "No access",
      view: "Read the bug backlog, tasks and triage",
      edit: "Edit bugs and tasks, run triage",
    },
  }),
  reports: area({
    label: "Reports",
    levels: ["none", "self", "edit"],
    // The level at which data is scoped to the caller's own rows (see scopeFor).
    selfLevel: "self",
    defaultForNewUsers: "self",
    describe: {
      none: "No access",
      self: "Their own report: shift hours per group",
      edit: "Everyone's reports, and the report groups (which also feed Performance hours)",
    },
  }),
  performance: area({
    label: "Performance",
    levels: ["none", "edit"],
    defaultForNewUsers: "none",
    describe: {
      none: "No access — agents never see the performance score",
      edit: "The Performance screen: scores, quarters, imports, locking, methodology",
    },
  }),
});

export const AREA_KEYS = Object.freeze(Object.keys(PERMISSION_AREAS));

/** The registry as the frontend's admin editor consumes it. Labels and copy only. */
export function publicRegistry() {
  return {
    version: REGISTRY_VERSION,
    areas: AREA_KEYS.map((key) => {
      const def = PERMISSION_AREAS[key];
      return {
        key,
        label: def.label,
        levels: def.levels.map((level) => ({ key: level, description: def.describe[level] })),
        defaultForNewUsers: def.defaultForNewUsers,
      };
    }),
  };
}

export default { REGISTRY_VERSION, PERMISSION_AREAS, AREA_KEYS, publicRegistry };
