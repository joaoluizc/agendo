import { CoverageMeter } from "@/types/coverageTypes";
import { normalizeTargets } from "@/utils/coverageTargets";

/**
 * Coverage meters are admin-only on the API too (both routes are behind adminOnly),
 * so a non-admin gets a 403 here — callers must gate on `type === "admin"` rather
 * than relying on an empty list coming back.
 */

const asMeter = (raw: CoverageMeter): CoverageMeter => ({
  ...raw,
  positionIds: (raw.positionIds ?? []).map(String),
  targets: normalizeTargets(raw.targets),
});

export async function getCoverageMeters(): Promise<CoverageMeter[]> {
  const response = await fetch("/api/coverage-meter", {
    method: "GET",
    mode: "cors",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch coverage meters");
  const data = (await response.json()) as CoverageMeter[];
  return data.map(asMeter);
}

/**
 * Replace-all save: the settings card batches every edit behind one "Save changes"
 * button, so the whole list goes up at once and the server reconciles deletes.
 * Locally-created meters carry a temporary `_id`, which the server ignores.
 */
export async function saveCoverageMeters(
  meters: CoverageMeter[],
): Promise<CoverageMeter[]> {
  const response = await fetch("/api/coverage-meter", {
    method: "PUT",
    mode: "cors",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meters: meters.map((meter, index) => ({
        _id: meter._id,
        name: meter.name.trim(),
        color: meter.color,
        positionIds: meter.positionIds,
        targets: meter.targets,
        order: index,
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || "Failed to save coverage meters");
  }
  const data = (await response.json()) as CoverageMeter[];
  return data.map(asMeter);
}
