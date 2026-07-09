import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, mrrOverrideApi } from "./api";
import { MrrOverride } from "./types";

/**
 * Add / remove MRR resolution overrides: some enterprise clients file Zendesk tickets from
 * emails that aren't Duda accounts (e.g. 1&1/IONOS's hosting-jira@1und1.de), so their bugs
 * resolve to $0. An override maps the ticket's Zendesk organization (preferred — one row
 * covers every requester the client uses) or an exact requester email to the Duda account
 * whose MRR should be counted instead. Overrides win over requester-email resolution.
 *
 * The list is loaded on open (it's tiny and rarely changes — no need to keep it in page
 * state like bug statuses, which drive the always-visible dropdown).
 */
export function ManageMrrOverridesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [overrides, setOverrides] = useState<MrrOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [matchType, setMatchType] = useState<"org" | "email">("org");
  const [matchValue, setMatchValue] = useState("");
  const [label, setLabel] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setOverrides(await mrrOverrideApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load overrides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const add = async () => {
    if (!matchValue.trim() || !accountEmail.trim()) return;
    setAdding(true);
    try {
      await mrrOverrideApi.create({
        matchType,
        matchValue: matchValue.trim(),
        label: label.trim(),
        accountEmail: accountEmail.trim(),
      });
      setMatchValue("");
      setLabel("");
      setAccountEmail("");
      await reload();
      toast.success("Override added — it applies on the next MRR refresh.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not add override";
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await mrrOverrideApi.remove(id);
      await reload();
      toast.success("Override deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete override");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        <DialogHeader>
          <DialogTitle>Manage MRR overrides</DialogTitle>
          <DialogDescription>
            For clients whose Zendesk tickets come from emails that aren't Duda accounts. Map
            their Zendesk organization (preferred) or an exact requester email to the Duda
            account whose MRR should be counted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          ) : (
            overrides.map((o) => (
              <div
                key={o._id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{o.label || o.matchValue}</span>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.matchType === "org" ? `Zendesk org ${o.matchValue}` : o.matchValue} →{" "}
                    {o.accountEmail}
                  </p>
                </div>
                <button
                  onClick={() => remove(o._id)}
                  disabled={busyId === o._id}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                  aria-label={`Delete override ${o.label || o.matchValue}`}
                  title="Delete override"
                >
                  {busyId === o._id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as "org" | "email")}
              aria-label="Match type"
            >
              <option value="org">Zendesk org id</option>
              <option value="email">Requester email</option>
            </select>
            <Input
              placeholder={matchType === "org" ? "e.g. 16877541108" : "e.g. hosting-jira@1und1.de"}
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Label (e.g. 1&1 / IONOS)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Input
              placeholder="Duda account email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={add}
              disabled={adding || !matchValue.trim() || !accountEmail.trim()}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
