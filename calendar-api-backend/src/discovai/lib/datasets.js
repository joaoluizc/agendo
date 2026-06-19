// Dataset registry for supportAiAnswer.
//
// Each key is a knowledge-base partition (the `dataset` column in Supabase) and
// gets its own endpoint: POST /discovai/<key>/chat. To add a white-label portal:
//   1. import its articles tagged with the key (see DiscovAI-search's import-paligo.ts)
//   2. add an entry here.
export const DATASETS = Object.freeze({
  duda: { label: "Duda Support" },
  // Add white-label portals once their articles are imported, e.g.:
  // whitelabel: { label: "White-label Support" },
});

export const DEFAULT_DATASET = "duda";

/**
 * Resolve a dataset key (from the URL path or request body) to a known dataset.
 * Returns the normalized key, or null if it isn't registered.
 */
export function resolveDataset(key) {
  const normalized = (key || DEFAULT_DATASET).toString().trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DATASETS, normalized) ? normalized : null;
}
