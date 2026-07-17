import { useEffect, useMemo, useState } from "react";
import { MoreVertical, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { useSettings } from "@/providers/useSettings.tsx";
import { ColorPickerContent } from "./ColorPicker.tsx";
import { saveDefaultEventColorId } from "./utils.tsx";

const HINT_DISMISS_KEY = "agendo:applyColorHintDismissed";

export function ApplyColorMenu() {
  const {
    positionsToSync,
    setPositionsToSync,
    defaultEventColorId,
    setDefaultEventColorId,
  } = useUserSettings();
  const { rowSelection } = useSettings();

  const [open, setOpen] = useState(false);
  const [dialogColor, setDialogColor] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_DISMISS_KEY) === "true"
  );

  // Seed the dialog from the current default whenever it opens.
  useEffect(() => {
    if (open) {
      setDialogColor(defaultEventColorId ?? null);
      setMakeDefault(!!defaultEventColorId);
    }
  }, [open, defaultEventColorId]);

  // Nudge: same color manually set on 3+ rows suggests they want "apply to all".
  const repeatedColor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of positionsToSync) {
      if (!p.colorId) continue;
      counts.set(p.colorId, (counts.get(p.colorId) ?? 0) + 1);
    }
    for (const [id, n] of counts) if (n >= 3) return id;
    return null;
  }, [positionsToSync]);

  const showHint = !defaultEventColorId && !!repeatedColor && !hintDismissed;

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(HINT_DISMISS_KEY, "true");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Belt-and-suspenders: Radix can leave `pointer-events: none` on <body>
      // after a menu->dialog handoff, which would freeze the whole page.
      setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 0);
    }
  };

  const apply = async () => {
    // The user just used the feature, so stop nudging them toward it.
    dismissHint();
    if (makeDefault) {
      await saveDefaultEventColorId(dialogColor);
      setDefaultEventColorId(dialogColor);
      toast.success(
        dialogColor
          ? "This color now applies to all shifts."
          : "Default color cleared."
      );
    } else {
      // Turning the account-wide default off (if it was on) before a one-time apply.
      if (defaultEventColorId) {
        await saveDefaultEventColorId(null);
        setDefaultEventColorId(null);
      }
      setPositionsToSync(
        positionsToSync.map((p, index) => {
          const synced = p.enforceSync || !!rowSelection[index];
          return synced ? { ...p, colorId: dialogColor } : p;
        })
      );
      toast.success("Applied to your synced shifts — click Save to keep it.");
    }
    handleOpenChange(false);
  };

  return (
    <div className="relative flex items-center">
      {showHint && (
        <div className="absolute right-10 top-0 z-10 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissHint}
            className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="pr-4 text-sm font-medium">
            Applying the same color everywhere?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use “Set one color for all shifts” in the ⋯ menu to do it in one
            step — and keep future shifts the same color.
          </p>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Color options">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              // Defer so the menu fully closes before the dialog opens; opening
              // both in the same tick leaves `pointer-events: none` stuck on
              // <body> (Radix menu->dialog handoff), freezing the page.
              setTimeout(() => setOpen(true), 0);
            }}
          >
            Set one color for all shifts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set one color for all shifts</DialogTitle>
            <DialogDescription>
              Pick a color to apply to every shift you sync, instead of setting
              each one by hand.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <ColorPickerContent
              value={dialogColor}
              onSelect={setDialogColor}
              positionsToSync={positionsToSync}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={makeDefault}
              onCheckedChange={(v) => setMakeDefault(!!v)}
              className="mt-0.5"
            />
            <span>
              Make this the default for all shifts, including ones you sync
              later.
              <span className="mt-0.5 block text-xs text-muted-foreground">
                When on, per-shift colors are locked to this one until you turn
                it off.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
