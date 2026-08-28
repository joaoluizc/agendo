import { HoursReportRow } from "./api";

/**
 * Copy layout: the shape a column takes on its way to the clipboard, independent of what
 * the report itself shows.
 *
 * The sheet these numbers get pasted into carries legacy agents the report has no rows
 * for, so a straight column copy lands one row short from the first missing name onward
 * and every value below it is attributed to the wrong person. The fix is padding: blank
 * lines inserted at the right places so the pasted column lines up again. Rows can also
 * be dropped, for the opposite case — an agent the report has and the sheet doesn't.
 *
 * None of this touches the report. It only changes what the clipboard receives.
 */

/** Blanks are anchored to the agent they sit below, never to a row index. */
export type CopyLayout = {
  /** agent id -> how many blank lines follow that agent. */
  blanksAfter: Record<string, number>;
  /** Agent ids left out of the copy entirely. */
  hidden: string[];
};

export const EMPTY_LAYOUT: CopyLayout = { blanksAfter: {}, hidden: [] };

export function isEmptyLayout(layout: CopyLayout): boolean {
  return (
    layout.hidden.length === 0 &&
    Object.values(layout.blanksAfter).every((n) => n === 0)
  );
}

/** One line of the outgoing copy — either a real agent row or a spacer. */
export type CopyEntry =
  | { kind: "agent"; row: HoursReportRow }
  | { kind: "blank"; /** id of the agent it trails. */ after: string; index: number };

/**
 * Expand a layout against the rows currently on screen, in their current order. Anchoring
 * to agent id rather than position is what lets the same layout survive a data refresh:
 * an agent whose id is gone simply stops contributing, blanks and all.
 */
export function buildCopyEntries(rows: HoursReportRow[], layout: CopyLayout): CopyEntry[] {
  const hidden = new Set(layout.hidden);
  const entries: CopyEntry[] = [];

  for (const row of rows) {
    if (hidden.has(row.id)) continue;
    entries.push({ kind: "agent", row });
    const blanks = layout.blanksAfter[row.id] || 0;
    for (let i = 0; i < blanks; i++) {
      entries.push({ kind: "blank", after: row.id, index: i });
    }
  }

  return entries;
}

export function addBlankAfter(layout: CopyLayout, agentId: string): CopyLayout {
  return {
    ...layout,
    blanksAfter: { ...layout.blanksAfter, [agentId]: (layout.blanksAfter[agentId] || 0) + 1 },
  };
}

export function removeBlank(layout: CopyLayout, after: string): CopyLayout {
  const next = Math.max(0, (layout.blanksAfter[after] || 0) - 1);
  const blanksAfter = { ...layout.blanksAfter };
  if (next === 0) delete blanksAfter[after];
  else blanksAfter[after] = next;
  return { ...layout, blanksAfter };
}

/**
 * Hiding an agent leaves its blanks in place rather than dropping them with it — the
 * padding was put there to match the sheet, and the sheet doesn't care that the agent
 * above it is no longer being copied.
 */
export function toggleHidden(layout: CopyLayout, agentId: string): CopyLayout {
  const hidden = layout.hidden.includes(agentId)
    ? layout.hidden.filter((id) => id !== agentId)
    : [...layout.hidden, agentId];
  return { ...layout, hidden };
}

/** Blank cells copy as empty lines, so a paste keeps them as empty sheet rows. */
export function entryValue(
  entry: CopyEntry,
  column: "name" | "Tickets" | "Chats" | "Other" | "totalHours",
): string {
  if (entry.kind === "blank") return "";
  const { row } = entry;
  if (column === "name") return row.name;
  if (column === "totalHours") return String(row.totalHours);
  return String(row.hours[column]);
}

export function copyText(
  entries: CopyEntry[],
  column: "name" | "Tickets" | "Chats" | "Other" | "totalHours",
): string {
  return entries.map((entry) => entryValue(entry, column)).join("\n");
}

/**
 * A stable description of "which report is on screen" — the layout is scoped to it, so a
 * different period or a re-sort starts over rather than silently padding a list whose
 * order no longer matches the one the blanks were placed against.
 */
export function viewKey(start: Date, end: Date, sortKey: string): string {
  return `${start.toISOString()}|${end.toISOString()}|${sortKey}`;
}
