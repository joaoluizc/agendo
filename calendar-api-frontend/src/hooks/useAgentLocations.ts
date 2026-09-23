import { useCallback, useMemo } from "react";
import { useUserSettings } from "@/providers/useUserSettings";
import { FILTERABLE_LOCATIONS } from "@/components/ScheduleCalendar/calendar-components/LocationFilter";
import { UserSafeInfo } from "@/types/userTypes";

/**
 * Where each agent sits, for the location flags.
 *
 * Shared by the schedule grid and the duplicate-day dialog so both answer "who is in
 * APAC?" the same way — including the rule that an agent with no location only appears
 * when nothing is filtered out.
 */
export const useAgentLocations = () => {
  const { allUsers, locations } = useUserSettings();

  /** clerkId -> location name, from the location documents' own assignment lists. */
  const locationByUserId = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((location) =>
      location.assignedUsers.forEach((userId) =>
        map.set(String(userId), location.name)
      )
    );
    return map;
  }, [locations]);

  const agentsByLocation = useMemo(() => {
    const tally = new Map<string, number>();
    allUsers.forEach((user) => {
      const name = locationByUserId.get(String(user.id));
      if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
    });
    return tally;
  }, [allUsers, locationByUserId]);

  /**
   * The users a location selection shows. An agent with no location is only ever shown
   * when nothing is filtered out — a new hire is invisible under a specific flag rather
   * than appearing under one they do not belong to.
   */
  const filterByLocations = useCallback(
    <T extends Pick<UserSafeInfo, "id">>(users: T[], selected: string[]) => {
      const showing = new Set(selected);
      if (FILTERABLE_LOCATIONS.every((name) => showing.has(name))) return users;
      return users.filter((user) => {
        const name = locationByUserId.get(String(user.id));
        return name ? showing.has(name) : false;
      });
    },
    [locationByUserId]
  );

  return { locationByUserId, agentsByLocation, filterByLocations };
};
