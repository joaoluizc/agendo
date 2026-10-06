/**
 * Default region per agendo Location name (the four flag locations in
 * calendar-api-frontend's LocationFilter). Only used to pre-fill a period's agent setup:
 * the region is then stored per agent per period, so renaming a location never rewrites
 * a past quarter.
 */
export const REGIONS = ["US", "BR", "IL", "APAC"];

export const REGION_BY_LOCATION = {
  colorado: "US",
  latam: "BR",
  israel: "IL",
  apac: "APAC",
};

/**
 * clerkId -> region, for agents in exactly one mapped location. Agents in none or in
 * several are left out, so the setup asks instead of guessing (the hours report takes the
 * first location and the schedule grid the last — they disagree).
 */
export function defaultRegions(locations) {
  const found = new Map();
  for (const location of locations) {
    const region = REGION_BY_LOCATION[String(location.name || "").trim().toLowerCase()];
    if (!region) continue;
    for (const clerkId of location.assignedUsers || []) {
      if (!found.has(clerkId)) found.set(clerkId, new Set());
      found.get(clerkId).add(region);
    }
  }
  const regions = new Map();
  for (const [clerkId, set] of found) {
    if (set.size === 1) regions.set(clerkId, [...set][0]);
  }
  return regions;
}
