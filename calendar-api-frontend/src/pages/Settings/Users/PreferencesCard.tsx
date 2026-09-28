import { Suspense, lazy } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserSafeInfo } from "@/types/userTypes";
import { useUserSettings } from "@/providers/useUserSettings";
import { useTimeFormat } from "@/utils/timeFormat";

// Loaded on first use of this card only, so Tiptap stays out of the bundle every other
// page (and every non-admin) downloads. See PreferencesEditor.
const PreferencesEditor = lazy(() => import("./PreferencesEditor"));

type PreferencesCardProps = {
  user: UserSafeInfo;
  /** Bumped by the parent to reload the editor from `user.preferences` (Reset, saves). */
  editorKey: string;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (html: string) => void;
  onReset: () => void;
  onSave: () => void;
};

/**
 * One agent's preferences, editable. The draft lives in the parent (Users), because that is
 * where the unsaved-changes guard has to see it; this card only renders and reports edits.
 */
export default function PreferencesCard({
  user,
  editorKey,
  isDirty,
  isSaving,
  onChange,
  onReset,
  onSave,
}: PreferencesCardProps) {
  const { allUsers } = useUserSettings();
  const { clock } = useTimeFormat();
  const editor = user.preferencesUpdatedBy
    ? allUsers.find((candidate) => candidate.id === user.preferencesUpdatedBy)
    : undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          How {user.firstName} likes to be scheduled. Only admins can see this — it
          shows when you hover {user.firstName}’s name on the schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={
            <div className="flex min-h-[220px] items-center justify-center rounded-md border border-input text-sm text-muted-foreground">
              Loading editor…
            </div>
          }
        >
          <PreferencesEditor
            key={editorKey}
            initialHtml={user.preferences ?? ""}
            onChange={onChange}
            disabled={isSaving}
          />
        </Suspense>
        {user.preferencesUpdatedAt && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Last edited{editor ? ` by ${editor.firstName} ${editor.lastName}` : ""} ·{" "}
            {clock.dateTime(user.preferencesUpdatedAt, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </CardContent>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-band px-[22px] py-3.5">
        <span className="text-[12px] text-muted-foreground">
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onReset}
            disabled={!isDirty || isSaving}
          >
            Reset
          </Button>
          <Button onClick={onSave} disabled={!isDirty || isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
