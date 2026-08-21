import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { classifyIssueRef } from "./constants";

/**
 * Asks for the Jira ticket before creating a row. A row with no Jira key can't pull any of
 * its fields (description, client, priority, squad, sprint, status all come from Jira), so
 * an empty one is dead weight that also can't be de-duplicated — hence nothing is persisted
 * until we have a key here.
 *
 * Accepts the three shapes people actually paste: a browse URL, a bare key, or just the
 * number half of one. The resolved key is echoed live underneath the input so an assumed
 * project prefix is visible *before* the row is created, never after.
 */
export function AddIssueDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (raw: string) => void;
}) {
  const [value, setValue] = useState("");

  // Start clean each time it opens, so a previous cancelled attempt isn't still sitting there.
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const ref = classifyIssueRef(value);
  const canSubmit = !!ref.key && !busy;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="z-[70] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track a Jira bug</DialogTitle>
          <DialogDescription>
            Paste the Jira link, or type the key ({ISSUE_KEY_EXAMPLE}) or just its number. The
            row is created with the link already attached and its details pulled from Jira.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            autoFocus
            value={value}
            placeholder={`${ISSUE_KEY_EXAMPLE} — or a full Jira URL`}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) onSubmit(value);
            }}
          />
          <RefHint value={value} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => onSubmit(value)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add {ref.key || "row"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ISSUE_KEY_EXAMPLE = "SUP-7174";

/** Live echo of what we parsed, so an assumed prefix is never a surprise. */
function RefHint({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const ref = classifyIssueRef(trimmed);
  if (!ref.key) {
    return (
      <p className="text-xs text-muted-foreground">
        Not a Jira ticket yet — paste a link, or type a key like {ISSUE_KEY_EXAMPLE}.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {ref.prefixAssumed ? (
        <>
          Will track <span className="font-medium text-foreground">{ref.key}</span> — assuming the{" "}
          {ref.key.split("-")[0]} project, since you entered only a number.
        </>
      ) : (
        <>
          Will track <span className="font-medium text-foreground">{ref.key}</span>.
        </>
      )}
    </p>
  );
}
