import { registerZendeskTool } from "../lib/registerZendeskTool.js";
import { zendesk } from "../lib/zendeskClient.js";
import { textResult } from "../lib/format.js";
import { registerZendeskTicketTools } from "./zendeskTickets.js";
import { registerZendeskTicketDetailTools } from "./zendeskTicketDetail.js";
import { registerZendeskPeopleTools } from "./zendeskPeople.js";

/**
 * The Zendesk half of this server: read-only, and every tool here is registered through
 * `registerZendeskTool` (see it for what that fixes). The connection status lives in this
 * file — it answers "whose eyes are these?", which every other answer depends on — and each
 * further area gets its own `zendesk<Area>.js`, registered at the bottom.
 *
 * All Zendesk tools read as ONE shared Zendesk user (the credential in `ZD_API_*`), not as
 * the person asking. That is the thing most worth being honest about: a person's own
 * Zendesk role and ticket restrictions do not apply here, and Zendesk's own audit trail
 * shows the shared user. agendo's tool-call log is the record of who asked.
 */

/** What a Zendesk user's `ticket_restriction` means, in words. `null` is "no restriction". */
const TICKET_ACCESS = {
  organization: "only tickets from their own organization",
  groups: "only tickets in their groups",
  assigned: "only tickets assigned to them",
  requested: "only tickets they requested",
};

function describeTicketAccess(restriction) {
  if (restriction === null || restriction === undefined) return "all tickets (no restriction)";
  return TICKET_ACCESS[restriction] ?? `restricted (${restriction})`;
}

export function registerZendeskTools(server, caller) {
  registerZendeskTool(server, caller, {
    name: "zendesk_connection_status",
    title: "Connection status",
    description:
      "Which Zendesk account and which Zendesk user this connection reads as, that user's role " +
      "and ticket access, and how much of Zendesk's rate limit is left. Every Zendesk tool here " +
      "reads as this ONE shared user — not as you — so what it can see is limited by that " +
      "user's role. Call it when a Zendesk answer looks incomplete or a Zendesk tool fails with " +
      "a permission error. It does not describe your agendo account: use `whoami` for that.",
    handler: async (_args, caller, extra) => {
      // `forCaller` charges this person's share of the request budget; `extra.signal` stops
      // the request if their client cancels it.
      const me = await zendesk
        .forCaller(caller.clerkId)
        .get("/api/v2/users/me.json", {}, { signal: extra?.signal });
      const user = me?.user ?? {};
      const rate = zendesk.lastRateLimit();

      const role = user.custom_role_id
        ? `${user.role ?? "unknown"} (custom role ${user.custom_role_id})`
        : (user.role ?? "unknown");

      const rateLine =
        rate && rate.remaining !== null
          ? `Rate limit: ${rate.remaining}${rate.limit !== null ? ` of ${rate.limit}` : ""} requests left ` +
            `this minute, as of ${new Date(rate.observedAt).toISOString()}. The limit belongs to ` +
            `Duda's whole Zendesk account and is shared with every integration using it.`
          : "Rate limit: Zendesk did not report it on this response.";

      return textResult([
        `Zendesk account: ${zendesk.host()}`,
        "These tools read Zendesk as ONE shared user — not as you:",
        `  Name: ${user.name ?? "(unknown)"}`,
        `  Role: ${role}`,
        `  Ticket access: ${describeTicketAccess(user.ticket_restriction)}`,
        `  Active: ${user.active === false || user.suspended ? "no — Zendesk reads will fail" : "yes"}`,
        rateLine,
        "Read-only: nothing in this connection can create, change or delete anything in Zendesk.",
        "If an answer looks incomplete, this user's role and ticket access above are the likely " +
          "reason, and an agendo admin can change who it is.",
      ]);
    },
  });

  registerZendeskTicketTools(server, caller);
  registerZendeskTicketDetailTools(server, caller);
  registerZendeskPeopleTools(server, caller);
}

export default { registerZendeskTools };
