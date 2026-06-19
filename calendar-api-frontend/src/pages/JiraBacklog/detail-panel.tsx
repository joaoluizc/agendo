import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ColumnDesc, IssuePatch, JiraIssue, JiraTableMeta } from "./types";
import { DETAIL_GROUPS, STATUS_FIELD } from "./constants";
import { extractIssueKey } from "./api";
import { urgencyCellClasses } from "./urgency";
import { badgeClasses } from "./badges";

/**
 * Notion-style detail panel. Clicking a row opens this slide-over; every field is
 * editable here (including the urgency-input fields that are kept off the main table).
 * Edits go through the same meta.updateField as before, so optimistic update + server
 * reconciliation behave identically. Read-only for non-admins.
 */

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
          <p className={cn("text-sm", desc.wrap && "whitespace-pre-wrap break-words")}>{value}</p>
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
          className={inputClass}
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

  // Native <select> on purpose: a Radix Select locks body scroll while open
  // (react-remove-scroll), which on classic (non-overlay) scrollbars shifts the layout —
  // showing a "second scrollbar" and offsetting the options so they can't be clicked.
  // Native selects have no scroll-lock/portal, so they're robust inside this fixed panel.
  return (
    <Field label={desc.header}>
      <div className="relative">
        <select
          className={cn(inputClass, "h-9 cursor-pointer appearance-none pr-8 dark:[color-scheme:dark]")}
          value={value}
          onChange={(e) => meta.updateField(issue._id, patch(desc.field, e.target.value))}
        >
          <option value="">—</option>
          {(desc.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>
    </Field>
  );
}

function FieldEditor(props: FieldProps) {
  return props.desc.type === "select" ? <SelectField {...props} /> : <TextField {...props} />;
}

function UrgencyField({ issue, meta }: { issue: JiraIssue; meta: JiraTableMeta }) {
  const value = issue.urgency;
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
          {value == null ? "—" : value}
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
  const key = issue.issueKey || extractIssueKey(issue.url);
  const [draft, setDraft] = useState(issue.url);
  const focused = useRef(false);
  const wasEmpty = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(issue.url);
  }, [issue.url]);

  const commit = async () => {
    focused.current = false;
    const url = draft.trim();
    if (url === issue.url) return;
    const issueKey = extractIssueKey(url);
    const empty = wasEmpty.current;
    await meta.updateField(issue._id, { url, issueKey });
    if (empty && meta.jiraConfigured && issueKey) meta.refreshZd(issue._id);
  };

  return (
    <div className="space-y-2">
      {issue.url ? (
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-lg font-semibold text-primary hover:underline"
        >
          {key || "Open in Jira"} <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <p className="text-lg font-semibold text-muted-foreground">No Jira ticket linked</p>
      )}

      {meta.canEdit && (
        <Field label="Jira URL">
          <input
            className={inputClass}
            value={draft}
            placeholder="Paste Jira URL"
            onFocus={() => {
              focused.current = true;
              wasEmpty.current = !issue.url;
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                setDraft(issue.url);
                focused.current = false;
                e.currentTarget.blur();
              }
            }}
          />
        </Field>
      )}

      {meta.jiraConfigured && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Connected Zendesk tickets</span>
          {issue._zdBusy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-semibold tabular-nums">{issue.zdCount == null ? "—" : issue.zdCount}</span>
          )}
          {meta.canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={issue._zdBusy}
              onClick={() => meta.refreshZd(issue._id)}
              title="Refresh count from Jira"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
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
          <span
            className={cn(
              "inline-block rounded px-2 py-0.5 text-xs font-medium",
              badgeClasses("status", issue.status || "Backlog"),
            )}
          >
            {issue.status || "Backlog"}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <JiraSection issue={issue} meta={meta} />

          <div className="grid gap-4 border-t pt-4">
            <SelectField issue={issue} desc={STATUS_FIELD} meta={meta} />
            <UrgencyField issue={issue} meta={meta} />
          </div>

          {DETAIL_GROUPS.map((group) => (
            <section key={group.title} className="space-y-3 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              <div className="grid gap-3">
                {group.fields.map((f) => (
                  <FieldEditor key={f.id} issue={issue} desc={f} meta={meta} />
                ))}
              </div>
            </section>
          ))}
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
