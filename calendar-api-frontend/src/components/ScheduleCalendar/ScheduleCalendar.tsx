import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TRACK_MIN_PX,
  getShifts,
  getGCalendarEvents,
  startOfLocalDay,
} from "./scheduleUtils.ts";
import { formatDateParam } from "@/utils/utils.ts";
import { CalendarUser, GCalEventWithGrid } from "@/types/gCalendarTypes.ts";
import { SortedCalendar } from "@/types/shiftTypes.ts";
import { Skeleton } from "@/components/ui/skeleton";
import CalendarHeader from "./calendar-components/CalendarHeader.tsx";
import ScheduleToolbar from "./calendar-components/ScheduleToolbar.tsx";
import AgentRow from "./calendar-components/AgentRow.tsx";
import CoverageRow from "./calendar-components/CoverageRow.tsx";
import PublishDraftsBar from "./calendar-components/PublishDraftsBar.tsx";
import PendingChangePrompt from "./calendar-components/PendingChangePrompt.tsx";
import NowLine from "./calendar-components/NowLine.tsx";
import ScheduleLegend from "./calendar-components/ScheduleLegend.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { useUser } from "@clerk/clerk-react";
import { useSchedule } from "@/providers/useSchedule.tsx";
import { useScheduleDateParam } from "@/hooks/useScheduleDateParam.ts";
import { useAgentLocations } from "@/hooks/useAgentLocations.ts";
import { useSelectShortcuts } from "@/hooks/useSelectShortcuts.ts";
import { FILTERABLE_LOCATIONS } from "./calendar-components/LocationFilter.tsx";

/** Row height of a single-lane agent row — the skeleton matches it so nothing jumps. */
const SKELETON_ROW_HEIGHT = 32;

