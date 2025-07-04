import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useState } from "react";
import { Label } from "@radix-ui/react-label";
import { Input } from "../ui/input.tsx";
import { CalendarIcon, CalendarSearch, RepeatIcon } from "lucide-react";
import { Markup } from "interweave";
import {
  getShifts,
  calculateGridColumnSpan,
  calculateGridColumnStart,
  getGCalendarEvents,
  prettyGCalTime,
  calculateShiftOverlapAmount,
} from "./scheduleUtils.ts";
import { CalendarUser, UserGCalGrid } from "@/types/gCalendarTypes.ts";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "../ui/button.tsx";
import CalendarHeader from "./calendar-components/CalendarHeader.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { SortedCalendar } from "@/types/shiftTypes.ts";
import CreateShiftForm from "./CreateShiftBtn.tsx";
import { Shift } from "./Shift.tsx";
import { useUser } from "@clerk/clerk-react";
import { cn } from "@/lib/utils.ts";
import EmptySlot from "./calendar-components/EmptySlot.tsx";
import DuplicateShifts from "./DuplicateShifts.tsx";
import { useSchedule } from "@/providers/useSchedule.tsx";
import ToggleBulkSelector from "./calendar-components/ToggleBulkSelector.tsx";
import { UserSafeInfo } from "@/types/userTypes.ts";

const calcUserRowHeight = (
  userId: string,
  events: CalendarUser[],
  shifts: SortedCalendar
) => {
  let height = 0;
  const calendarUser = events.find(
    (calUser: CalendarUser) => calUser.userId === userId
  );

  if (calendarUser) {
    height += calendarUser.numberOfEventOverlaps * 2;
  }

  const userShifts = shifts[userId];
  height += calculateShiftOverlapAmount(userShifts) * 3;

  return `${height}rem`;
};

const calculateGridForGCalEvents = (
  allUsers: UserSafeInfo[],
  events: CalendarUser[],
  selectedDate: Date
): UserGCalGrid[] => {
  return allUsers.map(({ id: userId }) => ({
    userId,
    events:
      events
        .find((calUser) => calUser.userId === userId)
        ?.events.map((event) => ({
          ...event,
          gridStart: calculateGridColumnStart(
            event.start.dateTime,
            selectedDate.toString()
          ),
          gridSpan: calculateGridColumnSpan(
            event.start.dateTime,
            event.end.dateTime,
            selectedDate.toString()
          ),
        })) || [],
  }));
};

