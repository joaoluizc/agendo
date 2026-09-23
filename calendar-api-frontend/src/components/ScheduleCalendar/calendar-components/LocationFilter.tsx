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
 *
 * Exported for the duplicate dialog, which groups its agent chips under the same flags.
 */
export const FLAGS = [
  { location: "Colorado", label: "Colorado", Flag: UnitedStatesFlag },
  { location: "LATAM", label: "LATAM", Flag: BrazilFlag },
  { location: "Israel", label: "Israel", Flag: IsraelFlag },
  { location: "APAC", label: "APAC", Flag: PhilippinesFlag },
] as const;

export const FILTERABLE_LOCATIONS = FLAGS.map((entry) => entry.location);

type LocationFilterProps = {
  /** Location names currently shown. All of them means no filtering. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** How many agents each location would show, for the tooltips. */
  countsByLocation: Map<string, number>;
};

const BUTTON =
  "group relative flex w-[34px] items-center justify-center outline-none " +
  "transition-colors duration-150 hover:bg-muted/70 focus-visible:z-10 " +
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** The 2px rail that marks a button as on. Sits under the icon, inside the border. */
const Underline = ({ on }: { on: boolean }) => (
  <span
    aria-hidden="true"
    className={cn(
      "absolute inset-x-[5px] bottom-[3px] h-[2px] rounded-full bg-primary",
      // Grows from the middle rather than fading, so switching locations reads as the
      // mark moving along the row instead of two unrelated things blinking.
      "origin-center transition-transform duration-150 ease-out motion-reduce:transition-none",
      on ? "scale-x-100" : "scale-x-0"
    )}
  />
);

/**
 * Filter the grid down to one or more locations.
 *
 * Picking a flag out of the unfiltered view switches to *only* that location, because
 * that is what asking for a location almost always means — "show me Brazil", not "hide
 * everyone else one country at a time". Once you are filtered, flags add and remove, so
 * building Brazil + Israel is still two clicks. The globe puts everything back.
 *
 * The globe is derived rather than a fifth independent toggle: it reads as on exactly
 * when every flag is. There is deliberately no way to turn everything off — an empty grid
 * answers no question, so dropping the last flag returns you to all.
 */
const LocationFilter = ({
  selected,
  onChange,
  countsByLocation,
}: LocationFilterProps) => {
  const active = new Set(selected);
  const showingAll = FILTERABLE_LOCATIONS.every((name) => active.has(name));

  const press = (name: string) => {
    // From the unfiltered view, a flag is a jump to that location, not a subtraction.
    if (showingAll) {
      onChange([name]);
      return;
    }
    const next = new Set(active);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next.size === 0 ? [...FILTERABLE_LOCATIONS] : [...next]);
  };

  /** What a click will do, so the tooltip matches the two different behaviours. */
  const actionFor = (name: string, label: string) => {
    if (showingAll) return `Show only ${label}`;
    if (!active.has(name)) return `Add ${label}`;
    return active.size === 1 ? "Show every location" : `Hide ${label}`;
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Show every location"
              aria-pressed={showingAll}
              onClick={() => onChange([...FILTERABLE_LOCATIONS])}
              className={cn(BUTTON, "border-r border-border")}
            >
              <Globe
                size={16}
                className={cn(
                  "transition-[color,transform] duration-150 ease-out",
                  "group-active:scale-[0.86] motion-reduce:transition-none",
                  showingAll ? "text-foreground" : "text-muted-foreground"
                )}
              />
              <Underline on={showingAll} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{showingAll ? "Showing every location" : "Show every location"}</p>
          </TooltipContent>
        </Tooltip>

        {FLAGS.map(({ location, label, Flag }) => {
          const on = active.has(location);
          // In the unfiltered view the globe carries the mark on its own. Underlining all
          // four as well puts five rails in a row that say nothing the globe has not, and
          // leaves nothing for the filtered state to stand out against.
          const marked = on && !showingAll;
          const count = countsByLocation.get(location) ?? 0;
          return (
            <Tooltip key={location}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={actionFor(location, label)}
                  aria-pressed={on}
                  onClick={() => press(location)}
                  className={BUTTON}
                >
                  <Flag
                    className={cn(
                      "h-[12px] w-[18px] rounded-[2px] ring-1 ring-inset ring-foreground/25",
                      "transition-[opacity,transform] duration-150 ease-out",
                      // A press dips the flag rather than the button, so the row's
                      // outline stays still while the thing you clicked reacts.
                      "group-active:scale-[0.86] motion-reduce:transition-none",
                      // Dimmed rather than desaturated: at 18px a greyscale flag stops
                      // being recognisable as a flag before it reads as "off".
                      on ? "opacity-100" : "opacity-45 group-hover:opacity-80"
                    )}
                  />
                  <Underline on={marked} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{actionFor(location, label)}</p>
                <p className="text-muted-foreground">
                  {count} {count === 1 ? "agent" : "agents"}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default LocationFilter;
