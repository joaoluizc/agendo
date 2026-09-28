import { useMemo } from "react";
import { Check, Lock, Minus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUserSettings } from "@/providers/useUserSettings";
import { UserSafeInfo } from "@/types/userTypes";
import { useAgentSyncRules } from "@/components/ScheduleCalendar/shift-dialogs/useAgentSyncRules";
import { cn } from "@/lib/utils";

/**
 * Read-only: which positions reach this agent's Google Calendar.
 *
 * The verdicts come from `/api/position/sync-rules` — the same admin-scoped read the edit
 * dialog uses, already resolved across the Sling/Mongo position id spaces on the backend.
 * `Position.sync` from `/api/position/all` can't answer this: it's the *viewer's* choice,
 * not the agent's. Nothing here is editable because agents choose these themselves, in
 * their own Settings → Synced shifts; admins only force positions on (enforced sync).
 */
export default function SyncedPositionsCard({ user }: { user: UserSafeInfo }) {
  const { allPositions } = useUserSettings();
  const { rules, status } = useAgentSyncRules(user.id);

  const rows = useMemo(() => {
    if (!rules) return [];
    return allPositions
      .map((position) => ({ position, rule: rules.get(String(position._id)) }))
      .filter((row) => row.rule)
      .sort(
        (a, b) =>
          Number(b.rule!.willSync) - Number(a.rule!.willSync) ||
          a.position.name.localeCompare(b.position.name)
      );
  }, [allPositions, rules]);

  const syncing = rows.filter((row) => row.rule!.willSync).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Synced shifts</CardTitle>
        <CardDescription>
          Which of {user.firstName}’s shifts reach their Google Calendar, once
          published. {user.firstName} chooses these in their own Settings;
          enforced positions always sync.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "loading" && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {status === "error" && (
          <p className="text-sm text-muted-foreground">
            Couldn’t load {user.firstName}’s sync settings.
          </p>
        )}
        {status === "ready" && (
          <>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {syncing} of {rows.length} positions sync
            </p>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {rows.map(({ position, rule }) => (
                <li
                  key={position._id}
                  className="flex items-center gap-2.5 border-b border-border-subtle py-1.5 text-[13px]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: position.color }}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      !rule!.willSync && "text-muted-foreground"
                    )}
                  >
                    {position.name}
                  </span>
                  {rule!.enforced ? (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-foreground"
                      title="An admin requires this position to sync for everyone"
                    >
                      <Lock className="h-3 w-3" /> Always syncs
                    </span>
                  ) : rule!.willSync ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-foreground">
                      <Check className="h-3.5 w-3.5" /> Syncs
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                      <Minus className="h-3.5 w-3.5" /> Doesn’t sync
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
