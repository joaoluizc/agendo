import { Shift, ShiftStatus, SortedCalendar } from "@/types/shiftTypes";
import { CalendarUser, GCalendarEvent } from "@/types/gCalendarTypes";
import utils from "@/utils/utils";

/**
 * The shift endpoints the dialogs use, plus the one function that folds a batch of
 * creates and deletes back into the page's in-memory day.
 *
 * The API contract is unchanged — `POST /api/shift/new` still takes one time range, one
 * position and a list of user ids. What is new is that a dialog may need to delete
 * before it creates (the "replace" resolution), so patching the day one shift at a time
 * would make the grid flicker through states that never really existed.
 */

type CreateShiftsInput = {
  startTime: string;
  endTime: string;
  userIds: string[];
  positionId: string;
  /**
   * Omit for a draft, which is the default and the normal case. `"published"` creates the
   * shift already committed and syncs it to the agent's calendar in the same request —
   * for when the shift is known to be final and a second step is just friction.
   */
  status?: ShiftStatus;
};

type CreateShiftsResult = {
  created: Shift[];
  /** Present when the API reported a partial success (207). */
  errors: { userId: string; message: string }[];
};

export const createShifts = async (
  input: CreateShiftsInput
): Promise<CreateShiftsResult> => {
  const response = await fetch("/api/shift/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);

  // 207 reports the shifts it did manage to create alongside the failures, so a partial
  // batch still lands on the grid instead of being thrown away with the error.
  if (response.status === 207) {
    return {
      created: payload?.createdShifts ?? [],
      errors: payload?.errors ?? [],
    };
  }

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create shifts");
  }

  return { created: payload?.data ?? [], errors: [] };
};

export const updateShift = async (
  shiftId: string,
  input: {
    startTime: string;
    endTime: string;
    userId: string;
    positionId: string;
    /**
     * Moves the shift between draft and published as part of the edit — this is how
     * un-publishing exists. Omit to leave the status untouched.
     */
    status?: ShiftStatus;
  }
): Promise<Shift | null> => {
  const response = await fetch(`/api/shift?shiftId=${shiftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);
  // Carry the server's reason up. Throwing a fixed string here is what made a 400 from
  // this endpoint show as a bare "1 change could not be saved" with nothing to act on.
  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to update shift");
  }
  return payload?.data ?? null;
};

export const deleteShift = async (shiftId: string): Promise<void> => {
  const response = await fetch(`/api/shift/delete?shiftId=${shiftId}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to delete shift");
};

export type PublishResult = {
  message: string;
  published: number;
  alreadyPublished: number;
  data: Shift[];
  /** Shifts that published but whose calendar event failed. */
  errors?: { shiftId: string; message: string }[];
  notFound?: string[];
};

/**
 * Commit drafts.
 *
 * The only call that puts a shift on an agent's real calendar — creating or editing one
 * no longer does — which is why it is a separate, explicit action rather than something
 * the save buttons do quietly.
 */
export const publishShifts = async (
  shiftIds: string[]
): Promise<PublishResult> => {
  const response = await fetch("/api/shift/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ shiftIds }),
  });

  const payload = await response.json().catch(() => null);

  // 207 means the shifts published but at least one calendar event failed. They are real
  // shifts either way, so the grid still updates and the caller warns about the rest.
  if (!response.ok && response.status !== 207) {
    throw new Error(payload?.message ?? "Failed to publish shifts");
  }

  return {
    message: payload?.message ?? "",
    published: payload?.published ?? 0,
    alreadyPublished: payload?.alreadyPublished ?? 0,
    data: payload?.data ?? [],
    errors: payload?.errors,
    notFound: payload?.notFound,
  };
};

export type UnpublishResult = {
  message: string;
  unpublished: number;
  alreadyDraft: number;
  data: Shift[];
  /** Shifts moved back to draft whose calendar event could not be removed. */
  errors?: { shiftId: string; message: string }[];
  notFound?: string[];
};

/**
 * Move published shifts back to draft, deleting their calendar events.
 *
 * The bulk counterpart to unchecking Published in the edit dialog. A shift already in draft
 * is counted rather than rejected, so a mixed selection can be sent as-is.
 */
export const unpublishShifts = async (
  shiftIds: string[]
): Promise<UnpublishResult> => {
  const response = await fetch("/api/shift/unpublish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ shiftIds }),
  });

  const payload = await response.json().catch(() => null);

  // 207 means they are drafts now but at least one calendar event survived — worth saying,
  // since an agent left holding a meeting for an uncommitted shift is the failure that
  // nothing else would notice.
  if (!response.ok && response.status !== 207) {
    throw new Error(payload?.message ?? "Failed to unpublish shifts");
  }

  return {
    message: payload?.message ?? "",
    unpublished: payload?.unpublished ?? 0,
    alreadyDraft: payload?.alreadyDraft ?? 0,
    data: payload?.data ?? [],
    errors: payload?.errors,
    notFound: payload?.notFound,
  };
};

