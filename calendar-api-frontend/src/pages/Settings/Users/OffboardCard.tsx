import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Loader2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUserSettings } from "@/providers/useUserSettings";
import type { UserSafeInfo } from "@/types/userTypes";
import { OffboardResult, usersApi } from "./api";
import CollapsibleCard from "./CollapsibleCard";

/**
 * Settings → Users → offboard a departing teammate: delete them from agendo and from
 * Clerk in one step.
 *
 * Deleting the agendo user is the access kill switch — both the REST API and the MCP
 * server fail closed without one — so this is the whole of offboarding, not a tidy-up
 * after it. See docs/knowledge/offboarding.md.
 *
 * It is irreversible and it reaches an external system, so the confirmation asks for the
 * person's full name typed out rather than a second click: a button two clicks away from
 * the one that sets a timezone is a button someone will eventually hit on the wrong agent.
 * The dialog lists exactly what happens to their data first — the schedule consequence
 * (future shifts cancelled, past kept) is the part that is not obvious from "delete user".
 *
 * The server is the control (`DELETE /user/:clerkId`, admin-only): it refuses offboarding
 * yourself and the last admin, which this card also disables with the reason shown.
 */
export default function OffboardCard({
  user,
  onOffboarded,
}: {
  user: UserSafeInfo;
  /** Called once access is cut, with the report — including a partial failure. */
  onOffboarded: (result: OffboardResult) => void;
}) {
  const { allUsers } = useUserSettings();
  const { user: me } = useUser();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const isSelf = me?.id === user.id;
  const isLastAdmin =
    user.type === "admin" &&
    allUsers.filter((candidate) => candidate.type === "admin").length <= 1;
  const blockedReason = isSelf
    ? "You can’t offboard yourself — ask another admin."
    : isLastAdmin
      ? "The only admin — make someone else an admin first."
      : null;

  // Forgiving about case and stray spaces, strict about who: the point is to make you
  // read the name, not to test your typing.
  const confirmed = typed.trim().toLowerCase() === fullName.toLowerCase();

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  const offboard = async () => {
    setWorking(true);
    try {
      const result = await usersApi.offboard(user.id);
      close();
      onOffboarded(result);
    } catch (error) {
      // A throw here means access was NOT cut — the server refused, or the agendo user
      // itself could not be deleted. Nothing changed, so stay on the dialog.
      toast.error(
        error instanceof Error ? error.message : "Could not offboard this person"
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <CollapsibleCard
        className="border-destructive/40"
        title="Offboard"
        titleClassName="text-destructive"
        description={<>Remove {user.firstName} from agendo and delete their login.</>}
      >
        <CardContent className="grid gap-4">
          {/* The consequences, grouped in their own panel so the card reads as a summary
              with an action rather than a wall of prose. Real list markers, not a typed
              "·" — that rendered as a stray speck a third the size of a bullet. */}
          <ul className="grid list-disc gap-1.5 rounded-md bg-muted/50 py-3 pl-9 pr-4 text-sm text-muted-foreground marker:text-muted-foreground/70">
            <li>Their agendo account and their Clerk login are deleted.</li>
            <li>
              <span className="font-medium text-foreground">
                Shifts from today onwards are cancelled.
              </span>{" "}
              Past shifts are kept.
            </li>
            <li>They are removed from every location they were assigned to.</li>
            <li>
              Their Google Calendar is left alone. To clear it, unpublish their future
              shifts first, then offboard.
            </li>
          </ul>
          {blockedReason ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {blockedReason}
            </p>
          ) : (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-1.5"
              >
                <UserMinus className="h-4 w-4" />
                Offboard {user.firstName}
              </Button>
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offboard {fullName}?</DialogTitle>
            <DialogDescription>
              This deletes their agendo account and their login, and cancels their shifts
              from today onwards. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="offboard-confirm">
              Type <span className="font-semibold text-foreground">{fullName}</span> to
              confirm
            </Label>
            <Input
              id="offboard-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && confirmed && !working) void offboard();
              }}
              placeholder={fullName}
              autoComplete="off"
              disabled={working}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void offboard()}
              disabled={!confirmed || working}
              className="gap-1.5"
            >
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {working ? "Offboarding…" : "Offboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
