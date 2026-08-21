import { Loader2, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classifyIssueRef } from "./constants";

/**
 * Shown when a search matches no rows. The usual reason a search comes up empty here is that
 * the bug simply isn't tracked yet — and the next thing anyone wants is to add it — so when
 * the query looks like a Jira ticket, offer to create it straight from this state.
 *
 * The offer names the resolved key rather than what was typed, so an assumed project prefix
 * ("7174" -> SUP-7174) is visible before anything is created.
 */
export function EmptySearchState({
  query,
  canEdit,
  busy,
  onCreate,
}: {
  query: string;
  canEdit: boolean;
  busy: boolean;
  onCreate: (raw: string) => void;
}) {
  const trimmed = query.trim();
  const ref = classifyIssueRef(trimmed);
  const offerCreate = canEdit && !!ref.key;

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">No bugs match “{trimmed}”.</p>
        {offerCreate ? (
          <p className="text-sm text-muted-foreground">
            {ref.prefixAssumed
              ? `That looks like issue number ${trimmed} — ${ref.key} isn't on the backlog yet.`
              : `${ref.key} isn't on the backlog yet.`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Searching a Jira link, a key like SUP-7174, or just its number will offer to add it.
          </p>
        )}
      </div>

      {offerCreate && (
        <Button size="sm" disabled={busy} onClick={() => onCreate(trimmed)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Track {ref.key}
        </Button>
      )}
    </div>
  );
}
