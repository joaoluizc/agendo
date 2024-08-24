import { Position } from "./columns";

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
    const positionsData = await positionsResponse.json();
    const toSyncData = await toSyncResponse.json();
    const positions = positionsData.map((position: any) => ({
      positionId: position.positionId,
      name: position.name,
      type: position.type,
      color: position.color,
      sync: toSyncData.find((toSync: any) => toSync.positionId === position.positionId)?.sync ?? false,
    }));
    return positions;
  } catch (error) {
    console.error("Failed to fetch positions:", error);
    return [];
  }
};
