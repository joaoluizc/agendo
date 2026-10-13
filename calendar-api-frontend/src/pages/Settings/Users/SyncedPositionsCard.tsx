import { useMemo, useState } from "react";
import { Check, ChevronDown, Lock, Minus } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { useUserSettings } from "@/providers/useUserSettings";
import { Position, PositionSyncRule } from "@/types/positionTypes";
import { UserSafeInfo } from "@/types/userTypes";
import { useAgentSyncRules } from "@/components/ScheduleCalendar/shift-dialogs/useAgentSyncRules";
import { cn } from "@/lib/utils";
import CollapsibleCard from "./CollapsibleCard";

type Row = { position: Position; rule: PositionSyncRule };

/**
 * Read-only: which positions reach this agent's Google Calendar.
 *
 * The verdicts come from `/api/position/sync-rules` — the same admin-scoped read the edit
 * dialog uses, already resolved across the Sling/Mongo position id spaces on the backend.
 * `Position.sync` from `/api/position/all` can't answer this: it's the *viewer's* choice,
 * not the agent's. Nothing here is editable because agents choose these themselves, in
 * their own Settings → Synced shifts; admins only force positions on (enforced sync).
 *
 * Most agents sync a handful of positions out of dozens, so what syncs is listed first
 * (enforced, then chosen) and the long "doesn't sync" tail folds away under its own toggle.
 */
export default function SyncedPositionsCard({ user }: { user: UserSafeInfo }) {
  const { allPositions } = useUserSettings();
  const { rules, status } = useAgentSyncRules(user.id);
  const [showNotSyncing, setShowNotSyncing] = useState(false);

  const { syncing, notSyncing } = useMemo(() => {
    const rows: Row[] = rules
      ? allPositions.flatMap((position) => {
          const rule = rules.get(String(position._id));
          return rule ? [{ position, rule }] : [];
        })
      : [];
    const byName = (a: Row, b: Row) => a.position.name.localeCompare(b.position.name);
    return {
      syncing: rows
        .filter((row) => row.rule.willSync)
        .sort((a, b) => Number(b.rule.enforced) - Number(a.rule.enforced) || byName(a, b)),
      notSyncing: rows.filter((row) => !row.rule.willSync).sort(byName),
    };
  }, [allPositions, rules]);

  const total = syncing.length + notSyncing.length;

  return (
    <CollapsibleCard
      title="Synced shifts"
      description={
        <>
          Which of {user.firstName}’s shifts reach their Google Calendar, once
          published. {user.firstName} chooses these in their own Settings;
          enforced positions always sync.
        </>
      }
      summary={
        status === "ready" ? `${syncing.length} of ${total} sync` : undefined
      }
    >
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
            {syncing.length > 0 ? (
              <>
                <p className="mb-3 text-[12px] text-muted-foreground">
                  {syncing.length} of {total} positions sync
                </p>
                <PositionList rows={syncing} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                None of {user.firstName}’s shifts sync to Google Calendar.
              </p>
            )}
            {notSyncing.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowNotSyncing((current) => !current)}
                  aria-expanded={showNotSyncing}
                  className="group flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      !showNotSyncing && "-rotate-90"
                    )}
                  />
                  Doesn’t sync ({notSyncing.length})
                </button>
                {showNotSyncing && (
                  <PositionList rows={notSyncing} className="mt-1" />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </CollapsibleCard>
  );
}

function PositionList({ rows, className }: { rows: Row[]; className?: string }) {
  return (
    <ul className={cn("grid gap-x-6 sm:grid-cols-2", className)}>
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
              !rule.willSync && "text-muted-foreground"
            )}
          >
            {position.name}
          </span>
          {rule.enforced ? (
            <span
              className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-foreground"
              title="An admin requires this position to sync for everyone"
            >
              <Lock className="h-3 w-3" /> Always syncs
            </span>
          ) : rule.willSync ? (
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
  );
}
