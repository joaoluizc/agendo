import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Position } from "@/types/positionTypes.ts";
import {
  GCAL_EVENT_COLORS,
  hexForColorId,
} from "./eventColors.ts";

// A single circular color swatch. No `hex` => the "no color" crossed-off circle.
export function ColorSwatch({
  hex,
  selected,
  className,
}: {
  hex?: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block h-5 w-5 shrink-0 rounded-full border",
        hex ? "border-black/10" : "border-muted-foreground/40",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        className
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    >
      {!hex && (
        <svg
          viewBox="0 0 20 20"
          className="absolute inset-0 h-full w-full text-muted-foreground/60"
        >
          <line
            x1="3.5"
            y1="16.5"
            x2="16.5"
            y2="3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

function SwatchButton({
  colorId,
  selected,
  onSelect,
}: {
  colorId: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(colorId)}
      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ColorSwatch hex={hexForColorId(colorId)} selected={selected} />
    </button>
  );
}

// The picker body: "Most used" (colors already applied to other rows) + the 11
// suggested Google Calendar colors + an optional "No color" clear action.
// Colors only, no labels (per product decision).
export function ColorPickerContent({
  value,
  onSelect,
  positionsToSync,
  excludeId,
  showClear = true,
}: {
  value: string | null;
  onSelect: (colorId: string | null) => void;
  positionsToSync: Position[];
  excludeId?: string;
  showClear?: boolean;
}) {
  const mostUsed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of positionsToSync) {
      if (!p.colorId) continue;
      if (excludeId && p._id === excludeId) continue;
      counts.set(p.colorId, (counts.get(p.colorId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 6);
  }, [positionsToSync, excludeId]);

  return (
    <div className="space-y-3">
      {mostUsed.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Most used</p>
          <div className="flex flex-wrap gap-2">
            {mostUsed.map((id) => (
              <SwatchButton
                key={`mru-${id}`}
                colorId={id}
                selected={value === id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Suggested</p>
        <div className="flex flex-wrap gap-2">
          {GCAL_EVENT_COLORS.map((c) => (
            <SwatchButton
              key={c.id}
              colorId={c.id}
              selected={value === c.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      {showClear && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            value === null && "text-foreground"
          )}
        >
          <ColorSwatch selected={value === null} />
          No color
        </button>
      )}
    </div>
  );
}
