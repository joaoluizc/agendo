import { Position, PositionSync } from "@/types/positionTypes";
import { RowSelectionState } from "@tanstack/react-table";

export async function getPositionsToSync(): Promise<Position[]> {
  console.log("fetching positions to sync");
  try {
    const positionsResponse = await fetch("/api/position", {
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
    const toSyncData = (await toSyncResponse.json()) as PositionSync[];
    const positions = positionsData.map((position) => ({
      positionId: position.positionId,
      name: position.name,
      type: position.type,
      color: position.color,
      sync:
        toSyncData.find((toSync) => toSync.positionId === position.positionId)
          ?.sync ?? false,
    }));
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
  const selectedPositions = Object.keys(rowSelection).map((index) => {
    const currPosition = positions[parseInt(index)];
    return {
      positionId: currPosition.positionId,
      sync: rowSelection[index],
      name: currPosition.name,
    };
  });
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
  } catch (error) {
    console.error("Failed to save positions:", error);
  }
}
