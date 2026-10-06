import { FILTERABLE_LOCATIONS } from "@/components/ScheduleCalendar/calendar-components/LocationFilter";
import { LOCATION_BY_REGION, type Region } from "./api";

/**
 * The page-wide region filter, driven by the schedule's own LocationFilter (globe +
 * flags), so it is picked the same way in both places. Selection is in location names,
 * as there; rows carry regions, mapped through LOCATION_BY_REGION.
 */
export type RegionFilter = {
  /** False when every location is selected — nothing is hidden. */
  filtered: boolean;
  shows: (region: Region | null | undefined) => boolean;
};

export function makeRegionFilter(selectedLocations: string[]): RegionFilter {
  const selected = new Set(selectedLocations);
  const filtered = !FILTERABLE_LOCATIONS.every((location) => selected.has(location));
  return {
    filtered,
    // An agent without a region only shows unfiltered, like an agent without a location
    // on the schedule.
    shows: (region) => !filtered || (region != null && selected.has(LOCATION_BY_REGION[region])),
  };
}

/** Agents per location, for the filter's tooltips. */
export function countsByLocation(regions: (Region | null | undefined)[]) {
  const counts = new Map<string, number>();
  for (const region of regions) {
    if (!region) continue;
    const location = LOCATION_BY_REGION[region];
    counts.set(location, (counts.get(location) ?? 0) + 1);
  }
  return counts;
}

export const ALL_LOCATIONS = [...FILTERABLE_LOCATIONS];
