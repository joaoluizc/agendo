import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Check, ChevronsUpDown, LoaderCircle, SquarePen } from "lucide-react";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { NewShift, Shift } from "@/types/shiftTypes";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { useUserSettings } from "@/providers/useUserSettings";
import { toast } from "sonner";
import { Popover } from "../ui/popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { CommandGroup } from "cmdk";
import * as chrono from "chrono-node";
import { todayButton } from "./calendar-components/today-button-datepicker";
import { useSchedule } from "@/providers/useSchedule";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { roundToNearestHours } from "date-fns";

type NewShiftFormProps = {
  selectedDate: Date;
};

const ONE_HOUR = 3600000;

const localeStringOptions: { dateStyle: "short"; timeStyle: "short" } = {
  dateStyle: "short",
  timeStyle: "short",
};

export default function NewShiftForm({ selectedDate }: NewShiftFormProps) {
  const startTimeInit = roundToNearestHours(new Date(selectedDate.getTime()), {
    roundingMethod: "ceil",
  });
  const endTimeInit = roundToNearestHours(
    new Date(selectedDate.getTime() + ONE_HOUR),
    { roundingMethod: "ceil" }
  );

  const { events, shifts, setEvents, setShifts } = useSchedule();
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState<string>(
    new Date(startTimeInit).toLocaleString(undefined, localeStringOptions)
  );
  const [endTime, setEndTime] = useState<string>(
    new Date(endTimeInit).toLocaleString(undefined, localeStringOptions)
  );
  const [userId, setUserId] = useState<string>("");
  const [positionId, setPositionId] = useState<string>("");
  const [userPopOpen, setUserPopOpen] = useState(false);
  const [positionPopOpen, setPositionPopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    type: userType,
    allPositions: positions,
    allUsers: users,
  } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);

  const [startTimeHovercardOpen, setStartTimeHovercardOpen] = useState(false);
  const [endTimeHovercardOpen, setEndTimeHovercardOpen] = useState(false);

  const initializeDatepickers = () => {
    if (startDatepickerRef.current) startDatepickerRef.current.destroy();
    if (endDatepickerRef.current) endDatepickerRef.current.destroy();

    startDatepickerRef.current = new AirDatepicker(
      document.querySelector("#startTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setStartTime((date as Date).toISOString());
        },
        selectedDates: [startTimeInit],
        locale: localeEn,
        dateFormat: "M/d/yy,",
        timeFormat: "h:mm AA",
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: [todayButton, "clear"],
      }
    );

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime((date as Date).toISOString());
        },
        selectedDates: [endTimeInit],
        locale: localeEn,
        dateFormat: "M/d/yy,",
        timeFormat: "h:mm AA",
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: [todayButton, "clear"],
      }
    );
  };

  const handleStartTimeChange = (date: string) => {
    const parsedDate = chrono.parseDate(date);
    if (parsedDate) {
      setStartTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setStartTime("Invalid date");
    }
  };

  const handleEndTimeChange = (date: string) => {
    const parsedDate = chrono.parseDate(date);
    if (parsedDate) {
      setEndTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setEndTime("Invalid date");
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Initialize datepickers when dialog opens
      setTimeout(initializeDatepickers, 0);
    }
  };

  const handleStartHoverCardOpenChange = (open: boolean, elementId: string) => {
    if (document.activeElement?.id !== elementId) {
      setStartTimeHovercardOpen(open);
    }
  };

  const handleEndHoverCardOpenChange = (open: boolean, elementId: string) => {
    if (document.activeElement?.id !== elementId) {
      setEndTimeHovercardOpen(open);
    }
  };

  const renderParsedStartDate = () => {
    const parsedDate = chrono.parseDate(startTime);
    return parsedDate
      ? parsedDate.toLocaleString(undefined, localeStringOptions)
      : "Invalid date";
  };

  const renderParsedEndDate = () => {
    const parsedDate = chrono.parseDate(endTime);
    return parsedDate
      ? parsedDate.toLocaleString(undefined, localeStringOptions)
      : "Invalid date";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    const newShift: NewShift = {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      userId,
      positionId,
    };

    let responseData: { message: string; details: string; data: Shift } = {
      message: "",
      details: "",
      data: {} as Shift,
    };

    try {
      const response = await fetch("/api/shift/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newShift),
        credentials: "include", // Ensures that Clerk's authentication is included
      });

      if (!response.ok) throw new Error("Failed to create shift");

      responseData = await response.json();
      setLoading(false);
      console.log(responseData);
    } catch (error) {
      console.error("Error creating shift:", error);
      setLoading(false);
      return toast.error("Failed to create shift");
    }

    toast.success(responseData.message);

    setIsOpen(false); // Close the dialog

    // Reset form fields
    setStartTime("");
    setEndTime("");
    setUserId("");
    setPositionId("");

    const shiftDate = new Date(responseData.data.startTime);
    const scheduleDate = new Date(selectedDate);
    if (
      shiftDate.getDate() !== scheduleDate.getDate() ||
      shiftDate.getMonth() !== scheduleDate.getMonth() ||
      shiftDate.getFullYear() !== scheduleDate.getFullYear()
    ) {
      return;
    }

    const createdShift = responseData.data;

    if (!shifts[createdShift.userId]) {
      shifts[createdShift.userId] = [];
    }

    shifts[createdShift.userId].push(createdShift);

    shifts[createdShift.userId].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    setShifts({ ...shifts });

    if (createdShift.isSynced) {
      events
        .find((event) => event.userId === createdShift.userId)
        ?.events.push(createdShift.syncedEvent);
      events
        .find((event) => event.userId === createdShift.userId)
        ?.events.sort((a, b) => {
          return (
            new Date(a.start.dateTime).getTime() -
            new Date(b.start.dateTime).getTime()
          );
        });
      setEvents([...events]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          style={{
            display: userType !== "admin" ? "none" : "flex",
            alignItems: "center",
          }}
        >
          <SquarePen size="16" /> Create New Shift
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("sm:max-w-[425px]", "air-datepicker-global")}
      >
        <DialogHeader>
          <DialogTitle>Create New Shift</DialogTitle>
          <DialogDescription>
            Enter the details for the new shift.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} tabIndex={0}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label
                htmlFor="startTime"
                className="text-right"
                autoFocus={false}
              >
                Start Time
              </Label>
              <HoverCard
                open={startTimeHovercardOpen}
                onOpenChange={(o) =>
                  handleStartHoverCardOpenChange(o, "startTime")
                }
              >
                <HoverCardTrigger asChild>
                  <Input
                    id="startTime"
                    className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                    ref={startTimeRef}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                    }}
                    onFocus={() => {
                      setStartTimeHovercardOpen(true);
                    }}
                    onBlur={() => {
                      if (startTimeRef.current) {
                        startTimeRef.current.value = new Date(
                          startTime
                        ).toLocaleString(undefined, localeStringOptions);
                      }
                      handleStartTimeChange(startTime);
                      setStartTimeHovercardOpen(false);
                    }}
                    value={startTime}
                  />
                </HoverCardTrigger>
                <HoverCardContent side="top">
                  {renderParsedStartDate()}
                </HoverCardContent>
              </HoverCard>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right">
                End Time
              </Label>
              <HoverCard
                open={endTimeHovercardOpen}
                onOpenChange={(o) => handleEndHoverCardOpenChange(o, "endTime")}
              >
                <HoverCardTrigger asChild>
                  <Input
                    id="endTime"
                    className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                    ref={endTimeRef}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                    }}
                    onFocus={() => setEndTimeHovercardOpen(true)}
                    onBlur={() => {
                      if (endTimeRef.current) {
                        endTimeRef.current.value = new Date(
                          endTime
                        ).toLocaleString(undefined, localeStringOptions);
                      }
                      handleEndTimeChange(endTime);
                      setEndTimeHovercardOpen(false);
                    }}
                    value={endTime}
                  />
                </HoverCardTrigger>
                <HoverCardContent side="top">
                  {renderParsedEndDate()}
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="grid grid-cols-4 items-center gap-4 z-50">
              <Label htmlFor="userId" className="text-right">
                User
              </Label>
              <Popover
                open={userPopOpen}
                onOpenChange={setUserPopOpen}
                modal={false}
              >
                <PopoverTrigger asChild className="col-span-3">
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={userPopOpen}
                  >
                    {userId
                      ? users.find((user) => user.id === userId)?.firstName
                      : "Select a user"}
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[274px]">
                  <Command>
                    <CommandInput
                      placeholder="Search user..."
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup title="Users">
                        {users.map((user) => (
                          <CommandItem
                            key={user.firstName}
                            value={user.firstName}
                            onSelect={(currentValue) => {
                              setUserId(
                                currentValue === user.id ? "" : user.id
                              );
                              setUserPopOpen(false);
                            }}
                          >
                            {user.firstName}
                            <Check
                              className="w-4 h-4 ml-auto"
                              style={{
                                display: userId === user.id ? "block" : "none",
                              }}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="userId" className="text-right">
                Position
              </Label>
              <Popover
                open={positionPopOpen}
                onOpenChange={setPositionPopOpen}
                modal={false}
              >
                <PopoverTrigger asChild className="col-span-3">
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={positionPopOpen}
                  >
                    {positionId
                      ? positions.find(
                          (position) => position._id === positionId
                        )?.name
                      : "Select a position"}
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent asChild className="w-[274px]">
                  <Command>
                    <CommandInput
                      placeholder="Search position..."
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup title="Users">
                        {positions.map((position) => (
                          <CommandItem
                            key={position.name}
                            value={position.name}
                            onSelect={(currentValue) => {
                              setPositionId(
                                currentValue === position._id
                                  ? ""
                                  : position._id
                              );
                              setPositionPopOpen(false);
                            }}
                          >
                            {position.name}
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                positionId === position._id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={loading} type="submit">
              {loading ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Create Shift"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
