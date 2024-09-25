import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { useEffect, useState } from "react";
import { User } from "../../types/slingTypes.ts";
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
} from "./scheduleUtils.ts";
import { CalendarUser } from "@/types/gCalendarTypes.ts";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "../ui/button.tsx";
import CalendarHeader from "./calendar-components/CalendarHeader.tsx";
import SyncWithGCalBtn from "./SyncWithGCalBtn.tsx";

const userHasGcal = (user: User, gCalendarEvents: CalendarUser[]) => {
  return gCalendarEvents.some(
    (calUser: CalendarUser) => Number(calUser.slingId) === user.id
  );
};

const Schedule = () => {
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
          await getGCalendarEvents(setgCalendarEvents, date);
        },
        locale: localeEn,
      });
    };
    fetchData();
    getShifts(new Date(), setIsLoading, setSortedCalendar);
    getGCalendarEvents(setgCalendarEvents, new Date());
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
          <CalendarSearch className="absolute top-1/2 right-2 transform -translate-y-1/2" />
        </Label>
        <SyncWithGCalBtn selectedDate={selectedDate} />
      </div>
      {!isLoading ? (
        <div className="flex flex-col">
          <CalendarHeader />
          {/* User rows */}
          {sortedCalendar.map((user, idx) => (
            <div key={idx} className="flex">
              <div
                id="user-info-wrapper"
                className={`p-2 flex items-center border-b ${
                  userHasGcal(user, gCalendarEvents) ? "h-20" : "h-12"
                }`}
                style={{ width: "12%" }}
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
                    className={`grid absolute inset-0 grid border-b ${
                      userHasGcal(user, gCalendarEvents) ? "h-20" : "h-12"
                    }`}
                    style={{
                      gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
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
                      shift.dateRequested
                    );
                    const span = calculateGridColumnSpan(
                      shift.dtstart,
                      shift.dtend,
                      shift.dateRequested
                    );

                    return (
                      <div
                        key={idx}
                        className={`p-1 m-[0.2rem] z-10 overflow-hidden whitespace-nowrap truncate rounded text-white`}
                        style={{
                          gridColumnStart: start,
                          gridColumnEnd: `span ${span}`,
                          backgroundColor: `color-mix(in srgb, ${shift.position.color} 95%, hsl(var(--shiftmix)) 20%)`,
                          fontSize: "0.6875rem",
                        }}
                      >
                        <div className="font-bold truncate">
                          {prettyTimeRange(shift.dtstart, shift.dtend)}
                        </div>
                        <div className="truncate">{shift.position.name}</div>
                      </div>
                    );
                  })}
                </div>
                {userHasGcal(user, gCalendarEvents) ? (
                  <div
                    id="gcalendar-wrapper"
                    className="grid h-8"
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
        <div>Loading...</div>
      )}
    </div>
  );
};

export default Schedule;
