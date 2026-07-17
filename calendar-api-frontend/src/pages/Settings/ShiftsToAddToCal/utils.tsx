import { Position, PositionSync } from "@/types/positionTypes.ts";
import { RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";

export async function getPositionsToSync(): Promise<Position[]> {
  console.log("fetching positions to sync");
  try {
    const positionsResponse = await fetch("/api/position/all", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const toSyncResponse = await fetch("/api/position/sync", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const positionsData = (await positionsResponse.json()) as Position[];
    console.log("all positions: ", positionsData);
    const toSyncData = (await toSyncResponse.json()) as PositionSync[];
    const positions = positionsData.map((position) => {
      const toSync = toSyncData.find(
        (toSync) => toSync.positionId === position.positionId
      );
      return {
        _id: position._id,
        positionId: position.positionId,
        name: position.name,
        type: position.type,
        color: position.color,
        enforceSync: position.enforceSync ?? false,
        sync: toSync?.sync ?? false,
        colorId: toSync?.colorId ?? null,
      };
    });
    return positions;
  } catch (error) {
    console.error("Failed to fetch positions:", error);
    return [];
  }
}

export async function savePositionsToSync(
  rowSelection: RowSelectionState,
  positions: Position[]
): Promise<void> {
  console.log("saving positions to sync");
  // Persist every position's flag (not only selected rows) so deselections are
  // saved as sync:false too. Enforced positions keep their genuine stored
  // preference — enforcement is applied at sync time on the backend, so we never
  // overwrite the user's real choice (clean revert when an admin un-enforces).
  const selectedPositions = positions.map((currPosition, index) => ({
    _id: currPosition._id,
    positionId: currPosition.positionId,
    sync: currPosition.enforceSync ? currPosition.sync : !!rowSelection[index],
    name: currPosition.name,
    // colorId must be sent for every row: the backend replaces the whole
    // positionsToSync array, so omitting it would wipe saved colors.
    colorId: currPosition.colorId ?? null,
  }));
  console.log("selectedPositions: ", selectedPositions);
  try {
    await fetch("/api/position/sync", {
      method: "PUT",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(selectedPositions),
    });
    toast.success("Positions saved successfully");
  } catch (error) {
    console.error("Failed to save positions:", error);
    toast.error("Failed to save positions");
  }
}

// User-level "one color for every shift" override (null = no override).
export async function getDefaultEventColorId(): Promise<string | null> {
  try {
    const response = await fetch("/api/position/default-color", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return data.defaultEventColorId ?? null;
  } catch (error) {
    console.error("Failed to fetch default event color:", error);
    return null;
  }
}

export async function saveDefaultEventColorId(
  colorId: string | null
): Promise<void> {
  try {
    await fetch("/api/position/default-color", {
      method: "PUT",
      mode: "cors",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultEventColorId: colorId }),
    });
  } catch (error) {
    console.error("Failed to save default event color:", error);
    toast.error("Failed to save default color");
  }
}
