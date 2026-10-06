import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUserSettings } from "@/providers/useUserSettings";
import { cn } from "@/lib/utils";
import {
  performanceApi,
  type ExternalAgent,
  type ImportPreview,
  type ImportSource,
  type PreviewRow,
} from "./api";
import { SOURCE_LABELS, int, pct } from "./format";
import { DENSE_TABLE } from "./parts";

const EXPECTED: Record<ImportSource, string> = {
  tickets: "agent (or Ticket Assignee), # Solved Tickets, CSAT, Surveys",
  chats: "agent, Served, CSAT, Surveys",
  screenshares: "agent, Served, CSAT",
  hours: "agent, Chat hours (or Chat Shifts), Ticket hours (or Ticket Shifts)",
};

const SKIP = "__skip";

type Decision = { clerkId: string | null; saveAlias: boolean; matchedBy: string | null };

function valuesText(source: ImportSource, values: PreviewRow["values"]) {
  if (source === "hours") {
    return `chats ${values.chatsHours ?? "—"}h · tickets ${values.ticketsHours ?? "—"}h`;
  }
  const parts = [int(values.count)];
  if ("csat" in values) parts.push(`CSAT ${pct(values.csat)}`);
  if ("surveys" in values) parts.push(`${int(values.surveys)} surveys`);
  return parts.join(" · ");
}

/**
 * Paste → preview → confirm. Exact matches (email, saved alias, the full name as in
 * agendo) are pre-selected; anything else has to be picked, and a picked name can be
 * saved as an alias so next quarter's paste matches by itself. The import replaces the
 * source for the quarter, so the preview names anyone it would drop.
 */