const Schedule = () => {
  const {
    shifts,
    events,
    scheduleIsLoading,
    setShifts,
    setEvents,
    setScheduleIsLoading,
    exitBulkSelect,
    registerReload,
    reloadSchedule,
    isBulkSelectorActive,
    setFocusedPositionIds,
    setVisibleShifts,
  } = useSchedule();
  const { selectedDate, dateKey, setDate } = useScheduleDateParam();
  const datepickerRef = useRef<AirDatepicker | null>(null);
  const { type, allUsers, allPositions, coverageMeters } =
    useUserSettings();

  /**
   * Which locations the grid is showing. Starts as every one of them, and the filter
   * never lets it become empty, so "all" is a real state rather than a special case.
   *
   * Not persisted: a filter that survives a reload is one you forget is on, and the
   * consequence here is an agent who looks unscheduled because they are hidden.
   */
  const [locationFilter, setLocationFilter] = useState<string[]>([
    ...FILTERABLE_LOCATIONS,
  ]);

  const { agentsByLocation, filterByLocations } = useAgentLocations();

  /**
   * The coverage meter the admin clicked, if any. Its shifts stay as they are and every
   * other shift is dimmed — dimmed, not hidden, because the reason to focus a meter is
   * usually to move someone onto it ("Ana is out, who can take Tickets?"), and a hidden
   * meeting makes a busy agent look free. Every row stays, so a new shift can still be
   * drawn anywhere. Not persisted, like the location filter.
   */
  const [focusedMeterId, setFocusedMeterId] = useState<string | null>(null);
  const focusedMeter =
    coverageMeters.find((meter) => meter._id === focusedMeterId) ?? null;

  useEffect(() => {
    setFocusedPositionIds(
      focusedMeter ? new Set(focusedMeter.positionIds.map(String)) : null
    );
  }, [focusedMeter]);

  // The provider outlives this page; leaving must not strand the grid dimmed.
  useEffect(() => () => setFocusedPositionIds(null), []);

  // Escape clears the focus — unless select mode is on (Escape clears the selection
  // there) or a dialog is open (Escape is closing it).
  useEffect(() => {
    if (!focusedMeterId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isBulkSelectorActive) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setFocusedMeterId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedMeterId, isBulkSelectorActive]);

  /** The agents the grid draws — see `useAgentLocations` for the no-location rule. */
  const visibleUsers = useMemo(
    () => filterByLocations(allUsers, locationFilter),
    [allUsers, filterByLocations, locationFilter]
  );
  /**
   * The day's shifts, narrowed to the agents the grid actually draws.
   *
   * The grid renders a row per `visibleUsers`, but the draft bar used to count — and
   * publish — every shift in the day. Two ways that diverges, both seen in production:
   * a location filter hides an agent who still has drafts, and a shift keyed to a clerk
   * id that is on no roster at all has nowhere to render. Either way the bar announced
   * unpublished shifts nobody could point at, and its publish button committed them to
   * those agents' calendars sight unseen.
   *
   * Off-roster shifts are dropped rather than surfaced: the schedule is the roster's
   * view of its own day, and `reportsService` already ignores the same rows for the same
   * reason (a dev-environment login writes into the shared `shifts` collection under an
   * id only `dev-users` knows). Clearing those is `purgeOrphanShifts.js`'s job, not the
   * schedule's.
   */
  const visibleShifts = useMemo(() => {
    const drawn = new Set(visibleUsers.map((currUser) => String(currUser.id)));
    return Object.fromEntries(
      Object.entries(shifts).filter(([userId]) => drawn.has(String(userId)))
    ) as SortedCalendar;
  }, [shifts, visibleUsers]);

  // The toolbar's Select all and Ctrl/Cmd+A select from this, so they pick exactly the
  // shifts on screen.
  useEffect(() => {
    setVisibleShifts(visibleShifts);
  }, [visibleShifts]);

  const { user } = useUser();
  const visitorId = user?.id;

  const isAdmin = type === "admin";
  useSelectShortcuts(isAdmin);
  const isToday =
    startOfLocalDay(selectedDate).getTime() ===
    startOfLocalDay(new Date()).getTime();

  const [showTargets] = useState(true);

  const positionsById = useMemo(
    () => new Map(allPositions.map((position) => [String(position._id), position])),
    [allPositions]
  );

  /** Google Calendar events keyed by user, ready for the under-lane. */
  const eventsByUser = useMemo(() => {
    const byUser = new Map<string, GCalEventWithGrid[]>();
    events.forEach((calUser: CalendarUser) => {
      byUser.set(
        String(calUser.userId),
        calUser.events as unknown as GCalEventWithGrid[]
      );
    });
    return byUser;
  }, [events]);

  /**
   * The day the latest fetch was for. A response for any other day is dropped: a slow
   * refetch started before the user navigated would otherwise write yesterday's shifts
   * into the grid under today's date.
   */
  const latestFetchKey = useRef<string | null>(null);

  /**
   * Load the day's shifts and, for admins, its Google Calendar events.
   *
   * `quiet` refreshes in place instead of swapping the grid for a skeleton — for a
   * refetch after an action, where blanking a full roster just to redraw it is the
   * hiccup, not the feedback.
   *
   * The two requests settle independently. They used to share a `Promise.all`, so a
   * failing events call (the heavy one — every agent's Google Calendar) also discarded
   * perfectly good shifts: after a publish the grid kept showing drafts that the server
   * had already published.
   */
  const fetchData = async (date: Date, { quiet = false } = {}) => {
    const key = formatDateParam(date);
    latestFetchKey.current = key;
    if (!quiet) setScheduleIsLoading(true);
    try {
      const [shiftsResult, eventsResult] = await Promise.allSettled([
        getShifts(date),
        isAdmin ? getGCalendarEvents(date) : Promise.resolve([]),
      ]);
      if (latestFetchKey.current !== key) return;

      if (shiftsResult.status === "fulfilled") setShifts(shiftsResult.value);
      else console.error("Error fetching shifts:", shiftsResult.reason);

      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
      else console.error("Error fetching calendar events:", eventsResult.reason);
    } finally {
      if (!quiet && latestFetchKey.current === key) setScheduleIsLoading(false);
    }
  };

  /** Refetch whatever day is on screen *now*, not the one a callback closed over. */
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const reloadCurrentDay = () =>
    fetchData(selectedDateRef.current, { quiet: true });

  useEffect(() => {
    registerReload(reloadCurrentDay);
  });

  const todayButton = {
    content: "Today",
    onClick: (dp: AirDatepicker) => {
      const date = new Date();
      dp.selectDate(date);
      dp.setViewDate(date);
    },
  };

  // Create the date picker once; picking a day just updates the URL param.
  useEffect(() => {
    const datepicker = new AirDatepicker<HTMLInputElement>("#date", {
      selectedDates: [selectedDate],
      onSelect: ({ date, datepicker }) => {
        datepicker.hide();
        const newDate = Array.isArray(date) ? date[0] : date;
        if (newDate) setDate(newDate);
      },
      locale: localeEn,
      toggleSelected: false,
      dateFormat: "E MMM d yyyy",
      buttons: [todayButton, "clear"],
    });
    datepickerRef.current = datepicker;

    return () => datepicker.destroy();
  }, []);

  // Keep the picker's highlighted day in sync with the date driven by the URL
  // (prev/next/today buttons, manual edits, refresh on a shared link).
  useEffect(() => {
    datepickerRef.current?.selectDate(selectedDate, { silent: true });
    datepickerRef.current?.setViewDate(selectedDate);
  }, [dateKey]);

  // Load shifts (and, for admins, Google Calendar events) for the selected day.
  useEffect(() => {
    fetchData(selectedDate);
  }, [dateKey, type]);

  /**
   * Leave select-shifts mode entirely when the day changes.
   *
   * This is a data-loss fix, not tidiness. The selection lives on the provider and used to
   * survive navigation, while only the visible day's blocks render — so shifts selected on
   * one day stayed selected, invisibly, with no way to see or deselect them. Selecting a
   * few more on the next day and hitting Delete then deleted both days' worth. It happened.
   *
   * Exiting the mode rather than only emptying the selection, so it matches every other way
   * a bulk flow ends: navigating away is finishing with that day, and coming back into an
   * armed mode with nothing selected is a state nobody asked for.
   */
  useEffect(() => {
    exitBulkSelect();
  }, [dateKey]);

  return (
    <div>
      <ScheduleToolbar
        selectedDate={selectedDate}
        onSelectDate={setDate}
        isToday={isToday}
        onReload={reloadSchedule}
        locationFilter={locationFilter}
        onLocationFilterChange={setLocationFilter}
        agentsByLocation={agentsByLocation}
      />

      {/* Creating a shift no longer syncs it, so the day needs somewhere that says
          out loud what has not been committed yet. Renders nothing when the day is
          fully published. */}
      {isAdmin && (
        <PublishDraftsBar
          shifts={visibleShifts}
          onPublished={reloadCurrentDay}
        />
      )}

      {/* Says out loud that the grid is dimmed on purpose, and how to undo it — a grid
          that is mostly faded with no explanation reads as broken. */}
      {focusedMeter && (
        <div className="mx-5 mb-3 flex items-center gap-2.5 rounded-lg border border-border bg-band px-3.5 py-2 text-[12.5px]">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: focusedMeter.color }}
          />
          <span>
            Highlighting <span className="font-semibold">{focusedMeter.name}</span>{" "}
            shifts
            <span className="text-muted-foreground">
              {" "}
              — everything else is dimmed; new shifts default to{" "}
              {focusedMeter.name}.
            </span>
          </span>
          <button
            type="button"
            className="ml-auto whitespace-nowrap text-[12px] font-semibold text-primary hover:underline"
            onClick={() => setFocusedMeterId(null)}
          >
            Show all <span className="font-normal text-muted-foreground">(esc)</span>
          </button>
        </div>
      )}

      {/* One card, one horizontal scroll container. The agent column is sticky
          inside it, so the whole grid scrolls together instead of every row owning
          its own scrollbar. `relative` sits on the inner track rather than on
          the scroll container, so NowLine measures the full track and scrolls with
          it instead of hanging off the viewport. */}
      <div className="mx-5 mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          {scheduleIsLoading ? (
            <div className="p-3">
              {Array.from({
                length: Math.max(6, allUsers.length || 12),
              }).map((_, idx) => (
                <div
                  key={idx}
                  className="mb-1 flex items-center gap-2"
                  style={{ height: SKELETON_ROW_HEIGHT }}
                >
                  <Skeleton className="h-[22px] w-[22px] shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-[200px] shrink-0" />
                  <Skeleton className="h-[22px] flex-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative" style={{ minWidth: TRACK_MIN_PX }}>
              <CalendarHeader
                agentCount={visibleUsers.length}
                isToday={isToday}
                selectedDate={selectedDate}
              />

              {/* Coverage rows are admin-only, on the client and on the API. */}
              {isAdmin &&
                coverageMeters.map((meter) => (
                  <CoverageRow
                    key={meter._id}
                    meter={meter}
                    roster={allUsers}
                    shifts={shifts}
                    selectedDate={selectedDate}
                    showTargets={showTargets}
                    focused={meter._id === focusedMeterId}
                    dimmed={focusedMeterId !== null && meter._id !== focusedMeterId}
                    onToggleFocus={() =>
                      setFocusedMeterId((current) =>
                        current === meter._id ? null : meter._id
                      )
                    }
                  />
                ))}

              {visibleUsers.map((currUser) => (
                <AgentRow
                  key={currUser.id}
                  user={currUser}
                  shifts={shifts[currUser.id] ?? []}
                  events={eventsByUser.get(String(currUser.id)) ?? []}
                  positionsById={positionsById}
                  selectedDate={selectedDate}
                  isVisitor={String(currUser.id) === String(visitorId)}
                  reloadScheduleCalendar={reloadSchedule}
                />
              ))}

              <NowLine isToday={isToday} />
            </div>
          )}
        </div>

        <ScheduleLegend showCoverage={isAdmin} showEvents={isAdmin} />

        {/* One prompt for every grid gesture — a resize or a drop — rendered here rather
            than per shift, since any of the 384 EmptySlots can raise one. */}
        {isAdmin && <PendingChangePrompt />}
      </div>
    </div>
  );
};

export default Schedule;
