import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_KEYS, AREA_LABELS, AREA_LEVELS, AreaKey } from "@/permissions/permissions";
import { PermissionRegistry, usersApi } from "./api";

export type AreaCopy = {
  key: AreaKey;
  label: string;
  levels: { key: string; description: string }[];
  /** From the registry; unknown until it loads. */
  defaultForNewUsers?: string;
};

/** The registry's copy, fetched once per page load; the built-in levels until it arrives. */
let registryRequest: Promise<PermissionRegistry> | null = null;
const fallbackAreas: AreaCopy[] = AREA_KEYS.map((key) => ({
  key,
  label: AREA_LABELS[key],
  levels: AREA_LEVELS[key].map((level) => ({ key: level, description: "" })),
}));

/** Areas, levels and their descriptions for an access editor (the access card, invites). */
export function useAreaCopy(): AreaCopy[] {
  const [areas, setAreas] = useState<AreaCopy[]>(fallbackAreas);
  useEffect(() => {
    registryRequest ??= usersApi.getPermissionRegistry();
    let alive = true;
    registryRequest
      .then((registry) => {
        // Only areas this frontend knows how to gate; the server may be a deploy ahead.
        const known = registry.areas.filter((area) => AREA_KEYS.includes(area.key));
        if (alive && known.length) setAreas(known);
      })
      .catch(() => {
        registryRequest = null; // fall back to the built-in levels; retry next time
      });
    return () => {
      alive = false;
    };
  }, []);
  return areas;
}

/**
 * One area's levels as a segmented control. `dimmed` greys it out without disabling it
 * (an admin's levels only matter if admin is removed); `busy` spins the active level
 * while it saves.
 */
export function LevelPicker({
  area,
  value,
  onChange,
  disabled = false,
  dimmed = false,
  busy = false,
}: {
  area: AreaCopy;
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
  dimmed?: boolean;
  busy?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={area.label}
      className={cn(
        "inline-flex overflow-hidden rounded-md border border-border",
        dimmed && "opacity-50",
      )}
    >
      {area.levels.map((level) => {
        const active = level.key === value;
        return (
          <button
            key={level.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(level.key)}
            title={level.description || undefined}
            className={cn(
              "px-3 py-1 text-xs font-medium capitalize transition-colors [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground",
              "disabled:cursor-not-allowed",
            )}
          >
            {busy && active ? <Loader2 className="h-3 w-3 animate-spin" /> : level.key}
          </button>
        );
      })}
    </div>
  );
}