/** Every shift between two instants, ungrouped. Used to find days that already have shifts. */
export const fetchShiftsBetween = async (
  from: Date,
  to: Date
): Promise<Shift[]> => {
  const startTime = from.toISOString();
  const endTime = to.toISOString();
  const response = await fetch(
    `/api/shift/range?startTime=${startTime}&endTime=${endTime}`,
    { method: "GET", credentials: "include" }
  );
  if (!response.ok) throw new Error("Failed to fetch shifts");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
};

/** Local-midnight-to-23:59 ISO bounds for a day, matching how the day view fetches. */
export const dayBoundsIso = (date: Date) => utils.getLocalTimeframeISO(date);

/** What to do about a target day that already has shifts for the selected agents. */
export type DuplicateMode = "skip" | "merge" | "replace";

export type DuplicateDayOutcome = {
  date: string;
  status: "copied" | "skipped" | "empty" | "failed";
  created: number;
  replaced?: number;
  existing?: number;
};

export type DuplicateResult = {
  message: string;
  created: number;
  replaced: number;
  days: DuplicateDayOutcome[];
  errors?: { date: string; message: string }[];
};

/**
 * Copy a day onto several days in one request.
 *
 * `targetDates` are local-midnight instants; the API derives each day's window from the
 * instant so the day it operates on is the caller's, not the server's.
 */
export const duplicateShifts = async (input: {
  sourceDate: string;
  targetDates: string[];
  users: string[];
  mode: DuplicateMode;
  excludePositionIds: string[];
}): Promise<DuplicateResult> => {
  const response = await fetch("/api/shift/duplicate-shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);
  // 207 means some days landed and some did not — the payload still describes both.
  if (!response.ok && response.status !== 207) {
    throw new Error(payload?.message ?? "Failed to duplicate shifts");
  }
  return {
    message: payload?.message ?? "",
    created: payload?.created ?? 0,
    replaced: payload?.replaced ?? 0,
    days: payload?.days ?? [],
    errors: payload?.errors,
  };
};

type ApplyInput = {
  shifts: SortedCalendar;
  events: CalendarUser[];
  removed: Shift[];
  created: Shift[];
};

const byStartTime = (a: Shift, b: Shift) =>
  new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

/**
 * Apply a batch of deletes and creates to the day the page is holding.
 *
 * Every level is replaced rather than mutated: the grid memoises each agent's lane
 * packing on their own shift array, so an array that keeps its identity leaves the
 * change invisible until a reload. Synced shifts carry a Google Calendar event, which
 * has to move with them or the under-lane keeps showing a meeting for a deleted shift.
 */
export const applyShiftChanges = ({
  shifts,
  events,
  removed,
  created,
}: ApplyInput): { shifts: SortedCalendar; events: CalendarUser[] } => {
  const removedIds = new Set(removed.map((shift) => shift._id));
  const touched = new Set([
    ...removed.map((shift) => String(shift.userId)),
    ...created.map((shift) => String(shift.userId)),
  ]);

  const nextShifts: SortedCalendar = { ...shifts };
  touched.forEach((userId) => {
    const kept = (nextShifts[userId] ?? []).filter(
      (shift) => !removedIds.has(shift._id)
    );
    const added = created.filter((shift) => String(shift.userId) === userId);
    nextShifts[userId] = [...kept, ...added].sort(byStartTime);
  });

  const removedEventIds = new Set(
    removed
      .filter((shift) => shift.isSynced && shift.syncedEvent)
      .map((shift) => shift.syncedEvent.id)
  );
  const addedEvents = new Map<string, GCalendarEvent[]>();
  created
    .filter((shift) => shift.isSynced && shift.syncedEvent)
    .forEach((shift) => {
      const userId = String(shift.userId);
      addedEvents.set(userId, [
        ...(addedEvents.get(userId) ?? []),
        shift.syncedEvent,
      ]);
    });

  const eventsChanged = removedEventIds.size > 0 || addedEvents.size > 0;
  const nextEvents = eventsChanged
    ? events.map((calendarUser) => {
        const userId = String(calendarUser.userId);
        const incoming = addedEvents.get(userId) ?? [];
        if (!incoming.length && !removedEventIds.size) return calendarUser;
        return {
          ...calendarUser,
          events: [
            ...calendarUser.events.filter(
              (event) => !removedEventIds.has(event.id)
            ),
            ...incoming,
          ].sort(
            (a, b) =>
              new Date(a.start.dateTime).getTime() -
              new Date(b.start.dateTime).getTime()
          ),
        };
      })
    : events;

  return { shifts: nextShifts, events: nextEvents };
};
