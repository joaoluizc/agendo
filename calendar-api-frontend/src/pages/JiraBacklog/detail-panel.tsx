import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ColumnDesc, IssuePatch, JiraIssue, JiraTableMeta, MRR_PROBLEM_STAGES } from "./types";
import { DETAIL_GROUPS, STATUS_FIELD } from "./constants";
import { CollapsibleSection } from "./collapsible-section";
import { PrettySelect } from "./pretty-select";
import { TasksSection } from "./tasks-section";
import { extractIssueKey } from "./api";
import { urgencyCellClasses } from "./urgency";
import { badgeClasses } from "./badges";

/**
 * Notion-style detail panel. Clicking a row opens this slide-over; every field is
 * editable here (including the urgency-input fields that are kept off the main table).
 * Edits go through the same meta.updateField as before, so optimistic update + server
 * reconciliation behave identically. Read-only for non-admins.
 */

const mrrFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

function patch(field: keyof JiraIssue, value: unknown): IssuePatch {
  return { [field]: value } as IssuePatch;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface FieldProps {
  issue: JiraIssue;
  desc: ColumnDesc;
  meta: JiraTableMeta;
}

function TextField({ issue, desc, meta }: FieldProps) {
  const value = (issue[desc.field] as string) || "";
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  if (!meta.canEdit) {
    return (
      <Field label={desc.header}>
        {value ? (
          desc.badge ? (
            <span
              className={cn(
                "inline-block rounded px-2 py-0.5 text-xs font-medium",
                badgeClasses(desc.badge, value),
              )}
            >
              {value}
            </span>
          ) : (
            <p className={cn("text-sm", desc.wrap && "whitespace-pre-wrap break-words")}>{value}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Field>
    );
  }

  const commit = () => {
    focused.current = false;
    if (draft !== value) meta.updateField(issue._id, patch(desc.field, draft));
  };
  const onFocus = () => (focused.current = true);

  return (
    <Field label={desc.header}>
      {desc.wrap ? (
        <textarea
          rows={3}
          className={inputClass}
          value={draft}
          onFocus={onFocus}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(value);
              focused.current = false;
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <input
          className={cn(
            inputClass,
            desc.badge && draft && cn(badgeClasses(desc.badge, draft), "border-transparent font-medium"),
          )}
          value={draft}
          onFocus={onFocus}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setDraft(value);
              focused.current = false;
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </Field>
  );
}

function SelectField({ issue, desc, meta }: FieldProps) {
  const value = (issue[desc.field] as string) || "";
  // The status dropdown is user-managed (meta.statusOptions); other selects use the static
  // option list from the column descriptor.
  const options = desc.field === "status" ? meta.statusOptions : desc.options || [];

  if (!meta.canEdit) {
    return (
      <Field label={desc.header}>
        {value ? (
          desc.badge ? (
            <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-medium", badgeClasses(desc.badge, value))}>
              {value}
            </span>
          ) : (
            <p className="text-sm">{value}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Field>
    );
  }

  // A Popover-based select (see pretty-select.tsx) — matches the app's dropdowns without the
  // body-scroll-lock a Radix Select would impose inside this fixed panel. Status / priority /
  // client keep their badge tint on the trigger.
  return (
    <Field label={desc.header}>
      <PrettySelect
        value={value}
        options={options}
        clearable
        onChange={(v) =>
          desc.field === "status"
            ? meta.onStatusChange(issue._id, v)
            : meta.updateField(issue._id, patch(desc.field, v))
        }
        triggerClassName={
          desc.badge && value
            ? cn(badgeClasses(desc.badge, value), "border-transparent font-medium")
            : undefined
        }
      />
    </Field>
  );
}

function FieldEditor(props: FieldProps) {
  return props.desc.type === "select" ? <SelectField {...props} /> : <TextField {...props} />;
}

function UrgencyField({ issue, meta }: { issue: JiraIssue; meta: JiraTableMeta }) {
  const value = issue.urgency;
  // Regressions show "REG" rather than a dash (they bypass the urgency formula).
  const isReg = value == null && issue.bugType === "Regression";
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    const normalized = next == null || Number.isNaN(next) ? null : next;
    if (normalized !== value) meta.updateField(issue._id, { urgency: normalized });
  };

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Urgency</span>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm font-semibold tabular-nums",
            urgencyCellClasses(value),
          )}
        >
          {value != null ? value : isReg ? "REG" : "—"}
          {issue.urgencyOverridden && <Pencil className="h-3 w-3 opacity-60" />}
        </span>
        {meta.canEdit && (
          <input
            type="number"
            min={0}
            max={100}
            placeholder="auto"
            className={cn(inputClass, "w-24")}
            value={draft}
            onFocus={() => (focused.current = true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                setDraft(value == null ? "" : String(value));
                focused.current = false;
                e.currentTarget.blur();
              }
            }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {issue.urgencyOverridden
          ? "Manually overridden — clear the box to revert to auto."
          : "Auto-calculated from the urgency inputs below."}
      </p>
    </div>
  );
}

function JiraSection({ issue, meta }: { issue: JiraIssue; meta: JiraTableMeta }) {
  const [draft, setDraft] = useState("");
  const focused = useRef(false);

  // Linking is one-shot: the URL input only exists while the row has no Jira ticket yet.
  // Once linked (and autofilled), the association is fixed — the key lives in the panel
  // header as a clickable link; there's nothing to edit here. Wrong link? Delete the row
  // and re-add it.
  const commit = async () => {
    focused.current = false;
    const url = draft.trim();
    if (!url) return;
    const issueKey = extractIssueKey(url);
    const ok = await meta.updateField(issue._id, { url, issueKey });
    if (ok && meta.jiraConfigured && issueKey) meta.autofill(issue._id);
  };

  return (
    <div className="space-y-2">
      {meta.canEdit && !issue.url && (
        <Field label="Jira URL">
          <input
            className={inputClass}
            value={draft}
            placeholder="Paste Jira URL"
            onFocus={() => (focused.current = true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                setDraft("");
                focused.current = false;
                e.currentTarget.blur();
              }
            }}
          />
        </Field>
      )}

      <ZdMrrSummary issue={issue} meta={meta} />
    </div>
  );
}

/**
 * Zendesk-ticket count + MRR on one line; clicking anywhere on the row toggles the
 * per-account MRR breakdown + resolution warnings (collapsed by default). The refresh
 * buttons stop propagation so they don't also toggle.
 */
function ZdMrrSummary({ issue, meta }: { issue: JiraIssue; meta: JiraTableMeta }) {
  const [expanded, setExpanded] = useState(false);
  if (!meta.jiraConfigured && !meta.mrrConfigured) return null;

  const problems = (issue.mrrTrace || []).filter((t) => MRR_PROBLEM_STAGES.has(t.stage));
  const hasDetails = meta.mrrConfigured && ((issue.mrrAccounts?.length || 0) > 0 || problems.length > 0);

  return (
    <div
      className={cn("rounded-md border", hasDetails && "cursor-pointer")}
      onClick={hasDetails ? () => setExpanded((e) => !e) : undefined}
    >
      <div className="flex items-center gap-4 px-3 py-2">
        {meta.jiraConfigured && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Zendesk tickets</span>
            {issue._zdBusy ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-sm font-semibold tabular-nums">
                {issue.zdCount == null ? "—" : issue.zdCount}
              </span>
            )}
            {meta.canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={issue._zdBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  meta.refreshZd(issue._id);
                }}
                title="Refresh count from Jira"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {meta.mrrConfigured && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">MRR</span>
            {issue._mrrBusy ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : issue._mrrError ? (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> Fetch failed
              </span>
            ) : (
              <span className="text-sm font-semibold tabular-nums">
                {issue.mrr == null ? "—" : mrrFormatter.format(issue.mrr)}
              </span>
            )}
            {problems.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            {meta.canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={issue._mrrBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  meta.refreshMrr(issue._id);
                }}
                title="Re-resolve MRR (Jira -> Zendesk -> DOMO)"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {hasDetails &&
          (expanded ? (
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          ))}
      </div>

      {expanded && hasDetails && (
        <div className="space-y-1.5 border-t px-3 py-2">
          {issue.mrrAccounts && issue.mrrAccounts.length > 0 && (
            <ul className="space-y-0.5 text-xs">
              {issue.mrrAccounts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground" title={`${a.email} -> ${a.ownerEmail}`}>
                    {a.businessName || a.ownerEmail}
                  </span>
                  <span className="shrink-0 tabular-nums">{mrrFormatter.format(a.mrr)}</span>
                </li>
              ))}
            </ul>
          )}
          <MrrProblems issue={issue} />
        </div>
      )}
    </div>
  );
}

/**
 * The tickets that did NOT contribute to the MRR sum, with the step each one failed at
 * (from the per-ticket resolution trace) — so a suspicious 0 is diagnosable right here.
 * Resolved-fine entries (ok / via_override / duplicate_owner) stay hidden to keep the
 * panel calm; the full trace is in the row data if ever needed.
 */
function MrrProblems({ issue }: { issue: JiraIssue }) {
  const problems = (issue.mrrTrace || []).filter((t) => MRR_PROBLEM_STAGES.has(t.stage));
  if (!problems.length) return null;
  return (
    <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
      {problems.map((t, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {t.ticketId && <span className="font-medium">ZD {t.ticketId}</span>}
            {t.email && <span className="font-medium"> ({t.email})</span>}
            {(t.ticketId || t.email) && " — "}
            {t.detail || t.stage}
          </span>
        </li>
      ))}
    </ul>
  );
}

// The DETAIL_GROUPS group that gets the manual urgency-override input appended.
const URGENCY_GROUP_TITLE = "Urgency inputs";

/** Compact urgency pill for the panel header (score, "REG" for regressions, "—" unset). */
function UrgencyBadge({ issue }: { issue: JiraIssue }) {
  const value = issue.urgency;
  const isReg = value == null && issue.bugType === "Regression";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold tabular-nums",
        urgencyCellClasses(value),
      )}
      title={isReg ? "Regression" : issue.urgencyOverridden ? "Urgency (manually overridden)" : "Urgency (auto-calculated)"}
    >
      Urgency {value != null ? value : isReg ? "REG" : "—"}
      {issue.urgencyOverridden && <Pencil className="h-3 w-3 opacity-60" />}
    </span>
  );
}

/** Whole days from now until an ISO timestamp, floored at 0. */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Banner shown for archived bugs, counting down to their automatic deletion. */
function ArchivedCard({ issue }: { issue: JiraIssue }) {
  if (issue.status !== "Archived" || !issue.archiveExpiresAt) return null;
  const days = daysUntil(issue.archiveExpiresAt);
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
      <Archive className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        This bug is archived and will be automatically deleted{" "}
        <span className="font-semibold">
          {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
        </span>
        . Change its status to keep it on the backlog.
      </p>
    </div>
  );
}

export function DetailPanel({
  issue,
  meta,
  onClose,
}: {
  issue: JiraIssue;
  meta: JiraTableMeta;
  onClose: () => void;
}) {
  useEffect(() => {
    // Capture phase, so this runs before Radix handles Escape: if a Select/popover is open,
    // let Escape close that first instead of closing the whole panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[92vw] flex-col border-l bg-background shadow-xl animate-in slide-in-from-right duration-200 sm:w-[460px]">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            {issue.url ? (
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                {issue.issueKey || extractIssueKey(issue.url) || "Open in Jira"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">No Jira ticket linked</span>
            )}
            <UrgencyBadge issue={issue} />
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-4 py-5">
          <ArchivedCard issue={issue} />
          <JiraSection issue={issue} meta={meta} />

          <div className="grid grid-cols-2 gap-4 border-t pt-6">
            <SelectField issue={issue} desc={STATUS_FIELD} meta={meta} />
            <Field label="Jira status">
              {issue.jiraStatus ? (
                <p className="py-1.5 text-sm">{issue.jiraStatus}</p>
              ) : (
                <p className="py-1.5 text-sm text-muted-foreground">—</p>
              )}
            </Field>
          </div>

          {DETAIL_GROUPS.map((group) => (
            <CollapsibleSection key={group.title} title={group.title}>
              <div className="grid gap-4">
                {group.fields.map((f) => (
                  <FieldEditor key={f.id} issue={issue} desc={f} meta={meta} />
                ))}
                {/* The manual override lives at the end of the inputs it overrides. */}
                {group.title === URGENCY_GROUP_TITLE && <UrgencyField issue={issue} meta={meta} />}
              </div>
            </CollapsibleSection>
          ))}

          <TasksSection issue={issue} meta={meta} />
        </div>

        {meta.canEdit && (
          <footer className="border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => meta.deleteRow(issue._id)}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete row
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}
