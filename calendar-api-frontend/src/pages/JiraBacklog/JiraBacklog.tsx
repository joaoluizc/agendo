import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BadgeDollarSign, ListChecks, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ApiError, bugStatusApi, jiraApi, taskApi } from "./api";
import { computeUrgency, URGENCY_INPUT_FIELDS } from "./urgency";
import { buildColumns } from "./columns";
import { DataTable } from "./data-table";
import { ToReviewView } from "./to-review-view";
import { DetailPanel } from "./detail-panel";
import { BugStatus, IssuePatch, JiraIssue, JiraTableMeta, ViewKey } from "./types";
import {
  COLUMN_DEFS,
  DEFAULT_TO_REVIEW_STATUSES,
  matchesQuery,
  normalizeQuery,
  POSSIBLE_NO_ETA_STATUS,
  STATUS_OPTIONS,
} from "./constants";
import { ColumnsSelect } from "./columns-select";
import { ManageStatusesDialog } from "./manage-statuses-dialog";
import { ManageMrrOverridesDialog } from "./manage-mrr-overrides-dialog";
import { SearchBox } from "./search-box";
import { StatusMultiSelect } from "./status-multi-select";
import { usePageFavicon } from "./use-page-favicon";
import { usePageTitle } from "./use-page-title";
import favicon from "./favicon.svg";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "toReview", label: "To Review" },
  { key: "all", label: "All" },
];

// Statuses that never appear in the "Open" view (its whole point is excluding them).
const OPEN_EXCLUDED_STATUSES = ["Fixed/Closed", "Archived"];

// Per-user, per-view hidden-column choices, kept in localStorage keyed by the signed-in
// user's email so each user (per browser) sees the columns they picked.
const columnPrefsKey = (email: string) => `jira-backlog:hidden-columns:${email || "anon"}`;

type HiddenColumns = { open: string[]; all: string[] };

function loadHiddenColumns(email: string): HiddenColumns {
  try {
    const parsed = JSON.parse(localStorage.getItem(columnPrefsKey(email)) || "{}");
    return {
      open: Array.isArray(parsed.open) ? parsed.open : [],
      all: Array.isArray(parsed.all) ? parsed.all : [],
    };
  } catch {
    return { open: [], all: [] };
  }
}

// How many per-row Jira fetches the "Refresh ZD counts" action runs at once. Each request
// is short, so cells update incrementally as results stream back and no single request can
// hit a gateway timeout. 5 is comfortably within Jira's rate limits.
const REFRESH_CONCURRENCY = 5;

