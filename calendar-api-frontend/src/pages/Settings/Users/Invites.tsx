import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, MailPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUserSettings } from "@/providers/useUserSettings";
import { AREA_LABELS, AreaKey, Permissions } from "@/permissions/permissions";
import { ApiError, Invite, SavedInvite, usersApi } from "./api";
import { LevelPicker, useAreaCopy } from "./LevelPicker";

/**
 * Settings → Users → invites: set someone's access by email before they have an agendo
 * user. Nothing is sent to them — it waits until they first sign in (Clerk's webhook or
 * their first request applies it), or applies straight away if they already have a
 * sign-in. Backend rules: calendar-api-backend/src/permissions/onboarding.js.
 */

/**
 * Create an invite, or edit one (`invite` set; the email is the key, so it's fixed).
 * `onSaved` gets the server's answer; `onAlreadyMember` the Clerk id of the agendo user
 * who already has that email, so the page can open their row instead.
 */
export function InviteDialog({
  open,
  invite,
  onOpenChange,
  onSaved,
  onAlreadyMember,
}: {
  open: boolean;
  invite: Invite | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: SavedInvite) => void;
  onAlreadyMember: (clerkId: string | null) => void;
}) {
  const areas = useAreaCopy();
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  /** Levels the admin picked; an untouched area shows (and sends) the new-user default. */
  const [levels, setLevels] = useState<Partial<Permissions>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(invite?.email ?? "");
    setIsAdmin(invite?.type === "admin");
    setLevels(invite?.permissions ?? {});
  }, [open, invite]);

  const levelFor = (key: AreaKey, fallback?: string) =>
    (levels[key] as string | undefined) ?? fallback ?? "none";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const permissions = Object.fromEntries(
        areas.map((area) => [area.key, levelFor(area.key, area.defaultForNewUsers)]),
      ) as Partial<Permissions>;
      const result = await usersApi.saveInvite({
        email,
        type: isAdmin ? "admin" : "normal",
        permissions,
      });
      onSaved(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.payload && "clerkId" in error.payload) {
        onAlreadyMember((error.payload.clerkId as string | null) ?? null);
        toast.message(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : "Could not save the invite");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{invite ? `Edit invite for ${invite.email}` : "Invite someone"}</DialogTitle>
            <DialogDescription>
              Set their access now. Nothing is sent to them — they get it the first time
              they sign in to agendo, or right away if they already have.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Work email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus={!invite}
              disabled={!!invite || saving}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@duda.co"
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-sm font-semibold">Admin</span>
              <span className="text-xs text-muted-foreground">
                Everything in every area, plus managing users and their access.
              </span>
            </div>
            <Switch
              checked={isAdmin}
              disabled={saving}
              onCheckedChange={setIsAdmin}
              aria-label="Admin"
            />
          </div>

          <div className="grid gap-4">
            {areas.map((area) => {
              const current = levelFor(area.key, area.defaultForNewUsers);
              const description = area.levels.find((level) => level.key === current)?.description;
              return (
                <div key={area.key} className="grid gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{area.label}</span>
                    <LevelPicker
                      area={area}
                      value={current}
                      onChange={(level) => setLevels((prev) => ({ ...prev, [area.key]: level }))}
                      disabled={saving}
                      dimmed={isAdmin}
                    />
                  </div>
                  {description && (
                    <p className="text-xs text-muted-foreground">
                      {isAdmin ? `If admin is removed: ${current} — ${description}` : description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !email.trim()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {invite ? "Save invite" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Scheduling edit · Bug tracking view · …", or "Admin". */
function describeAccess(invite: Invite) {
  if (invite.type === "admin") return "Admin — everything";
  return (Object.keys(AREA_LABELS) as AreaKey[])
    .map((key) => `${AREA_LABELS[key]} ${invite.permissions[key] ?? "none"}`)
    .join(" · ");
}

/** The pending invites, with edit and revoke. Renders nothing when there are none. */
export function PendingInvites({
  invites,
  onEdit,
  onRevoked,
}: {
  invites: Invite[];
  onEdit: (invite: Invite) => void;
  onRevoked: (inviteId: string) => void;
}) {
  const { allUsers } = useUserSettings();
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const adminName = (clerkId: string | null) => {
    const admin = clerkId ? allUsers.find((user) => user.id === clerkId) : undefined;
    return admin ? `${admin.firstName} ${admin.lastName}` : "an admin";
  };

  const revoke = async (invite: Invite) => {
    setBusyId(invite.id);
    try {
      await usersApi.revokeInvite(invite.id);
      onRevoked(invite.id);
      toast.success(`Invite for ${invite.email} revoked.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the invite");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="h-4 w-4 text-muted-foreground" />
          Pending invites
        </CardTitle>
        <CardDescription>
          Access waiting for people who haven’t signed in to agendo yet. It applies the first
          time they do.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{invite.email}</div>
                <div className="truncate text-xs text-muted-foreground">{describeAccess(invite)}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  Invited by {adminName(invite.invitedBy)} · {format(new Date(invite.invitedAt), "MMM d, yyyy")}
                  {invite.updatedAt && invite.updatedBy && (
                    <> · edited by {adminName(invite.updatedBy)} {format(new Date(invite.updatedAt), "MMM d")}</>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === invite.id}
                  onClick={() => onEdit(invite)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === invite.id}
                  onClick={() => setRevoking(invite)}
                  className="text-destructive hover:text-destructive"
                >
                  {busyId === invite.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the invite for {revoking?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              If they sign in later they’ll get the defaults for new users — or nothing, if
              their sign-in is more than a day old.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = revoking;
                setRevoking(null);
                if (target) void revoke(target);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
