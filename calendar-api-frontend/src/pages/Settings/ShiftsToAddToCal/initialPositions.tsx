import { Position, PositionSync } from "@/types/positionTypes";

export async function  getPositionsToSync(): Promise<Position[]> {
  console.log('fetching positions to sync');
  try {
    const positionsResponse = await fetch("/api/position", {
      method: "GET",
      mode: 'cors',
      credentials: 'include',
      headers: {
        "Content-Type": "application/json",
      },
    });
    const toSyncResponse = await fetch("/api/position/sync", {
      method: "GET",
      mode: 'cors',
      credentials: 'include',
      headers: {
        "Content-Type": "application/json",
      },
    });
    const positionsData = await positionsResponse.json() as Position[];
    const toSyncData = await toSyncResponse.json() as PositionSync[];
    const positions = positionsData.map((position) => ({
      positionId: position.positionId,
      name: position.name,
      type: position.type,
      color: position.color,
      sync: toSyncData.find((toSync) => toSync.positionId === position.positionId)?.sync ?? false,
    }));
    return positions;
  } catch (error) {
    console.error("Failed to fetch positions:", error);
    return [];
  }
}
