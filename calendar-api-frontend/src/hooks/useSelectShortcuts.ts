import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSchedule } from "@/providers/useSchedule";

/**
 * How long Ctrl/Cmd has to be held, alone, before select mode appears. Long enough that
 * Ctrl+C, Ctrl+P or a Ctrl-click passes without the toolbar flashing; short enough that a
 * deliberate hold feels immediate.
 */
const PEEK_DELAY_MS = 200;

const isModifierKey = (key: string) => key === "Control" || key === "Meta";

/** Typing somewhere: every shortcut here stands down so text editing behaves normally. */
const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
  );
};

/** A dialog owns the keyboard while it is open (and Ctrl+A inside one selects its text). */
const isDialogOpen = () =>
  document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

/**
 * Keyboard shortcuts for selecting shifts, available without entering select mode first.
 *
 * - **Ctrl/Cmd+A** selects every shift on screen and enters select mode, like the
 *   toolbar's Select all.
 * - **Holding Ctrl/Cmd** enters select mode for as long as it is held, so the row
 *   checkboxes are one keypress away. Releasing leaves select mode again *unless*
 *   something got selected meanwhile — then the mode stays, because a selection with no
 *   checkboxes on screen is invisible and cannot be undone (the state that once deleted
 *   two days of shifts).
 *
 * Both Ctrl and Cmd are accepted, matching Ctrl/Cmd-click on a shift. Window blur and a
 * hidden tab count as a release, or Alt+Tab while holding Ctrl would leave the mode stuck
 * on with no key down.
 */
export const useSelectShortcuts = (enabled: boolean) => {
  const {
    isBulkSelectorActive,
    setIsBulkSelectorActive,
    bulkSelectedShifts,
    exitBulkSelect,
    selectAllVisible,
  } = useSchedule();

  // The listeners are registered once; they read live state through refs rather than
  // re-subscribing on every selection change.
  const state = useRef({ isBulkSelectorActive, bulkSelectedShifts, selectAllVisible });
  state.current = { isBulkSelectorActive, bulkSelectedShifts, selectAllVisible };

  const peekTimer = useRef<number | null>(null);
  /** Select mode is on only because a modifier is being held. */
  const peeking = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const cancelPendingPeek = () => {
      if (peekTimer.current !== null) {
        window.clearTimeout(peekTimer.current);
        peekTimer.current = null;
      }
    };

    const release = () => {
      cancelPendingPeek();
      if (!peeking.current) return;
      peeking.current = false;
      if (state.current.bulkSelectedShifts.length === 0) exitBulkSelect();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) {
        if (event.repeat || peekTimer.current !== null) return;
        if (event.altKey || event.shiftKey) return;
        if (state.current.isBulkSelectorActive) return;
        if (isEditableTarget(event.target) || isDialogOpen()) return;
        peekTimer.current = window.setTimeout(() => {
          peekTimer.current = null;
          // Something else (a Ctrl-click on a shift) may have entered the mode already;
          // then it is not ours to leave on release.
          if (state.current.isBulkSelectorActive) return;
          peeking.current = true;
          setIsBulkSelectorActive(true);
        }, PEEK_DELAY_MS);
        return;
      }

      // Any other key while the modifier is down is a shortcut, not a hold.
      cancelPendingPeek();

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        if (isEditableTarget(event.target) || isDialogOpen()) return;
        event.preventDefault();
        // Selecting makes the mode stick on release, so it stops being a peek.
        peeking.current = false;
        if (state.current.selectAllVisible() === 0) {
          toast.error("No shifts on this day to select.");
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) release();
    };

    const onVisibilityChange = () => {
      if (document.hidden) release();
    };

    // Ctrl+wheel is the browser's zoom. Holding Ctrl for it is not asking for checkboxes.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) release();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    window.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelPendingPeek();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, exitBulkSelect, setIsBulkSelectorActive]);
};