export default function JiraBacklog() {
  const { type, email } = useUserSettings();
  const canEdit = type === "admin";

  usePageFavicon(favicon);
  usePageTitle("Bug Tracker");

  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("open");
  // Free-text search, applied in every view (accepts a pasted Jira link — see normalizeQuery).
  const [query, setQuery] = useState("");
  // Which statuses the "To Review" view shows; defaults to the legacy "Review with Squad"
  // but the user can widen it to surface bugs from other statuses too.
  const [toReviewStatuses, setToReviewStatuses] = useState<string[]>(DEFAULT_TO_REVIEW_STATUSES);
  // Status filters for "Open" / "All" — null means "no narrowing" (every status the view
  // allows), so the filter stays inert until the user actually unchecks something.
  const [openStatuses, setOpenStatuses] = useState<string[] | null>(null);
  const [allStatuses, setAllStatuses] = useState<string[] | null>(null);
  // Per-user hidden columns for "Open" / "All" (localStorage; reloaded when the user is known).
  const [hiddenColumns, setHiddenColumns] = useState<HiddenColumns>({ open: [], all: [] });
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [mrrConfigured, setMrrConfigured] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [bugStatuses, setBugStatuses] = useState<BugStatus[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [mrrOverridesOpen, setMrrOverridesOpen] = useState(false);
  const [dup, setDup] = useState<{ existingId: string; issueKey: string } | null>(null);
  // When a bug is set to "Possible No-ETA", offer to create the 30-day re-evaluation task.
  const [noEtaPrompt, setNoEtaPrompt] = useState<{ issueId: string } | null>(null);

  // Deep-link: a `?issue=<id>` param (e.g. from a Tasks-board card) opens that ticket's
  // panel. The param only drives opening; in-page row clicks don't rewrite the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const issueParam = searchParams.get("issue");

  // Collapse the big page header once the user scrolls into the list.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Patch transient/persistent fields on a single issue in place (keeps every other
  // issue object's identity stable, so only that row re-renders).
  const patchIssue = useCallback((id: string, patch: Partial<JiraIssue>) => {
    setIssues((prev) => prev.map((it) => (it._id === id ? { ...it, ...patch } : it)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, list] = await Promise.all([jiraApi.getConfig(), jiraApi.getIssues()]);
      setJiraConfigured(cfg.jiraConfigured);
      setMrrConfigured(cfg.mrrConfigured);
      setIssues(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Bug statuses are user-managed; fetch them independently so a status-endpoint hiccup
  // doesn't block the issues list. The dropdown falls back to STATUS_OPTIONS until loaded.
  const reloadStatuses = useCallback(async () => {
    try {
      setBugStatuses(await bugStatusApi.list());
    } catch {
      // keep whatever we have
    }
  }, []);

  useEffect(() => {
    reloadStatuses();
  }, [reloadStatuses]);

  // Column choices are per user — reload once the signed-in user's email resolves.
  useEffect(() => {
    setHiddenColumns(loadHiddenColumns(email));
  }, [email]);

  const setHiddenFor = useCallback(
    (viewKey: "open" | "all", next: string[]) => {
      setHiddenColumns((prev) => {
        const merged = { ...prev, [viewKey]: next };
        try {
          localStorage.setItem(columnPrefsKey(email), JSON.stringify(merged));
        } catch {
          // storage full/blocked — the choice still applies for this session
        }
        return merged;
      });
    },
    [email],
  );

  // Open the deep-linked ticket once its id appears in the URL (selectedIssue resolves
  // as soon as the list finishes loading).
  useEffect(() => {
    if (issueParam) setSelectedId(issueParam);
  }, [issueParam]);

  // Close the panel and drop the deep-link param so it doesn't immediately reopen.
  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (issueParam) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("issue");
          return next;
        },
        { replace: true },
      );
    }
  }, [issueParam, setSearchParams]);

  const updateField = useCallback(
    async (id: string, fieldPatch: IssuePatch): Promise<boolean> => {
      // Optimistic: apply locally (mirroring the server's urgency recalc for instant
      // feedback), then reconcile with the server's authoritative row on response.
      setIssues((prev) =>
        prev.map((it) => {
          if (it._id !== id) return it;
          const merged = { ...it, ...fieldPatch };
          const touchedInput = URGENCY_INPUT_FIELDS.some((f) => f in fieldPatch);
          if (!("urgency" in fieldPatch) && touchedInput && !merged.urgencyOverridden) {
            merged.urgency = computeUrgency(merged);
          }
          return merged;
        }),
      );
      try {
        const updated = await jiraApi.updateIssue(id, fieldPatch);
        setIssues((prev) => prev.map((it) => (it._id === id ? updated : it)));
        return true;
      } catch (e) {
        load(); // revert optimistic change
        if (e instanceof ApiError && e.code === "DUPLICATE_ISSUE") {
          // The Jira key already exists — offer to jump to the existing row instead.
          setDup({ existingId: e.existingId || "", issueKey: String(fieldPatch.issueKey || "") });
          return false;
        }
        const msg =
          e instanceof ApiError && e.status === 403
            ? "Only admins can edit."
            : e instanceof Error
              ? e.message
              : "Update failed";
        toast.error(msg);
        return false;
      }
    },
    [load],
  );

  // Status changes route through here (from the detail panel) so we can intercept
  // "Possible No-ETA" and offer to create a 30-day re-evaluation task. The status itself
  // always changes, regardless of the prompt's answer.
  const onStatusChange = useCallback(
    (id: string, status: string) => {
      updateField(id, { status });
      if (status === POSSIBLE_NO_ETA_STATUS) setNoEtaPrompt({ issueId: id });
    },
    [updateField],
  );

  // Apply a server-returned issue to local state (e.g. after a review task flips it to No-ETA).
  const onIssueUpdated = useCallback((issue: JiraIssue) => {
    setIssues((prev) => prev.map((it) => (it._id === issue._id ? issue : it)));
  }, []);

  const confirmNoEtaTask = useCallback(async () => {
    const id = noEtaPrompt?.issueId;
    setNoEtaPrompt(null);
    if (!id) return;
    try {
      await taskApi.createNoEtaTask(id);
      toast.success("Re-evaluation task created — due in 30 days.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the task");
    }
  }, [noEtaPrompt]);

  const addRow = useCallback(async () => {
    try {
      const created = await jiraApi.createIssue({});
      setIssues((prev) => [...prev, created]);
      setView("all"); // new row has no status filter signal yet
      setQuery(""); // an active search would otherwise hide the empty new row
      setSelectedId(created._id); // open the panel so it can be filled in
      toast.success("Row added — fill in its details in the panel.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add row");
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    try {
      await jiraApi.deleteIssue(id);
      setIssues((prev) => prev.filter((it) => it._id !== id));
      setSelectedId((cur) => (cur === id ? null : cur)); // close the panel if it was open
      toast.success("Row deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }, [pendingDeleteId]);

  const refreshZd = useCallback(
    async (id: string) => {
      patchIssue(id, { _zdBusy: true, _zdError: false });
      try {
        const updated = await jiraApi.refreshZd(id);
        setIssues((prev) =>
          prev.map((it) => (it._id === id ? { ...updated, _zdBusy: false, _zdError: false } : it)),
        );
      } catch (e) {
        if (e instanceof ApiError && e.code === "JIRA_NOT_CONFIGURED") {
          patchIssue(id, { _zdBusy: false });
          toast.error("Jira isn't configured yet.");
        } else {
          patchIssue(id, { _zdBusy: false, _zdError: true });
          toast.error(e instanceof Error ? e.message : "Jira fetch failed");
        }
      }
    },
    [patchIssue],
  );

  const refreshMrr = useCallback(
    async (id: string) => {
      patchIssue(id, { _mrrBusy: true, _mrrError: false });
      try {
        const updated = await jiraApi.refreshMrr(id);
        setIssues((prev) =>
          prev.map((it) => (it._id === id ? { ...updated, _mrrBusy: false, _mrrError: false } : it)),
        );
      } catch (e) {
        if (e instanceof ApiError && e.code === "MRR_NOT_CONFIGURED") {
          patchIssue(id, { _mrrBusy: false });
          toast.error("MRR lookup isn't configured yet.");
        } else {
          patchIssue(id, { _mrrBusy: false, _mrrError: true });
          toast.error(e instanceof Error ? e.message : "MRR fetch failed");
        }
      }
    },
    [patchIssue],
  );

  const autofill = useCallback(
    async (id: string) => {
      patchIssue(id, { _zdBusy: true, _zdError: false });
      try {
        const updated = await jiraApi.autofill(id);
        setIssues((prev) =>
          prev.map((it) => (it._id === id ? { ...updated, _zdBusy: false, _zdError: false } : it)),
        );
        toast.success("Filled details from Jira.");
      } catch (e) {
        if (e instanceof ApiError && e.code === "JIRA_NOT_CONFIGURED") {
          patchIssue(id, { _zdBusy: false });
          toast.error("Jira isn't configured yet.");
        } else {
          patchIssue(id, { _zdBusy: false, _zdError: true });
          toast.error(e instanceof Error ? e.message : "Jira autofill failed");
        }
      }
    },
    [patchIssue],
  );

  // Rows for the current view, before search. Every view now has a toolbar status filter:
  // "To Review" shows exactly the selected statuses; "Open" / "All" narrow their base set
  // only once the user unchecks something (null = inert).
  const viewIssues = useMemo(() => {
    if (view === "open") {
      const base = issues.filter((i) => !OPEN_EXCLUDED_STATUSES.includes(i.status));
      return openStatuses ? base.filter((i) => openStatuses.includes(i.status)) : base;
    }
    if (view === "toReview") return issues.filter((i) => toReviewStatuses.includes(i.status));
    return allStatuses ? issues.filter((i) => allStatuses.includes(i.status)) : issues;
  }, [issues, view, toReviewStatuses, openStatuses, allStatuses]);

  // Search term (normalised once per keystroke), then the visible rows = view ∩ search.
  const term = useMemo(() => normalizeQuery(query), [query]);
  const visibleIssues = useMemo(
    () => (term ? viewIssues.filter((i) => matchesQuery(i, term)) : viewIssues),
    [viewIssues, term],
  );

  // Bulk "Sync from Jira": pull every Jira-sourced field (title, client, priority, squad,
  // sprint, ZD count) onto each visible row via the same per-row autofill the panel uses.
  const syncVisible = useCallback(async () => {
    const ids = visibleIssues.map((i) => i._id);
    if (!ids.length) return;

    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    let notConfigured = false;
    let cursor = 0;

    // Each worker marks its row busy right before fetching and clears it on completion,
    // so only the ~REFRESH_CONCURRENCY in-flight rows re-render at any moment — the
    // updates visibly stream in row by row.
    const worker = async () => {
      while (cursor < ids.length && !notConfigured) {
        const id = ids[cursor++];
        patchIssue(id, { _zdBusy: true, _zdError: false });
        try {
          const updated = await jiraApi.autofill(id);
          setIssues((prev) =>
            prev.map((it) => (it._id === id ? { ...updated, _zdBusy: false, _zdError: false } : it)),
          );
          ok++;
        } catch (e) {
          if (e instanceof ApiError && e.code === "JIRA_NOT_CONFIGURED") {
            notConfigured = true;
            patchIssue(id, { _zdBusy: false });
          } else {
            failed++;
            patchIssue(id, { _zdBusy: false, _zdError: true });
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, ids.length) }, worker));

    setBulkBusy(false);
    if (notConfigured) toast.error("Jira isn't configured yet.");
    else if (failed) toast.warning(`Synced ${ok}/${ids.length}; ${failed} failed.`);
    else toast.success(`Synced ${ok} bug${ok === 1 ? "" : "s"} from Jira.`);
  }, [visibleIssues, patchIssue]);

  const openDetail = useCallback((id: string) => setSelectedId(id), []);

  // Status names for the dropdown + filter — user-managed, falling back to the built-in
  // defaults until they load. Memoized so meta stays referentially stable.
  const statusOptions = useMemo(
    () => (bugStatuses.length ? bugStatuses.map((s) => s.name) : STATUS_OPTIONS),
    [bugStatuses],
  );

  // Referentially stable across refreshes (no volatile maps) so memoized rows hold.
  const meta: JiraTableMeta = useMemo(
    () => ({
      canEdit,
      jiraConfigured,
      mrrConfigured,
      updateField,
      deleteRow: setPendingDeleteId,
      refreshZd,
      refreshMrr,
      autofill,
      openDetail,
      onStatusChange,
      onIssueUpdated,
      statusOptions,
    }),
    [
      canEdit,
      jiraConfigured,
      mrrConfigured,
      updateField,
      refreshZd,
      refreshMrr,
      autofill,
      openDetail,
      onStatusChange,
      onIssueUpdated,
      statusOptions,
    ],
  );

  // Statuses offered by the Open view's filter (its base rule already excludes the rest).
  const openStatusOptions = useMemo(
    () => statusOptions.filter((s) => !OPEN_EXCLUDED_STATUSES.includes(s)),
    [statusOptions],
  );

  // Columns for the current view, minus the user's hidden ones ("To Review" isn't a
  // DataTable view — it has its own fixed layout).
  const columns = useMemo(() => {
    const hidden = view === "open" ? hiddenColumns.open : view === "all" ? hiddenColumns.all : [];
    return buildColumns(COLUMN_DEFS.filter((d) => !hidden.includes(d.id)));
  }, [view, hiddenColumns]);

  const selectedIssue = useMemo(
    () => issues.find((i) => i._id === selectedId) || null,
    [issues, selectedId],
  );

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 pb-16">
      {/* Big header — scrolls away as you move into the list. */}
      <div className="pt-6 pb-2">
        <h1 className="text-2xl font-semibold">Bug Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Triage board for SUP bug tickets.{" "}
          {canEdit ? "Click a row to open and edit it." : "Read-only — ask an admin for edit access."}
        </p>
      </div>

      {/* Condensed toolbar — pins under the app nav; views + actions stay visible. */}
      <div
        className={cn(
          "sticky top-16 z-40 -mx-4 flex h-[52px] items-center gap-3 border-b bg-background px-4",
          scrolled && "shadow-sm",
        )}
      >
        {scrolled && <span className="hidden text-sm font-semibold sm:inline">Bug Tracker</span>}
        <div className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              variant={view === v.key ? "default" : "outline"}
              size="sm"
              onClick={() => setView(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>
        {view === "toReview" ? (
          <StatusMultiSelect
            options={statusOptions}
            selected={toReviewStatuses}
            onChange={setToReviewStatuses}
          />
        ) : view === "open" ? (
          <StatusMultiSelect
            options={openStatusOptions}
            selected={openStatuses ?? openStatusOptions}
            onChange={setOpenStatuses}
          />
        ) : (
          <StatusMultiSelect
            options={statusOptions}
            selected={allStatuses ?? [...statusOptions]}
            onChange={setAllStatuses}
          />
        )}
        {view !== "toReview" && (
          <ColumnsSelect
            options={COLUMN_DEFS}
            hidden={view === "open" ? hiddenColumns.open : hiddenColumns.all}
            onChange={(next) => setHiddenFor(view === "open" ? "open" : "all", next)}
          />
        )}
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {visibleIssues.length}
          {term ? ` of ${viewIssues.length}` : ""} issue{visibleIssues.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox value={query} onChange={setQuery} className="w-40 sm:w-52 lg:w-64" />
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
                <ListChecks className="h-4 w-4" /> Manage statuses
              </Button>
              {mrrConfigured && (
                <Button variant="outline" size="sm" onClick={() => setMrrOverridesOpen(true)}>
                  <BadgeDollarSign className="h-4 w-4" /> MRR overrides
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" /> Add row
              </Button>
              {jiraConfigured && (
                <Button variant="outline" size="sm" onClick={syncVisible} disabled={bulkBusy}>
                  {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync from Jira
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : view === "toReview" ? (
          <ToReviewView issues={visibleIssues} meta={meta} />
        ) : (
          // Keyed by view so per-column sort/filter state doesn't leak between Open and All.
          <DataTable key={view} columns={columns} data={visibleIssues} meta={meta} />
        )}
      </div>

      {selectedIssue && (
        <DetailPanel issue={selectedIssue} meta={meta} onClose={closeDetail} />
      )}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the issue from the backlog. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dup} onOpenChange={(o) => !o && setDup(null)}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>This bug is already on the backlog</AlertDialogTitle>
            <AlertDialogDescription>
              {dup?.issueKey ? `${dup.issueKey} is` : "This bug is"} already tracked on the backlog.
              Do you want to open the existing one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dup?.existingId) {
                  setView("all");
                  setQuery(""); // ensure the existing row isn't hidden by an active search
                  setSelectedId(dup.existingId);
                }
                setDup(null);
              }}
            >
              Go to existing bug
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!noEtaPrompt} onOpenChange={(o) => !o && setNoEtaPrompt(null)}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Track as a No-ETA candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              The bug is now “Possible No-ETA”. Create a task to re-evaluate it in 30 days? You
              can keep deferring it, or commit to “No-ETA” once the task comes due.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, just set the status</AlertDialogCancel>
            <AlertDialogAction onClick={confirmNoEtaTask}>Create the task</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canEdit && (
        <ManageStatusesDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          statuses={bugStatuses}
          reload={reloadStatuses}
        />
      )}

      {canEdit && mrrConfigured && (
        <ManageMrrOverridesDialog open={mrrOverridesOpen} onOpenChange={setMrrOverridesOpen} />
      )}
    </div>
  );
}
