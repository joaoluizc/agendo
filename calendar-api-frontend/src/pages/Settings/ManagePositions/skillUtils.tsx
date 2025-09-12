import { Skill } from "@/types/skillTypes";

export async function getAllSkills(): Promise<Skill[]> {
  const response = await fetch("/api/skills", {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch skills");
  }

  return response.json();
}

export async function createSkill(name: string): Promise<Skill> {
  const response = await fetch("/api/skills", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create skill");
  }

  return response.json();
}

export async function updateSkill(id: string, name: string): Promise<Skill> {
  const response = await fetch(`/api/skills/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update skill");
  }

  return response.json();
}

export async function deleteSkill(id: string): Promise<void> {
  const response = await fetch(`/api/skills/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete skill");
  }
}
