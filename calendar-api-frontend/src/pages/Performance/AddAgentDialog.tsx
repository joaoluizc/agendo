import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { performanceApi, REGIONS, type Region, type RoleConfig } from "./api";

const NONE = "__none";

/**
 * Add someone who has no agendo account (a billing specialist who never takes shifts,
 * say). They exist only in Performance until a user with the same email signs in; from
 * then on everything recorded for them is read as that user's. Nothing is created in
 * agendo's own users.
 */
export default function AddAgentDialog({
  open,
  onOpenChange,
  periodKey,
  periodLabel,
  roles,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodKey: string;
  periodLabel: string;
  roles: Record<string, RoleConfig>;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const [role, setRole] = useState("regular");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setRegion(null);
      setRole("regular");
    }
  }, [open]);

  const add = async () => {
    setBusy(true);
    try {
      await performanceApi.createAgent({ name, email, region, periodKey, role });
      toast.success(`${name} added to ${periodLabel}.`);
      onAdded();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the agent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add someone without an agendo account</DialogTitle>
          <DialogDescription>
            They can be matched in imports and scored right away. When someone signs in to agendo with this email,
            everything recorded here moves to their account automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="agent-name">Name, as in the exports</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agent-email">Work email</Label>
            <Input id="agent-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Region</Label>
              <Select value={region ?? NONE} onValueChange={(v) => setRegion(v === NONE ? null : (v as Region))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Role in {periodLabel}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roles).map(([key, r]) => (
                    <SelectItem key={key} value={key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={add} disabled={busy || !name.trim() || !email.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
