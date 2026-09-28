import { useEffect, useMemo, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import { Search, Users as UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ProceedWithUnsavedChanges from "@/components/modals/ProceedWithUnsavedChanges";
import {
  PreferencesIcon,
  hasPreferences,
} from "@/components/UserPreferences/PreferencesContent";
import { useUserSettings } from "@/providers/useUserSettings";
import { UserSafeInfo } from "@/types/userTypes";
import { cn } from "@/lib/utils";
import PreferencesCard from "./PreferencesCard";
import SyncedPositionsCard from "./SyncedPositionsCard";
import { usersApi } from "./api";
import { usePageTitle } from "./use-page-title";

const initials = (user: UserSafeInfo) =>
  `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`;

/**
 * Settings → Users. Admin-only (the route sits under AdminRoute; the write endpoint is
 * admin-gated on its own). A page of its own rather than another card on General, which
 * is long enough already; SettingsLayout supplies the frame and the shared sidebar.
 *
 * Pick an agent on the left; the right side holds their manager-only preferences and a
 * read-only view of what syncs to their calendar. The pick lives in `?user=<clerkId>`, so
 * a refresh keeps it and the schedule's hover card can link straight to an agent.
 *
 * The roster is `allUsers` from the settings provider — its admin shape already carries
 * `preferences` — and a save is mirrored back into it, so the schedule's hover cards show
 * the new note without refetching.
 */
export default function Users() {
  usePageTitle("Users");
  const {
    allUsers,
    setAllUsers,
    setUnsavedChangesAlertOpen,
  } = useUserSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("user");
  const [query, setQuery] = useState("");

  /** The edited HTML, or null while the note is untouched. */
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Remounts the editor so it reloads from the saved note (Reset, switching agents). */
  const [editorVersion, setEditorVersion] = useState(0);

  const selected = allUsers.find((user) => user.id === selectedId);
  const saved = selected?.preferences ?? "";
  const isDirty = draft !== null && draft !== saved;

  // A different agent starts clean. The guard below has already asked, if it had to.
  useEffect(() => {
    setDraft(null);
  }, [selectedId]);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allUsers;
    return allUsers.filter((user) =>
      `${user.firstName} ${user.lastName} ${user.email ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [allUsers, query]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Unlike Settings, a change of `search` counts too: picking another agent is a
  // navigation here, and it would silently drop the note being written.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const leaving =
      nextLocation.pathname !== currentLocation.pathname ||
      nextLocation.search !== currentLocation.search;
    if (isDirty && leaving) {
      setUnsavedChangesAlertOpen(true);
      return true;
    }
    return false;
  });

  const handleStay = () => {
    setUnsavedChangesAlertOpen(false);
    blocker.reset?.();
  };

  const handleLeave = () => {
    setUnsavedChangesAlertOpen(false);
    blocker.proceed?.();
  };

  const selectUser = (userId: string) => {
    if (userId === selectedId) return;
    setSearchParams({ user: userId });
  };

  const reset = () => {
    setDraft(null);
    setEditorVersion((version) => version + 1);
  };

  /** Resolves true once the note is saved (or there was nothing to save). */
  const save = async (): Promise<boolean> => {
    if (!selected || draft === null) return true;
    setIsSaving(true);
    try {
      const result = await usersApi.savePreferences(selected.id, draft);
      setAllUsers(
        allUsers.map((user) =>
          user.id === selected.id ? { ...user, ...result } : user
        )
      );
      setDraft(null);
      toast.success(`Saved ${selected.firstName}'s preferences.`);
      return true;
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save preferences."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // "Save" in the leave prompt: save, then go where you were going. If the save fails you
  // stay put with the text intact — the error toast says why.
  const handleSaveAndLeave = async () => {
    setUnsavedChangesAlertOpen(false);
    if (await save()) {
      blocker.proceed?.();
    } else {
      blocker.reset?.();
    }
  };

  return (
    <>
      <div className="grid gap-6">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Managers’ notes on each agent, and what syncs to their calendar.
          </p>
        </div>

        {/* Beside the settings sidebar there's only room for the list and the details side
            by side on wide screens; below that the list sits on top. */}
        <div className="grid items-start gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="overflow-hidden xl:sticky xl:top-20">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search agents"
                  className="pl-8"
                  aria-label="Search agents"
                />
              </div>
            </div>
            <ul className="max-h-[calc(100vh-15rem)] overflow-y-auto py-1">
              {visibleUsers.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No agent matches that search.
                </li>
              )}
              {visibleUsers.map((user) => {
                const isSelected = user.id === selectedId;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => selectUser(user.id)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted",
                        isSelected &&
                          "bg-muted shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                      )}
                    >
                      <Avatar className="shrink-0">
                        <AvatarImage
                          src={user.imageUrl}
                          className="h-7 w-7 rounded-full"
                        />
                        <AvatarFallback className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                          {initials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold leading-tight">
                            {user.firstName} {user.lastName}
                          </span>
                          {hasPreferences(user) && <PreferencesIcon />}
                        </div>
                        <div className="truncate text-[11.5px] leading-tight text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                      {user.type === "admin" && (
                        <span className="shrink-0 rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Admin
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="grid gap-6">
            {!selected ? (
              <Card className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <UsersIcon className="h-8 w-8 text-muted-foreground" />
                <p className="font-semibold">
                  {selectedId && allUsers.length > 0
                    ? "That agent isn't on the roster"
                    : "Pick an agent"}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Choose someone on the left to see their preferences and which of
                  their shifts sync to Google Calendar.
                </p>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar className="shrink-0">
                    <AvatarImage
                      src={selected.imageUrl}
                      className="h-11 w-11 rounded-full"
                    />
                    <AvatarFallback className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-[15px] font-semibold text-foreground">
                      {initials(selected)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {selected.email}
                      {selected.type === "admin" && " · Admin"}
                    </p>
                  </div>
                </div>
                <PreferencesCard
                  user={selected}
                  editorKey={`${selected.id}:${editorVersion}`}
                  isDirty={isDirty}
                  isSaving={isSaving}
                  onChange={setDraft}
                  onReset={reset}
                  onSave={save}
                />
                <SyncedPositionsCard user={selected} />
              </>
            )}
          </div>
        </div>
      </div>
      {blocker.state === "blocked" ? (
        <ProceedWithUnsavedChanges
          title="Save your changes?"
          description={`Your edits to ${selected?.firstName ?? "this agent"}'s preferences haven't been saved.`}
          cancel="Cancel"
          cancelCallback={handleStay}
          secondary="Discard"
          secondaryCallback={handleLeave}
          action="Save"
          actionCallback={handleSaveAndLeave}
        />
      ) : null}
    </>
  );
}
