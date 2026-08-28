import { Globe } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  BrazilFlag,
  IsraelFlag,
  PhilippinesFlag,
  UnitedStatesFlag,
} from "./LocationFlags";

/**
 * The flag each location answers to.
 *
 * Keyed on the location's `name` because that is what the API returns and what Settings
 * edits — there is no code or country field to key on. A location renamed in Settings
 * drops out of this list and simply stops having a button, which is the safe failure:
 * its agents stay visible under the globe rather than vanishing from a filter nobody can
 * see.
 */
const FLAGS = [
  { location: "Colorado", label: "Colorado", Flag: UnitedStatesFlag },
  { location: "LATAM", label: "LATAM", Flag: BrazilFlag },
  { location: "Israel", label: "Israel", Flag: IsraelFlag },
  { location: "APAC", label: "APAC", Flag: PhilippinesFlag },
] as const;

export const FILTERABLE_LOCATIONS = FLAGS.map((entry) => entry.location);

type LocationFilterProps = {
  /** Location names currently shown. Empty means the same as all — see below. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** How many agents each location would show, for the tooltips. */
  countsByLocation: Map<string, number>;
};

/**
 * Filter the grid down to one or more locations.
 *
 * The globe is derived rather than a fifth independent toggle: it reads as active exactly
 * when every flag is, and pressing it turns them all on. There is deliberately no way to
 * turn everything off — an empty grid answers no question, and a filter that can hide the
 * whole day is a filter people forget is on.
 */
const LocationFilter = ({
  selected,
  onChange,
  countsByLocation,
}: LocationFilterProps) => {
  const active = new Set(selected);
  const allOn = FILTERABLE_LOCATIONS.every((name) => active.has(name));

  const toggle = (name: string) => {
    const next = new Set(active);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    // Clearing the last flag would leave nothing on screen, so it falls back to
    // everything — the same place the globe puts you, and what "no filter" means.
    onChange(next.size === 0 ? [...FILTERABLE_LOCATIONS] : [...next]);
  };

  const button = (
    key: string,
    isActive: boolean,
    onClick: () => void,
    label: string,
    tip: string,
    children: React.ReactNode
  ) => (
    <TooltipProvider key={key} delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            onClick={onClick}
            className={cn(
              "flex h-[26px] w-[30px] items-center justify-center transition-colors",
              "hover:bg-muted focus-visible:z-10 focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              // Inactive flags are dimmed rather than greyscaled: at 16px a desaturated
              // flag is unrecognisable, so it would stop being a flag before it started
              // reading as "off".
              isActive ? "bg-muted" : "opacity-40 hover:opacity-100"
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
      {button(
        "globe",
        allOn,
        () => onChange([...FILTERABLE_LOCATIONS]),
        "Show every location",
        allOn ? "Showing every location" : "Show every location",
        <Globe size={15} className={allOn ? "" : "text-muted-foreground"} />
      )}

      {FLAGS.map(({ location, label, Flag }) => {
        const isActive = active.has(location);
        const count = countsByLocation.get(location) ?? 0;
        return (
          <div key={location} className="border-l border-border">
            {button(
              location,
              isActive,
              () => toggle(location),
              `${isActive ? "Hide" : "Show"} ${label}`,
              `${label} — ${count} ${count === 1 ? "agent" : "agents"}`,
              <Flag className="h-[11px] w-[16px] rounded-[1.5px] ring-1 ring-inset ring-black/15" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LocationFilter;
