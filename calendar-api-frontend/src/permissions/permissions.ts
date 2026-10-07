/**
 * agendo's permission areas and levels, as the UI uses them to decide what to show.
 *
 * Mirrors calendar-api-backend/src/permissions/registry.js. The server is the authority —
 * every API call is checked there — so this only keeps the UI from offering what the API
 * would refuse. The admin access editor renders its labels and descriptions from
 * GET /api/user/permission-registry; a new area needs adding here too, to gate its pages.
 * See docs/knowledge/permissions.md.
 */
export const AREA_LEVELS = {
  scheduling: ["none", "view", "edit"],
  bugs: ["none", "view", "edit"],
  reports: ["none", "self", "edit"],
  performance: ["none", "edit"],
} as const;

export type AreaKey = keyof typeof AREA_LEVELS;
export type LevelOf<A extends AreaKey> = (typeof AREA_LEVELS)[A][number];
export type Permissions = { [A in AreaKey]: LevelOf<A> };

export const AREA_KEYS = Object.keys(AREA_LEVELS) as AreaKey[];

export const AREA_LABELS: Record<AreaKey, string> = {
  scheduling: "Scheduling",
  bugs: "Bug tracking",
  reports: "Reports",
  performance: "Performance",
};

export const NO_PERMISSIONS: Permissions = {
  scheduling: "none",
  bugs: "none",
  reports: "none",
  performance: "none",
};

/** What a page or control needs: admin, or at least a level in an area. */
export type Requirement = "admin" | { [A in AreaKey]: `${A}:${LevelOf<A>}` }[AreaKey];

/** Whatever the server sent, as a full Permissions object. Unknown or missing → "none". */
export function normalizePermissions(raw: unknown): Permissions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = { ...NO_PERMISSIONS } as Record<AreaKey, string>;
  for (const area of AREA_KEYS) {
    const level = source[area];
    if (typeof level === "string" && (AREA_LEVELS[area] as readonly string[]).includes(level)) {
      result[area] = level;
    }
  }
  return result as Permissions;
}

/** Does `permissions` hold at least `min` in `area`? Ordinal, like the server. */
export function hasLevel<A extends AreaKey>(
  permissions: Permissions,
  area: A,
  min: LevelOf<A>,
): boolean {
  const levels = AREA_LEVELS[area] as readonly string[];
  return levels.indexOf(permissions[area]) >= levels.indexOf(min);
}

export type Access = { isAdmin: boolean; permissions: Permissions };

/** Does this access satisfy `requirement`? Admins satisfy everything. */
export function meets(access: Access, requirement: Requirement): boolean {
  if (access.isAdmin) return true;
  if (requirement === "admin") return false;
  const [area, level] = requirement.split(":") as [AreaKey, string];
  return hasLevel(access.permissions, area, level as LevelOf<typeof area>);
}

/** Who a page is for, in words, for the "no access" screen. */
export function describeRequirement(requirement: Requirement): string {
  if (requirement === "admin") return "agendo admins";
  const [area, level] = requirement.split(":") as [AreaKey, string];
  return `${AREA_LABELS[area]}: ${level}`;
}

/**
 * Local-development preview: render the app as someone with these permissions (and not an
 * admin). UI only — the server still knows you as yourself.
 */
export const PREVIEW_PRESETS: { key: string; label: string; permissions: Permissions }[] = [
  {
    key: "agent",
    label: "Agent",
    permissions: { scheduling: "view", bugs: "none", reports: "self", performance: "none" },
  },
  {
    key: "scheduler",
    label: "Scheduler",
    permissions: { scheduling: "edit", bugs: "none", reports: "self", performance: "none" },
  },
  {
    key: "bugs",
    label: "Bug triager",
    permissions: { scheduling: "view", bugs: "edit", reports: "self", performance: "none" },
  },
  {
    key: "lead",
    label: "Lead",
    permissions: { scheduling: "edit", bugs: "view", reports: "edit", performance: "edit" },
  },
  { key: "none", label: "No access", permissions: NO_PERMISSIONS },
];
