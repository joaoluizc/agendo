import crypto from "crypto";
import { Methodology } from "../models/methodologyModel.js";
import { METHODOLOGY_SEEDS } from "../seeds/methodologyV1.js";
import { notFound } from "../lib/httpError.js";

/** New periods are scored with the newest version unless told otherwise. */
export const LATEST_METHODOLOGY_KEY = METHODOLOGY_SEEDS[METHODOLOGY_SEEDS.length - 1].key;

function hashConfig(config) {
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

// Memoised like reportsService.seedGroupsIfEmpty, so concurrent first requests in one
// process don't race; the unique index on `key` is the cross-process guard. A failed
// seed clears the memo so the next request retries.
let seedPromise = null;
function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function doSeed() {
  for (const seed of METHODOLOGY_SEEDS) {
    const configHash = hashConfig(seed.config);
    try {
      await Methodology.updateOne(
        { key: seed.key },
        {
          $setOnInsert: {
            key: seed.key,
            name: seed.name,
            summary: seed.summary,
            config: seed.config,
            configHash,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    const stored = await Methodology.findOne({ key: seed.key }).select("configHash").lean();
    if (stored && stored.configHash !== configHash) {
      // The stored version wins: it is what past quarters were scored with.
      console.warn(
        `[performance] seed ${seed.key} differs from the stored version, which stays in use — add a new version instead of editing a seed`,
      );
    }
  }
}

async function listMethodologies() {
  await ensureSeeded();
  return Methodology.find().select("key name summary createdAt").sort({ createdAt: 1 }).lean();
}

async function getMethodology(key) {
  await ensureSeeded();
  const methodology = await Methodology.findOne({ key }).lean();
  if (!methodology) throw notFound(`no methodology "${key}"`);
  return methodology;
}

export default { listMethodologies, getMethodology, ensureSeeded };
