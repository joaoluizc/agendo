import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/providers/useUserSettings";
import TimezoneCombobox, {
  offsetLabel,
  timezoneLabel,
} from "@/components/TimezoneCombobox";

/**
 * Settings → Your timezone.
 *
 * Why this exists at all: `User.timezone` has been on the schema for a long time and
 * nothing ever wrote it. Every screen reads the *browser's* zone instead, which works
 * perfectly until something without a browser needs the answer — agendo's MCP server has
 * only the stored field to go on, so it labelled every time "UTC" for all 18 users
 * because that is genuinely what it had been told.
 *
 * So the detected zone is offered as a one-click default, and the answer is **stored**.
 * Inference is precisely why the field was empty; defaulting to the detection without
 * saving it would reproduce the bug with a nicer interface.
 */
export default function TimezoneCard() {
  const { timezone, setTimezone } = useUserSettings();
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [draft, setDraft] = useState(timezone || detected || "UTC");
  const [saving, setSaving] = useState(false);

  const dirty = draft !== timezone;
  const unset = !timezone || timezone === "UTC";
  const detectedDiffers = detected && detected !== draft;

  const save = async (zone: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/me/timezone", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: zone }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || `Request failed (${res.status})`);
      }
      setTimezone(payload.timezone);
      setDraft(payload.timezone);
      toast.success(`Timezone saved — ${timezoneLabel(payload.timezone)}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your timezone"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="timezone">
      <CardHeader>
        <CardTitle>Your timezone</CardTitle>
        <CardDescription>
          Used when something outside the browser has to render your schedule —
          agendo's MCP server, for one. Shift times themselves are stored as
          absolute instants, so changing this never moves a shift; it only
          changes how times are shown to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="timezone-picker" className="text-sm font-medium">
            Timezone
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <TimezoneCombobox
              id="timezone-picker"
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
            <Button
              onClick={() => save(draft)}
              disabled={saving || !dirty}
              size="sm"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently saved:{" "}
            <span className="font-medium">
              {timezone ? timezoneLabel(timezone) : "not set"}
            </span>
            {timezone ? ` (${offsetLabel(timezone)})` : null}
          </p>
        </div>

        {unset && detectedDiffers ? (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <p>
              Your browser says you are in{" "}
              <span className="font-medium">{timezoneLabel(detected)}</span> (
              {offsetLabel(detected)}), but agendo has you on UTC.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={saving}
              onClick={() => {
                setDraft(detected);
                save(detected);
              }}
            >
              Use {timezoneLabel(detected)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
