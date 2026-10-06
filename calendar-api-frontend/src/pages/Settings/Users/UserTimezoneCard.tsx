import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TimezoneCombobox, {
  offsetLabel,
  timezoneLabel,
} from "@/components/TimezoneCombobox";
import { useUserSettings } from "@/providers/useUserSettings";
import type { UserSafeInfo } from "@/types/userTypes";
import { usersApi } from "./api";

/**
 * Settings → Users → an agent's timezone.
 *
 * The self-service card in General covers the common case. This exists because the team
 * spans several countries and people do not reliably keep their own profile current — an
 * admin has to be able to correct a wrong zone without chasing the person, which is the
 * same reason the preferences card next to it is admin-editable.
 *
 * Gated by `adminOnly` on `PUT /user/:clerkId/timezone`, server-side. This card not
 * rendering is a convenience, not the control.
 */
export default function UserTimezoneCard({ user }: { user: UserSafeInfo }) {
  const { allUsers, setAllUsers } = useUserSettings();
  const saved = user.timezone || "UTC";
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);

  // Reset when the admin selects a different agent, or the previous one's zone would
  // linger in the picker and look like this agent's.
  useEffect(() => setDraft(saved), [user.id, saved]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await usersApi.setTimezone(user.id, draft);
      setAllUsers(
        allUsers.map((candidate) =>
          candidate.id === user.id
            ? { ...candidate, timezone: result.timezone }
            : candidate
        )
      );
      toast.success(
        `${user.firstName}'s timezone set to ${timezoneLabel(result.timezone)}`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the timezone"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timezone</CardTitle>
        <CardDescription>
          How times are rendered for {user.firstName} outside the browser — in
          agendo's MCP server, for one. Shifts are stored as absolute instants,
          so this never moves a shift.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TimezoneCombobox
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />
          <Button
            size="sm"
            onClick={save}
            disabled={saving || draft === saved}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Currently <span className="font-medium">{timezoneLabel(saved)}</span>{" "}
          ({offsetLabel(saved)})
          {saved === "UTC" ? " — the default, likely never set" : null}
        </p>
      </CardContent>
    </Card>
  );
}
