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

/**
 * Country names people actually type, mapped to the zone they mean.
 *
 * IANA zones are named after cities, but nobody looks up their own timezone by city —
 * they type the country. "Israel" returned nothing while `Asia/Jerusalem` sat in the
 * list, which is how this was found. The legacy IANA aliases (`Israel`, `Asia/Tel_Aviv`)
 * are deliberately not offered as values: they are deprecated links that resolve to the
 * canonical zone anyway, so storing one would just mean two spellings of the same place
 * in the database.
 *
 * Search-only — the stored value is always the canonical zone. Weighted toward where the
 * support team actually is, with the common rest filled in; add to it freely, nothing
 * depends on it being complete.
 */
const SEARCH_ALIASES: Record<string, string[]> = {
  "Asia/Jerusalem": ["israel", "tel aviv", "jerusalem", "il"],
  "America/Sao_Paulo": ["brazil", "brasil", "br", "sao paulo"],
  "Asia/Manila": ["philippines", "ph", "manila"],
  "America/Argentina/Buenos_Aires": ["argentina", "ar", "buenos aires"],
  "America/Mexico_City": ["mexico", "mx"],
  "America/Bogota": ["colombia", "co"],
  "America/Santiago": ["chile", "cl"],
  "America/Lima": ["peru", "pe"],
  "America/New_York": ["usa", "us", "united states", "eastern", "est", "edt", "new york"],
  "America/Chicago": ["usa", "us", "central", "cst", "cdt", "chicago"],
  "America/Denver": ["usa", "us", "mountain", "mst", "mdt", "denver"],
  "America/Los_Angeles": ["usa", "us", "pacific", "pst", "pdt", "california"],
  "America/Toronto": ["canada", "ca", "toronto"],
  "Europe/London": ["uk", "united kingdom", "england", "britain", "gb", "london"],
  "Europe/Lisbon": ["portugal", "pt", "lisbon"],
  "Europe/Madrid": ["spain", "espana", "es", "madrid"],
  "Europe/Paris": ["france", "fr", "paris"],
  "Europe/Berlin": ["germany", "de", "berlin"],
  "Europe/Amsterdam": ["netherlands", "holland", "nl"],
  "Europe/Dublin": ["ireland", "ie", "dublin"],
  "Europe/Warsaw": ["poland", "pl", "warsaw"],
  "Europe/Kyiv": ["ukraine", "ua", "kyiv", "kiev"],
  "Europe/Bucharest": ["romania", "ro"],
  "Asia/Kolkata": ["india", "in", "calcutta", "kolkata", "bangalore", "ist"],
  "Asia/Tokyo": ["japan", "jp", "tokyo"],
  "Asia/Shanghai": ["china", "cn", "beijing", "shanghai"],
  "Asia/Singapore": ["singapore", "sg"],
  "Asia/Dubai": ["uae", "united arab emirates", "dubai", "ae"],
  "Australia/Sydney": ["australia", "au", "sydney"],
  "Pacific/Auckland": ["new zealand", "nz", "auckland"],
  "Africa/Johannesburg": ["south africa", "za", "johannesburg"],
  "Africa/Cairo": ["egypt", "eg", "cairo"],
  UTC: ["utc", "gmt", "universal", "zulu"],
};

/** Everything a row should match on: its id, its pretty label and its aliases. */
function searchHaystack(zone: string) {
  return [zone, label(zone), ...(SEARCH_ALIASES[zone] ?? [])]
    .join(" ")
    .toLowerCase()
    .replace(/[_/—]/g, " ")
    .replace(/\s+/g, " ");
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
          filter={(itemValue, search) => {
            // `itemValue` is the zone id; match against its label and country aliases
            // too, so "israel", "sao paulo" and "America/Sao_Paulo" all find their row.
            const needle = search
              .toLowerCase()
              .replace(/[_/—]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (!needle) return 1;
            return searchHaystack(itemValue).includes(needle) ? 1 : 0;
          }}
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
