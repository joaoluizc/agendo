import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import {
  AREA_KEYS,
  AREA_LABELS,
  AREA_LEVELS,
  AreaKey,
  Permissions,
  normalizePermissions,
} from "@/permissions/permissions";
import type { UserSafeInfo } from "@/types/userTypes";
import { PermissionRegistry, usersApi } from "./api";

type AreaCopy = { key: AreaKey; label: string; levels: { key: string; description: string }[] };

/** The registry's copy, fetched once per page load; the built-in levels until it arrives. */
let registryRequest: Promise<PermissionRegistry> | null = null;
const fallbackAreas: AreaCopy[] = AREA_KEYS.map((key) => ({
  key,
  label: AREA_LABELS[key],
  levels: AREA_LEVELS[key].map((level) => ({ key: level, description: "" })),
}));

function useAreaCopy(): AreaCopy[] {
  const [areas, setAreas] = useState<AreaCopy[]>(fallbackAreas);
  useEffect(() => {
    registryRequest ??= usersApi.getPermissionRegistry();
    let alive = true;
    registryRequest
      .then((registry) => {
        // Only areas this frontend knows how to gate; the server may be a deploy ahead.
        const known = registry.areas.filter((area) => AREA_KEYS.includes(area.key));
        if (alive && known.length) setAreas(known);
      })
      .catch(() => {
        registryRequest = null; // fall back to the built-in levels; retry next time
      });
    return () => {
      alive = false;
    };
  }, []);
  return areas;
}

/**
 * Settings → Users → an agent's access: the admin flag and one level per area.
 *
 * Every change applies immediately — one click, one save, one audit record — rather than
 * through a draft and a Save button; access is changed rarely and should never sit
 * half-edited behind a navigation. Turning admin on or off asks first.
 *
 * The server is the control (`PUT /user/:clerkId/permissions`, admin-only): it refuses
 * changing your own access and demoting the last admin, which this card also greys out.
 */
export default function PermissionsCard({ user }: { user: UserSafeInfo }) {
  const { allUsers, setAllUsers } = useUserSettings();
  const { user: me } = useUser();
  const areas = useAreaCopy();
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmAdmin, setConfirmAdmin] = useState<boolean | null>(null);

  const isSelf = me?.id === user.id;
  const isAdmin = user.type === "admin";
  const adminCount = allUsers.filter((candidate) => candidate.type === "admin").length;
  const isLastAdmin = isAdmin && adminCount <= 1;
  const stored: Permissions = normalizePermissions(user.permissions);
  const locked = isSelf || saving !== null;

  const apply = async (
    body: { type?: "admin" | "normal"; permissions?: Partial<Permissions> },
    savingKey: string,
    describe: string,
  ) => {
    setSaving(savingKey);
    try {
      const result = await usersApi.setAccess(user.id, body);
      setAllUsers(
        allUsers.map((candidate) =>
          candidate.id === user.id
            ? {
                ...candidate,
                type: result.type,
                permissions: result.permissions,
                permissionsUpdatedAt: result.permissionsUpdatedAt,
                permissionsUpdatedBy: result.permissionsUpdatedBy,
              }
            : candidate,
        ),
      );
      toast.success(`${user.firstName}: ${describe}`, {
        description:
          "They'll see it on their next page load. Using agendo in Claude? They may need to restart Claude Desktop or refresh its tools.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change access");
    } finally {
      setSaving(null);
    }
  };

  const setLevel = (area: AreaKey, level: string) => {
    if (stored[area] === level) return;
    void apply(
      { permissions: { [area]: level } as Partial<Permissions> },
      area,
      `${AREA_LABELS[area]} set to ${level}`,
    );
  };

  const changedBy = (() => {
    const by = user.permissionsUpdatedBy;
    if (!by) return null;
    if (by === "migration") return "the permissions migration";
    if (by === "provisioning") return "the defaults for new users";
    const admin = allUsers.find((candidate) => candidate.id === by);
    return admin ? `${admin.firstName} ${admin.lastName}` : "an admin";
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
        <CardDescription>
          What {user.firstName} can see and do in agendo. Changes apply right away and are
          recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {isSelf && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            You can’t change your own access — ask another admin.
          </p>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-0.5">
            <span className="text-sm font-semibold">Admin</span>
            <span className="text-xs text-muted-foreground">
              {isLastAdmin
                ? "The only admin — make someone else an admin first."
                : "Everything in every area, plus managing users and their access."}
            </span>
          </div>
          <Switch
            checked={isAdmin}
            disabled={locked || isLastAdmin}
            onCheckedChange={(checked) => setConfirmAdmin(checked)}
            aria-label="Admin"
          />
        </div>

        <div className="grid gap-4">
          {areas.map((area) => {
            const current = stored[area.key];
            const description = area.levels.find((level) => level.key === current)?.description;
            return (
              <div key={area.key} className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{area.label}</span>
                  <div
                    role="radiogroup"
                    aria-label={area.label}
                    className={cn(
                      "inline-flex overflow-hidden rounded-md border border-border",
                      isAdmin && "opacity-50",
                    )}
                  >
                    {area.levels.map((level) => {
                      const active = level.key === current;
                      return (
                        <button
                          key={level.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={locked || isAdmin}
                          onClick={() => setLevel(area.key, level.key)}
                          title={level.description || undefined}
                          className={cn(
                            "px-3 py-1 text-xs font-medium capitalize transition-colors [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground",
                            "disabled:cursor-not-allowed",
                          )}
                        >
                          {saving === area.key && active ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            level.key
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? `Full access as an admin. If admin is removed: ${current}${description ? ` — ${description}` : ""}.`
                    : description}
                </p>
              </div>
            );
          })}
        </div>

        {(user.permissionsUpdatedAt || changedBy) && (
          <p className="text-xs text-muted-foreground">
            Last changed
            {changedBy && <> by {changedBy}</>}
            {user.permissionsUpdatedAt && (
              <> · {format(new Date(user.permissionsUpdatedAt), "MMM d, yyyy")}</>
            )}
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmAdmin !== null} onOpenChange={(open) => !open && setConfirmAdmin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAdmin ? `Make ${user.firstName} an admin?` : `Remove ${user.firstName}'s admin access?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAdmin
                ? "Admins can do everything in agendo, including changing anyone's access."
                : `They keep the levels below: ${AREA_KEYS.map((key) => `${AREA_LABELS[key]} ${stored[key]}`).join(", ")}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const makeAdmin = confirmAdmin === true;
                setConfirmAdmin(null);
                void apply(
                  { type: makeAdmin ? "admin" : "normal" },
                  "admin",
                  makeAdmin ? "now an admin" : "no longer an admin",
                );
              }}
            >
              {confirmAdmin ? "Make admin" : "Remove admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
