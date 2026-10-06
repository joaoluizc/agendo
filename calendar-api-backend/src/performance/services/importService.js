/**
 * Paste import: preview (parse + match names, writes nothing), then commit (the admin's
 * confirmed line-by-line decisions). An import replaces its source for the quarter — the
 * pasted list is the whole list, so agents missing from it lose their facts for that
 * source, and the preview says who beforehand.
 *
 * The commit re-parses the text itself rather than trusting rows sent back by the client,
 * and records everything it replaced in the import document.
 */
import crypto from "crypto";
import { User } from "../../models/UserModel.js";
import { Fact } from "../models/factModel.js";
import { Import, MAX_IMPORT_CHARS } from "../models/importModel.js";
import { Alias } from "../models/aliasModel.js";
import periodService from "./periodService.js";
import { parsePaste, SOURCES } from "../lib/parsePaste.js";
import { matchAgent, normalizeName } from "../lib/names.js";
import { badRequest } from "../lib/httpError.js";

function assertInput(source, text) {
  if (!SOURCES[source]) throw badRequest(`source must be one of ${Object.keys(SOURCES).join(", ")}`);
  if (typeof text !== "string" || !text.trim()) throw badRequest("nothing to import");
  if (text.length > MAX_IMPORT_CHARS) {
    throw badRequest(`the paste is too long (over ${MAX_IMPORT_CHARS} characters) — import per-agent totals, not individual tickets`);
  }
}

async function loadMatchingContext() {
  const users = (await User.find().select("clerkId firstName lastName email").lean()).filter(
    (u) => u.clerkId,
  );
  const aliases = new Map((await Alias.find().lean()).map((a) => [a.normalized, a.clerkId]));
  return { users, aliases, userById: new Map(users.map((u) => [u.clerkId, u])) };
}

const fullName = (user) => (user ? `${user.firstName} ${user.lastName}`.trim() : null);

function metricsFor(source, values) {
  if (source === "hours") {
    return { chatsHours: values.chatsHours ?? null, ticketsHours: values.ticketsHours ?? null };
  }
  return {
    count: values.count ?? 0,
    csat: values.csat ?? null,
    surveys: values.surveys ?? 0,
    good: values.good ?? null,
    bad: values.bad ?? null,
  };
}

async function previewImport({ periodKey, source, text, columns }) {
  assertInput(source, text);
  const period = await periodService.getPeriod(periodKey);
  const parsed = parsePaste(text, source, columns || null);
  const { users, aliases, userById } = await loadMatchingContext();

  const rows = parsed.rows.map((row) => {
    const match = matchAgent(row, users, aliases);
    return {
      ...row,
      match: {
        ...match,
        name: fullName(userById.get(match.clerkId)),
      },
    };
  });

  const matched = new Set(rows.map((r) => r.match.clerkId).filter(Boolean));
  const existing = await Fact.find({ periodKey, source }).select("clerkId").lean();
  const wouldRemove = existing
    .filter((f) => !matched.has(f.clerkId))
    .map((f) => ({ clerkId: f.clerkId, name: fullName(userById.get(f.clerkId)) }));

  return {
    period: { key: period.key, label: period.label, status: period.status },
    source,
    headerLine: parsed.headerLine ?? null,
    header: parsed.header ?? null,
    columns: parsed.columns ?? null,
    fields: SOURCES[source].fields,
    rows,
    skipped: parsed.skipped || [],
    errors: parsed.errors || [],
    existingCount: existing.length,
    wouldRemove,
  };
}

/**
 * decisions: [{ line, clerkId | null, saveAlias }] — one per parsed row; null skips it.
 */
