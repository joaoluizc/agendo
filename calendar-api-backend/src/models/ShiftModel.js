import mongoose from "mongoose";
import { GCalEventSchema } from "./GCalEventModel.js";

const Schema = mongoose.Schema;

/**
 * A shift agendo owns (as opposed to one read from Sling).
 *
 * ## Draft vs published
 *
 * A shift starts as a **draft** and only becomes real when an admin publishes it. A
 * draft is a plan: it is excluded from Google Calendar sync and from the hours report,
 * and it is never copied by the duplicate-day flow. Publishing is the single deliberate
 * act that reaches an agent's calendar — see services/shiftService.publishShifts and
 * docs/knowledge/shift-drafts.md.
 *
 * This replaced "creating a shift syncs it immediately", which left no way to build a
 * day, look at it, and then commit it — the one thing Sling could do that agendo could
 * not.
 *
 * ## Why `status` has no schema default
 *
 * Every shift written before this field existed has no `status` at all, and those are
 * real, published history. A `default: "draft"` here would be actively wrong for them,
 * because Mongoose applies a default when it **hydrates** a document, not just when it
 * creates one — measured on this collection, a legacy shift read back through the model
 * arrives claiming `status: "draft"` even though the stored document has no such field.
 * Every one of them would go unsynced and uncounted.
 *
 * Worse, that disagrees with the query layer: `{ status: { $ne: "draft" } }` matches those
 * same documents (correctly, as published). Filter and object would contradict each other,
 * and correctness would hinge on running a migration before the deploy and never slipping.
 *
 * So: no default, not `required`, and **a missing status means published**. Legacy
 * documents are then right without a migration, and a shift loaded and re-saved does not
 * trip validation on a field it never had.
 *
 * The fail-closed default lives one layer up instead, in `shiftService.createShift`, which
 * is the only place a Shift is constructed — a new shift is a draft unless something says
 * otherwise.
 *
 * Two rules follow, and both matter:
 *
 *  - **Query with `{ status: { $ne: "draft" } }`, never `{ status: "published" }`.** The
 *    positive form matches no legacy document — it empties the schedule and every report.
 *  - **Test for `=== "draft"`, never `!== "published"`.** The negative form turns every
 *    legacy shift into a draft. The frontend routes this through `scheduleUtils.isDraft`.
 *
 * `src/database/scripts/backfillShiftStatus.js` stamps the field onto legacy documents.
 * With no schema default it is cleanup rather than a prerequisite — worth running so the
 * data describes itself, but nothing breaks before it does.
 */
const ShiftSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    ref: "Position",
  },
  createdBy: {
    type: String,
    required: true,
  },
  // Draft until someone publishes it. Absent on pre-lifecycle shifts, which are published.
  // No default and not required, deliberately — read the class comment before changing
  // either, or filtering on this field.
  status: {
    type: String,
    enum: ["draft", "published"],
  },
  // Where the shift came from: "ui" for one a human created, or the posting integration's
  // own name (e.g. "auto-schedule-claudinho") for a generated batch.
  source: {
    type: String,
    default: "ui",
  },
  // Batch key for a posted schedule, so one run's drafts can be listed or replaced as a
  // unit. Unset for a shift created by hand.
  runId: {
    type: String,
  },
  // Free text from whatever produced the shift — an objective score, a validator warning
  // count — shown to whoever reviews the draft.
  notes: {
    type: String,
  },
  publishedAt: {
    type: Date,
  },
  publishedBy: {
    type: String,
  },
  isSynced: {
    type: Boolean,
    default: false,
  },
  syncedEvent: GCalEventSchema,
});

// Speeds up findShiftsByRange's date-overlap query (schedule + reports) — Shift had no
// indexes beyond _id before this.
ShiftSchema.index({ startTime: 1, endTime: 1 });

// Drafts are filtered out of nearly every read, so status joined the hot query.
ShiftSchema.index({ status: 1, startTime: 1 });

// Listing or replacing one posted batch (chunk 2's ingest endpoint).
ShiftSchema.index({ runId: 1 });

const Shift = mongoose.model("Shift", ShiftSchema);

export default Shift;
