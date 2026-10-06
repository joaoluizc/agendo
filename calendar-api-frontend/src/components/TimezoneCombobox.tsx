import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Every IANA zone the browser knows, plus UTC.
 *
 * `Intl.supportedValuesOf("timeZone")` returns canonical names and **omits "UTC"**, which
 * is exactly the value every agendo user currently holds — leaving it out would mean the
 * list could not show the zone someone already has. The backend validator hit the same
 * trap from the other side and now asks `Intl.DateTimeFormat` directly.
 */
function allZones(): string[] {
  // Typed locally: `supportedValuesOf` is ES2022 and this project's TS lib target does
  // not declare it, though every browser agendo supports has it.
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const supported =
    typeof intl.supportedValuesOf === "function"
      ? intl.supportedValuesOf("timeZone")
      : [];
  return ["UTC", ...supported.filter((zone: string) => zone !== "UTC")];
}

/** `Sao Paulo — America` reads better in a long list than `America/Sao_Paulo`. */
function label(zone: string) {
  if (!zone.includes("/")) return zone;
  const [region, ...rest] = zone.split("/");
  return `${rest.join("/").replace(/_/g, " ")} — ${region}`;
}

/** The current offset, so two similar-looking zones can be told apart. */
function offsetLabel(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

export default function TimezoneCombobox({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(allZones, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal sm:w-[340px]"
        >
          <span className="truncate">
            {value ? label(value) : "Select a timezone…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            // Match the raw zone name as well as the pretty label, so both
            // "sao_paulo" and "sao paulo" find the same row.
            itemValue.toLowerCase().replace(/_/g, " ").includes(search.toLowerCase().replace(/_/g, " "))
              ? 1
              : 0
          }
        >
          <CommandInput placeholder="Search city or region…" />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === zone ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{label(zone)}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {offsetLabel(zone)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { allZones, label as timezoneLabel, offsetLabel };
