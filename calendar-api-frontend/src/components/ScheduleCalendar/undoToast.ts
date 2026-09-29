import { useEffect } from "react";
import { toast } from "sonner";
import { isDialogOpen, isEditableTarget } from "@/hooks/useSelectShortcuts";

/** Long enough to notice a drag went wrong and reach for Undo; short enough not to pile up. */
const UNDO_TOAST_MS = 8000;

type UndoEntry = { toastId: string | number; undo: () => Promise<void> };

/**
 * Every undo toast still on screen, oldest first. Ctrl/Cmd+Z takes the newest, so pressing
 * it twice walks back two changes, the way undo does everywhere else.
 *
 * Module-level rather than state: the toasts are sonner's, not React's, and nothing needs
 * to re-render when this changes.
 */
const live: UndoEntry[] = [];

/**
 * Take an entry off the list before its undo runs. The Undo button and Ctrl+Z can both
 * reach the same entry, and whichever gets there second has to find it gone.
 */
const claim = (toastId: string | number): UndoEntry | undefined => {
  const index = live.findIndex((entry) => entry.toastId === toastId);
  if (index === -1) return undefined;
  return live.splice(index, 1)[0];
};

const runUndo = async (entry: UndoEntry) => {
  toast.dismiss(entry.toastId);
  try {
    await entry.undo();
    toast.success("Change undone");
  } catch (error) {
    console.error("Error undoing shift change:", error);
    toast.error("Could not undo the change", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
};

/**
 * A success toast with an Undo button, also reachable with Ctrl/Cmd+Z while it is showing
 * (see `useUndoShortcut`).
 *
 * This is what replaced the "Publish this change?" prompt on grid gestures. The prompt's
 * Cancel was the one way back from an accidental drag; saving straight away needs a way
 * back too, and one that does not stop every deliberate drag to ask first.
 */
export const showUndoToast = ({
  message,
  description,
  undo,
}: {
  message: string;
  description?: string;
  undo: () => Promise<void>;
}) => {
  const toastId: string | number = toast.success(message, {
    description,
    duration: UNDO_TOAST_MS,
    action: {
      label: "Undo",
      onClick: () => {
        const entry = claim(toastId);
        if (entry) void runUndo(entry);
      },
    },
    onDismiss: () => claim(toastId),
    onAutoClose: () => claim(toastId),
  });
  live.push({ toastId, undo });
};

/**
 * Ctrl/Cmd+Z undoes the newest change whose undo toast is still up.
 *
 * Stands down while typing, where Ctrl+Z is the text field's own undo, and while a dialog
 * is open, since the dialog owns the keyboard. It only acts when there is something to
 * undo, so the browser's Ctrl+Z is untouched the rest of the time.
 */
export const useUndoShortcut = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "z" || event.repeat) return;
      if (isEditableTarget(event.target) || isDialogOpen()) return;
      const newest = live[live.length - 1];
      if (!newest) return;
      event.preventDefault();
      const entry = claim(newest.toastId);
      if (entry) void runUndo(entry);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
};
