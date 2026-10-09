import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerScheduleTools } from "./tools/schedule.js";
import { registerShiftWriteTools } from "./tools/shifts.js";
import { registerFindTools } from "./tools/find.js";

export const MCP_SERVER_INFO = { name: "agendo", version: "0.1.0" };

const INSTRUCTIONS = [
  "agendo schedules Duda's support team: who is working which position, when.",
  "Every tool acts as the signed-in agendo user — call `whoami` first if an answer is",
  "surprising, since their access (admin, and a level per area) and timezone decide what",
  "is visible and how times are rendered.",
].join(" ");

/**
 * Build a server for one caller.
 *
 * A fresh `McpServer` per request, not one shared instance. Two reasons, and the second
 * is the load-bearing one:
 *
 *  - The stateless streamable-HTTP transport is created per request, and an `McpServer`
 *    holds a single transport — sharing one instance across concurrent requests makes
 *    them clobber each other.
 *  - Registration can then depend on the caller, so a tool they lack the level for is
 *    genuinely absent from their `tools/list` rather than listed and then refused — and a
 *    permission change shows on the client's next `tools/list` with no reinstall.
 *
 * The cost is rebuilding a handful of tool definitions per request, which is nothing next
 * to the Mongo round trips the tools themselves make.
 */
export function createMcpServer(caller) {
  const server = new McpServer(MCP_SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  });

  registerIdentityTools(server, caller);
  registerScheduleTools(server, caller);
  registerShiftWriteTools(server, caller);
  registerFindTools(server, caller);

  // The SDK advertises `tools.listChanged: true` as soon as a tool is registered. A
  // stateless server can't push that notification — there is no session to push it on —
  // so say so, and clients re-list on their own schedule instead of waiting for us.
  // Must run after registration and before connect (the SDK refuses it afterwards).
  server.server.registerCapabilities({ tools: { listChanged: false } });

  return server;
}

export default { createMcpServer, MCP_SERVER_INFO };
