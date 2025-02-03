import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useRef, useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import localeEn from "air-datepicker/locale/en";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Check, ChevronsUpDown, Copy } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import * as chrono from "chrono-node";
// import { toast } from "sonner";
import { useUserSettings } from "@/providers/useUserSettings";
import AirDatepicker from "air-datepicker";
import { todayButton } from "./calendar-components/today-button-datepicker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "../ui/badge";

type DuplicateShiftsProps = {
  selectedDate: Date;
};

const dateOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

function DuplicateShifts({ selectedDate }: DuplicateShiftsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceDate, setSourceDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  // const [userId, setUserId] = useState("");
  const [userPopOpen, setUserPopOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const sourceDateRef = useRef<HTMLInputElement>(null);
  const targetDateRef = useRef<HTMLInputElement>(null);
  const { type: userType, allUsers: users } = useUserSettings();

  const initializeDatepickers = () => {
    if (startDatepickerRef.current) startDatepickerRef.current.destroy();
    if (endDatepickerRef.current) endDatepickerRef.current.destroy();

    startDatepickerRef.current = new AirDatepicker(
      document.querySelector("#sourceDate") as HTMLInputElement,
      {
        onSelect: ({ date }) => {
          setSourceDate(
            (date as Date).toLocaleDateString("en-US", dateOptions)
          );
        },
        selectedDates: [new Date(selectedDate.getTime())],
        locale: localeEn,
        dateFormat: "MMMM d, yyyy",
        position: "bottom left",
        container: ".air-datepicker-global",
        buttons: [todayButton, "clear"],
        autoClose: true,
        toggleSelected: false,
      }
    );

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#targetDate") as HTMLInputElement,
      {
        onSelect: ({ date }) => {
          setTargetDate(
            (date as Date).toLocaleDateString("en-US", dateOptions)
          );
        },
        selectedDates: [new Date(selectedDate.getTime())],
        locale: localeEn,
        dateFormat: "MMMM d, yyyy",
        position: "bottom left",
        container: ".air-datepicker-global",
        buttons: [todayButton, "clear"],
        autoClose: true,
        toggleSelected: false,
      }
    );

    setSourceDate(selectedDate.toLocaleDateString("en-US", dateOptions));
    setTargetDate(selectedDate.toLocaleDateString("en-US", dateOptions));
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Initialize datepickers when dialog opens
      setTimeout(initializeDatepickers, 0);
    }
  };

  const handleSubmit = async () => {
    const sourceDateNormalized = new Date(sourceDate).setHours(0, 0, 0, 0);

    const sourceDateISO = new Date(sourceDateNormalized).toISOString();
    const targetDateISO = new Date(targetDate).toISOString();

    const duplicateObject = {
      sourceDate: sourceDateISO,
      targetDate: targetDateISO,
      users: selectedUserIds,
    };

    let data: { message: string } = { message: "" };
    try {
      const response = await fetch("/api/shift/duplicate-shifts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicateObject),
        credentials: "include", // Ensures that Clerk's authentication is included
      });

      if (!response.ok) throw new Error("Failed to duplicate events");

      data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error creating shift:", error);
      return toast.error("Failed to duplicate events");
    }

    toast.success(data.message);

    setIsOpen(false); // Close the dialog

    // Reset form fields
    setSourceDate("");
    setTargetDate("");
    setSelectedUserIds([]);
    // setUserId("");
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
          <Copy size="16" /> Duplicate shifts
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("sm:max-w-[425px]", "air-datepicker-global")}
      >
        <DialogHeader>
          <DialogTitle>Duplicate shifts</DialogTitle>
          <DialogDescription>
            Duplicate shifts from one day to another
          </DialogDescription>
        </DialogHeader>
        <form tabIndex={0}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label
                htmlFor="sourceDate"
                className="text-right"
                autoFocus={false}
              >
                Copy from
              </Label>
              <Input
                id="sourceDate"
                className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                ref={sourceDateRef}
                autoFocus={false}
                onChange={(e) => {
                  const parsedDate = chrono.parseDate(e.target.value);
                  if (parsedDate) {
                    setSourceDate(
                      parsedDate.toLocaleDateString("en-US", dateOptions)
                    );
                  }
                }}
                onBlur={() => {
                  if (sourceDateRef.current) {
                    sourceDateRef.current.value = new Date(
                      sourceDate
                    ).toLocaleDateString("en-US", dateOptions);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="targetDate" className="text-right">
                Copy to
              </Label>
              <Input
                id="targetDate"
                className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                ref={targetDateRef}
                onChange={(e) => {
                  const parsedDate = chrono.parseDate(e.target.value);
                  if (parsedDate) {
                    setTargetDate(
                      parsedDate.toLocaleDateString("en-US", dateOptions)
                    );
                  }
                }}
                onBlur={() => {
                  if (targetDateRef.current) {
                    targetDateRef.current.value = new Date(
                      targetDate
                    ).toLocaleDateString("en-US", dateOptions);
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4 z-50">
              <Label htmlFor="userId" className="text-right">
                Users
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
                    className="h-auto"
                  >
                    <div className="flex flex-wrap">
                      {selectedUserIds.length > 0
                        ? selectedUserIds.map((id) => (
                            <Badge
                              variant="secondary"
                              className="mr-1"
                              key={id}
                            >
                              {users.find((user) => user.id === id)?.firstName}
                            </Badge>
                          ))
                        : "Select users"}
                    </div>
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
                            onSelect={() => {
                              setSelectedUserIds((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((id) => id !== user.id)
                                  : [...prev, user.id]
                              );
                            }}
                          >
                            {user.firstName}
                            <Check
                              className="w-4 h-4 ml-auto"
                              style={{
                                display: selectedUserIds.includes(user.id)
                                  ? "block"
                                  : "none",
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
          </div>
        </form>
        <DialogFooter>
          <Button>Cancel</Button>
          <Button onClick={handleSubmit}>Duplicate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DuplicateShifts;
