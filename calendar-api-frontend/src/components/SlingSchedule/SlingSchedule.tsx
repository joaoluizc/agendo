import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useState } from "react";
import { Shift, User } from "../../types/slingTypes.ts";
import { Label } from "@radix-ui/react-label";
import { Input } from "../ui/input.tsx";
import { CalendarIcon, CalendarSearch, RepeatIcon } from "lucide-react";
import { Markup } from "interweave";
import {
  getShifts,
  prettyTimeRange,
  calculateGridColumnSpan,
  calculateGridColumnStart,
  getGCalendarEvents,
  prettyGCalTime,
  calculateShiftOverlapAmount,
} from "./scheduleUtils.ts";
import { CalendarUser } from "@/types/gCalendarTypes.ts";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "../ui/button.tsx";
import CalendarHeader from "./calendar-components/CalendarHeader.tsx";
import SyncWithGCalBtn from "./calendar-components/SyncWithGCalBtn.tsx";
import SyncMyGCalBtn from "./calendar-components/SyncMyGCalBtn.tsx";

const userHasGcal = (user: User, gCalendarEvents: CalendarUser[]) => {
  return gCalendarEvents.some(
    (calUser: CalendarUser) => Number(calUser.slingId) === user.id
  );
};

interface CalendarState {
  shifts: Shift[];
  events: CalendarUser[];
}

const calcUserRowHeight = (
  userId: string,
  { events: gCalendarEvents, shifts }: CalendarState
) => {
  let height = 0;
  const calendarUser = gCalendarEvents.find((calUser: CalendarUser) => {
    return String(calUser.slingId) === String(userId);
  });

  if (calendarUser) {
    height += calendarUser.numberOfEventOverlaps * 2;
  }

  const userShifts = shifts;
  height += calculateShiftOverlapAmount(userShifts) * 3;

  return `${height}rem`;
};

const SlingSchedule = () => {
  const [sortedCalendar, setSortedCalendar] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [gCalendarEvents, setgCalendarEvents] = useState<CalendarUser[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      new AirDatepicker("#date", {
        onSelect: async ({ date, datepicker }) => {
          datepicker.hide();
          if (Array.isArray(date)) date = date[0]; // AirDatepicker might return an array of dates
          await getShifts(date, setIsLoading, setSortedCalendar);
          setSelectedDate(date);
          const gCalendarEventsData = await getGCalendarEvents(date);
          setgCalendarEvents(gCalendarEventsData);
        },
        locale: localeEn,
      });
      getShifts(new Date(), setIsLoading, setSortedCalendar);
      const gCalendarEventsData = await getGCalendarEvents(new Date());
      setgCalendarEvents(gCalendarEventsData);
    };
    fetchData();
  }, []);

  return (
    <div>
      <div id="app" className="flex flex-row gap-5 p-5 pl-2 w-full">
        <Label htmlFor="date" className="flex relative">
          <Input
            id="date"
            className=""
            placeholder="Select a date"
            value={selectedDate.toDateString()}
            onChange={() => 1 + 1}
          />
          <CalendarSearch className="absolute top-1/2 right-2 transform -translate-y-1/2 h-5 w-5" />
        </Label>
        <SyncWithGCalBtn selectedDate={selectedDate} />
        <SyncMyGCalBtn selectedDate={selectedDate} />
      </div>
      {!isLoading ? (
        <div className="flex flex-col">
          <CalendarHeader />
          {/* User rows */}
          {sortedCalendar.map((user, idx) => (
            <div key={idx} className="flex">
              <div
                id="user-info-wrapper"
                className={`p-2 flex items-center border-b`}
                style={{
                  width: "12%",
                  height: calcUserRowHeight(String(user.id), {
                    events: gCalendarEvents,
                    shifts: user.shifts,
                  }),
                }}
              >
                <Avatar>
                  <AvatarImage
                    src={user.avatar}
                    className="w-7 h-7 rounded-full mr-2"
                  />
                  <AvatarFallback className="w-7 h-7 px-2 py-1 rounded-full mr-2 bg-slate-950 text-slate-100 font-semibold">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-xs font-semibold truncate">{`${user.name} ${user.lastname}`}</div>
                </div>
              </div>
              <div id="shifts-data-column" className="flex-1 overflow-x-auto">
                <div id="visual-grid-wrapper" className="relative">
                  <div
                    className={`grid absolute inset-0 grid border-b`}
                    style={{
                      gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
                      height: calcUserRowHeight(String(user.id), {
                        events: gCalendarEvents,
                        shifts: user.shifts,
                      }),
                    }}
                  >
                    {[...Array(24).keys()].map((value) => {
                      return (
                        <div key={`key-${value}`} className="border-r"></div>
                      );
                    })}
                  </div>
                </div>
                <div
                  id="shifts-wrapper"
                  className="grid"
                  style={{ gridTemplateColumns: "repeat(48, minmax(0, 1fr))" }}
                >
                  {user.shifts.map((shift, idx) => {
                    const start = calculateGridColumnStart(
                      shift.dtstart,
                      shift.dateRequested!
                    );
                    const span = calculateGridColumnSpan(
                      shift.dtstart,
                      shift.dtend,
                      shift.dateRequested!
                    );

                    return (
                      <div
                        key={idx}
                        className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white`}
                        style={{
                          gridColumnStart: start,
                          gridColumnEnd: `span ${span}`,
                          backgroundColor: `color-mix(in srgb, ${shift?.position?.color} 95%, hsl(var(--shiftmix)) 20%)`,
                          fontSize: "0.6875rem",
                        }}
                      >
                        <div className="font-bold truncate">
                          {prettyTimeRange(shift.dtstart, shift.dtend)}
                        </div>
                        <div className="truncate">{shift?.position?.name}</div>
                      </div>
                    );
                  })}
                </div>
                {userHasGcal(user, gCalendarEvents) ? (
                  <div
                    id="gcalendar-wrapper"
                    className="grid"
                    style={{
                      gridTemplateColumns: "repeat(48, minmax(0, 1fr))",
                    }}
                  >
                    {gCalendarEvents
                      .find(
                        (calUser: CalendarUser) =>
                          Number(calUser.slingId) === user.id
                      )
                      ?.events.map((event, idx) => {
                        const start = calculateGridColumnStart(
                          event.start.dateTime,
                          selectedDate.toString()
                        );
                        const span = calculateGridColumnSpan(
                          event.start.dateTime,
                          event.end.dateTime,
                          selectedDate.toString()
                        );
                        return (
                          <HoverCard key={idx}>
                            <HoverCardTrigger asChild>
                              <div
                                key={idx}
                                className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded`}
                                style={{
                                  gridRowStart: event.gridRowNumber,
                                  gridColumnStart: start,
                                  gridColumnEnd: `span ${span}`,
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
                ) : null}
              </div>
            </div>
          ))}
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

export default SlingSchedule;
