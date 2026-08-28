import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useMemo, useRef, useState } from "react";
import { getShifts, getGCalendarEvents, startOfLocalDay } from "./scheduleUtils.ts";
import { CalendarUser, GCalEventWithGrid } from "@/types/gCalendarTypes.ts";
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
  } = useSchedule();
  const { selectedDate, dateKey, setDate } = useScheduleDateParam();
  const datepickerRef = useRef<AirDatepicker | null>(null);
  const { type, allUsers, allPositions, coverageMeters } = useUserSettings();
  const { user } = useUser();
  const visitorId = user?.id;

  const isAdmin = type === "admin";
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

  const fetchData = async (date: Date) => {
    setScheduleIsLoading(true);
    try {
      const [shifts, events] = await Promise.all([
        getShifts(date),
        isAdmin ? getGCalendarEvents(date) : Promise.resolve([]),
      ]);

      setShifts(shifts);
      setEvents(events);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    } finally {
      setScheduleIsLoading(false);
    }
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

  return (
    <div>
      <ScheduleToolbar
        selectedDate={selectedDate}
        onSelectDate={setDate}
        isToday={isToday}
        onReload={() => fetchData(selectedDate)}
      />

      {/* Creating a shift no longer syncs it, so the day needs somewhere that says
          out loud what has not been committed yet. Renders nothing when the day is
          fully published. */}
      {isAdmin && (
        <PublishDraftsBar
          shifts={shifts}
          onPublished={() => fetchData(selectedDate)}
        />
      )}

      {/* One card, one horizontal scroll container. The 252px agent column is sticky
          inside it, so the whole grid scrolls together instead of every row owning
          its own scrollbar. `relative` sits on the inner 1500px track rather than on
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
            <div className="relative min-w-[1500px]">
              <CalendarHeader
                agentCount={allUsers.length}
                isToday={isToday}
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
                  />
                ))}

              {allUsers.map((currUser) => (
                <AgentRow
                  key={currUser.id}
                  user={currUser}
                  shifts={shifts[currUser.id] ?? []}
                  events={eventsByUser.get(String(currUser.id)) ?? []}
                  positionsById={positionsById}
                  selectedDate={selectedDate}
                  isVisitor={String(currUser.id) === String(visitorId)}
                  reloadScheduleCalendar={() => fetchData(selectedDate)}
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
