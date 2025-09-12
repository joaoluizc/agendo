import { Position } from "@/types/positionTypes";

export async function createPosition(
  data: Omit<Position, "_id" | "sync">
): Promise<Position> {
  const {
    name,
    type,
    color,
    positionId,
    minTime,
    maxTime,
    stress,
    requiredSkills,
  } = data;

  const response = await fetch(`/api/position/new`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      type,
      color,
      ...(positionId && { positionId }),
      ...(minTime !== undefined && { minTime }),
      ...(maxTime !== undefined && { maxTime }),
      ...(stress !== undefined && { stress }),
      ...(requiredSkills !== undefined && { requiredSkills }),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create position");
  }

  const createdPosition = await response.json();

  return createdPosition as Position;
}

export async function updatePosition(position: Position): Promise<Position> {
  const response = await fetch(`/api/position/${position._id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(position),
  });

  if (!response.ok) {
    throw new Error("Failed to update position");
  }

  const updatedPosition = await response.json();

  return updatedPosition as Position;
}

export async function deletePosition(positionId: string): Promise<void> {
  const response = await fetch(`/api/position/${positionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete position");
  }
}
