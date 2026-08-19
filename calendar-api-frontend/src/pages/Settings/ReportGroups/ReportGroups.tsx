import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUserSettings } from "@/providers/useUserSettings";
import { reportsApi, ReportGroup as ReportGroupData } from "@/pages/Reports/api";

type GroupName = "Tickets" | "Chats";
const GROUP_NAMES: GroupName[] = ["Tickets", "Chats"];

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Searchable add-control for one group: pick a known position name, or type one that
 * isn't in the list (Sling sometimes uses a position name with no matching agendo
 * Position doc). Typing the exact name of something already in the *other* group
 * re-adds it here too — ReportGroups' addToGroup then moves it, since a name can't
 * count toward both.
 */
function GroupPicker({ options, onAdd }: { options: string[]; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const filtered = options.filter(
    (o) => !trimmed || o.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const hasExactMatch = options.some((o) => normalize(o) === normalize(trimmed));

  const commit = (name: string) => {
    onAdd(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-[30px] items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[12px] text-muted-foreground hover:bg-muted"
        >
          <Plus size={13} />
          Add
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] rounded-[10px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a name…"
            value={query}
            onValueChange={setQuery}
            className="text-[13px]"
          />
          <CommandList className="max-h-[224px]">
            {filtered.length === 0 && !trimmed && <CommandEmpty>No positions found.</CommandEmpty>}
            <CommandGroup className="p-1.5">
              {filtered.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => commit(name)}
                  className="rounded-[7px] px-2.5 py-2 text-[12.5px]"
                >
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
            {trimmed && !hasExactMatch && (
              <CommandGroup className="border-t p-1.5">
                <CommandItem
                  value={`__add__${trimmed}`}
                  onSelect={() => commit(trimmed)}
                  className="rounded-[7px] px-2.5 py-2 text-[12.5px] text-primary"
                >
                  Add &quot;{trimmed}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Settings → Report Groups. Admin-only; the parent gates on `type === "admin"` and the
 * API refuses non-admins independently. Deliberately self-contained (own fetch, own
 * Save/Reset) rather than wired into the page-wide unsaved-changes blocker that
 * Coverage Targets uses — this is meant to stay small: two named lists, nothing more.
 */
export default function ReportGroups() {
  const { allPositions } = useUserSettings();
  const [groups, setGroups] = useState<ReportGroupData[]>([]);
  const [originalGroups, setOriginalGroups] = useState<ReportGroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    reportsApi
      .getGroups()
      .then((data) => {
        setGroups(data);
        setOriginalGroups(data);
      })
      .catch((error: unknown) => {
        console.error("Error loading report groups:", error);
        toast.error(error instanceof Error ? error.message : "Failed to load report groups.");
      })
      .finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(groups) !== JSON.stringify(originalGroups);

  const claimedNames = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => g.positionNames.forEach((n) => set.add(normalize(n))));
    return set;
  }, [groups]);

  // Known position names, deduped, minus whatever's already assigned to a group.
  const availableOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    allPositions.forEach((p) => {
      const norm = normalize(p.name);
      if (seen.has(norm) || claimedNames.has(norm)) return;
      seen.add(norm);
      options.push(p.name);
    });
    return options.sort((a, b) => a.localeCompare(b));
  }, [allPositions, claimedNames]);

  const addToGroup = (groupName: GroupName, name: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.name === groupName) {
          if (g.positionNames.some((n) => normalize(n) === normalize(name))) return g;
          return { ...g, positionNames: [...g.positionNames, name] };
        }
        // A name can't count toward both groups — drop it from the other one.
        return {
          ...g,
          positionNames: g.positionNames.filter((n) => normalize(n) !== normalize(name)),
        };
      }),
    );
  };

  const removeFromGroup = (groupName: GroupName, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.name === groupName
          ? { ...g, positionNames: g.positionNames.filter((n) => n !== name) }
          : g,
      ),
    );
  };

  const reset = () => setGroups(originalGroups);

  const save = async () => {
    setIsSaving(true);
    try {
      const saved = await reportsApi.saveGroups(
        groups.map((g) => ({ name: g.name, positionNames: g.positionNames })),
      );
      setGroups(saved);
      setOriginalGroups(saved);
      toast.success("Report groups saved.");
    } catch (error) {
      console.error("Error saving report groups:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save report groups.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="scroll-mt-20 overflow-hidden" id="report-groups">
      <CardHeader>
        <CardTitle>Report Groups</CardTitle>
        <CardDescription>
          The Reports page sums hours into three buckets: Tickets, Chats, and Other. List
          which position/shift names belong to Tickets and Chats below — anything not
          listed counts as Other.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          GROUP_NAMES.map((groupName) => {
            const names = groups.find((g) => g.name === groupName)?.positionNames ?? [];
            return (
              <div key={groupName} className="space-y-2">
                <h3 className="text-sm font-semibold">{groupName}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {names.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[12.5px]"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeFromGroup(groupName, name)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${name}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <GroupPicker
                    options={availableOptions}
                    onAdd={(name) => addToGroup(groupName, name)}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-band px-[22px] py-3.5">
        <span className="text-[12px] text-muted-foreground">
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={reset} disabled={!isDirty || isSaving}>
            Reset
          </Button>
          <Button onClick={save} disabled={!isDirty || isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