const Schedule = () => {
  const {
    shifts,
    events,
    scheduleIsLoading,
    setShifts,
    setEvents,
    setScheduleIsLoading,
  } = useSchedule();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [gCalEventsCalculatedGrid, setGCalEventsCalculatedGrid] = useState<
    UserGCalGrid[]
  >([]);
  const { type, allUsers } = useUserSettings();
  const { user } = useUser();
  const visitorId = user?.id;

  const fetchData = async (date: Date) => {
    setScheduleIsLoading(true);
    try {
      const [shifts, events] = await Promise.all([
        getShifts(date),
        type === "admin" ? getGCalendarEvents(date) : Promise.resolve([]),
      ]);

      setShifts(shifts);
      setEvents(events);

      const allUsersGridCalculated = calculateGridForGCalEvents(
        allUsers,
        events,
        date
      );
      setGCalEventsCalculatedGrid(allUsersGridCalculated);

      setScheduleIsLoading(false);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
      setScheduleIsLoading(false);
    }
  };

  // const memoizedGCalEvents = useMemo(() => {
  //   const allUsersGridCalculated = allUsers.map(({ id: userId }) => ({
  //     userId,
  //     events:
  //       events
  //         .find((calUser) => calUser.userId === userId)
  //         ?.events.map((event) => ({
  //           ...event,
  //           gridStart: calculateGridColumnStart(
  //             event.start.dateTime,
  //             selectedDate.toString()
  //           ),
  //           gridSpan: calculateGridColumnSpan(
  //             event.start.dateTime,
  //             event.end.dateTime,
  //             selectedDate.toString()
  //           ),
  //         })) || [],
  //   }));
  //   return allUsersGridCalculated;
  // }, [events, selectedDate]);

  const todayButton = {
    content: "Today",
    onClick: (dp: AirDatepicker) => {
      const date = new Date();
      dp.selectDate(date);
      dp.setViewDate(date);
    },
  };

  useEffect(() => {
    const datepicker = new AirDatepicker("#date", {
      onSelect: async ({ date, datepicker }) => {
        datepicker.hide();
        const newDate = Array.isArray(date) ? date[0] : date || selectedDate;
        setSelectedDate(newDate);
        await fetchData(newDate);
      },
      locale: localeEn,
      toggleSelected: false,
      dateFormat: "E MMM d yyyy",
      buttons: [todayButton, "clear"],
    });

    fetchData(selectedDate);

    return () => datepicker.destroy();
  }, [type]);

  return (
    <div>
      <div id="app" className="flex flex-row gap-5 p-5 pl-2 w-full">
        <Label htmlFor="date" className="flex relative">
          <Input
            id="date"
            className="hover:bg-secondary/80 cursor-pointer"
            placeholder="Select a date"
            value={selectedDate.toDateString()}
            readOnly
          />
          <CalendarSearch className="absolute top-1/2 right-2 transform -translate-y-1/2 h-5 w-5" />
        </Label>
        <CreateShiftForm selectedDate={selectedDate} />
        <DuplicateShifts selectedDate={selectedDate} />
        <ToggleBulkSelector />
      </div>
      {!scheduleIsLoading ? (
        <div id="schedule-wrapper" className="flex flex-col">
          <CalendarHeader />
          {/* User rows */}
          {allUsers
            ? allUsers.map((currUser, idx) => {
                const userId = currUser.id;
                return (
                  <div key={idx} className="flex">
                    <div
                      id="user-info-wrapper"
                      className={`${cn(
                        "p-2 flex items-center border-b",
                        String(userId) === String(visitorId)
                          ? "bg-secondary/80"
                          : "background"
                      )}`}
                      style={{
                        width: "12%",
                        height: calcUserRowHeight(userId, events, shifts),
                      }}
                    >
                      <Avatar>
                        <AvatarImage
                          src={currUser.imageUrl}
                          className="w-7 h-7 rounded-full mr-2"
                        />
                        <AvatarFallback className="w-7 h-7 px-2 py-1 rounded-full mr-2 bg-slate-950 text-slate-100 font-semibold">
                          {`${currUser?.firstName[0]}${currUser?.lastName[0]}`}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-xs font-semibold truncate">{`${currUser.firstName} ${currUser.lastName}`}</div>
                      </div>
                    </div>
                    <div
                      id="shifts-data-column"
                      className="flex-1 overflow-x-auto"
                    >
                      <div id="visual-grid-wrapper" className="relative">
                        <div
                          className={cn(
                            "grid absolute inset-0 grid border-b",
                            String(userId) === String(visitorId)
                              ? "bg-secondary/80"
                              : "background"
                          )}
                          style={{
                            gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
                            height: calcUserRowHeight(userId, events, shifts),
                          }}
                        >
                          {[...Array(24).keys()].map((value) => {
                            return (
                              <EmptySlot
                                userId={String(userId)}
                                visitorId={String(visitorId)}
                                currentHour={value}
                                selectedDate={selectedDate}
                                key={`${userId}-${value}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div
                        id="shifts-wrapper"
                        className="grid"
                        style={{
                          gridTemplateColumns: "repeat(48, minmax(0, 1fr))",
                        }}
                      >
                        {shifts[userId] ? (
                          shifts[userId].map((shift, idx) => (
                            <Shift
                              shift={shift}
                              key={`${idx}-${shift._id}`}
                              selectedDate={selectedDate}
                              reloadScheduleCalendar={() =>
                                fetchData(selectedDate)
                              }
                            />
                          ))
                        ) : (
                          <div
                            className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white h-10`}
                          ></div>
                        )}
                      </div>
                      {/* Always render Google Calendar events for all users */}
                      <div
                        id="gcalendar-wrapper"
                        className="grid"
                        style={{
                          gridTemplateColumns: "repeat(48, minmax(0, 1fr))",
                        }}
                      >
                        {gCalEventsCalculatedGrid
                          .find((calUser) => calUser.userId === userId)
                          ?.events.map((event, idx) => {
                            return (
                              <HoverCard key={idx}>
                                <HoverCardTrigger asChild>
                                  <div
                                    key={idx}
                                    className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded`}
                                    style={{
                                      gridColumnStart: event.gridStart,
                                      gridColumnEnd: `span ${event.gridSpan}`,
                                      gridRowStart: event?.gridRowNumber,
                                      backgroundColor: `color-mix(in srgb, white 95%, hsl(var(--shiftmix)) 20%)`,
                                      fontSize: "0.6875rem",
                                    }}
                                  >
                                    <div className="truncate text-black">
                                      {event.summary}
                                    </div>
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-full max-w-md p-6 grid gap-6">
                                  <div className="flex items-start gap-4">
                                    <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-12">
                                      <CalendarIcon className="w-6 h-6" />
                                    </div>
                                    <div className="grid gap-1">
                                      <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-semibold">
                                          {event.summary}
                                        </h3>
                                        {event.recurringEventId && (
                                          <RepeatIcon className="w-5 h-5 text-muted-foreground" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CalendarIcon className="w-4 h-4" />
                                        <span>
                                          {prettyGCalTime(
                                            event.start.dateTime,
                                            event.end.dateTime
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-muted-foreground max-h-28 truncate">
                                    <Markup content={event.description} />
                                  </p>
                                  <div className="flex gap-4">
                                    <Button asChild variant="link">
                                      <a
                                        href={event.htmlLink}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        See more
                                      </a>
                                    </Button>
                                    {event.hangoutLink && (
                                      <Button>
                                        <a
                                          href={event.hangoutLink}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Join meeting
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                );
              })
            : null}
        </div>
      ) : (
        <div className="flex-1 flex justify-center">
          {/* <p>Loading...</p> */}
          <div className="flex flex-col w-full">
            <div className="flex flex-col">
              <Skeleton className="h-10 w-full mb-2" />
              {Array.from({
                length: Math.ceil(window.innerHeight / 80) - 2,
              }).map((_, idx) => (
                <div key={idx} className="flex mb-2">
                  <div className="w-1/6 h-14 mr-2 flex items-center">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <Skeleton className="flex-1 h-7 ml-2" />
                  </div>
                  <Skeleton className="flex-1 h-14" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;
