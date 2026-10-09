import { registerTool } from "../lib/registerTool.js";
import { effectivePermissions } from "../../permissions/evaluate.js";
import { AREA_KEYS, PERMISSION_AREAS } from "../../permissions/registry.js";

/**
 * `whoami` — the caller's own agendo identity.
 *
 * It exists first because it is the auth spike's proof: a successful call means the whole
 * chain worked (client → Clerk OAuth → agendo → Mongo user → access). It stays afterwards
 * because it is how a user answers "why can't I see X" without an engineer: their access
 * and timezone explain almost every surprising answer the other tools give.
 */
export function registerIdentityTools(server, caller) {
  registerTool(server, caller, {
    name: "whoami",
    requires: "signedIn",
    title: "Who am I in agendo",
    description:
      "The agendo account this connection is authenticated as: name, email, access (admin, and " +
      "a level per area) and timezone. Use it when a schedule answer looks wrong or a tool is " +
      "unavailable — access explains what is permitted, timezone explains how times are rendered.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (_args, caller) => {
      const { mongoUser, isAdmin, clientId } = caller;
      const levels = effectivePermissions(caller);
      const lines = [
        `Name: ${[mongoUser.firstName, mongoUser.lastName].filter(Boolean).join(" ") || "(not set)"}`,
        `Email: ${mongoUser.email}`,
        `Admin: ${isAdmin ? "yes — everything in every area" : "no"}`,
        "Access:",
        ...AREA_KEYS.map((area) => `  ${PERMISSION_AREAS[area].label}: ${levels[area]}`),
        `Timezone: ${mongoUser.timezone || "UTC"}`,
        `Connected client: ${clientId}`,
        "If a tool you expect is missing, your access may have changed: restart or refresh " +
          "your MCP client so its tool list updates, or ask an agendo admin.",
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });
}

export default { registerIdentityTools };
