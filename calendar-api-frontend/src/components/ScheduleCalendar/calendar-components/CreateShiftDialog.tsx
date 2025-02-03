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
import { Check, ChevronsUpDown } from "lucide-react";
// import {
//   Select,
//   SelectContent,
//   SelectGroup,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { NewShift } from "@/types/shiftTypes";
import { cn } from "@/lib/utils";
import { Input } from "../../ui/input";
import { useUserSettings } from "@/providers/useUserSettings";
import { toast } from "sonner";
import { Popover } from "../../ui/popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { CommandGroup } from "cmdk";
import * as chrono from "chrono-node";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { todayButton } from "./today-button-datepicker";

type NewShiftFormProps = {
  reloadScheduleCalendar: () => void;
  selectedDate: Date;
  children: React.ReactNode;
  selectedUserId: string;
};

const THIRTY_MINUTES = 1800000;
const ONE_HOUR = 3600000;

const localeStringOptions: { dateStyle: "short"; timeStyle: "short" } = {
  dateStyle: "short",
  timeStyle: "short",
};

export default function CreateShiftDialog({
  reloadScheduleCalendar,
  selectedDate,
  selectedUserId,
  children,
}: NewShiftFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState<string>(
    selectedDate.toLocaleString(undefined, localeStringOptions)
  );
  const [endTime, setEndTime] = useState<string>(
    new Date(
      Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) * THIRTY_MINUTES +
        ONE_HOUR
    ).toLocaleString(undefined, localeStringOptions)
  );

  const [userId, setUserId] = useState<string>(selectedUserId);
  const [positionId, setPositionId] = useState<string>("");
  const [userPopOpen, setUserPopOpen] = useState(false);
  const [positionPopOpen, setPositionPopOpen] = useState(false);
  const { allPositions: positions, allUsers: users } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);

  const [startTimeHovercardOpen, setStartTimeHovercardOpen] = useState(() => {
    console.log("initializing start time hovercard open");
    return false;
  });

  const initializeDatepickers = () => {
    if (startDatepickerRef.current) startDatepickerRef.current.destroy();
    if (endDatepickerRef.current) endDatepickerRef.current.destroy();

    startDatepickerRef.current = new AirDatepicker(
      document.querySelector("#startTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          handleStartTimeChange((date as Date).toISOString());
        },
        selectedDates: [selectedDate],
        locale: localeEn,
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: [todayButton, "clear"],
      }
    );
    setTimeout(() => {
      setStartTime(selectedDate.toLocaleString(undefined, localeStringOptions));
    }, 500);

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime((date as Date).toISOString());
        },
        selectedDates: [
          new Date(
            Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) *
              THIRTY_MINUTES +
              THIRTY_MINUTES +
              ONE_HOUR
          ),
        ],
        locale: localeEn,
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Initialize datepickers when dialog opens
      setTimeout(initializeDatepickers, 0);
    }
  };

  const handleHoverCardOpenChange = (open: boolean, elementId: string) => {
    if (document.activeElement?.id !== elementId) {
      setStartTimeHovercardOpen(open);
    }
  };

  const renderParsedDate = () => {
    const parsedDate = chrono.parseDate(startTime);
    return parsedDate
      ? parsedDate.toLocaleString(undefined, localeStringOptions)
      : "Invalid date";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newShift: NewShift = {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      userId,
      positionId,
    };

    let data: { message: string } = { message: "" };
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

      data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error creating shift:", error);
      return toast.error("Failed to create shift");
    }

    toast.success(data.message);

    setIsOpen(false); // Close the dialog

    // Reset form fields
    setStartTime("");
    setEndTime("");
    setUserId("");
    setPositionId("");
    reloadScheduleCalendar();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
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
              <Label htmlFor="startTime" className="text-right">
                Start Time
              </Label>
              <HoverCard
                open={startTimeHovercardOpen}
                onOpenChange={(o) => handleHoverCardOpenChange(o, "startTime")}
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
                  {renderParsedDate()}
                </HoverCardContent>
              </HoverCard>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right">
                End Time
              </Label>
              <Input
                id="endTime"
                className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                ref={endTimeRef}
                onChange={(e) => {
                  const parsedDate = chrono.parseDate(e.target.value);
                  if (parsedDate) {
                    setEndTime(parsedDate.toISOString());
                  }
                }}
                onBlur={() => {
                  if (endTimeRef.current) {
                    endTimeRef.current.value = new Date(endTime).toLocaleString(
                      undefined,
                      localeStringOptions
                    );
                  }
                }}
              />
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
            <Button type="submit">Create Shift</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