async function commitImport({ periodKey, source, text, columns, decisions, createdBy }) {
  assertInput(source, text);
  if (!Array.isArray(decisions)) throw badRequest("decisions must be an array");
  const period = await periodService.getPeriod(periodKey);
  periodService.assertOpen(period);

  const parsed = parsePaste(text, source, columns || null);
  if (parsed.errors?.length) throw badRequest(parsed.errors.join("; "));
  const { userById } = await loadMatchingContext();
  const byLine = new Map(decisions.map((d) => [Number(d.line), d]));

  const accepted = [];
  const resolvedRows = [];
  const seen = new Map();
  for (const row of parsed.rows) {
    const decision = byLine.get(row.line);
    if (!decision) throw badRequest(`line ${row.line} (${row.rawName}) has no decision`);
    const clerkId = decision.clerkId || null;
    if (clerkId) {
      if (row.errors.length) {
        throw badRequest(`line ${row.line} (${row.rawName}) has errors — skip it or fix the paste`);
      }
      if (!userById.has(clerkId)) throw badRequest(`line ${row.line}: unknown user ${clerkId}`);
      if (seen.has(clerkId)) {
        throw badRequest(`lines ${seen.get(clerkId)} and ${row.line} are both ${fullName(userById.get(clerkId))}`);
      }
      seen.set(clerkId, row.line);
      accepted.push({ row, clerkId, saveAlias: Boolean(decision.saveAlias) });
    }
    resolvedRows.push({
      line: row.line,
      rawName: row.rawName,
      values: row.values,
      clerkId,
      matchedBy: clerkId ? decision.matchedBy || "manual" : "skipped",
    });
  }

  const existing = await Fact.find({ periodKey, source }).select("clerkId metrics").lean();
  const keep = new Set(accepted.map((a) => a.clerkId));
  const removed = existing.filter((f) => !keep.has(f.clerkId));

  const doc = await Import.create({
    periodKey,
    source,
    rawText: text,
    rawHash: crypto.createHash("sha256").update(text).digest("hex"),
    columns: parsed.columns,
    rows: resolvedRows,
    previous: existing.map((f) => ({ clerkId: f.clerkId, metrics: f.metrics })),
    status: "committing",
    createdBy,
  });

  try {
    const ops = accepted.map(({ row, clerkId }) => ({
      updateOne: {
        filter: { periodKey, clerkId, source },
        update: {
          $set: {
            metrics: metricsFor(source, row.values),
            importId: doc._id,
            origin: "paste",
            updatedBy: createdBy,
          },
        },
        upsert: true,
      },
    }));
    if (removed.length) {
      ops.push({
        deleteMany: { filter: { periodKey, source, clerkId: { $in: removed.map((f) => f.clerkId) } } },
      });
    }
    if (ops.length) await Fact.bulkWrite(ops, { ordered: true });

    let aliasesSaved = 0;
    for (const { row, clerkId, saveAlias } of accepted) {
      if (!saveAlias) continue;
      const normalized = normalizeName(row.rawName);
      const user = userById.get(clerkId);
      // The user's own name already matches exactly; an alias would only shadow it.
      if (!normalized || normalized === normalizeName(fullName(user))) continue;
      await Alias.updateOne(
        { normalized },
        { $set: { display: row.rawName, clerkId, createdBy } },
        { upsert: true },
      );
      aliasesSaved += 1;
    }

    const existingIds = new Set(existing.map((f) => f.clerkId));
    const summary = {
      parsed: parsed.rows.length,
      imported: accepted.length,
      created: accepted.filter((a) => !existingIds.has(a.clerkId)).length,
      updated: accepted.filter((a) => existingIds.has(a.clerkId)).length,
      removed: removed.length,
      skipped: parsed.rows.length - accepted.length,
      aliasesSaved,
    };
    await Import.updateOne({ _id: doc._id }, { $set: { status: "committed", summary } });
    return { importId: doc._id, summary };
  } catch (err) {
    await Import.updateOne({ _id: doc._id }, { $set: { status: "failed", error: err.message } });
    throw err;
  }
}

async function listImports(periodKey) {
  return Import.find({ periodKey })
    .select("source status summary createdBy createdAt error")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}

export default { previewImport, commitImport, listImports };
