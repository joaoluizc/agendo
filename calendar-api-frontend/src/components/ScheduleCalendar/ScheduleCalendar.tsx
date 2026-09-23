import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LABEL_COLUMN_PX,
  TRACK_MIN_PX,
  firstShiftStart,
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
import ScrollRail from "./calendar-components/ScrollRail.tsx";
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

/** One empty list for every row while events are hidden, so no row's lane memo is busted. */
const NO_EVENTS: GCalEventWithGrid[] = [];

const SHOW_EVENTS_KEY = "agendo.showCalendarEvents";

/** Stored only while hidden, so a browser that never chose gets the default: shown. */
const readShowCalendarEvents = () => {
  try {
    return localStorage.getItem(SHOW_EVENTS_KEY) !== "hidden";
  } catch {
    return true;
  }
};

const storeShowCalendarEvents = (show: boolean) => {
  try {
    if (show) localStorage.removeItem(SHOW_EVENTS_KEY);
    else localStorage.setItem(SHOW_EVENTS_KEY, "hidden");
  } catch {
    // Private windows and blocked storage: the choice still holds until a reload.
  }
};

/** Deepest zoom: 8 hours on screen (08–15), eight steps in. */
const MAX_ZOOM = 8;

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

  /**
   * Whether each row also draws that agent's Google Calendar events — the toolbar's Google
   * Calendar switch.
   *
   * Turning them off is for reading the shifts on their own: someone unsure when their shift
   * is can drop the day's meetings and see where it falls. Meeting clashes stop showing while
   * they are off, which is accepted — the shift dialogs never checked Google events anyway.
   *
   * Hidden means *not fetched*, not just not drawn: the events call is the heavy one (every
   * agent's calendar, through the proxy), so hiding them also makes switching days faster.
   * Rows lose their event lanes and shrink back to shift height.
   *
   * Persisted, unlike the location filter, because it is a way of working rather than a
   * question asked of one day. The switch shows its own state, so it is never forgotten on.
   */
  const [showCalendarEvents, setShowCalendarEvents] = useState(
    readShowCalendarEvents
  );

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

  const positionsById = useMemo(
    () => new Map(allPositions.map((position) => [String(position._id), position])),
    [allPositions]
  );

  /**
   * The agents the grid draws — see `useAgentLocations` for the no-location rule — in the
   * order their day starts, then by name. Agents with nothing starting today come last.
   *
   * Re-sorted whenever the day's shifts change, so moving an agent's first shift earlier
   * moves their row up once it is saved. See `firstShiftStart` for what counts as a start.
   */
  const visibleUsers = useMemo(() => {
    const startOf = (userId: string) =>
      firstShiftStart(shifts[userId], selectedDate) ?? Infinity;
    const nameOf = (user: { firstName?: string; lastName?: string }) =>
      `${user.firstName ?? ""} ${user.lastName ?? ""}`;
    const starts = new Map(
      allUsers.map((currUser) => [String(currUser.id), startOf(currUser.id)])
    );
    return [...filterByLocations(allUsers, locationFilter)].sort(
      (a, b) =>
        // Infinity - Infinity is NaN, which is falsy, so two agents with no start fall
        // through to their names like any other tie.
        starts.get(String(a.id))! - starts.get(String(b.id))! ||
        nameOf(a).localeCompare(nameOf(b))
    );
  }, [allUsers, filterByLocations, locationFilter, shifts, selectedDate]);
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
   *
   * `withEvents` defaults to the Google Calendar switch's setting. The switch passes it
   * explicitly: it calls this before its own state change has rendered, when the closure
   * still holds the old value.
   */
  const fetchData = async (
    date: Date,
    { quiet = false, withEvents = showCalendarEvents } = {}
  ) => {
    const key = formatDateParam(date);
    latestFetchKey.current = key;
    if (!quiet) setScheduleIsLoading(true);
    try {
      const [shiftsResult, eventsResult] = await Promise.allSettled([
        getShifts(date),
        isAdmin && withEvents ? getGCalendarEvents(date) : Promise.resolve(null),
      ]);
      if (latestFetchKey.current !== key) return;

      if (shiftsResult.status === "fulfilled") setShifts(shiftsResult.value);
      else console.error("Error fetching shifts:", shiftsResult.reason);

      // `null` is a fetch that did not ask for events, and it leaves them alone rather than
      // emptying them — hiding them is what clears them. Otherwise a fetch still in flight
      // when they are switched back on could land last and blank what the new one loaded.
      if (eventsResult.status === "rejected") {
        console.error("Error fetching calendar events:", eventsResult.reason);
      } else if (eventsResult.value) {
        setEvents(eventsResult.value);
      }
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

  const changeShowCalendarEvents = (next: boolean) => {
    setShowCalendarEvents(next);
    storeShowCalendarEvents(next);
    // Days loaded while hidden came without their events. Quiet, so the grid stays put and
    // the lanes appear when they arrive.
    if (next) fetchData(selectedDateRef.current, { quiet: true, withEvents: true });
    // Cleared rather than kept: while hidden nothing refreshes them, so by the time they
    // are shown again they could belong to a day that is no longer on screen.
    else setEvents([]);
  };

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

  /** The pinned hours and coverage rows, and the agent rows' scroller they follow sideways. */
  const pinnedRef = useRef<HTMLDivElement>(null);
  const rowsScrollerRef = useRef<HTMLDivElement>(null);

  /** The two scrollbars drawn under the hours — one below the pinned block, one below the rows. */
  const topRailRef = useRef<HTMLDivElement>(null);
  const bottomRailRef = useRef<HTMLDivElement>(null);

  /**
   * Copy one scroller's position to the other three. Writing the value they already hold
   * fires no scroll event, so the echo from each write stops after one hop.
   */
  const syncScrollFrom = (source: HTMLDivElement | null) => {
    if (!source) return;
    for (const target of [
      rowsScrollerRef.current,
      pinnedRef.current,
      topRailRef.current,
      bottomRailRef.current,
    ]) {
      if (target && target !== source) target.scrollLeft = source.scrollLeft;
    }
  };

  const syncPinnedScroll = () => syncScrollFrom(rowsScrollerRef.current);

  // The pinned block remounts after every loading skeleton; start it where the rows are.
  useLayoutEffect(syncPinnedScroll, [scheduleIsLoading]);

  /**
   * Zoom: each step drops one hour off each edge of the view — 00 and 23 first, then 01
   * and 22 — by widening the track so the hours left fill the scroller. The dropped hours
   * are still there, a sideways scroll away. Level 0 is the whole day, exactly as before.
   *
   * Nothing inside the track needs to know: rows, the now line, drops and drag-to-create
   * all position as fractions of the track's width.
   */
  const [zoom, setZoom] = useState(0);
  const [scrollerWidth, setScrollerWidth] = useState(0);

  useLayoutEffect(() => {
    const scroller = rowsScrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() =>
      setScrollerWidth(scroller.clientWidth)
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const hourPx =
    Math.max(0, scrollerWidth - LABEL_COLUMN_PX) / (24 - 2 * zoom);
  const trackWidth = Math.max(TRACK_MIN_PX, LABEL_COLUMN_PX + hourPx * 24);
  /** Only draw the scrollbars when there is somewhere to scroll to. */
  const overflows = scrollerWidth > 0 && trackWidth > scrollerWidth + 1;

  // Land each zoom step on the hours it keeps, with the dropped ones off either edge.
  useLayoutEffect(() => {
    if (!rowsScrollerRef.current) return;
    rowsScrollerRef.current.scrollLeft = zoom * hourPx;
    syncPinnedScroll();
  }, [zoom, scheduleIsLoading, overflows]);

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
        canShowCalendarEvents={isAdmin}
        showCalendarEvents={showCalendarEvents}
        onShowCalendarEventsChange={changeShowCalendarEvents}
        zoom={zoom}
        maxZoom={MAX_ZOOM}
        onZoomChange={setZoom}
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

      {/* One card, two horizontal scrollers kept in step: the hours and coverage rows on
          top, pinned under the site header while the page scrolls, and the agent rows
          below.

          The pinned part cannot simply be a sticky row inside the rows' scroller. An
          `overflow-x` element is a scroll container in both axes, so a sticky row would
          stick to it — which never scrolls vertically — rather than to the window. The
          card clips (`overflow-clip`) instead of hiding for the same reason:
          `overflow-hidden` would capture the pinned block too.

          The rows' scroller owns the sideways scroll and the pinned block follows it, so
          the agent column (sticky inside each) and the hours stay aligned. `relative` sits
          on each inner track, so each NowLine measures its own and scrolls with it. */}
      <div className="mx-5 mb-6 overflow-clip rounded-xl border border-border bg-card shadow-sm">
        {!scheduleIsLoading && (
          // top-16 is the site header's h-16, which is sticky itself. z-[6] clears the
          // rows' sticky agent column (z-[3]) and their now-line (z-[5]).
          <div className="sticky top-16 z-[6] bg-card">
          <div
            ref={pinnedRef}
            className="overflow-hidden"
            // A sideways trackpad swipe over the hours scrolls the grid, as it would have
            // when they were part of it.
            onWheel={(event) => {
              if (event.deltaX && rowsScrollerRef.current) {
                rowsScrollerRef.current.scrollLeft += event.deltaX;
              }
            }}
          >
            <div className="relative" style={{ width: trackWidth }}>
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

              <NowLine isToday={isToday} />
            </div>
          </div>
          {/* Outside the clipped block, so it stays put while the hours slide. */}
          {overflows && (
            <ScrollRail
              ref={topRailRef}
              trackWidth={trackWidth}
              onScroll={() => syncScrollFrom(topRailRef.current)}
            />
          )}
          </div>
        )}

        {/* Still the scroller that owns the position; its own bar is hidden in favour of
            the rails, which stop at the agent column. */}
        <div
          ref={rowsScrollerRef}
          className="schedule-scrollbar-hidden overflow-x-auto"
          onScroll={syncPinnedScroll}
        >
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
            <div className="relative" style={{ width: trackWidth }}>
              {visibleUsers.map((currUser) => (
                <AgentRow
                  key={currUser.id}
                  user={currUser}
                  shifts={shifts[currUser.id] ?? []}
                  // Hiding empties the list, but a fetch already in flight can still refill
                  // it; gating here keeps the rows honest to the toggle regardless.
                  events={
                    showCalendarEvents
                      ? eventsByUser.get(String(currUser.id)) ?? NO_EVENTS
                      : NO_EVENTS
                  }
                  positionsById={positionsById}
                  selectedDate={selectedDate}
                  isVisitor={String(currUser.id) === String(visitorId)}
                  reloadScheduleCalendar={reloadSchedule}
                />
              ))}

              {/* The rest of the same line; its label is in the pinned block above. */}
              <NowLine isToday={isToday} showLabel={false} />
            </div>
          )}
        </div>

        {overflows && !scheduleIsLoading && (
          <ScrollRail
            ref={bottomRailRef}
            trackWidth={trackWidth}
            onScroll={() => syncScrollFrom(bottomRailRef.current)}
          />
        )}

        <ScheduleLegend
          showCoverage={isAdmin}
          showEvents={isAdmin && showCalendarEvents}
        />

        {/* One prompt for every grid gesture — a resize or a drop — rendered here rather
            than per shift, since any of the 384 EmptySlots can raise one. */}
        {isAdmin && <PendingChangePrompt />}
      </div>
    </div>
  );
};

export default Schedule;