export default function ImportDialog({
  open,
  onOpenChange,
  periodKey,
  periodLabel,
  source,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodKey: string;
  periodLabel: string;
  source: ImportSource;
  onImported: () => void;
}) {
  const { allUsers } = useUserSettings();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Map<number, Decision>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      setPreview(null);
      setDecisions(new Map());
      setError(null);
    }
  }, [open]);

  // People added in Performance without an agendo account are pickable too; once they
  // have an account the backend links them, so only the unlinked ones are listed.
  const [externals, setExternals] = useState<ExternalAgent[]>([]);
  useEffect(() => {
    if (!open) return;
    performanceApi
      .listAgents()
      .then(setExternals)
      .catch(() => setExternals([]));
  }, [open]);

  const users = useMemo(
    () =>
      [
        ...allUsers.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
        ...externals.filter((a) => !a.linkedTo).map((a) => ({ id: a.agentId, name: `${a.name} (no account)` })),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [allUsers, externals],
  );
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await performanceApi.previewImport(periodKey, { source, text });
      setPreview(result);
      setDecisions(
        new Map(
          result.rows.map((row) => [
            row.line,
            {
              clerkId: row.errors.length ? null : row.match.clerkId,
              saveAlias: false,
              matchedBy: row.match.by,
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const decide = (row: PreviewRow, clerkId: string | null) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const auto = row.match.clerkId && clerkId === row.match.clerkId;
      next.set(row.line, {
        clerkId,
        // A person picked by hand is worth remembering under the name the export uses.
        saveAlias: Boolean(clerkId) && !auto,
        matchedBy: auto ? row.match.by : clerkId ? "manual" : null,
      });
      return next;
    });
  };

  const toggleAlias = (line: number, saveAlias: boolean) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const current = next.get(line);
      if (current) next.set(line, { ...current, saveAlias });
      return next;
    });
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const { summary } = await performanceApi.commitImport(periodKey, {
        source,
        text,
        decisions: preview.rows.map((row) => {
          const d = decisions.get(row.line);
          return {
            line: row.line,
            clerkId: d?.clerkId ?? null,
            matchedBy: d?.matchedBy ?? null,
            saveAlias: d?.saveAlias ?? false,
          };
        }),
      });
      toast.success(
        `${SOURCE_LABELS[source]}: ${summary.imported ?? 0} imported` +
          (summary.removed ? `, ${summary.removed} removed` : "") +
          (summary.aliasesSaved ? `, ${summary.aliasesSaved} alias(es) saved` : "") +
          ".",
      );
      onImported();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const chosen = preview ? preview.rows.filter((r) => decisions.get(r.line)?.clerkId) : [];
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const row of preview?.rows ?? []) {
      const id = decisions.get(row.line)?.clerkId;
      if (!id) continue;
      if (seen.has(id)) dupes.add(id);
      seen.set(id, row.line);
    }
    return dupes;
  }, [preview, decisions]);
  const chosenIds = new Set(chosen.map((r) => decisions.get(r.line)?.clerkId));
  const removed = preview ? preview.wouldRemove.filter((w) => !chosenIds.has(w.clerkId)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Import {SOURCE_LABELS[source].toLowerCase()} · {periodLabel}
          </DialogTitle>
          <DialogDescription>
            Copy the per-agent rows from the sheet or export, header row included, and paste them here. Columns
            are found by their header: {EXPECTED[source]}. This replaces any {SOURCE_LABELS[source].toLowerCase()}{" "}
            already imported for {periodLabel}.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={"Agent\tServed\tCSAT\tSurveys\n…"}
          />
        ) : (
          <div className="grid gap-3 text-sm">
            {preview.errors.length > 0 ? (
              <p className="text-destructive">{preview.errors.join("; ")}</p>
            ) : (
              <p className="text-muted-foreground">
                {preview.rows.length} row(s): {chosen.length} will be imported,{" "}
                {preview.rows.length - chosen.length} skipped.
                {preview.skipped.length > 0 &&
                  ` ${preview.skipped.length} line(s) ignored (blank placeholders or totals).`}
              </p>
            )}
            {removed.length > 0 && (
              <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Not in this paste, so their {SOURCE_LABELS[source].toLowerCase()} for {periodLabel} will be removed:{" "}
                {removed.map((r) => r.name ?? r.clerkId).join(", ")}.
              </p>
            )}
            {preview.rows.length > 0 && (
              <Table className={DENSE_TABLE}>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">Line</TableHead>
                    <TableHead>In the paste</TableHead>
                    <TableHead>Values</TableHead>
                    <TableHead className="w-[240px]">agendo user</TableHead>
                    <TableHead title="Remember this name for next time">Alias</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => {
                    const d = decisions.get(row.line);
                    const unresolved = !d?.clerkId;
                    const candidates = row.match.candidates ?? [];
                    const dupe = d?.clerkId ? duplicates.has(d.clerkId) : false;
                    return (
                      <TableRow key={row.line} className={cn(unresolved && "bg-amber-50/60 dark:bg-amber-950/20")}>
                        <TableCell className="tabular-nums text-muted-foreground">{row.line}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.rawName}</div>
                          {row.errors.map((e) => (
                            <div key={e} className="text-destructive">
                              {e}
                            </div>
                          ))}
                          {dupe && <div className="text-destructive">Same person as another line</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{valuesText(source, row.values)}</TableCell>
                        <TableCell>
                          <Select
                            value={d?.clerkId ?? SKIP}
                            disabled={row.errors.length > 0}
                            onValueChange={(v) => decide(row, v === SKIP ? null : v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue>
                                {d?.clerkId ? (
                                  <span>
                                    {nameById.get(d.clerkId) ?? d.clerkId}
                                    {d.matchedBy && d.matchedBy !== "manual" && (
                                      <span className="text-muted-foreground"> · {d.matchedBy}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Skip this line</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SKIP}>Skip this line</SelectItem>
                              {candidates.length > 0 && (
                                <SelectGroup>
                                  <SelectSeparator />
                                  <SelectLabel>Suggested</SelectLabel>
                                  {candidates.map((c) => (
                                    <SelectItem key={`s-${c.clerkId}`} value={c.clerkId}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>Everyone</SelectLabel>
                                {users
                                  .filter((u) => !candidates.some((c) => c.clerkId === u.id))
                                  .map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.name}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {d?.clerkId && d.matchedBy === "manual" && (
                            <Checkbox
                              checked={d.saveAlias}
                              onCheckedChange={(v) => toggleAlias(row.line, v === true)}
                              aria-label="Save this name as an alias"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>
                Back
              </Button>
              <Button
                onClick={commit}
                disabled={busy || preview.errors.length > 0 || duplicates.size > 0 || chosen.length === 0}
              >
                Import {chosen.length} row{chosen.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={runPreview} disabled={busy || !text.trim()}>
                Preview
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
