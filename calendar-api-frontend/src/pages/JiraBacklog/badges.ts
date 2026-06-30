import { BadgeKind } from "./types";

/**
 * Tailwind classes for a coloured value pill, or "" when the value shouldn't be badged
 * (e.g. an empty client). Used by the table display cells and the detail panel so the
 * colour language is identical everywhere.
 *
 * - client   → light purple whenever a client is set
 * - priority → Minor blue · Major red · Critical louder red
 * - status   → one hue per triage state
 */
export function badgeClasses(kind: BadgeKind, value: string): string {
  if (!value) return "";
  switch (kind) {
    case "client":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
    case "priority":
      if (value === "Minor") return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
      if (value === "Major") return "bg-red-500/15 text-red-700 dark:text-red-300";
      if (value === "Critical")
        return "bg-red-600/30 text-red-800 ring-1 ring-red-500/40 font-semibold dark:text-red-200";
      return "";
    case "status":
      switch (value) {
        case "Backlog":
          return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
        case "Review with Squad":
          return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
        case "Delayed":
          return "bg-orange-500/20 text-orange-700 dark:text-orange-300";
        case "In a Sprint":
          return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
        case "Possible No-ETA":
          return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
        case "No-ETA":
          return "bg-rose-600/30 text-rose-800 ring-1 ring-rose-500/40 dark:text-rose-200";
        case "Fixed/Closed":
          return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        default:
          return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
      }
  }
}
