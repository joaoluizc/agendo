import { registerTool } from "../lib/registerTool.js";

/**
 * `whoami` — the caller's own agendo identity.
 *
 * It exists first because it is the auth spike's proof: a successful call means the whole
 * chain worked (client → Clerk OAuth → agendo → Mongo user → role). It stays afterwards
 * because it is how a user answers "why can't I see X" without an engineer: role and
 * timezone explain almost every surprising answer the other tools give.
 */
export function registerIdentityTools(server, caller) {
  registerTool(server, caller, {
    name: "whoami",
    level: "user",
    title: "Who am I in agendo",
    description:
      "The agendo account this connection is authenticated as: name, email, role and timezone. " +
      "Use it when a schedule answer looks wrong or a tool is unavailable — role explains what " +
      "is permitted, timezone explains how times are rendered.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (_args, { mongoUser, isAdmin, clientId }) => {
      const lines = [
        `Name: ${[mongoUser.firstName, mongoUser.lastName].filter(Boolean).join(" ") || "(not set)"}`,
        `Email: ${mongoUser.email}`,
        `Role: ${isAdmin ? "admin — may read the schedule and (once write tools ship) change it" : "normal — read-only"}`,
        `Timezone: ${mongoUser.timezone || "UTC"}`,
        `Connected client: ${clientId}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });
}

export default { registerIdentityTools };
